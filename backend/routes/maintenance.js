const router = require('express').Router();
const db = require('../db');
const { connect, exec } = require('../services/ssh');
const { decryptField } = require('../encryption');

function getServerCfg(env) {
  const server = db.prepare('SELECT * FROM servers WHERE env_key = ?').get(env);
  if (!server) return null;
  return {
    server,
    sshCfg: {
      host: server.host,
      ssh: {
        username: server.ssh_username,
        password: decryptField(server.ssh_password) || undefined,
        privateKeyPath: server.ssh_key_path || undefined,
        privateKey: server.ssh_key_content ? Buffer.from(decryptField(server.ssh_key_content), 'base64') : undefined,
        passphrase: decryptField(server.ssh_passphrase) || undefined,
      },
    },
  };
}

// GET /api/maintenance/:env — returns { enabled: bool }
router.get('/:env', async (req, res) => {
  const cfg = getServerCfg(req.params.env);
  if (!cfg) return res.status(404).json({ error: 'Unknown environment' });
  if (!cfg.server.maintenance_flag_path) return res.json({ enabled: false, configured: false });

  try {
    const conn = await connect(req.params.env, cfg.sshCfg);
    const out = await exec(conn, `test -f "${cfg.server.maintenance_flag_path}" && echo 1 || echo 0`);
    res.json({ enabled: out.trim() === '1', configured: true });
  } catch (err) {
    res.status(503).json({ error: err.message });
  }
});

// POST /api/maintenance/:env — body: { enabled: bool }
router.post('/:env', async (req, res) => {
  const cfg = getServerCfg(req.params.env);
  if (!cfg) return res.status(404).json({ error: 'Unknown environment' });
  if (!cfg.server.maintenance_flag_path) return res.status(400).json({ error: 'maintenance_flag_path not configured for this server' });

  const { enabled } = req.body;
  const cmd = enabled
    ? `touch "${cfg.server.maintenance_flag_path}"`
    : `rm -f "${cfg.server.maintenance_flag_path}"`;

  try {
    const conn = await connect(req.params.env, cfg.sshCfg);
    await exec(conn, cmd);
    res.json({ ok: true, enabled });
  } catch (err) {
    res.status(503).json({ error: err.message });
  }
});

module.exports = router;
