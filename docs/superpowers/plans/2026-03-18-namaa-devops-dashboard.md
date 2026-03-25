# Namaa DevOps Dashboard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local web dashboard that SSHes into 4 servers to manage Docker Compose stacks, stream logs, trigger builds from GitLab repos, and add new services — all from a browser.

**Architecture:** Node.js/Express backend (port 3001) handles all SSH connections, file editing, and local script execution. React frontend (port 3000) renders the UI. WebSocket handles live log streaming. The dashboard lives at the root of the `namaa-devops` repo alongside existing shell scripts.

**Tech Stack:** Node.js 18+, Express 4, ssh2, ws, js-yaml, React 18, Vite, concurrently

---

## File Map

```
namaa-devops/              ← repo root (build scripts already here)
├── package.json           ← root: runs backend + frontend concurrently
├── .gitignore             ← add: config.json, notes.json, repos/, node_modules/
├── config.example.json    ← template with placeholder values
├── backend/
│   ├── package.json
│   ├── server.js          ← Express + WebSocket entry point
│   ├── config.js          ← load + validate config.json, expose to all routes
│   ├── routes/
│   │   ├── servers.js     ← GET /api/servers/:env/containers
│   │   ├── containers.js  ← POST /api/containers/:env/:name/:action
│   │   ├── logs.js        ← WebSocket upgrade handler /ws/logs
│   │   ├── builds.js      ← POST /api/builds/:project, GET /api/builds/:project/branches
│   │   └── services.js    ← POST /api/servers/:env/stacks/:stackIdx/services
│   ├── services/
│   │   ├── ssh.js         ← connect (password + PEM), exec, readFile, writeFile, disconnect
│   │   ├── docker.js      ← parse `docker compose ps` + `docker inspect` output
│   │   ├── compose.js     ← read/write compose YAML + .env files, detect literal vs var mode
│   │   └── git.js         ← clone, fetch, checkout, listBranches (via child_process)
│   └── notes.js           ← read/write notes.json
├── frontend/
│   ├── package.json
│   ├── index.html
│   └── src/
│       ├── main.jsx
│       ├── App.jsx        ← tab routing, top bar
│       ├── api.js         ← fetch wrapper for all backend REST calls
│       └── components/
│           ├── TopBar.jsx
│           ├── ServerTab.jsx      ← status bar + stack groups
│           ├── StackGroup.jsx     ← containers grouped by stack name + Add Service button
│           ├── ContainerRow.jsx   ← single row: status, image, notes, action buttons
│           ├── BulkActionBar.jsx  ← appears when ≥1 container checked
│           ├── LogsPanel.jsx      ← full-screen WebSocket log viewer with search
│           ├── EnvPanel.jsx       ← view/add/edit env vars modal
│           ├── UpdateTagModal.jsx ← tag + notes input modal
│           ├── AddServicePanel.jsx← clone or new service form
│           └── BuildPanel.jsx     ← project selector, branch picker, per-project form
└── docs/                  ← existing
```

---

## Phase 1 — Backend Foundation

### Task 1: Project Scaffold

**Files:**
- Create: `package.json` (root)
- Create: `backend/package.json`
- Create: `frontend/package.json`
- Modify: `.gitignore`
- Create: `config.example.json`

- [ ] **Step 1: Create root package.json**

```json
{
  "name": "namaa-dashboard",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "start": "concurrently \"npm run start --prefix backend\" \"npm run dev --prefix frontend\"",
    "install:all": "npm install && npm install --prefix backend && npm install --prefix frontend"
  },
  "devDependencies": {
    "concurrently": "^8.2.0"
  }
}
```

- [ ] **Step 2: Create backend/package.json**

```json
{
  "name": "namaa-dashboard-backend",
  "version": "1.0.0",
  "private": true,
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "node --watch server.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "ssh2": "^1.15.0",
    "ws": "^8.16.0",
    "js-yaml": "^4.1.0",
    "cors": "^2.8.5"
  }
}
```

- [ ] **Step 3: Create frontend/package.json**

```json
{
  "name": "namaa-dashboard-frontend",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "vite --port 3000",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.2.1",
    "vite": "^5.1.0"
  }
}
```

- [ ] **Step 4: Update .gitignore**

Add to existing `.gitignore` (create if missing):
```
node_modules/
config.json
notes.json
repos/
frontend/dist/
```

- [ ] **Step 5: Create config.example.json**

```json
{
  "awsSg": {
    "description": "yourname"
  },
  "gitlab": {
    "token": "glpat-YOUR_TOKEN_HERE"
  },
  "projects": {
    "frontend": {
      "name": "Namaa Frontend",
      "repo": "https://gitlab.namaa-ops.space/iot_smartcities/namaa-coreui.git",
      "buildScript": "frontend-build.sh"
    },
    "backend": {
      "name": "Irrigation Backend",
      "repo": "https://gitlab.namaa-ops.space/iot_smartcities/irrigation_backend.git",
      "buildScript": "backend-build.sh"
    },
    "geoserver": {
      "name": "Geoserver",
      "repo": "https://gitlab.namaa-ops.space/iot_smartcities/namaa-geoserver.git",
      "buildScript": "geoserver-build.sh"
    },
    "adminPanel": {
      "name": "Admin Panel",
      "repo": "https://gitlab.namaa-ops.space/iot_smartcities/namaa-admin-panel.git",
      "buildScript": "admin-panel-build.sh"
    }
  },
  "servers": {
    "dev": {
      "host": "10.0.20.156",
      "ssh": { "username": "user", "password": "pass" },
      "composeStacks": [
        { "name": "Main", "path": "/path/to/docker-compose.yml" }
      ]
    },
    "test": {
      "host": "10.0.30.27",
      "ssh": { "username": "user", "password": "pass" },
      "composeStacks": [
        { "name": "Main", "path": "/path/to/docker-compose.yml" }
      ]
    },
    "stage": {
      "host": "52.215.139.121",
      "ssh": { "username": "ec2-user", "privateKeyPath": "/path/to/key.pem", "passphrase": "" },
      "composeStacks": [
        { "name": "Main", "path": "/home/ec2-user/letsencrypt-docker-compose/docker-compose.yml" }
      ]
    },
    "prod": {
      "host": "34.254.42.170",
      "ssh": { "username": "ec2-user", "privateKeyPath": "/path/to/key.pem", "passphrase": "" },
      "composeStacks": [
        { "name": "Main", "path": "/home/ec2-user/letsencrypt-docker-compose/docker-compose.yml" },
        { "name": "Admin Panel", "path": "/home/ec2-user/namaa-admin-panel/docker-compose.prod.yml" }
      ]
    }
  }
}
```

- [ ] **Step 6: Install dependencies**

```bash
cd namaa-devops
npm run install:all
```

Expected: all packages install without errors.

- [ ] **Step 7: Commit**

```bash
git add package.json backend/package.json frontend/package.json .gitignore config.example.json
git commit -m "feat: scaffold namaa dashboard project structure"
```

---

### Task 2: Config Loader

**Files:**
- Create: `backend/config.js`

- [ ] **Step 1: Write test**

Create `backend/config.test.js`:
```js
const path = require('path');
process.env.CONFIG_PATH = path.join(__dirname, 'fixtures/config.test.json');

// Create backend/fixtures/config.test.json with valid minimal config first:
// { "awsSg": {"description":"test"}, "gitlab":{"token":"tok"}, "projects":{}, "servers":{} }

const { loadConfig } = require('./config');

const cfg = loadConfig();
console.assert(cfg.awsSg.description === 'test', 'awsSg.description should load');
console.assert(cfg.gitlab.token === 'tok', 'gitlab.token should load');
console.log('config tests passed');
```

- [ ] **Step 2: Run test — expect failure**

```bash
cd backend && node config.test.js
```
Expected: error (config.js not found)

- [ ] **Step 3: Implement config.js**

```js
const fs = require('fs');
const path = require('path');

const CONFIG_PATH = process.env.CONFIG_PATH || path.join(__dirname, '..', 'config.json');

let _config = null;

function loadConfig() {
  if (_config) return _config;
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error(`config.json not found at ${CONFIG_PATH}`);
    console.error('Copy config.example.json to config.json and fill in your values.');
    process.exit(1);
  }
  _config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  validateConfig(_config);
  return _config;
}

function validateConfig(cfg) {
  const required = ['awsSg', 'gitlab', 'projects', 'servers'];
  for (const key of required) {
    if (!cfg[key]) throw new Error(`config.json missing required key: ${key}`);
  }
  for (const [env, server] of Object.entries(cfg.servers)) {
    if (!server.host) throw new Error(`servers.${env} missing host`);
    if (!server.ssh) throw new Error(`servers.${env} missing ssh`);
    if (!server.composeStacks?.length) throw new Error(`servers.${env} missing composeStacks`);
  }
}

module.exports = { loadConfig };
```

- [ ] **Step 4: Create fixture and run test**

```bash
mkdir -p backend/fixtures
echo '{"awsSg":{"description":"test"},"gitlab":{"token":"tok"},"projects":{},"servers":{}}' > backend/fixtures/config.test.json
node backend/config.test.js
```
Expected: `config tests passed`

- [ ] **Step 5: Commit**

```bash
git add backend/config.js backend/config.test.js backend/fixtures/
git commit -m "feat: config loader with validation"
```

---

### Task 3: SSH Service

**Files:**
- Create: `backend/services/ssh.js`

- [ ] **Step 1: Implement ssh.js**

