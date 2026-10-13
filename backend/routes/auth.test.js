const assert = require('assert');
const http = require('http');
const express = require('express');
const auth = require('./auth');

const { safeNext } = auth;
assert.strictEqual(safeNext('/env/prod?open=x#logs'), '/env/prod?open=x#logs');
assert.strictEqual(safeNext(undefined), '/');
assert.strictEqual(safeNext(''), '/');
assert.strictEqual(safeNext('https://evil.example'), '/');
assert.strictEqual(safeNext('//evil.example/path'), '/');
assert.strictEqual(safeNext('/\\evil.example'), '/');
assert.strictEqual(safeNext('/api/auth/reauth'), '/');
assert.strictEqual(safeNext(['/a', '/b']), '/');

const app = express();
app.use('/api/auth', auth);
const server = http.createServer(app).listen(0, () => {
  const { port } = server.address();
  http.get(`http://127.0.0.1:${port}/api/auth/reauth?next=${encodeURIComponent('/builds/api')}`, (res) => {
    assert.strictEqual(res.statusCode, 302);
    assert.strictEqual(res.headers.location, '/builds/api');
    assert.strictEqual(res.headers['cache-control'], 'no-store');
    server.close();
    console.log('auth.test.js: all passed');
  });
});
