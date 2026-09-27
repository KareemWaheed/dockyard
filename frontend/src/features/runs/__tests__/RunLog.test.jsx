import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
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

describe('RunLog auto-scroll', () => {
  let resize;
  class RO {
    constructor(cb) { resize = cb; }
    observe() {}
    disconnect() {}
  }
  const originalRO = globalThis.ResizeObserver;
  afterEach(() => {
    globalThis.ResizeObserver = originalRO;
    delete HTMLElement.prototype.scrollHeight;
    delete HTMLElement.prototype.clientHeight;
  });
  const mockLayout = (get) => {
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', { configurable: true, get: () => get().scrollHeight });
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => get().clientHeight });
  };
  const body = () => screen.getByText('line 1').parentElement;

  it('stays at the end when the log area shrinks after the output loaded (details/deploy bar appearing)', () => {
    globalThis.ResizeObserver = RO;
    let layout = { scrollHeight: 400, clientHeight: 300 };
    mockLayout(() => layout);
    render(<RunLog lines={['line 1', 'line 2']} status="done" fileName={() => 'x.log'} emptyText="" />);
    expect(body().scrollTop).toBe(400);
    layout = { scrollHeight: 400, clientHeight: 150 }; // area got smaller: end is out of view
    body().scrollTop = 250;
    act(() => resize());
    expect(body().scrollTop).toBe(400);
  });

  it('does not pull the reader back down after they scrolled up', () => {
    globalThis.ResizeObserver = RO;
    let layout = { scrollHeight: 400, clientHeight: 100 };
    mockLayout(() => layout);
    render(<RunLog lines={['line 1', 'line 2']} status="done" fileName={() => 'x.log'} emptyText="" />);
    fireEvent.wheel(body(), { deltaY: -300 });
    body().scrollTop = 0;
    fireEvent.scroll(body());
    act(() => resize());
    expect(body().scrollTop).toBe(0);
    expect(screen.getByRole('button', { name: /Jump to latest/ })).toBeInTheDocument();
  });

  it('jumps back to the end when wrap is toggled while following', async () => {
    let layout = { scrollHeight: 400, clientHeight: 100 };
    mockLayout(() => layout);
    render(<RunLog lines={['line 1', 'line 2']} status="done" fileName={() => 'x.log'} emptyText="" />);
    layout = { scrollHeight: 900, clientHeight: 100 }; // wrapping off/on changes the content height
    fireEvent.click(screen.getByRole('checkbox', { name: 'Wrap' }));
    expect(body().scrollTop).toBe(900);
  });

  it('keeps following when the browser moves the scroll position itself (drawer opening, text reflow)', () => {
    let layout = { scrollHeight: 400, clientHeight: 100 };
    mockLayout(() => layout);
    render(<RunLog lines={['line 1', 'line 2']} status="open" fileName={() => 'x.log'} emptyText="" />);
    layout = { scrollHeight: 800, clientHeight: 100 }; // lines re-wrapped at the new width
    body().scrollTop = 350; // browser-adjusted position, no wheel/touch/key from the user
    fireEvent.scroll(body());
    expect(body().scrollTop).toBe(800);
    expect(screen.queryByRole('button', { name: /Jump to latest/ })).toBeNull();
  });
});
