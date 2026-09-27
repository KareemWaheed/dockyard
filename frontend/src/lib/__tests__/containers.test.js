import { describe, it, expect } from 'vitest';
import { flattenEnv, findContainer, describeState, formatAgo } from '@/lib/containers';

const NOW = Date.parse('2026-09-25T12:00:00Z');
const data = {
  stacks: [
    { name: 'Main', path: '/m.yml', containers: [{ name: 'web', serviceName: 'web', status: 'running', stackName: 'Main', stackPath: '/m.yml' }] },
  ],
  standalone: [{ name: 'dozzle', status: 'running', standalone: true, stackPath: null }],
};

describe('flattenEnv / findContainer', () => {
  it('lists stack containers then standalone ones', () => {
    expect(flattenEnv(data).map((c) => c.name)).toEqual(['web', 'dozzle']);
  });
  it('returns [] for missing data', () => expect(flattenEnv(undefined)).toEqual([]));
  it('finds by container name or returns null', () => {
    expect(findContainer(data, 'dozzle').standalone).toBe(true);
    expect(findContainer(data, 'nope')).toBeNull();
    expect(findContainer(undefined, 'web')).toBeNull();
  });
});

describe('formatAgo', () => {
  it.each([
    ['2026-09-25T11:59:40Z', 'just now'],
    ['2026-09-25T11:55:00Z', '5m'],
    ['2026-09-25T09:00:00Z', '3h'],
    ['2026-09-22T12:00:00Z', '3d'],
  ])('%s → %s', (iso, out) => expect(formatAgo(iso, NOW)).toBe(out));
  it('handles missing input', () => expect(formatAgo(null, NOW)).toBe(''));
});

describe('describeState', () => {
  it('healthy running container', () => {
    expect(describeState({ status: 'running', health: 'healthy', startedAt: '2026-09-22T12:00:00Z', restartCount: 0 }, NOW))
      .toEqual({ tone: 'ok', label: 'healthy', detail: 'healthy · 3d' });
  });
  it('running without healthcheck', () => {
    expect(describeState({ status: 'running', health: null, startedAt: '2026-09-25T09:00:00Z' }, NOW))
      .toEqual({ tone: 'ok', label: 'running', detail: 'running · 3h' });
  });
  it('unhealthy is bad, starting is warn', () => {
    expect(describeState({ status: 'running', health: 'unhealthy', startedAt: null }, NOW).tone).toBe('bad');
    expect(describeState({ status: 'running', health: 'starting', startedAt: null }, NOW).tone).toBe('warn');
  });
  it('restart loops are called out', () => {
    expect(describeState({ status: 'running', health: null, startedAt: '2026-09-25T11:55:00Z', restartCount: 4 }, NOW))
      .toEqual({ tone: 'warn', label: 'restarting', detail: 'restarting ×4 · 5m' });
  });
  it('stopped shows the exit code and when', () => {
    expect(describeState({ status: 'stopped', exitCode: 1, finishedAt: '2026-09-25T10:00:00Z' }, NOW))
      .toEqual({ tone: 'bad', label: 'stopped', detail: 'exited (1) · 2h' });
  });
  it('unknown status is idle', () => {
    expect(describeState({ status: 'unknown' }, NOW)).toEqual({ tone: 'idle', label: 'unknown', detail: 'unknown' });
  });
});
