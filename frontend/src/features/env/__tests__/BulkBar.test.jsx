import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient } from '@tanstack/react-query';
import * as api from '@/lib/api';
import { AppProviders } from '@/app/AppProviders';
import { BulkBar } from '@/features/env/BulkBar';
import * as queries from '@/lib/queries';

vi.mock('@/lib/api');
vi.mock('@/lib/queries', async (importOriginal) => ({ ...(await importOriginal()), useAllEnvs: vi.fn() }));

const svc = (name, tag, extra = {}) => ({ name, serviceName: name, image: `reg/${name}:${tag}`, status: 'running', managed: true, stackPath: '/m', stackName: 'Main', ...extra });

const setup = (containers) => {
  render(
    <AppProviders queryClient={new QueryClient()}>
      <BulkBar env="stage" containers={containers} onClear={() => {}} />
    </AppProviders>,
  );
  return userEvent.setup();
};

describe('BulkBar', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    api.fetchSettingsServers.mockResolvedValue([{ env_key: 'dev' }, { env_key: 'stage' }, { env_key: 'prod' }]);
    api.containerAction.mockResolvedValue({ ok: true });
  });

  it('excludes envs with stale (errored) data from tag suggestions (M-7)', async () => {
    // Simulates keepPreviousData: `data` survives from a prior successful fetch,
    // but the env's most recent refetch failed (isError: true) — those stale
    // tags must not be offered as deploy targets, same as DeployTab.
    queries.useAllEnvs.mockReturnValue([
      { env: 'dev', data: { stacks: [{ name: 'Main', path: '/m', containers: [svc('web', '9.9')] }], standalone: [] }, isError: false },
      { env: 'prod', data: { stacks: [{ name: 'Main', path: '/m', containers: [svc('web', '5.5')] }], standalone: [] }, isError: true },
    ]);
    const user = setup([svc('web', '1.0')]);
    await user.click(screen.getByRole('button', { name: 'Set tag…' }));
    expect(await screen.findByText('9.9')).toBeInTheDocument();
    expect(screen.queryByText('5.5')).toBeNull();
  });

  it('shows a human success message instead of the raw action key (M-7)', async () => {
    queries.useAllEnvs.mockReturnValue([]);
    const user = setup([svc('web', '1.0'), svc('worker', '1.0')]);
    await user.click(screen.getByRole('button', { name: /Pull & recreate/ }));
    await waitFor(() => expect(api.containerAction).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(/recreated from a fresh pull/)).toBeInTheDocument();
    expect(screen.queryByText(/^pull-recreate done/)).toBeNull();
  });
});
