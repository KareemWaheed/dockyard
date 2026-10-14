import { describe, expect, it } from 'vitest';
import { navigateFallbackDenylist } from '../../../pwa.config.js';

// Navigations matching the denylist reach the network instead of being answered with the
// cached app shell by the service worker.
const reachesNetwork = (path) => navigateFallbackDenylist.some((re) => re.test(path));

describe('service worker navigation fallback', () => {
  it("lets Cloudflare Access's login callback reach the edge so it can set the session cookie", () => {
    expect(reachesNetwork('/cdn-cgi/access/authorized?token=abc')).toBe(true);
    expect(reachesNetwork('/cdn-cgi/access/logout')).toBe(true);
  });

  it('keeps API and WebSocket paths off the app shell', () => {
    expect(reachesNetwork('/api/auth/reauth?next=%2Fbuilds')).toBe(true);
    expect(reachesNetwork('/ws/logs')).toBe(true);
  });

  it('serves app routes from the cached shell', () => {
    expect(reachesNetwork('/')).toBe(false);
    expect(reachesNetwork('/builds/backend2/332')).toBe(false);
  });
});
