import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as api from '@/lib/api';
import { renderApp } from '@/test/renderApp';

vi.mock('@/lib/api');

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  api.fetchSettingsServers.mockResolvedValue([{ env_key: 'stage' }]);
  api.fetchContainers.mockResolvedValue({ stacks: [], standalone: [] });
  api.fetchProjects.mockResolvedValue({ backend: { name: 'Backend' }, frontend: { name: 'Frontend' } });
  api.fetchBuildRuns.mockImplementation(async (project) => ({
    runs: project === 'backend'
      ? [{ id: 9, build_number: 89, status: 'running', branch: 'release/16.4', started_at: new Date().toISOString() }]
      : [{ id: 3, build_number: 12, status: 'success', branch: 'main', started_at: new Date().toISOString() }],
    hasMore: false,
  }));
  api.fetchHistory.mockResolvedValue([
    { id: 1, timestamp: new Date().toISOString(), env: 'stage', container_name: 'frontend', action: 'update-tag', old_tag: '1', new_tag: '2', success: 1 },
  ]);
});

describe('activity', () => {
  it('shows a running-build badge in the sidebar', async () => {
    renderApp('/');
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(await within(nav).findByRole('link', { name: /Builds\s*1/ })).toBeInTheDocument();
  });

  it('opens with "a", lists running builds and recent actions, and links to the drawer', async () => {
    const { router } = renderApp('/');
    const user = userEvent.setup();
    await screen.findByRole('heading', { name: 'Overview' });
    await user.keyboard('a');
    const panel = await screen.findByRole('complementary', { name: 'Activity' });
    expect(await within(panel).findByText(/backend #89/)).toBeInTheDocument();
    await user.click(await within(panel).findByRole('button', { name: /frontend.*1 → 2/ }));
    await waitFor(() => expect(router.state.location.search).toBe('?open=stage%2Ffrontend&tab=history'));
  });
});
