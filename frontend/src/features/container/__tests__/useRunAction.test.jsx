import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient } from '@tanstack/react-query';
import * as api from '@/lib/api';
import { AppProviders } from '@/app/AppProviders';
import { useRunAction } from '@/features/container/useRunAction';

vi.mock('@/lib/api');

const web = { name: 'web', serviceName: 'web', stackPath: '/m.yml', stackName: 'Main', image: 'reg/web:1.0' };

function Harness({ env, container, action, body }) {
  const run = useRunAction(env);
  return <button onClick={() => run(container, action, body)}>go</button>;
}
const setup = (props) => {
  render(
    <AppProviders queryClient={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>
      <Harness {...props} />
    </AppProviders>,
  );
  return userEvent.setup();
};

describe('useRunAction', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    api.containerAction.mockResolvedValue({ ok: true });
  });

  it('deploys on a non-prod env without a dialog and offers Undo to the previous tag', async () => {
    const user = setup({ env: 'stage', container: web, action: 'deploy', body: { newTag: '2.0' } });
    await user.click(screen.getByText('go'));
    await waitFor(() => expect(api.containerAction).toHaveBeenCalledWith('stage', 'web', 'update-tag', {
      stackPath: '/m.yml', serviceName: 'web', stackName: 'Main', newTag: '2.0',
    }));
    expect(await screen.findByText('web on STAGE → 2.0')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(api.containerAction).toHaveBeenLastCalledWith('stage', 'web', 'update-tag', expect.objectContaining({ newTag: '1.0' })));
    expect(await screen.findByText('web on STAGE → 1.0')).toBeInTheDocument();
  });

  it('requires typing the env name to stop on prod', async () => {
    const user = setup({ env: 'prod', container: web, action: 'stop' });
    await user.click(screen.getByText('go'));
    expect(api.containerAction).not.toHaveBeenCalled();
    await user.type(await screen.findByLabelText(/Type prod to confirm/), 'prod{Enter}');
    await waitFor(() => expect(api.containerAction).toHaveBeenCalledWith('prod', 'web', 'stop', expect.any(Object)));
  });

  it('offers no Undo when the previous tag is unknown (digest-pinned image)', async () => {
    const user = setup({ env: 'dev', container: { ...web, image: 'reg/web@sha256:abc' }, action: 'deploy', body: { newTag: '2.0' } });
    await user.click(screen.getByText('go'));
    expect(await screen.findByText('web on DEV → 2.0')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
  });

  it('shows a persistent error toast with details on failure', async () => {
    api.containerAction.mockRejectedValue(new Error('compose up failed: no such image'));
    const user = setup({ env: 'dev', container: web, action: 'restart' });
    await user.click(screen.getByText('go'));
    expect(await screen.findByText('Restart web on DEV failed')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Details' }));
    expect(await screen.findByText('compose up failed: no such image', { selector: 'pre' })).toBeInTheDocument();
  });
});
