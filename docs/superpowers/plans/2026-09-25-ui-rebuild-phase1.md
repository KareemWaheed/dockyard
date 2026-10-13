# UI Rebuild Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Dockyard's dashboard UI with a light-first shadcn/Tailwind app. The core is a "what's deployed where" Overview, an Environment page and a container detail drawer with a smart tag combobox. A few additive backend endpoints support it.

**Architecture:**
- **Frontend:** React 19 + Vite 5 SPA.
  - `react-router` gives shareable URLs (drawer state lives in the URL).
  - `@tanstack/react-query` owns server state (per-env 30s polling, mutations invalidate).
  - shadcn/ui (Radix + cmdk) supplies the accessible primitives.
  - The four views not yet redesigned (Builds, Flyway, History, Settings) move to `src/legacy/` and render inside the new shell under a scoped copy of the old CSS.
- **Backend:** gains container health fields, a deploy-suggestions endpoint and a batched env update. All are additive.

**Tech Stack:**
- React 19, Vite 5, Tailwind CSS v4 (`@tailwindcss/vite`), shadcn/ui (new-york, JS), Radix, cmdk
- sonner, lucide-react, react-router 7, @tanstack/react-query 5, @fontsource
- Vitest + Testing Library + jsdom
- Backend: Express + better-sqlite3; tests are plain Node scripts using `node:assert`

**Spec:** `docs/superpowers/specs/2026-09-25-ui-rebuild-phase1-design.md` (read it alongside this plan)

**Branch / worktree:**
- Branch `feat/ui-rebuild` in `D:\Work\Projects\namaa-devops\.worktrees\ui-rebuild`.
- It is already fast-forwarded onto `fix/security-hardening` (`a2fe1d8`).
- All paths below are relative to the worktree root.

## Global Constraints

- **Never commit** anything under `docs/superpowers/` (user preference). Every commit step lists explicit paths; never use `git add -A` / `git add .`.
- Do not push. CI deploys from `master`.
- Commit messages end with the line `Claude-Session: https://claude.ai/code/session_0197kg3P6xdbTLt6Nn5BBj7Y`.
- JavaScript only (`.js`/`.jsx`); no TypeScript. shadcn `components.json` uses `"tsx": false`.
- React **19**. Tailwind **v4**. Accent **indigo `#3B5BDB`**.
- Fonts: Inter (UI) and JetBrains Mono (tags/logs).
- Type scale: page title 20/600, drawer/section title 15/600, body 13/400, secondary 12, **minimum 11px** anywhere. Tags are mono 12.5px.
- Status colors (light theme text / bg):
  - running `#1F7A45`/`#E8F7EE`
  - drift/starting `#9A5B00`/`#FFF4E0`
  - stopped/failed/destructive `#B42318`/`#FDECEC`
  - unmanaged/stale `#4A5068`/`#F1F3F7`
  - Status is never shown by color alone (always dot/icon + word).
- Table rows 36px; compact mode 30px.
- `localStorage` is accessed only through `src/lib/storage.js` (try/catch; the app works without it). Keys are prefixed `dockyard:`.
- No `alert(`, `confirm(`, `prompt(`, `window.confirm`, `window.prompt` outside `src/legacy/`.
- PROD = env key matching `/^prod/i`.
- Backend: every new remote command value goes through `shellQuote` (`backend/services/shell.js`). Every new route that takes a service name validates it with `isValidName`.
- Before running backend tests in the worktree for the first time: `npm ci` in `backend/` (better-sqlite3 needs its native build).
- Before running frontend tests for the first time: `npm install` in `frontend/` (Task 4 does this).

## Review Focus

1. **Unusual image references.**
   - Inputs: `192.0.2.1:5000/app` (registry port, no tag), `repo/app@sha256:abc…` (digest), `app` (bare).
   - The backend suggestion matcher and the frontend tag splitter must agree: repo=`192.0.2.1:5000/app` tag=`latest`; repo=`repo/app` tag=`sha256:abc…`; repo=`app` tag=`latest`.
   - Pinned by shared fixtures in Task 2 (backend) and Task 7 (frontend).
2. **A drawer URL naming a container that isn't in the data** (stale bookmark, env unreachable, env still loading).
   - Expect: "Loading…" while the env query loads; "Container not found in {env}" with a Close button when loaded but absent. Never a crash.
   - Pinned in Task 13.
3. **Batched env update with hostile input.**
   - Inputs: a key with regex metacharacters (`A.B`, `X|Y`), a value containing `\n`.
   - Expect: 400 with a clear message, and no file written.
   - Pinned in Task 3.
4. **An env that becomes unreachable after loading.**
   - Expect: its last data stays visible, marked stale (muted + "(stale)"). Other envs are unaffected. The sidebar says "offline".
   - Pinned in Task 9 (`buildMatrix` stale flag) and Task 8 (`envSummary`).
5. **Undo after a deploy whose previous tag was unknown** (the container had no tag, or the old tag couldn't be parsed).
   - Expect: no Undo button rather than a broken one.
   - Pinned in Task 10 (`useRunAction` test).

---

## File map

**Backend (modify/create):**
- `backend/services/docker.js`: `parseBatchInspect` adds `health`, `startedAt`, `finishedAt`, `exitCode`, `restartCount`.
- `backend/services/suggestions.js` (new): `splitImage`, `recentBuildsForRepo`, `previousTags`.
- `backend/routes/suggestions.js` (new): `GET /api/deploy-suggestions/:env/:service`.
- `backend/services/compose.js`: adds `validateEnvChanges`, `applyEnvChanges`.
- `backend/routes/containers.js`: `update-env` accepts `changes`.
- `backend/server.js`: mounts the suggestions route.
- Tests (new): `backend/services/docker.inspect.test.js`, `backend/services/suggestions.test.js`, `backend/routes/suggestions.test.js`, `backend/services/compose.envchanges.test.js`, `backend/routes/update-env.test.js`.

**Frontend (all under `frontend/`):**

```
package.json, vite.config.js, jsconfig.json, components.json, vitest.setup.js
index.html                                      (fonts are imported in JS, title unchanged)
src/main.jsx                                    providers + router mount
src/index.css                                   Tailwind + theme tokens (REPLACED; old file moves to legacy)
src/lib/utils.js                                cn() (shadcn)
src/lib/storage.js                              readPref / writePref / usePref
src/lib/api.js                                  moved from src/api.js + new helpers
src/lib/image.js                                splitImage, imageTag
src/lib/containers.js                           flattenEnv, findContainer, describeState, formatAgo
src/lib/queries.js                              query keys + hooks
src/components/ui/*                             shadcn components
src/lib/useNow.js                               ticking clock for "refreshed Ns ago"
src/components/status.jsx                       StatusDot / StatusBadge / Tag + tone maps
src/app/router.jsx, layoutContext.js, AppLayout.jsx, PageHeader.jsx, Sidebar.jsx,
        ThemeProvider.jsx, AppProviders.jsx, envSummary.js
src/app/DialogProvider.jsx                      confirm / typed / password / error dialogs
src/test/renderApp.jsx                          test helper: full app on a memory router
src/features/overview/buildMatrix.js, drift.js, OverviewPage.jsx, OverviewMatrix.jsx,
                     EnvFixActions.jsx, focusStore.js
src/features/env/EnvPage.jsx, StackTable.jsx, BulkBar.jsx, AddServiceDialog.jsx, EnvHeaderActions.jsx
src/features/container/actions.js               ACTIONS table + confirmPolicy + describeAction
src/features/container/useRunAction.js
src/features/container/useDrawer.js
src/features/container/ContainerDrawer.jsx, DrawerHeader.jsx,
                       DeployTab.jsx, TagCombobox.jsx, suggestions.js,
                       LogsTab.jsx, useLogStream.js, logBuffer.js,
                       EnvTab.jsx, maskEnv.js, InfoTab.jsx, HistoryTab.jsx
src/features/activity/ActivityPanel.jsx, useBuildActivity.js
src/features/palette/CommandPalette.jsx
src/legacy/BuildView.jsx, FlywayView.jsx, HistoryView.jsx, SettingsView.jsx,
           SearchableSelect.jsx, settings/*.jsx, legacy.css, LegacyScope.jsx
scripts/scope-legacy-css.mjs                    one-off transform, committed for traceability
```

**Deleted (Task 20):**
- `src/App.jsx`, `src/AppShell.jsx`
- `src/components/{AddServicePanel,BulkActionBar,CommandPalette,ContainerRow,DashboardView,EnvPanel,LogsPanel,Sidebar,StackGroup,TopBar,UpdateTagModal,VersionInfoModal}.jsx`
- `src/__tests__/appShell.test.js`, `src/__tests__/commandPalette.test.js`

---

## Canonical interfaces (every task references these; names must match exactly)

**`src/lib/storage.js`**
```js
readPref(key: string, fallback: any): any            // reads localStorage["dockyard:"+key] (JSON)
writePref(key: string, value: any): void
usePref(key: string, fallback: any): [value, setValue]   // setValue accepts value or updater fn
```

**`src/lib/image.js`**
```js
splitImage(image?: string): { repo: string, tag: string }
imageTag(image?: string): string                      // splitImage(image).tag
```

**`src/lib/api.js`**
- Everything exported by today's `src/api.js`, same names and signatures.
- `containerAction` now throws `readError(r)` (the message is the JSON `error` field).
- Plus:
```js
fetchDeploySuggestions(env, service, { image, current }): Promise<{ otherEnvs: [], recentBuilds: Array<{tag, project, buildNumber, branch, finishedAt}>, previous: Array<{tag, at}> }>
fetchVersionInfo(env, containerName, { stackPath, serviceName }): Promise<object>
```

**`src/lib/containers.js`**
```js
flattenEnv(data): Array<Container>        // stacks[].containers (with stackName/stackPath) + standalone[]
findContainer(data, name): Container|null
describeState(c, now?: number): { tone: 'ok'|'warn'|'bad'|'idle', label: string, detail: string }
formatAgo(iso: string, now?: number): string      // "just now" | "5m" | "3h" | "2d"
```
- `Container` fields come from the API:
  - `name`, `serviceName`, `status` ('running'|'stopped'|'unknown'), `image`, `managed`, `env`, `labels`, `note`
  - `stackPath`, `stackName`, `standalone?`, `hasVersionInfo?`
  - `health`, `startedAt`, `finishedAt`, `exitCode`, `restartCount`

**`src/lib/queries.js`**
```js
qk = {
  servers: ['servers'],
  containers: (env) => ['containers', env],
  history: (env, container, limit) => ['history', env ?? 'all', container ?? '', limit],
  suggestions: (env, service, image, current) => ['suggestions', env, service, image, current],
  buildProjects: ['build-projects'],
  buildRuns: (project) => ['build-runs', project],
  maintenance: (env) => ['maintenance', env],
}
ENV_POLL_MS = 30000
useServers(): UseQueryResult<Server[]>
useEnvKeys(): string[]                                 // servers in settings order ([] while loading)
envQueryOptions(env): object                           // shared by useEnvContainers and useAllEnvs
useEnvContainers(env): UseQueryResult
useAllEnvs(): Array<{ env, data, isLoading, isError, error, isFetching, dataUpdatedAt }>
useContainerAction(env): UseMutationResult             // variables: { container, action, endpoint, body }
usePendingAction(env, containerName): { action, body }|null
ACTION_KEY = 'container-action'                        // mutationKey: [ACTION_KEY, env]; container identified via variables
```

**`src/features/container/actions.js`**
```js
ACTIONS: { [logical]: { endpoint, body?, destructive?: boolean } }
  // logical ∈ deploy, restart, pull-recreate, start, force-recreate, stop, update-env, manage, unmanage
isProd(env): boolean
confirmPolicy(action: string, env: string): 'none'|'confirm'|'typed'
  // action ∈ ACTIONS keys + 'maintenance-on' | 'maintenance-off'
describeAction(action, { service, env, fromTag?, toTag? }): { title, description, confirmLabel, pending, success }
```

**`src/app/DialogProvider.jsx`**
```js
<DialogProvider>{children}</DialogProvider>
useDialogs(): {
  confirm({ title, description, confirmLabel, destructive, level: 'confirm'|'typed', typedValue?, requirePassword? })
    : Promise<{ ok: boolean, password?: string }>,
  showError(title: string, message: string): void,
}
```

**`src/features/container/useRunAction.js`**
```js
useRunAction(env): (container, action, extraBody?) => Promise<boolean>   // true on success
```

**`src/features/container/useDrawer.js`**
```js
useDrawer(): {
  open: { env, container } | null,
  tab: 'deploy'|'logs'|'env'|'info'|'history',
  prefillTag: string|null,
  openDrawer(env, containerName, tab?, { prefillTag? }?): void,
  setTab(tab): void,
  closeDrawer(): void,
}
```

---

### Task 1: Backend: container health/uptime fields

**Files:**
- Modify: `backend/services/docker.js` (function `parseBatchInspect`)
- Test: `backend/services/docker.inspect.test.js` (new)

**Interfaces:**
- Produces: each container in `GET /api/servers/:env/containers` gains `health` (string|null), `startedAt` (ISO string|null), `finishedAt` (ISO string|null), `exitCode` (number|null) and `restartCount` (number).

- [ ] **Step 1: Install backend deps (first backend task only)**

Run: `cd backend && npm ci`
Expected: completes; `node -e "require('better-sqlite3')"` exits 0.

- [ ] **Step 2: Write the failing test** `backend/services/docker.inspect.test.js`

```js
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
```

- [ ] **Step 3: Run it and confirm it fails**

Run: `cd backend && node services/docker.inspect.test.js`
Expected: `AssertionError` on `health`.

- [ ] **Step 4: Implement.** In `parseBatchInspect`, replace the `map[name] = { … }` assignment with:

```js
    const state = item.State || {};
    const zeroTime = (t) => (!t || t.startsWith('0001-01-01') ? null : t);
    map[name] = {
      image: item.Config?.Image || '',
      managed: labels['com.dockyard.managed'] === 'true',
      env,
      status: (state.Status || '').toLowerCase().includes('running') ? 'running' : 'stopped',
      labels,
      health: state.Health?.Status ?? null,
      startedAt: zeroTime(state.StartedAt),
      finishedAt: zeroTime(state.FinishedAt),
      exitCode: typeof state.ExitCode === 'number' ? state.ExitCode : null,
      restartCount: item.RestartCount ?? 0,
    };
```

- [ ] **Step 5: Run the new and existing docker tests**

Run: `cd backend && node services/docker.inspect.test.js && node services/docker.test.js`
Expected: `docker inspect field tests passed` and `docker parser tests passed`.

- [ ] **Step 6: Commit**

```bash
git add backend/services/docker.js backend/services/docker.inspect.test.js
git commit -m "feat(containers): expose health, uptime, exit code and restart count

Claude-Session: https://claude.ai/code/session_0197kg3P6xdbTLt6Nn5BBj7Y"
```

---

### Task 2: Backend: deploy-suggestions endpoint

**Files:**
- Create: `backend/services/suggestions.js`, `backend/routes/suggestions.js`
- Modify: `backend/server.js` (mount the route)
- Test: `backend/services/suggestions.test.js`, `backend/routes/suggestions.test.js`

**Interfaces:**
- Produces: `GET /api/deploy-suggestions/:env/:service?image=<currentImage>&current=<currentTag>` → `{ otherEnvs: [], recentBuilds: [{ tag, project, buildNumber, branch, finishedAt }], previous: [{ tag, at }] }`
- Produces (service): `splitImage(image) → { repo, tag }`, `recentBuildsForRepo(runs, repo, current, limit=10)`, `previousTags(rows, current, limit=10)`

- [ ] **Step 1: Write the failing unit test** `backend/services/suggestions.test.js`

```js
const assert = require('assert');
const { splitImage, recentBuildsForRepo, previousTags } = require('./suggestions');

// Shared image fixtures: frontend/src/lib/image.test.js uses the SAME table.
const IMAGE_CASES = [
  ['reg.example.com/ns/frontend:16.3.0-20', 'reg.example.com/ns/frontend', '16.3.0-20'],
  ['192.0.2.1:5000/app', '192.0.2.1:5000/app', 'latest'],
  ['192.0.2.1:5000/app:1.2', '192.0.2.1:5000/app', '1.2'],
  ['repo/app@sha256:abc123', 'repo/app', 'sha256:abc123'],
  ['app', 'app', 'latest'],
  ['', '', 'latest'],
];
for (const [image, repo, tag] of IMAGE_CASES) {
  assert.deepStrictEqual(splitImage(image), { repo, tag }, `splitImage(${image})`);
}

const runs = [
  { project: 'fe', build_number: 90, branch: 'main', finished_at: '2026-09-25 10:00:00',
    pushed_images_json: JSON.stringify(['reg.example.com/ns/frontend:16.4.0-1']) },
  { project: 'fe', build_number: 89, branch: 'main', finished_at: '2026-09-24 10:00:00',
    pushed_images_json: JSON.stringify(['reg.example.com/ns/frontend:16.3.0-20']) }, // == current → excluded
  { project: 'be', build_number: 12, branch: 'dev', finished_at: '2026-09-24 09:00:00',
    pushed_images_json: JSON.stringify(['reg.example.com/ns/backend:1', 'reg.example.com/ns/frontend-sso:1']) },
  { project: 'fe', build_number: 88, branch: 'x', finished_at: null, pushed_images_json: 'not json' },
];
assert.deepStrictEqual(recentBuildsForRepo(runs, 'reg.example.com/ns/frontend', '16.3.0-20'), [
  { tag: '16.4.0-1', project: 'fe', buildNumber: 90, branch: 'main', finishedAt: '2026-09-25 10:00:00' },
]);
assert.strictEqual(recentBuildsForRepo(runs, 'reg.example.com/ns/frontend', 'zzz', 1).length, 1, 'limit respected');

const rows = [
  { new_tag: '3', old_tag: '2', timestamp: 't3' },
  { new_tag: '2', old_tag: '1', timestamp: 't2' },
  { new_tag: null, old_tag: null, timestamp: 't1' },
];
assert.deepStrictEqual(previousTags(rows, '3'), [
  { tag: '2', at: 't3' },
  { tag: '1', at: 't2' },
]);
assert.strictEqual(previousTags(rows, 'none', 2).length, 2, 'limit respected');
console.log('suggestions service tests passed');
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `cd backend && node services/suggestions.test.js`
Expected: `Cannot find module './suggestions'`.

- [ ] **Step 3: Implement** `backend/services/suggestions.js`

```js
// Deploy suggestions for the tag combobox. splitImage must match
// frontend/src/lib/image.js exactly: both sides use the same fixture table.

function splitImage(image = '') {
  const at = image.indexOf('@');
  if (at !== -1) return { repo: image.slice(0, at), tag: image.slice(at + 1) };
  const slash = image.lastIndexOf('/');
  const colon = image.lastIndexOf(':');
  if (colon > slash) return { repo: image.slice(0, colon), tag: image.slice(colon + 1) };
  return { repo: image, tag: 'latest' };
}

function parseJsonArray(text) {
  try {
    const v = JSON.parse(text || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

// runs: build_runs rows, newest first. Returns builds that pushed an image of `repo`.
function recentBuildsForRepo(runs, repo, current, limit = 10) {
  const out = [];
  const seen = new Set();
  for (const run of runs) {
    for (const ref of parseJsonArray(run.pushed_images_json)) {
      const { repo: r, tag } = splitImage(ref);
      if (r !== repo || tag === current || seen.has(tag)) continue;
      seen.add(tag);
      out.push({ tag, project: run.project, buildNumber: run.build_number, branch: run.branch, finishedAt: run.finished_at });
      if (out.length >= limit) return out;
    }
  }
  return out;
}

// rows: deploy_history rows (new_tag, old_tag, timestamp), newest first.
function previousTags(rows, current, limit = 10) {
  const out = [];
  const seen = new Set([current]);
  for (const row of rows) {
    for (const tag of [row.new_tag, row.old_tag]) {
      if (!tag || seen.has(tag)) continue;
      seen.add(tag);
      out.push({ tag, at: row.timestamp });
      if (out.length >= limit) return out;
    }
  }
  return out;
}

module.exports = { splitImage, recentBuildsForRepo, previousTags };
```

- [ ] **Step 4: Run it and confirm it passes**

Run: `cd backend && node services/suggestions.test.js`
Expected: `suggestions service tests passed`.

- [ ] **Step 5: Write the failing route test** `backend/routes/suggestions.test.js`

```js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dockyard-sugg-'));
process.env.DB_PATH = path.join(tmp, 'test.db');
process.env.CONFIG_PATH = path.join(tmp, 'missing.json');

const express = require('express');
const db = require('../db');

db.prepare(`INSERT INTO build_runs (project, build_number, type, status, started_at, finished_at, branch, pushed_images_json)
            VALUES ('fe', 7, 'build', 'success', 'x', '2026-09-25 10:00:00', 'main', ?)`)
  .run(JSON.stringify(['reg/ns/frontend:9.9.9']));
db.prepare(`INSERT INTO build_runs (project, build_number, type, status, started_at, branch, pushed_images_json)
            VALUES ('fe', 8, 'build', 'failed', 'x', 'main', ?)`)
  .run(JSON.stringify(['reg/ns/frontend:bad']));
const hist = db.prepare(`INSERT INTO deploy_history (timestamp, env, container_name, service_name, stack_path, stack_name, action, old_tag, new_tag, success)
                         VALUES (?, 'stage', 'frontend', 'frontend', '/p', 'Main', 'update-tag', ?, ?, ?)`);
hist.run('2026-09-24T00:00:00Z', '1.0', '1.1', 1);
hist.run('2026-09-25T00:00:00Z', '1.1', '1.2', 1);
hist.run('2026-09-25T01:00:00Z', '1.2', 'broken', 0);

const app = express();
app.use('/api/deploy-suggestions', require('./suggestions'));
const server = http.createServer(app);

server.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}/api/deploy-suggestions`;
  try {
    let r = await fetch(`${base}/stage/frontend?image=${encodeURIComponent('reg/ns/frontend:1.2')}&current=1.2`);
    assert.strictEqual(r.status, 200);
    const body = await r.json();
    assert.deepStrictEqual(body.otherEnvs, []);
    assert.deepStrictEqual(body.recentBuilds.map((b) => b.tag), ['9.9.9'], 'only successful builds of the same repo');
    assert.deepStrictEqual(body.previous.map((p) => p.tag), ['1.1', '1.0'], 'failed deploys ignored, current excluded');

    r = await fetch(`${base}/stage/${encodeURIComponent('bad;id')}?image=x&current=y`);
    assert.strictEqual(r.status, 400, 'invalid service name rejected');
    console.log('suggestions route tests passed');
  } catch (err) {
    console.error(err);
    process.exitCode = 1;
  } finally {
    server.close();
    db.close();
    fs.rmSync(tmp, { recursive: true, force: true });
    process.exit();
  }
});
```

- [ ] **Step 6: Run it and confirm it fails**

Run: `cd backend && node routes/suggestions.test.js`
Expected: `Cannot find module './suggestions'`.

- [ ] **Step 7: Implement** `backend/routes/suggestions.js`

```js
const router = require('express').Router();
const db = require('../db');
const { isValidName } = require('../services/shell');
const { splitImage, recentBuildsForRepo, previousTags } = require('../services/suggestions');

// GET /api/deploy-suggestions/:env/:service?image=<current image>&current=<current tag>
// otherEnvs is filled in by the frontend from data it already has (no SSH here).
router.get('/:env/:service', (req, res) => {
  const { env, service } = req.params;
  if (!isValidName(service)) return res.status(400).json({ error: 'Invalid service name' });
  const image = String(req.query.image || '');
  const current = String(req.query.current || '');

  const runs = db
    .prepare(
      `SELECT project, build_number, branch, finished_at, pushed_images_json FROM build_runs
       WHERE type = 'build' AND status = 'success' AND pushed_images_json IS NOT NULL
       ORDER BY id DESC LIMIT 20`,
    )
    .all();
  const rows = db
    .prepare(
      `SELECT new_tag, old_tag, timestamp FROM deploy_history
       WHERE env = ? AND service_name = ? AND action = 'update-tag' AND success = 1
       ORDER BY timestamp DESC LIMIT 100`,
    )
    .all(env, service);

  res.json({
    otherEnvs: [],
    recentBuilds: image ? recentBuildsForRepo(runs, splitImage(image).repo, current) : [],
    previous: previousTags(rows, current),
  });
});

module.exports = router;
```

In `backend/server.js`, add after the `app.use('/api/maintenance', …)` line:

```js
app.use('/api/deploy-suggestions', require('./routes/suggestions'));
```

- [ ] **Step 8: Run all backend tests**

Run: `cd backend && for t in services/*.test.js routes/*.test.js *.test.js; do node $t || echo "FAIL $t"; done`
Expected: every file prints its "passed" line and there are no `FAIL` lines.

- [ ] **Step 9: Commit**

```bash
git add backend/services/suggestions.js backend/services/suggestions.test.js backend/routes/suggestions.js backend/routes/suggestions.test.js backend/server.js
git commit -m "feat(api): deploy suggestions from recent builds and previous tags

Claude-Session: https://claude.ai/code/session_0197kg3P6xdbTLt6Nn5BBj7Y"
```

---

### Task 3: Backend: batched env update

**Files:**
- Modify: `backend/services/compose.js` (add `validateEnvChanges`, `applyEnvChanges`)
- Modify: `backend/routes/containers.js` (the `update-env` handler)
- Test: `backend/services/compose.envchanges.test.js`, `backend/routes/update-env.test.js`

**Interfaces:**
- Produces: `POST /api/containers/:env/:container/update-env` accepts `{ stackPath, serviceName, stackName, changes: [{key, value}] }` **or** the legacy `{ stackPath, serviceName, stackName, key, value }`.
  - Keys must match `^[A-Za-z_][A-Za-z0-9_]*$`.
  - Values must be strings without `\r`/`\n`.
  - Runs `up -d` exactly once and writes exactly one history row.
- Produces (service): `validateEnvChanges(changes) → string|null` (error message) and `applyEnvChanges(composeContent, envContent, serviceName, changes) → { compose: string|null, env: string|null }` (null = file unchanged).

- [ ] **Step 1: Write the failing unit test** `backend/services/compose.envchanges.test.js`

```js
const assert = require('assert');
const yaml = require('js-yaml');
const { validateEnvChanges, applyEnvChanges } = require('./compose');

assert.strictEqual(validateEnvChanges([{ key: 'API_URL', value: 'http://x' }]), null);
assert.match(validateEnvChanges([]), /at least one/);
assert.match(validateEnvChanges('nope'), /at least one/);
assert.match(validateEnvChanges([{ key: 'A.B', value: '1' }]), /Invalid key/);
assert.match(validateEnvChanges([{ key: 'X|Y', value: '1' }]), /Invalid key/);
assert.match(validateEnvChanges([{ key: '1ABC', value: '1' }]), /Invalid key/);
assert.match(validateEnvChanges([{ key: 'OK', value: 'a\nINJECTED=1' }]), /newline/);
assert.match(validateEnvChanges([{ key: 'OK', value: 5 }]), /must be a string/);

const compose = [
  'services:',
  '  web:',
  '    image: app:1',
  '    environment:',
  '      - PLAIN=old',
  '      - FROM_FILE=${FROM_FILE}',
  '',
].join('\n');
const envFile = 'FROM_FILE=before\nOTHER=keep\n';

const out = applyEnvChanges(compose, envFile, 'web', [
  { key: 'PLAIN', value: 'new' },
  { key: 'ADDED', value: 'yes' },
  { key: 'FROM_FILE', value: 'after' },
]);
const svc = yaml.load(out.compose).services.web;
assert.ok(svc.environment.includes('PLAIN=new'));
assert.ok(svc.environment.includes('ADDED=yes'));
assert.ok(!svc.environment.includes('PLAIN=old'));
assert.strictEqual(out.env, 'FROM_FILE=after\nOTHER=keep\n');

const onlyCompose = applyEnvChanges(compose, envFile, 'web', [{ key: 'PLAIN', value: 'x' }]);
assert.strictEqual(onlyCompose.env, null, '.env untouched → null');
const onlyEnv = applyEnvChanges(compose, envFile, 'web', [{ key: 'FROM_FILE', value: 'y' }]);
assert.strictEqual(onlyEnv.compose, null, 'compose untouched → null');
assert.throws(() => applyEnvChanges(compose, envFile, 'missing', [{ key: 'A', value: '1' }]), /not found/);
console.log('compose env-changes tests passed');
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `cd backend && node services/compose.envchanges.test.js`
Expected: `TypeError: validateEnvChanges is not a function`.

- [ ] **Step 3: Implement.** In `backend/services/compose.js`, add above `module.exports` (and add both names to the exports object):

```js
const ENV_KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

// Returns an error message, or null when every change is safe to write.
function validateEnvChanges(changes) {
  if (!Array.isArray(changes) || changes.length === 0) return 'changes must contain at least one { key, value }';
  for (const c of changes) {
    if (!c || typeof c.key !== 'string' || !ENV_KEY_RE.test(c.key)) return `Invalid key: ${c && c.key}`;
    if (typeof c.value !== 'string') return `Value for ${c.key} must be a string`;
    if (/[\r\n]/.test(c.value)) return `Value for ${c.key} must not contain a newline`;
  }
  return null;
}

// Applies each change to the compose file or .env, matching the single-key
// behavior of update-env: keys whose compose entry references ${…} live in .env.
function applyEnvChanges(composeContent, envContent, serviceName, changes) {
  const service = yaml.load(composeContent).services?.[serviceName];
  if (!service) throw new Error(`Service ${serviceName} not found`);
  let compose = composeContent;
  let envOut = envContent;
  let composeChanged = false;
  let envChanged = false;
  for (const { key, value } of changes) {
    const entry = Array.isArray(service.environment)
      ? service.environment.find((e) => typeof e === 'string' && e.startsWith(`${key}=`))
      : service.environment?.[key];
    if (typeof entry === 'string' && entry.includes('${')) {
      envOut = updateEnvVar(envOut, key, value);
      envChanged = true;
    } else {
      compose = addEnvVarToCompose(compose, serviceName, key, value);
      composeChanged = true;
    }
  }
  return { compose: composeChanged ? compose : null, env: envChanged ? envOut : null };
}
```

- [ ] **Step 4: Run it and confirm it passes**

Run: `cd backend && node services/compose.envchanges.test.js`
Expected: `compose env-changes tests passed`.

- [ ] **Step 5: Write the failing route test** `backend/routes/update-env.test.js`

This test stubs the SSH module to count commands and file writes:

```js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dockyard-env-'));
process.env.DB_PATH = path.join(tmp, 'test.db');
process.env.CONFIG_PATH = path.join(tmp, 'missing.json');
process.env.NOTES_PATH = path.join(tmp, 'notes.json');

// Stub SSH before the route module loads it.
const calls = { exec: [], writes: [] };
const files = {
  '/srv/app/docker-compose.yml': 'services:\n  web:\n    image: app:1\n    environment:\n      - A=1\n      - B=${B}\n',
  '/srv/app/.env': 'B=old\n',
};
require.cache[require.resolve('../services/ssh')] = {
  exports: {
    connect: async () => ({}),
    exec: async (_c, cmd) => { calls.exec.push(cmd); return ''; },
    readFile: async (_c, p) => { if (p in files) return files[p]; throw new Error('ENOENT'); },
    writeFile: async (_c, p, content) => { calls.writes.push(p); files[p] = content; },
  },
};

const express = require('express');
const db = require('../db');
const sid = db.prepare("INSERT INTO servers (env_key, name, host, ssh_username) VALUES ('dev','dev','h','u')").run().lastInsertRowid;
db.prepare("INSERT INTO compose_stacks (server_id, name, path) VALUES (?, 'App', '/srv/app/docker-compose.yml')").run(sid);

const app = express();
app.use(express.json());
app.use('/api/containers', require('./containers'));
const server = http.createServer(app);

const post = (port, body) =>
  fetch(`http://127.0.0.1:${port}/api/containers/dev/web/update-env`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
const base = { stackPath: '/srv/app/docker-compose.yml', serviceName: 'web', stackName: 'App' };

server.listen(0, async () => {
  const { port } = server.address();
  try {
    // batched: both files written, exactly one `up -d`
    let r = await post(port, { ...base, changes: [{ key: 'A', value: '2' }, { key: 'B', value: 'new' }, { key: 'C', value: '3' }] });
    assert.strictEqual(r.status, 200, await r.text());
    assert.deepStrictEqual(calls.writes.sort(), ['/srv/app/.env', '/srv/app/docker-compose.yml']);
    assert.strictEqual(calls.exec.filter((c) => c.includes(' up -d ')).length, 1, 'one recreate');
    assert.match(files['/srv/app/.env'], /^B=new$/m);
    const hist = db.prepare("SELECT COUNT(*) n FROM deploy_history WHERE action = 'update-env'").get().n;
    assert.strictEqual(hist, 1, 'one history row');

    // legacy single-key form still works
    calls.exec.length = 0; calls.writes.length = 0;
    r = await post(port, { ...base, key: 'A', value: '9' });
    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(calls.writes, ['/srv/app/docker-compose.yml']);

    // hostile input rejected before anything is written
    calls.exec.length = 0; calls.writes.length = 0;
    for (const bad of [{ key: 'A.B', value: '1' }, { key: 'X|Y', value: '1' }, { key: 'OK', value: 'a\nEVIL=1' }]) {
      r = await post(port, { ...base, changes: [bad] });
      assert.strictEqual(r.status, 400, `should reject ${JSON.stringify(bad)}`);
    }
    assert.strictEqual(calls.writes.length + calls.exec.length, 0, 'nothing touched on rejection');
    console.log('update-env route tests passed');
  } catch (err) {
    console.error(err);
    process.exitCode = 1;
  } finally {
    server.close();
    db.close();
    fs.rmSync(tmp, { recursive: true, force: true });
    process.exit();
  }
});
```

- [ ] **Step 6: Run it and confirm it fails**

Run: `cd backend && node routes/update-env.test.js`
Expected: the first assertion fails. The current handler ignores `changes` and writes nothing useful, and `A.B` is not rejected.

- [ ] **Step 7: Implement.** In `backend/routes/containers.js`:
1. Add `validateEnvChanges, applyEnvChanges` to the destructured `require('../services/compose')` line.
2. Replace the whole `router.post('/:env/:containerName/update-env', …)` handler with:

```js
router.post('/:env/:containerName/update-env', async (req, res) => {
  const { env, containerName } = req.params;
  const { stackPath, serviceName, stackName = '' } = req.body;
  const changes = Array.isArray(req.body.changes)
    ? req.body.changes
    : [{ key: req.body.key, value: req.body.value }];
  const invalid = validateEnvChanges(changes);
  if (invalid) return res.status(400).json({ error: invalid });

  const server = db.prepare('SELECT * FROM servers WHERE env_key = ?').get(env);
  if (!server) return res.status(404).json({ error: `Unknown environment: ${env}` });
  const serverCfg = getServerConfig(server);
  const dc = server.docker_compose_cmd || 'docker compose';
  const startTime = Date.now();
  const noteSnapshot = getNote(env, containerName);
  try {
    const conn = await connect(env, serverCfg);
    const composeContent = await readFile(conn, stackPath);
    const envPath = path.join(path.dirname(stackPath), '.env');
    const envContent = await readFile(conn, envPath).catch(() => '');
    const out = applyEnvChanges(composeContent, envContent, serviceName, changes);
    if (out.env !== null) await writeFile(conn, envPath, out.env);
    if (out.compose !== null) await writeFile(conn, stackPath, out.compose);

    await exec(conn, `${dc} -f ${shellQuote(stackPath)} up -d ${shellQuote(serviceName)}`);
    writeHistory({ env, containerName, serviceName, stackPath, stackName, action: 'update-env', success: true, durationMs: Date.now() - startTime, noteSnapshot });
    notifyDeploy({ env, container: containerName, action: 'update-env', durationMs: Date.now() - startTime, success: true }).catch(() => {});
    res.json({ ok: true });
  } catch (err) {
    writeHistory({ env, containerName, serviceName, stackPath, stackName, action: 'update-env', success: false, errorMessage: err.message, noteSnapshot });
    notifyDeploy({ env, container: containerName, action: 'update-env', success: false, error: err.message }).catch(() => {});
    res.status(500).json({ error: err.message });
  }
});
```

- [ ] **Step 8: Run all backend tests**

Run: `cd backend && for t in services/*.test.js routes/*.test.js *.test.js; do node $t || echo "FAIL $t"; done`
Expected: all pass, including `security route tests passed` (the validation middleware still runs first).

- [ ] **Step 9: Commit**

```bash
git add backend/services/compose.js backend/services/compose.envchanges.test.js backend/routes/containers.js backend/routes/update-env.test.js
git commit -m "feat(containers): batch env var updates into one recreate

Validates keys and rejects newline values so a batch can't inject
extra .env lines or break the key regex.

Claude-Session: https://claude.ai/code/session_0197kg3P6xdbTLt6Nn5BBj7Y"
```

---

### Task 4: Frontend toolchain: React 19, Tailwind v4, shadcn, test setup

The old UI must still build and run at the end of this task. Nothing is rewired yet.

**Files:**
- Modify: `frontend/package.json` (via npm), `frontend/vite.config.js`
- Create: `frontend/jsconfig.json`, `frontend/components.json`, `frontend/vitest.setup.js`, `frontend/src/lib/utils.js`, `frontend/src/components/ui/*.jsx` (generated), `frontend/src/components/ui/__tests__/smoke.test.jsx`

**Interfaces:**
- Produces:
  - the `@/` alias → `frontend/src/`
  - `cn(...classes)` from `@/lib/utils`
  - shadcn components under `@/components/ui/*`: button, badge, input, label, checkbox, dialog, alert-dialog, sheet, command, dropdown-menu, tabs, tooltip, popover, skeleton, switch, scroll-area, separator, sonner
  - jsdom test environment with jest-dom matchers

- [ ] **Step 1: Install the existing deps**

Run: `cd frontend && npm install`
Expected: completes without errors.

- [ ] **Step 2: Upgrade React and add runtime deps**

```bash
cd frontend
npm install react@^19 react-dom@^19 react-router@^7 @tanstack/react-query@^5 sonner lucide-react class-variance-authority clsx tailwind-merge radix-ui cmdk @fontsource-variable/inter @fontsource-variable/jetbrains-mono
npm install -D tailwindcss@^4 @tailwindcss/vite@^4 tw-animate-css @testing-library/react @testing-library/user-event @testing-library/jest-dom jsdom
```
Expected: installs cleanly.
- If npm reports an `ERESOLVE` peer conflict with React 19, re-run the same command with `--legacy-peer-deps` and note which package complained in the commit message.
- Vitest: `package.json` lists `vitest@^4`, which may require a newer Vite than 5. If `npx vitest run` later fails with a Vite version or peer error, run `npm install -D vitest@^3 @vitest/ui@^3` and continue.

- [ ] **Step 3: Replace** `frontend/vite.config.js`

```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': 'http://localhost:3001',
      '/ws': { target: 'ws://localhost:3001', ws: true },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.js'],
    css: false,
  },
});
```

- [ ] **Step 4: Create** `frontend/jsconfig.json`

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] },
    "jsx": "react-jsx"
  },
  "include": ["src"]
}
```

- [ ] **Step 5: Create** `frontend/components.json`

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": false,
  "tsx": false,
  "tailwind": {
    "config": "",
    "css": "src/index.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "iconLibrary": "lucide",
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  }
}
```

- [ ] **Step 6: Create** `frontend/src/lib/utils.js`

```js
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 7: Generate the shadcn components**

```bash
cd frontend
npx shadcn@latest add button badge input label checkbox dialog alert-dialog sheet command dropdown-menu tabs tooltip popover skeleton switch scroll-area separator sonner --yes --overwrite
```
Expected: files appear in `src/components/ui/` as `.jsx`.
- If the CLI refuses because it can't detect Tailwind v4, temporarily put `@import "tailwindcss";` as the first line of `src/index.css`, run the command again, then continue with the restore below.
- If the CLI asks to modify `src/index.css`, allow it. Task 8 replaces that file entirely anyway.
- Afterwards, restore the old stylesheet so the old UI keeps working: `git checkout -- src/index.css`.

- [ ] **Step 8: Remove the `next-themes` dependency from the generated toaster.** Replace `frontend/src/components/ui/sonner.jsx` with:

```jsx
import { Toaster as Sonner } from 'sonner';

// Theme comes from the `dark` class on <html> (set by ThemeProvider); sonner reads it via `theme="system"`
// only for OS changes, so pass the resolved theme explicitly from the caller.
function Toaster({ theme = 'light', ...props }) {
  return (
    <Sonner
      theme={theme}
      className="toaster group"
      style={{
        '--normal-bg': 'var(--popover)',
        '--normal-text': 'var(--popover-foreground)',
        '--normal-border': 'var(--border)',
      }}
      {...props}
    />
  );
}

export { Toaster };
```
Run: `cd frontend && grep -rl "next-themes" src || echo "no next-themes"`
Expected: `no next-themes`.

- [ ] **Step 9: Create** `frontend/vitest.setup.js`

```js
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => cleanup());

// jsdom gaps that Radix and cmdk rely on
class ResizeObserverStub { observe() {} unobserve() {} disconnect() {} }
globalThis.ResizeObserver ??= ResizeObserverStub;
Element.prototype.scrollIntoView ??= function scrollIntoView() {};
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.releasePointerCapture ??= () => {};
window.matchMedia ??= (query) => ({
  matches: false, media: query, onchange: null,
  addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
  dispatchEvent: () => false,
});
```

- [ ] **Step 10: Write the smoke test** `frontend/src/components/ui/__tests__/smoke.test.jsx`

```jsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Button } from '@/components/ui/button';

describe('toolchain', () => {
  it('renders a shadcn button through the @ alias', () => {
    render(<Button variant="destructive">Stop</Button>);
    expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 11: Run all tests and the build**

Run: `cd frontend && npx vitest run && npm run build`
Expected:
- the smoke test and the two existing test files pass;
- `vite build` succeeds (the old UI, now on React 19).

- [ ] **Step 12: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/vite.config.js frontend/jsconfig.json frontend/components.json frontend/vitest.setup.js frontend/src/lib/utils.js frontend/src/components/ui
git commit -m "build(frontend): React 19, Tailwind v4, shadcn components and jsdom tests

Claude-Session: https://claude.ai/code/session_0197kg3P6xdbTLt6Nn5BBj7Y"
```

---

### Task 5: Move the legacy views and scope their CSS

**Files:**
- Move (`git mv`) into `frontend/src/legacy/`: `src/components/BuildView.jsx`, `src/components/FlywayView.jsx`, `src/components/HistoryView.jsx`, `src/components/SettingsView.jsx`, `src/components/SearchableSelect.jsx`, and the directory `src/components/settings/`.
- Modify: `frontend/src/AppShell.jsx` (4 import paths)
- Create: `frontend/scripts/scope-legacy-css.mjs`, `frontend/src/legacy/legacy.css` (generated), `frontend/src/legacy/LegacyScope.jsx`, `frontend/src/legacy/__tests__/scopeCss.test.js`

**Interfaces:**
- Produces:
  - `scopeCss(css: string): string` (from `scripts/scope-legacy-css.mjs`)
  - default export `LegacyScope({ children })`: wraps children in `<div className="legacy-scope">` and imports `legacy.css`
  - legacy views at `@/legacy/BuildView`, `@/legacy/FlywayView`, `@/legacy/HistoryView`, `@/legacy/SettingsView`

- [ ] **Step 1: Move the files**

```bash
cd frontend
mkdir -p src/legacy
git mv src/components/BuildView.jsx src/components/FlywayView.jsx src/components/HistoryView.jsx src/components/SettingsView.jsx src/components/SearchableSelect.jsx src/legacy/
git mv src/components/settings src/legacy/settings
```
- The moved files keep working without import edits: `src/legacy/*.jsx` → `../api` and `src/legacy/settings/*.jsx` → `../../api` resolve at the same depth as before.
- In `src/AppShell.jsx`, change the four imports:

```js
import BuildView from './legacy/BuildView';
import HistoryView from './legacy/HistoryView';
import SettingsView from './legacy/SettingsView';
import FlywayView from './legacy/FlywayView';
```

Run: `cd frontend && npm run build`
Expected: succeeds.

- [ ] **Step 2: Write the failing test** `frontend/src/legacy/__tests__/scopeCss.test.js`

```js
import { describe, it, expect } from 'vitest';
import { scopeCss } from '../../../scripts/scope-legacy-css.mjs';

describe('scopeCss', () => {
  it('maps :root and body to the scope element', () => {
    const out = scopeCss(':root { --bg: #000; }\nbody { color: red; }');
    expect(out).toContain('.legacy-scope { --bg: #000; }');
    expect(out).toContain('.legacy-scope { color: red; }');
    expect(out).not.toMatch(/^\s*(:root|body)\b/m);
  });

  it('prefixes plain selectors, including each item of a selector list', () => {
    const out = scopeCss('.a, .b:hover > span { x: 1; }');
    expect(out).toContain('.legacy-scope .a,\n.legacy-scope .b:hover > span { x: 1; }');
  });

  it('rewrites the old light-theme selectors to the new dark-class mechanism', () => {
    const out = scopeCss(':root[data-theme="light"] { --bg: #fff; }\nhtml[data-theme="light"] .sidebar { y: 2; }');
    expect(out).toContain('html:not(.dark) .legacy-scope { --bg: #fff; }');
    expect(out).toContain('html:not(.dark) .legacy-scope .sidebar { y: 2; }');
    expect(out).not.toContain('data-theme');
  });

  it('recurses into @media and leaves @keyframes untouched', () => {
    const out = scopeCss('@media (max-width: 480px) { .row { a: 1; } }\n@keyframes spin { from { r: 0; } to { r: 1; } }');
    expect(out).toContain('@media (max-width: 480px) {\n.legacy-scope .row { a: 1; }');
    expect(out).toContain('@keyframes spin { from { r: 0; } to { r: 1; } }');
  });

  it('drops comments so braces inside them cannot confuse the scanner', () => {
    expect(scopeCss('/* { */ .a { b: 1; }')).toContain('.legacy-scope .a { b: 1; }');
  });
});
```

- [ ] **Step 3: Run it and confirm it fails**

Run: `cd frontend && npx vitest run src/legacy`
Expected: FAIL, module `scope-legacy-css.mjs` not found.

- [ ] **Step 4: Implement** `frontend/scripts/scope-legacy-css.mjs`

```js
// One-off transform: scopes the pre-rebuild global stylesheet under .legacy-scope
// so the old Builds/Flyway/History/Settings views can render inside the new shell.
// Usage: node scripts/scope-legacy-css.mjs <in.css> <out.css>
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCOPE = '.legacy-scope';
const LIGHT = 'html:not(.dark) .legacy-scope';
const LIGHT_PREFIX = 'html[data-theme="light"] ';

