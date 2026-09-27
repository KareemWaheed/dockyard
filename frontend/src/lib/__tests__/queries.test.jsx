import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as api from '@/lib/api';
import { useEnvKeys, useAllEnvs, useContainerAction, usePendingAction, qk } from '@/lib/queries';

vi.mock('@/lib/api');

function wrapperWith(client) {
  return ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
const newClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

describe('queries', () => {
  beforeEach(() => vi.resetAllMocks());

  it('useEnvKeys keeps settings order', async () => {
    api.fetchSettingsServers.mockResolvedValue([{ env_key: 'dev' }, { env_key: 'prod' }]);
    const { result } = renderHook(() => useEnvKeys(), { wrapper: wrapperWith(newClient()) });
    await waitFor(() => expect(result.current).toEqual(['dev', 'prod']));
  });

  it('useAllEnvs keeps last data when a refetch fails (stale)', async () => {
    api.fetchSettingsServers.mockResolvedValue([{ env_key: 'dev' }]);
    api.fetchContainers.mockResolvedValueOnce({ stacks: [], standalone: [] }).mockRejectedValueOnce(new Error('ssh down'));
    const client = newClient();
    const { result } = renderHook(() => useAllEnvs(), { wrapper: wrapperWith(client) });
    await waitFor(() => expect(result.current[0]?.data).toBeTruthy());
    await act(() => client.refetchQueries({ queryKey: qk.containers('dev') }));
    await waitFor(() => expect(result.current[0].isError).toBe(true));
    expect(result.current[0].data).toEqual({ stacks: [], standalone: [] });
  });

  it('useContainerAction sends the container context and exposes pending state', async () => {
    let release;
    api.containerAction.mockImplementation(() => new Promise((r) => { release = r; }));
    const client = newClient();
    const wrapper = wrapperWith(client);
    const container = { name: 'web', serviceName: 'web', stackPath: '/m.yml', stackName: 'Main' };
    const { result } = renderHook(
      () => ({ m: useContainerAction('dev'), pending: usePendingAction('dev', 'web') }),
      { wrapper },
    );
    act(() => { result.current.m.mutate({ container, action: 'restart', endpoint: 'restart', body: {} }); });
    await waitFor(() => expect(result.current.pending).toEqual({ action: 'restart', body: {} }));
    expect(api.containerAction).toHaveBeenCalledWith('dev', 'web', 'restart', {
      stackPath: '/m.yml', serviceName: 'web', stackName: 'Main',
    });
    await act(async () => release({ ok: true }));
    await waitFor(() => expect(result.current.pending).toBeNull());
  });

  it('useContainerAction also invalidates history on settle (M-5)', async () => {
    api.containerAction.mockResolvedValue({ ok: true });
    const client = newClient();
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    const container = { name: 'web', serviceName: 'web', stackPath: '/m.yml', stackName: 'Main' };
    const { result } = renderHook(() => useContainerAction('dev'), { wrapper: wrapperWith(client) });
    await act(async () => { await result.current.mutateAsync({ container, action: 'restart', endpoint: 'restart', body: {} }); });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: qk.containers('dev') });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['history'] });
  });
});