```js
const { Client } = require('ssh2');
const fs = require('fs');

// One connection per environment, reused across requests
const connections = {};

function buildConnectConfig(sshCfg) {
  const cfg = {
    host: sshCfg.host,
    port: 22,
    username: sshCfg.username,
    readyTimeout: 10000,
  };
  if (sshCfg.privateKeyPath) {
    cfg.privateKey = fs.readFileSync(sshCfg.privateKeyPath);
    const passphrase = sshCfg.passphrase;
    if (passphrase) cfg.passphrase = passphrase;
    // if empty string or absent, do NOT set passphrase (ssh2 needs undefined for unencrypted keys)
  } else {
    cfg.password = sshCfg.password;
  }
  return cfg;
}

function connect(env, serverCfg) {
  return new Promise((resolve, reject) => {
    if (connections[env]?.connected) {
      return resolve(connections[env]);
    }
    const conn = new Client();
    conn.on('ready', () => {
      conn.connected = true;
      connections[env] = conn;
      resolve(conn);
    });
    conn.on('error', (err) => reject(err));
    conn.on('close', () => {
      conn.connected = false;
      delete connections[env];
    });
    conn.connect(buildConnectConfig({
      host: serverCfg.host,
      ...serverCfg.ssh,
    }));
  });
}

function exec(conn, command) {
  return new Promise((resolve, reject) => {
    conn.exec(command, (err, stream) => {
      if (err) return reject(err);
      let stdout = '';
      let stderr = '';
      stream.on('data', (d) => stdout += d);
      stream.stderr.on('data', (d) => stderr += d);
      stream.on('close', (code) => {
        if (code !== 0) return reject(new Error(`Command failed (exit ${code}): ${stderr || stdout}`));
        resolve(stdout);
      });
    });
  });
}

function execStream(conn, command, onData, onClose) {
  conn.exec(command, (err, stream) => {
    if (err) return onClose(err);
    stream.on('data', (d) => onData(d.toString()));
    stream.stderr.on('data', (d) => onData(d.toString()));
    stream.on('close', () => onClose(null));
    return stream; // caller can kill by destroying
  });
}

async function readFile(conn, remotePath) {
  return exec(conn, `cat "${remotePath}"`);
}

async function writeFile(conn, remotePath, content) {
  // Write via base64 to avoid any shell quoting issues with special characters
  const b64 = Buffer.from(content).toString('base64');
  await exec(conn, `echo '${b64}' | base64 -d > "${remotePath}"`);
}

function disconnect(env) {
  if (connections[env]) {
    connections[env].end();
    delete connections[env];
  }
}

module.exports = { connect, exec, execStream, readFile, writeFile, disconnect };
```

- [ ] **Step 2: Commit**

```bash
git add backend/services/ssh.js
git commit -m "feat: SSH service with connection pooling and stream support"
```

---

### Task 4: Docker Output Parser

**Files:**
- Create: `backend/services/docker.js`
- Create: `backend/fixtures/docker-ps.json` (test fixture)
- Create: `backend/fixtures/docker-inspect.json` (test fixture)

- [ ] **Step 1: Write tests**

Create `backend/services/docker.test.js`:
```js
const { parseComposePs, parseInspect } = require('./docker');

// Test parseComposePs
const psOutput = JSON.stringify({ Name: 'frontend', State: 'running', Image: 'namaa-frontend:test-r15-s1' })
  + '\n'
  + JSON.stringify({ Name: 'backend', State: 'exited', Image: 'namaa-web-apis:test-r15-s1' });

const containers = parseComposePs(psOutput);
console.assert(containers.length === 2, 'should parse 2 containers');
console.assert(containers[0].name === 'frontend', 'first container name');
console.assert(containers[0].status === 'running', 'first container status');
console.assert(containers[1].status === 'stopped', 'exited maps to stopped');

// Test parseInspect
const inspectOutput = JSON.stringify([{
  Config: {
    Image: 'namaa-frontend:test-r15-s1',
    Labels: { 'com.namaa.dashboard.managed': 'true' },
    Env: ['API_URL=http://10.0.30.27:4001/irrigation', 'TZ=Africa/Cairo']
  },
  State: { Status: 'running' }
}]);

const info = parseInspect(inspectOutput);
console.assert(info.managed === true, 'managed label should be true');
console.assert(info.env.API_URL === 'http://10.0.30.27:4001/irrigation', 'env should parse');
console.assert(info.image === 'namaa-frontend:test-r15-s1', 'image should parse');

console.log('docker parser tests passed');
```

- [ ] **Step 2: Run — expect failure**

```bash
node backend/services/docker.test.js
```
Expected: error (docker.js not found)

- [ ] **Step 3: Implement docker.js**

```js
function parseComposePs(output) {
  // docker compose ps --format json outputs NDJSON (one JSON object per line)
  // but some versions output a JSON array — handle both
  output = output.trim();
  if (!output) return [];

  let items;
  if (output.startsWith('[')) {
    items = JSON.parse(output);
  } else {
    items = output.split('\n').filter(Boolean).map(line => JSON.parse(line));
  }

  return items.map(item => ({
    name: item.Name || item.Service,
    status: (item.State || item.Status || '').toLowerCase().includes('running') ? 'running' : 'stopped',
    image: item.Image || '',
  }));
}

function parseInspect(output) {
  const data = JSON.parse(output);
  const item = Array.isArray(data) ? data[0] : data;
  const labels = item.Config?.Labels || {};
  const envArr = item.Config?.Env || [];

  const env = {};
  for (const e of envArr) {
    const idx = e.indexOf('=');
    if (idx > -1) env[e.slice(0, idx)] = e.slice(idx + 1);
  }

  return {
    image: item.Config?.Image || '',
    managed: labels['com.namaa.dashboard.managed'] === 'true',
    env,
    status: (item.State?.Status || '').toLowerCase().includes('running') ? 'running' : 'stopped',
    labels,
  };
}

module.exports = { parseComposePs, parseInspect };
```

- [ ] **Step 4: Run tests**

```bash
node backend/services/docker.test.js
```
Expected: `docker parser tests passed`

- [ ] **Step 5: Commit**

```bash
git add backend/services/docker.js backend/services/docker.test.js
git commit -m "feat: docker compose ps + inspect output parsers"
```

---

### Task 5: Compose File Editor

**Files:**
- Create: `backend/services/compose.js`

- [ ] **Step 1: Write tests**

Create `backend/services/compose.test.js`:
```js
const { detectMode, extractVarName, buildServiceBlock } = require('./compose');

// detectMode: literal image
console.assert(detectMode('10.0.20.156:5000/namaa-frontend:test-r15') === 'compose', 'literal → compose mode');

// detectMode: variable image
console.assert(detectMode('${DOCKER_REGISTRY}/namaa-frontend:${IMAGE_TAG}') === 'env', 'variable → env mode');
console.assert(detectMode('myrepo/name:${TAG}') === 'env', 'partial variable → env mode');

// extractVarName: gets the tag variable name from image line
console.assert(extractVarName('${DOCKER_REGISTRY}/name:${IMAGE_TAG}') === 'IMAGE_TAG', 'extracts last var');
console.assert(extractVarName('repo/name:${TAG}') === 'TAG', 'extracts TAG');

// buildServiceBlock: creates valid YAML for a new service
const block = buildServiceBlock({
  name: 'frontend-client2',
  image: '10.0.20.156:5000/namaa-frontend:test-r15',
  ports: ['3001:80'],
  environment: { API_URL: 'http://10.0.30.27:4002/irrigation', TZ: 'Africa/Cairo' },
  restart: 'always',
});
console.assert(block.includes('frontend-client2:'), 'block has service name');
console.assert(block.includes('com.namaa.dashboard.managed: "true"'), 'managed label auto-added');
console.assert(block.includes('3001:80'), 'port included');

console.log('compose tests passed');
```

- [ ] **Step 2: Run — expect failure**

```bash
node backend/services/compose.test.js
```

- [ ] **Step 3: Implement compose.js**

```js
const yaml = require('js-yaml');

function detectMode(imageLine) {
  return /\$\{[^}]+\}/.test(imageLine) ? 'env' : 'compose';
}

function extractVarName(imageLine) {
  // Extract all ${VAR} references, return the last one (typically the tag variable)
  const matches = [...imageLine.matchAll(/\$\{([^}]+)\}/g)];
  if (!matches.length) return null;
  return matches[matches.length - 1][1];
}

function parseEnvFile(content) {
  const vars = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx > -1) vars[trimmed.slice(0, idx)] = trimmed.slice(idx + 1);
  }
  return vars;
}

function stringifyEnvFile(vars) {
  return Object.entries(vars).map(([k, v]) => `${k}=${v}`).join('\n') + '\n';
}

function updateImageInCompose(composeContent, serviceName, newTag) {
  // Replace the tag in the image line for the given service
  // Works for literal image lines: replaces everything after the last colon
  const doc = yaml.load(composeContent);
  const service = doc.services?.[serviceName];
  if (!service) throw new Error(`Service ${serviceName} not found in compose file`);

  const currentImage = service.image;
  const colonIdx = currentImage.lastIndexOf(':');
  if (colonIdx === -1) throw new Error(`Cannot parse image line: ${currentImage}`);
  service.image = currentImage.slice(0, colonIdx + 1) + newTag;
  return yaml.dump(doc, { lineWidth: -1 });
}

function updateEnvVar(envContent, varName, newValue) {
  const vars = parseEnvFile(envContent);
  vars[varName] = newValue;
  return stringifyEnvFile(vars);
}

function addEnvVarToCompose(composeContent, serviceName, key, value) {
  const doc = yaml.load(composeContent);
  const service = doc.services?.[serviceName];
  if (!service) throw new Error(`Service ${serviceName} not found`);
  if (!service.environment) service.environment = [];
  if (Array.isArray(service.environment)) {
    // Remove existing entry if present
    service.environment = service.environment.filter(e => !e.startsWith(`${key}=`));
    service.environment.push(`${key}=${value}`);
  } else {
    service.environment[key] = value;
  }
  return yaml.dump(doc, { lineWidth: -1 });
}

function appendService(composeContent, serviceDef) {
  const doc = yaml.load(composeContent);
  if (!doc.services) doc.services = {};
  doc.services[serviceDef.name] = buildServiceObject(serviceDef);
  return yaml.dump(doc, { lineWidth: -1 });
}

function buildServiceObject(def) {
  const svc = {
    container_name: def.name,
    image: def.image,
    restart: def.restart || 'always',
    labels: { 'com.namaa.dashboard.managed': 'true' },
  };
  if (def.ports?.length) svc.ports = def.ports;
  if (def.environment && Object.keys(def.environment).length) {
    svc.environment = Object.entries(def.environment).map(([k, v]) => `${k}=${v}`);
  }
  return svc;
}

function buildServiceBlock(def) {
  const obj = { [def.name]: buildServiceObject(def) };
  // Wrap in a services key for the test assertion check
  const doc = { services: obj };
  return yaml.dump(doc, { lineWidth: -1 });
}

module.exports = {
  detectMode,
  extractVarName,
  parseEnvFile,
  stringifyEnvFile,
  updateImageInCompose,
  updateEnvVar,
  addEnvVarToCompose,
  appendService,
  buildServiceBlock,
};
```

