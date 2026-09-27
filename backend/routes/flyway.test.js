// Integration check: the single-run endpoint returns env/db names like the list does.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dockyard-flyway-'));
process.env.DB_PATH = path.join(tmp, 'test.db');
process.env.CONFIG_PATH = path.join(tmp, 'missing-config.json');
process.env.NOTES_PATH = path.join(tmp, 'notes.json');

const express = require('express');
const db = require('../db');

const envId = db.prepare("INSERT INTO flyway_envs (name) VALUES ('stage')").run().lastInsertRowid;
const dbId = db
  .prepare("INSERT INTO flyway_databases (env_id, name, url, db_user, db_password, schemas) VALUES (?, 'core', 'jdbc:postgresql://x/core', 'u', 'p', 'public')")
  .run(envId).lastInsertRowid;
const runId = db
  .prepare("INSERT INTO flyway_runs (run_number, env_id, db_id, project, branch, command, status, started_at) VALUES (1, ?, ?, 'api', 'main', 'info', 'success', '2026-09-27 10:00:00')")
  .run(envId, dbId).lastInsertRowid;

const app = express();
app.use(express.json());
app.use('/api/flyway', require('./flyway'));
const server = http.createServer(app);

server.listen(0, async () => {
  const { port } = server.address();
  let failed = false;
  try {
    let r = await fetch(`http://127.0.0.1:${port}/api/flyway/runs/${runId}`);
    assert.strictEqual(r.status, 200);
    const run = await r.json();
    assert.strictEqual(run.env_name, 'stage', 'env_name must be joined');
    assert.strictEqual(run.db_name, 'core', 'db_name must be joined');
    assert.strictEqual(run.command, 'info');

    r = await fetch(`http://127.0.0.1:${port}/api/flyway/runs/999`);
    assert.strictEqual(r.status, 404);
    console.log('flyway routes: ok');
  } catch (err) {
    failed = true;
    console.error(err);
  } finally {
    server.close();
    process.exit(failed ? 1 : 0);
  }
});
