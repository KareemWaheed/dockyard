// Enable/disable servers: a disabled server keeps its config but nothing may SSH to it.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dockyard-enabled-'));
process.env.DB_PATH = path.join(tmp, 'test.db');
process.env.CONFIG_PATH = path.join(tmp, 'missing.json');
process.env.NOTES_PATH = path.join(tmp, 'notes.json');
process.env.ENCRYPTION_KEY = 'a'.repeat(64);

// Stub SSH before any route module loads it; count connection attempts.
let connects = 0;
require.cache[require.resolve('../services/ssh')] = {
  exports: {
    connect: async () => { connects++; return {}; },
    exec: async () => '',
    readFile: async () => '',
    writeFile: async () => {},
    disconnect: () => {},
  },
};

const express = require('express');
const db = require('../db');
const { exportConfig, importConfig } = require('../services/backup');

const app = express();
app.use(express.json());
app.use('/api/settings', require('./settings'));
app.use('/api/servers', require('./servers'));
app.use('/api/containers', require('./containers'));
app.use('/api/maintenance', require('./maintenance'));
app.use('/api/services', require('./services'));
const server = http.createServer(app);

server.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const json = (method, url, body) =>
    fetch(base + url, { method, headers: { 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
  const serverRow = async (env) => (await (await fetch(`${base}/settings/servers`)).json()).find((s) => s.env_key === env);

  try {
    // New servers are enabled by default.
    const created = await (await json('POST', '/settings/servers', {
      env_key: 'dev', name: 'Dev', host: 'h', ssh_username: 'u',
      stacks: [{ name: 'App', path: '/srv/app/docker-compose.yml' }],
    })).json();
    assert.strictEqual((await serverRow('dev')).enabled, 1, 'new server should be enabled');

    // Toggle endpoint validates input.
    assert.strictEqual((await json('PATCH', `/settings/servers/${created.id}/enabled`, { enabled: 'no' })).status, 400);
    assert.strictEqual((await json('PATCH', '/settings/servers/9999/enabled', { enabled: false })).status, 404);

    // Disable.
    const off = await json('PATCH', `/settings/servers/${created.id}/enabled`, { enabled: false });
    assert.strictEqual(off.status, 200);
    assert.strictEqual((await serverRow('dev')).enabled, 0);

    // Saving the server through the full-edit endpoint must not flip it back on.
    await json('PUT', `/settings/servers/${created.id}`, { name: 'Dev', host: 'h', ssh_username: 'u' });
    assert.strictEqual((await serverRow('dev')).enabled, 0, 'PUT must not touch enabled');

    // Nothing may reach a disabled server.
    connects = 0;
    const blocked = [
      ['GET', '/servers/dev/containers'],
      ['POST', '/containers/dev/web/restart', { stackPath: '/srv/app/docker-compose.yml', serviceName: 'web' }],
      ['POST', '/containers/dev/web/version-info', { stackPath: '/srv/app/docker-compose.yml', serviceName: 'web' }],
      ['GET', '/maintenance/dev'],
      ['POST', '/services/dev/0', {}],
    ];
    for (const [m, url, body] of blocked) {
      const r = await json(m, url, body);
      assert.strictEqual(r.status, 409, `${m} ${url} should be 409 when disabled`);
      assert.strictEqual((await r.json()).error, 'Server is disabled');
    }
    assert.strictEqual(connects, 0, 'no SSH connection to a disabled server');

    // Unknown envs still 404 (not 409).
    assert.strictEqual((await fetch(`${base}/servers/nope/containers`)).status, 404);

    // Re-enable: requests go through again.
    await json('PATCH', `/settings/servers/${created.id}/enabled`, { enabled: true });
    assert.strictEqual((await serverRow('dev')).enabled, 1);
    assert.strictEqual((await fetch(`${base}/servers/dev/containers`)).status, 200);
    assert.ok(connects > 0, 'enabled server is reachable again');

    // Export/import keep the flag.
    await json('PATCH', `/settings/servers/${created.id}/enabled`, { enabled: false });
    const dump = exportConfig(db);
    assert.strictEqual(dump.servers[0].enabled, 0);
    importConfig(db, dump);
    assert.strictEqual((await serverRow('dev')).enabled, 0, 'import restores disabled');
    importConfig(db, { version: 1, servers: [{ env_key: 'old', name: 'Old', host: 'h', ssh_username: 'u' }] });
    assert.strictEqual((await serverRow('old')).enabled, 1, 'backups without the flag import as enabled');

    console.log('server-enabled.test.js: all passed');
  } catch (err) {
    console.error(err);
    process.exitCode = 1;
  } finally {
    server.close();
    db.close();
  }
});