- [ ] **Step 4: Run tests**

```bash
node backend/services/compose.test.js
```
Expected: `compose tests passed`

- [ ] **Step 5: Commit**

```bash
git add backend/services/compose.js backend/services/compose.test.js
git commit -m "feat: compose file and .env file editor with literal/variable detection"
```

---

### Task 6: Notes Store

**Files:**
- Create: `backend/notes.js`

- [ ] **Step 1: Implement notes.js**

```js
const fs = require('fs');
const path = require('path');

const NOTES_PATH = path.join(__dirname, '..', 'notes.json');

function readNotes() {
  if (!fs.existsSync(NOTES_PATH)) return {};
  return JSON.parse(fs.readFileSync(NOTES_PATH, 'utf8'));
}

function getNote(env, containerName) {
  return readNotes()[`${env}:${containerName}`] || '';
}

function setNote(env, containerName, text) {
  const notes = readNotes();
  notes[`${env}:${containerName}`] = text;
  fs.writeFileSync(NOTES_PATH, JSON.stringify(notes, null, 2));
}

module.exports = { getNote, setNote, readNotes };
```

- [ ] **Step 2: Commit**

```bash
git add backend/notes.js
git commit -m "feat: notes store for per-container deployment notes"
```

---

### Task 7: Express Server Entry Point

**Files:**
- Create: `backend/server.js`

- [ ] **Step 1: Implement server.js**

```js
const express = require('express');
const cors = require('cors');
const http = require('http');
const { loadConfig } = require('./config');

// Load config early — exits if missing
loadConfig();

const app = express();
app.use(cors({ origin: 'http://localhost:3000' }));
app.use(express.json());

// Routes
app.use('/api/servers', require('./routes/servers'));
app.use('/api/containers', require('./routes/containers'));
app.use('/api/builds', require('./routes/builds'));
app.use('/api/services', require('./routes/services'));

// Health check
app.get('/api/health', (req, res) => res.json({ ok: true }));

const server = http.createServer(app);

// WebSocket for logs — mounted on same HTTP server
require('./routes/logs')(server);

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Backend running on http://localhost:${PORT}`));
```

- [ ] **Step 2: Create stub route files so server starts**

Create `backend/routes/servers.js`:
```js
const router = require('express').Router();
module.exports = router;
```

Create identical stubs for `containers.js`, `builds.js`, and `services.js`.

Create `backend/routes/logs.js`:
```js
module.exports = function attachLogs(server) {};
```

- [ ] **Step 3: Copy your config.json from config.example.json and fill in real values**

```bash
cp config.example.json config.json
# Edit config.json with real credentials
```

- [ ] **Step 4: Start backend, verify health**

```bash
cd backend && node server.js
# In another terminal:
curl http://localhost:3001/api/health
```
Expected: `{"ok":true}`

- [ ] **Step 5: Commit**

```bash
git add backend/server.js backend/routes/
git commit -m "feat: express server with stub routes and WebSocket placeholder"
```

---

## Phase 2 — Server State API

### Task 8: Server State Endpoint

**Files:**
- Modify: `backend/routes/servers.js`

- [ ] **Step 1: Implement GET /api/servers/:env/containers**

```js
const router = require('express').Router();
const { loadConfig } = require('../config');
const { connect, exec, readFile } = require('../services/ssh');
const { parseComposePs, parseInspect } = require('../services/docker');
const { getNote } = require('../notes');

router.get('/:env/containers', async (req, res) => {
  const { env } = req.params;
  const config = loadConfig();
  const serverCfg = config.servers[env];
  if (!serverCfg) return res.status(404).json({ error: `Unknown environment: ${env}` });

  try {
    const conn = await connect(env, serverCfg);
    const stacks = [];

    for (const stack of serverCfg.composeStacks) {
      // Get container list from compose
      const psOutput = await exec(conn, `docker compose -f "${stack.path}" ps --format json`);
      const containers = parseComposePs(psOutput);

      // Inspect each container for labels + env
      const enriched = await Promise.all(containers.map(async (c) => {
        try {
          const inspectOutput = await exec(conn, `docker inspect ${c.name}`);
          const info = parseInspect(inspectOutput);
          return {
            ...c,
            ...info,
            note: getNote(env, c.name),
            stackPath: stack.path,
            stackName: stack.name,
          };
        } catch {
          return { ...c, managed: false, env: {}, note: '', stackPath: stack.path, stackName: stack.name };
        }
      }));

      stacks.push({ name: stack.name, path: stack.path, containers: enriched });
    }

    res.json({ env, stacks });
  } catch (err) {
    res.status(503).json({ error: err.message });
  }
});

module.exports = router;
```

- [ ] **Step 2: Test manually**

```bash
curl http://localhost:3001/api/servers/dev/containers | jq .
```
Expected: JSON with stacks array containing containers with managed flag, image, status.

- [ ] **Step 3: Commit**

```bash
git add backend/routes/servers.js
git commit -m "feat: server state endpoint — reads docker compose ps + inspect per stack"
```

---

## Phase 3 — Container Action API

### Task 9: Container Actions

**Files:**
- Modify: `backend/routes/containers.js`

- [ ] **Step 1: Implement container actions endpoint**

```js
const router = require('express').Router();
const { loadConfig } = require('../config');
const { connect, exec, readFile, writeFile } = require('../services/ssh');
const { detectMode, extractVarName, updateImageInCompose, updateEnvVar, addEnvVarToCompose } = require('../services/compose');
const { setNote } = require('../notes');
const path = require('path');

function getStackPath(serverCfg, stackPath) {
  return serverCfg.composeStacks.find(s => s.path === stackPath)?.path || stackPath;
}

router.post('/:env/:containerName/restart', async (req, res) => {
  const { env, containerName } = req.params;
  const { stackPath, serviceName } = req.body;
  const config = loadConfig();
  try {
    const conn = await connect(env, config.servers[env]);
    await exec(conn, `docker compose -f "${stackPath}" restart ${serviceName}`);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:env/:containerName/up', async (req, res) => {
  const { env, containerName } = req.params;
  const { stackPath, serviceName, forceRecreate } = req.body;
  const config = loadConfig();
  try {
    const conn = await connect(env, config.servers[env]);
    const flag = forceRecreate ? '--force-recreate' : '';
    await exec(conn, `docker compose -f "${stackPath}" up -d ${flag} ${serviceName}`);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:env/:containerName/update-tag', async (req, res) => {
  const { env, containerName } = req.params;
  const { stackPath, serviceName, newTag, note } = req.body;
  const config = loadConfig();
  try {
    const conn = await connect(env, config.servers[env]);
    const composeContent = await readFile(conn, stackPath);
    const composeDoc = require('js-yaml').load(composeContent);
    const imageLine = composeDoc.services?.[serviceName]?.image || '';
    const mode = detectMode(imageLine);

    if (mode === 'env') {
      const varName = extractVarName(imageLine);
      const envPath = path.join(path.dirname(stackPath), '.env');
      const envContent = await readFile(conn, envPath).catch(() => '');
      const updated = updateEnvVar(envContent, varName, newTag);
      await writeFile(conn, envPath, updated);
    } else {
      const updated = updateImageInCompose(composeContent, serviceName, newTag);
      await writeFile(conn, stackPath, updated);
    }

    await exec(conn, `docker compose -f "${stackPath}" up -d ${serviceName}`);
    if (note !== undefined) setNote(env, containerName, note);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:env/:containerName/update-env', async (req, res) => {
  const { env, containerName } = req.params;
  const { stackPath, serviceName, key, value } = req.body;
  const config = loadConfig();
  try {
    const conn = await connect(env, config.servers[env]);
    const composeContent = await readFile(conn, stackPath);
    const composeDoc = require('js-yaml').load(composeContent);
    const service = composeDoc.services?.[serviceName];
    const envEntry = Array.isArray(service?.environment)
      ? service.environment.find(e => e.startsWith(`${key}=`))
      : service?.environment?.[key];

    if (envEntry && typeof envEntry === 'string' && envEntry.includes('${')) {
      // env-file mode
      const envPath = path.join(path.dirname(stackPath), '.env');
      const envContent = await readFile(conn, envPath).catch(() => '');
      const updated = updateEnvVar(envContent, key, value);
      await writeFile(conn, envPath, updated);
    } else {
      const updated = addEnvVarToCompose(composeContent, serviceName, key, value);
      await writeFile(conn, stackPath, updated);
    }

    await exec(conn, `docker compose -f "${stackPath}" up -d ${serviceName}`);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:env/:containerName/note', async (req, res) => {
  const { env, containerName } = req.params;
  const { note } = req.body;
  setNote(env, containerName, note);
  res.json({ ok: true });
});

module.exports = router;
```

- [ ] **Step 2: Commit**

```bash
git add backend/routes/containers.js
git commit -m "feat: container action endpoints — restart, up, force-recreate, update-tag, update-env"
```

---

### Task 10: Live Log Streaming (WebSocket)

**Files:**
- Modify: `backend/routes/logs.js`

- [ ] **Step 1: Implement WebSocket log handler**

```js
const { WebSocketServer } = require('ws');
const { loadConfig } = require('../config');
const { connect } = require('../services/ssh');

module.exports = function attachLogs(httpServer) {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws/logs' });

  wss.on('connection', async (ws, req) => {
    // Parse query params: ?env=prod&container=frontend
    const url = new URL(req.url, 'http://localhost');
    const env = url.searchParams.get('env');
    const container = url.searchParams.get('container');

    if (!env || !container) {
      ws.send(JSON.stringify({ type: 'error', message: 'env and container required' }));
      return ws.close();
    }

    const config = loadConfig();
    const serverCfg = config.servers[env];
    if (!serverCfg) {
      ws.send(JSON.stringify({ type: 'error', message: `Unknown env: ${env}` }));
      return ws.close();
    }

    let stream;
    try {
      const conn = await connect(env, serverCfg);
      conn.exec(`docker logs --tail=200 -f ${container}`, (err, s) => {
        if (err) {
          ws.send(JSON.stringify({ type: 'error', message: err.message }));
          return ws.close();
        }
        stream = s;
        s.on('data', (d) => {
          if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'line', text: d.toString() }));
        });
        s.stderr.on('data', (d) => {
          if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'line', text: d.toString() }));
        });
        s.on('close', () => {
          if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'closed' }));
        });
      });
    } catch (err) {
      ws.send(JSON.stringify({ type: 'error', message: err.message }));
      return ws.close();
    }

    ws.on('close', () => {
      try { stream?.destroy?.(); } catch {}
    });
  });
};
```

- [ ] **Step 2: Test manually**

In browser console or wscat:
```
wscat -c "ws://localhost:3001/ws/logs?env=dev&container=frontend"
```
Expected: stream of log lines as JSON `{"type":"line","text":"..."}`.

- [ ] **Step 3: Commit**

```bash
git add backend/routes/logs.js
git commit -m "feat: WebSocket live log streaming via docker logs -f"
```

---

### Task 11: AWS SG Whitelist Endpoint

**Files:**
- Modify: `backend/routes/containers.js` or Create: `backend/routes/awssg.js`

- [ ] **Step 1: Add AWS SG endpoint to server.js and implement**

Create `backend/routes/awssg.js`:
```js
const router = require('express').Router();
const { spawn } = require('child_process');
const path = require('path');
const { loadConfig } = require('../config');

