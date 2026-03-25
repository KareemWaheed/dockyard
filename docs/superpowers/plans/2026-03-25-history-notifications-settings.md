# History, Notifications & Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add deployment history logging, email/webhook notifications, and a settings UI to the Namaa DevOps dashboard, backed by SQLite.

**Architecture:** Replace `config.json` + `config.js` with SQLite (`better-sqlite3`). All routes that read config switch to direct DB queries. New services (`history.js`, `notify.js`) and routes (`history.js`, `settings.js`) are layered on top without touching the SSH/docker logic. Frontend gains two new views (History, Settings) added to the existing sidebar nav pattern.

**Tech Stack:** `better-sqlite3` (sync SQLite), `nodemailer` (email), Node.js/Express backend, React frontend.

---

## File Map

```
backend/
  db.js                         NEW — SQLite init, migration, singleton
  services/
    history.js                  NEW — writeHistory()
    notify.js                   NEW — notifyDeploy()
  routes/
    history.js                  NEW — GET /api/history and GET /api/history/:env
    settings.js                 NEW — CRUD for servers, notifications, app_config
    containers.js               MODIFIED — read from db; wrap all 5 actions with history + notify
    servers.js                  MODIFIED — read from db instead of loadConfig()
    builds.js                   MODIFIED — read from db instead of loadConfig()
    awssg.js                    MODIFIED — read from db instead of loadConfig()
  server.js                     MODIFIED — require('./db') first; add 2 new routes; remove loadConfig()
  config.js                     REMOVED

frontend/src/
  api.js                        MODIFIED — add fetchHistory, fetchSettingsServers, etc.
  components/
    HistoryView.jsx              NEW
    SettingsView.jsx             NEW — tabbed container
    settings/
      ServersTab.jsx            NEW
      NotificationsTab.jsx      NEW
      GitLabTab.jsx             NEW
      AwsTab.jsx                NEW
  AppShell.jsx                  MODIFIED — render History and Settings views
  components/Sidebar.jsx        MODIFIED — add History and Settings nav items

backend/
  db.test.js                    NEW — migration test
  services/history.test.js      NEW — writeHistory test
  services/notify.test.js       NEW — notifyDeploy unit test (no real SMTP/HTTP)

data/                           NEW dir — holds dashboard.db (.gitignored)
```

---

## Task 1: Install dependencies

**Files:**
- Modify: `backend/package.json`

- [ ] **Step 1: Install packages**

```bash
cd backend && npm install better-sqlite3 nodemailer
```

- [ ] **Step 2: Verify install**

```bash
node -e "require('better-sqlite3'); require('nodemailer'); console.log('ok')"
```

Expected: `ok`

- [ ] **Step 3: Commit**

```bash
git add backend/package.json backend/package-lock.json
git commit -m "chore: add better-sqlite3 and nodemailer dependencies"
```

---

## Task 2: Create backend/db.js — SQLite init and migration

**Files:**
- Create: `backend/db.js`
- Create: `data/` directory (must be .gitignored)

- [ ] **Step 1: Ensure data/ is gitignored**

Add `data/` to `.gitignore` if not already present.

- [ ] **Step 2: Write db.js**

```js
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
`);

// Migrate config.json on first run if servers table is empty
const serverCount = db.prepare('SELECT COUNT(*) as n FROM servers').get().n;
if (serverCount === 0 && fs.existsSync(CONFIG_PATH)) {
  const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  migrateConfig(cfg);
  fs.renameSync(CONFIG_PATH, CONFIG_PATH + '.bak');
  console.log('Migrated config.json to SQLite. Renamed to config.json.bak');
}

function migrateConfig(cfg) {
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
        host: server.host,
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

module.exports = db;
```

- [ ] **Step 3: Verify db.js loads without error**

```bash
cd backend && node -e "const db = require('./db'); console.log('tables:', db.prepare(\"SELECT name FROM sqlite_master WHERE type='table'\").all().map(r=>r.name).join(', '))"
```

Expected output (approximately): `tables: servers, compose_stacks, deploy_history, notifications, app_config`

- [ ] **Step 4: Commit**

```bash
git add backend/db.js .gitignore
git commit -m "feat: add db.js with SQLite schema init and config.json migration"
```

---

## Task 3: Test db.js migration

**Files:**
- Create: `backend/db.test.js`

- [ ] **Step 1: Write the test**

```js
// backend/db.test.js
const fs = require('fs');
const path = require('path');
const os = require('os');

// Use a temp config and temp db for the test
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'namaa-db-test-'));
const tmpConfig = path.join(tmpDir, 'config.json');
const tmpDb = path.join(tmpDir, 'dashboard.db');

const testConfig = {
  awsSg: { region: 'us-east-1', groupId: 'sg-abc' },
  gitlab: { token: 'glpat-test', baseUrl: 'https://gitlab.example.com' },
  projects: { webapp: { name: 'webapp', repo: 'group/webapp', buildScript: './build.sh' } },
  servers: {
    dev: {
      host: '10.0.0.1',
      name: 'Development',
      dockerCompose: 'docker compose',
      ssh: { username: 'ec2-user', password: 'secret' },
      composeStacks: [{ name: 'Main', path: '/home/ec2-user/main/docker-compose.yml' }],
    },
    prod: {
      host: '10.0.0.2',
      name: 'Production',
      ssh: { username: 'ubuntu', privateKeyPath: '/home/user/.ssh/id_rsa', passphrase: 'pp' },
      composeStacks: [
        { name: 'App', path: '/app/docker-compose.yml' },
        { name: 'Monitoring', path: '/monitoring/docker-compose.yml' },
      ],
    },
  },
};

fs.writeFileSync(tmpConfig, JSON.stringify(testConfig));

// Point db.js at tmp paths
process.env.DB_PATH = tmpDb;
process.env.CONFIG_PATH = tmpConfig;

const db = require('./db');

// Servers migrated
const servers = db.prepare('SELECT * FROM servers ORDER BY env_key').all();
console.assert(servers.length === 2, 'should have 2 servers');
const dev = servers.find(s => s.env_key === 'dev');
console.assert(dev.host === '10.0.0.1', 'dev host');
console.assert(dev.ssh_password === 'secret', 'dev password');
console.assert(dev.ssh_key_path === null, 'dev key_path null');
const prod = servers.find(s => s.env_key === 'prod');
console.assert(prod.ssh_key_path === '/home/user/.ssh/id_rsa', 'prod key path');
console.assert(prod.ssh_passphrase === 'pp', 'prod passphrase');

// Stacks migrated
const stacks = db.prepare('SELECT * FROM compose_stacks').all();
console.assert(stacks.length === 3, 'should have 3 stacks total');
const prodStacks = stacks.filter(s => s.server_id === prod.id);
console.assert(prodStacks.length === 2, 'prod has 2 stacks');

// app_config migrated
const awsSg = JSON.parse(db.prepare("SELECT value_json FROM app_config WHERE key='awsSg'").get().value_json);
console.assert(awsSg.region === 'us-east-1', 'awsSg region');
const gitlab = JSON.parse(db.prepare("SELECT value_json FROM app_config WHERE key='gitlab'").get().value_json);
console.assert(gitlab.token === 'glpat-test', 'gitlab token');
const projects = JSON.parse(db.prepare("SELECT value_json FROM app_config WHERE key='projects'").get().value_json);
console.assert(projects.webapp.buildScript === './build.sh', 'projects migrated');

// config.json renamed to .bak
console.assert(!fs.existsSync(tmpConfig), 'config.json removed');
console.assert(fs.existsSync(tmpConfig + '.bak'), 'config.json.bak exists');

