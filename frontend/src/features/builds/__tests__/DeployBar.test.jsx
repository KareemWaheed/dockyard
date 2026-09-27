import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as api from '@/lib/api';
import { renderWithProviders } from '@/test/renderWithProviders';
import { DeployBar } from '@/features/builds/DeployBar';

vi.mock('@/lib/api');

const targets = [
  { id: 1, project: 'api', env_key: 'stage', name: 'Stage', app_name: 'api-stage' },
  { id: 2, project: 'api', env_key: 'prod', name: 'Prod', app_name: 'api-prod' },
  { id: 3, project: 'web', env_key: 'stage', name: 'Web', app_name: 'web-stage' },
];
const run = (images) => ({ id: 5, type: 'build', build_number: 41, pushed_images_json: JSON.stringify(images) });

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
});

describe('DeployBar', () => {
  it('renders nothing for unsuccessful runs, runs without images, or projects without targets', () => {
    const cases = [
      { project: 'api', images: ['reg/a:1'], status: 'failed' },
      { project: 'api', images: [], status: 'success' },
      { project: 'ops', images: ['reg/a:1'], status: 'success' },
    ];
    for (const c of cases) {
      const { unmount } = renderWithProviders(<DeployBar project={c.project} run={run(c.images)} status={c.status} targets={targets} onDeployed={vi.fn()} />);
      expect(screen.queryByText('Deploy to CapRover')).toBeNull();
      unmount();
    }
    renderWithProviders(<DeployBar project="api" run={run(['reg/a:1'])} status="success" targets={targets} onDeployed={vi.fn()} />);
    expect(screen.getByText('Deploy to CapRover')).toBeInTheDocument();
  });

  it('deploys the single image to a non-prod target after a plain confirmation', async () => {
    api.deployRunToCapRover.mockResolvedValue({ runId: 9, buildNumber: 42 });
    const onDeployed = vi.fn();
    renderWithProviders(<DeployBar project="api" run={run(['reg/a:1'])} status="success" targets={targets} onDeployed={onDeployed} />);
    const user = userEvent.setup();
    expect(screen.getByRole('combobox', { name: 'CapRover target' }).querySelectorAll('option')).toHaveLength(3); // placeholder + 2 api targets
    expect(screen.queryByRole('combobox', { name: 'Image' })).toBeNull();
    await user.selectOptions(screen.getByRole('combobox', { name: 'CapRover target' }), '1');
    await user.click(screen.getByRole('button', { name: 'Deploy' }));
    await user.click(await screen.findByRole('button', { name: 'Deploy to Stage' }));
    await waitFor(() => expect(api.deployRunToCapRover).toHaveBeenCalledWith('api', 41, 1, 'reg/a:1'));
    expect(onDeployed).toHaveBeenCalledWith(42);
  });

  it('requires an image choice when several were pushed and a typed confirmation for prod', async () => {
    api.deployRunToCapRover.mockResolvedValue({ runId: 9, buildNumber: 43 });
    renderWithProviders(<DeployBar project="api" run={run(['reg/a:1', 'reg/b:1'])} status="success" targets={targets} onDeployed={vi.fn()} />);
    const user = userEvent.setup();
    await user.selectOptions(screen.getByRole('combobox', { name: 'CapRover target' }), '2');
    expect(screen.getByRole('button', { name: 'Deploy' })).toBeDisabled();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Image' }), 'reg/b:1');
    await user.click(screen.getByRole('button', { name: 'Deploy' }));
    const confirmBtn = await screen.findByRole('button', { name: 'Deploy to Prod' });
    expect(confirmBtn).toBeDisabled();
    await user.type(screen.getByLabelText(/Type/), 'api-prod');
    await user.click(confirmBtn);
    await waitFor(() => expect(api.deployRunToCapRover).toHaveBeenCalledWith('api', 41, 2, 'reg/b:1'));
  });

  it('shows the error inline', async () => {
    api.deployRunToCapRover.mockRejectedValue(new Error('CapRover said no'));
    renderWithProviders(<DeployBar project="api" run={run(['reg/a:1'])} status="success" targets={targets} onDeployed={vi.fn()} />);
    const user = userEvent.setup();
    await user.selectOptions(screen.getByRole('combobox', { name: 'CapRover target' }), '1');
    await user.click(screen.getByRole('button', { name: 'Deploy' }));
    await user.click(await screen.findByRole('button', { name: 'Deploy to Stage' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('CapRover said no');
  });
});