// POST /api/awssg/whitelist  body: { env: 'stage'|'prod' }
// Streams output via SSE
router.post('/whitelist', (req, res) => {
  const { env } = req.body;
  if (!['stage', 'prod'].includes(env)) {
    return res.status(400).json({ error: 'env must be stage or prod' });
  }

  const config = loadConfig();
  const description = config.awsSg.description;
  const scriptPath = path.join(__dirname, '..', '..', 'aws-sg.sh');

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Transfer-Encoding', 'chunked');

  const proc = spawn('bash', [scriptPath, '-d', description, '-e', env], {
    cwd: path.join(__dirname, '..', '..'),
  });

  proc.stdout.on('data', (d) => res.write(d));
  proc.stderr.on('data', (d) => res.write(d));
  proc.on('close', (code) => {
    res.write(`\n__EXIT_CODE__${code}`);
    res.end();
  });
});

module.exports = router;
```

- [ ] **Step 2: Add awssg route to server.js**

Open `backend/server.js` and add after the other `app.use` lines:
```js
app.use('/api/awssg', require('./routes/awssg'));
```

- [ ] **Step 2: Commit**

```bash
git add backend/routes/awssg.js backend/server.js
git commit -m "feat: AWS SG whitelist endpoint with streamed output"
```

---

### Task 12: Add Service Endpoint

**Files:**
- Modify: `backend/routes/services.js`

- [ ] **Step 1: Implement add service endpoint**

```js
const router = require('express').Router();
const { loadConfig } = require('../config');
const { connect, exec, readFile, writeFile } = require('../services/ssh');
const { appendService } = require('../services/compose');

// POST /api/services/:env/:stackIdx
// body: { name, image, ports, environment, restart }
router.post('/:env/:stackIdx', async (req, res) => {
  const { env, stackIdx } = req.params;
  const config = loadConfig();
  const serverCfg = config.servers[env];
  if (!serverCfg) return res.status(404).json({ error: `Unknown env: ${env}` });

  const stack = serverCfg.composeStacks[parseInt(stackIdx)];
  if (!stack) return res.status(404).json({ error: 'Stack not found' });

  const { name, image, ports, environment, restart } = req.body;
  if (!name || !image) return res.status(400).json({ error: 'name and image required' });

  try {
    const conn = await connect(env, serverCfg);
    const composeContent = await readFile(conn, stack.path);
    const updated = appendService(composeContent, { name, image, ports, environment, restart });
    await writeFile(conn, stack.path, updated);
    await exec(conn, `docker compose -f "${stack.path}" up -d ${name}`);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
```

- [ ] **Step 2: Commit**

```bash
git add backend/routes/services.js
git commit -m "feat: add service endpoint — appends to compose file and starts container"
```

---

### Task 13: Git Service + Build Endpoint

**Files:**
- Create: `backend/services/git.js`
- Modify: `backend/routes/builds.js`

- [ ] **Step 1: Implement git.js**

```js
const { execSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const REPOS_DIR = path.join(__dirname, '..', '..', 'repos');

function repoDir(projectKey) {
  return path.join(REPOS_DIR, projectKey);
}

function buildAuthUrl(repoUrl, token) {
  // Insert oauth2:token@ after https://
  return repoUrl.replace('https://', `https://oauth2:${token}@`);
}

async function ensureCloned(projectKey, repoUrl, token) {
  const dir = repoDir(projectKey);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(REPOS_DIR, { recursive: true });
    const authUrl = buildAuthUrl(repoUrl, token);
    execSync(`git clone "${authUrl}" "${dir}"`, { stdio: 'inherit' });
  }
}

function listBranches(projectKey) {
  const dir = repoDir(projectKey);
  execSync('git fetch --all --prune', { cwd: dir, stdio: 'pipe' });
  const output = execSync('git branch -r --format="%(refname:short)"', { cwd: dir }).toString();
  return output.trim().split('\n')
    .map(b => b.trim().replace(/^origin\//, ''))
    .filter(b => b && b !== 'HEAD');
}

function checkoutAndPull(projectKey, branch) {
  const dir = repoDir(projectKey);
  // Use -B to create/reset local branch tracking origin/<branch>, avoids detached HEAD
  execSync(`git checkout -B ${branch} origin/${branch}`, { cwd: dir, stdio: 'pipe' });
}

function spawnBuild(projectKey, scriptName, args, onData, onClose) {
  const dir = repoDir(projectKey);
  const scriptPath = path.join(__dirname, '..', '..', scriptName);
  const proc = spawn('bash', [scriptPath, ...args], { cwd: dir });
  proc.stdout.on('data', (d) => onData(d.toString()));
  proc.stderr.on('data', (d) => onData(d.toString()));
  proc.on('close', onClose);
  return proc;
}

module.exports = { ensureCloned, listBranches, checkoutAndPull, spawnBuild, repoDir };
```

- [ ] **Step 2: Implement builds.js**

```js
const router = require('express').Router();
const { loadConfig } = require('../config');
const { ensureCloned, listBranches, checkoutAndPull, spawnBuild } = require('../services/git');

// GET /api/builds/:project/branches
router.get('/:project/branches', async (req, res) => {
  const { project } = req.params;
  const config = loadConfig();
  const proj = config.projects[project];
  if (!proj) return res.status(404).json({ error: 'Project not found' });

  try {
    await ensureCloned(project, proj.repo, config.gitlab.token);
    const branches = listBranches(project);
    res.json({ branches });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/builds/:project — body: { branch, args: [...] }
// Streams output as plain text (SSE-like chunked)
router.post('/:project', async (req, res) => {
  const { project } = req.params;
  const { branch, args = [] } = req.body;
  const config = loadConfig();
  const proj = config.projects[project];
  if (!proj) return res.status(404).json({ error: 'Project not found' });

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Transfer-Encoding', 'chunked');

  try {
    await ensureCloned(project, proj.repo, config.gitlab.token);
    res.write(`Checking out ${branch}...\n`);
    checkoutAndPull(project, branch);
    res.write(`Running ${proj.buildScript}...\n`);
    spawnBuild(project, proj.buildScript, args,
      (data) => res.write(data),
      (code) => {
        res.write(`\n__EXIT_CODE__${code}`);
        res.end();
      }
    );
  } catch (err) {
    res.write(`ERROR: ${err.message}\n__EXIT_CODE__1`);
    res.end();
  }
});

module.exports = router;
```

- [ ] **Step 3: Commit**

```bash
git add backend/services/git.js backend/routes/builds.js
git commit -m "feat: git service + build endpoint with branch checkout and streamed output"
```

---

## Phase 4 — React Frontend

### Task 14: Frontend Scaffold + Dark Theme

**Files:**
- Create: `frontend/index.html`
- Create: `frontend/vite.config.js`
- Create: `frontend/src/main.jsx`
- Create: `frontend/src/App.jsx`
- Create: `frontend/src/index.css`
- Create: `frontend/src/api.js`

- [ ] **Step 1: Create vite.config.js**

```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': 'http://localhost:3001',
      '/ws': { target: 'ws://localhost:3001', ws: true },
    },
  },
});
```

- [ ] **Step 2: Create index.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Namaa DevOps</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.jsx"></script>
</body>
</html>
```

- [ ] **Step 3: Create index.css (dark theme variables)**

```css
:root {
  --bg: #0f1117;
  --bg-card: #161b27;
  --bg-input: #1a1f2e;
  --border: #2a2f3d;
  --border-managed: #2a3d2a;
  --text: #e2e8f0;
  --text-muted: #888;
  --green: #4ade80;
  --red: #f87171;
  --blue: #7eb3ff;
  --yellow: #fbbf24;
  --orange: #fb923c;
  --purple: #c084fc;
  --indigo: #a5b4fc;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body { background: var(--bg); color: var(--text); font-family: monospace; font-size: 13px; }
button { cursor: pointer; font-family: monospace; font-size: 11px; border-radius: 3px; }
input, select, textarea { font-family: monospace; background: var(--bg-input); color: var(--text); border: 1px solid var(--border); border-radius: 3px; padding: 4px 8px; }
```

- [ ] **Step 4: Create api.js**

```js
const BASE = '/api';

export async function fetchContainers(env) {
  const r = await fetch(`${BASE}/servers/${env}/containers`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function containerAction(env, containerName, action, body) {
  const r = await fetch(`${BASE}/containers/${env}/${containerName}/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function fetchBranches(project) {
  const r = await fetch(`${BASE}/builds/${project}/branches`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function saveNote(env, containerName, note) {
  return containerAction(env, containerName, 'note', { note });
}

export async function addService(env, stackIdx, body) {
  const r = await fetch(`${BASE}/services/${env}/${stackIdx}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

// Streams build output — calls onChunk(text) repeatedly, onDone(exitCode)
export async function startBuild(project, branch, args, onChunk, onDone) {
  const r = await fetch(`${BASE}/builds/${project}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ branch, args }),
  });
  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const exitMatch = buffer.match(/__EXIT_CODE__(\d+)/);
    if (exitMatch) {
      onChunk(buffer.replace(/__EXIT_CODE__\d+/, ''));
      onDone(parseInt(exitMatch[1]));
      return;
    }
    onChunk(buffer);
    buffer = '';
  }
}

// Streams whitelist output
export async function whitelistIp(env, onChunk, onDone) {
  const r = await fetch(`${BASE}/awssg/whitelist`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ env }),
  });
  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const exitMatch = buffer.match(/__EXIT_CODE__(\d+)/);
    if (exitMatch) {
      onChunk(buffer.replace(/__EXIT_CODE__\d+/, ''));
      onDone(parseInt(exitMatch[1]));
      return;
    }
    onChunk(buffer);
    buffer = '';
  }
}
```

- [ ] **Step 5: Create main.jsx**

```jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
```

- [ ] **Step 6: Create App.jsx skeleton**

```jsx
import React, { useState } from 'react';
import TopBar from './components/TopBar';
import ServerTab from './components/ServerTab';

