import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as api from '@/lib/api';
import { renderApp } from '@/test/renderApp';
import { setViewport } from '@/test/viewport';
import { formToBody, serverToForm } from '@/features/settings/ServersSection';
import { parseList, projectKey } from '@/features/settings/BuildProjectsSection';
import { describeTest } from '@/features/settings/CapRoverSection';
import { duplicateNames } from '@/features/settings/GitLabSection';
import { validateServer } from '@/features/settings/ServersSection';

vi.mock('@/lib/api');

const server = {
  id: 3, env_key: 'stage', name: 'Stage', host: '10.0.0.3', ssh_username: 'deploy', ssh_password: 'pw',
  docker_compose_cmd: 'docker compose', stacks: [{ id: 1, name: 'Main', path: '/srv/app/docker-compose.yml', versionInfo: { api: { path: '/app/git.properties', format: 'properties' } } }],
};

beforeEach(() => {
  vi.resetAllMocks();
  setViewport({ desktop: true });
  api.fetchSettingsServers.mockResolvedValue([server]);
  api.fetchContainers.mockResolvedValue({ stacks: [], standalone: [] });
  api.fetchHistory.mockResolvedValue([]);
  api.fetchBuildRuns.mockResolvedValue({ runs: [], hasMore: false });
  api.fetchProjects.mockResolvedValue({});
});

describe('Settings', () => {
  it('lists servers and saves an edit', async () => {
    api.updateSettingsServer.mockResolvedValue({ ok: true });
    renderApp('/settings/servers');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Edit stage' }));
    const sheet = await screen.findByRole('dialog', { name: 'Edit stage' });
    expect(within(sheet).getByLabelText('Environment key')).toBeDisabled();
    const host = within(sheet).getByLabelText('Host');
    await user.clear(host);
    await user.type(host, '10.0.0.4');
    await user.click(within(sheet).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(api.updateSettingsServer).toHaveBeenCalledWith(3, expect.objectContaining({ host: '10.0.0.4', ssh_password: 'pw', ssh_key_path: null })));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('removes a server only after confirmation', async () => {
    api.deleteSettingsServer.mockResolvedValue({ ok: true });
    renderApp('/settings/servers');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Remove stage' }));
    const confirmBtn = await screen.findByRole('button', { name: 'Remove server' });
    expect(api.deleteSettingsServer).not.toHaveBeenCalled();
    await user.click(confirmBtn);
    await waitFor(() => expect(api.deleteSettingsServer).toHaveBeenCalledWith(3));
  });

  it('saves app config only once it changed', async () => {
    api.fetchAppConfig.mockResolvedValue({ region: 'eu-central-1', description: '', accessKeyId: 'AK', secretAccessKey: 's' });
    api.updateAppConfig.mockResolvedValue({ ok: true });
    renderApp('/settings/aws');
    const user = userEvent.setup();
    const region = await screen.findByLabelText('Region');
    const save = screen.getByRole('button', { name: 'Save changes' });
    expect(save).toBeDisabled();
    await user.clear(region);
    await user.type(region, 'us-east-1');
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    await user.click(save);
    await waitFor(() => expect(api.updateAppConfig).toHaveBeenCalledWith('awsSg', expect.objectContaining({ region: 'us-east-1' })));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled());
  });

  it('adds a build project with a parameter', async () => {
    api.fetchAppConfig.mockResolvedValue({ api: { name: 'API', repo: 'git@x:api.git', params: [] } });
    api.fetchProjectRemote.mockResolvedValue({ isCloned: false });
    api.updateAppConfig.mockResolvedValue({ ok: true });
    renderApp('/settings/build-projects');
    const user = userEvent.setup();
    await user.type(await screen.findByRole('textbox', { name: 'New project name' }), 'Web App');
    await user.click(screen.getByRole('button', { name: 'Add project' }));
    expect(screen.getByRole('button', { name: 'Web App', pressed: true })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add parameter' }));
    await user.type(screen.getByLabelText('Key'), 'tag');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() =>
      expect(api.updateAppConfig).toHaveBeenCalledWith('projects', expect.objectContaining({
        api: expect.anything(),
        web_app: expect.objectContaining({ name: 'Web App', params: [expect.objectContaining({ name: 'tag', type: 'string' })] }),
      })),
    );
  });

  it('runs VPN actions and shows their output', async () => {
    api.getVpnStatus.mockResolvedValue({ status: 'inactive' });
    api.vpnAction.mockImplementation(async (action, onChunk, onDone) => { onChunk('starting fortivpn\n'); onDone(0); });
    renderApp('/settings/vpn');
    const user = userEvent.setup();
    expect(await screen.findByText('inactive')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Start/ }));
    expect(await screen.findByLabelText('VPN output')).toHaveTextContent('starting fortivpn ✓ Done');
  });

  it('confirms before importing a settings file', async () => {
    api.importSettings.mockResolvedValue({ ok: true });
    renderApp('/settings/backup');
    const user = userEvent.setup();
    const file = new File([JSON.stringify({ servers: [] })], 'backup.json', { type: 'application/json' });
    await user.upload(await screen.findByTestId('import-file'), file);
    const confirmBtn = await screen.findByRole('button', { name: 'Replace settings' });
    expect(api.importSettings).not.toHaveBeenCalled();
    await user.click(confirmBtn);
    await waitFor(() => expect(api.importSettings).toHaveBeenCalledWith({ servers: [] }));
  });
});

