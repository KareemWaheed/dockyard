const db = require('../db');

// router.param('env', rejectDisabledEnv): a disabled server keeps its config, but no request
// may SSH to it. Unknown envs fall through so each route still answers its own 404.
function rejectDisabledEnv(req, res, next, env) {
  const server = db.prepare('SELECT enabled FROM servers WHERE env_key = ?').get(env);
  if (server && !server.enabled) return res.status(409).json({ error: 'Server is disabled' });
  next();
}

module.exports = { rejectDisabledEnv };
