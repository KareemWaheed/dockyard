// backend/db.js
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'dashboard.db');
const DATA_DIR = path.dirname(DB_PATH);
const CONFIG_PATH = process.env.CONFIG_PATH || path.join(__dirname, '..', 'config.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS servers (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    env_key            TEXT NOT NULL UNIQUE,
    name               TEXT NOT NULL,
    host               TEXT NOT NULL,
    ssh_username       TEXT NOT NULL,
    ssh_password       TEXT,
    ssh_key_path       TEXT,
    ssh_key_content    TEXT,
    ssh_passphrase     TEXT,
    docker_compose_cmd TEXT DEFAULT 'docker compose'
  );

  CREATE TABLE IF NOT EXISTS compose_stacks (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    name      TEXT NOT NULL,
    path      TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS deploy_history (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp      TEXT NOT NULL,
    env            TEXT NOT NULL,
    container_name TEXT NOT NULL,
    service_name   TEXT NOT NULL,
    stack_path     TEXT NOT NULL,
    stack_name     TEXT NOT NULL,
    action         TEXT NOT NULL,
    old_tag        TEXT,
    new_tag        TEXT,
    triggered_by   TEXT DEFAULT 'manual',
    success        INTEGER NOT NULL,
    error_message  TEXT,
    duration_ms    INTEGER,
    note_snapshot  TEXT
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    type        TEXT NOT NULL,
    label       TEXT NOT NULL,
    config_json TEXT NOT NULL,
    enabled     INTEGER DEFAULT 1,
    envs_json   TEXT
  );

  CREATE TABLE IF NOT EXISTS app_config (
    key        TEXT PRIMARY KEY,
    value_json TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_deploy_history_env ON deploy_history(env);
  CREATE INDEX IF NOT EXISTS idx_deploy_history_timestamp ON deploy_history(timestamp);
`);

// Migrate config.json on first run if servers table is empty
const serverCount = db.prepare('SELECT COUNT(*) as n FROM servers').get().n;
if (serverCount === 0 && fs.existsSync(CONFIG_PATH)) {
  try {
    const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    migrateConfig(cfg);
    try {
      fs.renameSync(CONFIG_PATH, CONFIG_PATH + '.bak');
    } catch (renameErr) {
      console.error('Migration succeeded but could not rename config.json:', renameErr.message);
    }
    console.log('Migrated config.json to SQLite. Renamed to config.json.bak');
  } catch (err) {
    console.error('Failed to migrate config.json:', err.message);
    console.error('Fix config.json and restart, or add servers via the Settings UI.');
  }
} else {
  console.log(`DB ready. Servers: ${serverCount}, migration skipped.`);
}

function migrateConfig(cfg) {
  // ssh_key_content is intentionally omitted — it's populated later via the Settings UI,
  // not sourced from config.json (which only stores key file paths, not inline key content).
  const insertServer = db.prepare(`
    INSERT INTO servers (env_key, name, host, ssh_username, ssh_password, ssh_key_path, ssh_passphrase, docker_compose_cmd)
    VALUES (@env_key, @name, @host, @ssh_username, @ssh_password, @ssh_key_path, @ssh_passphrase, @docker_compose_cmd)
  `);
  const insertStack = db.prepare(`
    INSERT INTO compose_stacks (server_id, name, path) VALUES (@server_id, @name, @path)
  `);

  const migrate = db.transaction(() => {
    for (const [envKey, server] of Object.entries(cfg.servers || {})) {
      const info = insertServer.run({
        env_key: envKey,
        name: server.name || envKey,
        host: server.host || '',
        ssh_username: server.ssh?.username || '',
        ssh_password: server.ssh?.password || null,
        ssh_key_path: server.ssh?.privateKeyPath || null,
        ssh_passphrase: server.ssh?.passphrase || null,
        docker_compose_cmd: server.dockerCompose || 'docker compose',
      });
      for (const stack of (server.composeStacks || [])) {
        insertStack.run({ server_id: info.lastInsertRowid, name: stack.name, path: stack.path });
      }
    }

    if (cfg.awsSg) {
      db.prepare("INSERT OR REPLACE INTO app_config (key, value_json) VALUES ('awsSg', ?)")
        .run(JSON.stringify(cfg.awsSg));
    }
    if (cfg.gitlab) {
      db.prepare("INSERT OR REPLACE INTO app_config (key, value_json) VALUES ('gitlab', ?)")
        .run(JSON.stringify(cfg.gitlab));
    }
    if (cfg.projects) {
      db.prepare("INSERT OR REPLACE INTO app_config (key, value_json) VALUES ('projects', ?)")
        .run(JSON.stringify(cfg.projects));
    }
  });

  migrate();
}

// Ensure projects have params arrays (migration for pre-params configs)
try {
  const row = db.prepare("SELECT value_json FROM app_config WHERE key = 'projects'").get();
  if (row) {
    const projects = JSON.parse(row.value_json);
    let changed = false;
    for (const [key, proj] of Object.entries(projects)) {
      if (!proj.params) {
        proj.params = [
          { name: 'env', label: 'Environment', type: 'select', options: ['dev', 'staging', 'prod'], default: 'dev', flag: '-e', required: true },
          { name: 'tag', label: 'Tag', type: 'string', flag: '-t', required: true, placeholder: 'e.g. 1.4.2' },
        ];
        changed = true;
      }
    }
    if (changed) {
      db.prepare("UPDATE app_config SET value_json = ? WHERE key = 'projects'")
        .run(JSON.stringify(projects));
      console.log('Migrated projects config: added default params.');
    }
  }
} catch (err) {
  console.error('Projects params migration failed:', err.message);
}

module.exports = db;
