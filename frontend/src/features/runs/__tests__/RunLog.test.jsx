import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RunLog } from '@/features/runs/RunLog';

describe('RunLog', () => {
  it('shows the custom closed banner only when the stream dropped', async () => {
    const onReconnect = vi.fn();
    const { rerender } = render(<RunLog lines={['a']} status="closed" closedText="Log stream ended before the run finished." onReconnect={onReconnect} fileName={() => 'x.log'} emptyText="No output yet." />);
    expect(screen.getByText('Log stream ended before the run finished.')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Reconnect' }));
    expect(onReconnect).toHaveBeenCalled();
    rerender(<RunLog lines={['a']} status="done" onReconnect={onReconnect} fileName={() => 'x.log'} emptyText="No output yet." />);
    expect(screen.queryByRole('button', { name: 'Reconnect' })).toBeNull();
  });

  it('shows empty text and highlights error lines', () => {
    const { rerender } = render(<RunLog lines={[]} status="open" fileName={() => 'x.log'} emptyText="No output yet." />);
    expect(screen.getByText('No output yet.')).toBeInTheDocument();
    rerender(<RunLog lines={['ok', '[ERROR] build failed']} status="done" fileName={() => 'x.log'} emptyText="No output yet." />);
    expect(screen.getByText('[ERROR] build failed')).toHaveClass('text-bad');
  });

  it('offers wrap and matches-only in the phone options menu', async () => {
    render(<RunLog lines={['a']} status="done" fileName={() => 'x.log'} emptyText="" />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Log options' }));
    const wrap = screen.getByRole('menuitemcheckbox', { name: 'Wrap' });
    expect(wrap).toHaveAttribute('aria-checked', 'true');
    await user.click(wrap);
    await user.click(screen.getByRole('button', { name: 'Log options' }));
    expect(screen.getByRole('menuitemcheckbox', { name: 'Wrap' })).toHaveAttribute('aria-checked', 'false');
  });
});
