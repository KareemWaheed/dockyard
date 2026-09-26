import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as api from '@/lib/api';
import { renderApp } from '@/test/renderApp';

vi.mock('@/lib/api');

const svc = (tag, extra = {}) => ({ name: 'frontend', serviceName: 'frontend', image: `reg/frontend:${tag}`, status: 'running', managed: true, stackPath: '/m', stackName: 'Main', ...extra });
beforeEach(() => {
  vi.resetAllMocks();
  api.fetchSettingsServers.mockResolvedValue([{ env_key: 'dev' }, { env_key: 'stage' }]);
  api.fetchContainers.mockImplementation(async (env) => ({
    stacks: [{ name: 'Main', path: '/m', containers: [svc(env === 'dev' ? '2.0' : '1.0')] }], standalone: [],
  }));
  api.fetchDeploySuggestions.mockResolvedValue({
    otherEnvs: [],
    recentBuilds: [{ tag: '2.1', project: 'fe', buildNumber: 91, branch: 'main', finishedAt: '2026-09-25 10:00:00' }],
    previous: [{ tag: '0.9', at: '2026-09-20T00:00:00Z' }],
  });
  api.containerAction.mockResolvedValue({ ok: true });
});

const drawer = () => screen.findByRole('complementary', { name: /frontend on stage/ });

describe('DeployTab', () => {
  it('suggests other envs, builds and previous tags, then deploys the picked one', async () => {
    renderApp('/env/stage/frontend?tab=deploy');
    const d = await drawer();
    const user = userEvent.setup();
    expect(await within(d).findByText('Other environments')).toBeInTheDocument();
    expect(within(d).getByText('Recent builds')).toBeInTheDocument();
    expect(within(d).getByText('Previously on STAGE')).toBeInTheDocument();
    await user.click(within(d).getByRole('option', { name: /2\.0.*on DEV/ }));
    expect(within(d).getByTestId('deploy-preview')).toHaveTextContent('1.0 → 2.0');
    await user.click(within(d).getByRole('button', { name: 'Deploy to STAGE' }));
    await waitFor(() => expect(api.containerAction).toHaveBeenCalledWith('stage', 'frontend', 'update-tag', expect.objectContaining({ newTag: '2.0' })));
    expect(api.fetchDeploySuggestions).toHaveBeenCalledWith('stage', 'frontend', { image: 'reg/frontend:1.0', current: '1.0' });
  });

  it('accepts a typed tag with Enter and rejects invalid ones', async () => {
    renderApp('/env/stage/frontend?tab=deploy');
    const d = await drawer();
    const user = userEvent.setup();
    const input = await within(d).findByRole('combobox', { name: 'Tag to deploy' });
    await user.type(input, 'hotfix-7{Enter}');
    expect(within(d).getByTestId('deploy-preview')).toHaveTextContent('1.0 → hotfix-7');
    await user.clear(input);
    await user.type(input, 'bad tag');
    expect(within(d).getByText('Not a valid image tag')).toBeInTheDocument();
  });

  it('prefills the tag from the promote link', async () => {
    renderApp('/?open=stage/frontend&tab=deploy&tag=2.0');
    const d = await drawer();
    expect(within(d).getByTestId('deploy-preview')).toHaveTextContent('1.0 → 2.0');
  });

  it('disables Deploy after picking a tag then typing a different one (I-2)', async () => {
    renderApp('/env/stage/frontend?tab=deploy');
    const d = await drawer();
    const user = userEvent.setup();
    await user.click(within(d).getByRole('option', { name: /2\.0.*on DEV/ }));
    expect(within(d).getByTestId('deploy-preview')).toHaveTextContent('1.0 → 2.0');
    const input = within(d).getByRole('combobox', { name: 'Tag to deploy' });
    await user.clear(input);
    await user.type(input, '3.0');
    expect(within(d).getByRole('button', { name: 'Deploy to STAGE' })).toBeDisabled();
    await user.click(within(d).getByRole('button', { name: 'Deploy to STAGE' }));
    expect(api.containerAction).not.toHaveBeenCalledWith('stage', 'frontend', 'update-tag', expect.objectContaining({ newTag: '2.0' }));
  });

  it('rejects an invalid tag from the promote/prefill URL (I-4)', async () => {
    renderApp('/?open=stage/frontend&tab=deploy&tag=bad%20tag');
    const d = await drawer();
    expect(within(d).getByRole('button', { name: 'Deploy to STAGE' })).toBeDisabled();
    expect(within(d).getByText('Not a valid image tag')).toBeInTheDocument();
  });

  it('keeps risky actions behind the More menu', async () => {
    renderApp('/env/stage/frontend?tab=deploy');
    const d = await drawer();
    const user = userEvent.setup();
    expect(within(d).queryByRole('button', { name: 'Stop' })).toBeNull();
    await user.click(within(d).getByRole('button', { name: /More/ }));
    expect(await screen.findByRole('menuitem', { name: 'Stop' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Force recreate' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Unmanage…' })).toBeInTheDocument();
  });
});
