import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as api from '@/lib/api';
import { renderApp } from '@/test/renderApp';

vi.mock('@/lib/api');

const c = (name) => ({ name, serviceName: name, image: `reg/${name}:1`, status: 'running', managed: true, stackPath: '/m', stackName: 'Main' });
beforeEach(() => {
  vi.resetAllMocks();
  api.fetchSettingsServers.mockResolvedValue([
    { env_key: 'stage', maintenance_flag_path: '/tmp/m' },
    { env_key: 'prod', maintenance_flag_path: '/tmp/m' },
  ]);
  api.fetchContainers.mockResolvedValue({ stacks: [{ name: 'Main', path: '/m', containers: [c('web'), c('api'), c('worker')] }], standalone: [] });
  api.getMaintenance.mockResolvedValue({ enabled: false, configured: true });
  api.setMaintenance.mockResolvedValue({ ok: true, enabled: true });
  api.containerAction.mockResolvedValue({ ok: true });
  api.addService.mockResolvedValue({ ok: true });
});

describe('environment actions', () => {
  it('runs a bulk restart sequentially for the selected rows', async () => {
    renderApp('/env/stage');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('checkbox', { name: 'Select web' }));
    await user.click(screen.getByRole('checkbox', { name: 'Select worker' }));
    const bar = screen.getByRole('region', { name: 'Bulk actions' });
    expect(within(bar).getByText('2 selected')).toBeInTheDocument();
    await user.click(within(bar).getByRole('button', { name: 'Restart' }));
    await waitFor(() => expect(api.containerAction).toHaveBeenCalledTimes(2));
    expect(api.containerAction.mock.calls.map((call) => call[1])).toEqual(['web', 'worker']);
  });

  it('asks once, with the typed env name, for a bulk stop on prod', async () => {
    renderApp('/env/prod');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('checkbox', { name: 'Select web' }));
    await user.click(screen.getByRole('checkbox', { name: 'Select api' }));
    await user.click(within(screen.getByRole('region', { name: 'Bulk actions' })).getByRole('button', { name: 'Stop' }));
    await user.type(await screen.findByLabelText(/Type prod to confirm/), 'prod{Enter}');
    await waitFor(() => expect(api.containerAction).toHaveBeenCalledTimes(2));
  });

  it('toggles maintenance mode through a confirmation', async () => {
    renderApp('/env/stage');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('switch', { name: 'Maintenance' }));
    await user.click(await screen.findByRole('button', { name: 'Enable maintenance' }));
    await waitFor(() => expect(api.setMaintenance).toHaveBeenCalledWith('stage', true));
  });

  it('adds a service to a stack', async () => {
    renderApp('/env/stage');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Add service to Main' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Service name'), 'cache');
    await user.type(within(dialog).getByLabelText('Image'), 'redis:7');
    await user.click(within(dialog).getByRole('button', { name: 'Create service' }));
    await waitFor(() => expect(api.addService).toHaveBeenCalledWith('stage', 0, { name: 'cache', image: 'redis:7', ports: [], environment: {}, restart: 'always' }));
  });
});
