import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { readPref, writePref, usePref } from '@/lib/storage';

describe('storage', () => {
  beforeEach(() => localStorage.clear());

  it('round-trips JSON under the dockyard: prefix', () => {
    writePref('x', { a: 1 });
    expect(localStorage.getItem('dockyard:x')).toBe('{"a":1}');
    expect(readPref('x', null)).toEqual({ a: 1 });
  });

  it('returns the fallback for missing or corrupt values', () => {
    expect(readPref('missing', 'fb')).toBe('fb');
    localStorage.setItem('dockyard:bad', '{not json');
    expect(readPref('bad', 'fb')).toBe('fb');
  });

  it('never throws when storage is unavailable', () => {
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
    expect(readPref('x', 7)).toBe(7);
    expect(() => writePref('x', 1)).not.toThrow();
    get.mockRestore();
    set.mockRestore();
  });

  it('usePref persists updates, including updater functions', () => {
    const { result } = renderHook(() => usePref('count', 1));
    act(() => result.current[1]((n) => n + 1));
    expect(result.current[0]).toBe(2);
    expect(readPref('count', null)).toBe(2);
  });
});