const ENVS = ['dev', 'test', 'stage', 'prod'];

export default function App() {
  const [activeEnv, setActiveEnv] = useState('dev');
  const [buildPanelOpen, setBuildPanelOpen] = useState(false);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <TopBar onBuild={() => setBuildPanelOpen(true)} />
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: '#161b27' }}>
        {ENVS.map(env => (
          <button key={env} onClick={() => setActiveEnv(env)}
            style={{
              padding: '10px 20px', background: 'transparent',
              color: activeEnv === env ? 'var(--blue)' : 'var(--text-muted)',
              border: 'none', borderBottom: activeEnv === env ? '2px solid var(--blue)' : '2px solid transparent',
            }}>
            {env.toUpperCase()}
          </button>
        ))}
      </div>
      <ServerTab env={activeEnv} />
    </div>
  );
}
```

- [ ] **Step 7: Start frontend, verify it loads**

```bash
cd frontend && npm run dev
```
Open http://localhost:3000 — should see dark page with tabs.

- [ ] **Step 8: Commit**

```bash
git add frontend/
git commit -m "feat: React frontend scaffold with dark theme and tab routing"
```

---

### Task 15: ServerTab + ContainerRow

**Files:**
- Create: `frontend/src/components/TopBar.jsx`
- Create: `frontend/src/components/ServerTab.jsx`
- Create: `frontend/src/components/StackGroup.jsx`
- Create: `frontend/src/components/ContainerRow.jsx`
- Create: `frontend/src/components/BulkActionBar.jsx`

- [ ] **Step 1: Create TopBar.jsx**

```jsx
import React from 'react';

export default function TopBar({ onBuild }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '10px 16px', background: '#161b27', borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontWeight: 'bold', letterSpacing: 1 }}>🌿 NAMAA DEVOPS</span>
      <button onClick={onBuild}
        style={{ background: '#1e3a5f', color: 'var(--blue)', border: '1px solid #2d5a9a', padding: '5px 14px' }}>
        ⚡ Build
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Create ServerTab.jsx**

```jsx
import React, { useState, useEffect, useCallback } from 'react';
import { fetchContainers } from '../api';
import StackGroup from './StackGroup';
import BulkActionBar from './BulkActionBar';

export default function ServerTab({ env }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [lastRefresh, setLastRefresh] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const result = await fetchContainers(env);
      setData(result);
      setLastRefresh(new Date().toLocaleTimeString());
      setSelected(new Set());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [env]);

  useEffect(() => { load(); }, [load]);

  const toggleSelect = (name) => setSelected(prev => {
    const next = new Set(prev);
    next.has(name) ? next.delete(name) : next.add(name);
    return next;
  });

  const isAwsEnv = ['stage', 'prod'].includes(env);

  const errorHint = error
    ? (isAwsEnv ? 'Connection failed — try whitelisting your IP first' : 'Connection failed — check FortiClient VPN')
    : null;

  const allContainers = data?.stacks?.flatMap(s => s.containers) || [];
  const selectedContainers = allContainers.filter(c => selected.has(c.name) && c.managed);

  return (
    <div>
      {/* Status bar */}
      <div style={{ padding: '8px 16px', background: '#1a1f2e', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        {loading && <span style={{ color: 'var(--text-muted)' }}>Connecting…</span>}
        {error && <span style={{ color: 'var(--red)' }}>⚠ {errorHint}</span>}
        {data && !loading && (
          <>
            <span style={{ color: 'var(--green)' }}>🟢 Connected</span>
            <span style={{ color: 'var(--text-muted)' }}>|</span>
            <span>{allContainers.filter(c => c.status === 'running').length} running · {allContainers.filter(c => c.status !== 'running').length} stopped</span>
            <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>Refreshed {lastRefresh}</span>
          </>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          {isAwsEnv && <WhitelistButton env={env} onSuccess={load} />}
          <button onClick={load} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)', padding: '3px 8px' }}>↻ Refresh</button>
        </div>
      </div>

      {selected.size > 0 && (
        <BulkActionBar env={env} selected={selectedContainers} onClear={() => setSelected(new Set())} onDone={load} />
      )}

      <div style={{ padding: '10px 16px' }}>
        {data?.stacks?.map((stack, idx) => (
          <StackGroup key={stack.path} env={env} stack={stack} stackIdx={idx}
            selected={selected} onToggle={toggleSelect} onRefresh={load} />
        ))}
      </div>
    </div>
  );
}

function WhitelistButton({ env, onSuccess }) {
  const [running, setRunning] = useState(false);
  const [output, setOutput] = useState('');
  const [show, setShow] = useState(false);
  // Note: whitelistIp imported at top of ServerTab.jsx — add to the file's import line:
  // import { fetchContainers, whitelistIp } from '../api';

  const run = async () => {
    setRunning(true); setOutput(''); setShow(true);
    await whitelistIp(env, (chunk) => setOutput(o => o + chunk), (code) => {
      setRunning(false);
      if (code === 0) setTimeout(onSuccess, 4000);
    });
  };

  return (
    <>
      <button onClick={run} disabled={running}
        style={{ background: '#2d1f3d', color: 'var(--purple)', border: '1px solid #5b3f7a', padding: '4px 10px' }}>
        {running ? 'Whitelisting…' : '🔐 Whitelist My IP'}
      </button>
      {show && (
        <div style={{ position: 'fixed', inset: 0, background: '#000a', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 6, padding: 20, width: 600, maxHeight: '70vh' }}>
            <pre style={{ overflow: 'auto', maxHeight: '50vh', color: 'var(--green)', fontSize: 11 }}>{output}</pre>
            {!running && <button onClick={() => setShow(false)} style={{ marginTop: 10, background: 'var(--bg-input)', color: 'var(--text)', border: '1px solid var(--border)', padding: '4px 12px' }}>Close</button>}
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 3: Create StackGroup.jsx**

```jsx
import React, { useState } from 'react';
import ContainerRow from './ContainerRow';
import AddServicePanel from './AddServicePanel';

export default function StackGroup({ env, stack, stackIdx, selected, onToggle, onRefresh }) {
  const [addOpen, setAddOpen] = useState(false);

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>{stack.name}</span>
        <button onClick={() => setAddOpen(true)}
          style={{ background: 'transparent', color: 'var(--blue)', border: '1px solid var(--border)', padding: '2px 8px', fontSize: 11 }}>
          + Add Service
        </button>
      </div>
      {stack.containers.map(c => (
        <ContainerRow key={c.name} env={env} container={c} stackPath={stack.path}
          checked={selected.has(c.name)} onToggle={() => onToggle(c.name)} onRefresh={onRefresh} />
      ))}
      {addOpen && <AddServicePanel env={env} stackIdx={stackIdx} stackPath={stack.path}
        existingServices={stack.containers} onClose={() => setAddOpen(false)} onDone={onRefresh} />}
    </div>
  );
}
```

- [ ] **Step 4: Create ContainerRow.jsx**

```jsx
import React, { useState } from 'react';
import { containerAction, saveNote } from '../api';
import LogsPanel from './LogsPanel';
import EnvPanel from './EnvPanel';
import UpdateTagModal from './UpdateTagModal';