// Cleanup
db.close();
fs.rmSync(tmpDir, { recursive: true });

console.log('db migration tests passed');
```

- [ ] **Step 2: Run the test**

```bash
cd backend && node db.test.js
```

Expected: `db migration tests passed`

- [ ] **Step 3: Commit**

```bash
git add backend/db.test.js
git commit -m "test: add db.js migration test"
```

---

## Task 4: Update server.js — load db first, remove config.js

**Files:**
- Modify: `backend/server.js`
- Remove: `backend/config.js` (at end of this task)

- [ ] **Step 1: Update server.js**

Replace the existing `server.js` with:

```js
const express = require('express');
const cors = require('cors');
const http = require('http');

// Must be first — initializes SQLite and runs migration if needed
require('./db');

const app = express();
app.use(cors({ origin: 'http://localhost:3000' }));
app.use(express.json());

// Routes
app.use('/api/servers', require('./routes/servers'));
app.use('/api/containers', require('./routes/containers'));
app.use('/api/builds', require('./routes/builds'));
app.use('/api/services', require('./routes/services'));
app.use('/api/awssg', require('./routes/awssg'));
app.use('/api/history', require('./routes/history'));
app.use('/api/settings', require('./routes/settings'));

// Health check
app.get('/api/health', (req, res) => res.json({ ok: true }));

const server = http.createServer(app);
require('./routes/logs')(server);

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Backend running on http://localhost:${PORT}`));
```

Note: `history.js` and `settings.js` routes don't exist yet — this will fail to start until they're created in Tasks 9 and 13. Temporarily comment out those two `app.use` lines if you need to test intermediate steps.

- [ ] **Step 2: Commit**

```bash
git add backend/server.js
git commit -m "feat: load db singleton first in server.js, register history and settings routes"
```

---

## Task 5: Update routes/servers.js — read from db

**Files:**
- Modify: `backend/routes/servers.js`

This route lists running containers per environment via SSH. It reads SSH config and compose stacks from `loadConfig()`. Replace with direct SQLite reads.

- [ ] **Step 1: Update servers.js**

Replace the file:

```js
const router = require('express').Router();
const db = require('../db');
const { connect, exec } = require('../services/ssh');
const { parseComposePs, parseBatchInspect } = require('../services/docker');
const { getNote } = require('../notes');

router.get('/:env/containers', async (req, res) => {
  const { env } = req.params;

  const server = db.prepare('SELECT * FROM servers WHERE env_key = ?').get(env);
  if (!server) return res.status(404).json({ error: `Unknown environment: ${env}` });
  const stacks = db.prepare('SELECT * FROM compose_stacks WHERE server_id = ?').all(server.id);

  // Build serverCfg in the shape ssh.js / connect() expects
  const serverCfg = {
    host: server.host,
    ssh: {
      username: server.ssh_username,
      password: server.ssh_password || undefined,
      privateKeyPath: server.ssh_key_path || undefined,
      privateKey: server.ssh_key_content ? Buffer.from(server.ssh_key_content, 'base64') : undefined,
      passphrase: server.ssh_passphrase || undefined,
    },
  };
  const dc = server.docker_compose_cmd || 'docker compose';

  try {
    const conn = await connect(env, serverCfg);
    const result = [];

    for (const stack of stacks) {
      const psOutput = await exec(conn, `${dc} -f "${stack.path}" ps --all --format json`);
      const containers = parseComposePs(psOutput);

      let inspectMap = {};
      if (containers.length) {
        try {
          const names = containers.map(c => `"${c.name}"`).join(' ');
          const inspectOutput = await exec(conn, `docker inspect ${names}`);
          inspectMap = parseBatchInspect(inspectOutput);
        } catch {
          // fall through — containers will have managed: false
        }
      }

      const enriched = containers.map(c => {
        const info = inspectMap[c.name];
        if (info) {
          return { ...c, ...info, note: getNote(env, c.name), stackPath: stack.path, stackName: stack.name };
        }
        return { ...c, managed: false, env: {}, note: '', stackPath: stack.path, stackName: stack.name };
      });

      result.push({ name: stack.name, path: stack.path, containers: enriched });
    }

    res.json({ env, stacks: result });
  } catch (err) {
    res.status(503).json({ error: err.message });
  }
});

module.exports = router;
```

- [ ] **Step 2: Commit**

```bash
git add backend/routes/servers.js
git commit -m "feat: read server config from SQLite in servers route"
```

---

## Task 6: Update routes/containers.js — read from db

**Files:**
- Modify: `backend/routes/containers.js`

Replace `loadConfig()` usage in all 5 action handlers. The history/notify wiring comes later (Tasks 10–12); this task only replaces the config reads.

- [ ] **Step 1: Update the top of containers.js**

Replace:
```js
const { loadConfig } = require('../config');
```
With:
```js
const db = require('../db');
```

- [ ] **Step 2: Replace loadConfig() calls in each handler**

In each of the 5 action handlers (`restart`, `stop`, `up`, `update-tag`, `update-env`), replace:

```js
const config = loadConfig();
const serverCfg = config.servers[env];
const dc = serverCfg.dockerCompose || 'docker compose';
```

With:

```js
const server = db.prepare('SELECT * FROM servers WHERE env_key = ?').get(env);
if (!server) return res.status(404).json({ error: `Unknown environment: ${env}` });
const serverCfg = {
  host: server.host,
  ssh: {
    username: server.ssh_username,
    password: server.ssh_password || undefined,
    privateKeyPath: server.ssh_key_path || undefined,
    privateKey: server.ssh_key_content ? Buffer.from(server.ssh_key_content, 'base64') : undefined,
    passphrase: server.ssh_passphrase || undefined,
  },
};
const dc = server.docker_compose_cmd || 'docker compose';
```

- [ ] **Step 3: Commit**

```bash
git add backend/routes/containers.js
git commit -m "feat: read server config from SQLite in containers route"
```

---

## Task 7: Update routes/builds.js and routes/awssg.js — read from db

**Files:**
- Modify: `backend/routes/builds.js`
- Modify: `backend/routes/awssg.js`

- [ ] **Step 1: Update builds.js**

Replace:
```js
const { loadConfig } = require('../config');
```
With:
```js
const db = require('../db');
```

Replace every `const config = loadConfig();` block. The builds route uses two config values:
- `config.projects[project]` → read from `app_config` key `"projects"`
- `config.gitlab.token` → read from `app_config` key `"gitlab"`

Add this helper at the top of the file (after requires):
```js
function getProjects() {
  const row = db.prepare("SELECT value_json FROM app_config WHERE key = 'projects'").get();
  return row ? JSON.parse(row.value_json) : {};
}
function getGitlabToken() {
  const row = db.prepare("SELECT value_json FROM app_config WHERE key = 'gitlab'").get();
  return row ? JSON.parse(row.value_json).token : '';
}
```

Then in each handler, replace `config.projects[project]` with `getProjects()[project]` and `config.gitlab.token` with `getGitlabToken()`.

- [ ] **Step 2: Update awssg.js**

Read `backend/routes/awssg.js` first to understand how it uses config, then apply the same pattern — replace `loadConfig()` with a direct `app_config` read for the `"awsSg"` key.

- [ ] **Step 3: Remove config.js**

```bash
rm backend/config.js
```

- [ ] **Step 4: Verify server starts**

```bash
cd backend && node server.js
```

Expected: `Backend running on http://localhost:3001` (may warn about missing history.js / settings.js — that's fine if you commented them out in Task 4).

- [ ] **Step 5: Commit**

