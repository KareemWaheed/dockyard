import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as api from '@/lib/api';
import { renderApp } from '@/test/renderApp';

vi.mock('@/lib/api');

const ctr = (name, tag, extra = {}) => ({
  name, serviceName: name, image: `reg/${name}:${tag}`, status: 'running', managed: true, stackPath: '/m', stackName: 'Main', ...extra,
});
const envData = (containers) => ({ stacks: [{ name: 'Main', path: '/m', containers }], standalone: [] });

beforeEach(() => {
  vi.resetAllMocks();
  api.fetchSettingsServers.mockResolvedValue([{ env_key: 'dev' }, { env_key: 'stage' }, { env_key: 'prod', aws_sg_id: 'sg-1' }]);
  api.fetchContainers.mockImplementation(async (env) => {
    if (env === 'dev') return envData([ctr('frontend', '2.0'), ctr('backend', '5')]);
    if (env === 'stage') return envData([ctr('frontend', '1.0'), ctr('backend', '5'), ctr('worker', '3', { status: 'stopped', exitCode: 1 })]);
    throw new Error('ssh: connect timeout');
  });
});

const cell = async (service, env) => {
  const row = (await screen.findByRole('rowheader', { name: new RegExp(`^${service}`) })).closest('tr');
  const envs = ['dev', 'stage', 'prod'];
  return within(row).getAllByRole('gridcell')[envs.indexOf(env)];
};

describe('Overview', () => {
  it('shows tags per env, marks drift, stopped state and unreachable envs', async () => {
    renderApp('/');
    expect(await cell('frontend', 'stage')).toHaveAttribute('data-drift', 'true');
    expect(await cell('backend', 'stage')).not.toHaveAttribute('data-drift');
    expect(within(await cell('worker', 'stage')).getByText('stopped')).toBeInTheDocument();
    expect(within(await cell('worker', 'dev')).getByText('not deployed')).toBeInTheDocument();
    expect(await screen.findByRole('columnheader', { name: /prod.*unreachable/i })).toBeInTheDocument();
  });

  it('opens the drawer URL on click and prefills the upstream tag on promote (p)', async () => {
    const { router } = renderApp('/');
    const user = userEvent.setup();
    await user.click(await cell('backend', 'dev'));
    expect(router.state.location.search).toBe('?open=dev%2Fbackend&tab=deploy');
    (await cell('frontend', 'stage')).focus();
    await user.keyboard('p');
    expect(router.state.location.search).toBe('?open=stage%2Ffrontend&tab=deploy&tag=2.0');
  });

  it('filters by name and by "only differences"', async () => {
    renderApp('/');
    const user = userEvent.setup();
    await screen.findByRole('rowheader', { name: /^frontend/ });
    await user.click(screen.getByRole('checkbox', { name: 'Only differences' }));
    await waitFor(() => expect(screen.queryByRole('rowheader', { name: /^backend/ })).toBeNull());
    expect(screen.getByRole('rowheader', { name: /^frontend/ })).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: 'Only differences' }));
    await user.type(screen.getByRole('searchbox', { name: 'Filter services' }), 'work');
    await waitFor(() => expect(screen.queryByRole('rowheader', { name: /^frontend/ })).toBeNull());
    expect(screen.getByRole('rowheader', { name: /^worker/ })).toBeInTheDocument();
  });

  it('does not let the grid steal Enter from the unreachable popover (I-3)', async () => {
    const { router } = renderApp('/');
    const user = userEvent.setup();
    const trigger = await screen.findByRole('button', { name: /prod.*unreachable/i });
    trigger.focus();
    await user.keyboard('{Enter}');
    expect(await screen.findByText("Can't reach prod")).toBeInTheDocument();
    expect(router.state.location.search).not.toMatch(/open=/);
  });

  it('shows the setup card when no servers are configured', async () => {
    api.fetchSettingsServers.mockResolvedValue([]);
    renderApp('/');
    expect(await screen.findByRole('link', { name: 'Add your first server' })).toHaveAttribute('href', '/settings');
  });
});
