import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as api from '@/lib/api';
import { renderApp } from '@/test/renderApp';
import { setViewport } from '@/test/viewport';
import { matchesHistory } from '@/features/history/HistoryPage';

vi.mock('@/lib/api');

const rows = [
  { id: 2, env: 'prod', container_name: 'api', action: 'update-tag', old_tag: '1.0', new_tag: '1.1', success: 0, error_message: 'pull failed', duration_ms: 1200, timestamp: new Date().toISOString() },
  { id: 1, env: 'dev', container_name: 'web', action: 'restart', success: 1, duration_ms: 300, timestamp: new Date().toISOString() },
];

beforeEach(() => {
  vi.resetAllMocks();
  setViewport({ desktop: true });
  api.fetchSettingsServers.mockResolvedValue([{ env_key: 'dev', stacks: [] }, { env_key: 'prod', stacks: [] }]);
  api.fetchContainers.mockResolvedValue({ stacks: [], standalone: [] });
  api.fetchHistory.mockResolvedValue(rows);
});

describe('HistoryPage', () => {
  it('lists actions, filters by text and expands a failure', async () => {
    renderApp('/history');
    const table = await screen.findByRole('table');
    expect(within(table).getAllByRole('row')).toHaveLength(3);
    const user = userEvent.setup();
    await user.click(within(table).getByRole('button', { name: /failed — show error/ }));
    expect(within(table).getByText('pull failed')).toBeInTheDocument();
    await user.type(screen.getByRole('searchbox', { name: 'Filter history' }), 'restart');
    expect(within(table).getAllByRole('row')).toHaveLength(2);
    expect(within(table).getByText('web')).toBeInTheDocument();
  });

  it('asks the server for one environment', async () => {
    renderApp('/history');
    await screen.findByRole('table');
    await userEvent.setup().selectOptions(screen.getByRole('combobox', { name: 'Environment' }), 'prod');
    await waitFor(() => expect(api.fetchHistory).toHaveBeenLastCalledWith('prod', { limit: 100 }));
  });

  it('opens the container drawer from a row', async () => {
    const { router } = renderApp('/history');
    const table = await screen.findByRole('table');
    await userEvent.setup().click(within(table).getByRole('button', { name: 'web' }));
    await waitFor(() => expect(router.state.location.search).toContain('open=dev%2Fweb'));
  });

  it('matches container, action and tags case-insensitively', () => {
    expect(matchesHistory(rows[0], 'API')).toBe(true);
    expect(matchesHistory(rows[0], '1.1')).toBe(true);
    expect(matchesHistory(rows[1], 'tag')).toBe(false);
  });
});
