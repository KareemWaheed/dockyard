import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as api from '@/lib/api';
import { renderApp } from '@/test/renderApp';
import { setFocusedCell } from '@/features/overview/focusStore';

vi.mock('@/lib/api');

beforeEach(() => {
  vi.resetAllMocks();
  setFocusedCell(null);
  document.documentElement.classList.remove('dark');
  localStorage.clear();
  api.fetchSettingsServers.mockResolvedValue([{ env_key: 'stage' }, { env_key: 'prod' }]);
  api.fetchProjects.mockResolvedValue({ api: { name: 'API' } });
  api.fetchBuildRuns.mockResolvedValue({ runs: [], hasMore: false });
  api.fetchContainers.mockImplementation(async (env) => ({
    stacks: [{ name: 'Main', path: '/m', containers: [{ name: 'frontend', serviceName: 'frontend', image: `reg/fe:${env === 'prod' ? '1' : '2'}`, status: 'running', managed: true, stackPath: '/m' }] }],
    standalone: [],
  }));
});

describe('CommandPalette', () => {
  it('jumps to a container drawer', async () => {
    const { router } = renderApp('/');
    const user = userEvent.setup();
    await screen.findByRole('heading', { name: 'Overview' });
    await user.keyboard('{Control>}k{/Control}');
    await user.type(await screen.findByPlaceholderText('Search containers, environments, pages, actions…'), 'frontend prod');
    await user.click(await screen.findByRole('option', { name: /frontend · PROD · 1/ }));
    await waitFor(() => expect(router.state.location.search).toBe('?open=prod%2Ffrontend&tab=deploy'));
  });

  it('navigates to environments and runs actions', async () => {
    const { router } = renderApp('/');
    const user = userEvent.setup();
    await screen.findByRole('heading', { name: 'Overview' });
    await user.keyboard('{Control>}k{/Control}');
    await user.click(await screen.findByRole('option', { name: 'stage' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/env/stage'));
    await user.keyboard('{Control>}k{/Control}');
    await user.click(await screen.findByRole('option', { name: 'Toggle theme' }));
    expect(document.documentElement).toHaveClass('dark');
  });

  it('offers "Deploy {service} to {env}…" for the focused Overview cell', async () => {
    const { router } = renderApp('/');
    const user = userEvent.setup();
    await screen.findByRole('heading', { name: 'Overview' });
    setFocusedCell({ env: 'stage', containerName: 'frontend', service: 'frontend' });
    await user.keyboard('{Control>}k{/Control}');
    await user.click(await screen.findByRole('option', { name: 'Deploy frontend to STAGE…' }));
    await waitFor(() => expect(router.state.location.search).toBe('?open=stage%2Ffrontend&tab=deploy'));
  });

  it('opens a project on Builds and starts a new build', async () => {
    const { router } = renderApp('/');
    const user = userEvent.setup();
    await screen.findByRole('heading', { name: 'Overview' });
    await user.keyboard('{Control>}k{/Control}');
    await user.click(await screen.findByRole('option', { name: 'New build: API' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/builds/api'));
    expect(router.state.location.search).toBe('?new=1');
    await user.keyboard('{Escape}');
    await user.keyboard('{Control>}k{/Control}');
    await user.click(await screen.findByRole('option', { name: 'Builds: API' }));
    await waitFor(() => expect(router.state.location.search).toBe(''));
  });
});
