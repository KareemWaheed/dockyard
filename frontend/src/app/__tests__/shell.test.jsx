import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import * as api from '@/lib/api';
import { renderApp } from '@/test/renderApp';

vi.mock('@/lib/api');

beforeEach(() => {
  vi.resetAllMocks();
  api.fetchSettingsServers.mockResolvedValue([{ env_key: 'dev' }, { env_key: 'prod' }]);
  api.fetchContainers.mockImplementation(async (env) => {
    if (env === 'prod') throw new Error('ssh timeout');
    return { stacks: [{ name: 'Main', path: '/m', containers: [{ name: 'a', status: 'stopped' }, { name: 'b', status: 'running' }] }], standalone: [] };
  });
  api.fetchHistory.mockResolvedValue([]);
});

describe('app shell', () => {
  it('lists environments in settings order with their status', async () => {
    renderApp('/');
    const nav = screen.getByRole('navigation', { name: 'Main' });
    const dev = await within(nav).findByRole('link', { name: /dev.*1 down/ });
    const prod = await within(nav).findByRole('link', { name: /prod.*offline/ });
    expect(dev.compareDocumentPosition(prod) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('renders a legacy view inside the legacy scope', async () => {
    const { container } = renderApp('/history');
    expect(await screen.findByText('Deployment History')).toBeInTheDocument();
    expect(container.querySelector('.legacy-scope')).not.toBeNull();
  });
});
