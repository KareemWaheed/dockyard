import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as api from '@/lib/api';
import { renderWithProviders } from '@/test/renderWithProviders';
import { RunDetail } from '@/features/builds/RunDetail';

vi.mock('@/lib/api');

class FakeSocket {
  static instances = [];
  constructor(url) { this.url = url; FakeSocket.instances.push(this); }
  close() { this.closed = true; }
  emit(msg) { this.onmessage?.({ data: JSON.stringify(msg) }); }
}

const params = [{ name: 'tag', type: 'string', flag: '--tag', label: 'Tag' }];
const build = { id: 7, type: 'build', build_number: 41, status: 'running', branch: 'main', args_json: '["--tag","1.2"]', started_at: '2026-09-27 10:00:00' };

beforeEach(() => {
  vi.resetAllMocks();
  FakeSocket.instances = [];
  vi.stubGlobal('WebSocket', FakeSocket);
});
afterEach(() => vi.unstubAllGlobals());

describe('RunDetail', () => {
  it('shows params, live commits, the stuck banner and the log', async () => {
    renderWithProviders(<RunDetail project="api" run={build} params={params} targets={[]} />);
    expect(screen.getByRole('heading', { name: /#41/ })).toBeInTheDocument();
    expect(screen.getByText('Running')).toBeInTheDocument();
    expect(screen.getByText('1.2')).toBeInTheDocument();
    const ws = FakeSocket.instances[0];
    act(() => {
      ws.onopen();
      ws.emit({ type: 'chunk', text: 'compiling\n' });
      ws.emit({ type: 'meta', commits_json: JSON.stringify([{ hash: 'abc', shortHash: 'abc1234', subject: 'fix login', date: '2h ago' }]) });
      ws.emit({ type: 'stuck_alert' });
    });
    expect(screen.getByText('compiling')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('No output detected');
    await userEvent.setup().click(screen.getByRole('tab', { name: /Commits/ }));
    expect(screen.getByText('fix login')).toBeInTheDocument();
  });

  it('cancels after confirmation', async () => {
    api.cancelBuildRun.mockResolvedValue({ cancelled: true });
    renderWithProviders(<RunDetail project="api" run={build} params={params} targets={[]} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Cancel run' }));
    await user.click(await screen.findByRole('button', { name: 'Stop build' }));
    await waitFor(() => expect(api.cancelBuildRun).toHaveBeenCalledWith('api', 41));
  });

  it('rebuilds a finished run with the same parameters and navigates to the new one', async () => {
    api.replayBuildRun.mockResolvedValue({ runId: 8, buildNumber: 42, queued: false });
    const { router } = renderWithProviders(<RunDetail project="api" run={{ ...build, status: 'failed' }} params={params} targets={[]} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Rebuild' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Same parameters' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/builds/api/42'));
  });

  it('rebuilds with the next tag, counting past the highest known tag', async () => {
    api.startBuild.mockResolvedValue({ runId: 9, buildNumber: 43, queued: false });
    const run = { ...build, status: 'success', args_json: '["--tag","dal-stg-1.0.0-2060"]' };
    const { router } = renderWithProviders(<RunDetail project="api" run={run} params={params} targets={[]} knownTags={['dal-stg-1.0.0-2064']} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Rebuild' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Next tag: dal-stg-1.0.0-2065' }));
    await waitFor(() => expect(api.startBuild).toHaveBeenCalledWith('api', 'main', ['--tag', 'dal-stg-1.0.0-2065']));
    await waitFor(() => expect(router.state.location.pathname).toBe('/builds/api/43'));
  });

  it('opens the new build sheet prefilled from this run to change parameters', async () => {
    const { router } = renderWithProviders(<RunDetail project="api" run={{ ...build, status: 'success' }} params={params} targets={[]} />, { path: '/builds/api/41' });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Rebuild' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Change parameters…' }));
    await waitFor(() => expect(router.state.location.search).toBe('?new=1&from=41'));
  });

  it('hides the next-tag option when the project has no tag parameter', async () => {
    renderWithProviders(<RunDetail project="api" run={{ ...build, status: 'success' }} params={[]} targets={[]} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Rebuild' }));
    await screen.findByRole('menuitem', { name: 'Same parameters' });
    expect(screen.queryByRole('menuitem', { name: /Next tag/ })).toBeNull();
  });

  it('shows deployment details for deploy runs and survives malformed JSON (Review Focus 1)', () => {
    renderWithProviders(<RunDetail project="api" run={{ id: 9, type: 'deploy', build_number: 43, status: 'success', branch: 'main', args_json: JSON.stringify({ env: 'stage', app: 'api-stage' }), commits_json: '{broken' }} params={params} targets={[]} />);
    expect(screen.getByRole('tab', { name: 'Deployment' })).toBeInTheDocument();
    expect(screen.getByText('api-stage')).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /Commits/ })).toBeNull();
    renderWithProviders(<RunDetail project="api" run={{ ...build, id: 10, args_json: 'not json' }} params={params} targets={[]} />);
    expect(screen.getAllByRole('heading', { name: /#41/ }).length).toBeGreaterThan(0);
  });

  it('links back to the run list for phones', () => {
    renderWithProviders(<RunDetail project="my app" run={build} params={params} targets={[]} />);
    expect(screen.getByRole('link', { name: /Runs/ })).toHaveAttribute('href', '/builds/my%20app');
  });

  it('lets the details tab row scroll sideways on phones without a vertical scrollbar', () => {
    renderWithProviders(<RunDetail project="api" run={build} params={params} targets={[]} />);
    const tabs = screen.getByRole('tablist');
    expect(tabs.className).toContain('overflow-x-auto');
    expect(tabs.className).toContain('overflow-y-hidden');
  });
});
