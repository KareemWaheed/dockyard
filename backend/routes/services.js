const router = require('express').Router();
const db = require('../db');
const { connect, exec, readFile, writeFile } = require('../services/ssh');
const { appendService } = require('../services/compose');

// POST /api/services/:env/:stackIdx
// body: { name, image, ports, environment, restart }
router.post('/:env/:stackIdx', async (req, res) => {
  const { env, stackIdx } = req.params;
  const server = db.prepare('SELECT * FROM servers WHERE env_key = ?').get(env);
  if (!server) return res.status(404).json({ error: `Unknown env: ${env}` });

  const stacks = db.prepare('SELECT * FROM compose_stacks WHERE server_id = ?').all(server.id);
  const stack = stacks[parseInt(stackIdx)];
  if (!stack) return res.status(404).json({ error: 'Stack not found' });

  const serverCfg = {
    host: server.host,
    ssh: {
      username: server.ssh_username,
      password: server.ssh_password || undefined,
      privateKeyPath: server.ssh_key_path || undefined,
      privateKey: server.ssh_key_content ? Buffer.from(server.ssh_key_content, 'base64') : undefined,
      passphrase: server.ssh_passphrase || undefined,
    },
  };

  const { name, image, ports, environment, restart } = req.body;
  if (!name || !image) return res.status(400).json({ error: 'name and image required' });

  const dc = server.docker_compose_cmd || 'docker compose';
  try {
    const conn = await connect(env, serverCfg);
    const composeContent = await readFile(conn, stack.path);
    const updated = appendService(composeContent, { name, image, ports, environment, restart });
    await writeFile(conn, stack.path, updated);
    await exec(conn, `${dc} -f "${stack.path}" up -d "${name}"`);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
