// backend/backup.test.js
const fs = require('fs');
const path = require('path');
const os = require('os');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'namaa-backup-test-'));
process.env.DB_PATH = path.join(tmpDir, 'test.db');
process.env.CONFIG_PATH = path.join(tmpDir, 'config.json');

const db = require('./db');
const { exportConfig, importConfig } = require('./services/backup');

function assert(cond, msg) {
  if (!cond) throw new Error('Assertion failed: ' + msg);
}

// ── Seed ─────────────────────────────────────────────────────────────────────
const serverId = db.prepare(
  "INSERT INTO servers (env_key, name, host, ssh_username, ssh_password, docker_compose_cmd) VALUES ('dev', 'Dev', '10.0.0.1', 'root', 'pass', 'docker compose')"
).run().lastInsertRowid;
db.prepare("INSERT INTO compose_stacks (server_id, name, path) VALUES (?, 'App', '/app/docker-compose.yml')").run(serverId);
db.prepare("INSERT INTO notifications (type, label, config_json, enabled) VALUES ('slack', 'Slack', '{\"webhook\":\"http://x\"}', 1)").run();
db.prepare("INSERT INTO app_config (key, value_json) VALUES ('gitlab', '{\"token\":\"abc\"}')").run();
const envId = db.prepare("INSERT INTO flyway_envs (name, description) VALUES ('prod', 'Production')").run().lastInsertRowid;
db.prepare(
  "INSERT INTO flyway_databases (env_id, name, url, db_user, db_password, schemas, locations, baseline_on_migrate, baseline_version) VALUES (?, 'main', 'jdbc:pg://localhost/db', 'user', 'pass', 'public', 'filesystem:migrations/', 1, '1')"
).run(envId);

// ── Export tests ──────────────────────────────────────────────────────────────
const exported = exportConfig(db);
assert(exported.version === 1, 'version is 1');
assert(typeof exported.exported_at === 'string', 'exported_at present');
assert(exported.servers.length === 1, 'one server exported');
assert(exported.servers[0].env_key === 'dev', 'server env_key');
assert(exported.servers[0].id === undefined, 'id stripped from server');
assert(exported.servers[0].stacks.length === 1, 'one stack on server');
assert(exported.servers[0].stacks[0].path === '/app/docker-compose.yml', 'stack path');
assert(exported.servers[0].stacks[0].id === undefined, 'id stripped from stack');
assert(exported.notifications.length === 1, 'one notification exported');
assert(exported.notifications[0].id === undefined, 'id stripped from notification');
assert(exported.app_config.gitlab.token === 'abc', 'app_config gitlab token');
assert(exported.flyway_envs.length === 1, 'one flyway env exported');
assert(exported.flyway_envs[0].id === undefined, 'id stripped from flyway env');
assert(exported.flyway_envs[0].databases.length === 1, 'one flyway db');
assert(exported.flyway_envs[0].databases[0].id === undefined, 'id stripped from flyway db');

// ── Import (replace) tests ────────────────────────────────────────────────────
const importPayload = {
  version: 1,
  servers: [{
    env_key: 'prod', name: 'Prod', host: '10.0.0.2', ssh_username: 'ec2-user',
    ssh_password: null, ssh_key_path: null, ssh_key_content: null, ssh_passphrase: null,
    docker_compose_cmd: 'docker compose', aws_sg_id: null,
    stacks: [{ name: 'Main', path: '/prod/docker-compose.yml' }],
  }],
  notifications: [],
  app_config: { gitlab: { token: 'xyz' } },
  flyway_envs: [{
    name: 'staging', description: null,
    databases: [{
      name: 'main', url: 'jdbc:pg://stage/db', db_user: 'u', db_password: 'p',
      schemas: 'public', locations: 'filesystem:migrations/', baseline_on_migrate: 1, baseline_version: '1',
    }],
  }],
};
importConfig(db, importPayload);

assert(db.prepare('SELECT COUNT(*) as n FROM servers').get().n === 1, 'one server after import');
assert(db.prepare("SELECT env_key FROM servers").get().env_key === 'prod', 'prod server imported');
assert(db.prepare('SELECT COUNT(*) as n FROM compose_stacks').get().n === 1, 'one stack after import');
assert(db.prepare('SELECT path FROM compose_stacks').get().path === '/prod/docker-compose.yml', 'stack path imported');
assert(db.prepare('SELECT COUNT(*) as n FROM notifications').get().n === 0, 'notifications cleared');
const gitlab2 = JSON.parse(db.prepare("SELECT value_json FROM app_config WHERE key='gitlab'").get().value_json);
assert(gitlab2.token === 'xyz', 'app_config replaced');
assert(db.prepare('SELECT COUNT(*) as n FROM flyway_envs').get().n === 1, 'one flyway env after import');
assert(db.prepare('SELECT name FROM flyway_envs').get().name === 'staging', 'flyway env name');
assert(db.prepare('SELECT COUNT(*) as n FROM flyway_databases').get().n === 1, 'one flyway db after import');

// ── Validation tests ──────────────────────────────────────────────────────────
try {
  importConfig(db, { servers: [] });
  assert(false, 'should throw on missing version');
} catch (e) {
  assert(e.message.includes('version'), 'error mentions version');
}
try {
  importConfig(db, { version: 1 });
  assert(false, 'should throw on empty payload');
} catch (e) {
  assert(e.message.includes('no data'), 'error mentions no data');
}

// ── Cleanup ───────────────────────────────────────────────────────────────────
db.close();
fs.rmSync(tmpDir, { recursive: true });
console.log('backup tests passed');
