// Unit checks for the PR #2 review fixes (cubic). Run: node services/review-fixes.test.js
const assert = require('assert');
const path = require('path');

const KEY = 'a'.repeat(64);
process.env.ENCRYPTION_KEY = KEY;

(async () => {
  // ── Encryption ──────────────────────────────────────────────────────────
  const enc = require('../encryption');
  // #15: a 64-char key that isn't hex must be rejected up front
  process.env.ENCRYPTION_KEY = 'z'.repeat(64);
  assert.throws(() => enc.assertEncryptionKey(), /hex/, 'non-hex key must be rejected');
  delete process.env.ENCRYPTION_KEY;
  assert.throws(() => enc.assertEncryptionKey(), /required/, 'missing key must be rejected at startup');
  process.env.ENCRYPTION_KEY = KEY;
  enc.assertEncryptionKey();

  // #16: new ciphertext carries a marker; a marked value that can't be decrypted is an error,
  // not silently treated as plaintext (which would get re-encrypted on the next save).
  const c = enc.encrypt('s3cret');
  assert.ok(c.startsWith('enc:v1:'), 'encrypted values carry a version marker');
  assert.strictEqual(enc.decryptField(c), 's3cret');
  process.env.ENCRYPTION_KEY = 'b'.repeat(64);
  assert.throws(() => enc.decryptField(c), 'wrong key on a marked value must throw');
  process.env.ENCRYPTION_KEY = KEY;
  // Legacy values keep working: old unmarked ciphertext and plaintext passwords
  const crypto = require('crypto');
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(KEY, 'hex'), iv);
  const body = Buffer.concat([cipher.update('legacy', 'utf8'), cipher.final()]);
  const legacyCipher = Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64');
  assert.strictEqual(enc.decryptField(legacyCipher), 'legacy', 'unmarked legacy ciphertext still decrypts');
  assert.strictEqual(enc.decryptField('plain-password'), 'plain-password', 'legacy plaintext passes through');

  // ── Settings validation ─────────────────────────────────────────────────
  const v = require('./validate');
  // #3
  for (const ok of ['docker compose', 'docker-compose', 'sudo docker compose', 'sudo docker-compose']) {
    assert.strictEqual(v.composeCmd({ docker_compose_cmd: ok }), ok);
  }
  assert.strictEqual(v.composeCmd({}), 'docker compose', 'empty falls back to the default');
  assert.strictEqual(v.composeCmd({ docker_compose_cmd: 'docker compose; rm -rf /' }), null);
  assert.strictEqual(v.isValidComposeCmd('docker compose && id'), false);
  // #4
  for (const ok of ['api', 'frontend2', 'dal-web', 'app.v2', 'my_app']) assert.ok(v.isValidProjectKey(ok), ok);
  for (const bad of ['../etc', '..', '.', 'a/b', 'a\b', '', '-rf', 'a b']) assert.ok(!v.isValidProjectKey(bad), bad);

  // #4 defence in depth: repoDir never leaves REPOS_DIR
  const git = require('./git');
  assert.throws(() => git.repoDir('../outside'), /project/i);
  assert.ok(git.repoDir('api').endsWith(`${path.sep}api`));

  // ── Flyway (#7): Maven runs without a shell on Linux ────────────────────
  const { mavenInvocation } = require('./flyway-manager');
  assert.deepStrictEqual(mavenInvocation('linux'), { cmd: 'mvn', shell: false });

  // ── CapRover (#5, #6): only report success when the update was observed ─
  const { deployImage } = require('./caprover');
  const respond = (data) => ({ status: 200, text: async () => JSON.stringify({ status: 100, data }) });
  const run = async (sequence) => {
    const logs = [];
    let i = 0;
    global.fetch = async () => (i++ === 0 ? { status: 200, text: async () => JSON.stringify({ status: 101 }) } : sequence(i - 1));
    const result = await deployImage({ caproverUrl: 'cap.example.com', appName: 'app', appToken: 't', imageName: 'reg/app:2', onLog: (l) => logs.push(l), pollIntervalMs: 1 });
    return { result, logs: logs.join('') };
  };
  // Building observed, then idle → verified
  let r = await run((n) => respond({ isAppBuilding: n < 2 }));
  assert.deepStrictEqual(r.result, { verified: true });
  // #6: idle from the first poll and never seen building → not verified
  r = await run(() => respond({ isAppBuilding: false }));
  assert.deepStrictEqual(r.result, { verified: false });
  assert.match(r.logs, /could not confirm/i);
  // #5: deploy-only app token (1106 on reads) → not verified
  r = await run(() => ({ status: 200, text: async () => JSON.stringify({ status: 1106, description: 'no access' }) }));
  assert.deepStrictEqual(r.result, { verified: false });

  console.log('review fixes: ok');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
