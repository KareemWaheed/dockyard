import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as api from '@/lib/api';
import { renderApp } from '@/test/renderApp';
import { setViewport } from '@/test/viewport';

vi.mock('@/lib/api');

class FakeSocket {
  static instances = [];
  constructor(url) { this.url = url; FakeSocket.instances.push(this); }
  close() { this.closed = true; }
}

const runs = [
  { id: 57, run_number: 57, project: 'api', branch: 'main', command: 'migrate', status: 'running', env_name: 'stage', db_name: 'core', started_at: '2026-09-27 10:00:00' },
  { id: 56, run_number: 56, project: 'api', branch: 'main', command: 'info', status: 'success', env_name: 'dev', db_name: 'core', started_at: '2026-09-27 09:00:00' },
];

beforeEach(() => {
  vi.resetAllMocks();
  FakeSocket.instances = [];
  vi.stubGlobal('WebSocket', FakeSocket);
  setViewport({ desktop: true });
  api.fetchSettingsServers.mockResolvedValue([]);
  api.fetchHistory.mockResolvedValue([]);
  api.fetchBuildRuns.mockResolvedValue({ runs: [], hasMore: false });
  api.fetchProjects.mockResolvedValue({ api: { name: 'API', isFlyway: true }, web: { name: 'Web' } });
  api.fetchFlywayEnvs.mockResolvedValue([{ id: 1, name: 'stage', databases: [{ id: 11, name: 'core' }] }]);
  api.fetchFlywayRuns.mockResolvedValue(runs);
  api.fetchBranches.mockResolvedValue({ branches: ['main'] });
});
afterEach(() => vi.unstubAllGlobals());

describe('MigrationsPage', () => {
  it('lists history, auto-selects the latest run on desktop and disables commands while it runs', async () => {
    renderApp('/migrations');
    const list = await screen.findByRole('navigation', { name: 'Migration runs' });
    expect(within(list).getAllByRole('link')).toHaveLength(2);
    expect(await screen.findByRole('heading', { name: /#57/ })).toBeInTheDocument();
    expect(FakeSocket.instances[0].url).toMatch(/\/ws\/flyway\?runId=57$/);
    expect(await screen.findByRole('button', { name: 'Info' })).toBeDisabled();
  });

  it('on phones opens runs full-width with a back link and no auto-selection', async () => {
    setViewport({ desktop: false });
    const { router } = renderApp('/migrations');
    const list = await screen.findByRole('navigation', { name: 'Migration runs' });
    expect(FakeSocket.instances).toHaveLength(0);
    await userEvent.setup().click(within(list).getByRole('link', { name: /#56/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/migrations/56'));
    // The sidebar also has a "History" link — scope to the detail pane.
    const detail = await screen.findByRole('region', { name: 'Run detail' });
    expect(await within(detail).findByRole('link', { name: /History/ })).toHaveAttribute('href', '/migrations');
  });

  it('fetches a run older than the last 50 (Review Focus 2)', async () => {
    api.fetchFlywayRun.mockResolvedValue({ id: 7, run_number: 7, project: 'api', branch: 'old', command: 'info', status: 'success', env_name: 'dev', db_name: 'core', started_at: '2026-08-01 10:00:00' });
    renderApp('/migrations/7');
    // The history list also shows "dev / core" (run #56) — check the detail heading.
    expect(await screen.findByRole('heading', { name: '#7 · info · dev / core' })).toBeInTheDocument();
    expect(api.fetchFlywayRun).toHaveBeenCalledWith(7);
  });

  it('cancels the running migration after confirmation', async () => {
    api.cancelFlywayRun.mockResolvedValue({ cancelled: true });
    renderApp('/migrations/57');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Cancel run' }));
    await user.click(await screen.findByRole('button', { name: 'Stop migration' }));
    await waitFor(() => expect(api.cancelFlywayRun).toHaveBeenCalledWith(57));
  });

  it('explains setup when nothing is configured', async () => {
    api.fetchProjects.mockResolvedValue({ web: { name: 'Web' } });
    api.fetchFlywayEnvs.mockResolvedValue([]);
    api.fetchFlywayRuns.mockResolvedValue([]);
    renderApp('/migrations');
    expect(await screen.findByText('Set up migrations')).toBeInTheDocument();
    // Scope to <main>: the sidebar has its own Settings link.
    expect(within(screen.getByRole('main')).getAllByRole('link', { name: /Settings/ })).toHaveLength(2);
  });
});
