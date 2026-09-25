const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dockyard-env-'));
process.env.DB_PATH = path.join(tmp, 'test.db');
process.env.CONFIG_PATH = path.join(tmp, 'missing.json');
process.env.NOTES_PATH = path.join(tmp, 'notes.json');

// Stub SSH before the route module loads it.
const calls = { exec: [], writes: [] };
const files = {
  '/srv/app/docker-compose.yml': 'services:\n  web:\n    image: app:1\n    environment:\n      - A=1\n      - B=${B}\n',
  '/srv/app/.env': 'B=old\n',
};
require.cache[require.resolve('../services/ssh')] = {
  exports: {
    connect: async () => ({}),
    exec: async (_c, cmd) => { calls.exec.push(cmd); return ''; },
    readFile: async (_c, p) => { if (p in files) return files[p]; throw new Error('ENOENT'); },
    writeFile: async (_c, p, content) => { calls.writes.push(p); files[p] = content; },
  },
};

const express = require('express');
const db = require('../db');
const sid = db.prepare("INSERT INTO servers (env_key, name, host, ssh_username) VALUES ('dev','dev','h','u')").run().lastInsertRowid;
db.prepare("INSERT INTO compose_stacks (server_id, name, path) VALUES (?, 'App', '/srv/app/docker-compose.yml')").run(sid);

const app = express();
app.use(express.json());
app.use('/api/containers', require('./containers'));
const server = http.createServer(app);

const post = (port, body) =>
  fetch(`http://127.0.0.1:${port}/api/containers/dev/web/update-env`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
const base = { stackPath: '/srv/app/docker-compose.yml', serviceName: 'web', stackName: 'App' };

server.listen(0, async () => {
  const { port } = server.address();
  try {
    // batched: both files written, exactly one `up -d`
    let r = await post(port, { ...base, changes: [{ key: 'A', value: '2' }, { key: 'B', value: 'new' }, { key: 'C', value: '3' }] });
    assert.strictEqual(r.status, 200, await r.text());
    assert.deepStrictEqual(calls.writes.sort(), ['/srv/app/.env', '/srv/app/docker-compose.yml']);
    assert.strictEqual(calls.exec.filter((c) => c.includes(' up -d ')).length, 1, 'one recreate');
    assert.match(files['/srv/app/.env'], /^B=new$/m);
    const hist = db.prepare("SELECT COUNT(*) n FROM deploy_history WHERE action = 'update-env'").get().n;
    assert.strictEqual(hist, 1, 'one history row');

    // legacy single-key form still works
    calls.exec.length = 0; calls.writes.length = 0;
    r = await post(port, { ...base, key: 'A', value: '9' });
    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(calls.writes, ['/srv/app/docker-compose.yml']);

    // hostile input rejected before anything is written
    calls.exec.length = 0; calls.writes.length = 0;
    for (const bad of [{ key: 'A.B', value: '1' }, { key: 'X|Y', value: '1' }, { key: 'OK', value: 'a\nEVIL=1' }]) {
      r = await post(port, { ...base, changes: [bad] });
      assert.strictEqual(r.status, 400, `should reject ${JSON.stringify(bad)}`);
    }
    assert.strictEqual(calls.writes.length + calls.exec.length, 0, 'nothing touched on rejection');
    console.log('update-env route tests passed');
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
