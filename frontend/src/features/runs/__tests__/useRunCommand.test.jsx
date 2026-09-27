import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { renderWithProviders } from '@/test/renderWithProviders';
import { useRunCommand } from '@/features/runs/useRunCommand';

function Harness({ opts, onResult }) {
  const runCommand = useRunCommand();
  const [, force] = useState(0);
  return <button type="button" onClick={async () => { onResult(await runCommand(opts)); force((n) => n + 1); }}>go</button>;
}

describe('useRunCommand', () => {
  it('asks first and does nothing when cancelled', async () => {
    const fn = vi.fn();
    const onResult = vi.fn();
    renderWithProviders(<Harness onResult={onResult} opts={{ confirm: { title: 'Cancel #3?', description: 'd', confirmLabel: 'Cancel run' }, pending: 'p', success: 's', failure: 'f', fn }} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'go' }));
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(null));
    expect(fn).not.toHaveBeenCalled();
  });

  it('runs, toasts success from the result and invalidates', async () => {
    const onResult = vi.fn();
    const { queryClient } = renderWithProviders(<Harness onResult={onResult} opts={{ pending: 'Starting…', success: (r) => `Build #${r.buildNumber} started`, failure: 'f', fn: async () => ({ buildNumber: 12 }), invalidate: [['build-runs', 'api']] }} />);
    const spy = vi.spyOn(queryClient, 'invalidateQueries');
    await userEvent.setup().click(screen.getByRole('button', { name: 'go' }));
    expect(await screen.findByText('Build #12 started')).toBeInTheDocument();
    expect(onResult).toHaveBeenCalledWith({ buildNumber: 12 });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['build-runs', 'api'] });
  });

  it('toasts the backend error, calls onError and returns null', async () => {
    const onResult = vi.fn();
    const onError = vi.fn();
    renderWithProviders(<Harness onResult={onResult} opts={{ pending: 'p', success: 's', failure: 'Could not start the build', fn: async () => { throw new Error('branch not found'); }, onError }} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'go' }));
    expect(await screen.findByText('Could not start the build')).toBeInTheDocument();
    expect(screen.getByText('branch not found')).toBeInTheDocument();
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'branch not found' }));
    expect(onResult).toHaveBeenCalledWith(null);
  });
});
