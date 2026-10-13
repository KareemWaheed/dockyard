import { describe, it, expect, vi, afterEach } from 'vitest';
import * as api from '@/lib/api';
import { isSessionExpired, reauthUrl, resetSession } from '@/lib/session';

afterEach(() => {
  vi.unstubAllGlobals();
  resetSession();
});

describe('expired SSO session detection', () => {
  it('does not follow redirects and treats one as an expired session', async () => {
    const fetchMock = vi.fn(async () => ({ type: 'opaqueredirect', status: 0, ok: false }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(api.fetchContainers('dev')).rejects.toMatchObject({ sessionExpired: true });
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ redirect: 'manual' });
    expect(isSessionExpired()).toBe(true);
  });

  it('treats a 401 as an expired session, and keeps request options', async () => {
    const fetchMock = vi.fn(async () => ({ type: 'basic', status: 401, ok: false, text: async () => '' }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(api.containerAction('dev', 'web', 'restart', { a: 1 })).rejects.toMatchObject({ sessionExpired: true });
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'POST', body: '{"a":1}', redirect: 'manual' });
  });

  it('leaves ordinary API errors alone', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ type: 'basic', status: 500, ok: false, text: async () => '{"error":"boom"}' })));
    await expect(api.fetchContainers('dev')).rejects.toThrow('boom');
    expect(isSessionExpired()).toBe(false);
  });

  it('sends the browser through the re-auth endpoint back to the current page', () => {
    expect(reauthUrl({ pathname: '/env/prod', search: '?open=prod/web', hash: '#x' })).toBe(
      '/api/auth/reauth?next=%2Fenv%2Fprod%3Fopen%3Dprod%2Fweb%23x',
    );
  });

  it('gives up on a hung config save', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((url, init) => new Promise((_, reject) => {
      init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    })));
    const p = api.updateAppConfig('awsSg', {});
    const check = expect(p).rejects.toThrow(/didn't answer within 15s/);
    await vi.advanceTimersByTimeAsync(api.SAVE_TIMEOUT_MS);
    await check;
    vi.useRealTimers();
  });
});
