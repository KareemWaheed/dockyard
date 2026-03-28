// backend/routes/flyway.js
const router = require('express').Router();
const db = require('../db');
const { startFlywayRun, cancelRun } = require('../services/flyway-manager');

// ── Environments ──────────────────────────────────────────────────────────────

// GET /api/flyway/envs — list all envs with their databases
router.get('/envs', (req, res) => {
  const envs = db.prepare('SELECT * FROM flyway_envs ORDER BY name').all();
  const databases = db.prepare('SELECT * FROM flyway_databases ORDER BY name').all();
  res.json(envs.map(e => ({
    ...e,
    databases: databases.filter(d => d.env_id === e.id),
  })));
});

// POST /api/flyway/envs
router.post('/envs', (req, res) => {
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const info = db.prepare(
    'INSERT INTO flyway_envs (name, description) VALUES (?, ?)'
  ).run(name, description || null);
  res.json({ id: info.lastInsertRowid });
});

// PUT /api/flyway/envs/:id
router.put('/envs/:id', (req, res) => {
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  db.prepare('UPDATE flyway_envs SET name = ?, description = ? WHERE id = ?')
    .run(name, description || null, req.params.id);
  res.json({ ok: true });
});

// DELETE /api/flyway/envs/:id
router.delete('/envs/:id', (req, res) => {
  db.prepare('DELETE FROM flyway_envs WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ── Databases ─────────────────────────────────────────────────────────────────

// POST /api/flyway/envs/:envId/databases
router.post('/envs/:envId/databases', (req, res) => {
  const { envId } = req.params;
  const { name, url, db_user, db_password, schemas, locations, baseline_on_migrate, baseline_version } = req.body;
  if (!name || !url || !db_user || !db_password || !schemas) {
    return res.status(400).json({ error: 'name, url, db_user, db_password, schemas required' });
  }
  const info = db.prepare(
    'INSERT INTO flyway_databases (env_id, name, url, db_user, db_password, schemas, locations, baseline_on_migrate, baseline_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    envId, name, url, db_user, db_password, schemas,
    locations || 'filesystem:src/main/resources/db/migration/',
    baseline_on_migrate !== false ? 1 : 0,
    baseline_version || '1'
  );
  res.json({ id: info.lastInsertRowid });
});

// PUT /api/flyway/databases/:id
router.put('/databases/:id', (req, res) => {
  const { name, url, db_user, db_password, schemas, locations, baseline_on_migrate, baseline_version } = req.body;
  if (!name || !url || !db_user || !schemas) {
    return res.status(400).json({ error: 'name, url, db_user, schemas required' });
  }
  // Only update password if provided (allow omitting it to keep existing)
  if (db_password) {
    db.prepare(
      'UPDATE flyway_databases SET name=?, url=?, db_user=?, db_password=?, schemas=?, locations=?, baseline_on_migrate=?, baseline_version=? WHERE id=?'
    ).run(name, url, db_user, db_password, schemas,
      locations || 'filesystem:src/main/resources/db/migration/',
      baseline_on_migrate !== false ? 1 : 0,
      baseline_version || '1',
      req.params.id);
  } else {
    db.prepare(
      'UPDATE flyway_databases SET name=?, url=?, db_user=?, schemas=?, locations=?, baseline_on_migrate=?, baseline_version=? WHERE id=?'
    ).run(name, url, db_user, schemas,
      locations || 'filesystem:src/main/resources/db/migration/',
      baseline_on_migrate !== false ? 1 : 0,
      baseline_version || '1',
      req.params.id);
  }
  res.json({ ok: true });
});

// DELETE /api/flyway/databases/:id
router.delete('/databases/:id', (req, res) => {
  db.prepare('DELETE FROM flyway_databases WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ── Runs ──────────────────────────────────────────────────────────────────────

// POST /api/flyway/run — body: { envId, dbId, project, branch, command }
router.post('/run', (req, res) => {
  const { envId, dbId, project, branch, command } = req.body;
  if (!envId || !dbId || !project || !branch || !['info', 'migrate'].includes(command)) {
    return res.status(400).json({ error: 'envId, dbId, project, branch, and command (info|migrate) required' });
  }
  try {
    const { runId, runNumber } = startFlywayRun(envId, dbId, project, branch, command);
    res.json({ runId, runNumber });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/flyway/runs — last 50 runs (no log body)
router.get('/runs', (req, res) => {
  const runs = db.prepare(`
    SELECT r.id, r.run_number, r.project, r.branch, r.command, r.status, r.exit_code, r.started_at, r.finished_at,
           e.name as env_name, d.name as db_name
    FROM flyway_runs r
    LEFT JOIN flyway_envs e ON e.id = r.env_id
    LEFT JOIN flyway_databases d ON d.id = r.db_id
    ORDER BY r.id DESC LIMIT 50
  `).all();
  res.json(runs);
});

// GET /api/flyway/runs/:id — single run with full log
router.get('/runs/:id', (req, res) => {
  const run = db.prepare('SELECT * FROM flyway_runs WHERE id = ?').get(req.params.id);
  if (!run) return res.status(404).json({ error: 'Run not found' });
  res.json(run);
});

// DELETE /api/flyway/runs/:id — cancel
router.delete('/runs/:id', (req, res) => {
  const run = db.prepare('SELECT * FROM flyway_runs WHERE id = ?').get(req.params.id);
  if (!run) return res.status(404).json({ error: 'Run not found' });
  if (run.status !== 'running') return res.status(400).json({ error: 'Run is not active' });
  res.json({ cancelled: cancelRun(run.id) });
});

module.exports = router;
