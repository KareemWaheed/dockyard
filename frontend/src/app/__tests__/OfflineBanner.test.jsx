import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { OfflineBanner } from '@/app/OfflineBanner';

const setOnline = (value) => Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => value });
afterEach(() => setOnline(true));

describe('OfflineBanner', () => {
  it('appears when the browser goes offline and hides when it comes back', () => {
    setOnline(true);
    render(<OfflineBanner />);
    expect(screen.queryByRole('status')).toBeNull();
    act(() => { setOnline(false); window.dispatchEvent(new Event('offline')); });
    expect(screen.getByRole('status')).toHaveTextContent("You're offline — data can't refresh.");
    act(() => { setOnline(true); window.dispatchEvent(new Event('online')); });
    expect(screen.queryByRole('status')).toBeNull();
  });
});
