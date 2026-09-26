import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LogsTab } from '@/features/container/LogsTab';

class FakeSocket {
  static instances = [];
  constructor(url) {
    this.url = url;
    FakeSocket.instances.push(this);
  }
  close() { this.closed = true; }
  emit(msg) { this.onmessage?.({ data: JSON.stringify(msg) }); }
}

beforeEach(() => {
  FakeSocket.instances = [];
  vi.stubGlobal('WebSocket', FakeSocket);
});
afterEach(() => vi.unstubAllGlobals());

describe('LogsTab', () => {
  it('streams lines, filters matches and reconnects after a disconnect', async () => {
    render(<LogsTab env="stage" container={{ name: 'web' }} />);
    const ws = FakeSocket.instances[0];
    expect(ws.url).toMatch(/\/ws\/logs\?env=stage&container=web$/);
    act(() => {
      ws.onopen?.();
      ws.emit({ type: 'line', text: 'boot ok\nERROR db down\nready\n' });
    });
    expect(screen.getByText('ERROR db down')).toBeInTheDocument();

    const user = userEvent.setup();
    await user.type(screen.getByRole('searchbox', { name: 'Search logs' }), 'error');
    await user.click(screen.getByRole('checkbox', { name: 'Matches only' }));
    expect(screen.queryByText('boot ok')).toBeNull();
    expect(screen.getByText('db down', { exact: false })).toBeInTheDocument();

    act(() => ws.onclose?.());
    await user.click(screen.getByRole('button', { name: 'Reconnect' }));
    expect(FakeSocket.instances).toHaveLength(2);
  });

  it('shows the reconnect banner when the backend sends a closed message without closing the socket', async () => {
    render(<LogsTab env="stage" container={{ name: 'web' }} />);
    const ws = FakeSocket.instances[0];
    act(() => {
      ws.onopen?.();
      ws.emit({ type: 'line', text: 'boot ok\n' });
    });
    act(() => ws.emit({ type: 'closed' }));
    expect(screen.getByText('Disconnected from the log stream.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reconnect' })).toBeInTheDocument();
  });

  it('keeps auto-following once the 5,000-line cap is reached (M-4)', () => {
    // scrollHeight isn't laid out in jsdom — stand in a value the test controls,
    // so we can tell whether the auto-follow effect re-ran on the latest chunk.
    let scrollHeightMock = 0;
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', { configurable: true, get: () => scrollHeightMock });

    const { container } = render(<LogsTab env="stage" container={{ name: 'web' }} />);
    const body = container.querySelector('.overflow-auto');
    const ws = FakeSocket.instances[0];

    scrollHeightMock = 100;
    act(() => {
      ws.onopen?.();
      // 5001 lines in one chunk — pushes the buffer straight to the 5,000-line cap.
      ws.emit({ type: 'line', text: `${Array.from({ length: 5001 }, (_, i) => `L${i}`).join('\n')}\n` });
    });
    expect(body.scrollTop).toBe(100);

    scrollHeightMock = 200;
    act(() => ws.emit({ type: 'line', text: 'NEWLINE\n' }));
    // Still capped at 5,000 lines, but a new line arrived — follow must still scroll to bottom.
    expect(body.scrollTop).toBe(200);

    delete HTMLElement.prototype.scrollHeight;
  });
});