```bash
git add backend/routes/builds.js backend/routes/awssg.js
git rm backend/config.js
git commit -m "feat: read app_config from SQLite in builds and awssg routes; remove config.js"
```

---

## Task 8: Create backend/services/history.js

**Files:**
- Create: `backend/services/history.js`
- Create: `backend/services/history.test.js`

- [ ] **Step 1: Write the failing test**

```js
// backend/services/history.test.js
const os = require('os');
const path = require('path');
const fs = require('fs');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'namaa-history-test-'));
process.env.DB_PATH = path.join(tmpDir, 'test.db');

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
console.assert(rows.length === 1, 'should have 1 row');
console.assert(rows[0].env === 'stage', 'env');
console.assert(rows[0].action === 'update-tag', 'action');
console.assert(rows[0].success === 1, 'success stored as 1');
console.assert(rows[0].old_tag === 'v1', 'old_tag');
console.assert(rows[0].new_tag === 'v2', 'new_tag');
console.assert(rows[0].duration_ms === 1200, 'duration_ms');
console.assert(rows[0].note_snapshot === 'test note', 'note_snapshot');
console.assert(rows[0].timestamp.includes('T'), 'ISO timestamp');

writeHistory({
  env: 'stage', containerName: 'backend', serviceName: 'backend',
  stackPath: '/app/docker-compose.yml', stackName: 'Main',
  action: 'restart', success: false, errorMessage: 'SSH timeout',
});
const rows2 = db.prepare('SELECT * FROM deploy_history ORDER BY id').all();
console.assert(rows2.length === 2, 'second row');
console.assert(rows2[1].success === 0, 'failure stored as 0');
console.assert(rows2[1].error_message === 'SSH timeout', 'error_message');

db.close();
fs.rmSync(tmpDir, { recursive: true });
console.log('history service tests passed');
```

- [ ] **Step 2: Run test — expect failure**

```bash
cd backend && node services/history.test.js
```

Expected: Error — `Cannot find module './history'`

- [ ] **Step 3: Write history.js**

```js
// backend/services/history.js
const db = require('../db');

const insert = db.prepare(`
  INSERT INTO deploy_history
    (timestamp, env, container_name, service_name, stack_path, stack_name,
     action, old_tag, new_tag, triggered_by, success, error_message, duration_ms, note_snapshot)
  VALUES
    (@timestamp, @env, @container_name, @service_name, @stack_path, @stack_name,
     @action, @old_tag, @new_tag, @triggered_by, @success, @error_message, @duration_ms, @note_snapshot)
`);

function writeHistory({ env, containerName, serviceName, stackPath, stackName,
                        action, oldTag, newTag, success, errorMessage, durationMs, noteSnapshot }) {
  insert.run({
    timestamp: new Date().toISOString(),
    env,
    container_name: containerName,
    service_name: serviceName,
    stack_path: stackPath,
    stack_name: stackName,
    action,
    old_tag: oldTag ?? null,
    new_tag: newTag ?? null,
    triggered_by: 'manual',
    success: success ? 1 : 0,
    error_message: errorMessage ?? null,
    duration_ms: durationMs ?? null,
    note_snapshot: noteSnapshot ?? null,
  });
}

module.exports = { writeHistory };
```

- [ ] **Step 4: Run test — expect pass**

```bash
cd backend && node services/history.test.js
```

Expected: `history service tests passed`

- [ ] **Step 5: Commit**

```bash
git add backend/services/history.js backend/services/history.test.js
git commit -m "feat: add history service with writeHistory()"
```

---

## Task 9: Create backend/routes/history.js

**Files:**
- Create: `backend/routes/history.js`

- [ ] **Step 1: Write history route**

```js
// backend/routes/history.js
const router = require('express').Router();
const db = require('../db');

// GET /api/history — all envs
router.get('/', (req, res) => {
  const { container, limit = 100, offset = 0 } = req.query;
  let sql = 'SELECT * FROM deploy_history';
  const params = [];
  if (container) {
    sql += ' WHERE container_name = ?';
    params.push(container);
  }
  sql += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
  params.push(Number(limit), Number(offset));
  res.json(db.prepare(sql).all(...params));
});

// GET /api/history/:env — single env
router.get('/:env', (req, res) => {
  const { env } = req.params;
  const { container, limit = 100, offset = 0 } = req.query;
  let sql = 'SELECT * FROM deploy_history WHERE env = ?';
  const params = [env];
  if (container) {
    sql += ' AND container_name = ?';
    params.push(container);
  }
  sql += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
  params.push(Number(limit), Number(offset));
  res.json(db.prepare(sql).all(...params));
});

module.exports = router;
```

- [ ] **Step 2: Uncomment the history route in server.js** (if commented out in Task 4)

- [ ] **Step 3: Verify the route responds**

Start the backend, then:
```bash
curl http://localhost:3001/api/history
```
Expected: `[]`

- [ ] **Step 4: Commit**

```bash
git add backend/routes/history.js
git commit -m "feat: add GET /api/history and GET /api/history/:env routes"
```

---

## Task 10: Wire history into containers.js

**Files:**
- Modify: `backend/routes/containers.js`

Wrap all 5 action handlers (`restart`, `stop`, `up`, `update-tag`, `update-env`) with timing, history writes, and note snapshots.

- [ ] **Step 1: Add imports at the top of containers.js**

After existing requires, add:
```js
const { writeHistory } = require('../services/history');
const { getNote } = require('../notes');
```

- [ ] **Step 2: Wrap the restart handler**

```js
router.post('/:env/:containerName/restart', async (req, res) => {
  const { env, containerName } = req.params;
  const { stackPath, serviceName, stackName = '' } = req.body;
  // ... existing db/serverCfg/dc setup ...
  const startTime = Date.now();
  const noteSnapshot = getNote(env, containerName);
  try {
    const conn = await connect(env, serverCfg);
    await exec(conn, `${dc} -f "${stackPath}" restart "${serviceName}"`);
    writeHistory({ env, containerName, serviceName, stackPath, stackName, action: 'restart',
                   success: true, durationMs: Date.now() - startTime, noteSnapshot });
    res.json({ ok: true });
  } catch (err) {
    writeHistory({ env, containerName, serviceName, stackPath, stackName, action: 'restart',
                   success: false, errorMessage: err.message, noteSnapshot });
    res.status(500).json({ error: err.message });
  }
});
```

Apply the same wrapping pattern to `stop`, `up`, `update-tag`, and `update-env` handlers:
- `stop` → `action: 'stop'`
- `up` → `action: forceRecreate ? 'force-recreate' : 'up'`
- `update-tag` → `action: 'update-tag'`, capture `oldTag` from the compose/env file before writing, `newTag` from request body
- `update-env` → `action: 'update-env'`

For `update-tag`: read the existing tag from the compose content before overwriting:
```js
// After reading composeContent, before writing:
let oldTag = null;
if (mode === 'env') {
  const envPath = path.join(path.dirname(stackPath), '.env');
  const envContent = await readFile(conn, envPath).catch(() => '');
  oldTag = (envContent.match(new RegExp(`^${varName}=(.+)$`, 'm')) || [])[1] || null;
} else {
  oldTag = composeDoc.services?.[serviceName]?.image?.split(':')[1] || null;
}
```

Then pass `oldTag, newTag` to `writeHistory`.

- [ ] **Step 3: Verify history is written**

Start the backend, trigger a restart action from the UI (or via curl), then:
```bash
curl http://localhost:3001/api/history
```
Expected: array with 1 entry showing the restart action.

- [ ] **Step 4: Commit**

