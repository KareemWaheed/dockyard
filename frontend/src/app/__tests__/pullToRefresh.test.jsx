import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useRef } from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import * as api from '@/lib/api';
import { renderApp } from '@/test/renderApp';
import { usePullToRefresh, PULL_THRESHOLD } from '@/app/usePullToRefresh';

vi.mock('@/lib/api');

function Harness({ onRefresh, scrollTop = 0, childScrollTop = 0 }) {
  const ref = useRef(null);
  const { pull, refreshing } = usePullToRefresh(ref, onRefresh);
  return (
    <div ref={ref} data-testid="scroller" style={{ overflow: 'auto' }}>
      <span data-testid="state">{refreshing ? 'refreshing' : `pull:${Math.round(pull)}`}</span>
      <div data-testid="nested" style={{ overflow: 'auto' }}>
        <p data-testid="inner">content</p>
      </div>
    </div>
  );
}

const setScroll = (el, v) => Object.defineProperty(el, 'scrollTop', { configurable: true, value: v });
const drag = (el, from, to) => {
  fireEvent.touchStart(el, { touches: [{ clientY: from }] });
  fireEvent.touchMove(el, { touches: [{ clientY: (from + to) / 2 }] });
  fireEvent.touchMove(el, { touches: [{ clientY: to }] });
  fireEvent.touchEnd(el, { changedTouches: [{ clientY: to }] });
};

describe('usePullToRefresh', () => {
  it('refreshes after pulling down past the threshold at the top, then resets', async () => {
    let finish;
    const onRefresh = vi.fn(() => new Promise((r) => { finish = r; }));
    render(<Harness onRefresh={onRefresh} />);
    const el = screen.getByTestId('scroller');
    setScroll(el, 0);
    act(() => drag(el, 100, 100 + PULL_THRESHOLD * 3));
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('state')).toHaveTextContent('refreshing');
    await act(async () => finish());
    expect(screen.getByTestId('state')).toHaveTextContent('pull:0');
  });

  it('follows the finger while pulling and ignores a short pull', () => {
    const onRefresh = vi.fn();
    render(<Harness onRefresh={onRefresh} />);
    const el = screen.getByTestId('scroller');
    setScroll(el, 0);
    fireEvent.touchStart(el, { touches: [{ clientY: 100 }] });
    fireEvent.touchMove(el, { touches: [{ clientY: 140 }] });
    expect(screen.getByTestId('state').textContent).not.toBe('pull:0');
    fireEvent.touchEnd(el, { changedTouches: [{ clientY: 140 }] });
    expect(onRefresh).not.toHaveBeenCalled();
    expect(screen.getByTestId('state')).toHaveTextContent('pull:0');
  });

  it('does nothing when the page is scrolled down or a nested panel is scrolled', () => {
    const onRefresh = vi.fn();
    render(<Harness onRefresh={onRefresh} />);
    const el = screen.getByTestId('scroller');
    setScroll(el, 50);
    drag(el, 100, 400);
    setScroll(el, 0);
    setScroll(screen.getByTestId('nested'), 30);
    drag(screen.getByTestId('inner'), 100, 400);
    expect(onRefresh).not.toHaveBeenCalled();
  });
});

describe('pull to refresh in the app shell', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    api.fetchSettingsServers.mockResolvedValue([]);
  });

  it('refetches the data on screen when the main area is pulled', async () => {
    renderApp('/');
    const main = await screen.findByRole('main');
    await waitFor(() => expect(api.fetchSettingsServers).toHaveBeenCalledTimes(1));
    setScroll(main, 0);
    act(() => drag(main, 100, 100 + PULL_THRESHOLD * 3));
    await waitFor(() => expect(api.fetchSettingsServers).toHaveBeenCalledTimes(2));
  });

  it('leaves sideways swipes alone even with some downward drift (cubic #31)', () => {
    const onRefresh = vi.fn();
    render(<Harness onRefresh={onRefresh} />);
    const el = screen.getByTestId('scroller');
    setScroll(el, 0);
    fireEvent.touchStart(el, { touches: [{ clientX: 50, clientY: 100 }] });
    fireEvent.touchMove(el, { touches: [{ clientX: 250, clientY: 140 }] });
    fireEvent.touchMove(el, { touches: [{ clientX: 350, clientY: 300 }] });
    expect(screen.getByTestId('state')).toHaveTextContent('pull:0');
    fireEvent.touchEnd(el, { changedTouches: [{ clientX: 350, clientY: 300 }] });
    expect(onRefresh).not.toHaveBeenCalled();
  });
});
