import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as api from '@/lib/api';
import { renderApp } from '@/test/renderApp';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';

vi.mock('@/lib/api');

const TOP = 'pt-[env(safe-area-inset-top)]';
const BOTTOM = 'pb-[env(safe-area-inset-bottom)]';

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  api.fetchSettingsServers.mockResolvedValue([{ env_key: 'stage' }]);
  api.fetchContainers.mockResolvedValue({ stacks: [{ name: 'Main', path: '/m', containers: [{ name: 'web', serviceName: 'web', image: 'reg/web:1', status: 'running', managed: true, stackPath: '/m' }] }], standalone: [] });
  api.fetchProjects.mockResolvedValue({});
  api.fetchHistory.mockResolvedValue([]);
});

describe('full-screen phone overlays keep clear of the iOS status bar', () => {
  it('pads the activity panel on phones only (desktop sits inside the padded shell)', async () => {
    renderApp('/');
    await screen.findByRole('heading', { name: 'Overview' });
    await userEvent.setup().keyboard('a');
    const panel = await screen.findByRole('complementary', { name: 'Activity' });
    expect(panel.className).toContain(TOP);
    expect(panel.className).toContain(BOTTOM);
    expect(panel.className).toContain('md:pt-0');
  });

  it('pads the container drawer on phones only', async () => {
    renderApp('/env/stage?open=stage%2Fweb&tab=logs');
    const drawer = await screen.findByRole('complementary', { name: /web/ });
    expect(drawer.className).toContain(TOP);
    expect(drawer.className).toContain('md:pt-0');
  });

  it('pads side sheets and moves their close button below the status bar', () => {
    render(
      <Sheet open>
        <SheetContent side="right" className="p-0">
          <SheetTitle>Panel</SheetTitle>
        </SheetContent>
      </Sheet>,
    );
    const safe = document.querySelector('[data-slot="sheet-safe-area"]');
    expect(safe).not.toBeNull();
    expect(safe.className).toContain(TOP);
    expect(safe.className).toContain(BOTTOM);
    expect(screen.getByRole('button', { name: 'Close' }).className).toContain('top-[calc(env(safe-area-inset-top)+1rem)]');
  });

  it('keeps side sheets below the status-bar strip (cubic #32)', () => {
    render(
      <Sheet open>
        <SheetContent side="left"><SheetTitle>Menu</SheetTitle></SheetContent>
      </Sheet>,
    );
    const content = document.querySelector('[data-slot="sheet-content"]');
    const overlay = document.querySelector('[data-slot="sheet-overlay"]');
    expect(content.className).toContain('z-40');
    expect(content.className).not.toContain('z-50');
    expect(overlay.className).toContain('z-40');
  });
});
