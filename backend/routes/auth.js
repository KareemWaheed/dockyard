// Re-authentication entry point for deployments behind an SSO proxy such as Cloudflare Access.
//
// When the proxy session expires, the installed PWA keeps booting from its service-worker
// cache, so a plain reload never reaches the network and never sees the proxy's login
// redirect. The app sends the browser here instead: /api/* is excluded from the service
// worker's navigation fallback, so this request always hits the network, where the proxy
// intercepts it and runs its login flow. Once signed in, the proxy lets the request through
// and we bounce back to the page the user was on.
const router = require('express').Router();

// Same-origin paths only, so this can't be used as an open redirect.
function safeNext(next) {
  if (typeof next !== 'string' || !next.startsWith('/') || next.startsWith('//') || next.includes('\\')) return '/';
  if (/^\/api(\/|$)/.test(next)) return '/';
  return next;
}

router.get('/reauth', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.redirect(302, safeNext(req.query.next));
});

module.exports = router;
module.exports.safeNext = safeNext;
