// Integration checks for request validation on routes that build SSH commands.
// Only rejection paths are exercised, so no SSH server is needed.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dockyard-sec-'));
process.env.DB_PATH = path.join(tmp, 'test.db');
process.env.CONFIG_PATH = path.join(tmp, 'missing-config.json');
process.env.NOTES_PATH = path.join(tmp, 'notes.json');

const express = require('express');
const WebSocket = require('ws');
const db = require('../db');

const serverId = db
  .prepare("INSERT INTO servers (env_key, name, host, ssh_username) VALUES ('dev', 'dev', '127.0.0.1', 'x')")
  .run().lastInsertRowid;
db.prepare("INSERT INTO compose_stacks (server_id, name, path) VALUES (?, 'App', '/srv/app/docker-compose.yml')").run(serverId);

const { rejectCrossSiteWrites } = require('../services/origin');

const app = express();
app.use(rejectCrossSiteWrites);
app.use(express.json());
app.use('/api/maintenance', require('./maintenance'));
app.use('/api/containers', require('./containers'));
const server = http.createServer(app);
require('./logs')(server);

function post(port, urlPath, body) {
  return fetch(`http://127.0.0.1:${port}${urlPath}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(async (r) => ({ status: r.status, body: await r.json() }));
}

function wsOutcome(port, query, origin) {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/logs?${query}`, origin ? { origin } : {});
    ws.on('message', (m) => { resolve({ message: JSON.parse(m.toString()) }); ws.close(); });
    ws.on('unexpected-response', (_req, res) => resolve({ rejectedStatus: res.statusCode }));
    ws.on('error', () => resolve({ error: true }));
  });
}

server.listen(0, async () => {
  const { port } = server.address();
  try {
    // Unknown stack path → rejected before any SSH
    let r = await post(port, '/api/containers/dev/x/restart', { stackPath: '/etc/passwd', serviceName: 'web' });
    assert.strictEqual(r.status, 400, 'arbitrary stackPath must be rejected');

    // Injection in stackPath → rejected
    r = await post(port, '/api/containers/dev/x/update-tag', { stackPath: '/srv/app/docker-compose.yml"; id; "', serviceName: 'web', newTag: '1' });
    assert.strictEqual(r.status, 400, 'injected stackPath must be rejected');

    // Injection in serviceName → rejected
    r = await post(port, '/api/containers/dev/x/stop', { stackPath: '/srv/app/docker-compose.yml', serviceName: 'web;id' });
    assert.strictEqual(r.status, 400, 'injected serviceName must be rejected');
    assert.match(r.body.error, /service name/i);

    // Unknown env → 404
    r = await post(port, '/api/containers/nope/x/stop', { stackPath: '/srv/app/docker-compose.yml', serviceName: 'web' });
    assert.strictEqual(r.status, 404);

    // Note endpoint needs no stack
    r = await post(port, '/api/containers/dev/x/note', { note: 'hi' });
    assert.strictEqual(r.status, 200, 'note should bypass stack validation');

    // Cross-site form-style POST (no preflight) → refused before reaching the route
    let x = await fetch(`http://127.0.0.1:${port}/api/maintenance/dev`, {
      method: 'POST', headers: { 'Content-Type': 'text/plain', Origin: 'https://evil.example' }, body: 'x',
    });
    assert.strictEqual(x.status, 403, 'cross-site POST must be refused');

    // Same-origin POST still passes the guard (reaches the route, which 400s: no flag path configured)
    x = await fetch(`http://127.0.0.1:${port}/api/maintenance/dev`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: `http://127.0.0.1:${port}` }, body: '{"enabled":true}',
    });
    assert.strictEqual(x.status, 400, 'same-origin POST must pass the guard');

    // WS from a foreign origin → handshake refused
    let w = await wsOutcome(port, 'env=dev&container=web', 'https://evil.example');
    assert.strictEqual(w.rejectedStatus, 401, 'foreign origin must be refused');

    // WS from same origin but injected container name → error message
    w = await wsOutcome(port, `env=dev&container=${encodeURIComponent('web;id')}`, `http://127.0.0.1:${port}`);
    assert.deepStrictEqual(w.message, { type: 'error', message: 'Invalid container name' });

    console.log('security route tests passed');
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