```bash
git add backend/routes/containers.js
git commit -m "feat: write deploy history on every container action"
```

---

## Task 11: Create backend/services/notify.js

**Files:**
- Create: `backend/services/notify.js`
- Create: `backend/services/notify.test.js`

- [ ] **Step 1: Write the failing test**

```js
// backend/services/notify.test.js
const os = require('os');
const path = require('path');
const fs = require('fs');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'namaa-notify-test-'));
process.env.DB_PATH = path.join(tmpDir, 'test.db');

const db = require('../db');
const { notifyDeploy } = require('./notify');

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
```

- [ ] **Step 2: Run — expect failure**

```bash
cd backend && node services/notify.test.js
```

Expected: Error — `Cannot find module './notify'`

- [ ] **Step 3: Write notify.js**

```js
// backend/services/notify.js
const nodemailer = require('nodemailer');
const db = require('../db');

async function notifyDeploy({ env, container, action, fromTag, toTag, durationMs, success, error }) {
  const rows = db.prepare('SELECT * FROM notifications WHERE enabled = 1').all();
  const matching = rows.filter(row => {
    if (!row.envs_json) return true;
    const envs = JSON.parse(row.envs_json);
    return envs.includes(env);
  });

  const payload = {
    event: success ? 'deploy.success' : 'deploy.failure',
    env,
    container,
    action,
    from_tag: fromTag ?? null,
    to_tag: toTag ?? null,
    duration_ms: durationMs ?? null,
    timestamp: new Date().toISOString(),
    error: error ?? null,
  };

  await Promise.allSettled(matching.map(row => fireNotifier(row, payload)));
}

async function fireNotifier(row, payload) {
  const cfg = JSON.parse(row.config_json);
  try {
    if (row.type === 'webhook') {
      const res = await fetch(cfg.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(cfg.headers || {}) },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`Webhook ${cfg.url} returned ${res.status}`);
    } else if (row.type === 'email') {
      const transporter = nodemailer.createTransport({
        host: cfg.host, port: cfg.port, secure: cfg.secure,
        auth: { user: cfg.user, pass: cfg.pass },
      });
      await transporter.sendMail({
        from: cfg.from,
        to: cfg.to,
        subject: `[Namaa] ${payload.event} — ${payload.env}/${payload.container}`,
        text: JSON.stringify(payload, null, 2),
      });
    }
  } catch (err) {
    console.error(`[notify] Failed to fire notifier "${row.label}":`, err.message);
  }
}

module.exports = { notifyDeploy };
```

- [ ] **Step 4: Run test — expect pass**

```bash
cd backend && node services/notify.test.js
```

Expected: `notify service tests passed`

- [ ] **Step 5: Commit**

```bash
git add backend/services/notify.js backend/services/notify.test.js
git commit -m "feat: add notify service with email and webhook support"
```

---

## Task 12: Wire notifications into containers.js

**Files:**
- Modify: `backend/routes/containers.js`

- [ ] **Step 1: Add import**

```js
const { notifyDeploy } = require('../services/notify');
```

- [ ] **Step 2: Call notifyDeploy after writeHistory in each handler**

In both success and failure paths, after `writeHistory(...)`, add:

```js
notifyDeploy({
  env, container: containerName, action,
  fromTag: oldTag ?? null, toTag: newTag ?? null,
  durationMs: Date.now() - startTime,
  success: true/false,
  error: null/err.message,
}).catch(() => {}); // fire-and-forget, errors already logged inside notify.js
```

For handlers without tags (`restart`, `stop`, `up`, `update-env`), pass `fromTag: null, toTag: null`.

- [ ] **Step 3: Commit**

```bash
git add backend/routes/containers.js
git commit -m "feat: fire notifications on every container action"
```

---

## Task 13: Create backend/routes/settings.js

**Files:**
- Create: `backend/routes/settings.js`

- [ ] **Step 1: Write settings.js**

```js
// backend/routes/settings.js
const router = require('express').Router();
const db = require('../db');
const { disconnect } = require('../services/ssh');

// ─── Servers ────────────────────────────────────────────────────────────────

router.get('/servers', (req, res) => {
  const servers = db.prepare('SELECT * FROM servers').all();
  const stacks = db.prepare('SELECT * FROM compose_stacks').all();
  const result = servers.map(s => ({
    ...s,
    stacks: stacks.filter(st => st.server_id === s.id),
  }));
  res.json(result);
});

router.post('/servers', (req, res) => {
  const { env_key, name, host, ssh_username, ssh_password, ssh_key_path,
          ssh_key_content, ssh_passphrase, docker_compose_cmd, stacks } = req.body;
  const info = db.prepare(`
    INSERT INTO servers (env_key, name, host, ssh_username, ssh_password, ssh_key_path,
                         ssh_key_content, ssh_passphrase, docker_compose_cmd)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(env_key, name, host, ssh_username,
         ssh_password ?? null, ssh_key_path ?? null,
         ssh_key_content ?? null, ssh_passphrase ?? null,
         docker_compose_cmd ?? 'docker compose');
  const serverId = info.lastInsertRowid;
  for (const stack of (stacks || [])) {
    db.prepare('INSERT INTO compose_stacks (server_id, name, path) VALUES (?, ?, ?)')
      .run(serverId, stack.name, stack.path);
  }
  res.json({ id: serverId });
});

router.put('/servers/:id', (req, res) => {
  const { id } = req.params;
  const { name, host, ssh_username, ssh_password, ssh_key_path,
          ssh_key_content, ssh_passphrase, docker_compose_cmd, stacks } = req.body;
  db.prepare(`
    UPDATE servers SET name=?, host=?, ssh_username=?, ssh_password=?, ssh_key_path=?,
      ssh_key_content=?, ssh_passphrase=?, docker_compose_cmd=? WHERE id=?
  `).run(name, host, ssh_username,
         ssh_password ?? null, ssh_key_path ?? null,
         ssh_key_content ?? null, ssh_passphrase ?? null,
         docker_compose_cmd ?? 'docker compose', id);
  // Replace stacks
  if (stacks !== undefined) {
    db.prepare('DELETE FROM compose_stacks WHERE server_id = ?').run(id);
    for (const stack of stacks) {
      db.prepare('INSERT INTO compose_stacks (server_id, name, path) VALUES (?, ?, ?)')
        .run(id, stack.name, stack.path);
    }
  }
  // Drop cached SSH connection so next request reconnects
  const server = db.prepare('SELECT env_key FROM servers WHERE id = ?').get(id);
  if (server) disconnect(server.env_key);
  res.json({ ok: true });
});

router.delete('/servers/:id', (req, res) => {
  const { id } = req.params;
  const server = db.prepare('SELECT env_key FROM servers WHERE id = ?').get(id);
  db.prepare('DELETE FROM servers WHERE id = ?').run(id);
  if (server) disconnect(server.env_key);
  res.json({ ok: true });
});

// ─── Notifications ───────────────────────────────────────────────────────────

router.get('/notifications', (req, res) => {
  res.json(db.prepare('SELECT * FROM notifications').all());
});

router.post('/notifications', (req, res) => {
  const { type, label, config_json, enabled = 1, envs_json } = req.body;
  const info = db.prepare(`
    INSERT INTO notifications (type, label, config_json, enabled, envs_json)
    VALUES (?, ?, ?, ?, ?)
  `).run(type, label, JSON.stringify(config_json), enabled ? 1 : 0, envs_json ? JSON.stringify(envs_json) : null);
  res.json({ id: info.lastInsertRowid });
});

