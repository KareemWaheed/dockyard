const os = require('os');
const path = require('path');
const fs = require('fs');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'namaa-notify-test-'));
process.env.DB_PATH = path.join(tmpDir, 'test.db');

const db = require('../db');
const { notifyDeploy } = require('./notify');

function assert(cond, msg) {
  if (!cond) { throw new Error('Assertion failed: ' + msg); }
}

// Insert a disabled notifier — should not fire
db.prepare("INSERT INTO notifications (type, label, config_json, enabled) VALUES ('webhook', 'Test', ?, 0)")
  .run(JSON.stringify({ url: 'http://localhost:9999/webhook' }));

// Insert an enabled notifier targeting only 'prod' — should not fire for 'stage'
db.prepare("INSERT INTO notifications (type, label, config_json, enabled, envs_json) VALUES ('webhook', 'ProdOnly', ?, 1, ?)")
  .run(JSON.stringify({ url: 'http://localhost:9999/webhook' }), JSON.stringify(['prod']));

// notifyDeploy should run without error (disabled/mismatched channels simply don't fire)
notifyDeploy({
  env: 'stage', container: 'frontend', action: 'update-tag',
  fromTag: 'v1', toTag: 'v2', durationMs: 1200, success: true, error: null,
}).then(() => {
  db.close();
  fs.rmSync(tmpDir, { recursive: true });
  console.log('notify service tests passed');
}).catch(err => {
  console.error('FAIL:', err);
  process.exit(1);
});
