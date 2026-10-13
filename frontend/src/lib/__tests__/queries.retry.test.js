import { describe, it, expect } from 'vitest';
import { envQueryOptions, retryOnce } from '@/lib/queries';

describe('retryOnce', () => {
  it('retries once, but never an expired session — container polls included', () => {
    expect(retryOnce(0, new Error('boom'))).toBe(true);
    expect(retryOnce(1, new Error('boom'))).toBe(false);
    expect(retryOnce(0, { sessionExpired: true })).toBe(false);
    expect(envQueryOptions('dev').retry).toBe(retryOnce);
  });
});
