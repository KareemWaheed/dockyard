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
});
