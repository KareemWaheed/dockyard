const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dockyard-sugg-'));
process.env.DB_PATH = path.join(tmp, 'test.db');
process.env.CONFIG_PATH = path.join(tmp, 'missing.json');

const express = require('express');
const db = require('../db');

db.prepare(`INSERT INTO build_runs (project, build_number, type, status, started_at, finished_at, branch, pushed_images_json)
            VALUES ('fe', 7, 'build', 'success', 'x', '2026-09-25 10:00:00', 'main', ?)`)
  .run(JSON.stringify(['reg/ns/frontend:9.9.9']));
db.prepare(`INSERT INTO build_runs (project, build_number, type, status, started_at, branch, pushed_images_json)
            VALUES ('fe', 8, 'build', 'failed', 'x', 'main', ?)`)
  .run(JSON.stringify(['reg/ns/frontend:bad']));
const hist = db.prepare(`INSERT INTO deploy_history (timestamp, env, container_name, service_name, stack_path, stack_name, action, old_tag, new_tag, success)
                         VALUES (?, 'stage', 'frontend', 'frontend', '/p', 'Main', 'update-tag', ?, ?, ?)`);
hist.run('2026-09-24T00:00:00Z', '1.0', '1.1', 1);
hist.run('2026-09-25T00:00:00Z', '1.1', '1.2', 1);
hist.run('2026-09-25T01:00:00Z', '1.2', 'broken', 0);

const app = express();
app.use('/api/deploy-suggestions', require('./suggestions'));
const server = http.createServer(app);

server.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}/api/deploy-suggestions`;
  try {
    let r = await fetch(`${base}/stage/frontend?image=${encodeURIComponent('reg/ns/frontend:1.2')}&current=1.2`);
    assert.strictEqual(r.status, 200);
    const body = await r.json();
    assert.deepStrictEqual(body.otherEnvs, []);
    assert.deepStrictEqual(body.recentBuilds.map((b) => b.tag), ['9.9.9'], 'only successful builds of the same repo');
    assert.deepStrictEqual(body.previous.map((p) => p.tag), ['1.1', '1.0'], 'failed deploys ignored, current excluded');

    r = await fetch(`${base}/stage/${encodeURIComponent('bad;id')}?image=x&current=y`);
    assert.strictEqual(r.status, 400, 'invalid service name rejected');
    console.log('suggestions route tests passed');
  } catch (err) {
    console.error(err);
    process.exitCode = 1;
  } finally {
    server.close();
    db.close();
    fs.rmSync(tmp, { recursive: true, force: true });
    process.exit();
  }
});