export default function ContainerRow({ env, container, stackPath, checked, onToggle, onRefresh }) {
  const { name, status, image, managed, note } = container;
  const [localNote, setLocalNote] = useState(note || '');
  const [logsOpen, setLogsOpen] = useState(false);
  const [envOpen, setEnvOpen] = useState(false);
  const [tagOpen, setTagOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const act = async (action, body = {}) => {
    setBusy(true);
    try {
      await containerAction(env, name, action, { stackPath, serviceName: name, ...body });
      onRefresh();
    } catch (e) { alert(e.message); }
    finally { setBusy(false); }
  };

  const isManaged = managed;
  const borderColor = isManaged ? 'var(--border-managed)' : 'var(--border)';
  const imageTag = image?.split(':').pop() || '';
  const imageBase = image?.split(':')[0] || '';

  return (
    <div style={{ background: isManaged ? 'var(--bg-card)' : '#111418', border: `1px solid ${borderColor}`,
      borderRadius: 6, padding: '9px 12px', marginBottom: 6, opacity: isManaged ? 1 : 0.7 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {isManaged
          ? <input type="checkbox" checked={checked} onChange={onToggle} style={{ flexShrink: 0 }} />
          : <span style={{ width: 16 }} />}
        <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
          background: status === 'running' ? 'var(--green)' : 'var(--red)' }} />
        <span style={{ width: 170, flexShrink: 0, fontWeight: 600, color: isManaged ? 'var(--text)' : 'var(--text-muted)' }}>{name}</span>
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          color: status === 'running' ? 'var(--green)' : 'var(--red)', fontSize: 11 }}
          title={image}>
          {imageBase}:<b>{imageTag}</b>
        </span>
        <input value={localNote} onChange={e => setLocalNote(e.target.value)}
          onBlur={() => saveNote(env, name, localNote)}
          placeholder="notes…"
          style={{ width: 120, flexShrink: 0, fontSize: 10, color: 'var(--text-muted)', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border)' }} />
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          {isManaged && <>
            <Btn label="✏ Tag" color="var(--green)" bg="#1a2e1a" border="#2a4a2a" onClick={() => setTagOpen(true)} disabled={busy} />
            <Btn label="⚙ Env" color="var(--blue)" bg="#1a2434" border="#1e3a5f" onClick={() => setEnvOpen(true)} disabled={busy} />
            <Btn label="↻" color="var(--yellow)" bg="#1f1f1a" border="#3a3a1a" onClick={() => act('restart')} disabled={busy} />
            <Btn label="▶ Up" color="var(--indigo)" bg="#1a1f2e" border="#2a2f5a" onClick={() => act('up')} disabled={busy} />
            <Btn label="⚡" color="var(--orange)" bg="#1f1a0d" border="#3a2a0d" onClick={() => act('up', { forceRecreate: true })} disabled={busy} />
          </>}
          {!isManaged && <>
            <Btn label="⚙ Env" color="var(--blue)" bg="#1a2434" border="#1e3a5f" onClick={() => setEnvOpen(true)} disabled={busy} />
          </>}
          <Btn label="📋" color="var(--purple)" bg="#1f1a2e" border="#3d2a5a" onClick={() => setLogsOpen(true)} disabled={busy} />
        </div>
      </div>
      {logsOpen && <LogsPanel env={env} container={name} onClose={() => setLogsOpen(false)} />}
      {envOpen && <EnvPanel env={env} container={container} stackPath={stackPath} onClose={() => setEnvOpen(false)} onDone={onRefresh} />}
      {tagOpen && <UpdateTagModal env={env} container={container} stackPath={stackPath} onClose={() => setTagOpen(false)} onDone={onRefresh} />}
    </div>
  );
}

function Btn({ label, color, bg, border, onClick, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ background: bg, color, border: `1px solid ${border}`, padding: '3px 7px', opacity: disabled ? 0.5 : 1 }}>
      {label}
    </button>
  );
}
```

- [ ] **Step 5: Start full app and verify container list renders**

```bash
# Terminal 1
cd backend && node server.js
# Terminal 2
cd frontend && npm run dev
```
Open http://localhost:3000 — switch to DEV tab, should see container list.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/TopBar.jsx frontend/src/components/ServerTab.jsx \
  frontend/src/components/StackGroup.jsx frontend/src/components/ContainerRow.jsx
git commit -m "feat: server tab, stack groups, container rows with action buttons"
```

---

### Task 16: Modals — Logs, Env, UpdateTag, BulkAction

**Files:**
- Create: `frontend/src/components/LogsPanel.jsx`
- Create: `frontend/src/components/EnvPanel.jsx`
- Create: `frontend/src/components/UpdateTagModal.jsx`
- Create: `frontend/src/components/BulkActionBar.jsx`

- [ ] **Step 1: Create LogsPanel.jsx**

