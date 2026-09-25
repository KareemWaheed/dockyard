import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient } from '@tanstack/react-query';
import * as api from '@/lib/api';
import { AppProviders } from '@/app/AppProviders';
import { EnvTab } from '@/features/container/EnvTab';

vi.mock('@/lib/api');

const container = {
  name: 'web', serviceName: 'web', stackPath: '/m', stackName: 'Main', managed: true, image: 'reg/web:1',
  env: { API_URL: 'http://a', DB_PASSWORD: 'hunter2', TZ: 'UTC' },
};
const setup = (c = container) => {
  render(<AppProviders queryClient={new QueryClient()}><EnvTab env="stage" container={c} /></AppProviders>);
  return userEvent.setup();
};

describe('EnvTab', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    api.containerAction.mockResolvedValue({ ok: true });
  });

  it('masks secrets until revealed', async () => {
    const user = setup();
    expect(screen.queryByDisplayValue('hunter2')).toBeNull();
    expect(screen.queryByText('hunter2')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Reveal DB_PASSWORD' }));
    expect(screen.getByDisplayValue('hunter2')).toBeInTheDocument();
  });

  it('batches edits and additions into one update-env call', async () => {
    const user = setup();
    const api_url = screen.getByRole('textbox', { name: 'API_URL' });
    await user.clear(api_url);
    await user.type(api_url, 'http://b');
    await user.clear(screen.getByRole('textbox', { name: 'TZ' }));
    await user.type(screen.getByRole('textbox', { name: 'TZ' }), 'Africa/Cairo');
    await user.click(screen.getByRole('button', { name: '+ Add variable' }));
    await user.type(screen.getByRole('textbox', { name: 'New variable name' }), 'FEATURE_X');
    await user.type(screen.getByRole('textbox', { name: 'New variable value' }), 'on');
    await user.click(screen.getByRole('button', { name: 'Apply 3 changes' }));
    await waitFor(() => expect(api.containerAction).toHaveBeenCalledTimes(1));
    expect(api.containerAction).toHaveBeenCalledWith('stage', 'web', 'update-env', expect.objectContaining({
      changes: [
        { key: 'API_URL', value: 'http://b' },
        { key: 'TZ', value: 'Africa/Cairo' },
        { key: 'FEATURE_X', value: 'on' },
      ],
    }));
  });

  it('blocks invalid new keys', async () => {
    const user = setup();
    await user.click(screen.getByRole('button', { name: '+ Add variable' }));
    await user.type(screen.getByRole('textbox', { name: 'New variable name' }), 'BAD.KEY');
    expect(screen.getByText('Letters, digits and _ only; must not start with a digit')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Apply/ })).toBeDisabled();
  });

  it('is read-only for unmanaged containers', () => {
    setup({ ...container, managed: false });
    expect(screen.queryByRole('textbox', { name: 'API_URL' })).toBeNull();
    expect(screen.getByText('http://a')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '+ Add variable' })).toBeNull();
  });
});
