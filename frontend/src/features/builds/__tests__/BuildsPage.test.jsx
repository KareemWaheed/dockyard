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
  { id: 30, type: 'build', build_number: 3, status: 'running', branch: 'main', started_at: '2026-09-27 10:00:00' },
  { id: 20, type: 'deploy', build_number: 2, status: 'success', branch: 'main', args_json: JSON.stringify({ env: 'stage' }), started_at: '2026-09-27 09:00:00' },
  { id: 10, type: 'build', build_number: 1, status: 'failed', branch: 'fix/x', started_at: '2026-09-27 08:00:00' },
];

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  FakeSocket.instances = [];
  vi.stubGlobal('WebSocket', FakeSocket);
  setViewport({ desktop: true });
  api.fetchSettingsServers.mockResolvedValue([]);
  api.fetchHistory.mockResolvedValue([]);
  api.fetchProjects.mockResolvedValue({ api: { name: 'API', params: [] }, 'my app': { name: 'My App', params: [] } });
  api.fetchBuildRuns.mockImplementation(async (project, { offset = 0 } = {}) => (project === 'api' && offset === 0 ? { runs, hasMore: true } : { runs: [], hasMore: false }));
  api.fetchCapRoverTargets.mockResolvedValue([]);
  api.fetchBranches.mockResolvedValue({ branches: ['main'] });
});
afterEach(() => vi.unstubAllGlobals());

describe('BuildsPage', () => {
  it('redirects /builds to the first project when none was used before', async () => {
    const { router } = renderApp('/builds');
    await waitFor(() => expect(router.state.location.pathname).toBe('/builds/api'));
  });

  it('redirects /builds to the last used project', async () => {
    localStorage.setItem('dockyard:builds.lastProject', JSON.stringify('my app'));
    const { router } = renderApp('/builds');
    await waitFor(() => expect(router.state.location.pathname).toBe('/builds/my%20app'));
  });

  it('on desktop lists runs and auto-selects the latest', async () => {
    renderApp('/builds/api');
    const list = await screen.findByRole('navigation', { name: 'Runs' });
    expect(within(list).getAllByRole('link')).toHaveLength(3);
    expect(within(list).getByText(/stage/)).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: /#3/ })).toBeInTheDocument();
    expect(FakeSocket.instances[0].url).toMatch(/runId=30$/);
  });

  it('on phones shows only the list, then the run full-width with a back link', async () => {
    setViewport({ desktop: false });
    const { router } = renderApp('/builds/api');
    const list = await screen.findByRole('navigation', { name: 'Runs' });
    expect(FakeSocket.instances).toHaveLength(0);
    await userEvent.setup().click(within(list).getByRole('link', { name: /#1/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/builds/api/1'));
    expect(await screen.findByRole('link', { name: /Runs/ })).toHaveAttribute('href', '/builds/api');
  });

  it('fetches a deep-linked run that is not on the first page (Review Focus 2)', async () => {
    api.fetchBuildRun.mockResolvedValue({ id: 5, type: 'build', build_number: 5, status: 'success', branch: 'old', started_at: '2026-09-01 08:00:00' });
    renderApp('/builds/api/5');
    expect(await screen.findByRole('heading', { name: /#5/ })).toBeInTheDocument();
    expect(api.fetchBuildRun).toHaveBeenCalledWith('api', 5);
  });

  it('shows not found for a missing run', async () => {
    api.fetchBuildRun.mockRejectedValue(Object.assign(new Error('Run not found'), { status: 404 }));
    renderApp('/builds/api/999');
    expect(await screen.findByText('Run #999 not found')).toBeInTheDocument();
  });

  it('encodes project keys in links (Review Focus 4)', async () => {
    api.fetchBuildRuns.mockResolvedValue({ runs: [runs[2]], hasMore: false });
    renderApp('/builds/my%20app');
    const list = await screen.findByRole('navigation', { name: 'Runs' });
    expect(within(list).getByRole('link', { name: /#1/ })).toHaveAttribute('href', '/builds/my%20app/1');
  });

  it('filters runs and loads more', async () => {
    renderApp('/builds/api');
    const user = userEvent.setup();
    const list = await screen.findByRole('navigation', { name: 'Runs' });
    await user.selectOptions(screen.getByRole('combobox', { name: 'Filter runs' }), 'failed');
    expect(within(list).getAllByRole('link')).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Load more' }));
    await waitFor(() => expect(api.fetchBuildRuns).toHaveBeenCalledWith('api', { offset: 3 }));
  });

  it('opens the new build sheet with n and with ?new=1', async () => {
    const { router } = renderApp('/builds/api');
    await screen.findByRole('navigation', { name: 'Runs' });
    await userEvent.setup().keyboard('n');
    expect(await screen.findByRole('dialog', { name: /New build — API/ })).toBeInTheDocument();
    expect(router.state.location.search).toBe('?new=1');
    renderApp('/builds/api?new=1');
    expect((await screen.findAllByRole('dialog', { name: /New build — API/ })).length).toBeGreaterThan(0);
  });

  it('explains how to add projects when none exist', async () => {
    api.fetchProjects.mockResolvedValue({});
    renderApp('/builds');
    expect(await screen.findByText(/No build projects yet/)).toBeInTheDocument();
    // The sidebar also links to Settings — check the one in the empty state.
    expect(within(screen.getByRole('main')).getByRole('link', { name: /Settings/ })).toHaveAttribute('href', '/settings');
  });

  it('opens the sheet prefilled from a run with ?from and clears both params on close', async () => {
    const { router } = renderApp('/builds/api/1?new=1&from=1');
    expect(await screen.findByRole('dialog', { name: /New build — API \(from #1\)/ })).toBeInTheDocument();
    await userEvent.setup().keyboard('{Escape}');
    await waitFor(() => expect(router.state.location.search).toBe(''));
  });
});
