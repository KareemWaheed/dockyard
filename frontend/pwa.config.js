// Navigations the service worker must NOT answer with the cached app shell (index.html).
// /cdn-cgi/ belongs to Cloudflare's edge: after login, Cloudflare Access redirects to
// /cdn-cgi/access/authorized?token=… to set its session cookie. Serving the shell there
// skips the edge, so the cookie is never set and the app comes back still signed out.
export const navigateFallbackDenylist = [/^\/api\//, /^\/ws\//, /^\/cdn-cgi\//];
