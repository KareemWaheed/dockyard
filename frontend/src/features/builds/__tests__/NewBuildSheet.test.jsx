import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as api from '@/lib/api';
import { renderWithProviders } from '@/test/renderWithProviders';
import { NewBuildSheet } from '@/features/builds/NewBuildSheet';
import { saveRecent } from '@/features/builds/recentStore';

vi.mock('@/lib/api');

const def = {
  name: 'API',
  params: [
    { name: 'tag', type: 'string', flag: '--tag', label: 'Tag', required: true },
    { name: 'env', type: 'select', flag: '--env', label: 'Env', options: ['dev', 'prod'], default: 'dev' },
    { name: 'mods', type: 'multiselect', flag: '--module', label: 'Modules', options: ['core', 'auth'] },
    { name: 'skip', type: 'checkbox', flag: '--skip-tests', label: 'Skip tests' },
  ],
};

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  api.fetchBranches.mockResolvedValue({ branches: ['main', 'release/2'] });
});

describe('NewBuildSheet', () => {
  it('renders a control per param type and enables Build once required fields are filled', async () => {
    api.startBuild.mockResolvedValue({ runId: 3, buildNumber: 12, queued: false });
    const onStarted = vi.fn();
    const onOpenChange = vi.fn();
    renderWithProviders(<NewBuildSheet project="api" def={def} open onOpenChange={onOpenChange} onStarted={onStarted} />);
    const user = userEvent.setup();
    expect(await screen.findByRole('combobox', { name: 'Branch' })).toHaveTextContent('main');
    expect(screen.getByRole('radio', { name: 'DEV' })).toHaveAttribute('aria-checked', 'true');
    const build = screen.getByRole('button', { name: 'Build & push' });
    expect(build).toBeDisabled();
    await user.type(screen.getByRole('textbox', { name: /Tag/ }), '1.4.0');
    await user.click(screen.getByRole('radio', { name: 'PROD' }));
    await user.click(screen.getByRole('checkbox', { name: 'auth' }));
    await user.click(screen.getByRole('switch', { name: /Skip tests/ }));
    await user.click(build);
    await waitFor(() => expect(api.startBuild).toHaveBeenCalledWith('api', 'main', ['--tag', '1.4.0', '--env', 'prod', '--module', 'auth', '--skip-tests']));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onStarted).toHaveBeenCalledWith(12);
  });

  it('prefills from the last build of this project', async () => {
    saveRecent('api', { branch: 'release/2', values: { tag: '9.9', env: 'prod' } });
    renderWithProviders(<NewBuildSheet project="api" def={def} open onOpenChange={vi.fn()} onStarted={vi.fn()} />);
    expect(await screen.findByRole('combobox', { name: 'Branch' })).toHaveTextContent('release/2');
    expect(screen.getByRole('textbox', { name: /Tag/ })).toHaveValue('9.9');
    expect(screen.getByRole('radio', { name: 'PROD' })).toHaveAttribute('aria-checked', 'true');
  });

  it('offers a clone step when the repo is missing', async () => {
    api.fetchBranches.mockResolvedValue({ branches: [], needsClone: true });
    api.cloneRepo.mockResolvedValue({ runId: 1, buildNumber: 1 });
    const onStarted = vi.fn();
    renderWithProviders(<NewBuildSheet project="api" def={def} open onOpenChange={vi.fn()} onStarted={onStarted} />);
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Clone repository' }));
    await waitFor(() => expect(onStarted).toHaveBeenCalledWith(1));
    expect(screen.queryByRole('button', { name: 'Build & push' })).toBeNull();
  });

  it('shows a retry when branches fail to load', async () => {
    api.fetchBranches.mockRejectedValueOnce(new Error('git fetch failed'));
    renderWithProviders(<NewBuildSheet project="api" def={def} open onOpenChange={vi.fn()} onStarted={vi.fn()} />);
    expect(await screen.findByText(/git fetch failed/)).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('combobox', { name: 'Branch' })).toBeInTheDocument();
  });
});