function scopeSelector(selector) {
  const s = selector.trim();
  if (s === ':root' || s === 'body' || s === 'html') return SCOPE;
  if (s === ':root[data-theme="light"]' || s === 'html[data-theme="light"]') return LIGHT;
  if (s.startsWith(LIGHT_PREFIX)) return `${LIGHT} ${s.slice(LIGHT_PREFIX.length)}`;
  if (s === '*') return `${SCOPE} *`;
  return `${SCOPE} ${s}`;
}

// Top-level blocks as { prelude, body } where body excludes the outer braces.
function splitBlocks(css) {
  const blocks = [];
  let depth = 0;
  let start = 0;
  let prelude = '';
  for (let i = 0; i < css.length; i++) {
    const ch = css[i];
    if (ch === '{') {
      if (depth === 0) {
        prelude = css.slice(start, i);
        start = i + 1;
      }
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) {
        blocks.push({ prelude: prelude.trim(), body: css.slice(start, i) });
        start = i + 1;
      }
    }
  }
  return blocks;
}

export function scopeCss(input) {
  const css = input.replace(/\/\*[\s\S]*?\*\//g, '');
  return (
    splitBlocks(css)
      .map(({ prelude, body }) => {
        if (prelude.startsWith('@keyframes') || prelude.startsWith('@font-face')) return `${prelude} {${body}}`;
        if (prelude.startsWith('@media') || prelude.startsWith('@supports')) return `${prelude} {\n${scopeCss(body)}}`;
        return `${prelude.split(',').map(scopeSelector).join(',\n')} {${body}}`;
      })
      .join('\n\n') + '\n'
  );
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const [, , from, to] = process.argv;
  const header = '/* Generated by scripts/scope-legacy-css.mjs from the pre-rebuild src/index.css. Do not edit by hand. */\n';
  writeFileSync(to, header + scopeCss(readFileSync(from, 'utf8')));
}
```

- [ ] **Step 5: Run the test and confirm it passes**

Run: `cd frontend && npx vitest run src/legacy`
Expected: 5 passed.

- [ ] **Step 6: Generate the legacy stylesheet and verify it**

```bash
cd frontend
node scripts/scope-legacy-css.mjs src/index.css src/legacy/legacy.css
grep -c "data-theme" src/legacy/legacy.css
grep -nE "^(body|:root|html\[|\*)\b" src/legacy/legacy.css
grep -nvE "^(\.legacy-scope|html:not\(\.dark\) \.legacy-scope|@media|@keyframes|@font-face|@supports|\}|/\*|\s|$)" src/legacy/legacy.css | head
```
Expected:
- the first command prints `0`;
- the second prints nothing;
- the third prints nothing. Every line is a scoped selector, an at-rule, declarations (indented) or a brace. If any line appears, inspect it: a selector list containing a comma inside `:not(…)` or `:is(…)` must be fixed by hand in `legacy.css`.

- [ ] **Step 7: Create** `frontend/src/legacy/LegacyScope.jsx`

```jsx
import './legacy.css';

// Renders a pre-rebuild view with its original styles, isolated under .legacy-scope.
export default function LegacyScope({ children }) {
  return <div className="legacy-scope min-h-full">{children}</div>;
}
```

- [ ] **Step 8: Build and run all tests**

Run: `cd frontend && npx vitest run && npm run build`
Expected: all pass and the build succeeds. The old UI is unchanged; `legacy.css` isn't imported by the old UI yet.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/legacy frontend/src/AppShell.jsx frontend/scripts/scope-legacy-css.mjs
git commit -m "refactor(frontend): move not-yet-redesigned views to src/legacy with scoped CSS

Claude-Session: https://claude.ai/code/session_0197kg3P6xdbTLt6Nn5BBj7Y"
```
(`git mv` already staged the deletions from `src/components/`.)

---

### Task 6: Preferences storage and theme provider

**Files:**
- Create: `frontend/src/lib/storage.js`, `frontend/src/app/ThemeProvider.jsx`
- Test: `frontend/src/lib/__tests__/storage.test.js`, `frontend/src/app/__tests__/ThemeProvider.test.jsx`

**Interfaces:**
- Produces: `readPref`, `writePref`, `usePref` (see Canonical interfaces).
- Produces: `ThemeProvider({ children })` and `useTheme() → { theme: 'light'|'dark', setTheme, toggleTheme, density: 'comfortable'|'compact', setDensity }`.
  - The resolved theme toggles the `dark` class on `document.documentElement`.
  - Prefs keys: `theme` (null = follow OS), `density`.

- [ ] **Step 1: Write the failing tests**

`frontend/src/lib/__tests__/storage.test.js`:
```js
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { readPref, writePref, usePref } from '@/lib/storage';

describe('storage', () => {
  beforeEach(() => localStorage.clear());

  it('round-trips JSON under the dockyard: prefix', () => {
    writePref('x', { a: 1 });
    expect(localStorage.getItem('dockyard:x')).toBe('{"a":1}');
    expect(readPref('x', null)).toEqual({ a: 1 });
  });

  it('returns the fallback for missing or corrupt values', () => {
    expect(readPref('missing', 'fb')).toBe('fb');
    localStorage.setItem('dockyard:bad', '{not json');
    expect(readPref('bad', 'fb')).toBe('fb');
  });

  it('never throws when storage is unavailable', () => {
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
    expect(readPref('x', 7)).toBe(7);
    expect(() => writePref('x', 1)).not.toThrow();
    get.mockRestore();
    set.mockRestore();
  });

  it('usePref persists updates, including updater functions', () => {
    const { result } = renderHook(() => usePref('count', 1));
    act(() => result.current[1]((n) => n + 1));
    expect(result.current[0]).toBe(2);
    expect(readPref('count', null)).toBe(2);
  });
});
```

`frontend/src/app/__tests__/ThemeProvider.test.jsx`:
```jsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider, useTheme } from '@/app/ThemeProvider';
import { readPref } from '@/lib/storage';

function Probe() {
  const { theme, toggleTheme } = useTheme();
  return <button onClick={toggleTheme}>{theme}</button>;
}

describe('ThemeProvider', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
  });

  it('defaults to the OS preference (light in jsdom) and toggles the dark class', async () => {
    render(<ThemeProvider><Probe /></ThemeProvider>);
    expect(screen.getByRole('button')).toHaveTextContent('light');
    expect(document.documentElement).not.toHaveClass('dark');
    await userEvent.click(screen.getByRole('button'));
    expect(screen.getByRole('button')).toHaveTextContent('dark');
    expect(document.documentElement).toHaveClass('dark');
    expect(readPref('theme', null)).toBe('dark');
  });
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `cd frontend && npx vitest run src/lib src/app`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement** `frontend/src/lib/storage.js`

```js
import { useCallback, useState } from 'react';

const PREFIX = 'dockyard:';

// Per-browser conveniences only. Storage may be blocked (private mode, previews),
// so every access is guarded and the app must work with the fallback.
export function readPref(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function writePref(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // ignore: preference simply won't persist
  }
}

export function usePref(key, fallback) {
  const [value, setValue] = useState(() => readPref(key, fallback));
  const set = useCallback(
    (next) =>
      setValue((prev) => {
        const resolved = typeof next === 'function' ? next(prev) : next;
        writePref(key, resolved);
        return resolved;
      }),
    [key],
  );
  return [value, set];
}
```

- [ ] **Step 4: Implement** `frontend/src/app/ThemeProvider.jsx`

```jsx
import { createContext, useContext, useEffect, useMemo } from 'react';
import { usePref } from '@/lib/storage';

const ThemeContext = createContext(null);

function systemTheme() {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function ThemeProvider({ children }) {
  const [stored, setTheme] = usePref('theme', null); // null → follow OS
  const [density, setDensity] = usePref('density', 'comfortable');
  const theme = stored ?? systemTheme();

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  const value = useMemo(
    () => ({
      theme,
      setTheme,
      toggleTheme: () => setTheme(theme === 'dark' ? 'light' : 'dark'),
      density,
      setDensity,
    }),
    [theme, density, setTheme, setDensity],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}
```

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `cd frontend && npx vitest run src/lib src/app`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/storage.js frontend/src/lib/__tests__/storage.test.js frontend/src/app/ThemeProvider.jsx frontend/src/app/__tests__/ThemeProvider.test.jsx
git commit -m "feat(frontend): safe preference storage and theme provider

Claude-Session: https://claude.ai/code/session_0197kg3P6xdbTLt6Nn5BBj7Y"
```

---

### Task 7: Data layer: API client, image/container helpers, React Query hooks

**Files:**
- Move: `frontend/src/api.js` → `frontend/src/lib/api.js` (then edit)
- Modify: import paths in `frontend/src/AppShell.jsx`, `frontend/src/components/*.jsx`, `frontend/src/legacy/*.jsx`, `frontend/src/legacy/settings/*.jsx`
- Create: `frontend/src/lib/image.js`, `frontend/src/lib/containers.js`, `frontend/src/lib/queries.js`
- Test: `frontend/src/lib/__tests__/image.test.js`, `frontend/src/lib/__tests__/containers.test.js`, `frontend/src/lib/__tests__/queries.test.jsx`

**Interfaces:**
- Produces: exactly the `lib/api.js`, `lib/image.js`, `lib/containers.js` and `lib/queries.js` exports listed under Canonical interfaces.

- [ ] **Step 1: Move the API module and repoint every import**

```bash
cd frontend
git mv src/api.js src/lib/api.js
sed -i "s#from './api'#from './lib/api'#" src/AppShell.jsx
sed -i "s#from '../api'#from '../lib/api'#; s#from \"../api\"#from \"../lib/api\"#" src/components/*.jsx src/legacy/*.jsx
sed -i "s#from '../../api'#from '../../lib/api'#; s#from \"../../api\"#from \"../../lib/api\"#" src/legacy/settings/*.jsx
grep -rnE "from ['\"](\.\./)+api['\"]|from ['\"]\./api['\"]" src || echo "all imports updated"
```
Expected: `all imports updated`.

- [ ] **Step 2: Add the new helpers to** `frontend/src/lib/api.js`

1. Change `containerAction` to use `readError`:
```js
export async function containerAction(env, containerName, action, body) {
  const r = await fetch(`${BASE}/containers/${env}/${encodeURIComponent(containerName)}/${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw await readError(r);
  return r.json();
}
```
2. Change `fetchContainers` so its failure also uses `throw await readError(r);`.
3. Append:
```js
// ─── Rebuild helpers ─────────────────────────────────────────────────────────

export async function fetchDeploySuggestions(env, service, { image = "", current = "" } = {}) {
  const params = new URLSearchParams({ image, current });
  const r = await fetch(`${BASE}/deploy-suggestions/${env}/${encodeURIComponent(service)}?${params}`);
  if (!r.ok) throw await readError(r);
  return r.json();
}

export function fetchVersionInfo(env, containerName, { stackPath, serviceName }) {
  return containerAction(env, containerName, "version-info", { stackPath, serviceName });
}
```

- [ ] **Step 3: Write the failing helper tests**

`frontend/src/lib/__tests__/image.test.js`: uses the same fixture table as `backend/services/suggestions.test.js`.
```js
import { describe, it, expect } from 'vitest';
import { splitImage, imageTag } from '@/lib/image';

const IMAGE_CASES = [
  ['reg.example.com/ns/frontend:16.3.0-20', 'reg.example.com/ns/frontend', '16.3.0-20'],
  ['192.0.2.1:5000/app', '192.0.2.1:5000/app', 'latest'],
  ['192.0.2.1:5000/app:1.2', '192.0.2.1:5000/app', '1.2'],
  ['repo/app@sha256:abc123', 'repo/app', 'sha256:abc123'],
  ['app', 'app', 'latest'],
  ['', '', 'latest'],
];

describe('splitImage', () => {
  it.each(IMAGE_CASES)('%s', (image, repo, tag) => {
    expect(splitImage(image)).toEqual({ repo, tag });
    expect(imageTag(image)).toBe(tag);
  });
  it('treats undefined as empty', () => expect(splitImage(undefined)).toEqual({ repo: '', tag: 'latest' }));
});
```

`frontend/src/lib/__tests__/containers.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { flattenEnv, findContainer, describeState, formatAgo } from '@/lib/containers';

const NOW = Date.parse('2026-09-25T12:00:00Z');
const data = {
  stacks: [
    { name: 'Main', path: '/m.yml', containers: [{ name: 'web', serviceName: 'web', status: 'running', stackName: 'Main', stackPath: '/m.yml' }] },
  ],
  standalone: [{ name: 'dozzle', status: 'running', standalone: true, stackPath: null }],
};

describe('flattenEnv / findContainer', () => {
  it('lists stack containers then standalone ones', () => {
    expect(flattenEnv(data).map((c) => c.name)).toEqual(['web', 'dozzle']);
  });
  it('returns [] for missing data', () => expect(flattenEnv(undefined)).toEqual([]));
  it('finds by container name or returns null', () => {
    expect(findContainer(data, 'dozzle').standalone).toBe(true);
    expect(findContainer(data, 'nope')).toBeNull();
    expect(findContainer(undefined, 'web')).toBeNull();
  });
});

describe('formatAgo', () => {
  it.each([
    ['2026-09-25T11:59:40Z', 'just now'],
    ['2026-09-25T11:55:00Z', '5m'],
    ['2026-09-25T09:00:00Z', '3h'],
    ['2026-09-22T12:00:00Z', '3d'],
  ])('%s → %s', (iso, out) => expect(formatAgo(iso, NOW)).toBe(out));
  it('handles missing input', () => expect(formatAgo(null, NOW)).toBe(''));
});

describe('describeState', () => {
  it('healthy running container', () => {
    expect(describeState({ status: 'running', health: 'healthy', startedAt: '2026-09-22T12:00:00Z', restartCount: 0 }, NOW))
      .toEqual({ tone: 'ok', label: 'healthy', detail: 'healthy · 3d' });
  });
  it('running without healthcheck', () => {
    expect(describeState({ status: 'running', health: null, startedAt: '2026-09-25T09:00:00Z' }, NOW))
      .toEqual({ tone: 'ok', label: 'running', detail: 'running · 3h' });
  });
  it('unhealthy is bad, starting is warn', () => {
    expect(describeState({ status: 'running', health: 'unhealthy', startedAt: null }, NOW).tone).toBe('bad');
    expect(describeState({ status: 'running', health: 'starting', startedAt: null }, NOW).tone).toBe('warn');
  });
  it('restart loops are called out', () => {
    expect(describeState({ status: 'running', health: null, startedAt: '2026-09-25T11:55:00Z', restartCount: 4 }, NOW))
      .toEqual({ tone: 'warn', label: 'restarting', detail: 'restarting ×4 · 5m' });
  });
  it('stopped shows the exit code and when', () => {
    expect(describeState({ status: 'stopped', exitCode: 1, finishedAt: '2026-09-25T10:00:00Z' }, NOW))
      .toEqual({ tone: 'bad', label: 'stopped', detail: 'exited (1) · 2h' });
  });
  it('unknown status is idle', () => {
    expect(describeState({ status: 'unknown' }, NOW)).toEqual({ tone: 'idle', label: 'unknown', detail: 'unknown' });
  });
});
```

- [ ] **Step 4: Run them and confirm they fail**

Run: `cd frontend && npx vitest run src/lib`
Expected: FAIL, `@/lib/image` and `@/lib/containers` not found.

- [ ] **Step 5: Implement** `frontend/src/lib/image.js`

```js
// Must match backend/services/suggestions.js splitImage (same fixture table in both test suites).
export function splitImage(image = '') {
  const ref = image ?? '';
  const at = ref.indexOf('@');
  if (at !== -1) return { repo: ref.slice(0, at), tag: ref.slice(at + 1) };
  const slash = ref.lastIndexOf('/');
  const colon = ref.lastIndexOf(':');
  if (colon > slash) return { repo: ref.slice(0, colon), tag: ref.slice(colon + 1) };
  return { repo: ref, tag: 'latest' };
}

export function imageTag(image) {
  return splitImage(image).tag;
}
```

- [ ] **Step 6: Implement** `frontend/src/lib/containers.js`

```js
export function flattenEnv(data) {
  if (!data) return [];
  return [...(data.stacks || []).flatMap((s) => s.containers || []), ...(data.standalone || [])];
}

export function findContainer(data, name) {
  return flattenEnv(data).find((c) => c.name === name) ?? null;
}

export function formatAgo(iso, now = Date.now()) {
  if (!iso) return '';
  const secs = Math.max(0, Math.floor((now - Date.parse(iso)) / 1000));
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

const join = (...parts) => parts.filter(Boolean).join(' · ');

export function describeState(c, now = Date.now()) {
  if (c.status === 'running') {
    const up = formatAgo(c.startedAt, now);
    if (c.health === 'unhealthy') return { tone: 'bad', label: 'unhealthy', detail: join('unhealthy', up) };
    if (c.health === 'starting') return { tone: 'warn', label: 'starting', detail: join('starting', up) };
    if ((c.restartCount ?? 0) > 0) return { tone: 'warn', label: 'restarting', detail: join(`restarting ×${c.restartCount}`, up) };
    const label = c.health === 'healthy' ? 'healthy' : 'running';
    return { tone: 'ok', label, detail: join(label, up) };
  }
  if (c.status === 'stopped') {
    const code = c.exitCode ?? null;
    return { tone: 'bad', label: 'stopped', detail: join(code === null ? 'stopped' : `exited (${code})`, formatAgo(c.finishedAt, now)) };
  }
  return { tone: 'idle', label: 'unknown', detail: 'unknown' };
}
```

- [ ] **Step 7: Run the helper tests and confirm they pass**

Run: `cd frontend && npx vitest run src/lib`
Expected: all pass.

- [ ] **Step 8: Write the failing query test** `frontend/src/lib/__tests__/queries.test.jsx`

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as api from '@/lib/api';
import { useEnvKeys, useAllEnvs, useContainerAction, usePendingAction, qk } from '@/lib/queries';

vi.mock('@/lib/api');

function wrapperWith(client) {
  return ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
const newClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

describe('queries', () => {
  beforeEach(() => vi.resetAllMocks());

  it('useEnvKeys keeps settings order', async () => {
    api.fetchSettingsServers.mockResolvedValue([{ env_key: 'dev' }, { env_key: 'prod' }]);
    const { result } = renderHook(() => useEnvKeys(), { wrapper: wrapperWith(newClient()) });
    await waitFor(() => expect(result.current).toEqual(['dev', 'prod']));
  });

  it('useAllEnvs keeps last data when a refetch fails (stale)', async () => {
    api.fetchSettingsServers.mockResolvedValue([{ env_key: 'dev' }]);
    api.fetchContainers.mockResolvedValueOnce({ stacks: [], standalone: [] }).mockRejectedValueOnce(new Error('ssh down'));
    const client = newClient();
    const { result } = renderHook(() => useAllEnvs(), { wrapper: wrapperWith(client) });
    await waitFor(() => expect(result.current[0]?.data).toBeTruthy());
    await act(() => client.refetchQueries({ queryKey: qk.containers('dev') }));
    await waitFor(() => expect(result.current[0].isError).toBe(true));
    expect(result.current[0].data).toEqual({ stacks: [], standalone: [] });
  });

  it('useContainerAction sends the container context and exposes pending state', async () => {
    let release;
    api.containerAction.mockImplementation(() => new Promise((r) => { release = r; }));
    const client = newClient();
    const wrapper = wrapperWith(client);
    const container = { name: 'web', serviceName: 'web', stackPath: '/m.yml', stackName: 'Main' };
    const { result } = renderHook(
      () => ({ m: useContainerAction('dev'), pending: usePendingAction('dev', 'web') }),
      { wrapper },
    );
    act(() => { result.current.m.mutate({ container, action: 'restart', endpoint: 'restart', body: {} }); });
    await waitFor(() => expect(result.current.pending).toEqual({ action: 'restart', body: {} }));
    expect(api.containerAction).toHaveBeenCalledWith('dev', 'web', 'restart', {
      stackPath: '/m.yml', serviceName: 'web', stackName: 'Main',
    });
    await act(async () => release({ ok: true }));
    await waitFor(() => expect(result.current.pending).toBeNull());
  });
});
```

- [ ] **Step 9: Run it and confirm it fails**

Run: `cd frontend && npx vitest run src/lib/__tests__/queries.test.jsx`
Expected: FAIL, `@/lib/queries` not found.

- [ ] **Step 10: Implement** `frontend/src/lib/queries.js`

```js
import { keepPreviousData, useMutation, useMutationState, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { containerAction, fetchContainers, fetchSettingsServers } from '@/lib/api';

export const ENV_POLL_MS = 30000;
export const ACTION_KEY = 'container-action';

export const qk = {
  servers: ['servers'],
  containers: (env) => ['containers', env],
  history: (env, container, limit) => ['history', env ?? 'all', container ?? '', limit],
  suggestions: (env, service, image, current) => ['suggestions', env, service, image, current],
  buildProjects: ['build-projects'],
  buildRuns: (project) => ['build-runs', project],
  maintenance: (env) => ['maintenance', env],
};

export function useServers() {
  return useQuery({ queryKey: qk.servers, queryFn: fetchSettingsServers, staleTime: 60000 });
}

export function useEnvKeys() {
  const { data } = useServers();
  return (data || []).map((s) => s.env_key);
}

export function envQueryOptions(env) {
  return {
    queryKey: qk.containers(env),
    queryFn: () => fetchContainers(env),
    enabled: !!env,
    refetchInterval: ENV_POLL_MS,
    refetchIntervalInBackground: false,
    retry: 1,
    placeholderData: keepPreviousData,
  };
}

export function useEnvContainers(env) {
  return useQuery(envQueryOptions(env));
}

// One entry per env, in settings order. `data` survives failed refetches (stale).
export function useAllEnvs() {
  const envs = useEnvKeys();
  const results = useQueries({ queries: envs.map(envQueryOptions) });
  return envs.map((env, i) => {
    const q = results[i];
    return {
      env,
      data: q.data,
      isLoading: q.isLoading,
      isError: q.isError,
      error: q.error,
      isFetching: q.isFetching,
      dataUpdatedAt: q.dataUpdatedAt,
    };
  });
}

// One hook instance can act on many containers of an env (the bulk bar does).
// variables: { container, action (logical name), endpoint, body }
export function useContainerAction(env) {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: [ACTION_KEY, env],
    mutationFn: ({ container, endpoint, body }) =>
      containerAction(env, container.name, endpoint, {
        stackPath: container.stackPath,
        serviceName: container.serviceName || container.name,
        stackName: container.stackName || '',
        ...body,
      }),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.containers(env) }),
  });
}

// Pending action for one container, from any useContainerAction instance of that env.
export function usePendingAction(env, containerName) {
  const pending = useMutationState({
    filters: {
      mutationKey: [ACTION_KEY, env],
      status: 'pending',
      predicate: (m) => m.state.variables?.container?.name === containerName,
    },
    select: (m) => ({ action: m.state.variables.action, body: m.state.variables.body }),
  });
  return pending[0] ?? null;
}
```

- [ ] **Step 11: Run all frontend tests and the build**

Run: `cd frontend && npx vitest run && npm run build`
Expected: all pass; the old UI still builds.

- [ ] **Step 12: Commit**

```bash
git add frontend/src/lib frontend/src/AppShell.jsx frontend/src/components frontend/src/legacy
git commit -m "feat(frontend): data layer with React Query hooks and shared image parsing

Claude-Session: https://claude.ai/code/session_0197kg3P6xdbTLt6Nn5BBj7Y"
```

---

### Task 8: App shell: theme tokens, providers, router, sidebar, drawer URL state

This task switches `main.jsx` to the new shell. The old dashboard components stay on disk, unused, until Task 20.

**Files:**
- Replace: `frontend/src/main.jsx`, `frontend/src/index.css`
- Create:
  - `frontend/src/app/AppProviders.jsx`, `router.jsx`, `layoutContext.js`, `AppLayout.jsx`, `PageHeader.jsx`, `Sidebar.jsx`, `envSummary.js`
  - `frontend/src/components/status.jsx`
  - `frontend/src/features/container/useDrawer.js`
  - `frontend/src/features/overview/OverviewPage.jsx` (placeholder; Task 11 replaces it)
  - `frontend/src/features/env/EnvPage.jsx` (placeholder; Task 12 replaces it)
  - `frontend/src/test/renderApp.jsx`
- Test: `frontend/src/app/__tests__/envSummary.test.js`, `frontend/src/app/__tests__/shell.test.jsx`, `frontend/src/features/container/__tests__/useDrawer.test.jsx`

**Interfaces:**
- Consumes:
  - `useAllEnvs`, `useServers` (Task 7)
  - `ThemeProvider`, `useTheme` (Task 6)
  - `LegacyScope` and the legacy views (Task 5)
- Produces:
  - `AppProviders({ queryClient, children })`: QueryClient + Theme + Tooltip + Toaster. Task 10 adds `DialogProvider` inside it.
  - `routes` (array for `createBrowserRouter` / `createMemoryRouter`)
  - `useLayout() → { activityOpen, setActivityOpen, toggleActivity }` from `@/app/layoutContext` (Task 19 adds `openPalette`)
  - `PageHeader({ title, subtitle?, children? })`
  - `envSummary({ data, isLoading, isError }) → { status: 'loading'|'unknown'|'offline'|'degraded'|'healthy', tone, label }`
  - from `@/components/status`:
    - `StatusDot({ tone, className? })`
    - `StatusBadge({ tone, children, className? })`
    - `Tag({ children, tone?, className? })`
    - `toneText`, `toneBg` maps
    - tone ∈ `ok|warn|bad|idle`
  - `useDrawer()` (Canonical interfaces)
  - `renderApp(path, { routes?, queryClient? }) → { router, queryClient, ...RTL utils }` (test helper)

- [ ] **Step 1: Replace** `frontend/src/index.css`

```css
@import "tailwindcss";
@import "tw-animate-css";

@custom-variant dark (&:is(.dark *));

:root {
  --radius: 0.5rem;
  --background: #f7f8fa;
  --foreground: #1c2030;
  --card: #ffffff;
  --card-foreground: #1c2030;
  --popover: #ffffff;
  --popover-foreground: #1c2030;
  --primary: #3b5bdb;
  --primary-foreground: #ffffff;
  --secondary: #f1f3f7;
  --secondary-foreground: #1c2030;
  --muted: #f1f3f7;
  --muted-foreground: #5f6678;
  --accent: #eef2ff;
  --accent-foreground: #3b5bdb;
  --destructive: #b42318;
  --border: #e3e6ec;
  --input: #d9dde5;
  --ring: #3b5bdb;
  --sidebar: #ffffff;
  --status-ok: #1f7a45;
  --status-ok-bg: #e8f7ee;
  --status-warn: #9a5b00;
  --status-warn-bg: #fff4e0;
  --status-bad: #b42318;
  --status-bad-bg: #fdecec;
  --status-idle: #4a5068;
  --status-idle-bg: #f1f3f7;
}

.dark {
  --background: #0f1115;
  --foreground: #e6e8ee;
  --card: #161920;
  --card-foreground: #e6e8ee;
  --popover: #161920;
  --popover-foreground: #e6e8ee;
  --primary: #3b5bdb;
  --primary-foreground: #ffffff;
  --secondary: #1d212b;
  --secondary-foreground: #e6e8ee;
  --muted: #1d212b;
  --muted-foreground: #a0a8b9;
  --accent: #1e2540;
  --accent-foreground: #b4c3ff;
  --destructive: #f07178;
  --border: #262b36;
  --input: #2f3542;
  --ring: #6a86f0;
  --sidebar: #12151b;
  --status-ok: #5fd394;
  --status-ok-bg: #12281c;
  --status-warn: #f0b44c;
  --status-warn-bg: #2a2213;
  --status-bad: #f58a8f;
  --status-bad-bg: #2e1519;
  --status-idle: #a0a8b9;
  --status-idle-bg: #1d212b;
}

@theme inline {
  --font-sans: "Inter Variable", ui-sans-serif, system-ui, sans-serif;
  --font-mono: "JetBrains Mono Variable", ui-monospace, monospace;
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-sidebar: var(--sidebar);
  --color-ok: var(--status-ok);
  --color-ok-bg: var(--status-ok-bg);
  --color-warn: var(--status-warn);
  --color-warn-bg: var(--status-warn-bg);
  --color-bad: var(--status-bad);
  --color-bad-bg: var(--status-bad-bg);
  --color-idle: var(--status-idle);
  --color-idle-bg: var(--status-idle-bg);
}

@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  body {
    @apply bg-background text-foreground font-sans text-[13px] antialiased;
  }
}

@media (prefers-reduced-motion: reduce) {
  *, ::before, ::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

- [ ] **Step 2: Create** `frontend/src/components/status.jsx`

```jsx
import { cn } from '@/lib/utils';

export const toneText = { ok: 'text-ok', warn: 'text-warn', bad: 'text-bad', idle: 'text-idle' };
export const toneBg = {
  ok: 'bg-ok-bg text-ok',
  warn: 'bg-warn-bg text-warn',
  bad: 'bg-bad-bg text-bad',
  idle: 'bg-idle-bg text-idle',
};
const toneDot = { ok: 'bg-ok', warn: 'bg-warn', bad: 'bg-bad', idle: 'bg-idle' };

// Decorative; always pair with a text label (status is never color-only).
export function StatusDot({ tone = 'idle', className }) {
  return <span aria-hidden="true" className={cn('inline-block size-2 shrink-0 rounded-full', toneDot[tone], className)} />;
}

export function StatusBadge({ tone = 'idle', children, className }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium', toneBg[tone], className)}>
      <StatusDot tone={tone} />
      {children}
    </span>
  );
}

export function Tag({ children, tone, className }) {
  return (
    <span className={cn('rounded-[5px] px-1.5 py-px font-mono text-[12.5px] whitespace-nowrap', tone ? toneBg[tone] : 'bg-muted', className)}>
      {children}
    </span>
  );
}
```

- [ ] **Step 3: Write the failing tests**

`frontend/src/app/__tests__/envSummary.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { envSummary } from '@/app/envSummary';

const data = (statuses, standalone = []) => ({
  stacks: [{ containers: statuses.map((status, i) => ({ name: `c${i}`, status })) }],
  standalone,
});

describe('envSummary', () => {
  it('loading before first data', () => {
    expect(envSummary({ isLoading: true })).toMatchObject({ status: 'loading', label: '' });
  });
  it('offline on error even when stale data exists', () => {
    expect(envSummary({ isError: true, data: data(['running']) })).toEqual({ status: 'offline', tone: 'bad', label: 'offline' });
  });
  it('counts down containers, ignoring standalone ones', () => {
    expect(envSummary({ data: data(['running', 'stopped', 'stopped'], [{ status: 'stopped', standalone: true }]) }))
      .toEqual({ status: 'degraded', tone: 'warn', label: '2 down' });
  });
  it('healthy shows the container count', () => {
    expect(envSummary({ data: data(['running', 'running']) })).toEqual({ status: 'healthy', tone: 'ok', label: '2' });
  });
});
```

`frontend/src/features/container/__tests__/useDrawer.test.jsx`:
```jsx
import { describe, it, expect } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { useDrawer } from '@/features/container/useDrawer';

let api;
function Probe() {
  api = useDrawer();
  return <pre data-testid="state">{JSON.stringify({ open: api.open, tab: api.tab, prefillTag: api.prefillTag })}</pre>;
}
const setup = (path) => {
  const router = createMemoryRouter(
    [{ path: '/', element: <Probe /> }, { path: '/env/:env', element: <Probe /> }, { path: '/env/:env/:container', element: <Probe /> }],
    { initialEntries: [path] },
  );
  render(<RouterProvider router={router} />);
  return router;
};
const state = () => JSON.parse(screen.getByTestId('state').textContent);

describe('useDrawer', () => {
  it('is closed by default and falls back to the deploy tab', () => {
    setup('/?tab=bogus');
    expect(state()).toEqual({ open: null, tab: 'deploy', prefillTag: null });
  });

  it('opens via ?open= on the overview, with prefill', () => {
    const router = setup('/');
    act(() => api.openDrawer('stage', 'frontend', 'deploy', { prefillTag: '1.2' }));
    expect(router.state.location.search).toBe('?open=stage%2Ffrontend&tab=deploy&tag=1.2');
    expect(state()).toEqual({ open: { env: 'stage', container: 'frontend' }, tab: 'deploy', prefillTag: '1.2' });
    act(() => api.closeDrawer());
    expect(router.state.location.search).toBe('');
  });

  it('uses the path on environment pages', () => {
    const router = setup('/env/stage');
    act(() => api.openDrawer('stage', 'frontend', 'logs'));
    expect(router.state.location.pathname).toBe('/env/stage/frontend');
    expect(state()).toMatchObject({ open: { env: 'stage', container: 'frontend' }, tab: 'logs' });
    act(() => api.setTab('env'));
    expect(state().tab).toBe('env');
    act(() => api.closeDrawer());
    expect(router.state.location.pathname).toBe('/env/stage');
  });
});
```

`frontend/src/app/__tests__/shell.test.jsx`:
```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import * as api from '@/lib/api';
import { renderApp } from '@/test/renderApp';

vi.mock('@/lib/api');

beforeEach(() => {
  vi.resetAllMocks();
  api.fetchSettingsServers.mockResolvedValue([{ env_key: 'dev' }, { env_key: 'prod' }]);
  api.fetchContainers.mockImplementation(async (env) => {
    if (env === 'prod') throw new Error('ssh timeout');
    return { stacks: [{ name: 'Main', path: '/m', containers: [{ name: 'a', status: 'stopped' }, { name: 'b', status: 'running' }] }], standalone: [] };
  });
  api.fetchHistory.mockResolvedValue([]);
});

describe('app shell', () => {
  it('lists environments in settings order with their status', async () => {
    renderApp('/');
    const nav = screen.getByRole('navigation', { name: 'Main' });
    const dev = await within(nav).findByRole('link', { name: /dev.*1 down/ });
    const prod = await within(nav).findByRole('link', { name: /prod.*offline/ });
    expect(dev.compareDocumentPosition(prod) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('renders a legacy view inside the legacy scope', async () => {
    const { container } = renderApp('/history');
    expect(await screen.findByText('Deployment History')).toBeInTheDocument();
    expect(container.querySelector('.legacy-scope')).not.toBeNull();
  });
});
```

- [ ] **Step 4: Run them and confirm they fail**

Run: `cd frontend && npx vitest run src/app src/features`
Expected: FAIL, modules not found.

- [ ] **Step 5: Implement** `frontend/src/app/envSummary.js`

```js
import { flattenEnv } from '@/lib/containers';

export function envSummary({ data, isLoading, isError }) {
  if (isError) return { status: 'offline', tone: 'bad', label: 'offline' };
  if (!data) return { status: isLoading ? 'loading' : 'unknown', tone: 'idle', label: '' };
  const compose = flattenEnv(data).filter((c) => !c.standalone);
  const down = compose.filter((c) => c.status !== 'running').length;
  if (down > 0) return { status: 'degraded', tone: 'warn', label: `${down} down` };
  return { status: 'healthy', tone: 'ok', label: String(compose.length) };
}
```

- [ ] **Step 6: Implement** `frontend/src/features/container/useDrawer.js`

```js
import { useCallback } from 'react';
import { useLocation, useMatch, useNavigate, useSearchParams } from 'react-router';

const TABS = ['deploy', 'logs', 'env', 'info', 'history'];

// Drawer state lives in the URL:
//   /env/:env/:container?tab=…            on environment pages
//   <any path>?open=:env/:container&tab=… everywhere else (Overview, legacy pages)
export function useDrawer() {
  const match = useMatch('/env/:env/:container');
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();

  let open = null;
  if (match) {
    open = { env: match.params.env, container: match.params.container };
  } else {
    const raw = search.get('open');
    const slash = raw ? raw.indexOf('/') : -1;
    if (slash > 0) open = { env: raw.slice(0, slash), container: raw.slice(slash + 1) };
  }
  const tabParam = search.get('tab');
  const tab = TABS.includes(tabParam) ? tabParam : 'deploy';
  const prefillTag = search.get('tag');
  const onEnvPage = location.pathname.startsWith('/env/');

  const openDrawer = useCallback(
    (env, containerName, nextTab = 'deploy', { prefillTag: tag } = {}) => {
      if (onEnvPage) {
        const params = new URLSearchParams({ tab: nextTab });
        if (tag) params.set('tag', tag);
        navigate(`/env/${env}/${encodeURIComponent(containerName)}?${params}`);
        return;
      }
      const next = new URLSearchParams(location.search);
      next.set('open', `${env}/${containerName}`);
      next.set('tab', nextTab);
      if (tag) next.set('tag', tag);
      else next.delete('tag');
      navigate({ pathname: location.pathname, search: `?${next}` });
    },
    [navigate, location.pathname, location.search, onEnvPage],
  );

  const setTab = useCallback(
    (nextTab) => {
      const next = new URLSearchParams(location.search);
      next.set('tab', nextTab);
      next.delete('tag');
      navigate({ pathname: location.pathname, search: `?${next}` }, { replace: true });
    },
    [navigate, location.pathname, location.search],
  );

  const closeDrawer = useCallback(() => {
    if (match) {
      navigate(`/env/${match.params.env}`);
      return;
    }
    const next = new URLSearchParams(location.search);
    ['open', 'tab', 'tag'].forEach((k) => next.delete(k));
    const qs = next.toString();
    navigate({ pathname: location.pathname, search: qs ? `?${qs}` : '' });
  }, [navigate, match, location.pathname, location.search]);

  return { open, tab, prefillTag, openDrawer, setTab, closeDrawer };
}
```

- [ ] **Step 7: Create the providers, layout, header and sidebar**

`frontend/src/app/AppProviders.jsx`:
```jsx
import { QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider, useTheme } from '@/app/ThemeProvider';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/sonner';

function ThemedToaster() {
  const { theme } = useTheme();
  return <Toaster theme={theme} position="bottom-right" closeButton />;
}

export function AppProviders({ queryClient, children }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider delayDuration={300}>
          {children}
          <ThemedToaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
```

`frontend/src/app/PageHeader.jsx`:
```jsx
export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-b bg-card px-6 py-4">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold">{title}</h1>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      <div className="ml-auto flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}
```

`frontend/src/app/Sidebar.jsx`:
```jsx
import { useEffect, useState } from 'react';
import { NavLink } from 'react-router';
import { Anchor, Database, Hammer, History, LayoutGrid, Moon, Settings, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusDot, toneText } from '@/components/status';
import { useTheme } from '@/app/ThemeProvider';
import { envSummary } from '@/app/envSummary';
import { useAllEnvs } from '@/lib/queries';
import { cn } from '@/lib/utils';

const itemClass = ({ isActive }) =>
  cn(
    'flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px]',
    isActive ? 'bg-accent font-medium text-accent-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
  );

function SectionLabel({ children }) {
  return <div className="mt-4 mb-1 px-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{children}</div>;
}

export default function Sidebar({ onNavigate }) {
  const envs = useAllEnvs();
  const { theme, toggleTheme } = useTheme();
  const [buildInfo, setBuildInfo] = useState(null);

  useEffect(() => {
    fetch('/build-info.json')
      .then((r) => (r.ok ? r.json() : null))
      .then(setBuildInfo)
      .catch(() => {});
  }, []);

  return (
    <nav aria-label="Main" className="flex h-full w-full flex-col p-3">
      <div className="mb-3 flex items-center gap-2 px-2 text-[15px] font-semibold">
        <Anchor className="size-4 text-primary" aria-hidden="true" /> Dockyard
      </div>
      <NavLink to="/" end className={itemClass} onClick={onNavigate}>
        <LayoutGrid className="size-4" aria-hidden="true" /> Overview
      </NavLink>

      <SectionLabel>Environments</SectionLabel>
      {envs.map((e) => {
        const s = envSummary(e);
        return (
          <NavLink key={e.env} to={`/env/${e.env}`} className={itemClass} onClick={onNavigate}>
            <StatusDot tone={s.tone} />
            <span className="flex-1">{e.env}</span>
            {s.status === 'loading' ? (
              <Skeleton className="h-3 w-6" />
            ) : (
              <span className={cn('text-[11px]', s.tone === 'ok' ? 'text-muted-foreground' : toneText[s.tone])}>{s.label}</span>
            )}
          </NavLink>
        );
      })}

      <SectionLabel>Tools</SectionLabel>
      <NavLink to="/builds" className={itemClass} onClick={onNavigate}>
        <Hammer className="size-4" aria-hidden="true" /> <span className="flex-1">Builds</span>
      </NavLink>
      <NavLink to="/migrations" className={itemClass} onClick={onNavigate}>
        <Database className="size-4" aria-hidden="true" /> Migrations
      </NavLink>
      <NavLink to="/history" className={itemClass} onClick={onNavigate}>
        <History className="size-4" aria-hidden="true" /> History
      </NavLink>
      <NavLink to="/settings" className={itemClass} onClick={onNavigate}>
        <Settings className="size-4" aria-hidden="true" /> Settings
      </NavLink>

      <div className="mt-auto flex items-center gap-2 px-2 pt-4 text-[11px] text-muted-foreground">
        <Button variant="ghost" size="icon" className="size-7" onClick={toggleTheme} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}>
          {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </Button>
        {buildInfo?.shortCommit && buildInfo.shortCommit !== 'unknown' && (
          <span title={`Branch: ${buildInfo.branch}\nCommit: ${buildInfo.commit}\nBuilt: ${buildInfo.buildTime}`}>
            build {buildInfo.shortCommit}
          </span>
        )}
      </div>
    </nav>
  );
}
```

`frontend/src/app/layoutContext.js`: kept separate so panels can use the layout without importing `AppLayout`, which avoids import cycles.
```js
import { createContext, useContext } from 'react';

export const LayoutContext = createContext(null);

export function useLayout() {
  const ctx = useContext(LayoutContext);
  if (!ctx) throw new Error('useLayout must be used inside <AppLayout>');
  return ctx;
}
```

`frontend/src/app/AppLayout.jsx`:
```jsx
import { useCallback, useMemo, useState } from 'react';
import { Outlet } from 'react-router';
import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import Sidebar from '@/app/Sidebar';
import { LayoutContext } from '@/app/layoutContext';
import { usePref } from '@/lib/storage';

export default function AppLayout() {
  const [activityOpen, setActivityOpen] = usePref('activityOpen', false);
  const [navOpen, setNavOpen] = useState(false);
  const toggleActivity = useCallback(() => setActivityOpen((o) => !o), [setActivityOpen]);
  const layout = useMemo(() => ({ activityOpen, setActivityOpen, toggleActivity }), [activityOpen, setActivityOpen, toggleActivity]);

  return (
    <LayoutContext.Provider value={layout}>
      <div className="flex h-dvh overflow-hidden bg-background">
        <aside className="hidden w-56 shrink-0 border-r bg-sidebar md:block">
          <Sidebar />
        </aside>
        <Sheet open={navOpen} onOpenChange={setNavOpen}>
          <SheetContent side="left" className="w-64 bg-sidebar p-0">
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <Sidebar onNavigate={() => setNavOpen(false)} />
          </SheetContent>
        </Sheet>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-12 items-center gap-2 border-b bg-card px-3 md:hidden">
            <Button variant="ghost" size="icon" aria-label="Open navigation" onClick={() => setNavOpen(true)}>
              <Menu className="size-5" />
            </Button>
            <span className="font-semibold">Dockyard</span>
          </div>
          <main className="min-h-0 flex-1 overflow-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </LayoutContext.Provider>
  );
}
```

- [ ] **Step 8: Create the router, placeholder pages, entry point and test helper**

`frontend/src/features/overview/OverviewPage.jsx` (placeholder):
```jsx
import { PageHeader } from '@/app/PageHeader';

export default function OverviewPage() {
  return <PageHeader title="Overview" />;
}
```

`frontend/src/features/env/EnvPage.jsx` (placeholder):
```jsx
import { useParams } from 'react-router';
import { PageHeader } from '@/app/PageHeader';

export default function EnvPage() {
  const { env } = useParams();
  return <PageHeader title={env} />;
}
```

`frontend/src/app/router.jsx`:
```jsx
import { Link } from 'react-router';
import AppLayout from '@/app/AppLayout';
import OverviewPage from '@/features/overview/OverviewPage';
import EnvPage from '@/features/env/EnvPage';
import LegacyScope from '@/legacy/LegacyScope';
import BuildView from '@/legacy/BuildView';
import FlywayView from '@/legacy/FlywayView';
import HistoryView from '@/legacy/HistoryView';
import SettingsView from '@/legacy/SettingsView';

function NotFound() {
  return (
    <div className="p-10 text-center">
      <p className="mb-2 text-[15px] font-semibold">Page not found</p>
      <Link className="text-primary underline" to="/">Back to Overview</Link>
    </div>
  );
}

const legacy = (View) => (
  <LegacyScope>
    <View />
  </LegacyScope>
);

export const routes = [
  {
    element: <AppLayout />,
    children: [
      { index: true, element: <OverviewPage /> },
      { path: 'env/:env', element: <EnvPage /> },
      { path: 'env/:env/:container', element: <EnvPage /> },
      { path: 'builds', element: legacy(BuildView) },
      { path: 'migrations', element: legacy(FlywayView) },
      { path: 'history', element: legacy(HistoryView) },
      { path: 'settings', element: legacy(SettingsView) },
      { path: '*', element: <NotFound /> },
    ],
  },
];
```

`frontend/src/main.jsx`:
```jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { QueryClient } from '@tanstack/react-query';
import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import './index.css';
import { routes } from './app/router';
import { AppProviders } from './app/AppProviders';

const queryClient = new QueryClient();
const router = createBrowserRouter(routes);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AppProviders queryClient={queryClient}>
      <RouterProvider router={router} />
    </AppProviders>
  </React.StrictMode>,
);
```

`frontend/src/test/renderApp.jsx`:
```jsx
import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { QueryClient } from '@tanstack/react-query';
import { AppProviders } from '@/app/AppProviders';
import { routes as appRoutes } from '@/app/router';

export function renderApp(path = '/', { routes = appRoutes, queryClient } = {}) {
  const client = queryClient ?? new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0 }, mutations: { retry: false } } });
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const utils = render(
    <AppProviders queryClient={client}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return { ...utils, router, queryClient: client };
}
```

- [ ] **Step 9: Run the tests and the build**

Run: `cd frontend && npx vitest run && npm run build`
Expected: all pass (the old `appShell`/`commandPalette` tests still pass; their files still exist). The build succeeds.

- [ ] **Step 10: Look at it in the browser (read-only)**

Run: `cd frontend && npm run dev`, with the backend running locally (`cd backend && npm run dev`, using a local `data/` DB).
Open http://localhost:3000.
Expected:
- the sidebar lists environments with status labels;
- `/builds`, `/migrations`, `/history` and `/settings` show the old views with their old look;
- toggling the theme switches the new shell between light and dark.

Stop the dev servers afterwards.

- [ ] **Step 11: Commit**

```bash
git add frontend/src/index.css frontend/src/main.jsx frontend/src/app frontend/src/components/status.jsx frontend/src/features frontend/src/test
git commit -m "feat(frontend): new app shell with router, sidebar and theme tokens

Claude-Session: https://claude.ai/code/session_0197kg3P6xdbTLt6Nn5BBj7Y"
```

---

### Task 9: Overview matrix model and drift detection

**Files:**
- Create: `frontend/src/features/overview/buildMatrix.js`, `frontend/src/features/overview/drift.js`
- Test: `frontend/src/features/overview/__tests__/buildMatrix.test.js`, `frontend/src/features/overview/__tests__/drift.test.js`

**Interfaces:**
- Consumes: the `useAllEnvs()` entry shape `{ env, data, isLoading, isError, error }` (Task 7), `imageTag` (Task 7)
- Produces:
  ```js
  buildMatrix(envResults, { showUnmanaged = false } = {}) → {
    envs: Array<{ env, state: 'loading'|'ok'|'stale'|'unreachable', error: string|null }>,
    rows: Array<{ service: string, managed: boolean,
                  cells: { [env]: Cell } }>,           // rows sorted by service name
  }
  Cell = { kind: 'present', container, tag, stale: boolean, extra: number }   // extra = same service in N more stacks
       | { kind: 'absent' }                                                   // env loaded, service not there
       | { kind: 'unknown' }                                                  // env loading / never loaded
  computeDrift(row, envOrder) → { [env]: { upstreamEnv, upstreamTag } }       // only drifting cells
  ```

- [ ] **Step 1: Write the failing tests**

`frontend/src/features/overview/__tests__/buildMatrix.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { buildMatrix } from '@/features/overview/buildMatrix';

const c = (serviceName, tag, extra = {}) => ({
  name: `${serviceName}-${extra.suffix ?? '1'}`, serviceName, image: `reg/${serviceName}:${tag}`, status: 'running', managed: true, ...extra,
});
const env = (name, stacks, over = {}) => ({
  env: name, isLoading: false, isError: false, error: null,
  data: { stacks: stacks.map((containers, i) => ({ name: `S${i}`, path: `/s${i}`, containers })), standalone: [{ name: 'dozzle', serviceName: 'dozzle', standalone: true }] },
  ...over,
});

describe('buildMatrix', () => {
  it('unions services across envs, sorted, skipping standalone containers', () => {
    const m = buildMatrix([env('dev', [[c('web', '2'), c('api', '2')]]), env('prod', [[c('web', '1')]])]);
    expect(m.rows.map((r) => r.service)).toEqual(['api', 'web']);
    expect(m.rows[0].cells.prod).toEqual({ kind: 'absent' });
    expect(m.rows[1].cells.dev).toMatchObject({ kind: 'present', tag: '2', stale: false, extra: 0 });
  });

  it('reports env states: loading, stale (error + data), unreachable (error, no data)', () => {
    const m = buildMatrix([
      { env: 'dev', isLoading: true, isError: false, data: undefined },
      env('stage', [[c('web', '1')]], { isError: true, error: new Error('ssh down') }),
      { env: 'prod', isLoading: false, isError: true, error: new Error('timeout'), data: undefined },
    ]);
    expect(m.envs).toEqual([
      { env: 'dev', state: 'loading', error: null },
      { env: 'stage', state: 'stale', error: 'ssh down' },
      { env: 'prod', state: 'unreachable', error: 'timeout' },
    ]);
    const web = m.rows[0];
    expect(web.cells.dev).toEqual({ kind: 'unknown' });
    expect(web.cells.stage).toMatchObject({ kind: 'present', stale: true });
    expect(web.cells.prod).toEqual({ kind: 'unknown' });
  });

  it('uses the first stack for a service present in several stacks and counts the rest', () => {
    const m = buildMatrix([env('dev', [[c('web', '1', { suffix: 'a' })], [c('web', '9', { suffix: 'b' })]])]);
    expect(m.rows[0].cells.dev).toMatchObject({ tag: '1', extra: 1 });
    expect(m.rows[0].cells.dev.container.name).toBe('web-a');
  });

  it('hides unmanaged-only services unless asked', () => {
    const results = [env('dev', [[c('web', '1'), c('postgres', '14', { managed: false })]])];
    expect(buildMatrix(results).rows.map((r) => r.service)).toEqual(['web']);
    const all = buildMatrix(results, { showUnmanaged: true });
    expect(all.rows.map((r) => r.service)).toEqual(['postgres', 'web']);
    expect(all.rows[0].managed).toBe(false);
  });
});
```

`frontend/src/features/overview/__tests__/drift.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { computeDrift } from '@/features/overview/drift';

const present = (tag) => ({ kind: 'present', tag });
const row = (cells) => ({ service: 'web', managed: true, cells });
const ORDER = ['dev', 'test', 'stage', 'prod'];

describe('computeDrift', () => {
  it('flags a cell whose tag differs from the nearest env to its left', () => {
    const d = computeDrift(row({ dev: present('3'), test: present('3'), stage: present('2'), prod: present('2') }), ORDER);
    expect(d).toEqual({ stage: { upstreamEnv: 'test', upstreamTag: '3' } });
  });

  it('never flags the first column', () => {
    expect(computeDrift(row({ dev: present('9'), test: present('9') }), ORDER)).toEqual({});
  });

  it('skips absent and unknown envs when looking left', () => {
    const d = computeDrift(row({ dev: present('3'), test: { kind: 'absent' }, stage: { kind: 'unknown' }, prod: present('1') }), ORDER);
    expect(d).toEqual({ prod: { upstreamEnv: 'dev', upstreamTag: '3' } });
  });

  it('ignores non-present cells themselves', () => {
    expect(computeDrift(row({ dev: present('3'), test: { kind: 'absent' } }), ORDER)).toEqual({});
  });
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `cd frontend && npx vitest run src/features/overview`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement** `frontend/src/features/overview/buildMatrix.js`

```js
import { imageTag } from '@/lib/image';

function envState(r) {
  if (r.isError) return r.data ? 'stale' : 'unreachable';
  if (!r.data) return 'loading';
  return 'ok';
}

export function buildMatrix(envResults, { showUnmanaged = false } = {}) {
  const envs = envResults.map((r) => ({ env: r.env, state: envState(r), error: r.error ? r.error.message ?? String(r.error) : null }));
  const byService = new Map(); // service → { managed, cells }

  envResults.forEach((r, i) => {
    const state = envs[i].state;
    if (!r.data) return;
    const perService = new Map(); // service → containers in stack order
    for (const stack of r.data.stacks || []) {
      for (const container of stack.containers || []) {
        const service = container.serviceName || container.name;
        if (!perService.has(service)) perService.set(service, []);
        perService.get(service).push(container);
      }
    }
    for (const [service, list] of perService) {
      if (!byService.has(service)) byService.set(service, { managed: false, cells: {} });
      const entry = byService.get(service);
      const [first] = list;
      entry.managed ||= list.some((c) => c.managed);
      entry.cells[r.env] = { kind: 'present', container: first, tag: imageTag(first.image), stale: state === 'stale', extra: list.length - 1 };
    }
  });

  const rows = [...byService.entries()]
    .filter(([, e]) => showUnmanaged || e.managed)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([service, e]) => {
      const cells = {};
      envs.forEach(({ env, state }) => {
        cells[env] = e.cells[env] ?? (state === 'ok' || state === 'stale' ? { kind: 'absent' } : { kind: 'unknown' });
      });
      return { service, managed: e.managed, cells };
    });

  return { envs, rows };
}
```

- [ ] **Step 4: Implement** `frontend/src/features/overview/drift.js`

```js
// A present cell drifts when its tag differs from the nearest present cell to its
// left: envs are ordered by promotion (Settings order), so "left" = upstream.
export function computeDrift(row, envOrder) {
  const drift = {};
  envOrder.forEach((env, i) => {
    const cell = row.cells[env];
    if (cell?.kind !== 'present') return;
    for (let j = i - 1; j >= 0; j--) {
      const up = row.cells[envOrder[j]];
      if (up?.kind !== 'present') continue;
      if (up.tag !== cell.tag) drift[env] = { upstreamEnv: envOrder[j], upstreamTag: up.tag };
      return;
    }
  });
  return drift;
}
```

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `cd frontend && npx vitest run src/features/overview`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/overview/buildMatrix.js frontend/src/features/overview/drift.js frontend/src/features/overview/__tests__
git commit -m "feat(overview): matrix model with stale envs and upstream drift detection

Claude-Session: https://claude.ai/code/session_0197kg3P6xdbTLt6Nn5BBj7Y"
```

---

### Task 10: Actions, confirmation policy, dialogs and the action runner

**Files:**
- Create: `frontend/src/features/container/actions.js`, `frontend/src/app/DialogProvider.jsx`, `frontend/src/features/container/useRunAction.js`
- Modify: `frontend/src/app/AppProviders.jsx` (wrap children in `DialogProvider`)
- Test: `frontend/src/features/container/__tests__/actions.test.js`, `frontend/src/app/__tests__/DialogProvider.test.jsx`, `frontend/src/features/container/__tests__/useRunAction.test.jsx`

**Interfaces:**
- Consumes: `useContainerAction` (Task 7), `splitImage`/`imageTag` (Task 7)
- Produces: `ACTIONS`, `isProd`, `confirmPolicy`, `describeAction` (Canonical interfaces), `DialogProvider`/`useDialogs`, `useRunAction(env)`

- [ ] **Step 1: Write the failing tests**

`frontend/src/features/container/__tests__/actions.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { ACTIONS, confirmPolicy, describeAction, isProd } from '@/features/container/actions';

describe('isProd', () => {
  it.each([['prod', true], ['PROD', true], ['production', true], ['preprod', false], ['stage', false], [undefined, false]])(
    '%s → %s', (env, out) => expect(isProd(env)).toBe(out));
});

describe('confirmPolicy (spec §6.1)', () => {
  it.each([
    ['deploy', 'stage', 'none'], ['deploy', 'prod', 'confirm'],
    ['restart', 'dev', 'none'], ['restart', 'prod', 'confirm'],
    ['pull-recreate', 'dev', 'none'], ['pull-recreate', 'prod', 'confirm'],
    ['start', 'dev', 'none'], ['start', 'prod', 'confirm'],
    ['update-env', 'dev', 'none'], ['update-env', 'prod', 'confirm'],
    ['stop', 'dev', 'confirm'], ['stop', 'prod', 'typed'],
    ['force-recreate', 'dev', 'confirm'], ['force-recreate', 'prod', 'typed'],
    ['maintenance-on', 'dev', 'confirm'], ['maintenance-on', 'prod', 'typed'],
    ['unmanage', 'dev', 'confirm'], ['unmanage', 'prod', 'typed'],
    ['maintenance-off', 'dev', 'confirm'], ['maintenance-off', 'prod', 'confirm'],
    ['manage', 'dev', 'confirm'], ['manage', 'prod', 'confirm'],
  ])('%s on %s → %s', (action, env, level) => expect(confirmPolicy(action, env)).toBe(level));

  it('rejects unknown actions loudly', () => expect(() => confirmPolicy('nuke', 'dev')).toThrow(/Unknown action/));
});

describe('ACTIONS / describeAction', () => {
  it('maps logical actions to backend endpoints', () => {
    expect(ACTIONS['force-recreate']).toEqual({ endpoint: 'up', body: { forceRecreate: true }, destructive: true });
    expect(ACTIONS.start.endpoint).toBe('up');
    expect(ACTIONS.deploy.endpoint).toBe('update-tag');
    expect(ACTIONS.unmanage.body).toEqual({ enabled: false });
  });
  it('describes a deploy with old → new', () => {
    const d = describeAction('deploy', { service: 'frontend', env: 'stage', fromTag: '1', toTag: '2' });
    expect(d.title).toBe('Deploy frontend to STAGE?');
    expect(d.description).toContain('1 → 2');
    expect(d.pending).toBe('deploying 2…');
    expect(d.success).toBe('frontend on STAGE → 2');
  });
  it('has copy for every action the policy knows', () => {
    for (const a of [...Object.keys(ACTIONS), 'maintenance-on', 'maintenance-off']) {
      const d = describeAction(a, { service: 's', env: 'dev', toTag: 't' });
      expect(d.title && d.confirmLabel && d.pending && d.success).toBeTruthy();
    }
  });
});
```

`frontend/src/app/__tests__/DialogProvider.test.jsx`:
```jsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DialogProvider, useDialogs } from '@/app/DialogProvider';

let result;
function Trigger({ opts }) {
  const { confirm } = useDialogs();
  return <button onClick={async () => { result = await confirm(opts); }}>ask</button>;
}
const setup = (opts) => {
  result = undefined;
  render(<DialogProvider><Trigger opts={opts} /></DialogProvider>);
  return userEvent.setup();
};

describe('DialogProvider.confirm', () => {
  it('resolves ok on confirm and not ok on cancel', async () => {
    const user = setup({ title: 'Restart?', description: 'd', confirmLabel: 'Restart', level: 'confirm' });
    await user.click(screen.getByText('ask'));
    await user.click(screen.getByRole('button', { name: 'Restart' }));
    expect(result).toEqual({ ok: true, password: undefined });
    await user.click(screen.getByText('ask'));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(result).toEqual({ ok: false });
  });

  it('typed level only enables confirm when the env key is typed exactly', async () => {
    const user = setup({ title: 'Stop?', description: 'd', confirmLabel: 'Stop', level: 'typed', typedValue: 'prod', destructive: true });
    await user.click(screen.getByText('ask'));
    const button = screen.getByRole('button', { name: 'Stop' });
    expect(button).toBeDisabled();
    await user.type(screen.getByLabelText(/Type prod to confirm/), 'pro');
    expect(button).toBeDisabled();
    await user.type(screen.getByLabelText(/Type prod to confirm/), 'd{Enter}');
    expect(result).toEqual({ ok: true, password: undefined });
  });

  it('collects the managed password when required', async () => {
    const user = setup({ title: 'Manage?', description: 'd', confirmLabel: 'Manage', level: 'confirm', requirePassword: true });
    await user.click(screen.getByText('ask'));
    expect(screen.getByRole('button', { name: 'Manage' })).toBeDisabled();
    await user.type(screen.getByLabelText('Managed password'), 's3cret{Enter}');
    expect(result).toEqual({ ok: true, password: 's3cret' });
  });
});
```

`frontend/src/features/container/__tests__/useRunAction.test.jsx`:
```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient } from '@tanstack/react-query';
import * as api from '@/lib/api';
import { AppProviders } from '@/app/AppProviders';
import { useRunAction } from '@/features/container/useRunAction';

vi.mock('@/lib/api');

const web = { name: 'web', serviceName: 'web', stackPath: '/m.yml', stackName: 'Main', image: 'reg/web:1.0' };

function Harness({ env, container, action, body }) {
  const run = useRunAction(env);
  return <button onClick={() => run(container, action, body)}>go</button>;
}
const setup = (props) => {
  render(
    <AppProviders queryClient={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>
      <Harness {...props} />
    </AppProviders>,
  );
  return userEvent.setup();
};

describe('useRunAction', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    api.containerAction.mockResolvedValue({ ok: true });
  });

  it('deploys on a non-prod env without a dialog and offers Undo to the previous tag', async () => {
    const user = setup({ env: 'stage', container: web, action: 'deploy', body: { newTag: '2.0' } });
    await user.click(screen.getByText('go'));
    await waitFor(() => expect(api.containerAction).toHaveBeenCalledWith('stage', 'web', 'update-tag', {
      stackPath: '/m.yml', serviceName: 'web', stackName: 'Main', newTag: '2.0',
    }));
    expect(await screen.findByText('web on STAGE → 2.0')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(api.containerAction).toHaveBeenLastCalledWith('stage', 'web', 'update-tag', expect.objectContaining({ newTag: '1.0' })));
    expect(await screen.findByText('web on STAGE → 1.0')).toBeInTheDocument();
  });

  it('requires typing the env name to stop on prod', async () => {
    const user = setup({ env: 'prod', container: web, action: 'stop' });
    await user.click(screen.getByText('go'));
    expect(api.containerAction).not.toHaveBeenCalled();
    await user.type(await screen.findByLabelText(/Type prod to confirm/), 'prod{Enter}');
    await waitFor(() => expect(api.containerAction).toHaveBeenCalledWith('prod', 'web', 'stop', expect.any(Object)));
  });

  it('offers no Undo when the previous tag is unknown (digest-pinned image)', async () => {
    const user = setup({ env: 'dev', container: { ...web, image: 'reg/web@sha256:abc' }, action: 'deploy', body: { newTag: '2.0' } });
    await user.click(screen.getByText('go'));
    expect(await screen.findByText('web on DEV → 2.0')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
  });

  it('shows a persistent error toast with details on failure', async () => {
    api.containerAction.mockRejectedValue(new Error('compose up failed: no such image'));
    const user = setup({ env: 'dev', container: web, action: 'restart' });
    await user.click(screen.getByText('go'));
    expect(await screen.findByText('Restart web on DEV failed')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Details' }));
    expect(await screen.findByText('compose up failed: no such image', { selector: 'pre' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `cd frontend && npx vitest run src/features/container src/app/__tests__/DialogProvider.test.jsx`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement** `frontend/src/features/container/actions.js`

```js
// Logical action → backend endpoint. Every container action in the UI goes through this table.
export const ACTIONS = {
  deploy: { endpoint: 'update-tag' },
  restart: { endpoint: 'restart' },
  'pull-recreate': { endpoint: 'pull-recreate' },
  start: { endpoint: 'up' },
  'force-recreate': { endpoint: 'up', body: { forceRecreate: true }, destructive: true },
  stop: { endpoint: 'stop', destructive: true },
  'update-env': { endpoint: 'update-env' },
  manage: { endpoint: 'toggle-managed', body: { enabled: true } },
  unmanage: { endpoint: 'toggle-managed', body: { enabled: false }, destructive: true },
};

export function isProd(env) {
  return /^prod/i.test(env || '');
}

const ROUTINE = new Set(['deploy', 'restart', 'pull-recreate', 'start', 'update-env']);
const RISKY = new Set(['stop', 'force-recreate', 'maintenance-on', 'unmanage']);
const ALWAYS_CONFIRM = new Set(['maintenance-off', 'manage']);

// Spec §6.1: friction scales with risk and with PROD.
export function confirmPolicy(action, env) {
  const prod = isProd(env);
  if (ROUTINE.has(action)) return prod ? 'confirm' : 'none';
  if (RISKY.has(action)) return prod ? 'typed' : 'confirm';
  if (ALWAYS_CONFIRM.has(action)) return 'confirm';
  throw new Error(`Unknown action: ${action}`);
}

export function describeAction(action, { service, env, fromTag, toTag } = {}) {
  const ENV = (env || '').toUpperCase();
  const on = `${service} on ${ENV}`;
  switch (action) {
    case 'deploy':
      return { title: `Deploy ${service} to ${ENV}?`, description: `${fromTag ?? 'unknown'} → ${toTag}. The container is recreated with the new image.`, confirmLabel: `Deploy to ${ENV}`, pending: `deploying ${toTag}…`, success: `${on} → ${toTag}` };
    case 'restart':
      return { title: `Restart ${on}?`, description: 'The container restarts with its current image and settings.', confirmLabel: 'Restart', pending: 'restarting…', success: `${on} restarted` };
    case 'pull-recreate':
      return { title: `Pull and recreate ${on}?`, description: 'Pulls the current tag again and recreates the container.', confirmLabel: 'Pull & recreate', pending: 'pulling…', success: `${on} recreated from a fresh pull` };
    case 'start':
      return { title: `Start ${on}?`, description: 'Runs docker compose up for this service.', confirmLabel: 'Start', pending: 'starting…', success: `${on} started` };
    case 'force-recreate':
      return { title: `Force recreate ${on}?`, description: 'The container is destroyed and recreated from the image already on the server. Expect a few seconds of downtime.', confirmLabel: 'Force recreate', pending: 'recreating…', success: `${on} recreated` };
    case 'stop':
      return { title: `Stop ${on}?`, description: 'The container will be stopped until you start it again.', confirmLabel: 'Stop', pending: 'stopping…', success: `${on} stopped` };
    case 'update-env':
      return { title: `Apply env changes to ${on}?`, description: 'The container is recreated once with the new values.', confirmLabel: 'Apply', pending: 'applying env…', success: `${on} env updated` };
    case 'manage':
      return { title: `Manage ${on}?`, description: 'Adds the com.dockyard.managed label and recreates the container.', confirmLabel: 'Manage', pending: 'updating label…', success: `${on} is now managed` };
    case 'unmanage':
      return { title: `Unmanage ${on}?`, description: 'Removes the com.dockyard.managed label and recreates the container. Dockyard will stop offering actions for it.', confirmLabel: 'Unmanage', pending: 'updating label…', success: `${on} is no longer managed` };
    case 'maintenance-on':
      return { title: `Enable maintenance mode on ${ENV}?`, description: 'Creates the maintenance flag file on the server.', confirmLabel: 'Enable maintenance', pending: 'enabling maintenance…', success: `Maintenance on for ${ENV}` };
    case 'maintenance-off':
      return { title: `Disable maintenance mode on ${ENV}?`, description: 'Removes the maintenance flag file from the server.', confirmLabel: 'Disable maintenance', pending: 'disabling maintenance…', success: `Maintenance off for ${ENV}` };
    default:
      throw new Error(`Unknown action: ${action}`);
  }
}
```

- [ ] **Step 4: Implement** `frontend/src/app/DialogProvider.jsx`

```jsx
import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const DialogContext = createContext(null);

function ConfirmDialog({ request, onDone }) {
  const { title, description, confirmLabel = 'Confirm', destructive, level = 'confirm', typedValue, requirePassword } = request;
  const [typed, setTyped] = useState('');
  const [password, setPassword] = useState('');
  const canConfirm = (level !== 'typed' || typed === typedValue) && (!requirePassword || password.length > 0);

  const submit = (e) => {
    e.preventDefault();
    if (canConfirm) onDone({ ok: true, password: requirePassword ? password : undefined });
  };

  return (
    <AlertDialog open onOpenChange={(open) => !open && onDone({ ok: false })}>
      <AlertDialogContent>
        <form onSubmit={submit}>
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            <AlertDialogDescription>{description}</AlertDialogDescription>
          </AlertDialogHeader>
          {level === 'typed' && (
            <div className="mt-4 space-y-1.5">
              <Label htmlFor="confirm-typed">
                Type <span className="font-mono font-semibold">{typedValue}</span> to confirm
              </Label>
              <Input id="confirm-typed" autoFocus autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} />
            </div>
          )}
          {requirePassword && (
            <div className="mt-4 space-y-1.5">
              <Label htmlFor="confirm-password">Managed password</Label>
              <Input id="confirm-password" type="password" autoFocus={level !== 'typed'} value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
          )}
          <AlertDialogFooter className="mt-6">
            <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
            <Button type="submit" variant={destructive ? 'destructive' : 'default'} disabled={!canConfirm} autoFocus={level !== 'typed' && !requirePassword}>
              {confirmLabel}
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function DialogProvider({ children }) {
  const [request, setRequest] = useState(null);
  const [error, setError] = useState(null);

  const confirm = useCallback((opts) => new Promise((resolve) => setRequest({ ...opts, resolve })), []);
  const showError = useCallback((title, message) => setError({ title, message }), []);
  const value = useMemo(() => ({ confirm, showError }), [confirm, showError]);

  return (
    <DialogContext.Provider value={value}>
      {children}
      {request && (
        <ConfirmDialog
          key={request.title}
          request={request}
          onDone={(result) => {
            request.resolve(result);
            setRequest(null);
          }}
        />
      )}
      <Dialog open={!!error} onOpenChange={(open) => !open && setError(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{error?.title}</DialogTitle>
          </DialogHeader>
          <pre className="max-h-[50vh] overflow-auto rounded-md bg-muted p-3 font-mono text-xs whitespace-pre-wrap">{error?.message}</pre>
        </DialogContent>
      </Dialog>
    </DialogContext.Provider>
  );
}

export function useDialogs() {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error('useDialogs must be used inside <DialogProvider>');
  return ctx;
}
```

In `frontend/src/app/AppProviders.jsx`, import `DialogProvider` and wrap: `<TooltipProvider delayDuration={300}><DialogProvider>{children}<ThemedToaster /></DialogProvider></TooltipProvider>`.

- [ ] **Step 5: Implement** `frontend/src/features/container/useRunAction.js`

```js
import { useCallback } from 'react';
import { toast } from 'sonner';
import { useDialogs } from '@/app/DialogProvider';
import { useContainerAction } from '@/lib/queries';
import { splitImage } from '@/lib/image';
import { ACTIONS, confirmPolicy, describeAction } from '@/features/container/actions';

// Runs one logical action on one container: confirmation per §6.1, toasts, Undo for deploys.
export function useRunAction(env) {
  const mutation = useContainerAction(env);
  const { confirm, showError } = useDialogs();

  const run = useCallback(
    async function run(container, action, extraBody = {}) {
      const def = ACTIONS[action];
      const service = container.serviceName || container.name;
      const pinnedByDigest = (container.image || '').includes('@');
      const fromTag = container.image && !pinnedByDigest ? splitImage(container.image).tag : null;
      const toTag = extraBody.newTag;
      const text = describeAction(action, { service, env, fromTag, toTag });
      const level = confirmPolicy(action, env);
      const requirePassword = action === 'manage' || action === 'unmanage';
      let body = { ...(def.body || {}), ...extraBody };

      if (level !== 'none' || requirePassword) {
        const res = await confirm({
          ...text,
          level: level === 'typed' ? 'typed' : 'confirm',
          typedValue: env,
          destructive: !!def.destructive,
          requirePassword,
        });
        if (!res.ok) return false;
        if (requirePassword) body = { ...body, password: res.password };
      }

      const toastId = toast.loading(`${service}: ${text.pending}`);
      try {
        await mutation.mutateAsync({ container, action, endpoint: def.endpoint, body });
        const canUndo = action === 'deploy' && fromTag && fromTag !== toTag;
        const deployed = canUndo ? { ...container, image: `${splitImage(container.image).repo}:${toTag}` } : null;
        toast.success(text.success, {
          id: toastId,
          action: canUndo ? { label: 'Undo', onClick: () => run(deployed, 'deploy', { newTag: fromTag }) } : undefined,
        });
        return true;
      } catch (err) {
        toast.error(`${text.title.replace(/\?$/, '')} failed`, {
          id: toastId,
          description: err.message.length > 140 ? `${err.message.slice(0, 140)}…` : err.message,
          duration: Infinity,
          action: { label: 'Details', onClick: () => showError(`${service} on ${env.toUpperCase()}`, err.message) },
        });
        return false;
      }
    },
    [mutation, confirm, showError, env],
  );

  return run;
}
```

- [ ] **Step 6: Run the tests and confirm they pass**

Run: `cd frontend && npx vitest run src/features/container src/app`
Expected: all pass. The "Restart web on DEV failed" toast title comes from `describeAction('restart').title` ("Restart web on DEV?") with the "?" dropped.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/features/container/actions.js frontend/src/features/container/useRunAction.js frontend/src/features/container/__tests__/actions.test.js frontend/src/features/container/__tests__/useRunAction.test.jsx frontend/src/app/DialogProvider.jsx frontend/src/app/AppProviders.jsx frontend/src/app/__tests__/DialogProvider.test.jsx
git commit -m "feat(frontend): risk-scaled confirmations, action runner with toasts and undo

Claude-Session: https://claude.ai/code/session_0197kg3P6xdbTLt6Nn5BBj7Y"
```

---

### Task 11: Overview page

**Files:**
- Replace: `frontend/src/features/overview/OverviewPage.jsx`
- Create:
  - `frontend/src/features/overview/OverviewMatrix.jsx`
  - `frontend/src/features/overview/EnvFixActions.jsx`
  - `frontend/src/features/overview/focusStore.js`
  - `frontend/src/lib/useNow.js`
- Test: `frontend/src/features/overview/__tests__/OverviewPage.test.jsx`

**Interfaces:**
- Consumes:
  - `useAllEnvs`, `useServers`, `usePendingAction`, `qk` (Task 7)
  - `buildMatrix`, `computeDrift` (Task 9)
  - `describeState` (Task 7), `describeAction` (Task 10)
  - `useDrawer` (Task 8)
  - `StatusBadge`, `Tag` (Task 8), `PageHeader` (Task 8), `usePref` (Task 6)
- Produces:
  - `EnvFixActions({ env })`: whitelist or restart-VPN button with streamed output, plus Retry. Reused by Task 12.
  - `setFocusedCell(cell|null)`, `getFocusedCell()`, `useFocusedCell()`. Cell = `{ env, containerName, service }`. Consumed by Task 19.
  - `useNow(intervalMs) → number`

- [ ] **Step 1: Write the failing test** `frontend/src/features/overview/__tests__/OverviewPage.test.jsx`

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as api from '@/lib/api';
import { renderApp } from '@/test/renderApp';

vi.mock('@/lib/api');

const ctr = (name, tag, extra = {}) => ({
  name, serviceName: name, image: `reg/${name}:${tag}`, status: 'running', managed: true, stackPath: '/m', stackName: 'Main', ...extra,
});
const envData = (containers) => ({ stacks: [{ name: 'Main', path: '/m', containers }], standalone: [] });

beforeEach(() => {
  vi.resetAllMocks();
  api.fetchSettingsServers.mockResolvedValue([{ env_key: 'dev' }, { env_key: 'stage' }, { env_key: 'prod', aws_sg_id: 'sg-1' }]);
  api.fetchContainers.mockImplementation(async (env) => {
    if (env === 'dev') return envData([ctr('frontend', '2.0'), ctr('backend', '5')]);
    if (env === 'stage') return envData([ctr('frontend', '1.0'), ctr('backend', '5'), ctr('worker', '3', { status: 'stopped', exitCode: 1 })]);
    throw new Error('ssh: connect timeout');
  });
});

const cell = async (service, env) => {
  const row = (await screen.findByRole('rowheader', { name: new RegExp(`^${service}`) })).closest('tr');
  const envs = ['dev', 'stage', 'prod'];
  return within(row).getAllByRole('gridcell')[envs.indexOf(env)];
};

describe('Overview', () => {
  it('shows tags per env, marks drift, stopped state and unreachable envs', async () => {
    renderApp('/');
    expect(await cell('frontend', 'stage')).toHaveAttribute('data-drift', 'true');
    expect(await cell('backend', 'stage')).not.toHaveAttribute('data-drift');
    expect(within(await cell('worker', 'stage')).getByText('stopped')).toBeInTheDocument();
    expect(within(await cell('worker', 'dev')).getByText('not deployed')).toBeInTheDocument();
    expect(await screen.findByRole('columnheader', { name: /prod.*unreachable/i })).toBeInTheDocument();
  });

  it('opens the drawer URL on click and prefills the upstream tag on promote (p)', async () => {
    const { router } = renderApp('/');
    const user = userEvent.setup();
    await user.click(await cell('backend', 'dev'));
    expect(router.state.location.search).toBe('?open=dev%2Fbackend&tab=deploy');
    (await cell('frontend', 'stage')).focus();
    await user.keyboard('p');
    expect(router.state.location.search).toBe('?open=stage%2Ffrontend&tab=deploy&tag=2.0');
  });

  it('filters by name and by "only differences"', async () => {
    renderApp('/');
    const user = userEvent.setup();
    await screen.findByRole('rowheader', { name: /^frontend/ });
    await user.click(screen.getByRole('checkbox', { name: 'Only differences' }));
    await waitFor(() => expect(screen.queryByRole('rowheader', { name: /^backend/ })).toBeNull());
    expect(screen.getByRole('rowheader', { name: /^frontend/ })).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: 'Only differences' }));
    await user.type(screen.getByRole('searchbox', { name: 'Filter services' }), 'work');
    await waitFor(() => expect(screen.queryByRole('rowheader', { name: /^frontend/ })).toBeNull());
    expect(screen.getByRole('rowheader', { name: /^worker/ })).toBeInTheDocument();
  });

  it('shows the setup card when no servers are configured', async () => {
    api.fetchSettingsServers.mockResolvedValue([]);
    renderApp('/');
    expect(await screen.findByRole('link', { name: 'Add your first server' })).toHaveAttribute('href', '/settings');
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `cd frontend && npx vitest run src/features/overview/__tests__/OverviewPage.test.jsx`
Expected: FAIL. The placeholder page renders no grid.

- [ ] **Step 3: Implement the small helpers**

`frontend/src/lib/useNow.js`:
```js
import { useEffect, useState } from 'react';

export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
```

`frontend/src/features/overview/focusStore.js`:
```js
import { useSyncExternalStore } from 'react';

// The Overview cell the user last focused, so the ⌘K palette can offer "Deploy {service} to {env}…".
let focused = null;
const listeners = new Set();

export function setFocusedCell(cell) {
  focused = cell;
  listeners.forEach((l) => l());
}

export function getFocusedCell() {
  return focused;
}

export function useFocusedCell() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    getFocusedCell,
  );
}
```

`frontend/src/features/overview/EnvFixActions.jsx`:
```jsx
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { restartVpn, whitelistIp } from '@/lib/api';
import { qk, useServers } from '@/lib/queries';

// Fixes for an unreachable env: AWS envs whitelist the caller's IP, others restart FortiVPN.
export function EnvFixActions({ env }) {
  const { data: servers } = useServers();
  const server = servers?.find((s) => s.env_key === env);
  const qc = useQueryClient();
  const [output, setOutput] = useState('');
  const [running, setRunning] = useState(false);
  const retry = () => qc.refetchQueries({ queryKey: qk.containers(env) });

  const run = async (fn) => {
    setRunning(true);
    setOutput('');
    await fn(
      (chunk) => setOutput((o) => o + chunk),
      (code) => {
        setRunning(false);
        if (code === 0) setTimeout(retry, 2000);
      },
    );
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {server?.aws_sg_id ? (
          <Button size="sm" disabled={running} onClick={() => run((onChunk, onDone) => whitelistIp(env, onChunk, onDone))}>
            {running ? 'Whitelisting…' : 'Whitelist my IP'}
          </Button>
        ) : (
          <Button size="sm" variant="outline" disabled={running} onClick={() => run(restartVpn)}>
            {running ? 'Restarting…' : 'Restart FortiVPN'}
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={retry}>Retry</Button>
      </div>
      {output && <pre className="max-h-48 overflow-auto rounded-md bg-muted p-2 font-mono text-[11px] whitespace-pre-wrap">{output}</pre>}
    </div>
  );
}
```

- [ ] **Step 4: Implement** `frontend/src/features/overview/OverviewMatrix.jsx`

```jsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { Info, Loader2 } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { StatusBadge, Tag } from '@/components/status';
import { usePendingAction } from '@/lib/queries';
import { describeState } from '@/lib/containers';
import { describeAction } from '@/features/container/actions';
import { computeDrift } from '@/features/overview/drift';
import { EnvFixActions } from '@/features/overview/EnvFixActions';
import { setFocusedCell } from '@/features/overview/focusStore';
import { cn } from '@/lib/utils';
import { useTheme } from '@/app/ThemeProvider';

function EnvHeader({ env, state, error }) {
  if (state === 'unreachable' || state === 'stale') {
    return (
      <th scope="col" className="bg-bad-bg px-3.5 py-2 text-left text-xs font-medium text-bad">
        <Popover>
          <PopoverTrigger className="inline-flex items-center gap-1">
            {env.toUpperCase()} · unreachable <Info className="size-3.5" aria-hidden="true" />
          </PopoverTrigger>
          <PopoverContent className="w-80 space-y-2 text-[13px]">
            <p className="font-medium">Can't reach {env}</p>
            <p className="font-mono text-xs break-words text-muted-foreground">{error}</p>
            <EnvFixActions env={env} />
          </PopoverContent>
        </Popover>
      </th>
    );
  }
  return (
    <th scope="col" className="bg-muted/50 px-3.5 py-2 text-left text-xs font-medium text-muted-foreground">
      <span className="inline-flex items-center gap-2">
        {env.toUpperCase()}
        {state === 'loading' && <Skeleton className="h-3 w-10" />}
      </span>
    </th>
  );
}

function CellBody({ env, cell, drift, onPromote }) {
  const pending = usePendingAction(env, cell.kind === 'present' ? cell.container.name : '');
  if (cell.kind === 'unknown') return <span className="text-muted-foreground">—</span>;
  if (cell.kind === 'absent') return <span className="text-muted-foreground">not deployed</span>;

  const state = describeState(cell.container);
  const showDrift = drift && !cell.stale;
  return (
    <span className="flex flex-wrap items-center gap-2">
      {state.tone !== 'ok' && <StatusBadge tone={state.tone}>{state.label}</StatusBadge>}
      <Tag tone={showDrift ? 'warn' : undefined} className={cn(cell.stale && 'opacity-60')}>{cell.tag}</Tag>
      {cell.stale && <span className="text-[11px] text-muted-foreground">(stale)</span>}
      {cell.extra > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="text-[11px] text-muted-foreground">+{cell.extra}</span>
          </TooltipTrigger>
          <TooltipContent>Also defined in {cell.extra} more stack{cell.extra > 1 ? 's' : ''}</TooltipContent>
        </Tooltip>
      )}
      {showDrift && (
        <button
          type="button"
          tabIndex={-1}
          className="text-[11px] text-primary opacity-0 group-hover:opacity-100 group-focus:opacity-100"
          onClick={(e) => {
            e.stopPropagation();
            onPromote();
          }}
        >
          ↑ promote
        </button>
      )}
      {pending && (
        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
          <Loader2 className="size-3 animate-spin" aria-hidden="true" />
          {describeAction(pending.action, { toTag: pending.body?.newTag }).pending}
        </span>
      )}
    </span>
  );
}

export function OverviewMatrix({ envs, rows, onOpen }) {
  const { density } = useTheme();
  const envOrder = envs.map((e) => e.env);
  const orderKey = envOrder.join('|');
  const drifts = useMemo(() => rows.map((row) => computeDrift(row, envOrder)), [rows, orderKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const [focus, setFocus] = useState({ r: 0, c: 0 });
  const cellRefs = useRef(new Map());

  useEffect(() => {
    setFocus((f) => ({ r: Math.min(f.r, Math.max(rows.length - 1, 0)), c: Math.min(f.c, Math.max(envOrder.length - 1, 0)) }));
  }, [rows.length, envOrder.length]);

  const cellAt = (r, c) => rows[r]?.cells[envOrder[c]];

  const noteFocus = (r, c) => {
    setFocus({ r, c });
    const cell = cellAt(r, c);
    setFocusedCell(cell?.kind === 'present' ? { env: envOrder[c], containerName: cell.container.name, service: rows[r].service } : null);
  };

  const moveTo = (r, c) => {
    noteFocus(r, c);
    cellRefs.current.get(`${r}:${c}`)?.focus();
  };

  const open = (r, c, tab = 'deploy') => {
    const cell = cellAt(r, c);
    if (cell?.kind === 'present') onOpen(envOrder[c], cell.container.name, tab);
  };

  const promote = (r, c) => {
    const cell = cellAt(r, c);
    const drift = drifts[r]?.[envOrder[c]];
    if (cell?.kind === 'present' && drift && !cell.stale) onOpen(envOrder[c], cell.container.name, 'deploy', { prefillTag: drift.upstreamTag });
  };

  const onKeyDown = (e) => {
    const { r, c } = focus;
    const handlers = {
      ArrowDown: () => moveTo(Math.min(r + 1, rows.length - 1), c),
      ArrowUp: () => moveTo(Math.max(r - 1, 0), c),
      ArrowRight: () => moveTo(r, Math.min(c + 1, envOrder.length - 1)),
      ArrowLeft: () => moveTo(r, Math.max(c - 1, 0)),
      Enter: () => open(r, c, 'deploy'),
      l: () => open(r, c, 'logs'),
      p: () => promote(r, c),
    };
    const handler = handlers[e.key];
    if (!handler || e.target.tagName === 'INPUT') return;
    e.preventDefault();
    handler();
  };

  const rowHeight = density === 'compact' ? 'h-[30px]' : 'h-9';

  return (
    <table role="grid" aria-label="Deployments by environment" className="w-full border-collapse text-[13px]" onKeyDown={onKeyDown}>
      <thead>
        <tr className="border-b">
          <th scope="col" className="bg-muted/50 px-3.5 py-2 text-left text-xs font-medium text-muted-foreground">Service</th>
          {envs.map((e) => (
            <EnvHeader key={e.env} {...e} />
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, r) => (
          <tr key={row.service} className="border-b last:border-0">
            <th scope="row" className="px-3.5 text-left font-normal">
              {row.service}
              {!row.managed && <span className="ml-2 text-[11px] text-muted-foreground">unmanaged</span>}
            </th>
            {envOrder.map((env, c) => {
              const cell = row.cells[env];
              const drift = drifts[r]?.[env];
              const isFocus = focus.r === r && focus.c === c;
              return (
                <td
                  key={env}
                  role="gridcell"
                  ref={(el) => (el ? cellRefs.current.set(`${r}:${c}`, el) : cellRefs.current.delete(`${r}:${c}`))}
                  tabIndex={isFocus ? 0 : -1}
                  data-drift={drift && cell.kind === 'present' && !cell.stale ? 'true' : undefined}
                  className={cn(
                    'group px-3.5 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                    rowHeight,
                    cell.kind === 'present' && 'cursor-pointer hover:bg-accent/50',
                  )}
                  onFocus={() => noteFocus(r, c)}
                  onClick={() => open(r, c, 'deploy')}
                >
                  <CellBody env={env} cell={cell} drift={drift} onPromote={() => promote(r, c)} />
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 5: Replace** `frontend/src/features/overview/OverviewPage.jsx`

```jsx
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { PageHeader } from '@/app/PageHeader';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useAllEnvs, useServers } from '@/lib/queries';
import { usePref } from '@/lib/storage';
import { useNow } from '@/lib/useNow';
import { cn } from '@/lib/utils';
import { useDrawer } from '@/features/container/useDrawer';
import { buildMatrix } from '@/features/overview/buildMatrix';
import { computeDrift } from '@/features/overview/drift';
import { OverviewMatrix } from '@/features/overview/OverviewMatrix';

function Toggle({ id, label, checked, onChange }) {
  return (
    <div className="flex items-center gap-2 rounded-md border bg-card px-2.5 py-1.5">
      <Checkbox id={id} checked={checked} onCheckedChange={(v) => onChange(v === true)} />
      <Label htmlFor={id} className="text-[13px] font-normal">{label}</Label>
    </div>
  );
}

export default function OverviewPage() {
  const servers = useServers();
  const results = useAllEnvs();
  const [filter, setFilter] = useState('');
  const [onlyDiff, setOnlyDiff] = usePref('onlyDifferences', false);
  const [showUnmanaged, setShowUnmanaged] = usePref('showUnmanaged', false);
  const { openDrawer } = useDrawer();
  const qc = useQueryClient();
  const now = useNow(1000);
  const filterRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) {
        e.preventDefault();
        filterRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  if (servers.isSuccess && servers.data.length === 0) {
    return (
      <>
        <PageHeader title="Overview" />
        <div className="p-6">
          <div className="mx-auto max-w-md rounded-xl border bg-card p-6 text-center">
            <p className="mb-1 text-[15px] font-semibold">No servers yet</p>
            <p className="mb-4 text-muted-foreground">Dockyard connects to your servers over SSH and reads their compose files.</p>
            <Button asChild><Link to="/settings">Add your first server</Link></Button>
          </div>
        </div>
      </>
    );
  }

  const matrix = buildMatrix(results, { showUnmanaged });
  const envOrder = matrix.envs.map((e) => e.env);
  const needle = filter.trim().toLowerCase();
  const rows = matrix.rows
    .filter((r) => r.service.toLowerCase().includes(needle))
    .filter((r) => !onlyDiff || Object.keys(computeDrift(r, envOrder)).length > 0);
  const updated = results.map((r) => r.dataUpdatedAt).filter(Boolean);
  const ageSecs = updated.length ? Math.max(0, Math.round((now - Math.min(...updated)) / 1000)) : null;
  const fetching = results.some((r) => r.isFetching);
  const loadingFirst = matrix.rows.length === 0 && results.some((r) => r.isLoading);

  return (
    <>
      <PageHeader title="Overview">
        <Input
          ref={filterRef}
          type="search"
          aria-label="Filter services"
          placeholder="Filter services…  /"
          className="h-8 w-52"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <Toggle id="only-diff" label="Only differences" checked={onlyDiff} onChange={setOnlyDiff} />
        <Toggle id="show-unmanaged" label="Show unmanaged" checked={showUnmanaged} onChange={setShowUnmanaged} />
        <Button variant="outline" size="sm" onClick={() => qc.refetchQueries({ queryKey: ['containers'] })} aria-label="Refresh all environments">
          <RefreshCw className={cn('size-3.5', fetching && 'animate-spin')} />
          {ageSecs === null ? '—' : `${ageSecs}s`}
        </Button>
      </PageHeader>
      <div className="p-6">
        <div className="overflow-x-auto rounded-xl border bg-card">
          {loadingFirst ? (
            <div className="space-y-2 p-4">
              {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-7 w-full" />)}
            </div>
          ) : rows.length === 0 ? (
            <p className="p-6 text-center text-muted-foreground">{needle || onlyDiff ? 'No services match.' : 'No managed services found.'}</p>
          ) : (
            <OverviewMatrix envs={matrix.envs} rows={rows} onOpen={openDrawer} />
          )}
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 6: Run the tests and confirm they pass**

Run: `cd frontend && npx vitest run src/features/overview`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/features/overview frontend/src/lib/useNow.js
git commit -m "feat(overview): deployed-where matrix with drift, promote and keyboard navigation

Claude-Session: https://claude.ai/code/session_0197kg3P6xdbTLt6Nn5BBj7Y"
```

---

### Task 12: Environment page

**Files:**
- Replace: `frontend/src/features/env/EnvPage.jsx`
- Create: `frontend/src/features/env/StackTable.jsx`
- Test: `frontend/src/features/env/__tests__/EnvPage.test.jsx`

**Interfaces:**
- Consumes:
  - `useEnvContainers`, `useServers`, `usePendingAction` (Task 7)
  - `describeState`, `imageTag`, `formatAgo` (Task 7)
  - `useDrawer` (Task 8), `EnvFixActions` (Task 11), `describeAction` (Task 10)
  - `StatusDot`, `StatusBadge`, `Tag`, `toneText` (Task 8)
- Produces: `StackTable({ env, title, subtitle?, containers, activeName, onOpen(name), selectable?, selected?: Set<string>, onToggleSelect?(name), headerRight? })`.
  - Managed rows come first; unmanaged ones collapse into one expandable row.
  - Task 17 passes the selection props and `headerRight`.

- [ ] **Step 1: Write the failing test** `frontend/src/features/env/__tests__/EnvPage.test.jsx`

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as api from '@/lib/api';
import { renderApp } from '@/test/renderApp';

vi.mock('@/lib/api');

const base = { stackPath: '/m', stackName: 'Main', managed: true, status: 'running', startedAt: new Date(Date.now() - 3 * 86400e3).toISOString(), restartCount: 0 };
beforeEach(() => {
  vi.resetAllMocks();
  api.fetchSettingsServers.mockResolvedValue([{ env_key: 'stage', host: '10.0.0.5' }, { env_key: 'dev' }]);
  api.fetchContainers.mockImplementation(async (env) => {
    if (env === 'dev') throw new Error('connect ETIMEDOUT');
    return {
      stacks: [{
        name: 'Main', path: '/m', containers: [
          { ...base, name: 'web', serviceName: 'web', image: 'reg/web:1.0', health: 'healthy', note: 'demo for client X' },
          { ...base, name: 'worker', serviceName: 'worker', image: 'reg/worker:2', status: 'stopped', exitCode: 1, finishedAt: new Date(Date.now() - 2 * 3600e3).toISOString() },
          { ...base, name: 'postgres', serviceName: 'postgres', image: 'postgres:14', managed: false },
        ],
      }],
      standalone: [{ name: 'dozzle', image: 'amir20/dozzle:latest', status: 'running', managed: false, standalone: true, stackPath: null }],
    };
  });
  api.fetchHistory.mockResolvedValue([]);
});

describe('EnvPage', () => {
  it('lists managed containers with state details and no action buttons', async () => {
    renderApp('/env/stage');
    const web = (await screen.findByText('web')).closest('tr');
    expect(within(web).getByText('1.0')).toBeInTheDocument();
    expect(within(web).getByText('healthy · 3d')).toBeInTheDocument();
    expect(within(web).getByText('demo for client X')).toBeInTheDocument();
    expect(within(web).queryAllByRole('button')).toHaveLength(0);
    const worker = screen.getByText('worker').closest('tr');
    expect(within(worker).getByText('exited (1) · 2h')).toBeInTheDocument();
    expect(screen.getByText('10.0.0.5 · 2 running · 1 stopped', { exact: false })).toBeInTheDocument();
  });

  it('collapses unmanaged containers and lists standalone ones separately', async () => {
    renderApp('/env/stage');
    const user = userEvent.setup();
    const toggle = await screen.findByRole('button', { name: /1 unmanaged \(postgres\)/ });
    expect(screen.queryByText('postgres', { selector: 'td span' })).toBeNull();
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('postgres', { selector: 'td span' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Standalone containers' })).toBeInTheDocument();
    // standalone containers are unmanaged, so they sit behind their own collapse row
    await user.click(screen.getByRole('button', { name: /1 unmanaged \(dozzle\)/ }));
    expect(screen.getByText('dozzle', { selector: 'td span' })).toBeInTheDocument();
  });

  it('opens the drawer route when a row is clicked', async () => {
    const { router } = renderApp('/env/stage');
    const user = userEvent.setup();
    await user.click(await screen.findByText('web'));
    expect(router.state.location.pathname).toBe('/env/stage/web');
    expect(router.state.location.search).toBe('?tab=deploy');
  });

  it('shows the error and fix actions when the env is unreachable', async () => {
    renderApp('/env/dev');
    expect(await screen.findByText(/connect ETIMEDOUT/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Restart FortiVPN' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `cd frontend && npx vitest run src/features/env`
Expected: FAIL. The placeholder page renders no rows.

- [ ] **Step 3: Implement** `frontend/src/features/env/StackTable.jsx`

```jsx
import { useState } from 'react';
import { ChevronRight, Loader2 } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { StatusDot, Tag, toneText } from '@/components/status';
import { describeState } from '@/lib/containers';
import { imageTag } from '@/lib/image';
import { usePendingAction } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { useTheme } from '@/app/ThemeProvider';
import { describeAction } from '@/features/container/actions';

function Row({ env, c, active, onOpen, selectable, selected, onToggleSelect, muted }) {
  const { density } = useTheme();
  const state = describeState(c);
  const pending = usePendingAction(env, c.name);
  return (
    <tr
      tabIndex={0}
      aria-current={active ? 'true' : undefined}
      className={cn(
        'cursor-pointer border-b outline-none last:border-0 hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
        density === 'compact' ? 'h-[30px]' : 'h-9',
        active && 'bg-accent',
        muted && 'text-muted-foreground',
      )}
      onClick={() => onOpen(c.name)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onOpen(c.name);
      }}
    >
      <td className="w-9 pl-3.5" onClick={(e) => e.stopPropagation()}>
        {selectable && c.managed && (
          <Checkbox aria-label={`Select ${c.name}`} checked={selected} onCheckedChange={() => onToggleSelect(c.name)} />
        )}
      </td>
      <td className="pr-3">
        <span className="flex items-center gap-2">
          <StatusDot tone={state.tone} />
          <span>{c.name}</span>
        </span>
      </td>
      <td className="pr-3"><Tag>{imageTag(c.image)}</Tag></td>
      <td className={cn('pr-3 text-xs', state.tone === 'ok' ? 'text-muted-foreground' : toneText[state.tone])}>
        {pending ? (
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <Loader2 className="size-3 animate-spin" aria-hidden="true" />
            {describeAction(pending.action, { toTag: pending.body?.newTag }).pending}
          </span>
        ) : (
          state.detail
        )}
      </td>
      <td className="max-w-[260px] truncate pr-3.5 text-xs text-muted-foreground" title={c.note || undefined}>
        {c.note || '—'}
      </td>
    </tr>
  );
}

export function StackTable({ env, title, subtitle, containers, activeName, onOpen, selectable = false, selected, onToggleSelect, headerRight }) {
  const [showUnmanaged, setShowUnmanaged] = useState(false);
  const managed = containers.filter((c) => c.managed);
  const unmanaged = containers.filter((c) => !c.managed);
  const rowProps = { env, onOpen, selectable, onToggleSelect };

  return (
    <section className="overflow-hidden rounded-xl border bg-card">
      <div className="flex items-center gap-2 border-b px-3.5 py-2.5">
        <h2 className="text-[13px] font-semibold">{title}</h2>
        {subtitle && <span className="text-xs text-muted-foreground">{subtitle}</span>}
        <div className="ml-auto">{headerRight}</div>
      </div>
      <table className="w-full border-collapse text-[13px]">
        <tbody>
          {managed.map((c) => (
            <Row key={c.name} c={c} active={activeName === c.name} selected={selected?.has(c.name) ?? false} {...rowProps} />
          ))}
          {unmanaged.length > 0 && (
            <tr className="border-t">
              <td colSpan={5} className="px-3.5 py-2">
                <button
                  type="button"
                  aria-expanded={showUnmanaged}
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => setShowUnmanaged((v) => !v)}
                >
                  <ChevronRight className={cn('size-3.5 transition-transform', showUnmanaged && 'rotate-90')} aria-hidden="true" />
                  {unmanaged.length} unmanaged ({unmanaged.slice(0, 4).map((c) => c.name).join(', ')}{unmanaged.length > 4 ? ', …' : ''})
                </button>
              </td>
            </tr>
          )}
          {showUnmanaged && unmanaged.map((c) => (
            <Row key={c.name} c={c} active={activeName === c.name} selected={false} muted {...rowProps} />
          ))}
        </tbody>
      </table>
    </section>
  );
}
```

- [ ] **Step 4: Replace** `frontend/src/features/env/EnvPage.jsx`

```jsx
import { useParams } from 'react-router';
import { PageHeader } from '@/app/PageHeader';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/status';
import { flattenEnv, formatAgo } from '@/lib/containers';
import { useEnvContainers, useServers } from '@/lib/queries';
import { useNow } from '@/lib/useNow';
import { useDrawer } from '@/features/container/useDrawer';
import { EnvFixActions } from '@/features/overview/EnvFixActions';
import { StackTable } from '@/features/env/StackTable';

export default function EnvPage() {
  const { env } = useParams();
  const q = useEnvContainers(env);
  const { data: servers } = useServers();
  const { open, openDrawer } = useDrawer();
  const now = useNow(5000);
  const host = servers?.find((s) => s.env_key === env)?.host;
  const activeName = open?.env === env ? open.container : null;
  const onOpen = (name) => openDrawer(env, name, 'deploy');

  const compose = flattenEnv(q.data).filter((c) => !c.standalone);
  const running = compose.filter((c) => c.status === 'running').length;
  const subtitle = [host, q.data && `${running} running · ${compose.length - running} stopped`, q.dataUpdatedAt && `refreshed ${formatAgo(new Date(q.dataUpdatedAt).toISOString(), now)}`]
    .filter(Boolean)
    .join(' · ');
  const badge = q.isError ? (
    <StatusBadge tone="bad">unreachable</StatusBadge>
  ) : q.data ? (
    <StatusBadge tone="ok">connected</StatusBadge>
  ) : (
    <StatusBadge tone="idle">connecting</StatusBadge>
  );

  return (
    <>
      <PageHeader title={env} subtitle={subtitle}>
        {badge}
      </PageHeader>
      <div className="space-y-4 p-6">
        {q.isError && (
          <div className="space-y-3 rounded-xl border border-bad/30 bg-bad-bg p-4">
            <p className="font-medium text-bad">Can't reach {env}{q.data ? '. Showing the last known state.' : ''}</p>
            <p className="font-mono text-xs break-words">{q.error?.message}</p>
            <EnvFixActions env={env} />
          </div>
        )}
        {q.isLoading && (
          <div className="space-y-2 rounded-xl border bg-card p-4">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-7 w-full" />)}
          </div>
        )}
        {q.data?.stacks?.map((stack) => (
          <StackTable
            key={stack.path}
            env={env}
            title={stack.name}
            subtitle={`${stack.containers.length} containers`}
            containers={stack.containers}
            activeName={activeName}
            onOpen={onOpen}
          />
        ))}
        {q.data?.standalone?.length > 0 && (
          <StackTable
            env={env}
            title="Standalone containers"
            subtitle={`${q.data.standalone.length} containers`}
            containers={q.data.standalone}
            activeName={activeName}
            onOpen={onOpen}
          />
        )}
      </div>
    </>
  );
}
```


- [ ] **Step 5: Run the tests and confirm they pass**

Run: `cd frontend && npx vitest run src/features/env`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/env
git commit -m "feat(env): environment page with stack tables, health details and unmanaged collapse

Claude-Session: https://claude.ai/code/session_0197kg3P6xdbTLt6Nn5BBj7Y"
```

---

### Task 13: Container drawer: shell, header, Build info and History tabs

**Files:**
- Create: `frontend/src/features/container/ContainerDrawer.jsx`, `DrawerHeader.jsx`, `InfoTab.jsx`, `HistoryTab.jsx`
- Modify: `frontend/src/app/AppLayout.jsx` (render `<ContainerDrawer />` after the main column)
- Test: `frontend/src/features/container/__tests__/ContainerDrawer.test.jsx`

**Interfaces:**
- Consumes:
  - `useDrawer` (Task 8)
  - `useEnvContainers`, `qk` (Task 7), `findContainer`, `describeState`, `formatAgo` (Task 7)
  - `fetchVersionInfo`, `fetchHistory`, `saveNote` (Task 7 `lib/api`)
  - `useRunAction` (Task 10), `usePref` (Task 6)
- Produces:
  - `ContainerDrawer()`: reads the URL and renders nothing when closed.
  - **Tab registry.** `ContainerDrawer` builds its tabs from `drawerTabs(container, env)`, which returns an ordered array of `{ value, label, render }`.
    - Tasks 14–16 each add one entry there.
    - Standalone containers get only `logs` and `env`.
    - The `deploy` tab only appears for managed stack containers.
  - `useDrawerExpanded() → [expanded, setExpanded]`: lets the Logs tab widen the drawer (Task 15).

- [ ] **Step 1: Write the failing test** `frontend/src/features/container/__tests__/ContainerDrawer.test.jsx`

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as api from '@/lib/api';
import { renderApp } from '@/test/renderApp';

vi.mock('@/lib/api');

const base = { stackPath: '/m', stackName: 'Main', managed: true, status: 'running', startedAt: new Date(Date.now() - 86400e3).toISOString(), restartCount: 0 };
beforeEach(() => {
  vi.resetAllMocks();
  api.fetchSettingsServers.mockResolvedValue([{ env_key: 'stage' }]);
  api.fetchContainers.mockResolvedValue({
    stacks: [{ name: 'Main', path: '/m', containers: [
      { ...base, name: 'web', serviceName: 'web', image: 'reg/web:1.0', note: 'n1', hasVersionInfo: true },
      { ...base, name: 'api', serviceName: 'api', image: 'reg/api:7', note: '' },
    ] }],
    standalone: [],
  });
  api.fetchHistory.mockResolvedValue([
    { id: 1, timestamp: new Date().toISOString(), action: 'update-tag', old_tag: '0.9', new_tag: '1.0', success: 1, duration_ms: 4200 },
    { id: 2, timestamp: new Date().toISOString(), action: 'restart', success: 0, error_message: 'boom: exit 1', duration_ms: null },
  ]);
  api.fetchVersionInfo.mockResolvedValue({ raw: { 'git.branch': 'main', 'git.dirty': 'false' } });
  api.saveNote.mockResolvedValue({ ok: true });
});

const drawer = () => screen.findByRole('complementary', { name: /on stage/ });

describe('ContainerDrawer', () => {
  it('shows history with expandable failures', async () => {
    renderApp('/env/stage/web?tab=history');
    const d = await drawer();
    expect(within(d).getByRole('heading', { name: 'web' })).toBeInTheDocument();
    expect(await within(d).findByText('0.9 → 1.0')).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(within(d).getByRole('button', { name: /restart/ }));
    expect(within(d).getByText('boom: exit 1')).toBeInTheDocument();
    expect(api.fetchHistory).toHaveBeenCalledWith('stage', { container: 'web', limit: 50 });
  });

  it('stays open and switches container when another row is clicked', async () => {
    const { router } = renderApp('/env/stage/web?tab=history');
    await drawer();
    const user = userEvent.setup();
    await user.click(screen.getByText('api', { selector: 'td span' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/env/stage/api'));
    expect(within(await drawer()).getByRole('heading', { name: 'api' })).toBeInTheDocument();
  });

  it('closes on Escape', async () => {
    const { router } = renderApp('/env/stage/web?tab=history');
    await drawer();
    await userEvent.setup().keyboard('{Escape}');
    await waitFor(() => expect(router.state.location.pathname).toBe('/env/stage'));
  });

  it('saves the note on blur', async () => {
    renderApp('/env/stage/web?tab=history');
    const d = await drawer();
    const user = userEvent.setup();
    const note = within(d).getByRole('textbox', { name: 'Note' });
    await user.clear(note);
    await user.type(note, 'release 16.4');
    await user.tab();
    expect(api.saveNote).toHaveBeenCalledWith('stage', 'web', 'release 16.4');
  });

  it('renders build info key/values', async () => {
    renderApp('/env/stage/web?tab=info');
    const d = await drawer();
    expect(await within(d).findByText('git.branch')).toBeInTheDocument();
    expect(within(d).getByText('main')).toBeInTheDocument();
  });

  it('handles a URL naming a container that does not exist', async () => {
    renderApp('/?open=stage/ghost&tab=deploy');
    expect(await screen.findByText('Container not found in stage')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `cd frontend && npx vitest run src/features/container/__tests__/ContainerDrawer.test.jsx`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement** `frontend/src/features/container/HistoryTab.jsx`

```jsx
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import { fetchHistory } from '@/lib/api';
import { qk } from '@/lib/queries';
import { formatAgo } from '@/lib/containers';
import { StatusDot } from '@/components/status';
import { cn } from '@/lib/utils';

export function HistoryTab({ env, container }) {
  const [expanded, setExpanded] = useState(null);
  const q = useQuery({
    queryKey: qk.history(env, container.name, 50),
    queryFn: () => fetchHistory(env, { container: container.name, limit: 50 }),
  });
  if (q.isLoading) return <p className="text-muted-foreground">Loading history…</p>;
  if (q.isError) return <p className="text-bad">Could not load history: {q.error.message}</p>;
  if (!q.data.length) return <p className="text-muted-foreground">No recorded actions yet.</p>;

  return (
    <ul className="divide-y">
      {q.data.map((row) => {
        const failed = !row.success;
        const open = expanded === row.id;
        const Line = (
          <span className="flex w-full items-center gap-2 py-2 text-left">
            <StatusDot tone={failed ? 'bad' : 'ok'} />
            <span className="w-14 shrink-0 text-xs text-muted-foreground">{formatAgo(row.timestamp)}</span>
            <span className="font-medium">{row.action}</span>
            {row.old_tag && row.new_tag && <span className="font-mono text-xs">{row.old_tag} → {row.new_tag}</span>}
            <span className={cn('ml-auto text-xs', failed ? 'text-bad' : 'text-muted-foreground')}>
              {failed ? 'failed' : row.duration_ms != null ? `${(row.duration_ms / 1000).toFixed(1)}s` : 'ok'}
            </span>
            {failed && <ChevronRight className={cn('size-3.5 transition-transform', open && 'rotate-90')} aria-hidden="true" />}
          </span>
        );
        return (
          <li key={row.id}>
            {failed ? (
              <button type="button" className="w-full" aria-expanded={open} onClick={() => setExpanded(open ? null : row.id)}>
                {Line}
              </button>
            ) : (
              Line
            )}
            {failed && open && (
              <pre className="mb-2 overflow-auto rounded-md bg-bad-bg p-2 font-mono text-xs whitespace-pre-wrap text-bad">{row.error_message}</pre>
            )}
          </li>
        );
      })}
    </ul>
  );
}
```

- [ ] **Step 4: Implement** `frontend/src/features/container/InfoTab.jsx`

```jsx
import { useQuery } from '@tanstack/react-query';
import { fetchVersionInfo } from '@/lib/api';
import { cn } from '@/lib/utils';

export function InfoTab({ env, container }) {
  const q = useQuery({
    queryKey: ['version-info', env, container.name],
    queryFn: () => fetchVersionInfo(env, container.name, { stackPath: container.stackPath, serviceName: container.serviceName || container.name }),
  });
  if (q.isLoading) return <p className="text-muted-foreground">Loading build info…</p>;
  if (q.isError) return <p className="text-bad">Could not read build info: {q.error.message}</p>;
  const entries = Object.entries(q.data?.raw || {});
  if (!entries.length) return <p className="text-muted-foreground">No build info fields found.</p>;
  const dirty = q.data.dirty === true || q.data.dirty === 'true';

  return (
    <dl className="grid grid-cols-[minmax(120px,40%)_1fr] gap-x-3 gap-y-1.5">
      {entries.map(([key, value]) => (
        <div key={key} className="contents">
          <dt className="text-xs break-all text-muted-foreground">{key}</dt>
          <dd className={cn('font-mono text-xs break-all', /dirty/i.test(key) && dirty && 'text-bad')}>
            {typeof value === 'object' ? JSON.stringify(value) : String(value ?? '') || '—'}
          </dd>
        </div>
      ))}
    </dl>
  );
}
```

- [ ] **Step 5: Implement** `frontend/src/features/container/DrawerHeader.jsx`

```jsx
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatusBadge, Tag } from '@/components/status';
import { saveNote } from '@/lib/api';
import { describeState } from '@/lib/containers';
import { imageTag } from '@/lib/image';
import { qk } from '@/lib/queries';
import { useRunAction } from '@/features/container/useRunAction';

export function DrawerHeader({ env, container, onClose }) {
  const qc = useQueryClient();
  const run = useRunAction(env);
  const [note, setNote] = useState(container.note || '');
  const state = describeState(container);
  const service = container.serviceName || container.name;

  const commitNote = async () => {
    if (note === (container.note || '')) return;
    await saveNote(env, container.name, note);
    qc.invalidateQueries({ queryKey: qk.containers(env) });
  };

  return (
    <div className="space-y-3 border-b px-4 pt-4 pb-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0">
          <h2 className="truncate text-[15px] font-semibold">{service}</h2>
          <p className="text-xs text-muted-foreground">
            {env.toUpperCase()}
            {container.stackName ? ` · ${container.stackName}` : ' · standalone'}
          </p>
        </div>
        {!container.managed && container.stackPath && (
          <Button size="sm" variant="outline" className="ml-auto" onClick={() => run(container, 'manage')}>Manage…</Button>
        )}
        <Button size="icon" variant="ghost" className={container.managed || !container.stackPath ? 'ml-auto' : ''} aria-label="Close" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge tone={state.tone}>{state.detail}</StatusBadge>
        <Tag>{imageTag(container.image)}</Tag>
        {(container.restartCount ?? 0) > 0 && <span className="text-xs text-warn">{container.restartCount} restarts</span>}
      </div>
      <Input
        aria-label="Note"
        placeholder="Add a note (branch, release, why)…"
        className="h-8"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onBlur={commitNote}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
      />
    </div>
  );
}
```

- [ ] **Step 6: Implement** `frontend/src/features/container/ContainerDrawer.jsx`

```jsx
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { findContainer } from '@/lib/containers';
import { useEnvContainers } from '@/lib/queries';
import { usePref } from '@/lib/storage';
import { cn } from '@/lib/utils';
import { useDrawer } from '@/features/container/useDrawer';
import { DrawerHeader } from '@/features/container/DrawerHeader';
import { InfoTab } from '@/features/container/InfoTab';
import { HistoryTab } from '@/features/container/HistoryTab';

const ExpandedContext = createContext([false, () => {}]);
export const useDrawerExpanded = () => useContext(ExpandedContext);

const MIN_W = 320;
const MAX_W = 800;

// Ordered tab registry. Tasks 14–16 add deploy, logs and env here.
export function drawerTabs(container, env) {
  const inStack = !!container.stackPath && !container.standalone;
  return [
    inStack && container.hasVersionInfo && { value: 'info', label: 'Build info', render: () => <InfoTab env={env} container={container} /> },
    inStack && { value: 'history', label: 'History', render: () => <HistoryTab env={env} container={container} /> },
  ].filter(Boolean);
}

function Shell({ children, label, width, expanded, onResizeStart }) {
  return (
    <aside
      aria-label={label}
      className={cn(
        // Mobile: full-screen overlay. Desktop: a flex sibling of <main>, so the table shrinks
        // instead of being covered and every column (including PROD) stays clickable.
        'fixed inset-0 z-40 flex flex-col border-l bg-card md:relative md:inset-auto md:z-auto md:h-full md:shrink-0',
        expanded ? 'md:w-[calc(100vw-14rem)]' : 'md:w-[var(--drawer-w)]',
      )}
      style={{ '--drawer-w': `${width}px` }}
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize drawer"
        className="absolute top-0 left-0 hidden h-full w-1.5 cursor-col-resize hover:bg-primary/30 md:block"
        onPointerDown={onResizeStart}
      />
      {children}
    </aside>
  );
}

export default function ContainerDrawer() {
  const { open, tab, setTab, closeDrawer } = useDrawer();
  const q = useEnvContainers(open?.env);
  const [width, setWidth] = usePref('drawerWidth', 440);
  const [expanded, setExpanded] = useState(false);
  const dragging = useRef(false);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (document.querySelector('[role="alertdialog"], [role="dialog"]')) return; // a modal is handling Esc
      closeDrawer();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, closeDrawer]);

  useEffect(() => setExpanded(false), [open?.env, open?.container]);

  if (!open) return null;

  const onResizeStart = (e) => {
    dragging.current = true;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const move = (ev) => dragging.current && setWidth(Math.min(MAX_W, Math.max(MIN_W, window.innerWidth - ev.clientX)));
    const up = () => {
      dragging.current = false;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const container = findContainer(q.data, open.container);
  const label = `${open.container} on ${open.env}`;
  const shellProps = { label, width, expanded, onResizeStart };

  if (!container) {
    return (
      <Shell {...shellProps}>
        <div className="flex items-center justify-between border-b p-4">
          <p className="font-medium">{q.isLoading ? 'Loading…' : q.data ? `Container not found in ${open.env}` : `Can't load ${open.env}`}</p>
          <Button size="icon" variant="ghost" aria-label="Close" onClick={closeDrawer}><X className="size-4" /></Button>
        </div>
        {!q.isLoading && q.error && <p className="p-4 font-mono text-xs text-bad">{q.error.message}</p>}
      </Shell>
    );
  }

  const tabs = drawerTabs(container, open.env);
  const active = tabs.some((t) => t.value === tab) ? tab : tabs[0]?.value;

  return (
    <ExpandedContext.Provider value={[expanded, setExpanded]}>
      <Shell {...shellProps}>
        <DrawerHeader key={`${open.env}/${container.name}`} env={open.env} container={container} onClose={closeDrawer} />
        {tabs.length > 0 && (
          <Tabs value={active} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
            <TabsList className="mx-4 mt-3 self-start">
              {tabs.map((t) => (
                <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>
              ))}
            </TabsList>
            {tabs.map((t) => (
              <TabsContent key={t.value} value={t.value} className="min-h-0 flex-1 overflow-auto px-4 py-3">
                {t.value === active && t.render()}
              </TabsContent>
            ))}
          </Tabs>
        )}
      </Shell>
    </ExpandedContext.Provider>
  );
}
```

- [ ] **Step 7: Mount it.** In `frontend/src/app/AppLayout.jsx`, import `ContainerDrawer from '@/features/container/ContainerDrawer'` and render `<ContainerDrawer />` as the last child of the outer `flex` div (after the main column). On desktop it takes its width from the row and `<main>` shrinks; the drawer never overlaps the matrix.

- [ ] **Step 8: Run the tests and confirm they pass**

Run: `cd frontend && npx vitest run src/features`
Expected: all pass, including the Task 11 and 12 tests. The drawer is non-modal, so the page behind stays clickable.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/features/container frontend/src/app/AppLayout.jsx
git commit -m "feat(drawer): URL-driven container drawer with note, build info and history

Claude-Session: https://claude.ai/code/session_0197kg3P6xdbTLt6Nn5BBj7Y"
```

---

### Task 14: Deploy tab with the smart tag combobox

**Files:**
- Create: `frontend/src/features/container/suggestions.js`, `TagCombobox.jsx`, `DeployTab.jsx`
- Modify: `frontend/src/features/container/ContainerDrawer.jsx` (register the `deploy` tab first in `drawerTabs`)
- Test: `frontend/src/features/container/__tests__/suggestions.test.js`, `frontend/src/features/container/__tests__/DeployTab.test.jsx`

**Interfaces:**
- Consumes:
  - `fetchDeploySuggestions` (Task 7), `useAllEnvs`, `usePendingAction`, `qk` (Task 7)
  - `flattenEnv`, `formatAgo`, `imageTag` (Task 7)
  - `useRunAction` (Task 10), `useDrawer().prefillTag` (Task 8)
- Produces:
  - `buildSuggestionGroups({ env, current, otherEnvs, recentBuilds, previous, now }) → Array<{ heading, items: Array<{ tag, hint, source: 'env'|'build'|'previous' }> }>`
  - `isValidTag(tag) → boolean`
  - `TagCombobox({ groups, initialQuery, onPick(tag) })`

- [ ] **Step 1: Write the failing tests**

`frontend/src/features/container/__tests__/suggestions.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { buildSuggestionGroups, isValidTag } from '@/features/container/suggestions';

const NOW = Date.parse('2026-09-25T12:00:00Z');

describe('buildSuggestionGroups', () => {
  it('orders groups, de-duplicates by tag (first wins) and excludes the current tag', () => {
    const groups = buildSuggestionGroups({
      env: 'stage',
      current: '1.0',
      otherEnvs: [{ env: 'prod', tag: '0.9' }, { env: 'dev', tag: '2.0' }, { env: 'test', tag: '1.0' }],
      recentBuilds: [
        { tag: '2.0', project: 'fe', buildNumber: 90, branch: 'main', finishedAt: '2026-09-25 10:00:00' },
        { tag: '2.1', project: 'fe', buildNumber: 91, branch: 'release/2', finishedAt: '2026-09-25 11:59:30' },
      ],
      previous: [{ tag: '0.9', at: '2026-09-20T12:00:00Z' }, { tag: '0.8', at: '2026-09-18T12:00:00Z' }],
      now: NOW,
    });
    expect(groups).toEqual([
      { heading: 'Other environments', items: [
        { tag: '0.9', hint: 'on PROD', source: 'env' },
        { tag: '2.0', hint: 'on DEV', source: 'env' },
      ] },
      { heading: 'Recent builds', items: [{ tag: '2.1', hint: '#91 · release/2 · just now', source: 'build' }] },
      { heading: 'Previously on STAGE', items: [{ tag: '0.8', hint: '7d ago', source: 'previous' }] },
    ]);
  });

  it('drops empty groups', () => {
    expect(buildSuggestionGroups({ env: 'dev', current: 'x', otherEnvs: [], recentBuilds: [], previous: [], now: NOW })).toEqual([]);
  });
});

describe('isValidTag', () => {
  it.each([['1.2.3', true], ['stage-16.3.0-20', true], ['v1_rc.2', true], ['', false], ['-lead', false], ['a b', false], ['a\nb', false], ['x'.repeat(129), false]])(
    '%j → %s', (tag, ok) => expect(isValidTag(tag)).toBe(ok));
});
```

`frontend/src/features/container/__tests__/DeployTab.test.jsx`:
```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as api from '@/lib/api';
import { renderApp } from '@/test/renderApp';

vi.mock('@/lib/api');

const svc = (tag, extra = {}) => ({ name: 'frontend', serviceName: 'frontend', image: `reg/frontend:${tag}`, status: 'running', managed: true, stackPath: '/m', stackName: 'Main', ...extra });
beforeEach(() => {
  vi.resetAllMocks();
  api.fetchSettingsServers.mockResolvedValue([{ env_key: 'dev' }, { env_key: 'stage' }]);
  api.fetchContainers.mockImplementation(async (env) => ({
    stacks: [{ name: 'Main', path: '/m', containers: [svc(env === 'dev' ? '2.0' : '1.0')] }], standalone: [],
  }));
  api.fetchDeploySuggestions.mockResolvedValue({
    otherEnvs: [],
    recentBuilds: [{ tag: '2.1', project: 'fe', buildNumber: 91, branch: 'main', finishedAt: '2026-09-25 10:00:00' }],
    previous: [{ tag: '0.9', at: '2026-09-20T00:00:00Z' }],
  });
  api.containerAction.mockResolvedValue({ ok: true });
});

const drawer = () => screen.findByRole('complementary', { name: /frontend on stage/ });

describe('DeployTab', () => {
  it('suggests other envs, builds and previous tags, then deploys the picked one', async () => {
    renderApp('/env/stage/frontend?tab=deploy');
    const d = await drawer();
    const user = userEvent.setup();
    expect(await within(d).findByText('Other environments')).toBeInTheDocument();
    expect(within(d).getByText('Recent builds')).toBeInTheDocument();
    expect(within(d).getByText('Previously on STAGE')).toBeInTheDocument();
    await user.click(within(d).getByRole('option', { name: /2\.0.*on DEV/ }));
    expect(within(d).getByTestId('deploy-preview')).toHaveTextContent('1.0 → 2.0');
    await user.click(within(d).getByRole('button', { name: 'Deploy to STAGE' }));
    await waitFor(() => expect(api.containerAction).toHaveBeenCalledWith('stage', 'frontend', 'update-tag', expect.objectContaining({ newTag: '2.0' })));
    expect(api.fetchDeploySuggestions).toHaveBeenCalledWith('stage', 'frontend', { image: 'reg/frontend:1.0', current: '1.0' });
  });

  it('accepts a typed tag with Enter and rejects invalid ones', async () => {
    renderApp('/env/stage/frontend?tab=deploy');
    const d = await drawer();
    const user = userEvent.setup();
    const input = await within(d).findByRole('combobox', { name: 'Tag to deploy' });
    await user.type(input, 'hotfix-7{Enter}');
    expect(within(d).getByTestId('deploy-preview')).toHaveTextContent('1.0 → hotfix-7');
    await user.clear(input);
    await user.type(input, 'bad tag');
    expect(within(d).getByText('Not a valid image tag')).toBeInTheDocument();
  });

  it('prefills the tag from the promote link', async () => {
    renderApp('/?open=stage/frontend&tab=deploy&tag=2.0');
    const d = await drawer();
    expect(within(d).getByTestId('deploy-preview')).toHaveTextContent('1.0 → 2.0');
  });

  it('keeps risky actions behind the More menu', async () => {
    renderApp('/env/stage/frontend?tab=deploy');
    const d = await drawer();
    const user = userEvent.setup();
    expect(within(d).queryByRole('button', { name: 'Stop' })).toBeNull();
    await user.click(within(d).getByRole('button', { name: /More/ }));
    expect(await screen.findByRole('menuitem', { name: 'Stop' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Force recreate' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Unmanage…' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `cd frontend && npx vitest run src/features/container`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement** `frontend/src/features/container/suggestions.js`

```js
import { formatAgo } from '@/lib/containers';

// Docker tag grammar: [A-Za-z0-9_][A-Za-z0-9_.-]{0,127}
const TAG_RE = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/;
export function isValidTag(tag) {
  return typeof tag === 'string' && TAG_RE.test(tag);
}

// SQLite datetime('now') values have no zone and are UTC.
const toIso = (s) => (s && !s.includes('T') ? `${s.replace(' ', 'T')}Z` : s);
const ago = (iso, now) => {
  const a = formatAgo(toIso(iso), now);
  return !a || a === 'just now' ? a : `${a} ago`;
};

export function buildSuggestionGroups({ env, current, otherEnvs, recentBuilds, previous, now = Date.now() }) {
  const seen = new Set([current]);
  const take = (items) => items.filter((i) => i.tag && !seen.has(i.tag) && seen.add(i.tag));
  const groups = [
    { heading: 'Other environments', items: take(otherEnvs.map((o) => ({ tag: o.tag, hint: `on ${o.env.toUpperCase()}`, source: 'env' }))) },
    {
      heading: 'Recent builds',
      items: take(
        recentBuilds.map((b) => ({
          tag: b.tag,
          hint: [`#${b.buildNumber}`, b.branch, b.finishedAt && formatAgo(toIso(b.finishedAt), now)].filter(Boolean).join(' · '),
          source: 'build',
        })),
      ),
    },
    { heading: `Previously on ${env.toUpperCase()}`, items: take(previous.map((p) => ({ tag: p.tag, hint: ago(p.at, now), source: 'previous' }))) },
  ];
  return groups.filter((g) => g.items.length > 0);
}
```
Recent-build hints use the bare age ("just now", "2h"); "Previously" hints read "7d ago". Both match the test above.

- [ ] **Step 4: Implement** `frontend/src/features/container/TagCombobox.jsx`

```jsx
import { useState } from 'react';
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { isValidTag } from '@/features/container/suggestions';

export function TagCombobox({ groups, initialQuery = '', onPick }) {
  const [query, setQuery] = useState(initialQuery);
  const typed = query.trim();
  const known = groups.some((g) => g.items.some((i) => i.tag === typed));
  const showTyped = typed && !known;

  return (
    <Command className="rounded-lg border" loop>
      <CommandInput autoFocus aria-label="Tag to deploy" placeholder="Tag to deploy…" value={query} onValueChange={setQuery} />
      <CommandList className="max-h-64">
        {groups.map((g) => (
          <CommandGroup key={g.heading} heading={g.heading}>
            {g.items.map((i) => (
              <CommandItem
                key={i.tag}
                value={`${i.tag} ${i.hint}`}
                onSelect={() => {
                  setQuery(i.tag);
                  onPick(i.tag);
                }}
              >
                <span className="font-mono text-[12.5px]">{i.tag}</span>
                <span className="ml-auto text-xs text-muted-foreground">{i.hint}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
        {showTyped && (
          <CommandGroup heading="Custom" forceMount>
            {isValidTag(typed) ? (
              <CommandItem forceMount value={`__typed__ ${typed}`} onSelect={() => onPick(typed)}>
                Use <span className="font-mono text-[12.5px]">{typed}</span>
              </CommandItem>
            ) : (
              <p className="px-2 py-1.5 text-xs text-bad">Not a valid image tag</p>
            )}
          </CommandGroup>
        )}
        {!showTyped && groups.length === 0 && <p className="px-3 py-2 text-xs text-muted-foreground">No suggestions. Type a tag.</p>}
      </CommandList>
    </Command>
  );
}
```

- [ ] **Step 5: Implement** `frontend/src/features/container/DeployTab.jsx`

```jsx
import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { fetchDeploySuggestions } from '@/lib/api';
import { flattenEnv } from '@/lib/containers';
import { imageTag } from '@/lib/image';
import { qk, useAllEnvs, usePendingAction } from '@/lib/queries';
import { useDrawer } from '@/features/container/useDrawer';
import { useRunAction } from '@/features/container/useRunAction';
import { buildSuggestionGroups } from '@/features/container/suggestions';
import { TagCombobox } from '@/features/container/TagCombobox';

export function DeployTab({ env, container }) {
  const run = useRunAction(env);
  const { prefillTag } = useDrawer();
  const all = useAllEnvs();
  const pending = usePendingAction(env, container.name);
  const service = container.serviceName || container.name;
  const current = imageTag(container.image);
  const [selected, setSelected] = useState(prefillTag || '');
  const deployRef = useRef(null);

  const otherEnvs = all
    .filter((e) => e.env !== env && e.data && !e.isError)
    .flatMap((e) => {
      const match = flattenEnv(e.data).find((c) => !c.standalone && (c.serviceName || c.name) === service);
      return match ? [{ env: e.env, tag: imageTag(match.image) }] : [];
    });

  const sugg = useQuery({
    queryKey: qk.suggestions(env, service, container.image, current),
    queryFn: () => fetchDeploySuggestions(env, service, { image: container.image, current }),
    staleTime: 30000,
  });

  const groups = buildSuggestionGroups({
    env,
    current,
    otherEnvs,
    recentBuilds: sugg.data?.recentBuilds ?? [],
    previous: sugg.data?.previous ?? [],
  });

  const deploy = async () => {
    if (!selected) return;
    if (await run(container, 'deploy', { newTag: selected })) setSelected('');
  };
  const busy = !!pending;

  return (
    <div className="space-y-4">
      <TagCombobox
        groups={groups}
        initialQuery={prefillTag || ''}
        onPick={(tag) => {
          setSelected(tag);
          requestAnimationFrame(() => deployRef.current?.focus());
        }}
      />
      {sugg.isError && <p className="text-xs text-muted-foreground">Build and history suggestions unavailable: {sugg.error.message}</p>}
      <div data-testid="deploy-preview" className="rounded-md bg-muted px-3 py-2 font-mono text-[12.5px]">
        {current} → <b>{selected || '…'}</b>
      </div>
      <Button ref={deployRef} className="w-full" disabled={!selected || busy} onClick={deploy}>
        Deploy to {env.toUpperCase()}
      </Button>
      <div className="flex flex-wrap items-center gap-2 border-t pt-3">
        <Button variant="outline" size="sm" disabled={busy} onClick={() => run(container, 'restart')}>Restart</Button>
        <Button variant="outline" size="sm" disabled={busy} onClick={() => run(container, 'pull-recreate')}>Pull &amp; recreate</Button>
        {/* modal={false}: the confirm dialog opens right after a menu item is chosen */}
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" disabled={busy}>More <ChevronDown className="size-3.5" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => run(container, 'force-recreate')}>Force recreate</DropdownMenuItem>
            {container.status === 'running' ? (
              <DropdownMenuItem variant="destructive" onSelect={() => run(container, 'stop')}>Stop</DropdownMenuItem>
            ) : (
              <DropdownMenuItem onSelect={() => run(container, 'start')}>Start</DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => run(container, 'unmanage')}>Unmanage…</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Register the tab.** In `ContainerDrawer.jsx`:
1. Add `import { DeployTab } from '@/features/container/DeployTab';`.
2. Make the first entry of the `drawerTabs` array:

```jsx
    inStack && container.managed && { value: 'deploy', label: 'Deploy', render: () => <DeployTab key={`${env}/${container.name}`} env={env} container={container} /> },
```

- [ ] **Step 7: Run the tests and confirm they pass**

Run: `cd frontend && npx vitest run src/features`
Expected: all pass. The `key` on `DeployTab` resets the picked tag when the drawer switches containers.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/features/container
git commit -m "feat(drawer): deploy tab with tag suggestions from other envs, builds and history

Claude-Session: https://claude.ai/code/session_0197kg3P6xdbTLt6Nn5BBj7Y"
```

---

### Task 15: Logs tab

**Files:**
- Create: `frontend/src/features/container/logBuffer.js`, `useLogStream.js`, `LogsTab.jsx`
- Modify: `frontend/src/features/container/ContainerDrawer.jsx` (register `logs` after `deploy`)
- Test: `frontend/src/features/container/__tests__/logBuffer.test.js`, `frontend/src/features/container/__tests__/LogsTab.test.jsx`

**Interfaces:**
- Consumes: `useDrawerExpanded` (Task 13)
- Produces:
  - `appendChunk(lines, partial, chunk, max = MAX_LINES) → { lines, partial }`, with `MAX_LINES = 5000`
  - `useLogStream(env, container) → { lines: string[], status: 'connecting'|'open'|'closed', reconnect() }`

- [ ] **Step 1: Write the failing tests**

`frontend/src/features/container/__tests__/logBuffer.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { appendChunk } from '@/features/container/logBuffer';

describe('appendChunk', () => {
  it('splits complete lines and keeps the unfinished tail as partial', () => {
    expect(appendChunk([], '', 'a\nb\nc')).toEqual({ lines: ['a', 'b'], partial: 'c' });
  });
  it('joins a partial with the next chunk', () => {
    expect(appendChunk(['a'], 'hel', 'lo\n')).toEqual({ lines: ['a', 'hello'], partial: '' });
  });
  it('drops the oldest lines beyond the cap', () => {
    expect(appendChunk(['1', '2', '3'], '', '4\n5\n', 4)).toEqual({ lines: ['2', '3', '4', '5'], partial: '' });
  });
});
```

`frontend/src/features/container/__tests__/LogsTab.test.jsx`:
```jsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LogsTab } from '@/features/container/LogsTab';

class FakeSocket {
  static instances = [];
  constructor(url) {
    this.url = url;
    FakeSocket.instances.push(this);
  }
  close() { this.closed = true; }
  emit(msg) { this.onmessage?.({ data: JSON.stringify(msg) }); }
}

beforeEach(() => {
  FakeSocket.instances = [];
  vi.stubGlobal('WebSocket', FakeSocket);
});
afterEach(() => vi.unstubAllGlobals());

describe('LogsTab', () => {
  it('streams lines, filters matches and reconnects after a disconnect', async () => {
    render(<LogsTab env="stage" container={{ name: 'web' }} />);
    const ws = FakeSocket.instances[0];
    expect(ws.url).toMatch(/\/ws\/logs\?env=stage&container=web$/);
    act(() => {
      ws.onopen?.();
      ws.emit({ type: 'line', text: 'boot ok\nERROR db down\nready\n' });
    });
    expect(screen.getByText('ERROR db down')).toBeInTheDocument();

    const user = userEvent.setup();
    await user.type(screen.getByRole('searchbox', { name: 'Search logs' }), 'error');
    await user.click(screen.getByRole('checkbox', { name: 'Matches only' }));
    expect(screen.queryByText('boot ok')).toBeNull();
    expect(screen.getByText('db down', { exact: false })).toBeInTheDocument();

    act(() => ws.onclose?.());
    await user.click(screen.getByRole('button', { name: 'Reconnect' }));
    expect(FakeSocket.instances).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `cd frontend && npx vitest run src/features/container/__tests__/logBuffer.test.js src/features/container/__tests__/LogsTab.test.jsx`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement** `frontend/src/features/container/logBuffer.js`

```js
export const MAX_LINES = 5000;

// Chunks from `docker logs -f` don't align with line boundaries; keep the tail as `partial`.
export function appendChunk(lines, partial, chunk, max = MAX_LINES) {
  const parts = (partial + chunk).split('\n');
  const rest = parts.pop();
  const next = parts.length ? lines.concat(parts) : lines;
  return { lines: next.length > max ? next.slice(next.length - max) : next, partial: rest };
}
```

- [ ] **Step 4: Implement** `frontend/src/features/container/useLogStream.js`

```js
import { useEffect, useState } from 'react';
import { appendChunk } from '@/features/container/logBuffer';

export function useLogStream(env, container) {
  const [buf, setBuf] = useState({ lines: [], partial: '' });
  const [status, setStatus] = useState('connecting');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setBuf({ lines: [], partial: '' });
    setStatus('connecting');
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${window.location.host}/ws/logs?env=${encodeURIComponent(env)}&container=${encodeURIComponent(container)}`);
    ws.onopen = () => setStatus('open');
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === 'line') setBuf((b) => appendChunk(b.lines, b.partial, msg.text));
      if (msg.type === 'error') setBuf((b) => appendChunk(b.lines, b.partial, `\nERROR: ${msg.message}\n`));
    };
    ws.onclose = () => setStatus('closed');
    ws.onerror = () => setStatus('closed');
    return () => {
      ws.onclose = null;
      ws.onerror = null;
      ws.close();
    };
  }, [env, container, attempt]);

  const lines = buf.partial ? [...buf.lines, buf.partial] : buf.lines;
  return { lines, status, reconnect: () => setAttempt((n) => n + 1) };
}
```

- [ ] **Step 5: Implement** `frontend/src/features/container/LogsTab.jsx`

```jsx
import { useEffect, useRef, useState } from 'react';
import { ArrowDown, Download, Maximize2, Minimize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { useLogStream } from '@/features/container/useLogStream';
import { useDrawerExpanded } from '@/features/container/ContainerDrawer';

function Highlighted({ text, term }) {
  if (!term) return text;
  const lower = text.toLowerCase();
  const out = [];
  let from = 0;
  let at = lower.indexOf(term);
  while (at !== -1) {
    out.push(text.slice(from, at), <mark key={at} className="rounded-sm bg-warn-bg text-warn">{text.slice(at, at + term.length)}</mark>);
    from = at + term.length;
    at = lower.indexOf(term, from);
  }
  out.push(text.slice(from));
  return out;
}

export function LogsTab({ env, container }) {
  const { lines, status, reconnect } = useLogStream(env, container.name);
  const [expanded, setExpanded] = useDrawerExpanded();
  const [search, setSearch] = useState('');
  const [matchesOnly, setMatchesOnly] = useState(false);
  const [wrap, setWrap] = useState(true);
  const [follow, setFollow] = useState(true);
  const bodyRef = useRef(null);
  const term = search.trim().toLowerCase();
  const shown = term && matchesOnly ? lines.filter((l) => l.toLowerCase().includes(term)) : lines;

  useEffect(() => {
    if (follow && bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [shown.length, follow]);

  const onScroll = () => {
    const el = bodyRef.current;
    setFollow(el.scrollHeight - el.scrollTop - el.clientHeight < 24);
  };

  const download = () => {
    const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/plain' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: `${container.name}-${new Date().toISOString().replace(/[:.]/g, '-')}.log` });
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex h-full min-h-[360px] flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Input type="search" aria-label="Search logs" placeholder="Search…" className="h-8 w-44" value={search} onChange={(e) => setSearch(e.target.value)} />
        <div className="flex items-center gap-1.5">
          <Checkbox id="logs-matches" checked={matchesOnly} onCheckedChange={(v) => setMatchesOnly(v === true)} />
          <Label htmlFor="logs-matches" className="text-xs font-normal">Matches only</Label>
        </div>
        <div className="flex items-center gap-1.5">
          <Checkbox id="logs-wrap" checked={wrap} onCheckedChange={(v) => setWrap(v === true)} />
          <Label htmlFor="logs-wrap" className="text-xs font-normal">Wrap</Label>
        </div>
        <div className="ml-auto flex gap-1">
          <Button size="icon" variant="ghost" className="size-8" aria-label="Download logs" onClick={download}><Download className="size-4" /></Button>
          <Button size="icon" variant="ghost" className="size-8" aria-label={expanded ? 'Shrink drawer' : 'Expand drawer'} onClick={() => setExpanded(!expanded)}>
            {expanded ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
          </Button>
        </div>
      </div>
      {status === 'closed' && (
        <div className="flex items-center gap-2 rounded-md bg-bad-bg px-3 py-1.5 text-xs text-bad">
          Disconnected from the log stream.
          <Button size="sm" variant="outline" className="ml-auto h-7" onClick={reconnect}>Reconnect</Button>
        </div>
      )}
      <div className="relative min-h-0 flex-1">
        <div
          ref={bodyRef}
          onScroll={onScroll}
          className={cn('absolute inset-0 overflow-auto rounded-md bg-muted p-2 font-mono text-xs leading-5', wrap ? 'whitespace-pre-wrap break-all' : 'whitespace-pre')}
        >
          {shown.length === 0 && <span className="text-muted-foreground">{status === 'connecting' ? 'Connecting…' : 'No log lines yet.'}</span>}
          {shown.map((line, i) => (
            <div key={i} className={cn(/error|exception|fatal/i.test(line) && 'text-bad')}>
              <Highlighted text={line} term={term} />
            </div>
          ))}
        </div>
        {!follow && (
          <Button size="sm" className="absolute right-3 bottom-3 h-7 rounded-full shadow" onClick={() => setFollow(true)}>
            <ArrowDown className="size-3.5" /> Jump to latest
          </Button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Register the tab.** In `ContainerDrawer.jsx`:
1. Import `LogsTab`.
2. Add this entry right after `deploy` (it applies to every container, including standalone ones):

```jsx
    { value: 'logs', label: 'Logs', render: () => <LogsTab key={`${env}/${container.name}`} env={env} container={container} /> },
```
`LogsTab` imports `useDrawerExpanded` from `ContainerDrawer`, which now imports `LogsTab`. This circular import is safe because both are only used inside render functions.

- [ ] **Step 7: Run the tests and confirm they pass**

Run: `cd frontend && npx vitest run src/features`
Expected: all pass. In jsdom there's no `WebSocket` server; the drawer tests don't open the Logs tab.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/features/container
git commit -m "feat(drawer): logs tab with follow, search, wrap, download and expand

Claude-Session: https://claude.ai/code/session_0197kg3P6xdbTLt6Nn5BBj7Y"
```

---

### Task 16: Env tab with masking and batched apply

**Files:**
- Create: `frontend/src/features/container/maskEnv.js`, `EnvTab.jsx`
- Modify: `frontend/src/features/container/ContainerDrawer.jsx` (register `env` after `logs`)
- Test: `frontend/src/features/container/__tests__/maskEnv.test.js`, `frontend/src/features/container/__tests__/EnvTab.test.jsx`

**Interfaces:**
- Consumes: `useRunAction` (Task 10). The action `update-env` sends `{ changes }` (backend Task 3).
- Produces: `isSecretKey(key) → boolean`, `ENV_KEY_RE`

- [ ] **Step 1: Write the failing tests**

`frontend/src/features/container/__tests__/maskEnv.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { isSecretKey, ENV_KEY_RE } from '@/features/container/maskEnv';

describe('isSecretKey', () => {
  it.each([
    ['DB_PASSWORD', true], ['JWT_SECRET', true], ['GITLAB_TOKEN', true], ['API_KEY', true], ['MYSQL_PWD', true],
    ['AWS_CREDENTIALS', true], ['api_key', true], ['API_URL', false], ['TZ', false], ['KEYCLOAK_URL', true],
  ])('%s → %s', (key, secret) => expect(isSecretKey(key)).toBe(secret));
});

describe('ENV_KEY_RE', () => {
  it('matches the backend rule', () => {
    expect(ENV_KEY_RE.test('A_1')).toBe(true);
    expect(ENV_KEY_RE.test('1A')).toBe(false);
    expect(ENV_KEY_RE.test('A.B')).toBe(false);
  });
});
```
(`KEYCLOAK_URL` is masked because it contains `KEY`. Over-masking is the safe direction, and a reveal toggle is one click.)

`frontend/src/features/container/__tests__/EnvTab.test.jsx`:
```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient } from '@tanstack/react-query';
import * as api from '@/lib/api';
import { AppProviders } from '@/app/AppProviders';
import { EnvTab } from '@/features/container/EnvTab';

vi.mock('@/lib/api');

const container = {
  name: 'web', serviceName: 'web', stackPath: '/m', stackName: 'Main', managed: true, image: 'reg/web:1',
  env: { API_URL: 'http://a', DB_PASSWORD: 'hunter2', TZ: 'UTC' },
};
const setup = (c = container) => {
  render(<AppProviders queryClient={new QueryClient()}><EnvTab env="stage" container={c} /></AppProviders>);
  return userEvent.setup();
};

describe('EnvTab', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    api.containerAction.mockResolvedValue({ ok: true });
  });

  it('masks secrets until revealed', async () => {
    const user = setup();
    expect(screen.queryByDisplayValue('hunter2')).toBeNull();
    expect(screen.queryByText('hunter2')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Reveal DB_PASSWORD' }));
    expect(screen.getByDisplayValue('hunter2')).toBeInTheDocument();
  });

  it('batches edits and additions into one update-env call', async () => {
    const user = setup();
    const api_url = screen.getByRole('textbox', { name: 'API_URL' });
    await user.clear(api_url);
    await user.type(api_url, 'http://b');
    await user.clear(screen.getByRole('textbox', { name: 'TZ' }));
    await user.type(screen.getByRole('textbox', { name: 'TZ' }), 'Africa/Cairo');
    await user.click(screen.getByRole('button', { name: '+ Add variable' }));
    await user.type(screen.getByRole('textbox', { name: 'New variable name' }), 'FEATURE_X');
    await user.type(screen.getByRole('textbox', { name: 'New variable value' }), 'on');
    await user.click(screen.getByRole('button', { name: 'Apply 3 changes' }));
    await waitFor(() => expect(api.containerAction).toHaveBeenCalledTimes(1));
    expect(api.containerAction).toHaveBeenCalledWith('stage', 'web', 'update-env', expect.objectContaining({
      changes: [
        { key: 'API_URL', value: 'http://b' },
        { key: 'TZ', value: 'Africa/Cairo' },
        { key: 'FEATURE_X', value: 'on' },
      ],
    }));
  });

  it('blocks invalid new keys', async () => {
    const user = setup();
    await user.click(screen.getByRole('button', { name: '+ Add variable' }));
    await user.type(screen.getByRole('textbox', { name: 'New variable name' }), 'BAD.KEY');
    expect(screen.getByText('Letters, digits and _ only; must not start with a digit')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Apply/ })).toBeDisabled();
  });

  it('is read-only for unmanaged containers', () => {
    setup({ ...container, managed: false });
    expect(screen.queryByRole('textbox', { name: 'API_URL' })).toBeNull();
    expect(screen.getByText('http://a')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '+ Add variable' })).toBeNull();
  });
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `cd frontend && npx vitest run src/features/container/__tests__/maskEnv.test.js src/features/container/__tests__/EnvTab.test.jsx`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement** `frontend/src/features/container/maskEnv.js`

```js
const SECRET_RE = /PASS|SECRET|TOKEN|KEY|PWD|CREDENTIAL/i;
// Same rule as backend/services/compose.js validateEnvChanges.
export const ENV_KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function isSecretKey(key) {
  return SECRET_RE.test(key);
}
```

- [ ] **Step 4: Implement** `frontend/src/features/container/EnvTab.jsx`

```jsx
import { useState } from 'react';
import { Eye, EyeOff, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useRunAction } from '@/features/container/useRunAction';
import { ENV_KEY_RE, isSecretKey } from '@/features/container/maskEnv';

const MASK = '••••••';

export function EnvTab({ env, container }) {
  const run = useRunAction(env);
  const editable = container.managed && !!container.stackPath;
  const vars = Object.entries(container.env || {}).sort(([a], [b]) => a.localeCompare(b));
  const [edits, setEdits] = useState({});
  const [added, setAdded] = useState([]);
  const [revealed, setRevealed] = useState(() => new Set());
  const [busy, setBusy] = useState(false);

  const changes = [
    ...vars.filter(([k, v]) => k in edits && edits[k] !== v).map(([k]) => ({ key: k, value: edits[k] })),
    ...added.filter((a) => a.key).map((a) => ({ key: a.key, value: a.value })),
  ];
  const invalidNew = added.some((a) => a.key && !ENV_KEY_RE.test(a.key));
  const toggleReveal = (k) => setRevealed((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const discard = () => { setEdits({}); setAdded([]); };

  const apply = async () => {
    setBusy(true);
    const ok = await run(container, 'update-env', { changes });
    setBusy(false);
    if (ok) discard();
  };

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 space-y-1.5 overflow-auto pb-3">
        {vars.map(([key, value]) => {
          const secret = isSecretKey(key);
          const hidden = secret && !revealed.has(key);
          const current = key in edits ? edits[key] : value;
          const changed = key in edits && edits[key] !== value;
          return (
            <div key={key} className="grid grid-cols-[minmax(110px,38%)_1fr_auto] items-center gap-2">
              <span className="truncate font-mono text-xs text-muted-foreground" title={key}>{key}</span>
              {editable && !hidden ? (
                <Input aria-label={key} className={changed ? 'h-8 border-warn font-mono text-xs' : 'h-8 font-mono text-xs'} value={current} onChange={(e) => setEdits((s) => ({ ...s, [key]: e.target.value }))} />
              ) : (
                <span className="truncate font-mono text-xs" title={hidden ? undefined : current}>{hidden ? MASK : current || '—'}</span>
              )}
              {secret ? (
                <Button size="icon" variant="ghost" className="size-7" aria-label={`${hidden ? 'Reveal' : 'Hide'} ${key}`} onClick={() => toggleReveal(key)}>
                  {hidden ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
                </Button>
              ) : (
                <span className="size-7" />
              )}
            </div>
          );
        })}
        {editable && added.map((a, i) => (
          <div key={i} className="space-y-1">
            <div className="grid grid-cols-[minmax(110px,38%)_1fr_auto] items-center gap-2">
              <Input aria-label="New variable name" placeholder="KEY" className="h-8 border-warn font-mono text-xs" value={a.key} onChange={(e) => setAdded((l) => l.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)))} />
              <Input aria-label="New variable value" placeholder="value" className="h-8 border-warn font-mono text-xs" value={a.value} onChange={(e) => setAdded((l) => l.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} />
              <Button size="icon" variant="ghost" className="size-7" aria-label="Remove new variable" onClick={() => setAdded((l) => l.filter((_, j) => j !== i))}><X className="size-3.5" /></Button>
            </div>
            {a.key && !ENV_KEY_RE.test(a.key) && <p className="text-xs text-bad">Letters, digits and _ only; must not start with a digit</p>}
          </div>
        ))}
        {editable && (
          <Button variant="ghost" size="sm" onClick={() => setAdded((l) => [...l, { key: '', value: '' }])}>+ Add variable</Button>
        )}
      </div>
      {editable && (
        <div className="sticky bottom-0 flex items-center gap-2 border-t bg-card pt-3">
          <Button disabled={changes.length === 0 || invalidNew || busy} onClick={apply}>
            Apply {changes.length} change{changes.length === 1 ? '' : 's'}
          </Button>
          <Button variant="ghost" disabled={changes.length === 0 && added.length === 0} onClick={discard}>Discard</Button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Register the tab.** In `ContainerDrawer.jsx`, import `EnvTab` and add this right after the `logs` entry:

```jsx
    { value: 'env', label: 'Env', render: () => <EnvTab key={`${env}/${container.name}`} env={env} container={container} /> },
```

- [ ] **Step 6: Run the tests and confirm they pass**

Run: `cd frontend && npx vitest run src/features`
Expected: all pass. The test's Apply button is labelled `Apply 3 changes`; with zero changes it reads `Apply 0 changes` and is disabled.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/features/container
git commit -m "feat(drawer): env tab with secret masking and one-recreate batched apply

Claude-Session: https://claude.ai/code/session_0197kg3P6xdbTLt6Nn5BBj7Y"
```

---

### Task 17: Environment actions: maintenance, network fixes, add service, bulk bar

**Files:**
- Create: `frontend/src/features/env/EnvHeaderActions.jsx`, `frontend/src/features/env/AddServiceDialog.jsx`, `frontend/src/features/env/BulkBar.jsx`
- Modify: `frontend/src/features/env/EnvPage.jsx` (header actions, selection state, bulk bar, add-service buttons)
- Test: `frontend/src/features/env/__tests__/EnvActions.test.jsx`

**Interfaces:**
- Consumes:
  - `getMaintenance`, `setMaintenance`, `addService` (lib/api), `qk.maintenance`, `useServers`, `useContainerAction`, `useAllEnvs` (Task 7)
  - `confirmPolicy`, `describeAction`, `ACTIONS` (Task 10), `useDialogs` (Task 10)
  - `EnvFixActions` (Task 11), `TagCombobox`, `isValidTag` (Task 14)
  - `StackTable` selection props (Task 12)
- Produces:
  - `EnvHeaderActions({ env })`
  - `AddServiceDialog({ env, stackIdx, existing, open, onOpenChange })`
  - `BulkBar({ env, containers, onClear })`

- [ ] **Step 1: Write the failing test** `frontend/src/features/env/__tests__/EnvActions.test.jsx`

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as api from '@/lib/api';
import { renderApp } from '@/test/renderApp';

vi.mock('@/lib/api');

const c = (name) => ({ name, serviceName: name, image: `reg/${name}:1`, status: 'running', managed: true, stackPath: '/m', stackName: 'Main' });
beforeEach(() => {
  vi.resetAllMocks();
  api.fetchSettingsServers.mockResolvedValue([
    { env_key: 'stage', maintenance_flag_path: '/tmp/m' },
    { env_key: 'prod', maintenance_flag_path: '/tmp/m' },
  ]);
  api.fetchContainers.mockResolvedValue({ stacks: [{ name: 'Main', path: '/m', containers: [c('web'), c('api'), c('worker')] }], standalone: [] });
  api.getMaintenance.mockResolvedValue({ enabled: false, configured: true });
  api.setMaintenance.mockResolvedValue({ ok: true, enabled: true });
  api.containerAction.mockResolvedValue({ ok: true });
  api.addService.mockResolvedValue({ ok: true });
});

describe('environment actions', () => {
  it('runs a bulk restart sequentially for the selected rows', async () => {
    renderApp('/env/stage');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('checkbox', { name: 'Select web' }));
    await user.click(screen.getByRole('checkbox', { name: 'Select worker' }));
    const bar = screen.getByRole('region', { name: 'Bulk actions' });
    expect(within(bar).getByText('2 selected')).toBeInTheDocument();
    await user.click(within(bar).getByRole('button', { name: 'Restart' }));
    await waitFor(() => expect(api.containerAction).toHaveBeenCalledTimes(2));
    expect(api.containerAction.mock.calls.map((call) => call[1])).toEqual(['web', 'worker']);
  });

  it('asks once, with the typed env name, for a bulk stop on prod', async () => {
    renderApp('/env/prod');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('checkbox', { name: 'Select web' }));
    await user.click(screen.getByRole('checkbox', { name: 'Select api' }));
    await user.click(within(screen.getByRole('region', { name: 'Bulk actions' })).getByRole('button', { name: 'Stop' }));
    await user.type(await screen.findByLabelText(/Type prod to confirm/), 'prod{Enter}');
    await waitFor(() => expect(api.containerAction).toHaveBeenCalledTimes(2));
  });

  it('toggles maintenance mode through a confirmation', async () => {
    renderApp('/env/stage');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('switch', { name: 'Maintenance' }));
    await user.click(await screen.findByRole('button', { name: 'Enable maintenance' }));
    await waitFor(() => expect(api.setMaintenance).toHaveBeenCalledWith('stage', true));
  });

  it('adds a service to a stack', async () => {
    renderApp('/env/stage');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Add service to Main' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Service name'), 'cache');
    await user.type(within(dialog).getByLabelText('Image'), 'redis:7');
    await user.click(within(dialog).getByRole('button', { name: 'Create service' }));
    await waitFor(() => expect(api.addService).toHaveBeenCalledWith('stage', 0, { name: 'cache', image: 'redis:7', ports: [], environment: {}, restart: 'always' }));
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `cd frontend && npx vitest run src/features/env/__tests__/EnvActions.test.jsx`
Expected: FAIL. There are no checkboxes and no switch yet.

- [ ] **Step 3: Implement** `frontend/src/features/env/EnvHeaderActions.jsx`

```jsx
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useDialogs } from '@/app/DialogProvider';
import { getMaintenance, setMaintenance } from '@/lib/api';
import { qk, useServers } from '@/lib/queries';
import { confirmPolicy, describeAction } from '@/features/container/actions';
import { EnvFixActions } from '@/features/overview/EnvFixActions';

export function EnvHeaderActions({ env }) {
  const qc = useQueryClient();
  const { confirm } = useDialogs();
  const { data: servers } = useServers();
  const server = servers?.find((s) => s.env_key === env);
  const [fixOpen, setFixOpen] = useState(false);
  const maintenance = useQuery({
    queryKey: qk.maintenance(env),
    queryFn: () => getMaintenance(env),
    enabled: !!server?.maintenance_flag_path,
  });

  const toggleMaintenance = async (next) => {
    const action = next ? 'maintenance-on' : 'maintenance-off';
    const text = describeAction(action, { env });
    const level = confirmPolicy(action, env);
    const res = await confirm({ ...text, level, typedValue: env, destructive: next });
    if (!res.ok) return;
    try {
      await setMaintenance(env, next);
      toast.success(text.success);
    } catch (err) {
      toast.error(`${text.title.replace(/\?$/, '')} failed`, { description: err.message, duration: Infinity });
    } finally {
      qc.invalidateQueries({ queryKey: qk.maintenance(env) });
    }
  };

  const fixLabel = server?.aws_sg_id ? 'Whitelist my IP…' : 'Restart FortiVPN…';

  return (
    <>
      {server?.maintenance_flag_path && maintenance.data && (
        <div className="flex items-center gap-2 rounded-md border bg-card px-2.5 py-1.5">
          <Switch id={`maint-${env}`} aria-label="Maintenance" checked={maintenance.data.enabled} onCheckedChange={toggleMaintenance} />
          <Label htmlFor={`maint-${env}`} className="text-[13px] font-normal">
            Maintenance {maintenance.data.enabled ? <span className="font-medium text-bad">on</span> : 'off'}
          </Label>
        </div>
      )}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" className="size-8" aria-label={`${env} actions`}><MoreHorizontal className="size-4" /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setFixOpen(true)}>{fixLabel}</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => qc.refetchQueries({ queryKey: qk.containers(env) })}>Refresh</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={fixOpen} onOpenChange={setFixOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{fixLabel.replace('…', '')} · {env}</DialogTitle></DialogHeader>
          <EnvFixActions env={env} />
        </DialogContent>
      </Dialog>
    </>
  );
}
```

- [ ] **Step 4: Implement** `frontend/src/features/env/AddServiceDialog.jsx`

```jsx
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { addService } from '@/lib/api';
import { qk } from '@/lib/queries';

const NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/;
const RESTART = ['always', 'unless-stopped', 'on-failure', 'no'];

export function AddServiceDialog({ env, stackIdx, stackName, existing, open, onOpenChange }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [image, setImage] = useState('');
  const [restart, setRestart] = useState('always');
  const [ports, setPorts] = useState('');
  const [envText, setEnvText] = useState('');
  const [cloneFrom, setCloneFrom] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const loadClone = (src) => {
    setCloneFrom(src);
    const c = existing.find((x) => x.name === src);
    if (!c) return;
    setImage(c.image || '');
    setEnvText(Object.entries(c.env || {}).map(([k, v]) => `${k}=${v}`).join('\n'));
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!NAME_RE.test(name)) return setError('Service name: letters, digits, _ . - (must start with a letter or digit)');
    if (!image.trim()) return setError('Image is required');
    const environment = Object.fromEntries(
      envText.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]).filter(([k]) => k),
    );
    const portList = ports.split(/[\s,]+/).map((p) => p.trim()).filter(Boolean);
    setBusy(true);
    setError('');
    try {
      await addService(env, stackIdx, { name: name.trim(), image: image.trim(), ports: portList, environment, restart });
      toast.success(`${name} added to ${stackName} on ${env.toUpperCase()}`);
      qc.invalidateQueries({ queryKey: qk.containers(env) });
      onOpenChange(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} className="space-y-3">
          <DialogHeader><DialogTitle>Add service to {stackName}</DialogTitle></DialogHeader>
          {existing.length > 0 && (
            <div className="space-y-1.5">
              <Label htmlFor="svc-clone">Start from an existing service (optional)</Label>
              <select id="svc-clone" className="h-8 w-full rounded-md border bg-card px-2 text-[13px]" value={cloneFrom} onChange={(e) => loadClone(e.target.value)}>
                <option value="">—</option>
                {existing.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
              </select>
            </div>
          )}
          <div className="space-y-1.5"><Label htmlFor="svc-name">Service name</Label><Input id="svc-name" value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="svc-image">Image</Label><Input id="svc-image" placeholder="registry/name:tag" className="font-mono" value={image} onChange={(e) => setImage(e.target.value)} /></div>
          <div className="space-y-1.5">
            <Label htmlFor="svc-restart">Restart policy</Label>
            <select id="svc-restart" className="h-8 w-full rounded-md border bg-card px-2 text-[13px]" value={restart} onChange={(e) => setRestart(e.target.value)}>
              {RESTART.map((r) => <option key={r}>{r}</option>)}
            </select>
          </div>
          <div className="space-y-1.5"><Label htmlFor="svc-ports">Ports (host:container, comma separated)</Label><Input id="svc-ports" placeholder="8080:80" value={ports} onChange={(e) => setPorts(e.target.value)} /></div>
          <div className="space-y-1.5">
            <Label htmlFor="svc-env">Environment (KEY=value per line)</Label>
            <textarea id="svc-env" rows={4} className="w-full rounded-md border bg-card p-2 font-mono text-xs" value={envText} onChange={(e) => setEnvText(e.target.value)} />
          </div>
          <p className="text-xs text-muted-foreground">The com.dockyard.managed=true label is added automatically.</p>
          {error && <p className="text-xs text-bad">{error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create service'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 5: Implement** `frontend/src/features/env/BulkBar.jsx`

```jsx
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useDialogs } from '@/app/DialogProvider';
import { flattenEnv } from '@/lib/containers';
import { imageTag } from '@/lib/image';
import { useAllEnvs, useContainerAction } from '@/lib/queries';
import { ACTIONS, confirmPolicy, describeAction } from '@/features/container/actions';
import { TagCombobox } from '@/features/container/TagCombobox';

export function BulkBar({ env, containers, onClear }) {
  const mutation = useContainerAction(env);
  const { confirm, showError } = useDialogs();
  const all = useAllEnvs();
  const [busy, setBusy] = useState(false);
  const [tagOpen, setTagOpen] = useState(false);
  const n = containers.length;

  const services = new Set(containers.map((c) => c.serviceName || c.name));
  const seen = new Set();
  const tagItems = all
    .filter((e) => e.env !== env && e.data)
    .flatMap((e) => flattenEnv(e.data).filter((c) => services.has(c.serviceName || c.name)).map((c) => ({ tag: imageTag(c.image), hint: `on ${e.env.toUpperCase()}`, source: 'env' })))
    .filter((i) => !seen.has(i.tag) && seen.add(i.tag));

  const runBulk = async (action, extraBody = {}) => {
    const def = ACTIONS[action];
    const text = describeAction(action, { service: `${n} containers`, env, toTag: extraBody.newTag });
    const level = confirmPolicy(action, env);
    if (level !== 'none') {
      const res = await confirm({ ...text, level, typedValue: env, destructive: !!def.destructive });
      if (!res.ok) return;
    }
    setBusy(true);
    const id = toast.loading(`${text.pending} 0/${n}`);
    const failures = [];
    for (const [i, container] of containers.entries()) {
      try {
        await mutation.mutateAsync({ container, action, endpoint: def.endpoint, body: { ...(def.body || {}), ...extraBody } });
      } catch (err) {
        failures.push({ name: container.name, message: err.message });
      }
      toast.loading(`${text.pending} ${i + 1}/${n}`, { id });
    }
    setBusy(false);
    if (failures.length === 0) {
      toast.success(`${action} done for ${n} containers on ${env.toUpperCase()}`, { id });
      onClear();
    } else {
      const details = failures.map((f) => `${f.name}: ${f.message}`).join('\n\n');
      toast.error(`${failures.length} of ${n} failed: ${failures.map((f) => f.name).join(', ')}`, {
        id,
        duration: Infinity,
        action: { label: 'Details', onClick: () => showError(`Bulk ${action} on ${env.toUpperCase()}`, details) },
      });
    }
  };

  return (
    <div role="region" aria-label="Bulk actions" className="fixed bottom-4 left-1/2 z-30 flex -translate-x-1/2 flex-wrap items-center gap-2 rounded-xl border bg-card px-3 py-2 shadow-lg md:left-[calc(50%+7rem)]">
      <span className="text-[13px] font-medium">{n} selected</span>
      <Button size="sm" variant="outline" disabled={busy} onClick={() => runBulk('restart')}>Restart</Button>
      <Button size="sm" variant="outline" disabled={busy} onClick={() => runBulk('pull-recreate')}>Pull &amp; recreate</Button>
      <Button size="sm" variant="outline" disabled={busy} onClick={() => runBulk('force-recreate')}>Force recreate</Button>
      <Popover open={tagOpen} onOpenChange={setTagOpen}>
        <PopoverTrigger asChild><Button size="sm" variant="outline" disabled={busy}>Set tag…</Button></PopoverTrigger>
        <PopoverContent className="w-80 p-2">
          <TagCombobox
            groups={tagItems.length ? [{ heading: 'Other environments', items: tagItems }] : []}
            onPick={(tag) => {
              setTagOpen(false);
              runBulk('deploy', { newTag: tag });
            }}
          />
        </PopoverContent>
      </Popover>
      <Button size="sm" variant="outline" className="text-bad" disabled={busy} onClick={() => runBulk('stop')}>Stop</Button>
      <Button size="sm" variant="ghost" disabled={busy} onClick={onClear}>Clear</Button>
    </div>
  );
}
```

- [ ] **Step 6: Wire them into** `frontend/src/features/env/EnvPage.jsx`
1. Imports:
```jsx
import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EnvHeaderActions } from '@/features/env/EnvHeaderActions';
import { AddServiceDialog } from '@/features/env/AddServiceDialog';
import { BulkBar } from '@/features/env/BulkBar';
```
2. State inside the component, after `const onOpen = …`:
```jsx
  const [selected, setSelected] = useState(() => new Set());
  const [addTo, setAddTo] = useState(null); // stack index
  useEffect(() => setSelected(new Set()), [env]);
  const toggleSelect = (name) => setSelected((s) => { const n = new Set(s); n.has(name) ? n.delete(name) : n.add(name); return n; });
  const selectedContainers = flattenEnv(q.data).filter((c) => c.managed && !c.standalone && selected.has(c.name));
```
3. In `<PageHeader>`, after `{badge}`, render `<EnvHeaderActions env={env} />`.
4. Replace the stacks `.map(...)` with:
```jsx
        {q.data?.stacks?.map((stack, idx) => (
          <StackTable
            key={stack.path}
            env={env}
            title={stack.name}
            subtitle={`${stack.containers.length} containers`}
            containers={stack.containers}
            activeName={activeName}
            onOpen={onOpen}
            selectable
            selected={selected}
            onToggleSelect={toggleSelect}
            headerRight={
              <Button size="sm" variant="ghost" aria-label={`Add service to ${stack.name}`} onClick={() => setAddTo(idx)}>
                <Plus className="size-3.5" /> Add service
              </Button>
            }
          />
        ))}
```
5. At the end of the returned fragment:
```jsx
      {selectedContainers.length > 0 && <BulkBar env={env} containers={selectedContainers} onClear={() => setSelected(new Set())} />}
      {addTo !== null && q.data?.stacks?.[addTo] && (
        <AddServiceDialog
          env={env}
          stackIdx={addTo}
          stackName={q.data.stacks[addTo].name}
          existing={q.data.stacks[addTo].containers}
          open
          onOpenChange={(o) => !o && setAddTo(null)}
        />
      )}
```

- [ ] **Step 7: Run the tests and confirm they pass**

Run: `cd frontend && npx vitest run src/features`
Expected: all pass, including Task 12's EnvPage test. Its "no action buttons in rows" assertion still holds because checkboxes aren't buttons, and the Add service button sits in the stack header, not in rows.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/features/env
git commit -m "feat(env): maintenance switch, network fixes, add-service dialog and bulk bar

Claude-Session: https://claude.ai/code/session_0197kg3P6xdbTLt6Nn5BBj7Y"
```

---

### Task 18: Activity panel and Builds badge

**Files:**
- Create: `frontend/src/features/activity/useBuildActivity.js`, `frontend/src/features/activity/ActivityPanel.jsx`
- Modify:
  - `frontend/src/app/AppLayout.jsx`: render the panel and add the `a` hotkey
  - `frontend/src/app/PageHeader.jsx`: activity toggle button
  - `frontend/src/app/Sidebar.jsx`: Builds badge
- Test: `frontend/src/features/activity/__tests__/ActivityPanel.test.jsx`

**Interfaces:**
- Consumes:
  - `fetchProjects`, `fetchBuildRuns`, `fetchHistory` (lib/api), `qk` (Task 7)
  - `useLayout` (Task 8), `useDrawer` (Task 8), `formatAgo` (Task 7)
- Produces: `useBuildActivity({ fast }) → { active: Array<run & { project }>, count }` and `ActivityPanel()`

- [ ] **Step 1: Write the failing test** `frontend/src/features/activity/__tests__/ActivityPanel.test.jsx`

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as api from '@/lib/api';
import { renderApp } from '@/test/renderApp';

vi.mock('@/lib/api');

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  api.fetchSettingsServers.mockResolvedValue([{ env_key: 'stage' }]);
  api.fetchContainers.mockResolvedValue({ stacks: [], standalone: [] });
  api.fetchProjects.mockResolvedValue({ backend: { name: 'Backend' }, frontend: { name: 'Frontend' } });
  api.fetchBuildRuns.mockImplementation(async (project) => ({
    runs: project === 'backend'
      ? [{ id: 9, build_number: 89, status: 'running', branch: 'release/16.4', started_at: new Date().toISOString() }]
      : [{ id: 3, build_number: 12, status: 'success', branch: 'main', started_at: new Date().toISOString() }],
    hasMore: false,
  }));
  api.fetchHistory.mockResolvedValue([
    { id: 1, timestamp: new Date().toISOString(), env: 'stage', container_name: 'frontend', action: 'update-tag', old_tag: '1', new_tag: '2', success: 1 },
  ]);
});

describe('activity', () => {
  it('shows a running-build badge in the sidebar', async () => {
    renderApp('/');
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(await within(nav).findByRole('link', { name: /Builds\s*1/ })).toBeInTheDocument();
  });

  it('opens with "a", lists running builds and recent actions, and links to the drawer', async () => {
    const { router } = renderApp('/');
    const user = userEvent.setup();
    await screen.findByRole('heading', { name: 'Overview' });
    await user.keyboard('a');
    const panel = await screen.findByRole('complementary', { name: 'Activity' });
    expect(await within(panel).findByText(/backend #89/)).toBeInTheDocument();
    await user.click(await within(panel).findByRole('button', { name: /frontend.*1 → 2/ }));
    await waitFor(() => expect(router.state.location.search).toBe('?open=stage%2Ffrontend&tab=history'));
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `cd frontend && npx vitest run src/features/activity`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement** `frontend/src/features/activity/useBuildActivity.js`

```js
import { useQueries, useQuery } from '@tanstack/react-query';
import { fetchBuildRuns, fetchProjects } from '@/lib/api';
import { qk } from '@/lib/queries';

// Running + queued builds across projects. Always polled (the sidebar badge needs it);
// faster while the activity panel is open.
export function useBuildActivity({ fast = false } = {}) {
  const projects = useQuery({ queryKey: qk.buildProjects, queryFn: fetchProjects, staleTime: 5 * 60000 });
  const keys = Object.keys(projects.data || {});
  const runs = useQueries({
    queries: keys.map((project) => ({
      queryKey: qk.buildRuns(project),
      queryFn: () => fetchBuildRuns(project, { limit: 5 }),
      refetchInterval: fast ? 10000 : 30000,
    })),
  });
  const active = runs.flatMap((q, i) =>
    (q.data?.runs || []).filter((r) => r.status === 'running' || r.status === 'queued').map((r) => ({ ...r, project: keys[i] })),
  );
  return { active, count: active.length };
}
```

- [ ] **Step 4: Implement** `frontend/src/features/activity/ActivityPanel.jsx`

```jsx
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatusDot } from '@/components/status';
import { fetchHistory } from '@/lib/api';
import { formatAgo } from '@/lib/containers';
import { qk } from '@/lib/queries';
import { useLayout } from '@/app/layoutContext';
import { useDrawer } from '@/features/container/useDrawer';
import { useBuildActivity } from '@/features/activity/useBuildActivity';

const toIso = (s) => (s && !s.includes('T') ? `${s.replace(' ', 'T')}Z` : s);

export function ActivityPanel() {
  const { setActivityOpen } = useLayout();
  const { openDrawer } = useDrawer();
  const { active } = useBuildActivity({ fast: true });
  const history = useQuery({
    queryKey: qk.history(null, null, 20),
    queryFn: () => fetchHistory(undefined, { limit: 20 }),
    refetchInterval: 30000,
  });

  return (
    <aside aria-label="Activity" className="fixed inset-0 z-30 flex flex-col border-l bg-card md:static md:w-80 md:shrink-0">
      <div className="flex items-center border-b px-4 py-3">
        <h2 className="text-[15px] font-semibold">Activity</h2>
        <Button size="icon" variant="ghost" className="ml-auto size-7" aria-label="Close activity" onClick={() => setActivityOpen(false)}>
          <X className="size-4" />
        </Button>
      </div>
      <div className="min-h-0 flex-1 space-y-5 overflow-auto p-4">
        <section>
          <h3 className="mb-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Running builds</h3>
          {active.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nothing running.</p>
          ) : (
            <ul className="space-y-1.5">
              {active.map((r) => (
                <li key={`${r.project}-${r.id}`}>
                  <Link to="/builds" className="flex items-center gap-2 rounded-md px-1 py-1 hover:bg-muted">
                    {r.status === 'running' ? <Loader2 className="size-3.5 animate-spin text-primary" /> : <StatusDot tone="warn" />}
                    <span>{r.project} #{r.build_number}</span>
                    <span className="truncate text-xs text-muted-foreground">{r.branch}</span>
                    <span className="ml-auto text-xs text-muted-foreground">{r.status === 'queued' ? 'queued' : formatAgo(toIso(r.started_at))}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section>
          <h3 className="mb-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Recent activity</h3>
          {history.isError && <p className="text-xs text-bad">Could not load history.</p>}
          <ul className="space-y-0.5">
            {(history.data || []).map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-md px-1 py-1 text-left hover:bg-muted"
                  onClick={() => openDrawer(row.env, row.container_name, 'history')}
                >
                  <StatusDot tone={row.success ? 'ok' : 'bad'} />
                  <span className="w-10 shrink-0 text-xs text-muted-foreground">{formatAgo(row.timestamp)}</span>
                  <span className="truncate">
                    {row.container_name} <span className="text-xs text-muted-foreground">{row.env}</span>
                  </span>
                  <span className="ml-auto truncate font-mono text-xs">
                    {row.old_tag && row.new_tag ? `${row.old_tag} → ${row.new_tag}` : row.action}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </aside>
  );
}
```

- [ ] **Step 5: Wire the panel, hotkey, header toggle and badge**

In `frontend/src/app/AppLayout.jsx`:
1. Import `useEffect` (add it to the React import) and `ActivityPanel`.
2. Inside `AppLayout`, add:
```jsx
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'a' || e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable) return;
      if (document.querySelector('[role="alertdialog"], [role="dialog"]')) return;
      toggleActivity();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [toggleActivity]);
```
3. Render `{activityOpen && <ActivityPanel />}` after the main column `div` and before `<ContainerDrawer />`.

In `frontend/src/app/PageHeader.jsx`, add the toggle as the last child of the right-hand group:
```jsx
import { PanelRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLayout } from '@/app/layoutContext';

export function PageHeader({ title, subtitle, children }) {
  const { activityOpen, toggleActivity } = useLayout();
  return (
    <div className="flex flex-wrap items-center gap-3 border-b bg-card px-6 py-4">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold">{title}</h1>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        {children}
        <Button variant="outline" size="icon" className="size-8" aria-label="Activity (a)" aria-pressed={activityOpen} onClick={toggleActivity}>
          <PanelRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}
```

In `frontend/src/app/Sidebar.jsx`:
1. Import `useBuildActivity`.
2. Call `const { count: activeBuilds } = useBuildActivity();`.
3. Inside the Builds `NavLink`, after the "Builds" span, add:
```jsx
        {activeBuilds > 0 && <span className="rounded-full bg-accent px-1.5 text-[11px] font-medium text-accent-foreground">{activeBuilds}</span>}
```

- [ ] **Step 6: Run the tests and confirm they pass**

Run: `cd frontend && npx vitest run`
Expected: all pass. Earlier shell and page tests mock `@/lib/api` wholesale, so `fetchProjects` returns `undefined` there, which the hook treats as no projects.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/features/activity frontend/src/app/AppLayout.jsx frontend/src/app/PageHeader.jsx frontend/src/app/Sidebar.jsx
git commit -m "feat(shell): activity panel with running builds, recent actions and builds badge

Claude-Session: https://claude.ai/code/session_0197kg3P6xdbTLt6Nn5BBj7Y"
```

---

### Task 19: Command palette (⌘K / Ctrl+K)

**Files:**
- Create: `frontend/src/features/palette/CommandPalette.jsx`
- Modify: `frontend/src/app/AppLayout.jsx` (palette state, hotkey, `openPalette` in the layout context)
- Test: `frontend/src/features/palette/__tests__/CommandPalette.test.jsx`

**Interfaces:**
- Consumes:
  - `useAllEnvs` (Task 7), `flattenEnv`, `imageTag` (Task 7)
  - `useDrawer` (Task 8), `useTheme` (Task 6), `useLayout` (Task 8)
  - `useFocusedCell` (Task 11)
- Produces: `CommandPalette({ open, onOpenChange })`. The layout context gains `openPalette()`.

- [ ] **Step 1: Write the failing test** `frontend/src/features/palette/__tests__/CommandPalette.test.jsx`

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as api from '@/lib/api';
import { renderApp } from '@/test/renderApp';
import { setFocusedCell } from '@/features/overview/focusStore';

vi.mock('@/lib/api');

beforeEach(() => {
  vi.resetAllMocks();
  setFocusedCell(null);
  document.documentElement.classList.remove('dark');
  localStorage.clear();
  api.fetchSettingsServers.mockResolvedValue([{ env_key: 'stage' }, { env_key: 'prod' }]);
  api.fetchContainers.mockImplementation(async (env) => ({
    stacks: [{ name: 'Main', path: '/m', containers: [{ name: 'frontend', serviceName: 'frontend', image: `reg/fe:${env === 'prod' ? '1' : '2'}`, status: 'running', managed: true, stackPath: '/m' }] }],
    standalone: [],
  }));
});

describe('CommandPalette', () => {
  it('jumps to a container drawer', async () => {
    const { router } = renderApp('/');
    const user = userEvent.setup();
    await screen.findByRole('heading', { name: 'Overview' });
    await user.keyboard('{Control>}k{/Control}');
    await user.type(await screen.findByPlaceholderText('Search containers, environments, pages, actions…'), 'frontend prod');
    await user.click(await screen.findByRole('option', { name: /frontend · PROD · 1/ }));
    await waitFor(() => expect(router.state.location.search).toBe('?open=prod%2Ffrontend&tab=deploy'));
  });

  it('navigates to environments and runs actions', async () => {
    const { router } = renderApp('/');
    const user = userEvent.setup();
    await screen.findByRole('heading', { name: 'Overview' });
    await user.keyboard('{Control>}k{/Control}');
    await user.click(await screen.findByRole('option', { name: 'stage' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/env/stage'));
    await user.keyboard('{Control>}k{/Control}');
    await user.click(await screen.findByRole('option', { name: 'Toggle theme' }));
    expect(document.documentElement).toHaveClass('dark');
  });

  it('offers "Deploy {service} to {env}…" for the focused Overview cell', async () => {
    const { router } = renderApp('/');
    const user = userEvent.setup();
    await screen.findByRole('heading', { name: 'Overview' });
    setFocusedCell({ env: 'stage', containerName: 'frontend', service: 'frontend' });
    await user.keyboard('{Control>}k{/Control}');
    await user.click(await screen.findByRole('option', { name: 'Deploy frontend to STAGE…' }));
    await waitFor(() => expect(router.state.location.search).toBe('?open=stage%2Ffrontend&tab=deploy'));
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `cd frontend && npx vitest run src/features/palette`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement** `frontend/src/features/palette/CommandPalette.jsx`

```jsx
import { useNavigate, useLocation } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command';
import { StatusDot } from '@/components/status';
import { flattenEnv, describeState } from '@/lib/containers';
import { imageTag } from '@/lib/image';
import { useAllEnvs } from '@/lib/queries';
import { useTheme } from '@/app/ThemeProvider';
import { useLayout } from '@/app/layoutContext';
import { useDrawer } from '@/features/container/useDrawer';
import { useFocusedCell } from '@/features/overview/focusStore';

const PAGES = [
  ['Overview', '/'],
  ['Builds', '/builds'],
  ['Migrations', '/migrations'],
  ['History', '/history'],
  ['Settings', '/settings'],
];

export function CommandPalette({ open, onOpenChange }) {
  const envs = useAllEnvs();
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const { toggleTheme, setDensity, density } = useTheme();
  const { toggleActivity } = useLayout();
  const { openDrawer } = useDrawer();
  const focused = useFocusedCell();

  const go = (fn) => () => {
    onOpenChange(false);
    fn();
  };
  const containers = envs.flatMap((e) => flattenEnv(e.data).map((c) => ({ env: e.env, c })));

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Command palette" description="Search containers, environments, pages and actions">
      <CommandInput placeholder="Search containers, environments, pages, actions…" />
      <CommandList>
        <CommandEmpty>No results.</CommandEmpty>
        {location.pathname === '/' && focused && (
          <CommandGroup heading="Focused cell">
            <CommandItem value={`deploy ${focused.service} ${focused.env}`} onSelect={go(() => openDrawer(focused.env, focused.containerName, 'deploy'))}>
              Deploy {focused.service} to {focused.env.toUpperCase()}…
            </CommandItem>
          </CommandGroup>
        )}
        <CommandGroup heading="Containers">
          {containers.map(({ env, c }) => (
            <CommandItem key={`${env}/${c.name}`} value={`${c.serviceName || c.name} ${env} ${c.name}`} onSelect={go(() => openDrawer(env, c.name, 'deploy'))}>
              <StatusDot tone={describeState(c).tone} />
              {c.serviceName || c.name} · {env.toUpperCase()} · {imageTag(c.image)}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Environments">
          {envs.map((e) => (
            <CommandItem key={e.env} value={`env ${e.env}`} onSelect={go(() => navigate(`/env/${e.env}`))}>
              {e.env}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Pages">
          {PAGES.map(([label, path]) => (
            <CommandItem key={path} value={`page ${label}`} onSelect={go(() => navigate(path))}>{label}</CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Actions">
          <CommandItem value="toggle theme dark light" onSelect={go(toggleTheme)}>Toggle theme</CommandItem>
          <CommandItem value="toggle compact rows density" onSelect={go(() => setDensity(density === 'compact' ? 'comfortable' : 'compact'))}>Toggle compact rows</CommandItem>
          <CommandItem value="toggle activity panel" onSelect={go(toggleActivity)}>Toggle activity panel</CommandItem>
          <CommandItem value="refresh all environments" onSelect={go(() => qc.refetchQueries({ queryKey: ['containers'] }))}>Refresh all</CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
```

- [ ] **Step 4: Wire it into** `frontend/src/app/AppLayout.jsx`
1. Import `CommandPalette`.
2. Add `const [paletteOpen, setPaletteOpen] = useState(false);`.
3. Add `openPalette: () => setPaletteOpen(true)` to the `layout` memo value (and to its deps).
4. Add a hotkey effect:
```jsx
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
```
5. Render `<CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />` as the last child of the provider.

The palette sits inside the layout, so its `useLayout()` works. The shadcn `CommandDialog` accepts `title`/`description` for screen readers; if the generated component doesn't take them, remove those two props.

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `cd frontend && npx vitest run`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/palette frontend/src/app/AppLayout.jsx
git commit -m "feat(shell): command palette for containers, envs, pages and actions

Claude-Session: https://claude.ai/code/session_0197kg3P6xdbTLt6Nn5BBj7Y"
```

---

### Task 20: Remove the old UI, density toggle, final verification

**Files:**
- Delete:
  - `frontend/src/App.jsx`, `frontend/src/AppShell.jsx`
  - `frontend/src/components/{AddServicePanel,BulkActionBar,CommandPalette,ContainerRow,DashboardView,EnvPanel,LogsPanel,Sidebar,StackGroup,TopBar,UpdateTagModal,VersionInfoModal}.jsx`
  - `frontend/src/__tests__/appShell.test.js`, `frontend/src/__tests__/commandPalette.test.js`
- Modify: `frontend/src/app/Sidebar.jsx` (compact-rows toggle next to the theme toggle)
- Test: `frontend/src/__tests__/noBrowserDialogs.test.js` (new)

**Interfaces:**
- Consumes: `useTheme().density/setDensity` (Task 6)

- [ ] **Step 1: Write the failing guard test** `frontend/src/__tests__/noBrowserDialogs.test.js`

```js
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import { fileURLToPath } from 'node:url';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const walk = (dir) =>
  readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    if (statSync(p).isDirectory()) return f === 'legacy' || f === '__tests__' ? [] : walk(p);
    return /\.(jsx?|mjs)$/.test(f) ? [p] : [];
  });

describe('no browser dialogs outside legacy (spec §6.1)', () => {
  it('has no alert/confirm/prompt calls', () => {
    const offenders = walk(SRC).filter((f) => /(?<![\w.])(window\.)?(alert|confirm|prompt)\(/.test(readFileSync(f, 'utf8')));
    expect(offenders.map((f) => path.relative(SRC, f))).toEqual([]);
  });
});
```
The lookbehind skips member calls like `useDialogs().confirm(` and `{ confirm } = …; confirm(`. The first is intended. The second would be flagged, so the test is strict: destructured `confirm(` calls in `useRunAction.js`, `BulkBar.jsx` and `EnvHeaderActions.jsx` also match. Handle it like this:
1. Run the test and read the list.
2. Rename the destructured function to `ask` in those three files (`const { confirm: ask, showError } = useDialogs();` and `await ask({ … })`) so only real browser dialogs can match.
3. The canonical interface name stays `confirm` on the `useDialogs()` object.

- [ ] **Step 2: Run it and confirm it fails**

Run: `cd frontend && npx vitest run src/__tests__/noBrowserDialogs.test.js`
Expected: FAIL. The list includes the old `src/components/*.jsx` (`alert(`, `window.prompt(`, `window.confirm(`) and the three destructured `confirm(` call sites.

- [ ] **Step 3: Delete the old UI and rename the destructured confirms**

```bash
cd frontend
git rm src/App.jsx src/AppShell.jsx src/__tests__/appShell.test.js src/__tests__/commandPalette.test.js
git rm src/components/AddServicePanel.jsx src/components/BulkActionBar.jsx src/components/CommandPalette.jsx src/components/ContainerRow.jsx src/components/DashboardView.jsx src/components/EnvPanel.jsx src/components/LogsPanel.jsx src/components/Sidebar.jsx src/components/StackGroup.jsx src/components/TopBar.jsx src/components/UpdateTagModal.jsx src/components/VersionInfoModal.jsx
grep -rn "components/\(AddServicePanel\|BulkActionBar\|CommandPalette\|ContainerRow\|DashboardView\|EnvPanel\|LogsPanel\|Sidebar\|StackGroup\|TopBar\|UpdateTagModal\|VersionInfoModal\)\|AppShell" src || echo "no references left"
```
Expected: `no references left`.
- In `src/features/container/useRunAction.js`, `src/features/env/BulkBar.jsx` and `src/features/env/EnvHeaderActions.jsx`, change `const { confirm, … } = useDialogs();` to `const { confirm: ask, … } = useDialogs();`.
- Replace `await confirm({` with `await ask({` in those files.
- In `useRunAction.js`, also change `confirm` to `ask` in the `useCallback` dependency array.

- [ ] **Step 4: Add the compact-rows toggle.** In `frontend/src/app/Sidebar.jsx`:
1. Import `Rows3` from lucide.
2. Destructure `density, setDensity` from `useTheme()`.
3. Add next to the theme button:
```jsx
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label={density === 'compact' ? 'Use comfortable rows' : 'Use compact rows'}
          aria-pressed={density === 'compact'}
          onClick={() => setDensity(density === 'compact' ? 'comfortable' : 'compact')}
        >
          <Rows3 className="size-4" />
        </Button>
```

- [ ] **Step 5: Run everything**

```bash
cd frontend && npx vitest run && npm run build
cd ../backend && for t in services/*.test.js routes/*.test.js *.test.js; do node $t || echo "FAIL $t"; done
```
Expected:
- all frontend tests pass, including `noBrowserDialogs`;
- the build succeeds;
- every backend test prints "passed" and there are no `FAIL` lines.

- [ ] **Step 6: Manual verification against the real config (read-only)**

Run the backend and frontend dev servers with a real `data/dashboard.db` (copy it from the main checkout; don't commit it). Open http://localhost:3000.

Check each item below; **do not click any action that changes a container, file or maintenance state**:
1. **Overview:** every configured env is a column. Services line up. Amber cells appear where a tag differs from the env to its left. An unreachable env shows "unreachable" with the popover (open it; don't run the fix).
2. **Keyboard:** arrow keys move between cells, `/` focuses the filter, `a` toggles the activity panel, Ctrl+K opens the palette.
3. **Drawer:** clicking a cell opens it. Clicking another cell switches it without closing. Esc closes it. Back/forward restore it. Tabs:
   - Deploy shows suggestions, then close without deploying.
   - Logs streams.
   - Env masks secrets.
   - Build info (where configured) and History load.
4. **Env page:** rows show health/uptime text. Unmanaged containers collapse. Selecting rows shows the bulk bar; clear it without running anything.
5. **Legacy views:** `/builds`, `/migrations`, `/history`, `/settings` work as before, including in dark mode.
6. **Themes and width:** light and dark both readable; the compact toggle changes row height. At 375px width, the sidebar opens from the menu button, the matrix scrolls sideways, and the drawer is full-screen.

Note anything that fails and fix it before the final commit.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/__tests__/noBrowserDialogs.test.js frontend/src/app/Sidebar.jsx frontend/src/features/container/useRunAction.js frontend/src/features/env/BulkBar.jsx frontend/src/features/env/EnvHeaderActions.jsx
git commit -m "chore(frontend): remove the pre-rebuild dashboard UI and add compact rows toggle

Claude-Session: https://claude.ai/code/session_0197kg3P6xdbTLt6Nn5BBj7Y"
```
(`git rm` already staged the deletions.)

---

## Self-review notes (resolved)

- **Spec coverage:**
  - §3.2 routes: Task 8
  - §3.4 data flow: Task 7
  - §3.5 legacy: Task 5
  - §3.6.1/2/3 backend: Tasks 1/2/3
  - §4 visual system: Task 8 (tokens, status), Task 6 (theme), Task 20 (density toggle)
  - §5.1 shell: Tasks 8, 18
  - §5.2 Overview: Tasks 9, 11
  - §5.3 Env page: Tasks 12, 17
  - §5.4 drawer and tabs: Tasks 13–16
  - §5.5 palette: Task 19
  - §6.1 confirmations: Task 10, guarded in Task 20
  - §6.2 in-flight state: Tasks 7, 10, 11, 12
  - §6.3 loading and errors: Tasks 7, 11, 12, 13
  - §6.4 persistence: Tasks 6, 11, 13, 18
  - §7 tests: each task
  - §8 acceptance: Task 20 Step 6
- **Deviation from the spec (flag to the user):** the env "⋯" menu items "Whitelist my IP…" / "Restart FortiVPN…" open a small dialog with the fix button and its streamed output, rather than running immediately. This keeps an accidental menu click from restarting the VPN.
- **Deviation from the spec (flag to the user):** the Overview "+N" marker shows a count in its tooltip ("Also defined in N more stacks"), not the other stack names. The container list response doesn't need to change for this.
- **Known follow-up, not in scope:** backend `update-tag` doesn't validate `newTag`. The frontend now blocks invalid tags (Task 14 `isValidTag`), but a direct API call with a newline in `newTag` could still write an extra `.env` line. Worth a one-line check in a later security pass.