describe('settings helpers', () => {
  it('round-trips a server through the form', () => {
    const body = formToBody(serverToForm(server));
    expect(body).toMatchObject({ env_key: 'stage', ssh_password: 'pw', ssh_key_content: null, ssh_passphrase: null });
    expect(body.stacks).toEqual([{ name: 'Main', path: '/srv/app/docker-compose.yml', versionInfo: { api: { path: '/app/git.properties', format: 'properties' } } }]);
  });

  it('makes unique project keys and parses comma lists', () => {
    expect(projectKey('Web App', {})).toBe('web_app');
    expect(projectKey('Web App', { web_app: {} })).toBe('web_app_1');
    expect(parseList(' a, b ,,c,')).toEqual(['a', 'b', 'c']);
  });

  it('describes a CapRover test result', () => {
    expect(describeTest({ appName: 'web', instanceCount: 2 })).toBe("Connected — app 'web' found (2 instances)");
    expect(describeTest({ warning: 'token not verified' })).toBe('token not verified');
  });
});

describe('Settings — PROD server removal', () => {
  it('requires typing the env key (spec §6.1)', async () => {
    api.fetchSettingsServers.mockResolvedValue([{ ...server, id: 9, env_key: 'prod' }]);
    api.deleteSettingsServer.mockResolvedValue({ ok: true });
    renderApp('/settings/servers');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Remove prod' }));
    const confirmBtn = await screen.findByRole('button', { name: 'Remove server' });
    expect(confirmBtn).toBeDisabled();
    await user.type(screen.getByLabelText(/to confirm/), 'prod');
    await user.click(confirmBtn);
    await waitFor(() => expect(api.deleteSettingsServer).toHaveBeenCalledWith(9));
  });
});

describe('review fixes', () => {
  it('flags duplicate GitLab project names', () => {
    expect(duplicateNames([{ name: 'api' }, { name: ' api ' }, { name: 'web' }, { name: '' }, { name: '' }])).toEqual(['api']);
  });

  it('requires the credential for the chosen SSH auth method', () => {
    const base = { env_key: 'dev', host: 'h', ssh_username: 'u', ssh_password: '', ssh_key_path: '', ssh_key_content: '' };
    expect(validateServer({ ...base, auth_method: 'password' })).toMatch(/password/);
    expect(validateServer({ ...base, auth_method: 'path', ssh_key_path: '/k' })).toBe('');
    expect(validateServer({ ...base, auth_method: 'paste', ssh_key_content: '  ' })).toMatch(/private key/);
  });

  it('makes project keys from own properties only', () => {
    expect(projectKey('Constructor', {})).toBe('constructor');
  });

  it('treats a never-saved config key as empty instead of failing', async () => {
    api.fetchAppConfig.mockResolvedValue(null);
    renderApp('/settings/gitlab');
    expect(await screen.findByLabelText('Base URL')).toHaveValue('');
  });

  it('asks before leaving a section with unsaved changes', async () => {
    api.fetchAppConfig.mockResolvedValue({ region: 'eu-central-1' });
    const { router } = renderApp('/settings/aws');
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Region'), 'x');
    await user.click(screen.getByRole('link', { name: /GitLab/ }));
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(router.state.location.pathname).toBe('/settings/aws');
    await user.click(screen.getByRole('link', { name: /GitLab/ }));
    await user.click(await screen.findByRole('button', { name: 'Discard changes' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/settings/gitlab'));
  });

  it('keeps edits typed while a save is in flight', async () => {
    api.fetchAppConfig.mockResolvedValue({ region: 'a' });
    let finish;
    api.updateAppConfig.mockImplementation(() => new Promise((r) => { finish = r; }));
    renderApp('/settings/aws');
    const user = userEvent.setup();
    const region = await screen.findByLabelText('Region');
    await user.type(region, 'b');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await user.type(region, 'c');
    finish({ ok: true });
    await waitFor(() => expect(screen.getByText('Unsaved changes')).toBeInTheDocument());
    expect(region).toHaveValue('abc');
  });
});
