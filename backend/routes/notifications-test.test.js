// POST /api/settings/notifications/:id/test sends to that notifier only, and reports its failure.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dockyard-notif-'));
process.env.DB_PATH = path.join(tmp, 'test.db');
process.env.CONFIG_PATH = path.join(tmp, 'missing-config.json');
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'a'.repeat(64);

const express = require('express');
const db = require('../db');

const hits = [];
const hook = http.createServer((req, res) => {
  hits.push(req.url);
  res.statusCode = req.url === '/broken' ? 500 : 200;
  res.end();
});

hook.listen(0, async () => {
  const base = `http://127.0.0.1:${hook.address().port}`;
  const add = (label, url, enabled, envs) =>
    db.prepare('INSERT INTO notifications (type, label, config_json, enabled, envs_json) VALUES (?, ?, ?, ?, ?)')
      .run('webhook', label, JSON.stringify({ url }), enabled, envs ? JSON.stringify(envs) : null).lastInsertRowid;
  const chosen = add('chosen', `${base}/chosen`, 0, ['prod']); // disabled and prod-only: still testable
  add('other', `${base}/other`, 1, null);
  const broken = add('broken', `${base}/broken`, 1, null);

  const app = express();
  app.use(express.json());
  app.use('/api/settings', require('./settings'));
  const server = app.listen(0, async () => {
    const url = (id) => `http://127.0.0.1:${server.address().port}/api/settings/notifications/${id}/test`;
    try {
      let r = await fetch(url(chosen), { method: 'POST' });
      assert.strictEqual(r.status, 200);
      assert.deepStrictEqual(hits, ['/chosen'], 'only the selected notifier is called');

      r = await fetch(url(broken), { method: 'POST' });
      assert.strictEqual(r.status, 422);
      assert.match((await r.json()).error, /returned 500/);

      r = await fetch(url(9999), { method: 'POST' });
      assert.strictEqual(r.status, 404);

      const sms = db.prepare("INSERT INTO notifications (type, label, config_json, enabled) VALUES ('sms', 'sms', '{}', 1)").run().lastInsertRowid;
      r = await fetch(url(sms), { method: 'POST' });
      assert.strictEqual(r.status, 422, 'an unsupported type reports a failure instead of "sent"');
      console.log('notifications-test.test.js: all passed');
    } finally {
      server.close();
      hook.close();
      db.close();
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
