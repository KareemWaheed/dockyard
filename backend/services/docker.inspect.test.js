const assert = require('assert');
const { parseBatchInspect } = require('./docker');

const out = JSON.stringify([
  {
    Name: '/frontend',
    RestartCount: 2,
    Config: { Image: 'reg/frontend:1.0', Labels: { 'com.dockyard.managed': 'true' }, Env: ['A=1'] },
    State: {
      Status: 'running', StartedAt: '2026-09-22T10:00:00Z', FinishedAt: '0001-01-01T00:00:00Z',
      ExitCode: 0, Health: { Status: 'healthy' },
    },
  },
  {
    Name: '/worker',
    Config: { Image: 'reg/worker:2', Labels: {}, Env: [] },
    State: { Status: 'exited', StartedAt: '2026-09-20T10:00:00Z', FinishedAt: '2026-09-25T08:00:00Z', ExitCode: 1 },
  },
]);

const map = parseBatchInspect(out);
assert.strictEqual(map.frontend.health, 'healthy');
assert.strictEqual(map.frontend.startedAt, '2026-09-22T10:00:00Z');
assert.strictEqual(map.frontend.finishedAt, null, 'zero-time FinishedAt becomes null');
assert.strictEqual(map.frontend.exitCode, 0);
assert.strictEqual(map.frontend.restartCount, 2);
assert.strictEqual(map.worker.health, null, 'no healthcheck → null');
assert.strictEqual(map.worker.exitCode, 1);
assert.strictEqual(map.worker.finishedAt, '2026-09-25T08:00:00Z');
assert.strictEqual(map.worker.restartCount, 0, 'missing RestartCount → 0');
// existing fields untouched
assert.strictEqual(map.frontend.managed, true);
assert.strictEqual(map.worker.status, 'stopped');
console.log('docker inspect field tests passed');
