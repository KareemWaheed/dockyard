import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import * as api from '@/lib/api';
import { renderApp } from '@/test/renderApp';
import { DockyardLogo } from '@/components/DockyardLogo';

vi.mock('@/lib/api');

beforeEach(() => {
  vi.resetAllMocks();
  api.fetchSettingsServers.mockResolvedValue([]);
  api.fetchProjects.mockResolvedValue({});
});

describe('DockyardLogo', () => {
  it('draws the Gantry D mark, labelled when given a title', () => {
    render(<DockyardLogo title="Dockyard" />);
    const logo = screen.getByRole('img', { name: 'Dockyard' });
    expect(logo.querySelector('rect[fill="#ff7a1a"]')).not.toBeNull(); // the container
    render(<DockyardLogo tile />);
    expect(document.querySelectorAll('svg[data-logo="gantry-d"]')).toHaveLength(2);
  });

  it('replaces the anchor icon in the sidebar', async () => {
    renderApp('/');
    const nav = await screen.findByRole('navigation', { name: 'Main' });
    expect(nav.querySelector('svg[data-logo="gantry-d"]')).not.toBeNull();
    expect(nav.querySelector('.lucide-anchor')).toBeNull();
    expect(within(nav).getByText('Dockyard')).toBeInTheDocument();
  });
});