router.put('/notifications/:id', (req, res) => {
  const { id } = req.params;
  const { type, label, config_json, enabled, envs_json } = req.body;
  db.prepare(`
    UPDATE notifications SET type=?, label=?, config_json=?, enabled=?, envs_json=? WHERE id=?
  `).run(type, label, JSON.stringify(config_json), enabled ? 1 : 0,
         envs_json ? JSON.stringify(envs_json) : null, id);
  res.json({ ok: true });
});

router.delete('/notifications/:id', (req, res) => {
  db.prepare('DELETE FROM notifications WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

router.post('/notifications/:id/test', async (req, res) => {
  const { notifyDeploy } = require('../services/notify');
  try {
    await notifyDeploy({
      env: 'test', container: 'test-container', action: 'restart',
      fromTag: null, toTag: null, durationMs: 0, success: true, error: null,
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── App Config ──────────────────────────────────────────────────────────────

router.get('/config/:key', (req, res) => {
  const row = db.prepare('SELECT value_json FROM app_config WHERE key = ?').get(req.params.key);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(JSON.parse(row.value_json));
});

router.put('/config/:key', (req, res) => {
  db.prepare('INSERT OR REPLACE INTO app_config (key, value_json) VALUES (?, ?)')
    .run(req.params.key, JSON.stringify(req.body));
  res.json({ ok: true });
});

module.exports = router;
```

- [ ] **Step 2: Uncomment the settings route in server.js** (if commented out in Task 4)

- [ ] **Step 3: Verify settings route responds**

```bash
curl http://localhost:3001/api/settings/servers
```

Expected: JSON array of servers from the DB.

- [ ] **Step 4: Commit**

```bash
git add backend/routes/settings.js
git commit -m "feat: add settings routes for servers, notifications, and app_config"
```

---

## Task 14: Update frontend/src/api.js — add history and settings calls

**Files:**
- Modify: `frontend/src/api.js`

- [ ] **Step 1: Add history and settings API functions**

Append to `api.js`:

```js
// ─── History ─────────────────────────────────────────────────────────────────

export async function fetchHistory(env, { container, limit = 100, offset = 0 } = {}) {
  const params = new URLSearchParams({ limit, offset });
  if (container) params.set('container', container);
  const url = env ? `${BASE}/history/${env}?${params}` : `${BASE}/history?${params}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

// ─── Settings ────────────────────────────────────────────────────────────────

export async function fetchSettingsServers() {
  const r = await fetch(`${BASE}/settings/servers`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function createSettingsServer(body) {
  const r = await fetch(`${BASE}/settings/servers`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function updateSettingsServer(id, body) {
  const r = await fetch(`${BASE}/settings/servers/${id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function deleteSettingsServer(id) {
  const r = await fetch(`${BASE}/settings/servers/${id}`, { method: 'DELETE' });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function fetchNotifications() {
  const r = await fetch(`${BASE}/settings/notifications`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function createNotification(body) {
  const r = await fetch(`${BASE}/settings/notifications`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function updateNotification(id, body) {
  const r = await fetch(`${BASE}/settings/notifications/${id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function deleteNotification(id) {
  const r = await fetch(`${BASE}/settings/notifications/${id}`, { method: 'DELETE' });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function testNotification(id) {
  const r = await fetch(`${BASE}/settings/notifications/${id}/test`, { method: 'POST' });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function fetchAppConfig(key) {
  const r = await fetch(`${BASE}/settings/config/${key}`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function updateAppConfig(key, body) {
  const r = await fetch(`${BASE}/settings/config/${key}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/api.js
git commit -m "feat: add history and settings API client functions"
```

---

## Task 15: Create HistoryView.jsx

**Files:**
- Create: `frontend/src/components/HistoryView.jsx`

- [ ] **Step 1: Write HistoryView.jsx**

```jsx
// frontend/src/components/HistoryView.jsx
import React, { useState, useEffect } from 'react';
import { fetchHistory } from '../api';

const ENVS = ['all', 'dev', 'test', 'stage', 'prod'];

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function HistoryView() {
  const [activeEnv, setActiveEnv] = useState('all');
  const [containerFilter, setContainerFilter] = useState('');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    setLoading(true);
    const env = activeEnv === 'all' ? undefined : activeEnv;
    const filter = containerFilter.trim() || undefined;
    fetchHistory(env, { container: filter })
      .then(setRows)
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [activeEnv, containerFilter]);

  return (
    <div className="history-view">
      <div className="history-header">
        <h2>Deployment History</h2>
        <div className="history-filters">
          <div className="env-tabs">
            {ENVS.map(e => (
              <button
                key={e}
                className={`env-tab ${activeEnv === e ? 'active' : ''}`}
                onClick={() => setActiveEnv(e)}
              >
                {e.toUpperCase()}
              </button>
            ))}
          </div>
          <input
            className="history-search"
            placeholder="Filter by container..."
            value={containerFilter}
            onChange={e => setContainerFilter(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div className="history-empty">Loading...</div>
      ) : rows.length === 0 ? (
        <div className="history-empty">No deployments found.</div>
      ) : (
        <table className="history-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Env</th>
              <th>Container</th>
              <th>Action</th>
              <th>Tag Change</th>
              <th>Status</th>
              <th>Duration</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <React.Fragment key={row.id}>
                <tr
                  className={`history-row ${row.success ? '' : 'history-row-failed'}`}
                  onClick={() => !row.success && setExpandedId(expandedId === row.id ? null : row.id)}
                  style={{ cursor: row.success ? 'default' : 'pointer' }}
                >
                  <td title={row.timestamp}>{timeAgo(row.timestamp)}</td>
                  <td>{row.env}</td>
                  <td>{row.container_name}</td>
                  <td>{row.action}</td>
                  <td>
                    {row.old_tag && row.new_tag
                      ? `${row.old_tag} → ${row.new_tag}`
                      : '—'}
                  </td>
                  <td>{row.success ? '✓' : '✗'}</td>
                  <td>{row.duration_ms != null ? `${(row.duration_ms / 1000).toFixed(1)}s` : '—'}</td>
                </tr>
                {expandedId === row.id && row.error_message && (
                  <tr className="history-row-error">
                    <td colSpan={7}>
                      <pre>{row.error_message}</pre>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add minimal CSS to index.css**

Append to `frontend/src/index.css`:
```css
/* ── History View ─────────────────────────────────────────────────────────── */
.history-view { padding: 24px; }
.history-header { margin-bottom: 16px; }
.history-header h2 { margin: 0 0 12px; font-size: 18px; }
.history-filters { display: flex; align-items: center; gap: 12px; }
.env-tabs { display: flex; gap: 4px; }
.env-tab { padding: 4px 10px; border: 1px solid var(--border); background: none; color: var(--text-secondary); cursor: pointer; border-radius: 4px; font-size: 12px; }
.env-tab.active { background: var(--accent); color: var(--bg); border-color: var(--accent); }
.history-search { padding: 4px 8px; background: var(--surface); border: 1px solid var(--border); color: var(--text); border-radius: 4px; font-size: 13px; width: 200px; }
.history-empty { padding: 40px; text-align: center; color: var(--text-secondary); }
.history-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.history-table th { text-align: left; padding: 8px 12px; border-bottom: 1px solid var(--border); color: var(--text-secondary); font-weight: 500; }
.history-table td { padding: 8px 12px; border-bottom: 1px solid var(--border-subtle, var(--border)); }
.history-row-failed td { color: var(--red); }
.history-row-error td { background: var(--surface); }
.history-row-error pre { margin: 0; font-size: 12px; white-space: pre-wrap; color: var(--red); }
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/HistoryView.jsx frontend/src/index.css
git commit -m "feat: add HistoryView component with env tabs and container filter"
```

---

## Task 16: Create Settings tab components

**Files:**
- Create: `frontend/src/components/settings/ServersTab.jsx`
- Create: `frontend/src/components/settings/NotificationsTab.jsx`
- Create: `frontend/src/components/settings/GitLabTab.jsx`
- Create: `frontend/src/components/settings/AwsTab.jsx`

- [ ] **Step 1: Write ServersTab.jsx**

```jsx
// frontend/src/components/settings/ServersTab.jsx
import React, { useEffect, useState } from 'react';
import { fetchSettingsServers, createSettingsServer, updateSettingsServer, deleteSettingsServer } from '../../api';

const EMPTY_FORM = {
  env_key: '', name: '', host: '', ssh_username: '',
  auth_method: 'password', ssh_password: '', ssh_key_path: '', ssh_key_content: '',
  ssh_passphrase: '', docker_compose_cmd: 'docker compose',
  stacks: [{ name: '', path: '' }],
};

export default function ServersTab() {
  const [servers, setServers] = useState([]);
  const [editId, setEditId] = useState(null); // null = adding new
  const [form, setForm] = useState(null); // null = form closed
  const [expandedId, setExpandedId] = useState(null);

  const load = () => fetchSettingsServers().then(setServers);
  useEffect(() => { load(); }, []);

  const openAdd = () => { setEditId(null); setForm({ ...EMPTY_FORM }); };
  const openEdit = (s) => {
    setEditId(s.id);
    setForm({
      env_key: s.env_key, name: s.name, host: s.host, ssh_username: s.ssh_username,
      auth_method: s.ssh_password ? 'password' : s.ssh_key_content ? 'paste' : 'path',
      ssh_password: s.ssh_password || '', ssh_key_path: s.ssh_key_path || '',
      ssh_key_content: s.ssh_key_content || '', ssh_passphrase: s.ssh_passphrase || '',
      docker_compose_cmd: s.docker_compose_cmd || 'docker compose',
      stacks: s.stacks.length ? s.stacks.map(st => ({ name: st.name, path: st.path })) : [{ name: '', path: '' }],
    });
  };
  const cancel = () => setForm(null);

  const save = async () => {
    const body = {
      env_key: form.env_key, name: form.name, host: form.host, ssh_username: form.ssh_username,
      ssh_password: form.auth_method === 'password' ? form.ssh_password : null,
      ssh_key_path: form.auth_method === 'path' ? form.ssh_key_path : null,
      ssh_key_content: form.auth_method === 'paste' ? form.ssh_key_content : null,
      ssh_passphrase: form.auth_method !== 'password' ? form.ssh_passphrase : null,
      docker_compose_cmd: form.docker_compose_cmd,
      stacks: form.stacks.filter(s => s.name && s.path),
    };
    if (editId) await updateSettingsServer(editId, body);
    else await createSettingsServer(body);
    setForm(null);
    load();
  };

  const remove = async (id) => {
    if (!window.confirm('Remove this server?')) return;
    await deleteSettingsServer(id);
    load();
  };

  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setStack = (i, k, v) => setForm(f => {
    const stacks = [...f.stacks];
    stacks[i] = { ...stacks[i], [k]: v };
    return { ...f, stacks };
  });
  const addStack = () => setForm(f => ({ ...f, stacks: [...f.stacks, { name: '', path: '' }] }));
  const removeStack = (i) => setForm(f => ({ ...f, stacks: f.stacks.filter((_, idx) => idx !== i) }));

  return (
    <div className="settings-tab">
      <div className="settings-tab-header">
        <h3>Servers</h3>
        <button className="btn-primary" onClick={openAdd}>+ Add Server</button>
      </div>

      {servers.map(s => (
        <div key={s.id} className="settings-card">
          <div className="settings-card-row">
            <div>
              <span className="settings-env-badge">{s.env_key}</span>
              <span className="settings-card-name">{s.name}</span>
              <span className="settings-card-host">{s.host}</span>
            </div>
            <div className="settings-card-actions">
              <button onClick={() => setExpandedId(expandedId === s.id ? null : s.id)}>
                {expandedId === s.id ? '▲' : '▼'} Stacks
              </button>
              <button onClick={() => openEdit(s)}>Edit</button>
              <button className="btn-danger" onClick={() => remove(s.id)}>Delete</button>
            </div>
          </div>
          {expandedId === s.id && (
            <div className="settings-stacks">
              {s.stacks.map(st => (
                <div key={st.id} className="settings-stack-row">
                  <span>{st.name}</span>
                  <code>{st.path}</code>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      {form && (
        <div className="settings-modal-overlay">
          <div className="settings-modal">
            <h3>{editId ? 'Edit Server' : 'Add Server'}</h3>
            <label>Env Key <input value={form.env_key} onChange={e => setField('env_key', e.target.value)} disabled={!!editId} /></label>
            <label>Display Name <input value={form.name} onChange={e => setField('name', e.target.value)} /></label>
            <label>Host <input value={form.host} onChange={e => setField('host', e.target.value)} /></label>
            <label>SSH Username <input value={form.ssh_username} onChange={e => setField('ssh_username', e.target.value)} /></label>
            <label>Auth Method
              <select value={form.auth_method} onChange={e => setField('auth_method', e.target.value)}>
                <option value="password">Password</option>
                <option value="path">Key File Path</option>
                <option value="paste">Paste Key</option>
              </select>
            </label>
            {form.auth_method === 'password' && (
              <label>Password <input type="password" value={form.ssh_password} onChange={e => setField('ssh_password', e.target.value)} /></label>
            )}
            {form.auth_method === 'path' && (
              <label>Key Path <input value={form.ssh_key_path} onChange={e => setField('ssh_key_path', e.target.value)} /></label>
            )}
            {form.auth_method === 'paste' && (
              <label>Key Content <textarea rows={6} value={form.ssh_key_content} onChange={e => setField('ssh_key_content', e.target.value)} /></label>
            )}
            {form.auth_method !== 'password' && (
              <label>Passphrase <input type="password" value={form.ssh_passphrase} onChange={e => setField('ssh_passphrase', e.target.value)} /></label>
            )}
            <label>Docker Compose Command <input value={form.docker_compose_cmd} onChange={e => setField('docker_compose_cmd', e.target.value)} /></label>
            <div className="settings-stacks-editor">
              <div className="settings-stacks-header">
                <span>Compose Stacks</span>
                <button onClick={addStack}>+ Add Stack</button>
              </div>
              {form.stacks.map((st, i) => (
                <div key={i} className="settings-stack-input-row">
                  <input placeholder="Name (e.g. Main)" value={st.name} onChange={e => setStack(i, 'name', e.target.value)} />
                  <input placeholder="Path (e.g. /app/docker-compose.yml)" value={st.path} onChange={e => setStack(i, 'path', e.target.value)} />
                  <button onClick={() => removeStack(i)}>✕</button>
                </div>
              ))}
            </div>
            <div className="settings-modal-footer">
              <button onClick={cancel}>Cancel</button>
              <button className="btn-primary" onClick={save}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Write NotificationsTab.jsx**

```jsx
// frontend/src/components/settings/NotificationsTab.jsx
import React, { useEffect, useState } from 'react';
import { fetchNotifications, createNotification, updateNotification, deleteNotification, testNotification } from '../../api';

const EMPTY_EMAIL = { host: '', port: 587, secure: false, user: '', pass: '', from: '', to: '' };
const EMPTY_WEBHOOK = { url: '', headers: {} };

export default function NotificationsTab() {
  const [notifiers, setNotifiers] = useState([]);
  const [form, setForm] = useState(null);
  const [editId, setEditId] = useState(null);

  const load = () => fetchNotifications().then(rows =>
    setNotifiers(rows.map(r => ({ ...r, config: JSON.parse(r.config_json), envs: r.envs_json ? JSON.parse(r.envs_json) : null })))
  );
  useEffect(() => { load(); }, []);

  const openAdd = () => {
    setEditId(null);
    setForm({ type: 'webhook', label: '', enabled: true, envs: '', config: { ...EMPTY_WEBHOOK } });
  };
  const openEdit = (n) => {
    setEditId(n.id);
    setForm({ type: n.type, label: n.label, enabled: !!n.enabled, envs: n.envs ? n.envs.join(',') : '', config: n.config });
  };
  const cancel = () => setForm(null);
  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setCfg = (k, v) => setForm(f => ({ ...f, config: { ...f.config, [k]: v } }));

  const save = async () => {
    const envs_json = form.envs.trim() ? form.envs.split(',').map(s => s.trim()).filter(Boolean) : null;
    const body = { type: form.type, label: form.label, config_json: form.config, enabled: form.enabled ? 1 : 0, envs_json };
    if (editId) await updateNotification(editId, body);
    else await createNotification(body);
    setForm(null);
    load();
  };

  const remove = async (id) => {
    if (!window.confirm('Remove this notifier?')) return;
    await deleteNotification(id);
    load();
  };

  const toggleEnabled = async (n) => {
    await updateNotification(n.id, { type: n.type, label: n.label, config_json: n.config, enabled: n.enabled ? 0 : 1, envs_json: n.envs });
    load();
  };

  return (
    <div className="settings-tab">
      <div className="settings-tab-header">
        <h3>Notifications</h3>
        <button className="btn-primary" onClick={openAdd}>+ Add Notifier</button>
      </div>

      {notifiers.map(n => (
        <div key={n.id} className="settings-card">
          <div className="settings-card-row">
            <div>
              <span className={`settings-type-badge ${n.type}`}>{n.type}</span>
              <span className="settings-card-name">{n.label}</span>
              {n.envs && <span className="settings-card-host">envs: {n.envs.join(', ')}</span>}
            </div>
            <div className="settings-card-actions">
              <label className="toggle">
                <input type="checkbox" checked={!!n.enabled} onChange={() => toggleEnabled(n)} />
                <span>Enabled</span>
              </label>
              <button onClick={() => testNotification(n.id).then(() => alert('Test sent!')).catch(e => alert('Failed: ' + e.message))}>Test</button>
              <button onClick={() => openEdit(n)}>Edit</button>
              <button className="btn-danger" onClick={() => remove(n.id)}>Delete</button>
            </div>
          </div>
        </div>
      ))}

      {form && (
        <div className="settings-modal-overlay">
          <div className="settings-modal">
            <h3>{editId ? 'Edit Notifier' : 'Add Notifier'}</h3>
            <label>Type
              <select value={form.type} onChange={e => { setField('type', e.target.value); setField('config', e.target.value === 'email' ? { ...EMPTY_EMAIL } : { ...EMPTY_WEBHOOK }); }}>
                <option value="webhook">Webhook</option>
                <option value="email">Email</option>
              </select>
            </label>
            <label>Label <input value={form.label} onChange={e => setField('label', e.target.value)} /></label>
            <label>Environments (comma-separated, blank = all) <input value={form.envs} onChange={e => setField('envs', e.target.value)} placeholder="dev,stage,prod" /></label>
            {form.type === 'webhook' && (<>
              <label>URL <input value={form.config.url} onChange={e => setCfg('url', e.target.value)} /></label>
              <label>Authorization Header (optional) <input value={form.config.headers?.Authorization || ''} onChange={e => setCfg('headers', { Authorization: e.target.value })} /></label>
            </>)}
            {form.type === 'email' && (<>
              <label>SMTP Host <input value={form.config.host} onChange={e => setCfg('host', e.target.value)} /></label>
              <label>Port <input type="number" value={form.config.port} onChange={e => setCfg('port', Number(e.target.value))} /></label>
              <label><input type="checkbox" checked={form.config.secure} onChange={e => setCfg('secure', e.target.checked)} /> TLS (port 465)</label>
              <label>Username <input value={form.config.user} onChange={e => setCfg('user', e.target.value)} /></label>
              <label>Password <input type="password" value={form.config.pass} onChange={e => setCfg('pass', e.target.value)} /></label>
              <label>From <input value={form.config.from} onChange={e => setCfg('from', e.target.value)} /></label>
              <label>To <input value={form.config.to} onChange={e => setCfg('to', e.target.value)} /></label>
            </>)}
            <div className="settings-modal-footer">
              <button onClick={cancel}>Cancel</button>
              <button className="btn-primary" onClick={save}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Write GitLabTab.jsx**

```jsx
// frontend/src/components/settings/GitLabTab.jsx
import React, { useEffect, useState } from 'react';
import { fetchAppConfig, updateAppConfig } from '../../api';

export default function GitLabTab() {
  const [cfg, setCfg] = useState({ token: '', baseUrl: '', projects: {} });
  const [saved, setSaved] = useState(false);
  const [projectRows, setProjectRows] = useState([]);

  useEffect(() => {
    fetchAppConfig('gitlab').then(data => {
      setCfg(data);
      setProjectRows(Object.entries(data.projects || {}).map(([name, repo]) => ({ name, repo })));
    }).catch(() => {});
  }, []);

  const save = async () => {
    const projects = {};
    for (const row of projectRows) {
      if (row.name) projects[row.name] = row.repo;
    }
    await updateAppConfig('gitlab', { ...cfg, projects });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const setRow = (i, k, v) => setProjectRows(rows => {
    const r = [...rows]; r[i] = { ...r[i], [k]: v }; return r;
  });

  return (
    <div className="settings-tab">
      <h3>GitLab</h3>
      <label>Token <input type="password" value={cfg.token} onChange={e => setCfg(c => ({ ...c, token: e.target.value }))} /></label>
      <label>Base URL <input value={cfg.baseUrl} onChange={e => setCfg(c => ({ ...c, baseUrl: e.target.value }))} /></label>
      <div className="settings-section-label">Projects (name → repo path)</div>
      {projectRows.map((row, i) => (
        <div key={i} className="settings-stack-input-row">
          <input placeholder="Project name" value={row.name} onChange={e => setRow(i, 'name', e.target.value)} />
          <input placeholder="repo/path" value={row.repo} onChange={e => setRow(i, 'repo', e.target.value)} />
          <button onClick={() => setProjectRows(r => r.filter((_, idx) => idx !== i))}>✕</button>
        </div>
      ))}
      <button onClick={() => setProjectRows(r => [...r, { name: '', repo: '' }])}>+ Add Project</button>
      <div className="settings-modal-footer">
        <button className="btn-primary" onClick={save}>{saved ? 'Saved!' : 'Save'}</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Write AwsTab.jsx**

```jsx
// frontend/src/components/settings/AwsTab.jsx
import React, { useEffect, useState } from 'react';
import { fetchAppConfig, updateAppConfig } from '../../api';

export default function AwsTab() {
  const [cfg, setCfg] = useState({ region: '', groupId: '' });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetchAppConfig('awsSg').then(setCfg).catch(() => {});
  }, []);

  const save = async () => {
    await updateAppConfig('awsSg', cfg);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="settings-tab">
      <h3>AWS Security Group</h3>
      <label>Region <input value={cfg.region} onChange={e => setCfg(c => ({ ...c, region: e.target.value }))} /></label>
      <label>Security Group ID <input value={cfg.groupId} onChange={e => setCfg(c => ({ ...c, groupId: e.target.value }))} /></label>
      <div className="settings-modal-footer">
        <button className="btn-primary" onClick={save}>{saved ? 'Saved!' : 'Save'}</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/settings/
git commit -m "feat: add ServersTab, NotificationsTab, GitLabTab, AwsTab settings components"
```

---

## Task 17: Create SettingsView.jsx

**Files:**
- Create: `frontend/src/components/SettingsView.jsx`

- [ ] **Step 1: Write SettingsView.jsx**

```jsx
// frontend/src/components/SettingsView.jsx
import React, { useState } from 'react';
import ServersTab from './settings/ServersTab';
import NotificationsTab from './settings/NotificationsTab';
import GitLabTab from './settings/GitLabTab';
import AwsTab from './settings/AwsTab';

const TABS = [
  { id: 'servers', label: 'Servers', Component: ServersTab },
  { id: 'notifications', label: 'Notifications', Component: NotificationsTab },
  { id: 'gitlab', label: 'GitLab', Component: GitLabTab },
  { id: 'aws', label: 'AWS', Component: AwsTab },
];

export default function SettingsView() {
  const [activeTab, setActiveTab] = useState('servers');
  const { Component } = TABS.find(t => t.id === activeTab);

  return (
    <div className="settings-view">
      <div className="settings-view-header">
        <h2>Settings</h2>
        <div className="settings-tabs">
          {TABS.map(t => (
            <button
              key={t.id}
              className={`settings-tab-btn ${activeTab === t.id ? 'active' : ''}`}
              onClick={() => setActiveTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="settings-tab-content">
        <Component />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add CSS to index.css**

Append to `frontend/src/index.css`:

```css
/* ── Settings View ────────────────────────────────────────────────────────── */
.settings-view { padding: 24px; }
.settings-view-header { margin-bottom: 16px; }
.settings-view-header h2 { margin: 0 0 12px; font-size: 18px; }
.settings-tabs { display: flex; gap: 4px; }
.settings-tab-btn { padding: 6px 14px; border: 1px solid var(--border); background: none; color: var(--text-secondary); cursor: pointer; border-radius: 4px; font-size: 13px; }
.settings-tab-btn.active { background: var(--accent); color: var(--bg); border-color: var(--accent); }
.settings-tab-content { max-width: 800px; }
.settings-tab { display: flex; flex-direction: column; gap: 12px; }
.settings-tab h3 { margin: 0 0 4px; font-size: 15px; }
.settings-tab-header { display: flex; justify-content: space-between; align-items: center; }
.settings-tab label { display: flex; flex-direction: column; gap: 4px; font-size: 13px; color: var(--text-secondary); }
.settings-tab input, .settings-tab select, .settings-tab textarea { padding: 6px 8px; background: var(--surface); border: 1px solid var(--border); color: var(--text); border-radius: 4px; font-size: 13px; font-family: inherit; }
.settings-tab textarea { resize: vertical; }
.settings-card { background: var(--surface); border: 1px solid var(--border); border-radius: 6px; padding: 12px 16px; }
.settings-card-row { display: flex; justify-content: space-between; align-items: center; }
.settings-card-actions { display: flex; gap: 8px; align-items: center; }
.settings-card-name { font-weight: 500; margin: 0 8px; }
.settings-card-host { color: var(--text-secondary); font-size: 12px; }
.settings-env-badge { background: var(--accent); color: var(--bg); padding: 2px 6px; border-radius: 3px; font-size: 11px; font-weight: 700; }
.settings-type-badge { padding: 2px 6px; border-radius: 3px; font-size: 11px; font-weight: 700; }
.settings-type-badge.webhook { background: var(--yellow, #f0a500); color: #000; }
.settings-type-badge.email { background: var(--green); color: #000; }
.settings-stacks { margin-top: 10px; display: flex; flex-direction: column; gap: 4px; }
.settings-stack-row { display: flex; gap: 12px; font-size: 12px; color: var(--text-secondary); }
.settings-stack-row code { font-family: monospace; }
.settings-stacks-editor { display: flex; flex-direction: column; gap: 6px; }
.settings-stacks-header { display: flex; justify-content: space-between; font-size: 13px; color: var(--text-secondary); }
.settings-stack-input-row { display: flex; gap: 6px; align-items: center; }
.settings-stack-input-row input { flex: 1; }
.settings-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 100; }
.settings-modal { background: var(--bg); border: 1px solid var(--border); border-radius: 8px; padding: 24px; width: 480px; max-height: 80vh; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; }
.settings-modal h3 { margin: 0; }
.settings-modal-footer { display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px; }
.settings-section-label { font-size: 12px; color: var(--text-secondary); margin-top: 4px; }
.btn-primary { background: var(--accent); color: var(--bg); border: none; padding: 6px 14px; border-radius: 4px; cursor: pointer; font-size: 13px; }
.btn-danger { background: none; border: 1px solid var(--red); color: var(--red); padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 12px; }
.toggle { flex-direction: row; align-items: center; gap: 6px; }
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/SettingsView.jsx frontend/src/index.css
git commit -m "feat: add SettingsView with tabbed layout"
```

---

## Task 18: Wire History and Settings into AppShell and Sidebar

**Files:**
- Modify: `frontend/src/AppShell.jsx`
- Modify: `frontend/src/components/Sidebar.jsx`

- [ ] **Step 1: Update AppShell.jsx**

Add imports:
```js
import HistoryView from './components/HistoryView';
import SettingsView from './components/SettingsView';
```

After the `{activeView === 'build' && <BuildView />}` line, add:
```jsx
{activeView === 'history' && <HistoryView />}
{activeView === 'settings' && <SettingsView />}
```

- [ ] **Step 2: Update Sidebar.jsx**

In the Tools section, add two more nav buttons after the Build button:

```jsx
<button
  className={`sidebar-item ${activeView === 'history' ? 'active' : ''}`}
  onClick={() => onViewChange('history')}
>
  ≡ History
</button>
<button
  className={`sidebar-item ${activeView === 'settings' ? 'active' : ''}`}
  onClick={() => onViewChange('settings')}
>
  ⚙ Settings
</button>
```

- [ ] **Step 3: Verify in browser**

Start frontend and backend. Confirm:
- "History" nav item appears in sidebar, clicking it shows the history table
- "Settings" nav item appears, clicking it shows the tabbed settings page
- The Servers tab loads and shows existing servers from the DB
- A restart action appears in History after triggering one

- [ ] **Step 4: Commit**

```bash
git add frontend/src/AppShell.jsx frontend/src/components/Sidebar.jsx
git commit -m "feat: add History and Settings to sidebar nav and AppShell routing"
```

---

## Final Integration Check

- [ ] Run all backend tests:

```bash
cd backend
node db.test.js
node services/history.test.js
node services/notify.test.js
node services/docker.test.js
node services/compose.test.js
node config.test.js 2>/dev/null || echo "(config.test.js skipped — config.js removed)"
```

Expected: all pass except `config.test.js` (which tests the removed module — delete it or skip it).

- [ ] Delete or update the old config.test.js:

```bash
rm backend/config.test.js
git rm backend/config.test.js
git commit -m "chore: remove config.test.js (config.js replaced by db.js)"
```

- [ ] Verify full backend starts cleanly:

```bash
cd backend && node server.js
```

Expected: `Backend running on http://localhost:3001`, no errors.

- [ ] Final commit tag:

```bash
git tag v1-history-notifications-settings
```
