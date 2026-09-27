import { describe, it, expect, vi } from 'vitest';
import { screen, render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Label } from '@/components/ui/label';
import { renderWithProviders } from '@/test/renderWithProviders';
import { runStatusMeta, isActive, toIso } from '@/features/runs/runStatus';
import { RunStatusBadge } from '@/features/runs/RunStatusBadge';
import { RunList } from '@/features/runs/RunList';
import { ComboPicker } from '@/features/runs/ComboPicker';

describe('runStatus', () => {
  it('maps statuses', () => {
    expect(runStatusMeta('success')).toEqual({ tone: 'ok', label: 'Success' });
    expect(runStatusMeta('weird')).toEqual({ tone: 'idle', label: 'weird' });
    expect(isActive('queued')).toBe(true);
    expect(isActive('failed')).toBe(false);
    expect(toIso('2026-09-27 10:00:00')).toBe('2026-09-27T10:00:00Z');
    expect(toIso('2026-09-27T10:00:00.000Z')).toBe('2026-09-27T10:00:00.000Z');
  });
  it('renders a labelled badge', () => {
    render(<RunStatusBadge status="failed" />);
    expect(screen.getByText('Failed')).toBeInTheDocument();
  });
});

describe('RunList', () => {
  it('links each run, marks the selected one and moves focus with arrow keys', async () => {
    const items = [{ n: 3 }, { n: 2 }, { n: 1 }];
    const { router } = renderWithProviders(
      <RunList label="Runs" items={items} getKey={(r) => r.n} getHref={(r) => `/r/${r.n}`} isSelected={(r) => r.n === 2} renderItem={(r) => `Run ${r.n}`} />,
    );
    const links = screen.getAllByRole('link');
    expect(links[1]).toHaveAttribute('aria-current', 'page');
    const user = userEvent.setup();
    links[0].focus();
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(links[1]);
    await user.keyboard('{ArrowUp}{ArrowUp}');
    expect(document.activeElement).toBe(links[0]);
    await user.keyboard('{Enter}');
    expect(router.state.location.pathname).toBe('/r/3');
  });
});

describe('ComboPicker', () => {
  it('searches and picks an option', async () => {
    const onChange = vi.fn();
    render(
      <>
        <Label htmlFor="br">Branch</Label>
        <ComboPicker id="br" options={['main', 'release/1.2', 'fix/x'].map((b) => ({ value: b, label: b }))} value="main" onChange={onChange} placeholder="Select branch…" searchLabel="Search branches" emptyText="No matching branch." />
      </>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('combobox', { name: 'Branch' }));
    await user.type(screen.getByRole('combobox', { name: 'Search branches' }), 'release');
    await user.click(screen.getByRole('option', { name: /release\/1\.2/ }));
    expect(onChange).toHaveBeenCalledWith('release/1.2');
  });
});
