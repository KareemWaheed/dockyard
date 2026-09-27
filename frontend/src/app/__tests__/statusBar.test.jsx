import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import * as api from '@/lib/api';
import { renderApp } from '@/test/renderApp';

vi.mock('@/lib/api');

beforeEach(() => {
  vi.resetAllMocks();
  api.fetchSettingsServers.mockResolvedValue([]);
});

describe('iOS status bar area (installed PWA)', () => {
  it('paints a solid brand strip behind the status bar so its white text stays readable', async () => {
    renderApp('/');
    await screen.findByRole('navigation', { name: 'Main' });
    const strip = document.querySelector('[data-status-bar]');
    expect(strip).not.toBeNull();
    expect(strip).toHaveAttribute('aria-hidden', 'true');
    expect(strip.className).toMatch(/\bfixed\b/);
    expect(strip.className).toContain('h-[env(safe-area-inset-top)]');
    expect(strip.className).toContain('bg-brand');
  });
});
