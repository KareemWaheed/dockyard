import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as api from '@/lib/api';
import { renderApp } from '@/test/renderApp';

vi.mock('@/lib/api');

const base = { stackPath: '/m', stackName: 'Main', managed: true, status: 'running', startedAt: new Date(Date.now() - 3 * 86400e3).toISOString(), restartCount: 0 };
beforeEach(() => {
  vi.resetAllMocks();
  api.fetchSettingsServers.mockResolvedValue([{ env_key: 'stage', host: '10.0.0.5' }, { env_key: 'dev' }]);
  api.fetchContainers.mockImplementation(async (env) => {
    if (env === 'dev') throw new Error('connect ETIMEDOUT');
    return {
      stacks: [{
        name: 'Main', path: '/m', containers: [
          { ...base, name: 'web', serviceName: 'web', image: 'reg/web:1.0', health: 'healthy', note: 'demo for client X' },
          { ...base, name: 'worker', serviceName: 'worker', image: 'reg/worker:2', status: 'stopped', exitCode: 1, finishedAt: new Date(Date.now() - 2 * 3600e3).toISOString() },
          { ...base, name: 'postgres', serviceName: 'postgres', image: 'postgres:14', managed: false },
        ],
      }],
      standalone: [{ name: 'dozzle', image: 'amir20/dozzle:latest', status: 'running', managed: false, standalone: true, stackPath: null }],
    };
  });
  api.fetchHistory.mockResolvedValue([]);
});

describe('EnvPage', () => {
  it('lists managed containers with state details and no action buttons', async () => {
    renderApp('/env/stage');
    const web = (await screen.findByText('web')).closest('tr');
    expect(within(web).getByText('1.0')).toBeInTheDocument();
    expect(within(web).getByText('healthy · 3d')).toBeInTheDocument();
    expect(within(web).getByText('demo for client X')).toBeInTheDocument();
    expect(within(web).queryAllByRole('button')).toHaveLength(0);
    const worker = screen.getByText('worker').closest('tr');
    expect(within(worker).getByText('exited (1) · 2h')).toBeInTheDocument();
    expect(screen.getByText('10.0.0.5 · 2 running · 1 stopped', { exact: false })).toBeInTheDocument();
  });

  it('collapses unmanaged containers and lists standalone ones separately', async () => {
    renderApp('/env/stage');
    const user = userEvent.setup();
    const toggle = await screen.findByRole('button', { name: /1 unmanaged \(postgres\)/ });
    expect(screen.queryByText('postgres', { selector: 'td span' })).toBeNull();
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('postgres', { selector: 'td span' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Standalone containers' })).toBeInTheDocument();
    // standalone containers are unmanaged, so they sit behind their own collapse row
    await user.click(screen.getByRole('button', { name: /1 unmanaged \(dozzle\)/ }));
    expect(screen.getByText('dozzle', { selector: 'td span' })).toBeInTheDocument();
  });

  it('opens the drawer route when a row is clicked', async () => {
    const { router } = renderApp('/env/stage');
    const user = userEvent.setup();
    await user.click(await screen.findByText('web'));
    expect(router.state.location.pathname).toBe('/env/stage/web');
    expect(router.state.location.search).toBe('?tab=deploy');
  });

  it('shows the error and fix actions when the env is unreachable', async () => {
    renderApp('/env/dev');
    expect(await screen.findByText(/connect ETIMEDOUT/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Restart FortiVPN' })).toBeInTheDocument();
  });
});
