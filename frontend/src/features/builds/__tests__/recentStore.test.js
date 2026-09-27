import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadRecent, saveRecent } from '@/features/builds/recentStore';

beforeEach(() => localStorage.clear());

describe('recentStore', () => {
  it('round-trips per project', () => {
    expect(loadRecent('api')).toBeNull();
    saveRecent('api', { branch: 'main', values: { tag: '1' } });
    saveRecent('web', { branch: 'dev', values: {} });
    expect(loadRecent('api')).toEqual({ branch: 'main', values: { tag: '1' } });
  });

  it('falls back to the legacy key written by the old Builds page', () => {
    localStorage.setItem('dockyard_build_recent', JSON.stringify({ api: { branch: 'release/1', tag: '9' } }));
    expect(loadRecent('api')).toEqual({ branch: 'release/1', values: { tag: '9' } });
  });

  it('returns null when storage throws', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(loadRecent('api')).toBeNull();
    spy.mockRestore();
  });
});
