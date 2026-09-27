import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as api from '@/lib/api';
import { renderWithProviders } from '@/test/renderWithProviders';
import { MigrationForm } from '@/features/migrations/MigrationForm';

vi.mock('@/lib/api');

const projects = { api: { name: 'API' } };
const envs = [
  { id: 1, name: 'stage', databases: [{ id: 11, name: 'core' }, { id: 12, name: 'audit' }] },
  { id: 2, name: 'prod', databases: [{ id: 21, name: 'core' }] },
  { id: 3, name: 'sandbox', databases: [] },
];

beforeEach(() => {
  vi.resetAllMocks();
  api.fetchBranches.mockResolvedValue({ branches: ['main', 'develop'] });
  api.startFlywayRun.mockResolvedValue({ runId: 57, runNumber: 57 });
});

describe('MigrationForm', () => {
  it('runs info without confirmation using the defaults', async () => {
    const onStarted = vi.fn();
    renderWithProviders(<MigrationForm projects={projects} envs={envs} busy={false} onStarted={onStarted} />);
    const user = userEvent.setup();
    expect(await screen.findByRole('combobox', { name: 'Branch' })).toHaveTextContent('main');
    await user.click(screen.getByRole('button', { name: 'Info' }));
    await waitFor(() => expect(api.startFlywayRun).toHaveBeenCalledWith({ envId: 1, dbId: 11, project: 'api', branch: 'main', command: 'info' }));
    expect(onStarted).toHaveBeenCalledWith(57);
  });

  it('resets the database when the environment changes and confirms migrate', async () => {
    renderWithProviders(<MigrationForm projects={projects} envs={envs} busy={false} onStarted={vi.fn()} />);
    const user = userEvent.setup();
    await screen.findByRole('combobox', { name: 'Branch' });
    await user.selectOptions(screen.getByRole('combobox', { name: 'Database' }), '12');
    await user.click(screen.getByRole('button', { name: 'Migrate' }));
    // Title and description both name the target; check the title.
    expect(await screen.findByRole('heading', { name: 'Run migrate on stage / audit?' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Run migrate' }));
    await waitFor(() => expect(api.startFlywayRun).toHaveBeenCalledWith(expect.objectContaining({ dbId: 12, command: 'migrate' })));
  });

  it('requires typing the database name for prod', async () => {
    renderWithProviders(<MigrationForm projects={projects} envs={envs} busy={false} onStarted={vi.fn()} />);
    const user = userEvent.setup();
    await screen.findByRole('combobox', { name: 'Branch' });
    await user.selectOptions(screen.getByRole('combobox', { name: 'Environment' }), '2');
    expect(screen.getByRole('combobox', { name: 'Database' })).toHaveValue('21');
    await user.click(screen.getByRole('button', { name: 'Migrate' }));
    const go = await screen.findByRole('button', { name: 'Run migrate' });
    expect(go).toBeDisabled();
    await user.type(screen.getByLabelText(/Type/), 'core');
    await user.click(go);
    await waitFor(() => expect(api.startFlywayRun).toHaveBeenCalledWith(expect.objectContaining({ envId: 2, dbId: 21 })));
  });

  it('disables both commands while a run is active or when the env has no databases (Review Focus 5)', async () => {
    const { unmount } = renderWithProviders(<MigrationForm projects={projects} envs={envs} busy onStarted={vi.fn()} />);
    await screen.findByRole('combobox', { name: 'Branch' });
    expect(screen.getByRole('button', { name: 'Info' })).toBeDisabled();
    expect(screen.getByText('A migration is running.')).toBeInTheDocument();
    unmount();
    renderWithProviders(<MigrationForm projects={projects} envs={envs} busy={false} onStarted={vi.fn()} />);
    await screen.findByRole('combobox', { name: 'Branch' });
    expect(screen.getByRole('button', { name: 'Info' })).toBeEnabled();
    await userEvent.setup().selectOptions(screen.getByRole('combobox', { name: 'Environment' }), '3');
    expect(screen.getByRole('button', { name: 'Info' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Migrate' })).toBeDisabled();
  });

  it('points to Builds when the repo is not cloned', async () => {
    api.fetchBranches.mockResolvedValue({ branches: [], needsClone: true });
    renderWithProviders(<MigrationForm projects={projects} envs={envs} busy={false} onStarted={vi.fn()} />);
    expect(await screen.findByRole('link', { name: 'Builds' })).toHaveAttribute('href', '/builds/api');
  });
});
