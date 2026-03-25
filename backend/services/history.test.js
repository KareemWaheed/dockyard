// backend/services/history.test.js
const os = require('os');
const path = require('path');
const fs = require('fs');

function assert(cond, msg) {
  if (!cond) throw new Error('Assertion failed: ' + msg);
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'namaa-history-test-'));
process.env.DB_PATH = path.join(tmpDir, 'test.db');
// No config.json in tmpDir — db.js will skip migration and start fresh
process.env.CONFIG_PATH = path.join(tmpDir, 'nonexistent-config.json');

const db = require('../db');
const { writeHistory } = require('./history');

writeHistory({
  env: 'stage',
  containerName: 'frontend',
  serviceName: 'frontend',
  stackPath: '/app/docker-compose.yml',
  stackName: 'Main',
  action: 'update-tag',
  oldTag: 'v1',
  newTag: 'v2',
  success: true,
  errorMessage: null,
  durationMs: 1200,
  noteSnapshot: 'test note',
});

const rows = db.prepare('SELECT * FROM deploy_history').all();
assert(rows.length === 1, 'should have 1 row');
assert(rows[0].env === 'stage', 'env');
assert(rows[0].action === 'update-tag', 'action');
assert(rows[0].success === 1, 'success stored as 1');
assert(rows[0].old_tag === 'v1', 'old_tag');
assert(rows[0].new_tag === 'v2', 'new_tag');
assert(rows[0].duration_ms === 1200, 'duration_ms');
assert(rows[0].note_snapshot === 'test note', 'note_snapshot');
assert(rows[0].timestamp.includes('T'), 'ISO timestamp');
assert(rows[0].triggered_by === 'manual', 'triggered_by default');

writeHistory({
  env: 'stage', containerName: 'backend', serviceName: 'backend',
  stackPath: '/app/docker-compose.yml', stackName: 'Main',
  action: 'restart', success: false, errorMessage: 'SSH timeout',
});
const rows2 = db.prepare('SELECT * FROM deploy_history ORDER BY id').all();
assert(rows2.length === 2, 'second row');
assert(rows2[1].success === 0, 'failure stored as 0');
assert(rows2[1].error_message === 'SSH timeout', 'error_message');
assert(rows2[1].old_tag === null, 'old_tag null when not provided');

// Cleanup
db.close();
fs.rmSync(tmpDir, { recursive: true });

console.log('history service tests passed');
