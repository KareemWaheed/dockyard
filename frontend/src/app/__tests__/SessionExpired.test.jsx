import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as api from '@/lib/api';
import { renderApp } from '@/test/renderApp';
import { markSessionExpired, resetSession } from '@/lib/session';

vi.mock('@/lib/api');

beforeEach(() => {
  vi.resetAllMocks();
  api.fetchSettingsServers.mockResolvedValue([]);
});
afterEach(() => {
  resetSession();
  vi.unstubAllGlobals();
});

describe('SessionExpired', () => {
  it('prompts to sign in again and navigates through the re-auth endpoint', async () => {
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, pathname: '/builds', search: '', hash: '', assign });
    renderApp('/');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    act(() => markSessionExpired());
    expect(await screen.findByRole('alertdialog', { name: 'Your sign-in has expired' })).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: /Sign in again/ }));
    expect(assign).toHaveBeenCalledWith('/api/auth/reauth?next=%2Fbuilds');
  });
});
