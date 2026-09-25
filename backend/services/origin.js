// Cross-site request protection. CORS only stops other sites from *reading*
// responses: "simple" requests (form POSTs, text/plain bodies) and WebSocket
// upgrades still reach the server with the user's cookies. So state-changing
// requests and WS upgrades are refused unless their Origin is this app itself
// or an explicitly allowed CORS origin.

function allowedOrigins() {
  return process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map((s) => s.trim())
    : ['http://localhost:3000', 'http://127.0.0.1:3000'];
}

function isAllowedOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true; // non-browser clients (curl, scripts) send no Origin
  if (allowedOrigins().includes(origin)) return true;
  try {
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function rejectCrossSiteWrites(req, res, next) {
  if (SAFE_METHODS.has(req.method) || isAllowedOrigin(req)) return next();
  res.status(403).json({ error: 'Cross-site request refused' });
}

module.exports = { allowedOrigins, isAllowedOrigin, rejectCrossSiteWrites };
