import { describe, it, expect } from 'vitest';
import { envSummary } from '@/app/envSummary';

const data = (statuses, standalone = []) => ({
  stacks: [{ containers: statuses.map((status, i) => ({ name: `c${i}`, status })) }],
  standalone,
});

describe('envSummary', () => {
  it('loading before first data', () => {
    expect(envSummary({ isLoading: true })).toMatchObject({ status: 'loading', label: '' });
  });
  it('offline on error even when stale data exists', () => {
    expect(envSummary({ isError: true, data: data(['running']) })).toEqual({ status: 'offline', tone: 'bad', label: 'offline' });
  });
  it('counts down containers, ignoring standalone ones', () => {
    expect(envSummary({ data: data(['running', 'stopped', 'stopped'], [{ status: 'stopped', standalone: true }]) }))
      .toEqual({ status: 'degraded', tone: 'warn', label: '2 down' });
  });
  it('healthy shows the container count', () => {
    expect(envSummary({ data: data(['running', 'running']) })).toEqual({ status: 'healthy', tone: 'ok', label: '2' });
  });
});
