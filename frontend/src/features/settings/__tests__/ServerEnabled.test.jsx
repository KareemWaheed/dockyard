import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as api from '@/lib/api';
import { useAllEnvs, useEnvKeys } from '@/lib/queries';
import { renderApp } from '@/test/renderApp';
import { setViewport } from '@/test/viewport';

vi.mock('@/lib/api');

const stage = { id: 1, env_key: 'stage', name: 'Stage', host: '10.0.0.3', ssh_username: 'u', enabled: 1, stacks: [] };
const dev = { id: 2, env_key: 'dev', name: 'Dev', host: '10.0.0.2', ssh_username: 'u', enabled: 0, stacks: [] };

const wrapper = ({ children }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>
);

beforeEach(() => {
  vi.resetAllMocks();
  setViewport({ desktop: true });
  api.fetchSettingsServers.mockResolvedValue([stage, dev]);
  api.fetchContainers.mockResolvedValue({ stacks: [], standalone: [] });
  api.fetchHistory.mockResolvedValue([]);
  api.setServerEnabled.mockResolvedValue({ ok: true });
});

describe('disabled servers', () => {
  it('are left out of env keys unless asked for', async () => {
    const { result } = renderHook(() => ({ on: useEnvKeys(), all: useEnvKeys({ includeDisabled: true }) }), { wrapper });
    await waitFor(() => expect(result.current.all).toEqual(['stage', 'dev']));
    expect(result.current.on).toEqual(['stage']);
  });

  it('are never polled', async () => {
    const { result } = renderHook(() => useAllEnvs(), { wrapper });
    await waitFor(() => expect(result.current.map((e) => e.env)).toEqual(['stage']));
    await waitFor(() => expect(api.fetchContainers).toHaveBeenCalledWith('stage'));
    expect(api.fetchContainers).not.toHaveBeenCalledWith('dev');
  });

  it('treat servers from an older backend (no flag) as enabled', async () => {
    api.fetchSettingsServers.mockResolvedValue([{ env_key: 'stage' }]);
    const { result } = renderHook(() => useEnvKeys(), { wrapper });
    await waitFor(() => expect(result.current).toEqual(['stage']));
  });

  it('show a notice with an Enable button instead of connecting', async () => {
    renderApp('/env/dev');
    const user = userEvent.setup();
    expect(await screen.findByText(/dev is disabled/i)).toBeInTheDocument();
    expect(api.fetchContainers).not.toHaveBeenCalledWith('dev');
    await user.click(screen.getByRole('button', { name: 'Enable dev' }));
    await waitFor(() => expect(api.setServerEnabled).toHaveBeenCalledWith(2, true));
  });

  it('leave the overview pointing to Settings when every server is off', async () => {
    api.fetchSettingsServers.mockResolvedValue([{ ...stage, enabled: 0 }, dev]);
    renderApp('/');
    expect(await screen.findByText('All servers are disabled')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Manage servers' })).toHaveAttribute('href', '/settings/servers');
    expect(api.fetchContainers).not.toHaveBeenCalled();
  });

  it('can be switched on and off from Settings', async () => {
    renderApp('/settings/servers');
    const user = userEvent.setup();
    const devSwitch = await screen.findByRole('switch', { name: 'Enable dev' });
    const stageSwitch = screen.getByRole('switch', { name: 'Enable stage' });
    expect(devSwitch).not.toBeChecked();
    expect(stageSwitch).toBeChecked();
    expect(screen.getByText('Disabled')).toBeInTheDocument();
    await user.click(stageSwitch);
    await waitFor(() => expect(api.setServerEnabled).toHaveBeenCalledWith(1, false));
    await user.click(devSwitch);
    await waitFor(() => expect(api.setServerEnabled).toHaveBeenCalledWith(2, true));
  });
});
