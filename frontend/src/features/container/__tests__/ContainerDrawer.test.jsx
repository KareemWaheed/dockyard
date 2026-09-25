import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as api from '@/lib/api';
import { renderApp } from '@/test/renderApp';

vi.mock('@/lib/api');

const base = { stackPath: '/m', stackName: 'Main', managed: true, status: 'running', startedAt: new Date(Date.now() - 86400e3).toISOString(), restartCount: 0 };
beforeEach(() => {
  vi.resetAllMocks();
  api.fetchSettingsServers.mockResolvedValue([{ env_key: 'stage' }]);
  api.fetchContainers.mockResolvedValue({
    stacks: [{ name: 'Main', path: '/m', containers: [
      { ...base, name: 'web', serviceName: 'web', image: 'reg/web:1.0', note: 'n1', hasVersionInfo: true },
      { ...base, name: 'api', serviceName: 'api', image: 'reg/api:7', note: '' },
    ] }],
    standalone: [],
  });
  api.fetchHistory.mockResolvedValue([
    { id: 1, timestamp: new Date().toISOString(), action: 'update-tag', old_tag: '0.9', new_tag: '1.0', success: 1, duration_ms: 4200 },
    { id: 2, timestamp: new Date().toISOString(), action: 'restart', success: 0, error_message: 'boom: exit 1', duration_ms: null },
  ]);
  api.fetchVersionInfo.mockResolvedValue({ raw: { 'git.branch': 'main', 'git.dirty': 'false' } });
  api.saveNote.mockResolvedValue({ ok: true });
});

const drawer = () => screen.findByRole('complementary', { name: /on stage/ });

describe('ContainerDrawer', () => {
  it('shows history with expandable failures', async () => {
    renderApp('/env/stage/web?tab=history');
    const d = await drawer();
    expect(within(d).getByRole('heading', { name: 'web' })).toBeInTheDocument();
    expect(await within(d).findByText('0.9 → 1.0')).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(within(d).getByRole('button', { name: /restart/ }));
    expect(within(d).getByText('boom: exit 1')).toBeInTheDocument();
    expect(api.fetchHistory).toHaveBeenCalledWith('stage', { container: 'web', limit: 50 });
  });

  it('stays open and switches container when another row is clicked', async () => {
    const { router } = renderApp('/env/stage/web?tab=history');
    await drawer();
    const user = userEvent.setup();
    await user.click(screen.getByText('api', { selector: 'td span' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/env/stage/api'));
    expect(within(await drawer()).getByRole('heading', { name: 'api' })).toBeInTheDocument();
  });

  it('closes on Escape', async () => {
    const { router } = renderApp('/env/stage/web?tab=history');
    await drawer();
    await userEvent.setup().keyboard('{Escape}');
    await waitFor(() => expect(router.state.location.pathname).toBe('/env/stage'));
  });

  it('saves the note on blur', async () => {
    renderApp('/env/stage/web?tab=history');
    const d = await drawer();
    const user = userEvent.setup();
    const note = within(d).getByRole('textbox', { name: 'Note' });
    await user.clear(note);
    await user.type(note, 'release 16.4');
    await user.tab();
    expect(api.saveNote).toHaveBeenCalledWith('stage', 'web', 'release 16.4');
  });

  it('renders build info key/values', async () => {
    renderApp('/env/stage/web?tab=info');
    const d = await drawer();
    expect(await within(d).findByText('git.branch')).toBeInTheDocument();
    expect(within(d).getByText('main')).toBeInTheDocument();
  });

  it('handles a URL naming a container that does not exist', async () => {
    renderApp('/?open=stage/ghost&tab=deploy');
    expect(await screen.findByText('Container not found in stage')).toBeInTheDocument();
  });
});