```jsx
import React, { useEffect, useRef, useState } from 'react';

export default function LogsPanel({ env, container, onClose }) {
  const [lines, setLines] = useState([]);
  const [search, setSearch] = useState('');
  const [disconnected, setDisconnected] = useState(false);
  const wsRef = useRef(null);
  const bottomRef = useRef(null);
  const MAX_LINES = 1000;

  const connect = () => {
    setDisconnected(false);
    setLines([]);
    const ws = new WebSocket(`ws://localhost:3001/ws/logs?env=${env}&container=${container}`);
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === 'line') {
        setLines(prev => {
          const next = [...prev, msg.text];
          return next.length > MAX_LINES ? next.slice(next.length - MAX_LINES) : next;
        });
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      }
      if (msg.type === 'error') setLines(prev => [...prev, `ERROR: ${msg.message}`]);
    };
    ws.onclose = () => setDisconnected(true);
    wsRef.current = ws;
  };

  useEffect(() => {
    connect();
    return () => wsRef.current?.close();
  }, []);

  const filtered = search ? lines.filter(l => l.toLowerCase().includes(search.toLowerCase())) : lines;

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000c', zIndex: 200, display: 'flex', flexDirection: 'column' }}>
      <div style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border)', padding: '8px 16px', display: 'flex', gap: 10, alignItems: 'center' }}>
        <span style={{ fontWeight: 'bold', color: 'var(--purple)' }}>📋 {container}</span>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search logs…"
          style={{ flex: 1, maxWidth: 300 }} />
        {disconnected && <>
          <span style={{ color: 'var(--red)', fontSize: 11 }}>Log stream disconnected</span>
          <button onClick={connect} style={{ background: '#1a2e1a', color: 'var(--green)', border: '1px solid #2a4a2a', padding: '3px 8px' }}>Reconnect</button>
        </>}
        <button onClick={onClose} style={{ background: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--border)', padding: '3px 10px' }}>✕ Close</button>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: 12, fontFamily: 'monospace', fontSize: 11, lineHeight: 1.5 }}>
        {filtered.map((line, i) => (
          <div key={i} style={{ color: line.includes('ERROR') || line.includes('error') ? 'var(--red)' : 'var(--text)',
            background: search && line.toLowerCase().includes(search.toLowerCase()) ? '#2a3a1a' : 'transparent' }}>
            {line}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create UpdateTagModal.jsx**

```jsx
import React, { useState } from 'react';
import { containerAction } from '../api';

export default function UpdateTagModal({ env, container, stackPath, onClose, onDone }) {
  const currentTag = container.image?.split(':').pop() || '';
  const [tag, setTag] = useState(currentTag);
  const [note, setNote] = useState(container.note || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!tag.trim()) return;
    setBusy(true); setError('');
    try {
      await containerAction(env, container.name, 'update-tag', {
        stackPath, serviceName: container.name, newTag: tag.trim(), note
      });
      onDone(); onClose();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  return (
    <Modal title={`✏ Update Tag — ${container.name}`} onClose={onClose}>
      <label style={{ color: 'var(--text-muted)', fontSize: 10 }}>New image tag</label>
      <input value={tag} onChange={e => setTag(e.target.value)} style={{ width: '100%', marginBottom: 10 }} />
      <label style={{ color: 'var(--text-muted)', fontSize: 10 }}>Notes (branch / release)</label>
      <input value={note} onChange={e => setNote(e.target.value)} style={{ width: '100%', marginBottom: 12 }} />
      {error && <div style={{ color: 'var(--red)', marginBottom: 8, fontSize: 11 }}>{error}</div>}
      <button onClick={submit} disabled={busy}
        style={{ background: '#1a4a1a', color: 'var(--green)', border: '1px solid #2a6a2a', padding: '6px 20px' }}>
        {busy ? 'Deploying…' : 'Deploy ↗'}
      </button>
    </Modal>
  );
}

export function Modal({ title, onClose, children }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000a', zIndex: 150, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 6, padding: 20, minWidth: 400, maxWidth: 600 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
          <span style={{ fontWeight: 'bold' }}>{title}</span>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)' }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create EnvPanel.jsx**

```jsx
import React, { useState } from 'react';
import { containerAction } from '../api';
import { Modal } from './UpdateTagModal';

export default function EnvPanel({ env, container, stackPath, onClose, onDone }) {
  const [newKey, setNewKey] = useState('');
  const [newVal, setNewVal] = useState('');
  const [editKey, setEditKey] = useState(null);
  const [editVal, setEditVal] = useState('');
  const [busy, setBusy] = useState(false);

  const envVars = Object.entries(container.env || {});

  const save = async (key, value) => {
    setBusy(true);
    try {
      await containerAction(env, container.name, 'update-env', { stackPath, serviceName: container.name, key, value });
      onDone(); onClose();
    } catch (e) { alert(e.message); }
    finally { setBusy(false); }
  };

  return (
    <Modal title={`⚙ Env Vars — ${container.name}`} onClose={onClose}>
      <div style={{ maxHeight: '50vh', overflow: 'auto', marginBottom: 12 }}>
        {envVars.map(([k, v]) => (
          <div key={k} style={{ display: 'flex', gap: 6, marginBottom: 4, alignItems: 'center' }}>
            <span style={{ width: 180, flexShrink: 0, color: 'var(--blue)', fontSize: 11 }}>{k}</span>
            {editKey === k
              ? <>
                  <input value={editVal} onChange={e => setEditVal(e.target.value)} style={{ flex: 1, fontSize: 11 }} />
                  <button onClick={() => save(k, editVal)} disabled={busy} style={{ background: '#1a2e1a', color: 'var(--green)', border: '1px solid #2a4a2a', padding: '2px 8px' }}>Save</button>
                  <button onClick={() => setEditKey(null)} style={{ background: 'transparent', color: 'var(--text-muted)', border: 'none' }}>✕</button>
                </>
              : <>
                  <span style={{ flex: 1, color: 'var(--text)', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis' }}>{v}</span>
                  {container.managed && <button onClick={() => { setEditKey(k); setEditVal(v); }} style={{ background: 'transparent', color: 'var(--text-muted)', border: 'none', fontSize: 10 }}>✏</button>}
                </>}
          </div>
        ))}
      </div>
      {container.managed && (
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
          <div style={{ color: 'var(--text-muted)', fontSize: 10, marginBottom: 6 }}>Add new variable</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input value={newKey} onChange={e => setNewKey(e.target.value)} placeholder="KEY" style={{ flex: 1 }} />
            <input value={newVal} onChange={e => setNewVal(e.target.value)} placeholder="value" style={{ flex: 2 }} />
            <button onClick={() => { if (newKey) save(newKey, newVal); }} disabled={busy}
              style={{ background: '#1a2e1a', color: 'var(--green)', border: '1px solid #2a4a2a', padding: '3px 10px' }}>
              Add
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
```

- [ ] **Step 4: Create BulkActionBar.jsx**

```jsx
import React, { useState } from 'react';
import { containerAction } from '../api';

export default function BulkActionBar({ env, selected, onClear, onDone }) {
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);
  const [bulkTag, setBulkTag] = useState('');
  const [showTagInput, setShowTagInput] = useState(false);

  const runBulk = async (action, extraBody = {}) => {
    setBusy(true); setResults([]);
    for (const c of selected) {
      setResults(prev => [...prev, { name: c.name, status: 'running' }]);
      try {
        await containerAction(env, c.name, action, { stackPath: c.stackPath, serviceName: c.name, ...extraBody });
        setResults(prev => prev.map(r => r.name === c.name ? { ...r, status: 'done' } : r));
      } catch (e) {
        setResults(prev => prev.map(r => r.name === c.name ? { ...r, status: 'failed', error: e.message } : r));
      }
    }
    setBusy(false); onDone();
  };

  return (
    <div style={{ background: '#1e2535', borderBottom: '1px solid #2a3a50', padding: '8px 16px', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
      <span style={{ color: 'var(--blue)', fontWeight: 'bold' }}>{selected.length} selected</span>
      <span style={{ color: 'var(--border)' }}>|</span>
      <button onClick={() => runBulk('restart')} disabled={busy} style={{ background: 'transparent', color: 'var(--yellow)', border: 'none', padding: '2px 6px' }}>↻ Restart All</button>
      <button onClick={() => runBulk('up')} disabled={busy} style={{ background: 'transparent', color: 'var(--indigo)', border: 'none', padding: '2px 6px' }}>▶ Up -d All</button>
      <button onClick={() => runBulk('up', { forceRecreate: true })} disabled={busy} style={{ background: 'transparent', color: 'var(--orange)', border: 'none', padding: '2px 6px' }}>⚡ Force Recreate All</button>
      <button onClick={() => setShowTagInput(t => !t)} disabled={busy} style={{ background: 'transparent', color: 'var(--green)', border: 'none', padding: '2px 6px' }}>✏ Set Tag for All</button>
      {showTagInput && (
        <>
          <input value={bulkTag} onChange={e => setBulkTag(e.target.value)} placeholder="new-tag" style={{ width: 160 }} />
          <button onClick={() => runBulk('update-tag', { newTag: bulkTag })} disabled={busy || !bulkTag}
            style={{ background: '#1a2e1a', color: 'var(--green)', border: '1px solid #2a4a2a', padding: '3px 8px' }}>Apply</button>
        </>
      )}
      <button onClick={onClear} style={{ marginLeft: 'auto', background: 'transparent', color: 'var(--red)', border: 'none' }}>✕ Clear</button>
      {results.length > 0 && (
        <div style={{ width: '100%', marginTop: 6, fontSize: 11 }}>
          {results.map(r => (
            <span key={r.name} style={{ marginRight: 12, color: r.status === 'done' ? 'var(--green)' : r.status === 'failed' ? 'var(--red)' : 'var(--text-muted)' }}>
              {r.name}: {r.status === 'done' ? '✅' : r.status === 'failed' ? `❌ ${r.error}` : '⏳'}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/LogsPanel.jsx frontend/src/components/EnvPanel.jsx \
  frontend/src/components/UpdateTagModal.jsx frontend/src/components/BulkActionBar.jsx
git commit -m "feat: logs panel, env panel, update tag modal, bulk action bar"
```

---

### Task 17: Add Service Panel

**Files:**
- Create: `frontend/src/components/AddServicePanel.jsx`

- [ ] **Step 1: Implement AddServicePanel.jsx**

```jsx
import React, { useState } from 'react';
import { addService } from '../api';
import { Modal } from './UpdateTagModal';

export default function AddServicePanel({ env, stackIdx, stackPath, existingServices, onClose, onDone }) {
  const [mode, setMode] = useState('new'); // 'new' | 'clone'
  const [cloneSource, setCloneSource] = useState('');
  const [name, setName] = useState('');
  const [image, setImage] = useState('');
  const [ports, setPorts] = useState([{ host: '', container: '' }]);
  const [envVars, setEnvVars] = useState([{ key: '', value: '' }]);
  const [restart, setRestart] = useState('always');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const loadClone = () => {
    const src = existingServices.find(c => c.name === cloneSource);
    if (!src) return;
    setImage(src.image || '');
    setEnvVars(Object.entries(src.env || {}).map(([key, value]) => ({ key, value })));
  };

  const submit = async () => {
    if (!name.trim() || !image.trim()) return setError('Name and image are required');
    setBusy(true); setError('');
    try {
      const environment = Object.fromEntries(envVars.filter(e => e.key).map(e => [e.key, e.value]));
      const portList = ports.filter(p => p.host && p.container).map(p => `${p.host}:${p.container}`);
      await addService(env, stackIdx, { name: name.trim(), image: image.trim(), ports: portList, environment, restart });
      onDone(); onClose();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  return (
    <Modal title="+ Add Service" onClose={onClose}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <button onClick={() => setMode('new')} style={{ background: mode === 'new' ? '#1a2e1a' : 'transparent', color: 'var(--green)', border: '1px solid #2a4a2a', padding: '4px 12px' }}>New</button>
        <button onClick={() => setMode('clone')} style={{ background: mode === 'clone' ? '#1a2434' : 'transparent', color: 'var(--blue)', border: '1px solid #1e3a5f', padding: '4px 12px' }}>Clone Existing</button>
      </div>

      {mode === 'clone' && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          <select value={cloneSource} onChange={e => setCloneSource(e.target.value)} style={{ flex: 1 }}>
            <option value="">Pick a service to clone…</option>
            {existingServices.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
          </select>
          <button onClick={loadClone} style={{ background: '#1a2434', color: 'var(--blue)', border: '1px solid #1e3a5f', padding: '4px 10px' }}>Load</button>
        </div>
      )}

      <Field label="Service name (unique)"><input value={name} onChange={e => setName(e.target.value)} style={{ width: '100%' }} /></Field>
      <Field label="Image:tag"><input value={image} onChange={e => setImage(e.target.value)} style={{ width: '100%' }} /></Field>
      <Field label="Restart policy">
        <select value={restart} onChange={e => setRestart(e.target.value)} style={{ width: '100%' }}>
          {['always', 'unless-stopped', 'on-failure', 'no'].map(r => <option key={r}>{r}</option>)}
        </select>
      </Field>
      <Field label="Ports (host:container)">
        {ports.map((p, i) => (
          <div key={i} style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
            <input value={p.host} onChange={e => setPorts(ports.map((x, j) => j === i ? { ...x, host: e.target.value } : x))} placeholder="host" style={{ width: 80 }} />
            <span>:</span>
            <input value={p.container} onChange={e => setPorts(ports.map((x, j) => j === i ? { ...x, container: e.target.value } : x))} placeholder="container" style={{ width: 80 }} />
            <button onClick={() => setPorts(ports.filter((_, j) => j !== i))} style={{ background: 'transparent', color: 'var(--red)', border: 'none' }}>✕</button>
          </div>
        ))}
        <button onClick={() => setPorts([...ports, { host: '', container: '' }])} style={{ background: 'transparent', color: 'var(--blue)', border: '1px dashed var(--border)', padding: '2px 8px', fontSize: 10 }}>+ Add port</button>
      </Field>
      <Field label="Environment variables">
        {envVars.map((e, i) => (
          <div key={i} style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
            <input value={e.key} onChange={ev => setEnvVars(envVars.map((x, j) => j === i ? { ...x, key: ev.target.value } : x))} placeholder="KEY" style={{ width: 140 }} />
            <input value={e.value} onChange={ev => setEnvVars(envVars.map((x, j) => j === i ? { ...x, value: ev.target.value } : x))} placeholder="value" style={{ flex: 1 }} />
            <button onClick={() => setEnvVars(envVars.filter((_, j) => j !== i))} style={{ background: 'transparent', color: 'var(--red)', border: 'none' }}>✕</button>
          </div>
        ))}
        <button onClick={() => setEnvVars([...envVars, { key: '', value: '' }])} style={{ background: 'transparent', color: 'var(--blue)', border: '1px dashed var(--border)', padding: '2px 8px', fontSize: 10 }}>+ Add var</button>
      </Field>

      {error && <div style={{ color: 'var(--red)', fontSize: 11, marginBottom: 8 }}>{error}</div>}
      <div style={{ marginTop: 4, fontSize: 10, color: 'var(--text-muted)' }}>com.namaa.dashboard.managed=true will be added automatically.</div>
      <button onClick={submit} disabled={busy} style={{ marginTop: 12, background: '#1a2e1a', color: 'var(--green)', border: '1px solid #2a4a2a', padding: '6px 20px' }}>
        {busy ? 'Creating…' : 'Create Service ↗'}
      </button>
    </Modal>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ color: 'var(--text-muted)', fontSize: 10, marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/AddServicePanel.jsx
git commit -m "feat: add service panel with clone and new modes"
```

---

### Task 18: Build Panel

**Files:**
- Create: `frontend/src/components/BuildPanel.jsx`
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: Implement BuildPanel.jsx**

```jsx
import React, { useState, useEffect } from 'react';
import { fetchBranches, startBuild } from '../api';
import { Modal } from './UpdateTagModal';

const PROJECTS = [
  { key: 'frontend', label: 'Namaa Frontend' },
  { key: 'backend', label: 'Irrigation Backend' },
  { key: 'geoserver', label: 'Geoserver' },
  { key: 'adminPanel', label: 'Admin Panel' },
];

export default function BuildPanel({ onClose }) {
  const [project, setProject] = useState('frontend');
  const [branches, setBranches] = useState([]);
  const [branch, setBranch] = useState('');
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [output, setOutput] = useState('');
  const [building, setBuilding] = useState(false);
  const [exitCode, setExitCode] = useState(null);

  // Per-project form state
  const [env, setEnv] = useState('dev');
  const [tag, setTag] = useState('');
  const [incrementBeta, setIncrementBeta] = useState(false);
  const [modules, setModules] = useState([]);
  const [allModules, setAllModules] = useState(false);
  const [version, setVersion] = useState('');
  const [runMvn, setRunMvn] = useState(false);
  const [releaseType, setReleaseType] = useState('');
  const [service, setService] = useState('all');

  const BACKEND_MODULES = ['apis', 'sensors_readings', 'events', 'weather_forecast', 'partitioning'];

  useEffect(() => {
    setBranches([]); setBranch(''); setLoadingBranches(true);
    fetchBranches(project)
      .then(r => { setBranches(r.branches); setBranch(r.branches[0] || ''); })
      .catch(() => {})
      .finally(() => setLoadingBranches(false));
  }, [project]);

  const buildArgs = () => {
    switch (project) {
      case 'frontend': {
        const a = ['-e', env];
        if (tag) a.push('-t', tag);
        if (incrementBeta) a.push('-i');
        return a;
      }
      case 'backend': {
        const a = ['-e', env];
        if (allModules) a.push('-a');
        else modules.forEach(m => a.push('-m', m));
        if (version) a.push('-v', version);
        if (runMvn) a.push('-s');
        if (releaseType) a.push('-x', releaseType);
        return a;
      }
      case 'geoserver': {
        const a = ['-e', env];
        if (tag) a.push('-t', tag);
        return a;
      }
      case 'adminPanel': {
        const a = ['-e', env, '-s', service];
        if (tag) a.push('-t', tag);
        if (incrementBeta) a.push('-i');
        return a;
      }
      default: return [];
    }
  };

  const build = async () => {
    if (!branch) return;
    setOutput(''); setExitCode(null); setBuilding(true);
    await startBuild(project, branch, buildArgs(),
      (chunk) => setOutput(o => o + chunk),
      (code) => { setExitCode(code); setBuilding(false); }
    );
  };

  const envOptions = project === 'backend' ? ['dev', 'test', 'stage', 'prod'] : ['dev', 'aws'];

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000a', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 6, padding: 20, width: 700, maxHeight: '90vh', overflow: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
          <span style={{ fontWeight: 'bold', color: 'var(--blue)' }}>⚡ Build</span>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)' }}>✕</button>
        </div>

        <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
          {PROJECTS.map(p => (
            <button key={p.key} onClick={() => setProject(p.key)}
              style={{ background: project === p.key ? '#1a2434' : 'transparent', color: project === p.key ? 'var(--blue)' : 'var(--text-muted)',
                border: `1px solid ${project === p.key ? '#1e3a5f' : 'var(--border)'}`, padding: '4px 12px' }}>
              {p.label}
            </button>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
          <Field label="Branch">
            {loadingBranches ? <span style={{ color: 'var(--text-muted)' }}>Loading…</span> :
              <select value={branch} onChange={e => setBranch(e.target.value)} style={{ width: '100%' }}>
                {branches.map(b => <option key={b}>{b}</option>)}
              </select>}
          </Field>
          <Field label="Environment">
            <select value={env} onChange={e => setEnv(e.target.value)} style={{ width: '100%' }}>
              {envOptions.map(e => <option key={e}>{e}</option>)}
            </select>
          </Field>

          {project !== 'backend' && (
            <Field label="Tag (optional)"><input value={tag} onChange={e => setTag(e.target.value)} style={{ width: '100%' }} /></Field>
          )}
          {(project === 'frontend' || project === 'adminPanel') && (
            <Field label="Increment beta"><input type="checkbox" checked={incrementBeta} onChange={e => setIncrementBeta(e.target.checked)} /></Field>
          )}
          {project === 'adminPanel' && (
            <Field label="Service">
              <select value={service} onChange={e => setService(e.target.value)} style={{ width: '100%' }}>
                {['all', 'frontend', 'backend'].map(s => <option key={s}>{s}</option>)}
              </select>
            </Field>
          )}
          {project === 'backend' && (
            <>
              <Field label="Modules">
                <label style={{ display: 'block', marginBottom: 4 }}>
                  <input type="checkbox" checked={allModules} onChange={e => setAllModules(e.target.checked)} /> All modules
                </label>
                {!allModules && BACKEND_MODULES.map(m => (
                  <label key={m} style={{ display: 'block', marginLeft: 12 }}>
                    <input type="checkbox" checked={modules.includes(m)}
                      onChange={e => setModules(e.target.checked ? [...modules, m] : modules.filter(x => x !== m))} /> {m}
                  </label>
                ))}
              </Field>
              <div>
                <Field label="Version (-v)"><input value={version} onChange={e => setVersion(e.target.value)} style={{ width: '100%' }} /></Field>
                <Field label="Release type (-x)">
                  <select value={releaseType} onChange={e => setReleaseType(e.target.value)} style={{ width: '100%' }}>
                    {['', 'major', 'minor', 'patch'].map(r => <option key={r} value={r}>{r || 'none'}</option>)}
                  </select>
                </Field>
                <Field label="Run mvn clean install first"><input type="checkbox" checked={runMvn} onChange={e => setRunMvn(e.target.checked)} /></Field>
              </div>
            </>
          )}
        </div>

        <button onClick={build} disabled={building || !branch}
          style={{ background: '#1a2e1a', color: 'var(--green)', border: '1px solid #2a4a2a', padding: '7px 24px', marginBottom: 12 }}>
          {building ? 'Building…' : '⚡ Build & Push'}
        </button>

        {output && (
          <pre style={{ background: '#0a0f0a', border: '1px solid var(--border)', borderRadius: 4, padding: 10,
            maxHeight: 300, overflow: 'auto', fontSize: 10, color: 'var(--green)', whiteSpace: 'pre-wrap' }}>
            {output}
            {exitCode !== null && (
              <span style={{ color: exitCode === 0 ? 'var(--green)' : 'var(--red)', fontWeight: 'bold' }}>
                {'\n'}{exitCode === 0 ? '✅ Build succeeded' : `❌ Build failed (exit ${exitCode})`}
              </span>
            )}
          </pre>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <div style={{ color: 'var(--text-muted)', fontSize: 10, marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Wire BuildPanel into App.jsx**

In `App.jsx`, import `BuildPanel` and render it when `buildPanelOpen` is true:
```jsx
import BuildPanel from './components/BuildPanel';
// Inside return, after ServerTab:
{buildPanelOpen && <BuildPanel onClose={() => setBuildPanelOpen(false)} />}
```

- [ ] **Step 3: End-to-end build test**

1. Open http://localhost:3000
2. Click ⚡ Build
3. Select "Namaa Frontend", wait for branches to load
4. Pick a branch, pick env `dev`, click Build & Push
5. Verify output streams in real time

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/BuildPanel.jsx frontend/src/App.jsx
git commit -m "feat: build panel with per-project forms, branch selector, streamed output"
```

---

## Phase 5 — Final Polish

### Task 19: Smoke Test All Flows

- [ ] **Step 1: Test DEV tab**
  - Opens, shows containers grouped by stack
  - Managed containers show full action set, unmanaged show only Env + Logs
  - Notes save on blur

- [ ] **Step 2: Test container actions on DEV**
  - Restart a managed container → container restarts
  - Update tag → compose file updated, container recreated with new tag
  - Force recreate → container force recreated
  - View env vars → panel shows resolved values
  - Logs → live stream appears, search filters lines

- [ ] **Step 3: Test bulk actions**
  - Check 2 managed containers → bulk bar appears
  - Restart All → both restart, status shown per container
  - Set Tag for All → shared tag input, both get updated

- [ ] **Step 4: Test Add Service**
  - Clone mode: pick existing service, rename, deploy → new container appears
  - New mode: fill blank form, deploy → new container appears
  - Verify `com.namaa.dashboard.managed=true` label on new container

- [ ] **Step 5: Test STAGE tab (requires VPN off — should fail gracefully)**
  - Should show "Connection failed — try whitelisting your IP first"
  - Click Whitelist My IP → output streams, on success SSH connects

- [ ] **Step 6: Test Build panel**
  - Frontend build: pick branch, hit build, output streams
  - Backend build: pick modules, env, hit build

- [ ] **Step 7: Final commit**

```bash
git add .
git commit -m "feat: namaa devops dashboard — complete implementation"
```
