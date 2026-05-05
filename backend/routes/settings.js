const router = require('express').Router();
const db = require('../db');
const { disconnect } = require('../services/ssh');
const { exportConfig, importConfig } = require('../services/backup');

// ─── Servers ────────────────────────────────────────────────────────────────

router.get('/servers', (req, res) => {
  const servers = db.prepare('SELECT * FROM servers').all();
  const stacks = db.prepare('SELECT * FROM compose_stacks').all();
  const result = servers.map(s => ({
    ...s,
    stacks: stacks.filter(st => st.server_id === s.id),
  }));
  res.json(result);
});

router.post('/servers', (req, res) => {
  const { env_key, name, host, ssh_username, ssh_password, ssh_key_path,
          ssh_key_content, ssh_passphrase, docker_compose_cmd, aws_sg_id, stacks } = req.body;
  const info = db.prepare(`
    INSERT INTO servers (env_key, name, host, ssh_username, ssh_password, ssh_key_path,
                         ssh_key_content, ssh_passphrase, docker_compose_cmd, aws_sg_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(env_key, name, host, ssh_username,
         ssh_password ?? null, ssh_key_path ?? null,
         ssh_key_content ?? null, ssh_passphrase ?? null,
         docker_compose_cmd ?? 'docker compose', aws_sg_id ?? null);
  const serverId = info.lastInsertRowid;
  for (const stack of (stacks || [])) {
    db.prepare('INSERT INTO compose_stacks (server_id, name, path) VALUES (?, ?, ?)')
      .run(serverId, stack.name, stack.path);
  }
  res.json({ id: serverId });
});

router.put('/servers/:id', (req, res) => {
  const { id } = req.params;
  const { name, host, ssh_username, ssh_password, ssh_key_path,
          ssh_key_content, ssh_passphrase, docker_compose_cmd, aws_sg_id, stacks } = req.body;
  db.prepare(`
    UPDATE servers SET name=?, host=?, ssh_username=?, ssh_password=?, ssh_key_path=?,
      ssh_key_content=?, ssh_passphrase=?, docker_compose_cmd=?, aws_sg_id=? WHERE id=?
  `).run(name, host, ssh_username,
         ssh_password ?? null, ssh_key_path ?? null,
         ssh_key_content ?? null, ssh_passphrase ?? null,
         docker_compose_cmd ?? 'docker compose', aws_sg_id ?? null, id);
  // Replace stacks
  if (stacks !== undefined) {
    db.prepare('DELETE FROM compose_stacks WHERE server_id = ?').run(id);
    for (const stack of stacks) {
      db.prepare('INSERT INTO compose_stacks (server_id, name, path) VALUES (?, ?, ?)')
        .run(id, stack.name, stack.path);
    }
  }
  // Drop cached SSH connection so next request reconnects
  const server = db.prepare('SELECT env_key FROM servers WHERE id = ?').get(id);
  if (server) disconnect(server.env_key);
  res.json({ ok: true });
});

router.delete('/servers/:id', (req, res) => {
  const { id } = req.params;
  const server = db.prepare('SELECT env_key FROM servers WHERE id = ?').get(id);
  db.prepare('DELETE FROM servers WHERE id = ?').run(id);
  if (server) disconnect(server.env_key);
  res.json({ ok: true });
});

// ─── Notifications ───────────────────────────────────────────────────────────

router.get('/notifications', (req, res) => {
  res.json(db.prepare('SELECT * FROM notifications').all());
});

router.post('/notifications', (req, res) => {
  const { type, label, config_json, enabled = 1, envs_json } = req.body;
  const info = db.prepare(`
    INSERT INTO notifications (type, label, config_json, enabled, envs_json)
    VALUES (?, ?, ?, ?, ?)
  `).run(type, label, JSON.stringify(config_json), enabled ? 1 : 0, envs_json ? JSON.stringify(envs_json) : null);
  res.json({ id: info.lastInsertRowid });
});

router.put('/notifications/:id', (req, res) => {
  const { id } = req.params;
  const { type, label, config_json, enabled, envs_json } = req.body;
  db.prepare(`
    UPDATE notifications SET type=?, label=?, config_json=?, enabled=?, envs_json=? WHERE id=?
  `).run(type, label, JSON.stringify(config_json), enabled ? 1 : 0,
         envs_json ? JSON.stringify(envs_json) : null, id);
  res.json({ ok: true });
});

router.delete('/notifications/:id', (req, res) => {
  db.prepare('DELETE FROM notifications WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

router.post('/notifications/:id/test', async (req, res) => {
  const { notifyDeploy } = require('../services/notify');
  try {
    await notifyDeploy({
      env: 'test', container: 'test-container', action: 'restart',
      fromTag: null, toTag: null, durationMs: 0, success: true, error: null,
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── App Config ──────────────────────────────────────────────────────────────

router.get('/config/:key', (req, res) => {
  const row = db.prepare('SELECT value_json FROM app_config WHERE key = ?').get(req.params.key);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(JSON.parse(row.value_json));
});

router.put('/config/:key', (req, res) => {
  db.prepare('INSERT OR REPLACE INTO app_config (key, value_json) VALUES (?, ?)')
    .run(req.params.key, JSON.stringify(req.body));
  res.json({ ok: true });
});

// ─── Export / Import ─────────────────────────────────────────────────────────

router.get('/export', (req, res) => {
  res.json(exportConfig(db));
});

router.post('/import', (req, res) => {
  try {
    importConfig(db, req.body);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
