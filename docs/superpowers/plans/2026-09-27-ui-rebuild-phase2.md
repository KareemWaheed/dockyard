# UI Rebuild Phase 2 — Builds, Migrations & PWA — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the legacy Builds and Flyway views with runs-first, mobile-responsive pages built on the Phase 1 design system, and make Dockyard an installable PWA.

**Architecture:** Shared run primitives (`features/runs/`: WebSocket stream hook, log viewer, run list, status badge, command runner, picker) are built first and consumed by `features/builds/` and `features/migrations/`. Pages are URL-driven (`/builds/:project/:num`, `/migrations/:runId`); phone vs desktop is CSS (`lg:` breakpoint) plus one `useIsDesktop()` check that decides whether to auto-select the latest run. The PWA uses `vite-plugin-pwa` with a precached app shell and no API caching.

**Tech Stack:** React 19, React Router 7 (`react-router`), TanStack Query 5, Tailwind v4, shadcn/Radix, cmdk, sonner, Vitest + Testing Library + jsdom, Express + better-sqlite3 (backend), vite-plugin-pwa + Workbox.

**Spec:** `docs/superpowers/specs/2026-09-27-ui-rebuild-phase2-design.md` (read it alongside this plan).

**Working directory:** `D:\Work\Projects\namaa-devops\.worktrees\ui-rebuild` on branch `feat/ui-rebuild`. All paths below are relative to it. Frontend commands run from `frontend/`.

## Global Constraints

- JavaScript only (no TypeScript). Import alias `@/` = `frontend/src/`.
- Never write a bare `alert(`, `confirm(` or `prompt(` call anywhere under `frontend/src` outside `legacy/` and `__tests__/` — `src/__tests__/noBrowserDialogs.test.js` fails on the regex `(?<![\w.])(window\.)?(alert|confirm|prompt)\(`. When destructuring `useDialogs()`, rename: `const { confirm: askConfirm } = useDialogs()`.
- Confirmations go through `useDialogs().confirm` (levels `'confirm'` / `'typed'`). Prod rule: `isProd(name)` from `@/features/container/actions` (`/^prod/i`).
- Local storage only through `readPref` / `writePref` / `usePref` from `@/lib/storage` (prefix `dockyard:`), except the one read-only legacy fallback in `recentStore.js`.
- Colours only via theme tokens (`text-ok`, `bg-bad-bg`, `text-muted-foreground`, …) and `StatusBadge` / `Tag` from `@/components/status`. No hex colours in components.
- Desktop breakpoint: `lg` = `(min-width: 1024px)`. Touch targets ≥ 40px (`h-10`/`min-h-10`) on anything tappable in the new pages. No horizontal page scroll at 390px.
- Timestamps from the backend are SQLite UTC strings (`2026-09-27 10:00:00`); always pass through `toIso()` before `Date.parse`/`formatAgo`.
- URLs built from project keys use `encodeURIComponent(project)`.
- API failures surface as toasts (via `useRunCommand`) or inline error text — never only `console.error`.
- Do not commit anything under `docs/` (gitignored). Commit code per task on `feat/ui-rebuild`.
- Run the full frontend suite (`npx vitest run`) at the end of every task, not only the new test file.

## Review Focus

1. **Malformed or out-of-date run data** — a run whose `args_json`/`commits_json`/`pushed_images_json` is invalid JSON, or whose params no longer exist in the project config, must render what it can and never crash the detail view. *(Task 3 + Task 9 tests)*
2. **Deep link to an old run** — `/builds/api/5` where #5 is not on the first page, and `/migrations/7` where run 7 is older than the last 50, must fetch the single run and show it; a missing run shows a "not found" state. *(Task 11 + Task 13 tests)*
3. **Rapid run switching** — clicking between runs must close the previous WebSocket before opening the next, so logs never interleave. *(Task 5 test)*
4. **Project keys needing encoding** — a project key with a space or slash must produce working links (`/builds/my%20app/3`). *(Task 11 test)*
5. **Flyway environment with no databases** — selecting it must disable Info/Migrate instead of sending `dbId: NaN`. *(Task 12 test)*

---

## File Structure

**Backend**
- Modify `backend/routes/flyway.js` — single-run endpoint joins env/db names.
- Create `backend/routes/flyway.test.js` — plain Node integration check.

**Frontend — shared**
- Modify `frontend/src/lib/api.js` — `fetchBuildRun`, `fetchFlywayRun`.
- Modify `frontend/src/lib/queries.js` — new query keys.
- Create `frontend/src/lib/useMediaQuery.js` — `useMediaQuery`, `useIsDesktop`, `DESKTOP_QUERY`.
- Create `frontend/src/lib/useOnline.js` — online/offline state.
- Create `frontend/src/components/ui/native-select.jsx` — styled native `<select>`.
- Create `frontend/src/test/viewport.js`, `frontend/src/test/renderWithProviders.jsx` — test helpers.
- Create `frontend/src/features/runs/runStatus.js` — status → tone/label, `isActive`, `toIso`.
- Create `frontend/src/features/runs/RunStatusBadge.jsx`
- Create `frontend/src/features/runs/RunList.jsx` — keyboard-navigable link list.
- Create `frontend/src/features/runs/ComboPicker.jsx` — searchable popover picker (branches, projects).
- Create `frontend/src/features/runs/useRunStream.js` — build/flyway WebSocket hook.
- Create `frontend/src/features/runs/RunLog.jsx` — log viewer (extracted from `LogsTab`).
- Create `frontend/src/features/runs/useRunCommand.js` — confirm → toast → invalidate.
- Modify `frontend/src/features/container/LogsTab.jsx` — use `RunLog`.

**Frontend — builds**
- Create `frontend/src/features/builds/buildArgs.js` — pure form/args/run parsing helpers.
- Create `frontend/src/features/builds/recentStore.js` — last-used form values per project.
- Create `frontend/src/features/builds/DeployBar.jsx`
- Create `frontend/src/features/builds/RunDetail.jsx`
- Create `frontend/src/features/builds/ParamField.jsx`
- Create `frontend/src/features/builds/NewBuildSheet.jsx`
- Create `frontend/src/features/builds/BuildsPage.jsx` — `BuildsIndex` + `BuildsPage`.

**Frontend — migrations**
- Create `frontend/src/features/migrations/MigrationForm.jsx`
- Create `frontend/src/features/migrations/MigrationRunDetail.jsx`
- Create `frontend/src/features/migrations/MigrationsPage.jsx`

**Frontend — wiring, PWA, cleanup**
- Modify `frontend/src/app/router.jsx`, `frontend/src/features/activity/ActivityPanel.jsx`, `frontend/src/features/palette/CommandPalette.jsx`, `frontend/src/app/AppLayout.jsx`, `frontend/src/main.jsx`, `frontend/index.html`, `frontend/vite.config.js`, `frontend/package.json`, `nginx.conf`.
- Create `frontend/src/app/OfflineBanner.jsx`, `frontend/src/app/PwaUpdater.jsx`, `frontend/pwa-assets.config.js`, generated PNGs in `frontend/public/`.
- Delete `frontend/src/legacy/BuildView.jsx`, `frontend/src/legacy/FlywayView.jsx`, `frontend/src/legacy/SearchableSelect.jsx`, and their rules in `frontend/src/legacy/legacy.css`.

---

### Task 1: Backend — env/db names on the single flyway run

**Files:**
- Modify: `backend/routes/flyway.js` (the `router.get('/runs/:id', …)` handler, ~line 130)
- Test: `backend/routes/flyway.test.js`

**Interfaces:**
- Produces: `GET /api/flyway/runs/:id` → full `flyway_runs` row plus `env_name`, `db_name` (null if the env/db was deleted). 404 `{ error: 'Run not found' }` unchanged.

- [ ] **Step 1: Write the failing test** — create `backend/routes/flyway.test.js`:

```js
// Integration check: the single-run endpoint returns env/db names like the list does.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dockyard-flyway-'));
process.env.DB_PATH = path.join(tmp, 'test.db');
process.env.CONFIG_PATH = path.join(tmp, 'missing-config.json');
process.env.NOTES_PATH = path.join(tmp, 'notes.json');

const express = require('express');
const db = require('../db');

const envId = db.prepare("INSERT INTO flyway_envs (name) VALUES ('stage')").run().lastInsertRowid;
const dbId = db
  .prepare("INSERT INTO flyway_databases (env_id, name, url, db_user, db_password, schemas) VALUES (?, 'core', 'jdbc:postgresql://x/core', 'u', 'p', 'public')")
  .run(envId).lastInsertRowid;
const runId = db
  .prepare("INSERT INTO flyway_runs (run_number, env_id, db_id, project, branch, command, status, started_at) VALUES (1, ?, ?, 'api', 'main', 'info', 'success', '2026-09-27 10:00:00')")
  .run(envId, dbId).lastInsertRowid;

const app = express();
app.use(express.json());
app.use('/api/flyway', require('./flyway'));
const server = http.createServer(app);

server.listen(0, async () => {
  const { port } = server.address();
  let failed = false;
  try {
    let r = await fetch(`http://127.0.0.1:${port}/api/flyway/runs/${runId}`);
    assert.strictEqual(r.status, 200);
    const run = await r.json();
    assert.strictEqual(run.env_name, 'stage', 'env_name must be joined');
    assert.strictEqual(run.db_name, 'core', 'db_name must be joined');
    assert.strictEqual(run.command, 'info');

    r = await fetch(`http://127.0.0.1:${port}/api/flyway/runs/999`);
    assert.strictEqual(r.status, 404);
    console.log('flyway routes: ok');
  } catch (err) {
    failed = true;
    console.error(err);
  } finally {
    server.close();
    process.exit(failed ? 1 : 0);
  }
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node backend/routes/flyway.test.js`
Expected: FAIL — `AssertionError: env_name must be joined` (actual `undefined`).

- [ ] **Step 3: Implement** — replace the `/runs/:id` handler body in `backend/routes/flyway.js`:

```js
// GET /api/flyway/runs/:id — single run with full log (+ env/db names, like the list)
router.get('/runs/:id', (req, res) => {
  const run = db.prepare(`
    SELECT r.*, e.name as env_name, d.name as db_name
    FROM flyway_runs r
    LEFT JOIN flyway_envs e ON e.id = r.env_id
    LEFT JOIN flyway_databases d ON d.id = r.db_id
    WHERE r.id = ?
  `).get(req.params.id);
  if (!run) return res.status(404).json({ error: 'Run not found' });
  res.json(run);
});
```

- [ ] **Step 4: Run it to verify it passes**

Run: `node backend/routes/flyway.test.js` → prints `flyway routes: ok`, exit 0.
Also run `node backend/routes/security.test.js` → still passes.

- [ ] **Step 5: Commit**

```bash
git add backend/routes/flyway.js backend/routes/flyway.test.js
git commit -m "fix(flyway): return env and db names from the single-run endpoint"
```

---

### Task 2: Frontend foundation — API, query keys, media query, test helpers

**Files:**
- Modify: `frontend/src/lib/api.js`
- Modify: `frontend/src/lib/queries.js` (the `qk` object)
- Create: `frontend/src/lib/useMediaQuery.js`
- Create: `frontend/src/test/viewport.js`
- Create: `frontend/src/test/renderWithProviders.jsx`
- Test: `frontend/src/lib/__tests__/useMediaQuery.test.jsx`

**Interfaces:**
- Produces:
  - `fetchBuildRun(project: string, buildNumber: number) → Promise<run>`; on failure throws `Error` with `.status` (HTTP code).
  - `fetchFlywayRun(id: number) → Promise<run>`; same error shape.
  - `qk.buildRunPages(project) = ['build-runs', project, 'pages']` (prefix-shares `qk.buildRuns(project)` so invalidating `qk.buildRuns(project)` refreshes both the activity panel and the page), `qk.buildRun(project, num) = ['build-run', project, num]`, `qk.branches(project) = ['branches', project]`, `qk.caproverTargets = ['caprover-targets']`, `qk.flywayEnvs = ['flyway-envs']`, `qk.flywayRuns = ['flyway-runs']`, `qk.flywayRun(id) = ['flyway-run', id]`.
  - `useMediaQuery(query: string) → boolean`, `DESKTOP_QUERY = '(min-width: 1024px)'`, `useIsDesktop() → boolean`.
  - Test helpers: `setViewport({ desktop: boolean })`; `renderWithProviders(ui, { path = '/', routePath = '*' } = {}) → { router, queryClient, ...renderResult }`.

> Note: the spec (§4.4) says the page "reuses `qk.buildRuns(project)`". The activity panel already uses that exact key with `limit: 5`, so the page uses the child key `qk.buildRunPages(project)` instead; prefix invalidation keeps both in sync, which is the spec's intent.

- [ ] **Step 1: Write the failing test** — `frontend/src/lib/__tests__/useMediaQuery.test.jsx`:

```jsx
import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useIsDesktop } from '@/lib/useMediaQuery';
import { setViewport } from '@/test/viewport';

describe('useIsDesktop', () => {
  it('reflects the lg breakpoint', () => {
    setViewport({ desktop: true });
    expect(renderHook(() => useIsDesktop()).result.current).toBe(true);
    setViewport({ desktop: false });
    expect(renderHook(() => useIsDesktop()).result.current).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run (from `frontend/`): `npx vitest run src/lib/__tests__/useMediaQuery.test.jsx`
Expected: FAIL — cannot resolve `@/lib/useMediaQuery`.

- [ ] **Step 3: Implement**

`frontend/src/lib/useMediaQuery.js`:
```js
import { useSyncExternalStore } from 'react';

export const DESKTOP_QUERY = '(min-width: 1024px)';

export function useMediaQuery(query) {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener?.('change', onChange);
      return () => mql.removeEventListener?.('change', onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

export const useIsDesktop = () => useMediaQuery(DESKTOP_QUERY);
```

`frontend/src/test/viewport.js`:
```js
import { DESKTOP_QUERY } from '@/lib/useMediaQuery';

// jsdom has no layout: stub matchMedia so the lg breakpoint is under test control.
export function setViewport({ desktop }) {
  window.matchMedia = (query) => ({
    matches: query === DESKTOP_QUERY ? desktop : false,
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  });
}
```

`frontend/src/test/renderWithProviders.jsx`:
```jsx
import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { QueryClient } from '@tanstack/react-query';
import { AppProviders } from '@/app/AppProviders';

// Renders one component with the app providers and a memory router (for Link/useParams).
export function renderWithProviders(ui, { path = '/', routePath = '*', queryClient } = {}) {
  const client = queryClient ?? new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const router = createMemoryRouter([{ path: routePath, element: ui }, { path: '*', element: <div data-testid="elsewhere" /> }], { initialEntries: [path] });
  const utils = render(
    <AppProviders queryClient={client}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return { ...utils, router, queryClient: client };
}
```

Append to `frontend/src/lib/api.js` (next to the other build/flyway functions):
```js
// Single build run with full log — throws Error with .status (404 when missing)
export async function fetchBuildRun(project, buildNumber) {
  const r = await fetch(`${BASE}/builds/${encodeURIComponent(project)}/runs/${buildNumber}`);
  if (!r.ok) {
    const err = await readError(r);
    err.status = r.status;
    throw err;
  }
  return r.json();
}

// Single flyway run with full log + env/db names — throws Error with .status
export async function fetchFlywayRun(id) {
  const r = await fetch(`${BASE}/flyway/runs/${id}`);
  if (!r.ok) {
    const err = await readError(r);
    err.status = r.status;
    throw err;
  }
  return r.json();
}
```

In `frontend/src/lib/queries.js`, extend `qk`:
```js
  buildRuns: (project) => ['build-runs', project],
  // Child of buildRuns(project): invalidating buildRuns(project) also refreshes the page's list.
  buildRunPages: (project) => ['build-runs', project, 'pages'],
  buildRun: (project, num) => ['build-run', project, num],
  branches: (project) => ['branches', project],
  caproverTargets: ['caprover-targets'],
  flywayEnvs: ['flyway-envs'],
  flywayRuns: ['flyway-runs'],
  flywayRun: (id) => ['flyway-run', id],
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/__tests__/useMediaQuery.test.jsx` → PASS. Then `npx vitest run` → all PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib frontend/src/test
git commit -m "feat(frontend): run fetchers, query keys, breakpoint hook and test helpers"
```

---

### Task 3: Pure build helpers — args, parsing, recent values

**Files:**
- Create: `frontend/src/features/builds/buildArgs.js`
- Create: `frontend/src/features/builds/recentStore.js`
- Test: `frontend/src/features/builds/__tests__/buildArgs.test.js`, `frontend/src/features/builds/__tests__/recentStore.test.js`

**Interfaces:**
- Produces (`buildArgs.js`):
  - `initFormState(params: Param[], saved?: object) → object` — defaults per type, overlaid with `saved` values for known param names only.
  - `buildArgs(params, values) → string[]` — CLI args (`checkbox` → flag; `multiselect` → flag per item; others → flag + value if non-empty).
  - `isFormValid(params, values, branch) → boolean`.
  - `parseArgs(params, argsJson: string, branch?: string) → {label, value}[]` — never throws.
  - `parseJsonArray(s) → any[]` — `[]` on null/invalid/non-array.
  - `parseDeployMeta(run) → {label, value}[]` — for `type === 'deploy'`, never throws.
  - `deployEnvOf(run) → string` — the `env` from a deploy run's `args_json`, `''` otherwise.
  - `Param = { name, type: 'string'|'select'|'multiselect'|'checkbox', flag, label?, options?, required?, placeholder?, default? }`.
- Produces (`recentStore.js`): `loadRecent(project) → { branch: string, values: object } | null`, `saveRecent(project, { branch, values }) → void`.

- [ ] **Step 1: Write the failing tests**

`frontend/src/features/builds/__tests__/buildArgs.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { initFormState, buildArgs, isFormValid, parseArgs, parseJsonArray, parseDeployMeta, deployEnvOf } from '@/features/builds/buildArgs';

const params = [
  { name: 'tag', type: 'string', flag: '--tag', label: 'Tag', required: true },
  { name: 'env', type: 'select', flag: '--env', options: ['dev', 'prod'], default: 'dev' },
  { name: 'mods', type: 'multiselect', flag: '--module', options: ['a', 'b', 'c'], required: true },
  { name: 'skip', type: 'checkbox', flag: '--skip-tests', label: 'Skip tests' },
];

describe('initFormState', () => {
  it('uses defaults per type', () => {
    expect(initFormState(params)).toEqual({ tag: '', env: 'dev', mods: [], skip: false });
  });
  it('overlays saved values for known params only', () => {
    expect(initFormState(params, { tag: '1.2', skip: true, gone: 'x' })).toEqual({ tag: '1.2', env: 'dev', mods: [], skip: true });
  });
});

describe('buildArgs', () => {
  it('turns values into CLI args', () => {
    expect(buildArgs(params, { tag: '1.2', env: 'prod', mods: ['a', 'c'], skip: true }))
      .toEqual(['--tag', '1.2', '--env', 'prod', '--module', 'a', '--module', 'c', '--skip-tests']);
  });
  it('omits empty strings and unchecked flags', () => {
    expect(buildArgs(params, { tag: '', env: 'dev', mods: [], skip: false })).toEqual(['--env', 'dev']);
  });
});

describe('isFormValid', () => {
  it('needs a branch and every required field', () => {
    expect(isFormValid(params, { tag: '1', mods: ['a'] }, '')).toBe(false);
    expect(isFormValid(params, { tag: '', mods: ['a'] }, 'main')).toBe(false);
    expect(isFormValid(params, { tag: '1', mods: [] }, 'main')).toBe(false);
    expect(isFormValid(params, { tag: '1', mods: ['a'] }, 'main')).toBe(true);
  });
});

describe('parseArgs', () => {
  it('reads a finished run back into labelled rows', () => {
    const json = JSON.stringify(['--tag', '1.2', '--module', 'a', '--module', 'b', '--skip-tests']);
    expect(parseArgs(params, json, 'main')).toEqual([
      { label: 'Branch', value: 'main' },
      { label: 'Tag', value: '1.2' },
      { label: 'mods', value: 'a, b' },
      { label: 'Skip tests', value: 'yes' },
    ]);
  });
  it('survives malformed JSON and params removed from the config (Review Focus 1)', () => {
    expect(parseArgs(params, '{not json', 'main')).toEqual([{ label: 'Branch', value: 'main' }, { label: 'Skip tests', value: 'no' }]);
    expect(parseArgs(undefined, '["--tag","1"]')).toEqual([]);
  });
});

describe('parseJsonArray / parseDeployMeta / deployEnvOf', () => {
  it('returns [] for bad input', () => {
    expect(parseJsonArray(null)).toEqual([]);
    expect(parseJsonArray('nope')).toEqual([]);
    expect(parseJsonArray('{"a":1}')).toEqual([]);
    expect(parseJsonArray('["x"]')).toEqual(['x']);
  });
  it('describes a deploy run', () => {
    const run = { type: 'deploy', branch: 'main', args_json: JSON.stringify({ sourceBuildNumber: 41, gitHash: 'abcdef1234567', image: 'reg/app:1', env: 'stage', app: 'app-stage' }) };
    expect(parseDeployMeta(run)).toEqual([
      { label: 'From build', value: '#41' },
      { label: 'Branch', value: 'main' },
      { label: 'Git hash', value: 'abcdef123' },
      { label: 'Image', value: 'reg/app:1' },
      { label: 'Environment', value: 'stage' },
      { label: 'CapRover app', value: 'app-stage' },
    ]);
    expect(deployEnvOf(run)).toBe('stage');
    expect(parseDeployMeta({ type: 'deploy', args_json: 'garbage' })).toEqual([]);
    expect(deployEnvOf({ type: 'build', args_json: '[]' })).toBe('');
  });
});
```

`frontend/src/features/builds/__tests__/recentStore.test.js`:
```js
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadRecent, saveRecent } from '@/features/builds/recentStore';

beforeEach(() => localStorage.clear());

describe('recentStore', () => {
  it('round-trips per project', () => {
    expect(loadRecent('api')).toBeNull();
    saveRecent('api', { branch: 'main', values: { tag: '1' } });
    saveRecent('web', { branch: 'dev', values: {} });
    expect(loadRecent('api')).toEqual({ branch: 'main', values: { tag: '1' } });
  });

  it('falls back to the legacy key written by the old Builds page', () => {
    localStorage.setItem('dockyard_build_recent', JSON.stringify({ api: { branch: 'release/1', tag: '9' } }));
    expect(loadRecent('api')).toEqual({ branch: 'release/1', values: { tag: '9' } });
  });

  it('returns null when storage throws', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(loadRecent('api')).toBeNull();
    spy.mockRestore();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/features/builds/__tests__` → FAIL (modules missing).

- [ ] **Step 3: Implement**

`frontend/src/features/builds/buildArgs.js`:
```js
// Pure helpers for the build form and for reading finished runs. Ported from legacy/BuildView.jsx.

export function initFormState(params = [], saved = {}) {
  const state = {};
  for (const p of params) {
    if (p.type === 'multiselect') state[p.name] = p.default || [];
    else if (p.type === 'checkbox') state[p.name] = p.default || false;
    else state[p.name] = p.default || '';
    if (saved && Object.prototype.hasOwnProperty.call(saved, p.name)) state[p.name] = saved[p.name];
  }
  return state;
}

export function buildArgs(params = [], values = {}) {
  const args = [];
  for (const p of params) {
    const val = values[p.name];
    if (p.type === 'checkbox') {
      if (val) args.push(p.flag);
    } else if (p.type === 'multiselect') {
      if (Array.isArray(val)) val.forEach((item) => args.push(p.flag, item));
    } else if (val) {
      args.push(p.flag, val);
    }
  }
  return args;
}

export function isFormValid(params = [], values = {}, branch = '') {
  if (!branch) return false;
  return params.every((p) => {
    if (!p.required || p.type === 'checkbox') return true;
    const val = values[p.name];
    return p.type === 'multiselect' ? Array.isArray(val) && val.length > 0 : !!val;
  });
}

function parseJson(s, fallback) {
  try {
    return s ? JSON.parse(s) : fallback;
  } catch {
    return fallback;
  }
}

export function parseJsonArray(s) {
  const v = parseJson(s, []);
  return Array.isArray(v) ? v : [];
}

export function parseArgs(params, argsJson, branch) {
  if (!params) return [];
  const args = parseJsonArray(argsJson);
  const rows = [];
  if (branch) rows.push({ label: 'Branch', value: branch });
  for (const p of params) {
    const label = p.label || p.name;
    if (p.type === 'checkbox') {
      rows.push({ label, value: args.includes(p.flag) ? 'yes' : 'no' });
    } else if (p.type === 'multiselect') {
      const vals = args.filter((a, i) => i > 0 && args[i - 1] === p.flag);
      if (vals.length) rows.push({ label, value: vals.join(', ') });
    } else {
      const i = args.indexOf(p.flag);
      if (i !== -1 && i + 1 < args.length) rows.push({ label, value: args[i + 1] });
    }
  }
  return rows;
}

function deployArgs(run) {
  const a = parseJson(run?.args_json, null);
  return a && typeof a === 'object' && !Array.isArray(a) ? a : null;
}

export function parseDeployMeta(run) {
  if (run?.type !== 'deploy') return [];
  const a = deployArgs(run);
  if (!a) return [];
  return [
    a.sourceBuildNumber && { label: 'From build', value: `#${a.sourceBuildNumber}` },
    run.branch && { label: 'Branch', value: run.branch },
    a.gitHash && { label: 'Git hash', value: String(a.gitHash).slice(0, 9) },
    a.image && { label: 'Image', value: a.image },
    a.env && { label: 'Environment', value: a.env },
    a.app && { label: 'CapRover app', value: a.app },
  ].filter(Boolean);
}

export function deployEnvOf(run) {
  if (run?.type !== 'deploy') return '';
  return deployArgs(run)?.env || '';
}
```

Note on the multiselect filter: `args.filter((a, i) => i > 0 && args[i - 1] === p.flag)` keeps each value that directly follows the flag — identical to the legacy loop.

`frontend/src/features/builds/recentStore.js`:
```js
import { readPref, writePref } from '@/lib/storage';

const KEY = 'builds.recent';
// Written by the pre-rebuild Builds page as { [project]: { branch, ...formValues } }.
const LEGACY_KEY = 'dockyard_build_recent';

export function loadRecent(project) {
  const all = readPref(KEY, null);
  if (all && all[project]) return all[project];
  try {
    const legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) || 'null');
    const entry = legacy?.[project];
    if (!entry) return null;
    const { branch = '', ...values } = entry;
    return { branch, values };
  } catch {
    return null;
  }
}

export function saveRecent(project, { branch, values }) {
  const all = readPref(KEY, {}) || {};
  writePref(KEY, { ...all, [project]: { branch, values } });
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run src/features/builds/__tests__` → PASS; then `npx vitest run` → all PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/builds
git commit -m "feat(builds): pure form, args and run-parsing helpers with recent-values store"
```

---

### Task 4: Shared run UI primitives — status, list, picker, native select

**Files:**
- Create: `frontend/src/features/runs/runStatus.js`
- Create: `frontend/src/features/runs/RunStatusBadge.jsx`
- Create: `frontend/src/features/runs/RunList.jsx`
- Create: `frontend/src/features/runs/ComboPicker.jsx`
- Create: `frontend/src/components/ui/native-select.jsx`
- Test: `frontend/src/features/runs/__tests__/primitives.test.jsx`

**Interfaces:**
- Consumes: `renderWithProviders` (Task 2), `StatusBadge` from `@/components/status`.
- Produces:
  - `runStatusMeta(status) → { tone: 'ok'|'warn'|'bad'|'idle', label: string }`; `isActive(status) → boolean` (running|queued); `toIso(sqliteOrIso) → iso string`.
  - `<RunStatusBadge status />`.
  - `<RunList label items getKey getHref isSelected renderItem footer? />` — `<nav aria-label={label}>` of links; ↑/↓ move focus; Enter follows link.
  - `<ComboPicker id options value onChange placeholder searchLabel emptyText mono? disabled? />` — `options: {value, label}[]`; trigger has `role="combobox"`, name from an external `<Label htmlFor={id}>`.
  - `<NativeSelect className? ...selectProps>{options}</NativeSelect>`.

- [ ] **Step 1: Write the failing test** — `frontend/src/features/runs/__tests__/primitives.test.jsx`:

```jsx
import { describe, it, expect, vi } from 'vitest';
import { screen, render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Label } from '@/components/ui/label';
import { renderWithProviders } from '@/test/renderWithProviders';
import { runStatusMeta, isActive, toIso } from '@/features/runs/runStatus';
import { RunStatusBadge } from '@/features/runs/RunStatusBadge';
import { RunList } from '@/features/runs/RunList';
import { ComboPicker } from '@/features/runs/ComboPicker';

describe('runStatus', () => {
  it('maps statuses', () => {
    expect(runStatusMeta('success')).toEqual({ tone: 'ok', label: 'Success' });
    expect(runStatusMeta('weird')).toEqual({ tone: 'idle', label: 'weird' });
    expect(isActive('queued')).toBe(true);
    expect(isActive('failed')).toBe(false);
    expect(toIso('2026-09-27 10:00:00')).toBe('2026-09-27T10:00:00Z');
    expect(toIso('2026-09-27T10:00:00.000Z')).toBe('2026-09-27T10:00:00.000Z');
  });
  it('renders a labelled badge', () => {
    render(<RunStatusBadge status="failed" />);
    expect(screen.getByText('Failed')).toBeInTheDocument();
  });
});

describe('RunList', () => {
  it('links each run, marks the selected one and moves focus with arrow keys', async () => {
    const items = [{ n: 3 }, { n: 2 }, { n: 1 }];
    const { router } = renderWithProviders(
      <RunList label="Runs" items={items} getKey={(r) => r.n} getHref={(r) => `/r/${r.n}`} isSelected={(r) => r.n === 2} renderItem={(r) => `Run ${r.n}`} />,
    );
    const links = screen.getAllByRole('link');
    expect(links[1]).toHaveAttribute('aria-current', 'page');
    const user = userEvent.setup();
    links[0].focus();
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(links[1]);
    await user.keyboard('{ArrowUp}{ArrowUp}');
    expect(document.activeElement).toBe(links[0]);
    await user.keyboard('{Enter}');
    expect(router.state.location.pathname).toBe('/r/3');
  });
});

describe('ComboPicker', () => {
  it('searches and picks an option', async () => {
    const onChange = vi.fn();
    render(
      <>
        <Label htmlFor="br">Branch</Label>
        <ComboPicker id="br" options={['main', 'release/1.2', 'fix/x'].map((b) => ({ value: b, label: b }))} value="main" onChange={onChange} placeholder="Select branch…" searchLabel="Search branches" emptyText="No matching branch." />
      </>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('combobox', { name: 'Branch' }));
    await user.type(screen.getByRole('combobox', { name: 'Search branches' }), 'release');
    await user.click(screen.getByRole('option', { name: /release\/1\.2/ }));
    expect(onChange).toHaveBeenCalledWith('release/1.2');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/features/runs/__tests__/primitives.test.jsx` → FAIL (modules missing).

- [ ] **Step 3: Implement**

`frontend/src/features/runs/runStatus.js`:
```js
const META = {
  running: { tone: 'warn', label: 'Running' },
  queued: { tone: 'idle', label: 'Queued' },
  success: { tone: 'ok', label: 'Success' },
  failed: { tone: 'bad', label: 'Failed' },
  cancelled: { tone: 'idle', label: 'Cancelled' },
};

export const runStatusMeta = (status) => META[status] ?? { tone: 'idle', label: status || 'Unknown' };
export const isActive = (status) => status === 'running' || status === 'queued';
// Backend timestamps are SQLite UTC ("YYYY-MM-DD HH:MM:SS") — make them parseable ISO.
export const toIso = (s) => (s && !s.includes('T') ? `${s.replace(' ', 'T')}Z` : s);
```

`frontend/src/features/runs/RunStatusBadge.jsx`:
```jsx
import { StatusBadge } from '@/components/status';
import { runStatusMeta } from '@/features/runs/runStatus';

export function RunStatusBadge({ status, className }) {
  const { tone, label } = runStatusMeta(status);
  return <StatusBadge tone={tone} className={className}>{label}</StatusBadge>;
}
```

`frontend/src/features/runs/RunList.jsx`:
```jsx
import { useRef } from 'react';
import { Link } from 'react-router';
import { cn } from '@/lib/utils';

// URL-driven run list: every row is a link, so Enter/click/back all work natively.
export function RunList({ label, items, getKey, getHref, isSelected, renderItem, footer }) {
  const listRef = useRef(null);
  const onKeyDown = (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const links = [...listRef.current.querySelectorAll('a[data-run-link]')];
    const i = links.indexOf(document.activeElement);
    if (i === -1) return;
    e.preventDefault();
    const next = Math.max(0, Math.min(links.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)));
    links[next].focus();
  };
  return (
    <nav aria-label={label} className="min-h-0 flex-1 overflow-auto">
      <ul ref={listRef} onKeyDown={onKeyDown} className="divide-y">
        {items.map((item) => {
          const selected = isSelected(item);
          return (
            <li key={getKey(item)}>
              <Link
                data-run-link
                to={getHref(item)}
                aria-current={selected ? 'page' : undefined}
                className={cn(
                  'flex min-h-12 flex-col justify-center gap-0.5 px-4 py-2.5 text-sm outline-none hover:bg-muted focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                  selected && 'bg-accent text-accent-foreground hover:bg-accent',
                )}
              >
                {renderItem(item)}
              </Link>
            </li>
          );
        })}
      </ul>
      {footer}
    </nav>
  );
}
```

`frontend/src/features/runs/ComboPicker.jsx`:
```jsx
import { useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { cn } from '@/lib/utils';

export function ComboPicker({ id, options, value, onChange, placeholder, searchLabel, emptyText, mono = false, disabled = false, className }) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn('h-10 w-full justify-between font-normal', mono && 'font-mono text-[13px]', className)}
        >
          <span className="truncate">{current?.label ?? (value || placeholder)}</span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--radix-popover-trigger-width) min-w-64 p-0">
        {/* cmdk names its input via the Command root's label (see TagCombobox). */}
        <Command loop label={searchLabel}>
          <CommandInput autoFocus aria-label={searchLabel} placeholder={`${searchLabel}…`} />
          <CommandList className="max-h-64">
            <CommandEmpty>{emptyText}</CommandEmpty>
            {options.map((o) => (
              <CommandItem
                key={o.value}
                value={o.label}
                onSelect={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
              >
                <Check className={cn('size-4', o.value === value ? 'opacity-100' : 'opacity-0')} aria-hidden="true" />
                <span className={cn(mono && 'font-mono text-[12.5px]')}>{o.label}</span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
```

`frontend/src/components/ui/native-select.jsx`:
```jsx
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

// Native <select>: best picker on phones, fully keyboard/AT accessible.
export function NativeSelect({ className, children, ...props }) {
  return (
    <div className={cn('relative', className)}>
      <select
        className="h-10 w-full appearance-none rounded-md border bg-background pr-8 pl-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        {...props}
      >
        {children}
      </select>
      <ChevronDown aria-hidden="true" className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 opacity-50" />
    </div>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/features/runs/__tests__/primitives.test.jsx` → PASS; then `npx vitest run` → all PASS.
If the cmdk search input's accessible name differs, match TagCombobox's pattern (label on `Command`) — do not change the test's intent.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/runs frontend/src/components/ui/native-select.jsx
git commit -m "feat(runs): status badge, keyboard run list, combo picker and native select"
```

---

### Task 5: `useRunStream` — build/flyway log WebSocket

**Files:**
- Create: `frontend/src/features/runs/useRunStream.js`
- Test: `frontend/src/features/runs/__tests__/useRunStream.test.jsx`

**Interfaces:**
- Consumes: `appendChunk` from `@/features/container/logBuffer`, `qk` (Task 2).
- Produces: `useRunStream(kind: 'build'|'flyway', runId: number|null, { project?: string, active?: boolean } = {}) → { lines: string[], status: 'connecting'|'open'|'done'|'closed', finalStatus: string|null, stuck: boolean, meta: { commits_json?, branch?, pushed_images_json? }, reconnect: () => void }`.
  - `status === 'closed'` means the socket dropped before a `done` message (show Reconnect). After `done` the server closes the socket; that is `'done'`, not `'closed'`.
  - On `done`, if `active` was true when the stream opened, invalidates `qk.buildRuns(project)` + `['build-run', project]` (build) or `qk.flywayRuns` + `['flyway-run']` (flyway).
  - Reconnects automatically on `visibilitychange` → visible while `status === 'closed'` (phones/PWA drop sockets in the background).

Server protocol (from `backend/routes/logs.js`): `{type:'chunk', text}`, `{type:'meta', commits_json, branch}`, `{type:'stuck_alert'}`, `{type:'done', status, exitCode, commits_json?, pushed_images_json?}`, `{type:'error', message}`. Finished runs get the whole log as one chunk, then `done`, then close.

- [ ] **Step 1: Write the failing test** — `frontend/src/features/runs/__tests__/useRunStream.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useRunStream } from '@/features/runs/useRunStream';

class FakeSocket {
  static instances = [];
  constructor(url) { this.url = url; FakeSocket.instances.push(this); }
  close() { this.closed = true; }
  emit(msg) { this.onmessage?.({ data: JSON.stringify(msg) }); }
}

let qc;
const wrapper = ({ children }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;

beforeEach(() => {
  FakeSocket.instances = [];
  vi.stubGlobal('WebSocket', FakeSocket);
  qc = new QueryClient();
});
afterEach(() => vi.unstubAllGlobals());

describe('useRunStream', () => {
  it('streams chunks, meta and stuck alerts, then finishes', () => {
    const spy = vi.spyOn(qc, 'invalidateQueries');
    const { result } = renderHook(() => useRunStream('build', 7, { project: 'api', active: true }), { wrapper });
    const ws = FakeSocket.instances[0];
    expect(ws.url).toMatch(/\/ws\/builds\?runId=7$/);
    act(() => { ws.onopen(); ws.emit({ type: 'chunk', text: 'step 1\nstep ' }); });
    expect(result.current.status).toBe('open');
    act(() => ws.emit({ type: 'stuck_alert' }));
    expect(result.current.stuck).toBe(true);
    act(() => ws.emit({ type: 'chunk', text: '2\n' }));
    expect(result.current.stuck).toBe(false);
    expect(result.current.lines).toEqual(['step 1', 'step 2']);
    act(() => ws.emit({ type: 'meta', commits_json: '[{"hash":"a"}]', branch: 'main' }));
    expect(result.current.meta).toEqual({ commits_json: '[{"hash":"a"}]', branch: 'main' });
    act(() => { ws.emit({ type: 'done', status: 'success', pushed_images_json: '["reg/a:1"]' }); ws.onclose(); });
    expect(result.current.status).toBe('done');
    expect(result.current.finalStatus).toBe('success');
    expect(result.current.meta.pushed_images_json).toBe('["reg/a:1"]');
    expect(spy).toHaveBeenCalledWith({ queryKey: ['build-runs', 'api'] });
  });

  it('does not invalidate lists when replaying an already finished run', () => {
    const spy = vi.spyOn(qc, 'invalidateQueries');
    renderHook(() => useRunStream('flyway', 3, { active: false }), { wrapper });
    const ws = FakeSocket.instances[0];
    expect(ws.url).toMatch(/\/ws\/flyway\?runId=3$/);
    act(() => { ws.emit({ type: 'chunk', text: 'old log\n' }); ws.emit({ type: 'done', status: 'failed' }); });
    expect(spy).not.toHaveBeenCalled();
  });

  it('closes the previous socket when the run changes (Review Focus 3)', () => {
    const { rerender, result } = renderHook(({ id }) => useRunStream('build', id, { project: 'api' }), { wrapper, initialProps: { id: 1 } });
    const first = FakeSocket.instances[0];
    act(() => first.emit({ type: 'chunk', text: 'from run 1\n' }));
    rerender({ id: 2 });
    expect(first.closed).toBe(true);
    expect(FakeSocket.instances[1].url).toMatch(/runId=2$/);
    act(() => first.emit({ type: 'chunk', text: 'late chunk\n' }));
    expect(result.current.lines).toEqual([]);
  });

  it('reports an unexpected close and reconnects when the page becomes visible', () => {
    const { result } = renderHook(() => useRunStream('build', 9, { project: 'api', active: true }), { wrapper });
    act(() => FakeSocket.instances[0].onclose());
    expect(result.current.status).toBe('closed');
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(FakeSocket.instances).toHaveLength(2);
  });

  it('shows backend errors in the log and opens nothing without a run id', () => {
    const { result, rerender } = renderHook(({ id }) => useRunStream('build', id), { wrapper, initialProps: { id: null } });
    expect(FakeSocket.instances).toHaveLength(0);
    rerender({ id: 4 });
    act(() => FakeSocket.instances[0].emit({ type: 'error', message: 'Run not found' }));
    expect(result.current.lines).toContain('ERROR: Run not found');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/features/runs/__tests__/useRunStream.test.jsx` → FAIL (module missing).

- [ ] **Step 3: Implement** — `frontend/src/features/runs/useRunStream.js`:

```js
import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { appendChunk } from '@/features/container/logBuffer';
import { qk } from '@/lib/queries';

const EMPTY = { lines: [], partial: '' };
const META_FIELDS = ['commits_json', 'branch', 'pushed_images_json'];
const pickMeta = (msg) => Object.fromEntries(META_FIELDS.filter((k) => msg[k] != null).map((k) => [k, msg[k]]));

export function useRunStream(kind, runId, { project, active = false } = {}) {
  const qc = useQueryClient();
  const [buf, setBuf] = useState(EMPTY);
  const [status, setStatus] = useState('connecting');
  const [finalStatus, setFinalStatus] = useState(null);
  const [stuck, setStuck] = useState(false);
  const [meta, setMeta] = useState({});
  const [attempt, setAttempt] = useState(0);
  // Read at message time so changing them doesn't reopen the socket.
  const opts = useRef({ project, active, qc });
  opts.current = { project, active, qc };

  useEffect(() => {
    if (runId == null) return undefined;
    setBuf(EMPTY);
    setStatus('connecting');
    setFinalStatus(null);
    setStuck(false);
    setMeta({});
    const wasActive = opts.current.active;
    let done = false;
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${window.location.host}/ws/${kind === 'build' ? 'builds' : 'flyway'}?runId=${runId}`);
    ws.onopen = () => setStatus('open');
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === 'chunk') {
        setStuck(false);
        setBuf((b) => appendChunk(b.lines, b.partial, msg.text));
      } else if (msg.type === 'error') {
        setBuf((b) => appendChunk(b.lines, b.partial, `\nERROR: ${msg.message}\n`));
      } else if (msg.type === 'stuck_alert') {
        setStuck(true);
      } else if (msg.type === 'meta') {
        setMeta((m) => ({ ...m, ...pickMeta(msg) }));
      } else if (msg.type === 'done') {
        done = true;
        setStuck(false);
        setFinalStatus(msg.status);
        setStatus('done');
        setMeta((m) => ({ ...m, ...pickMeta(msg) }));
        if (wasActive) {
          const { qc: client, project: p } = opts.current;
          if (kind === 'build') {
            client.invalidateQueries({ queryKey: qk.buildRuns(p) });
            client.invalidateQueries({ queryKey: ['build-run', p] });
          } else {
            client.invalidateQueries({ queryKey: qk.flywayRuns });
            client.invalidateQueries({ queryKey: ['flyway-run'] });
          }
        }
      }
    };
    const onDrop = () => {
      if (!done) setStatus('closed');
    };
    ws.onclose = onDrop;
    ws.onerror = onDrop;
    return () => {
      ws.onmessage = null;
      ws.onclose = null;
      ws.onerror = null;
      ws.close();
    };
  }, [kind, runId, attempt]);

  useEffect(() => {
    if (status !== 'closed') return undefined;
    const onVisible = () => {
      if (document.visibilityState === 'visible') setAttempt((n) => n + 1);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [status]);

  const lines = buf.partial ? [...buf.lines, buf.partial] : buf.lines;
  return { lines, status, finalStatus, stuck, meta, reconnect: () => setAttempt((n) => n + 1) };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/features/runs/__tests__/useRunStream.test.jsx` → PASS; then `npx vitest run` → all PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/runs/useRunStream.js frontend/src/features/runs/__tests__/useRunStream.test.jsx
git commit -m "feat(runs): useRunStream hook for build and flyway log sockets"
```

---

### Task 6: `RunLog` — extract the log viewer from `LogsTab`

**Files:**
- Create: `frontend/src/features/runs/RunLog.jsx`
- Modify: `frontend/src/features/container/LogsTab.jsx` (whole component body; keep the export name and props)
- Test: `frontend/src/features/runs/__tests__/RunLog.test.jsx`; existing `frontend/src/features/container/__tests__/LogsTab.test.jsx` must pass unchanged.

**Interfaces:**
- Produces: `<RunLog lines status onReconnect fileName emptyText closedText toolbarExtra className />`
  - `status`: `'connecting'|'open'|'done'|'closed'`; banner + Reconnect only when `'closed'`.
  - `fileName: () => string` — called at download time.
  - `emptyText` shown when there are no lines and status isn't `'connecting'` (then "Connecting…").
  - `closedText` default `'Disconnected from the log stream.'`.
  - Toolbar: search (always visible); Matches only / Wrap / Download visible from `sm` up; below `sm` they live in a "Log options" `⋯` dropdown.

- [ ] **Step 1: Write the failing test** — `frontend/src/features/runs/__tests__/RunLog.test.jsx`:

```jsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RunLog } from '@/features/runs/RunLog';

describe('RunLog', () => {
  it('shows the custom closed banner only when the stream dropped', async () => {
    const onReconnect = vi.fn();
    const { rerender } = render(<RunLog lines={['a']} status="closed" closedText="Log stream ended before the run finished." onReconnect={onReconnect} fileName={() => 'x.log'} emptyText="No output yet." />);
    expect(screen.getByText('Log stream ended before the run finished.')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Reconnect' }));
    expect(onReconnect).toHaveBeenCalled();
    rerender(<RunLog lines={['a']} status="done" onReconnect={onReconnect} fileName={() => 'x.log'} emptyText="No output yet." />);
    expect(screen.queryByRole('button', { name: 'Reconnect' })).toBeNull();
  });

  it('shows empty text and highlights error lines', () => {
    const { rerender } = render(<RunLog lines={[]} status="open" fileName={() => 'x.log'} emptyText="No output yet." />);
    expect(screen.getByText('No output yet.')).toBeInTheDocument();
    rerender(<RunLog lines={['ok', '[ERROR] build failed']} status="done" fileName={() => 'x.log'} emptyText="No output yet." />);
    expect(screen.getByText('[ERROR] build failed')).toHaveClass('text-bad');
  });

  it('offers wrap and matches-only in the phone options menu', async () => {
    render(<RunLog lines={['a']} status="done" fileName={() => 'x.log'} emptyText="" />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Log options' }));
    const wrap = screen.getByRole('menuitemcheckbox', { name: 'Wrap' });
    expect(wrap).toHaveAttribute('aria-checked', 'true');
    await user.click(wrap);
    await user.click(screen.getByRole('button', { name: 'Log options' }));
    expect(screen.getByRole('menuitemcheckbox', { name: 'Wrap' })).toHaveAttribute('aria-checked', 'false');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/features/runs/__tests__/RunLog.test.jsx` → FAIL (module missing).

- [ ] **Step 3: Implement**

`frontend/src/features/runs/RunLog.jsx`:
```jsx
import { useEffect, useRef, useState } from 'react';
import { ArrowDown, Download, MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

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

export function RunLog({ lines, status, onReconnect, fileName, emptyText, closedText = 'Disconnected from the log stream.', toolbarExtra, className }) {
  const [search, setSearch] = useState('');
  const [matchesOnly, setMatchesOnly] = useState(false);
  const [wrap, setWrap] = useState(true);
  const [follow, setFollow] = useState(true);
  const bodyRef = useRef(null);
  const term = search.trim().toLowerCase();
  const shown = term && matchesOnly ? lines.filter((l) => l.toLowerCase().includes(term)) : lines;

  useEffect(() => {
    if (follow && bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    // `lines` (not shown.length): once the 5,000-line cap is hit, its length
    // stops changing even though new lines keep arriving (oldest evicted) —
    // depend on the array reference so follow keeps working past the cap.
  }, [lines, follow]);

  const onScroll = () => {
    const el = bodyRef.current;
    setFollow(el.scrollHeight - el.scrollTop - el.clientHeight < 24);
  };

  const download = () => {
    const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/plain' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: fileName() });
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={cn('flex h-full flex-col gap-2', className)}>
      <div className="flex flex-wrap items-center gap-2">
        <Input type="search" aria-label="Search logs" placeholder="Search…" className="h-8 w-44 min-w-0 flex-1 sm:flex-none" value={search} onChange={(e) => setSearch(e.target.value)} />
        <div className="hidden items-center gap-1.5 sm:flex">
          <Checkbox id="logs-matches" checked={matchesOnly} onCheckedChange={(v) => setMatchesOnly(v === true)} />
          <Label htmlFor="logs-matches" className="text-xs font-normal">Matches only</Label>
        </div>
        <div className="hidden items-center gap-1.5 sm:flex">
          <Checkbox id="logs-wrap" checked={wrap} onCheckedChange={(v) => setWrap(v === true)} />
          <Label htmlFor="logs-wrap" className="text-xs font-normal">Wrap</Label>
        </div>
        <div className="ml-auto flex gap-1">
          <Button size="icon" variant="ghost" className="hidden size-8 sm:inline-flex" aria-label="Download logs" onClick={download}><Download className="size-4" /></Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="ghost" className="size-10 sm:hidden" aria-label="Log options"><MoreHorizontal className="size-4" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuCheckboxItem checked={matchesOnly} onCheckedChange={(v) => setMatchesOnly(v === true)}>Matches only</DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={wrap} onCheckedChange={(v) => setWrap(v === true)}>Wrap</DropdownMenuCheckboxItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={download}><Download className="size-4" /> Download</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {toolbarExtra}
        </div>
      </div>
      {status === 'closed' && (
        <div className="flex items-center gap-2 rounded-md bg-bad-bg px-3 py-1.5 text-xs text-bad">
          {closedText}
          <Button size="sm" variant="outline" className="ml-auto h-7" onClick={onReconnect}>Reconnect</Button>
        </div>
      )}
      <div className="relative min-h-0 flex-1">
        <div
          ref={bodyRef}
          onScroll={onScroll}
          className={cn('absolute inset-0 overflow-auto rounded-md bg-muted p-2 font-mono text-xs leading-5', wrap ? 'whitespace-pre-wrap break-all' : 'whitespace-pre')}
        >
          {shown.length === 0 && <span className="text-muted-foreground">{status === 'connecting' ? 'Connecting…' : emptyText}</span>}
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

Replace `frontend/src/features/container/LogsTab.jsx` with:
```jsx
import { Maximize2, Minimize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RunLog } from '@/features/runs/RunLog';
import { useLogStream } from '@/features/container/useLogStream';
import { useDrawerExpanded } from '@/features/container/ContainerDrawer';

export function LogsTab({ env, container }) {
  const { lines, status, reconnect } = useLogStream(env, container.name);
  const [expanded, setExpanded] = useDrawerExpanded();
  return (
    <RunLog
      className="min-h-[360px]"
      lines={lines}
      status={status}
      onReconnect={reconnect}
      emptyText="No log lines yet."
      fileName={() => `${container.name}-${new Date().toISOString().replace(/[:.]/g, '-')}.log`}
      toolbarExtra={
        <Button size="icon" variant="ghost" className="size-8" aria-label={expanded ? 'Shrink drawer' : 'Expand drawer'} onClick={() => setExpanded(!expanded)}>
          {expanded ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
        </Button>
      }
    />
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/features/runs/__tests__/RunLog.test.jsx src/features/container/__tests__/LogsTab.test.jsx` → PASS (LogsTab tests unchanged). Then `npx vitest run` → all PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/runs/RunLog.jsx frontend/src/features/runs/__tests__/RunLog.test.jsx frontend/src/features/container/LogsTab.jsx
git commit -m "refactor(logs): extract RunLog viewer from LogsTab, add phone options menu"
```

---

### Task 7: `useRunCommand` — confirm, toast, invalidate

**Files:**
- Create: `frontend/src/features/runs/useRunCommand.js`
- Test: `frontend/src/features/runs/__tests__/useRunCommand.test.jsx`

**Interfaces:**
- Consumes: `useDialogs` (`confirm`, `showError`) from `@/app/DialogProvider`, `toast` from `sonner`.
- Produces: `useRunCommand() → runCommand(opts) → Promise<result | null>` where
  `opts = { confirm?: { title, description, confirmLabel?, destructive?, level?: 'confirm'|'typed', typedValue? }, pending: string, success: string | (result) => string, failure: string, fn: () => Promise<result>, invalidate?: QueryKey[], onError?: (err) => void }`.
  Returns `null` if the user cancels the confirmation or `fn` throws (after the error toast + `onError`). `invalidate` runs after success or failure.

- [ ] **Step 1: Write the failing test** — `frontend/src/features/runs/__tests__/useRunCommand.test.jsx`:

```jsx
import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { renderWithProviders } from '@/test/renderWithProviders';
import { useRunCommand } from '@/features/runs/useRunCommand';

function Harness({ opts, onResult }) {
  const runCommand = useRunCommand();
  const [, force] = useState(0);
  return <button type="button" onClick={async () => { onResult(await runCommand(opts)); force((n) => n + 1); }}>go</button>;
}

describe('useRunCommand', () => {
  it('asks first and does nothing when cancelled', async () => {
    const fn = vi.fn();
    const onResult = vi.fn();
    renderWithProviders(<Harness onResult={onResult} opts={{ confirm: { title: 'Cancel #3?', description: 'd', confirmLabel: 'Cancel run' }, pending: 'p', success: 's', failure: 'f', fn }} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'go' }));
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(null));
    expect(fn).not.toHaveBeenCalled();
  });

  it('runs, toasts success from the result and invalidates', async () => {
    const onResult = vi.fn();
    const { queryClient } = renderWithProviders(<Harness onResult={onResult} opts={{ pending: 'Starting…', success: (r) => `Build #${r.buildNumber} started`, failure: 'f', fn: async () => ({ buildNumber: 12 }), invalidate: [['build-runs', 'api']] }} />);
    const spy = vi.spyOn(queryClient, 'invalidateQueries');
    await userEvent.setup().click(screen.getByRole('button', { name: 'go' }));
    expect(await screen.findByText('Build #12 started')).toBeInTheDocument();
    expect(onResult).toHaveBeenCalledWith({ buildNumber: 12 });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['build-runs', 'api'] });
  });

  it('toasts the backend error, calls onError and returns null', async () => {
    const onResult = vi.fn();
    const onError = vi.fn();
    renderWithProviders(<Harness onResult={onResult} opts={{ pending: 'p', success: 's', failure: 'Could not start the build', fn: async () => { throw new Error('branch not found'); }, onError }} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'go' }));
    expect(await screen.findByText('Could not start the build')).toBeInTheDocument();
    expect(screen.getByText('branch not found')).toBeInTheDocument();
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'branch not found' }));
    expect(onResult).toHaveBeenCalledWith(null);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/features/runs/__tests__/useRunCommand.test.jsx` → FAIL (module missing).

- [ ] **Step 3: Implement** — `frontend/src/features/runs/useRunCommand.js`:

```js
import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useDialogs } from '@/app/DialogProvider';

const short = (msg) => (msg.length > 140 ? `${msg.slice(0, 140)}…` : msg);

// Build/flyway commands: optional confirmation → loading toast → success/error toast → invalidate.
export function useRunCommand() {
  const qc = useQueryClient();
  const { confirm: askConfirm, showError } = useDialogs();

  return useCallback(
    async ({ confirm: ask, pending, success, failure, fn, invalidate = [], onError }) => {
      if (ask) {
        const res = await askConfirm(ask);
        if (!res.ok) return null;
      }
      const id = toast.loading(pending);
      try {
        const result = await fn();
        toast.success(typeof success === 'function' ? success(result) : success, { id });
        return result;
      } catch (err) {
        toast.error(failure, {
          id,
          description: short(err.message),
          duration: Infinity,
          action: { label: 'Details', onClick: () => showError(failure, err.message) },
        });
        onError?.(err);
        return null;
      } finally {
        invalidate.forEach((queryKey) => qc.invalidateQueries({ queryKey }));
      }
    },
    [qc, askConfirm, showError],
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/features/runs/__tests__/useRunCommand.test.jsx` → PASS; then `npx vitest run` → all PASS (including `noBrowserDialogs`).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/runs/useRunCommand.js frontend/src/features/runs/__tests__/useRunCommand.test.jsx
git commit -m "feat(runs): useRunCommand for confirmed, toasted build and flyway commands"
```

---

### Task 8: `DeployBar` — deploy a successful build to CapRover

**Files:**
- Create: `frontend/src/features/builds/DeployBar.jsx`
- Test: `frontend/src/features/builds/__tests__/DeployBar.test.jsx`

**Interfaces:**
- Consumes: `useRunCommand` (Task 7), `parseJsonArray` (Task 3), `NativeSelect` (Task 4), `usePref`, `isProd`, `deployRunToCapRover`, `qk`.
- Produces: `<DeployBar project run status targets onDeployed />`
  - `run`: build run (merged with live meta); `status`: effective status; `targets`: all CapRover targets (`{ id, project, env_key, name, app_name }[]`); `onDeployed(buildNumber: number)`.
  - Renders nothing unless `run.type === 'build' && status === 'success'` and ≥1 pushed image and ≥1 target with `target.project === project`.
  - Parent must render it with `key={run.id}` so image choice/error reset per run.

- [ ] **Step 1: Write the failing test** — `frontend/src/features/builds/__tests__/DeployBar.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as api from '@/lib/api';
import { renderWithProviders } from '@/test/renderWithProviders';
import { DeployBar } from '@/features/builds/DeployBar';

vi.mock('@/lib/api');

const targets = [
  { id: 1, project: 'api', env_key: 'stage', name: 'Stage', app_name: 'api-stage' },
  { id: 2, project: 'api', env_key: 'prod', name: 'Prod', app_name: 'api-prod' },
  { id: 3, project: 'web', env_key: 'stage', name: 'Web', app_name: 'web-stage' },
];
const run = (images) => ({ id: 5, type: 'build', build_number: 41, pushed_images_json: JSON.stringify(images) });

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
});

describe('DeployBar', () => {
  it('renders nothing for unsuccessful runs, runs without images, or projects without targets', () => {
    const { container, rerender } = renderWithProviders(<DeployBar project="api" run={run(['reg/a:1'])} status="failed" targets={targets} onDeployed={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<DeployBar project="api" run={run([])} status="success" targets={targets} onDeployed={vi.fn()} />);
    expect(screen.queryByText('Deploy to CapRover')).toBeNull();
    rerender(<DeployBar project="ops" run={run(['reg/a:1'])} status="success" targets={targets} onDeployed={vi.fn()} />);
    expect(screen.queryByText('Deploy to CapRover')).toBeNull();
  });

  it('deploys the single image to a non-prod target after a plain confirmation', async () => {
    api.deployRunToCapRover.mockResolvedValue({ runId: 9, buildNumber: 42 });
    const onDeployed = vi.fn();
    renderWithProviders(<DeployBar project="api" run={run(['reg/a:1'])} status="success" targets={targets} onDeployed={onDeployed} />);
    const user = userEvent.setup();
    expect(screen.getByRole('combobox', { name: 'CapRover target' }).querySelectorAll('option')).toHaveLength(3); // placeholder + 2 api targets
    expect(screen.queryByRole('combobox', { name: 'Image' })).toBeNull();
    await user.selectOptions(screen.getByRole('combobox', { name: 'CapRover target' }), '1');
    await user.click(screen.getByRole('button', { name: 'Deploy' }));
    await user.click(await screen.findByRole('button', { name: 'Deploy to Stage' }));
    await waitFor(() => expect(api.deployRunToCapRover).toHaveBeenCalledWith('api', 41, 1, 'reg/a:1'));
    expect(onDeployed).toHaveBeenCalledWith(42);
  });

  it('requires an image choice when several were pushed and a typed confirmation for prod', async () => {
    api.deployRunToCapRover.mockResolvedValue({ runId: 9, buildNumber: 43 });
    renderWithProviders(<DeployBar project="api" run={run(['reg/a:1', 'reg/b:1'])} status="success" targets={targets} onDeployed={vi.fn()} />);
    const user = userEvent.setup();
    await user.selectOptions(screen.getByRole('combobox', { name: 'CapRover target' }), '2');
    expect(screen.getByRole('button', { name: 'Deploy' })).toBeDisabled();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Image' }), 'reg/b:1');
    await user.click(screen.getByRole('button', { name: 'Deploy' }));
    const confirmBtn = await screen.findByRole('button', { name: 'Deploy to Prod' });
    expect(confirmBtn).toBeDisabled();
    await user.type(screen.getByLabelText(/Type/), 'api-prod');
    await user.click(confirmBtn);
    await waitFor(() => expect(api.deployRunToCapRover).toHaveBeenCalledWith('api', 41, 2, 'reg/b:1'));
  });

  it('shows the error inline', async () => {
    api.deployRunToCapRover.mockRejectedValue(new Error('CapRover said no'));
    renderWithProviders(<DeployBar project="api" run={run(['reg/a:1'])} status="success" targets={targets} onDeployed={vi.fn()} />);
    const user = userEvent.setup();
    await user.selectOptions(screen.getByRole('combobox', { name: 'CapRover target' }), '1');
    await user.click(screen.getByRole('button', { name: 'Deploy' }));
    await user.click(await screen.findByRole('button', { name: 'Deploy to Stage' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('CapRover said no');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/features/builds/__tests__/DeployBar.test.jsx` → FAIL (module missing).

- [ ] **Step 3: Implement** — `frontend/src/features/builds/DeployBar.jsx`:

```jsx
import { useState } from 'react';
import { Rocket } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import { deployRunToCapRover } from '@/lib/api';
import { qk } from '@/lib/queries';
import { usePref } from '@/lib/storage';
import { isProd } from '@/features/container/actions';
import { parseJsonArray } from '@/features/builds/buildArgs';
import { useRunCommand } from '@/features/runs/useRunCommand';

export function DeployBar({ project, run, status, targets, onDeployed }) {
  const runCommand = useRunCommand();
  const [targetId, setTargetId] = usePref(`builds.deployTarget.${project}`, '');
  const [image, setImage] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const images = parseJsonArray(run.pushed_images_json);
  const projectTargets = (targets || []).filter((t) => t.project === project);
  if (run.type !== 'build' || status !== 'success' || images.length === 0 || projectTargets.length === 0) return null;

  const target = projectTargets.find((t) => String(t.id) === String(targetId));
  const chosen = image || (images.length === 1 ? images[0] : '');
  const label = target ? target.name || target.env_key : '';

  const deploy = async () => {
    setError(null);
    setBusy(true);
    const result = await runCommand({
      confirm: {
        title: `Deploy #${run.build_number} to ${label}?`,
        description: `${chosen} → CapRover app ${target.app_name}.`,
        confirmLabel: `Deploy to ${label}`,
        level: isProd(target.env_key) ? 'typed' : 'confirm',
        typedValue: target.app_name,
      },
      pending: `Deploying #${run.build_number} to ${label}…`,
      success: (r) => `Deploy #${r.buildNumber} to ${label} started`,
      failure: `Deploy to ${label} failed`,
      fn: () => deployRunToCapRover(project, run.build_number, target.id, chosen),
      invalidate: [qk.buildRuns(project)],
      onError: (err) => setError(err.message),
    });
    setBusy(false);
    if (result) onDeployed(result.buildNumber);
  };

  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-ok-bg/50 p-3 sm:flex-row sm:flex-wrap sm:items-center">
      <span className="flex items-center gap-1.5 text-sm font-medium text-ok"><Rocket className="size-4" aria-hidden="true" /> Deploy to CapRover</span>
      <NativeSelect aria-label="CapRover target" className="sm:w-56" value={targetId} onChange={(e) => setTargetId(e.target.value)}>
        <option value="">Choose target…</option>
        {projectTargets.map((t) => (
          <option key={t.id} value={String(t.id)}>{(t.name || t.env_key)} → {t.app_name}</option>
        ))}
      </NativeSelect>
      {images.length > 1 && (
        <NativeSelect aria-label="Image" className="min-w-0 sm:max-w-80 sm:flex-1" value={image} onChange={(e) => setImage(e.target.value)}>
          <option value="">Choose image…</option>
          {images.map((im) => <option key={im} value={im}>{im}</option>)}
        </NativeSelect>
      )}
      <Button className="h-10 sm:ml-auto" disabled={busy || !target || !chosen} onClick={deploy}>Deploy</Button>
      {error && <p role="alert" className="w-full text-xs text-bad">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/features/builds/__tests__/DeployBar.test.jsx` → PASS; then `npx vitest run` → all PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/builds/DeployBar.jsx frontend/src/features/builds/__tests__/DeployBar.test.jsx
git commit -m "feat(builds): CapRover deploy bar with risk-scaled confirmation"
```

---

### Task 9: `RunDetail` — header, actions, details tabs, live log

**Files:**
- Create: `frontend/src/features/builds/RunDetail.jsx`
- Test: `frontend/src/features/builds/__tests__/RunDetail.test.jsx`

**Interfaces:**
- Consumes: `useRunStream` (5), `RunLog` (6), `useRunCommand` (7), `DeployBar` (8), `RunStatusBadge`/`isActive`/`toIso` (4), `parseArgs`/`parseJsonArray`/`parseDeployMeta` (3), `cancelBuildRun`, `replayBuildRun`, `qk`.
- Produces: `<RunDetail project run params targets />` — `params`: the project's param definitions (`projects[project].params`). Parent renders with `key={run.id}`. Navigates to `/builds/:project/:num` after Rebuild/Deploy.

- [ ] **Step 1: Write the failing test** — `frontend/src/features/builds/__tests__/RunDetail.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as api from '@/lib/api';
import { renderWithProviders } from '@/test/renderWithProviders';
import { RunDetail } from '@/features/builds/RunDetail';

vi.mock('@/lib/api');

class FakeSocket {
  static instances = [];
  constructor(url) { this.url = url; FakeSocket.instances.push(this); }
  close() { this.closed = true; }
  emit(msg) { this.onmessage?.({ data: JSON.stringify(msg) }); }
}

const params = [{ name: 'tag', type: 'string', flag: '--tag', label: 'Tag' }];
const build = { id: 7, type: 'build', build_number: 41, status: 'running', branch: 'main', args_json: '["--tag","1.2"]', started_at: '2026-09-27 10:00:00' };

beforeEach(() => {
  vi.resetAllMocks();
  FakeSocket.instances = [];
  vi.stubGlobal('WebSocket', FakeSocket);
});
afterEach(() => vi.unstubAllGlobals());

describe('RunDetail', () => {
  it('shows params, live commits, the stuck banner and the log', async () => {
    renderWithProviders(<RunDetail project="api" run={build} params={params} targets={[]} />);
    expect(screen.getByRole('heading', { name: /#41/ })).toBeInTheDocument();
    expect(screen.getByText('Running')).toBeInTheDocument();
    expect(screen.getByText('1.2')).toBeInTheDocument();
    const ws = FakeSocket.instances[0];
    act(() => {
      ws.onopen();
      ws.emit({ type: 'chunk', text: 'compiling\n' });
      ws.emit({ type: 'meta', commits_json: JSON.stringify([{ hash: 'abc', shortHash: 'abc1234', subject: 'fix login', date: '2h ago' }]) });
      ws.emit({ type: 'stuck_alert' });
    });
    expect(screen.getByText('compiling')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('No output detected');
    await userEvent.setup().click(screen.getByRole('tab', { name: /Commits/ }));
    expect(screen.getByText('fix login')).toBeInTheDocument();
  });

  it('cancels after confirmation', async () => {
    api.cancelBuildRun.mockResolvedValue({ cancelled: true });
    renderWithProviders(<RunDetail project="api" run={build} params={params} targets={[]} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Cancel run' }));
    await user.click(await screen.findByRole('button', { name: 'Stop build' }));
    await waitFor(() => expect(api.cancelBuildRun).toHaveBeenCalledWith('api', 41));
  });

  it('rebuilds a finished run and navigates to the new one', async () => {
    api.replayBuildRun.mockResolvedValue({ runId: 8, buildNumber: 42, queued: false });
    const { router } = renderWithProviders(<RunDetail project="api" run={{ ...build, status: 'failed' }} params={params} targets={[]} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Rebuild' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/builds/api/42'));
  });

  it('shows deployment details for deploy runs and survives malformed JSON (Review Focus 1)', () => {
    renderWithProviders(<RunDetail project="api" run={{ id: 9, type: 'deploy', build_number: 43, status: 'success', branch: 'main', args_json: JSON.stringify({ env: 'stage', app: 'api-stage' }), commits_json: '{broken' }} params={params} targets={[]} />);
    expect(screen.getByRole('tab', { name: 'Deployment' })).toBeInTheDocument();
    expect(screen.getByText('api-stage')).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /Commits/ })).toBeNull();
    renderWithProviders(<RunDetail project="api" run={{ ...build, id: 10, args_json: 'not json' }} params={params} targets={[]} />);
    expect(screen.getAllByRole('heading', { name: /#41/ }).length).toBeGreaterThan(0);
  });

  it('links back to the run list for phones', () => {
    renderWithProviders(<RunDetail project="my app" run={build} params={params} targets={[]} />);
    expect(screen.getByRole('link', { name: /Runs/ })).toHaveAttribute('href', '/builds/my%20app');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/features/builds/__tests__/RunDetail.test.jsx` → FAIL (module missing).

- [ ] **Step 3: Implement** — `frontend/src/features/builds/RunDetail.jsx`:

```jsx
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { AlertTriangle, ArrowLeft, ChevronDown, RotateCcw, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cancelBuildRun, replayBuildRun } from '@/lib/api';
import { qk } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { RunLog } from '@/features/runs/RunLog';
import { RunStatusBadge } from '@/features/runs/RunStatusBadge';
import { isActive, toIso } from '@/features/runs/runStatus';
import { useRunCommand } from '@/features/runs/useRunCommand';
import { useRunStream } from '@/features/runs/useRunStream';
import { parseArgs, parseDeployMeta, parseJsonArray } from '@/features/builds/buildArgs';
import { DeployBar } from '@/features/builds/DeployBar';

const formatStarted = (s) => (s ? new Date(toIso(s)).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');

function Rows({ rows }) {
  return (
    <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
      {rows.map(({ label, value }) => (
        <div key={label} className="contents">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="min-w-0 font-mono text-[12.5px] break-all">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function RunDetail({ project, run, params, targets }) {
  const navigate = useNavigate();
  const runCommand = useRunCommand();
  const stream = useRunStream('build', run.id, { project, active: isActive(run.status) });
  const [showDetails, setShowDetails] = useState(false);

  const status = stream.finalStatus ?? run.status;
  const merged = { ...run, ...stream.meta, status };
  const n = run.build_number;
  const base = `/builds/${encodeURIComponent(project)}`;
  const commits = parseJsonArray(merged.commits_json);
  const images = parseJsonArray(merged.pushed_images_json);
  const deployMeta = parseDeployMeta(merged);
  const paramRows = run.type === 'build' ? parseArgs(params, merged.args_json, merged.branch) : [];
  const tabs = [
    deployMeta.length > 0 && { value: 'deployment', label: 'Deployment', body: <Rows rows={deployMeta} /> },
    paramRows.length > 0 && { value: 'params', label: 'Params', body: <Rows rows={paramRows} /> },
    commits.length > 0 && {
      value: 'commits',
      label: `Commits (${commits.length})`,
      body: (
        <ul className="space-y-1 text-sm">
          {commits.map((c) => (
            <li key={c.hash} className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-mono text-[12.5px] text-muted-foreground">{c.shortHash}</span>
              <span className="min-w-0 flex-1">{c.subject}</span>
              <span className="text-xs text-muted-foreground">{c.date}</span>
            </li>
          ))}
        </ul>
      ),
    },
    images.length > 0 && {
      value: 'images',
      label: `Images (${images.length})`,
      body: <ul className="space-y-1 font-mono text-[12.5px] break-all">{images.map((im) => <li key={im}>{im}</li>)}</ul>,
    },
  ].filter(Boolean);

  const cancel = () =>
    runCommand({
      confirm: { title: `Stop build #${n}?`, description: 'The running process is stopped. It cannot be resumed.', confirmLabel: 'Stop build', destructive: true },
      pending: `Stopping #${n}…`,
      success: `#${n} cancelled`,
      failure: `Could not stop #${n}`,
      fn: () => cancelBuildRun(project, n),
      invalidate: [qk.buildRuns(project)],
    });

  const rebuild = async () => {
    const r = await runCommand({
      pending: `Starting a rebuild of #${n}…`,
      success: (res) => `Build #${res.buildNumber} ${res.queued ? 'queued' : 'started'}`,
      failure: `Could not rebuild #${n}`,
      fn: () => replayBuildRun(project, n),
      invalidate: [qk.buildRuns(project)],
    });
    if (r) navigate(`${base}/${r.buildNumber}`);
  };

  const title = run.type === 'clone' ? 'clone' : run.type === 'deploy' ? `deploy · ${merged.branch || ''}` : merged.branch || 'build';

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-4 lg:p-5">
      <Link to={base} className="inline-flex h-10 items-center gap-1 self-start text-sm text-muted-foreground lg:hidden">
        <ArrowLeft className="size-4" aria-hidden="true" /> Runs
      </Link>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 className="min-w-0 text-[15px] font-semibold">
          #{n} <span className="font-mono text-[13px] font-normal break-all">{title}</span>
        </h2>
        <RunStatusBadge status={status} />
        <span className="text-xs text-muted-foreground">{formatStarted(run.started_at)}</span>
        <div className="ml-auto flex gap-2">
          {isActive(status) && (
            <Button variant="outline" className="h-10 text-bad" onClick={cancel}><Square className="size-4" /> Cancel run</Button>
          )}
          {run.type === 'build' && !isActive(status) && (
            <Button variant="outline" className="h-10" onClick={rebuild}><RotateCcw className="size-4" /> Rebuild</Button>
          )}
        </div>
      </div>

      <DeployBar key={run.id} project={project} run={merged} status={status} targets={targets} onDeployed={(num) => navigate(`${base}/${num}`)} />

      {tabs.length > 0 && (
        <>
          <Button variant="ghost" className="h-10 justify-between lg:hidden" aria-expanded={showDetails} onClick={() => setShowDetails((s) => !s)}>
            Details <ChevronDown className={cn('size-4 transition-transform', showDetails && 'rotate-180')} />
          </Button>
          <Tabs defaultValue={tabs[0].value} className={cn(showDetails ? 'block' : 'hidden lg:block')}>
            <TabsList className="max-w-full overflow-x-auto">
              {tabs.map((t) => <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>)}
            </TabsList>
            {tabs.map((t) => (
              <TabsContent key={t.value} value={t.value} className="max-h-48 overflow-auto rounded-md border p-3">{t.body}</TabsContent>
            ))}
          </Tabs>
        </>
      )}

      {stream.stuck && (
        <div role="status" className="flex items-center gap-2 rounded-md bg-warn-bg px-3 py-2 text-sm text-warn">
          <AlertTriangle className="size-4" aria-hidden="true" /> No output detected — this build may be stuck.
        </div>
      )}

      <RunLog
        className="min-h-[60vh] lg:min-h-0"
        lines={stream.lines}
        status={stream.status}
        onReconnect={stream.reconnect}
        emptyText="No output yet."
        closedText="Log stream ended before the run finished."
        fileName={() => `${project}-${n}.log`}
      />
    </div>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/features/builds/__tests__/RunDetail.test.jsx` → PASS; then `npx vitest run` → all PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/builds/RunDetail.jsx frontend/src/features/builds/__tests__/RunDetail.test.jsx
git commit -m "feat(builds): run detail with live log, details tabs, cancel and rebuild"
```

---

### Task 10: `NewBuildSheet` + `ParamField`

**Files:**
- Create: `frontend/src/features/builds/ParamField.jsx`
- Create: `frontend/src/features/builds/NewBuildSheet.jsx`
- Test: `frontend/src/features/builds/__tests__/NewBuildSheet.test.jsx`

**Interfaces:**
- Consumes: `ComboPicker` (4), `useRunCommand` (7), `initFormState`/`buildArgs`/`isFormValid` (3), `loadRecent`/`saveRecent` (3), `fetchBranches`, `startBuild`, `cloneRepo`, `qk`.
- Produces:
  - `<ParamField param value onChange />` (types: string, select, multiselect, checkbox).
  - `<NewBuildSheet project def open onOpenChange onStarted />` — `def = projects[project]` (`{ name, params }`); `onStarted(buildNumber: number)` after a build or clone starts.
  - Branch data: `fetchBranches(project) → { branches: string[], needsClone?: boolean }`.

- [ ] **Step 1: Write the failing test** — `frontend/src/features/builds/__tests__/NewBuildSheet.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as api from '@/lib/api';
import { renderWithProviders } from '@/test/renderWithProviders';
import { NewBuildSheet } from '@/features/builds/NewBuildSheet';
import { saveRecent } from '@/features/builds/recentStore';

vi.mock('@/lib/api');

const def = {
  name: 'API',
  params: [
    { name: 'tag', type: 'string', flag: '--tag', label: 'Tag', required: true },
    { name: 'env', type: 'select', flag: '--env', label: 'Env', options: ['dev', 'prod'], default: 'dev' },
    { name: 'mods', type: 'multiselect', flag: '--module', label: 'Modules', options: ['core', 'auth'] },
    { name: 'skip', type: 'checkbox', flag: '--skip-tests', label: 'Skip tests' },
  ],
};

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  api.fetchBranches.mockResolvedValue({ branches: ['main', 'release/2'] });
});

describe('NewBuildSheet', () => {
  it('renders a control per param type and enables Build once required fields are filled', async () => {
    api.startBuild.mockResolvedValue({ runId: 3, buildNumber: 12, queued: false });
    const onStarted = vi.fn();
    const onOpenChange = vi.fn();
    renderWithProviders(<NewBuildSheet project="api" def={def} open onOpenChange={onOpenChange} onStarted={onStarted} />);
    const user = userEvent.setup();
    expect(await screen.findByRole('combobox', { name: 'Branch' })).toHaveTextContent('main');
    expect(screen.getByRole('radio', { name: 'DEV' })).toHaveAttribute('aria-checked', 'true');
    const build = screen.getByRole('button', { name: 'Build & push' });
    expect(build).toBeDisabled();
    await user.type(screen.getByRole('textbox', { name: /Tag/ }), '1.4.0');
    await user.click(screen.getByRole('radio', { name: 'PROD' }));
    await user.click(screen.getByRole('checkbox', { name: 'auth' }));
    await user.click(screen.getByRole('switch', { name: /Skip tests/ }));
    await user.click(build);
    await waitFor(() => expect(api.startBuild).toHaveBeenCalledWith('api', 'main', ['--tag', '1.4.0', '--env', 'prod', '--module', 'auth', '--skip-tests']));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onStarted).toHaveBeenCalledWith(12);
  });

  it('prefills from the last build of this project', async () => {
    saveRecent('api', { branch: 'release/2', values: { tag: '9.9', env: 'prod' } });
    renderWithProviders(<NewBuildSheet project="api" def={def} open onOpenChange={vi.fn()} onStarted={vi.fn()} />);
    expect(await screen.findByRole('combobox', { name: 'Branch' })).toHaveTextContent('release/2');
    expect(screen.getByRole('textbox', { name: /Tag/ })).toHaveValue('9.9');
    expect(screen.getByRole('radio', { name: 'PROD' })).toHaveAttribute('aria-checked', 'true');
  });

  it('offers a clone step when the repo is missing', async () => {
    api.fetchBranches.mockResolvedValue({ branches: [], needsClone: true });
    api.cloneRepo.mockResolvedValue({ runId: 1, buildNumber: 1 });
    const onStarted = vi.fn();
    renderWithProviders(<NewBuildSheet project="api" def={def} open onOpenChange={vi.fn()} onStarted={onStarted} />);
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Clone repository' }));
    await waitFor(() => expect(onStarted).toHaveBeenCalledWith(1));
    expect(screen.queryByRole('button', { name: 'Build & push' })).toBeNull();
  });

  it('shows a retry when branches fail to load', async () => {
    api.fetchBranches.mockRejectedValueOnce(new Error('git fetch failed'));
    renderWithProviders(<NewBuildSheet project="api" def={def} open onOpenChange={vi.fn()} onStarted={vi.fn()} />);
    expect(await screen.findByText(/git fetch failed/)).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('combobox', { name: 'Branch' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/features/builds/__tests__/NewBuildSheet.test.jsx` → FAIL (modules missing).

- [ ] **Step 3: Implement**

`frontend/src/features/builds/ParamField.jsx`:
```jsx
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

export function ParamField({ param, value, onChange }) {
  const { type, label, name, options = [], required, placeholder, flag } = param;
  const id = `param-${name}`;
  const text = label || name;
  const heading = (
    <>
      {text}
      {required && <span className="text-bad" aria-hidden="true"> *</span>}
    </>
  );

  if (type === 'checkbox') {
    return (
      <div className="flex min-h-10 items-center justify-between gap-3">
        <Label htmlFor={id} className="font-normal">
          {text} <span className="font-mono text-xs text-muted-foreground">{flag}</span>
        </Label>
        <Switch id={id} checked={!!value} onCheckedChange={(v) => onChange(v === true)} />
      </div>
    );
  }
  if (type === 'string') {
    return (
      <div className="space-y-1.5">
        <Label htmlFor={id}>{heading}</Label>
        <Input id={id} className="h-10" required={required} value={value || ''} placeholder={placeholder || ''} onChange={(e) => onChange(e.target.value)} onBlur={(e) => onChange(e.target.value.trim())} />
      </div>
    );
  }
  if (type === 'select') {
    return (
      <fieldset className="space-y-1.5">
        <legend className="text-sm font-medium">{heading}</legend>
        <div role="radiogroup" aria-label={text} className="flex flex-wrap gap-1.5">
          {options.map((opt) => (
            <Button key={opt} type="button" role="radio" aria-checked={value === opt} variant={value === opt ? 'default' : 'outline'} className="h-10 min-w-14" onClick={() => onChange(opt)}>
              {opt.toUpperCase()}
            </Button>
          ))}
        </div>
      </fieldset>
    );
  }
  if (type === 'multiselect') {
    const selected = Array.isArray(value) ? value : [];
    return (
      <fieldset className="space-y-1.5">
        <legend className="text-sm font-medium">{heading}</legend>
        <div className="grid grid-cols-2 gap-x-3 sm:grid-cols-3">
          {options.map((opt) => {
            const oid = `${id}-${opt}`;
            return (
              <div key={opt} className="flex min-h-10 items-center gap-2">
                <Checkbox id={oid} checked={selected.includes(opt)} onCheckedChange={(c) => onChange(c === true ? [...selected, opt] : selected.filter((x) => x !== opt))} />
                <Label htmlFor={oid} className="font-normal">{opt}</Label>
              </div>
            );
          })}
        </div>
      </fieldset>
    );
  }
  return null;
}
```

`frontend/src/features/builds/NewBuildSheet.jsx`:
```jsx
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { cloneRepo, fetchBranches, startBuild } from '@/lib/api';
import { qk } from '@/lib/queries';
import { ComboPicker } from '@/features/runs/ComboPicker';
import { useRunCommand } from '@/features/runs/useRunCommand';
import { buildArgs, initFormState, isFormValid } from '@/features/builds/buildArgs';
import { loadRecent, saveRecent } from '@/features/builds/recentStore';
import { ParamField } from '@/features/builds/ParamField';

export function NewBuildSheet({ project, def, open, onOpenChange, onStarted }) {
  const qc = useQueryClient();
  const runCommand = useRunCommand();
  const params = def?.params || [];
  const branchesQ = useQuery({ queryKey: qk.branches(project), queryFn: () => fetchBranches(project), enabled: open && !!project, staleTime: 30000 });
  const [branch, setBranch] = useState('');
  const [values, setValues] = useState({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    const recent = loadRecent(project);
    setValues(initFormState(params, recent?.values));
    setBranch(recent?.branch || '');
    // params come from the same project def; re-init only when the sheet opens or the project changes
  }, [open, project]); // eslint-disable-line react-hooks/exhaustive-deps

  const branches = branchesQ.data?.branches || [];
  useEffect(() => {
    if (open && !branch && branches.length) setBranch(branches[0]);
  }, [open, branch, branches]);

  const needsClone = !!branchesQ.data?.needsClone;
  const valid = !needsClone && isFormValid(params, values, branch);

  const submit = async (e) => {
    e.preventDefault();
    if (!valid || submitting) return;
    setSubmitting(true);
    saveRecent(project, { branch, values });
    const r = await runCommand({
      pending: `Starting ${def.name} build…`,
      success: (res) => `Build #${res.buildNumber} ${res.queued ? 'queued' : 'started'}`,
      failure: 'Could not start the build',
      fn: () => startBuild(project, branch, buildArgs(params, values)),
      invalidate: [qk.buildRuns(project)],
    });
    setSubmitting(false);
    if (r) {
      onOpenChange(false);
      onStarted(r.buildNumber);
    }
  };

  const clone = async () => {
    const r = await runCommand({
      pending: `Cloning ${def.name}…`,
      success: (res) => (res.alreadyCloned ? 'Repository already cloned' : `Clone #${res.buildNumber} started`),
      failure: 'Could not clone the repository',
      fn: () => cloneRepo(project),
      invalidate: [qk.buildRuns(project), qk.branches(project)],
    });
    if (r && !r.alreadyCloned) {
      onOpenChange(false);
      onStarted(r.buildNumber);
    }
  };

  let body;
  if (branchesQ.isLoading) {
    body = <div className="space-y-3"><Skeleton className="h-10" /><Skeleton className="h-10" /><p className="text-xs text-muted-foreground">Fetching branches…</p></div>;
  } else if (branchesQ.isError) {
    body = (
      <div className="space-y-2 text-sm">
        <p className="text-bad">Could not load branches: {branchesQ.error.message}</p>
        <Button type="button" variant="outline" className="h-10" onClick={() => branchesQ.refetch()}>Retry</Button>
      </div>
    );
  } else if (needsClone) {
    body = (
      <div className="space-y-3 text-sm">
        <p>This project's repository hasn't been cloned on the server yet.</p>
        <Button type="button" className="h-10" onClick={clone}>Clone repository</Button>
      </div>
    );
  } else {
    body = (
      <div className="space-y-5">
        <div className="space-y-1.5">
          <Label htmlFor="build-branch">Branch<span className="text-bad" aria-hidden="true"> *</span></Label>
          <ComboPicker id="build-branch" mono options={branches.map((b) => ({ value: b, label: b }))} value={branch} onChange={setBranch} placeholder="Select branch…" searchLabel="Search branches" emptyText="No matching branch." />
        </div>
        {params.map((p) => (
          <ParamField key={p.name} param={p} value={values[p.name]} onChange={(v) => setValues((prev) => ({ ...prev, [p.name]: v }))} />
        ))}
      </div>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md">
        <form onSubmit={submit} className="flex h-full flex-col">
          <SheetHeader className="border-b p-4">
            <SheetTitle>New build — {def?.name}</SheetTitle>
            <SheetDescription>Build and push a new image.</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-auto p-4">{body}</div>
          {!needsClone && !branchesQ.isError && (
            <SheetFooter className="border-t p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <Button type="submit" className="h-10 w-full" disabled={!valid || submitting}>Build &amp; push</Button>
            </SheetFooter>
          )}
        </form>
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/features/builds/__tests__/NewBuildSheet.test.jsx` → PASS; then `npx vitest run` → all PASS.
If `qc` ends up unused, remove the `useQueryClient` import — do not leave dead code.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/builds/ParamField.jsx frontend/src/features/builds/NewBuildSheet.jsx frontend/src/features/builds/__tests__/NewBuildSheet.test.jsx
git commit -m "feat(builds): new build sheet with typed param fields, prefill and clone step"
```

---

### Task 11: `BuildsPage` — routes, project switcher, run list, phone list/detail

**Files:**
- Create: `frontend/src/features/builds/BuildsPage.jsx`
- Modify: `frontend/src/app/router.jsx` (replace the `builds` legacy route)
- Test: `frontend/src/features/builds/__tests__/BuildsPage.test.jsx`

**Interfaces:**
- Consumes: everything from Tasks 2–10; `PageHeader`, `useNow`, `formatAgo` (`@/lib/containers`), `readPref`/`writePref`.
- Produces: `BuildsIndex` (redirect), default export `BuildsPage`. Routes `builds`, `builds/:project`, `builds/:project/:num`. Query string `?new=1` opens the sheet. Pref key `builds.lastProject`.

- [ ] **Step 1: Write the failing test** — `frontend/src/features/builds/__tests__/BuildsPage.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as api from '@/lib/api';
import { renderApp } from '@/test/renderApp';
import { setViewport } from '@/test/viewport';

vi.mock('@/lib/api');

class FakeSocket {
  static instances = [];
  constructor(url) { this.url = url; FakeSocket.instances.push(this); }
  close() { this.closed = true; }
}

const runs = [
  { id: 30, type: 'build', build_number: 3, status: 'running', branch: 'main', started_at: '2026-09-27 10:00:00' },
  { id: 20, type: 'deploy', build_number: 2, status: 'success', branch: 'main', args_json: JSON.stringify({ env: 'stage' }), started_at: '2026-09-27 09:00:00' },
  { id: 10, type: 'build', build_number: 1, status: 'failed', branch: 'fix/x', started_at: '2026-09-27 08:00:00' },
];

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  FakeSocket.instances = [];
  vi.stubGlobal('WebSocket', FakeSocket);
  setViewport({ desktop: true });
  api.fetchSettingsServers.mockResolvedValue([]);
  api.fetchHistory.mockResolvedValue([]);
  api.fetchProjects.mockResolvedValue({ api: { name: 'API', params: [] }, 'my app': { name: 'My App', params: [] } });
  api.fetchBuildRuns.mockImplementation(async (project, { offset = 0 } = {}) => (project === 'api' && offset === 0 ? { runs, hasMore: true } : { runs: [], hasMore: false }));
  api.fetchCapRoverTargets.mockResolvedValue([]);
  api.fetchBranches.mockResolvedValue({ branches: ['main'] });
});
afterEach(() => vi.unstubAllGlobals());

describe('BuildsPage', () => {
  it('redirects /builds to the last used project, else the first', async () => {
    let { router } = renderApp('/builds');
    await waitFor(() => expect(router.state.location.pathname).toBe('/builds/api'));
    localStorage.setItem('dockyard:builds.lastProject', JSON.stringify('my app'));
    ({ router } = renderApp('/builds'));
    await waitFor(() => expect(router.state.location.pathname).toBe('/builds/my%20app'));
  });

  it('on desktop lists runs and auto-selects the latest', async () => {
    renderApp('/builds/api');
    const list = await screen.findByRole('navigation', { name: 'Runs' });
    expect(within(list).getAllByRole('link')).toHaveLength(3);
    expect(within(list).getByText(/stage/)).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: /#3/ })).toBeInTheDocument();
    expect(FakeSocket.instances[0].url).toMatch(/runId=30$/);
  });

  it('on phones shows only the list, then the run full-width with a back link', async () => {
    setViewport({ desktop: false });
    const { router } = renderApp('/builds/api');
    const list = await screen.findByRole('navigation', { name: 'Runs' });
    expect(FakeSocket.instances).toHaveLength(0);
    await userEvent.setup().click(within(list).getByRole('link', { name: /#1/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/builds/api/1'));
    expect(await screen.findByRole('link', { name: /Runs/ })).toHaveAttribute('href', '/builds/api');
  });

  it('fetches a deep-linked run that is not on the first page (Review Focus 2)', async () => {
    api.fetchBuildRun.mockResolvedValue({ id: 5, type: 'build', build_number: 5, status: 'success', branch: 'old', started_at: '2026-09-01 08:00:00' });
    renderApp('/builds/api/5');
    expect(await screen.findByRole('heading', { name: /#5/ })).toBeInTheDocument();
    expect(api.fetchBuildRun).toHaveBeenCalledWith('api', 5);
  });

  it('shows not found for a missing run', async () => {
    api.fetchBuildRun.mockRejectedValue(Object.assign(new Error('Run not found'), { status: 404 }));
    renderApp('/builds/api/999');
    expect(await screen.findByText('Run #999 not found')).toBeInTheDocument();
  });

  it('encodes project keys in links (Review Focus 4)', async () => {
    api.fetchBuildRuns.mockResolvedValue({ runs: [runs[2]], hasMore: false });
    renderApp('/builds/my%20app');
    const list = await screen.findByRole('navigation', { name: 'Runs' });
    expect(within(list).getByRole('link', { name: /#1/ })).toHaveAttribute('href', '/builds/my%20app/1');
  });

  it('filters runs and loads more', async () => {
    renderApp('/builds/api');
    const user = userEvent.setup();
    const list = await screen.findByRole('navigation', { name: 'Runs' });
    await user.selectOptions(screen.getByRole('combobox', { name: 'Filter runs' }), 'failed');
    expect(within(list).getAllByRole('link')).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Load more' }));
    await waitFor(() => expect(api.fetchBuildRuns).toHaveBeenCalledWith('api', { offset: 3 }));
  });

  it('opens the new build sheet with n and with ?new=1', async () => {
    const { router } = renderApp('/builds/api');
    await screen.findByRole('navigation', { name: 'Runs' });
    await userEvent.setup().keyboard('n');
    expect(await screen.findByRole('dialog', { name: /New build — API/ })).toBeInTheDocument();
    expect(router.state.location.search).toBe('?new=1');
    renderApp('/builds/api?new=1');
    expect((await screen.findAllByRole('dialog', { name: /New build — API/ })).length).toBeGreaterThan(0);
  });

  it('explains how to add projects when none exist', async () => {
    api.fetchProjects.mockResolvedValue({});
    renderApp('/builds');
    expect(await screen.findByText(/No build projects yet/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Settings/ })).toHaveAttribute('href', '/settings');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/features/builds/__tests__/BuildsPage.test.jsx` → FAIL.

- [ ] **Step 3: Implement**

`frontend/src/features/builds/BuildsPage.jsx`:
```jsx
import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate, NavLink, useNavigate, useParams, useSearchParams } from 'react-router';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/app/PageHeader';
import { fetchBuildRun, fetchBuildRuns, fetchCapRoverTargets, fetchProjects } from '@/lib/api';
import { formatAgo } from '@/lib/containers';
import { qk } from '@/lib/queries';
import { readPref, writePref } from '@/lib/storage';
import { useIsDesktop } from '@/lib/useMediaQuery';
import { useNow } from '@/lib/useNow';
import { cn } from '@/lib/utils';
import { RunList } from '@/features/runs/RunList';
import { RunStatusBadge } from '@/features/runs/RunStatusBadge';
import { ComboPicker } from '@/features/runs/ComboPicker';
import { isActive, toIso } from '@/features/runs/runStatus';
import { deployEnvOf } from '@/features/builds/buildArgs';
import { NewBuildSheet } from '@/features/builds/NewBuildSheet';
import { RunDetail } from '@/features/builds/RunDetail';

const LAST_PROJECT = 'builds.lastProject';
const MAX_TABS = 5;
const FILTERS = {
  all: () => true,
  build: (r) => r.type === 'build',
  deploy: (r) => r.type === 'deploy',
  clone: (r) => r.type === 'clone',
  failed: (r) => r.status === 'failed',
  active: (r) => isActive(r.status),
};

const useProjects = () => useQuery({ queryKey: qk.buildProjects, queryFn: fetchProjects, staleTime: 5 * 60000 });

function Empty({ title, children }) {
  return (
    <div className="m-auto max-w-sm p-8 text-center">
      <p className="mb-1 text-[15px] font-semibold">{title}</p>
      <div className="text-sm text-muted-foreground">{children}</div>
    </div>
  );
}

function NoProjects() {
  return (
    <Empty title="No build projects yet">
      Add one in <Link className="text-primary underline" to="/settings">Settings</Link> → Build Projects.
    </Empty>
  );
}

export function BuildsIndex() {
  const projects = useProjects();
  if (projects.isLoading) return <div className="p-6"><Skeleton className="h-8 w-48" /></div>;
  if (projects.isError) return <Empty title="Could not load build projects">{projects.error.message}</Empty>;
  const keys = Object.keys(projects.data || {});
  if (keys.length === 0) return <NoProjects />;
  const last = readPref(LAST_PROJECT, null);
  return <Navigate replace to={`/builds/${encodeURIComponent(keys.includes(last) ? last : keys[0])}`} />;
}

function ProjectSwitcher({ projects, current }) {
  const navigate = useNavigate();
  const keys = Object.keys(projects);
  const go = (key) => navigate(`/builds/${encodeURIComponent(key)}`);
  const options = keys.map((k) => ({ value: k, label: projects[k].name || k }));
  return (
    <>
      {keys.length <= MAX_TABS ? (
        <nav aria-label="Projects" className="hidden gap-1 md:flex">
          {keys.map((k) => (
            <NavLink
              key={k}
              to={`/builds/${encodeURIComponent(k)}`}
              className={({ isActive: on }) => cn('rounded-md px-3 py-1.5 text-sm hover:bg-muted', (on || k === current) && 'bg-accent font-medium text-accent-foreground')}
            >
              {projects[k].name || k}
            </NavLink>
          ))}
        </nav>
      ) : (
        <div className="hidden w-56 md:block">
          <Label htmlFor="project-picker" className="sr-only">Project</Label>
          <ComboPicker id="project-picker" options={options} value={current} onChange={go} placeholder="Project…" searchLabel="Search projects" emptyText="No matching project." />
        </div>
      )}
      <NativeSelect aria-label="Project" className="w-40 md:hidden" value={current} onChange={(e) => go(e.target.value)}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </NativeSelect>
    </>
  );
}

function RunRow({ run, queuePos, now }) {
  const what = run.type === 'clone' ? 'clone' : run.type === 'deploy' ? `🚀 ${deployEnvOf(run) || run.branch || 'deploy'}` : run.branch || 'build';
  return (
    <>
      <span className="flex items-center gap-2">
        <span className="font-medium tabular-nums">#{run.build_number}</span>
        <span className="min-w-0 flex-1 truncate font-mono text-[12.5px]">{what}</span>
        <RunStatusBadge status={run.status} />
      </span>
      <span className="text-xs text-muted-foreground">{queuePos ? `Queued · position ${queuePos}` : formatAgo(toIso(run.started_at), now)}</span>
    </>
  );
}

export default function BuildsPage() {
  const { project, num } = useParams();
  const [search, setSearch] = useSearchParams();
  const navigate = useNavigate();
  const isDesktop = useIsDesktop();
  const now = useNow(30000);
  const [filter, setFilter] = useState('all');

  const projectsQ = useProjects();
  const def = projectsQ.data?.[project];
  const targetsQ = useQuery({ queryKey: qk.caproverTargets, queryFn: fetchCapRoverTargets, staleTime: 60000 });
  const runsQ = useInfiniteQuery({
    queryKey: qk.buildRunPages(project),
    queryFn: ({ pageParam }) => fetchBuildRuns(project, { offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => (last.hasMore ? pages.reduce((n, p) => n + p.runs.length, 0) : undefined),
    refetchInterval: 10000,
    enabled: !!def,
  });
  const runs = runsQ.data?.pages.flatMap((p) => p.runs) ?? [];
  const shown = runs.filter(FILTERS[filter]);
  const queued = runs.filter((r) => r.status === 'queued').sort((a, b) => a.id - b.id);

  const selectedNum = num != null ? Number(num) : isDesktop ? runs[0]?.build_number : undefined;
  const listed = runs.find((r) => r.build_number === selectedNum);
  const singleQ = useQuery({
    queryKey: qk.buildRun(project, selectedNum),
    queryFn: () => fetchBuildRun(project, selectedNum),
    enabled: selectedNum != null && !listed && runsQ.isSuccess,
    retry: false,
  });
  const selected = listed ?? singleQ.data;

  useEffect(() => {
    if (def) writePref(LAST_PROJECT, project);
  }, [def, project]);

  const sheetOpen = search.get('new') === '1';
  const setSheetOpen = useCallback(
    (open) =>
      setSearch(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (open) next.set('new', '1');
          else next.delete('new');
          return next;
        },
        { replace: true },
      ),
    [setSearch],
  );

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'n' || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = document.activeElement;
      if (el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA' || el?.tagName === 'SELECT' || el?.isContentEditable) return;
      if (document.querySelector('[role="alertdialog"], [role="dialog"]')) return;
      e.preventDefault();
      setSheetOpen(true);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [setSheetOpen]);

  if (projectsQ.isLoading) return <div className="p-6"><Skeleton className="h-8 w-48" /></div>;
  if (projectsQ.isError) return <Empty title="Could not load build projects">{projectsQ.error.message}</Empty>;
  if (Object.keys(projectsQ.data || {}).length === 0) return <NoProjects />;
  if (!def) {
    return (
      <Empty title={`Unknown project “${project}”`}>
        <Link className="text-primary underline" to="/builds">Back to Builds</Link>
      </Empty>
    );
  }

  const base = `/builds/${encodeURIComponent(project)}`;
  const inDetail = num != null;

  let detail;
  if (selected) {
    detail = <RunDetail key={selected.id} project={project} run={selected} params={def.params || []} targets={targetsQ.data || []} />;
  } else if (singleQ.isError) {
    detail = (
      <Empty title={`Run #${selectedNum} not found`}>
        <Link className="text-primary underline" to={base}>Back to runs</Link>
      </Empty>
    );
  } else if (runsQ.isSuccess && runs.length === 0 && !inDetail) {
    detail = <Empty title="No runs yet">Start one with <strong>New build</strong>.</Empty>;
  } else if (inDetail || runsQ.isLoading) {
    detail = <div className="space-y-3 p-5"><Skeleton className="h-6 w-64" /><Skeleton className="h-64" /></div>;
  } else {
    detail = <Empty title="Select a run">Pick a run from the list to see its log.</Empty>;
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader title="Builds" subtitle={def.name}>
        <ProjectSwitcher projects={projectsQ.data} current={project} />
        <Button className="hidden h-9 sm:inline-flex" aria-keyshortcuts="n" onClick={() => setSheetOpen(true)}>
          <Plus className="size-4" /> New build
        </Button>
        <Button size="icon" className="size-10 sm:hidden" aria-label="New build" onClick={() => setSheetOpen(true)}>
          <Plus className="size-5" />
        </Button>
      </PageHeader>
      <div className="flex min-h-0 flex-1">
        <section aria-label="Run list" className={cn('min-h-0 w-full flex-col border-r lg:flex lg:w-80 lg:shrink-0', inDetail ? 'hidden' : 'flex')}>
          <div className="border-b p-3">
            <NativeSelect aria-label="Filter runs" value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="all">All runs</option>
              <option value="build">Builds</option>
              <option value="deploy">Deploys</option>
              <option value="clone">Clones</option>
              <option value="failed">Failed</option>
              <option value="active">Running or queued</option>
            </NativeSelect>
          </div>
          {runsQ.isLoading ? (
            <div className="space-y-2 p-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12" />)}</div>
          ) : runsQ.isError ? (
            <p className="p-4 text-sm text-bad">Could not load runs: {runsQ.error.message}</p>
          ) : (
            <RunList
              label="Runs"
              items={shown}
              getKey={(r) => r.id}
              getHref={(r) => `${base}/${r.build_number}`}
              isSelected={(r) => r.build_number === selectedNum}
              renderItem={(r) => {
                const pos = r.status === 'queued' ? queued.findIndex((q) => q.id === r.id) + 1 : 0;
                return <RunRow run={r} queuePos={pos} now={now} />;
              }}
              footer={
                runsQ.hasNextPage && (
                  <div className="p-3">
                    <Button variant="outline" className="h-10 w-full" disabled={runsQ.isFetchingNextPage} onClick={() => runsQ.fetchNextPage()}>
                      {runsQ.isFetchingNextPage ? 'Loading…' : 'Load more'}
                    </Button>
                  </div>
                )
              }
            />
          )}
        </section>
        <section aria-label="Run detail" className={cn('min-h-0 min-w-0 flex-1 flex-col overflow-auto', inDetail ? 'flex' : 'hidden lg:flex')}>
          {detail}
        </section>
      </div>
      <NewBuildSheet project={project} def={def} open={sheetOpen} onOpenChange={setSheetOpen} onStarted={(n) => navigate(`${base}/${n}`)} />
    </div>
  );
}
```

In `frontend/src/app/router.jsx`: remove `import BuildView from '@/legacy/BuildView';`, add `import BuildsPage, { BuildsIndex } from '@/features/builds/BuildsPage';`, and replace `{ path: 'builds', element: legacy(BuildView) },` with:
```js
      { path: 'builds', element: <BuildsIndex /> },
      { path: 'builds/:project', element: <BuildsPage /> },
      { path: 'builds/:project/:num', element: <BuildsPage /> },
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/features/builds` → PASS; then `npx vitest run` → all PASS (the activity test still links to `/builds`; that's changed in Task 14).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/builds/BuildsPage.jsx frontend/src/features/builds/__tests__/BuildsPage.test.jsx frontend/src/app/router.jsx
git commit -m "feat(builds): runs-first Builds page with deep links and phone list/detail"
```

---

### Task 12: `MigrationForm`

**Files:**
- Create: `frontend/src/features/migrations/MigrationForm.jsx`
- Test: `frontend/src/features/migrations/__tests__/MigrationForm.test.jsx`

**Interfaces:**
- Consumes: `ComboPicker`, `NativeSelect` (4), `useRunCommand` (7), `isProd`, `fetchBranches`, `startFlywayRun`, `qk`.
- Produces: `<MigrationForm projects envs busy onStarted />`
  - `projects`: flyway projects `{ [key]: { name } }`; `envs`: `{ id, name, databases: { id, name }[] }[]`; `busy`: a run is active; `onStarted(runId: number)`.
  - `startFlywayRun({ envId, dbId, project, branch, command: 'info'|'migrate' }) → { runId, runNumber }`.

- [ ] **Step 1: Write the failing test** — `frontend/src/features/migrations/__tests__/MigrationForm.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as api from '@/lib/api';
import { renderWithProviders } from '@/test/renderWithProviders';
import { MigrationForm } from '@/features/migrations/MigrationForm';

vi.mock('@/lib/api');

const projects = { api: { name: 'API' } };
const envs = [
  { id: 1, name: 'stage', databases: [{ id: 11, name: 'core' }, { id: 12, name: 'audit' }] },
  { id: 2, name: 'prod', databases: [{ id: 21, name: 'core' }] },
  { id: 3, name: 'sandbox', databases: [] },
];

beforeEach(() => {
  vi.resetAllMocks();
  api.fetchBranches.mockResolvedValue({ branches: ['main', 'develop'] });
  api.startFlywayRun.mockResolvedValue({ runId: 57, runNumber: 57 });
});

describe('MigrationForm', () => {
  it('runs info without confirmation using the defaults', async () => {
    const onStarted = vi.fn();
    renderWithProviders(<MigrationForm projects={projects} envs={envs} busy={false} onStarted={onStarted} />);
    const user = userEvent.setup();
    expect(await screen.findByRole('combobox', { name: 'Branch' })).toHaveTextContent('main');
    await user.click(screen.getByRole('button', { name: 'Info' }));
    await waitFor(() => expect(api.startFlywayRun).toHaveBeenCalledWith({ envId: 1, dbId: 11, project: 'api', branch: 'main', command: 'info' }));
    expect(onStarted).toHaveBeenCalledWith(57);
  });

  it('resets the database when the environment changes and confirms migrate', async () => {
    renderWithProviders(<MigrationForm projects={projects} envs={envs} busy={false} onStarted={vi.fn()} />);
    const user = userEvent.setup();
    await screen.findByRole('combobox', { name: 'Branch' });
    await user.selectOptions(screen.getByRole('combobox', { name: 'Database' }), '12');
    await user.click(screen.getByRole('button', { name: 'Migrate' }));
    expect(await screen.findByText(/stage \/ audit/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Run migrate' }));
    await waitFor(() => expect(api.startFlywayRun).toHaveBeenCalledWith(expect.objectContaining({ dbId: 12, command: 'migrate' })));
  });

  it('requires typing the database name for prod', async () => {
    renderWithProviders(<MigrationForm projects={projects} envs={envs} busy={false} onStarted={vi.fn()} />);
    const user = userEvent.setup();
    await screen.findByRole('combobox', { name: 'Branch' });
    await user.selectOptions(screen.getByRole('combobox', { name: 'Environment' }), '2');
    expect(screen.getByRole('combobox', { name: 'Database' })).toHaveValue('21');
    await user.click(screen.getByRole('button', { name: 'Migrate' }));
    const go = await screen.findByRole('button', { name: 'Run migrate' });
    expect(go).toBeDisabled();
    await user.type(screen.getByLabelText(/Type/), 'core');
    await user.click(go);
    await waitFor(() => expect(api.startFlywayRun).toHaveBeenCalledWith(expect.objectContaining({ envId: 2, dbId: 21 })));
  });

  it('disables both commands while a run is active or when the env has no databases (Review Focus 5)', async () => {
    const { rerender } = renderWithProviders(<MigrationForm projects={projects} envs={envs} busy onStarted={vi.fn()} />);
    await screen.findByRole('combobox', { name: 'Branch' });
    expect(screen.getByRole('button', { name: 'Info' })).toBeDisabled();
    expect(screen.getByText('A migration is running.')).toBeInTheDocument();
    rerender(<MigrationForm projects={projects} envs={envs} busy={false} onStarted={vi.fn()} />);
    await userEvent.setup().selectOptions(screen.getByRole('combobox', { name: 'Environment' }), '3');
    expect(screen.getByRole('button', { name: 'Info' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Migrate' })).toBeDisabled();
  });

  it('points to Builds when the repo is not cloned', async () => {
    api.fetchBranches.mockResolvedValue({ branches: [], needsClone: true });
    renderWithProviders(<MigrationForm projects={projects} envs={envs} busy={false} onStarted={vi.fn()} />);
    expect(await screen.findByRole('link', { name: 'Builds' })).toHaveAttribute('href', '/builds/api');
  });
});
```

Note: `renderWithProviders` returns Testing Library's `rerender`, which re-renders the router root, not the inner element. If the busy→idle rerender doesn't update, restructure that test into two separate renders — keep both assertions.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/features/migrations/__tests__/MigrationForm.test.jsx` → FAIL.

- [ ] **Step 3: Implement** — `frontend/src/features/migrations/MigrationForm.jsx`:

```jsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Skeleton } from '@/components/ui/skeleton';
import { fetchBranches, startFlywayRun } from '@/lib/api';
import { qk } from '@/lib/queries';
import { isProd } from '@/features/container/actions';
import { ComboPicker } from '@/features/runs/ComboPicker';
import { useRunCommand } from '@/features/runs/useRunCommand';

export function MigrationForm({ projects, envs, busy, onStarted }) {
  const runCommand = useRunCommand();
  const keys = Object.keys(projects);
  const [project, setProject] = useState(keys[0] || '');
  const [branch, setBranch] = useState('');
  const [envId, setEnvId] = useState(envs[0] ? String(envs[0].id) : '');
  const [dbId, setDbId] = useState(envs[0]?.databases[0] ? String(envs[0].databases[0].id) : '');

  useEffect(() => {
    if (!project && keys[0]) setProject(keys[0]);
  }, [project, keys]);
  useEffect(() => {
    if (!envId && envs[0]) {
      setEnvId(String(envs[0].id));
      setDbId(envs[0].databases[0] ? String(envs[0].databases[0].id) : '');
    }
  }, [envId, envs]);

  const branchesQ = useQuery({ queryKey: qk.branches(project), queryFn: () => fetchBranches(project), enabled: !!project, staleTime: 30000 });
  const branches = branchesQ.data?.branches || [];
  const needsClone = !!branchesQ.data?.needsClone;
  useEffect(() => {
    setBranch(branches[0] || '');
  }, [project, branchesQ.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const env = envs.find((e) => String(e.id) === envId);
  const database = env?.databases.find((d) => String(d.id) === dbId);
  const canRun = !!(project && branch && env && database && !needsClone && !busy);

  const changeEnv = (id) => {
    setEnvId(id);
    const next = envs.find((e) => String(e.id) === id);
    setDbId(next?.databases[0] ? String(next.databases[0].id) : '');
  };

  const run = async (command) => {
    if (!canRun) return;
    const where = `${env.name} / ${database.name}`;
    const r = await runCommand({
      confirm:
        command === 'migrate'
          ? {
              title: `Run migrate on ${where}?`,
              description: `Applies pending migrations from ${project}@${branch} to ${where}. This changes the database schema.`,
              confirmLabel: 'Run migrate',
              destructive: true,
              level: isProd(env.name) ? 'typed' : 'confirm',
              typedValue: database.name,
            }
          : undefined,
      pending: `Starting ${command} on ${where}…`,
      success: (res) => `Migration run #${res.runNumber} started`,
      failure: `Could not start ${command}`,
      fn: () => startFlywayRun({ envId: env.id, dbId: database.id, project, branch, command }),
      invalidate: [qk.flywayRuns],
    });
    if (r) onStarted(r.runId);
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <Label htmlFor="mig-project">Project</Label>
          <NativeSelect id="mig-project" value={project} onChange={(e) => setProject(e.target.value)}>
            {keys.map((k) => <option key={k} value={k}>{projects[k].name || k}</option>)}
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="mig-branch">Branch</Label>
          {branchesQ.isLoading ? (
            <Skeleton className="h-10" />
          ) : needsClone ? (
            <p className="flex h-10 items-center text-sm text-warn">
              Repo not cloned — clone it from&nbsp;<Link className="underline" to={`/builds/${encodeURIComponent(project)}`}>Builds</Link>
            </p>
          ) : branchesQ.isError ? (
            <p className="flex h-10 items-center text-sm text-bad">Could not load branches.</p>
          ) : (
            <ComboPicker id="mig-branch" mono options={branches.map((b) => ({ value: b, label: b }))} value={branch} onChange={setBranch} placeholder="Select branch…" searchLabel="Search branches" emptyText="No matching branch." />
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="mig-env">Environment</Label>
          <NativeSelect id="mig-env" value={envId} onChange={(e) => changeEnv(e.target.value)}>
            {envs.length === 0 && <option value="">No environments</option>}
            {envs.map((e) => <option key={e.id} value={String(e.id)}>{e.name}</option>)}
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="mig-db">Database</Label>
          <NativeSelect id="mig-db" value={dbId} disabled={!env?.databases.length} onChange={(e) => setDbId(e.target.value)}>
            {!env?.databases.length && <option value="">No databases</option>}
            {(env?.databases || []).map((d) => <option key={d.id} value={String(d.id)}>{d.name}</option>)}
          </NativeSelect>
        </div>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
        {busy && <p className="text-xs text-muted-foreground sm:mr-auto">A migration is running.</p>}
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Button variant="outline" className="h-10" disabled={!canRun} onClick={() => run('info')}>Info</Button>
          <Button className="h-10 bg-warn text-white hover:bg-warn/90" disabled={!canRun} onClick={() => run('migrate')}>Migrate</Button>
        </div>
      </div>
    </div>
  );
}
```

> Spec §3.2 says a tooltip explains the disabled buttons; tooltips don't work on touch, so a visible hint line is used instead (same text).

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/features/migrations/__tests__/MigrationForm.test.jsx` → PASS; then `npx vitest run` → all PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/migrations
git commit -m "feat(migrations): migration form with env/db cascade and prod-typed migrate"
```

---

### Task 13: `MigrationsPage` + `MigrationRunDetail`

**Files:**
- Create: `frontend/src/features/migrations/MigrationRunDetail.jsx`
- Create: `frontend/src/features/migrations/MigrationsPage.jsx`
- Modify: `frontend/src/app/router.jsx` (replace the `migrations` legacy route)
- Test: `frontend/src/features/migrations/__tests__/MigrationsPage.test.jsx`

**Interfaces:**
- Consumes: Tasks 2–7, 12; `fetchProjects`, `fetchFlywayEnvs`, `fetchFlywayRuns`, `fetchFlywayRun`, `cancelFlywayRun`.
- Produces: default export `MigrationsPage`; `<MigrationRunDetail run />`. Routes `migrations`, `migrations/:runId`.

- [ ] **Step 1: Write the failing test** — `frontend/src/features/migrations/__tests__/MigrationsPage.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as api from '@/lib/api';
import { renderApp } from '@/test/renderApp';
import { setViewport } from '@/test/viewport';

vi.mock('@/lib/api');

class FakeSocket {
  static instances = [];
  constructor(url) { this.url = url; FakeSocket.instances.push(this); }
  close() { this.closed = true; }
}

const runs = [
  { id: 57, run_number: 57, project: 'api', branch: 'main', command: 'migrate', status: 'running', env_name: 'stage', db_name: 'core', started_at: '2026-09-27 10:00:00' },
  { id: 56, run_number: 56, project: 'api', branch: 'main', command: 'info', status: 'success', env_name: 'dev', db_name: 'core', started_at: '2026-09-27 09:00:00' },
];

beforeEach(() => {
  vi.resetAllMocks();
  FakeSocket.instances = [];
  vi.stubGlobal('WebSocket', FakeSocket);
  setViewport({ desktop: true });
  api.fetchSettingsServers.mockResolvedValue([]);
  api.fetchHistory.mockResolvedValue([]);
  api.fetchBuildRuns.mockResolvedValue({ runs: [], hasMore: false });
  api.fetchProjects.mockResolvedValue({ api: { name: 'API', isFlyway: true }, web: { name: 'Web' } });
  api.fetchFlywayEnvs.mockResolvedValue([{ id: 1, name: 'stage', databases: [{ id: 11, name: 'core' }] }]);
  api.fetchFlywayRuns.mockResolvedValue(runs);
  api.fetchBranches.mockResolvedValue({ branches: ['main'] });
});
afterEach(() => vi.unstubAllGlobals());

describe('MigrationsPage', () => {
  it('lists history, auto-selects the latest run on desktop and disables commands while it runs', async () => {
    renderApp('/migrations');
    const list = await screen.findByRole('navigation', { name: 'Migration runs' });
    expect(within(list).getAllByRole('link')).toHaveLength(2);
    expect(await screen.findByRole('heading', { name: /#57/ })).toBeInTheDocument();
    expect(FakeSocket.instances[0].url).toMatch(/\/ws\/flyway\?runId=57$/);
    expect(await screen.findByRole('button', { name: 'Info' })).toBeDisabled();
  });

  it('on phones opens runs full-width with a back link and no auto-selection', async () => {
    setViewport({ desktop: false });
    const { router } = renderApp('/migrations');
    const list = await screen.findByRole('navigation', { name: 'Migration runs' });
    expect(FakeSocket.instances).toHaveLength(0);
    await userEvent.setup().click(within(list).getByRole('link', { name: /#56/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/migrations/56'));
    // The sidebar also has a "History" link — scope to the detail pane.
    const detail = await screen.findByRole('region', { name: 'Run detail' });
    expect(await within(detail).findByRole('link', { name: /History/ })).toHaveAttribute('href', '/migrations');
  });

  it('fetches a run older than the last 50 (Review Focus 2)', async () => {
    api.fetchFlywayRun.mockResolvedValue({ id: 7, run_number: 7, project: 'api', branch: 'old', command: 'info', status: 'success', env_name: 'dev', db_name: 'core', started_at: '2026-08-01 10:00:00' });
    renderApp('/migrations/7');
    expect(await screen.findByRole('heading', { name: /#7/ })).toBeInTheDocument();
    expect(screen.getByText(/dev \/ core/)).toBeInTheDocument();
    expect(api.fetchFlywayRun).toHaveBeenCalledWith(7);
  });

  it('cancels the running migration after confirmation', async () => {
    api.cancelFlywayRun.mockResolvedValue({ cancelled: true });
    renderApp('/migrations/57');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Cancel run' }));
    await user.click(await screen.findByRole('button', { name: 'Stop migration' }));
    await waitFor(() => expect(api.cancelFlywayRun).toHaveBeenCalledWith(57));
  });

  it('explains setup when nothing is configured', async () => {
    api.fetchProjects.mockResolvedValue({ web: { name: 'Web' } });
    api.fetchFlywayEnvs.mockResolvedValue([]);
    api.fetchFlywayRuns.mockResolvedValue([]);
    renderApp('/migrations');
    expect(await screen.findByText('Set up migrations')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /Settings/ })[0]).toHaveAttribute('href', '/settings');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/features/migrations/__tests__/MigrationsPage.test.jsx` → FAIL.

- [ ] **Step 3: Implement**

`frontend/src/features/migrations/MigrationRunDetail.jsx`:
```jsx
import { Link } from 'react-router';
import { ArrowLeft, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tag } from '@/components/status';
import { cancelFlywayRun } from '@/lib/api';
import { qk } from '@/lib/queries';
import { RunLog } from '@/features/runs/RunLog';
import { RunStatusBadge } from '@/features/runs/RunStatusBadge';
import { toIso } from '@/features/runs/runStatus';
import { useRunCommand } from '@/features/runs/useRunCommand';
import { useRunStream } from '@/features/runs/useRunStream';

export const whereOf = (run) => `${run.env_name ?? `env #${run.env_id}`} / ${run.db_name ?? `db #${run.db_id}`}`;

export function MigrationRunDetail({ run }) {
  const runCommand = useRunCommand();
  const stream = useRunStream('flyway', run.id, { active: run.status === 'running' });
  const status = stream.finalStatus ?? run.status;

  const cancel = () =>
    runCommand({
      confirm: { title: `Stop migration run #${run.run_number}?`, description: `Stops ${run.command} on ${whereOf(run)}. A partially applied migration may need manual cleanup.`, confirmLabel: 'Stop migration', destructive: true },
      pending: `Stopping #${run.run_number}…`,
      success: `#${run.run_number} cancelled`,
      failure: `Could not stop #${run.run_number}`,
      fn: () => cancelFlywayRun(run.id),
      invalidate: [qk.flywayRuns],
    });

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-4 lg:p-5">
      <Link to="/migrations" className="inline-flex h-10 items-center gap-1 self-start text-sm text-muted-foreground lg:hidden">
        <ArrowLeft className="size-4" aria-hidden="true" /> History
      </Link>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 className="text-[15px] font-semibold">#{run.run_number} · {run.command} · {whereOf(run)}</h2>
        <RunStatusBadge status={status} />
        <span className="font-mono text-xs text-muted-foreground">{run.project}@{run.branch}</span>
        <span className="text-xs text-muted-foreground">{run.started_at ? new Date(toIso(run.started_at)).toLocaleString() : ''}</span>
        {status === 'running' && (
          <Button variant="outline" className="ml-auto h-10 text-bad" onClick={cancel}><Square className="size-4" /> Cancel run</Button>
        )}
      </div>
      <RunLog
        className="min-h-[60vh] lg:min-h-0"
        lines={stream.lines}
        status={stream.status}
        onReconnect={stream.reconnect}
        emptyText="No output yet."
        closedText="Log stream ended before the run finished."
        fileName={() => `flyway-${run.run_number}-${run.command}.log`}
      />
    </div>
  );
}

export function CommandTag({ command }) {
  return <Tag tone={command === 'migrate' ? 'warn' : undefined}>{command}</Tag>;
}
```

`frontend/src/features/migrations/MigrationsPage.jsx`:
```jsx
import { Link, useNavigate, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/app/PageHeader';
import { fetchFlywayEnvs, fetchFlywayRun, fetchFlywayRuns, fetchProjects } from '@/lib/api';
import { formatAgo } from '@/lib/containers';
import { qk } from '@/lib/queries';
import { useIsDesktop } from '@/lib/useMediaQuery';
import { useNow } from '@/lib/useNow';
import { cn } from '@/lib/utils';
import { RunList } from '@/features/runs/RunList';
import { RunStatusBadge } from '@/features/runs/RunStatusBadge';
import { toIso } from '@/features/runs/runStatus';
import { MigrationForm } from '@/features/migrations/MigrationForm';
import { CommandTag, MigrationRunDetail, whereOf } from '@/features/migrations/MigrationRunDetail';

function Empty({ title, children }) {
  return (
    <div className="m-auto max-w-md p-8 text-center">
      <p className="mb-1 text-[15px] font-semibold">{title}</p>
      <div className="text-sm text-muted-foreground">{children}</div>
    </div>
  );
}

export default function MigrationsPage() {
  const { runId } = useParams();
  const navigate = useNavigate();
  const isDesktop = useIsDesktop();
  const now = useNow(30000);

  const projectsQ = useQuery({ queryKey: qk.buildProjects, queryFn: fetchProjects, staleTime: 5 * 60000 });
  const envsQ = useQuery({ queryKey: qk.flywayEnvs, queryFn: fetchFlywayEnvs, staleTime: 60000 });
  const runsQ = useQuery({ queryKey: qk.flywayRuns, queryFn: fetchFlywayRuns, refetchInterval: 10000 });

  const flywayProjects = Object.fromEntries(Object.entries(projectsQ.data || {}).filter(([, p]) => p.isFlyway));
  const envs = envsQ.data || [];
  const runs = runsQ.data || [];
  const busy = runs.some((r) => r.status === 'running');

  const selectedId = runId != null ? Number(runId) : isDesktop ? runs[0]?.id : undefined;
  const listed = runs.find((r) => r.id === selectedId);
  const singleQ = useQuery({
    queryKey: qk.flywayRun(selectedId),
    queryFn: () => fetchFlywayRun(selectedId),
    enabled: selectedId != null && !listed && runsQ.isSuccess,
    retry: false,
  });
  const selected = listed ?? singleQ.data;
  const inDetail = runId != null;

  if (projectsQ.isLoading || envsQ.isLoading) return <div className="p-6"><Skeleton className="h-8 w-48" /></div>;
  if (Object.keys(flywayProjects).length === 0 && envs.length === 0 && runs.length === 0) {
    return (
      <div className="flex h-full flex-col">
        <PageHeader title="Migrations" />
        <Empty title="Set up migrations">
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-left">
            <li>In <Link className="text-primary underline" to="/settings">Settings</Link> → Build Projects, turn on “Flyway project” for a project.</li>
            <li>In <Link className="text-primary underline" to="/settings">Settings</Link> → Flyway, add an environment and its databases.</li>
          </ol>
        </Empty>
      </div>
    );
  }

  let detail;
  if (selected) detail = <MigrationRunDetail key={selected.id} run={selected} />;
  else if (singleQ.isError) detail = <Empty title={`Run #${selectedId} not found`}><Link className="text-primary underline" to="/migrations">Back to history</Link></Empty>;
  else if (runsQ.isSuccess && runs.length === 0) detail = <Empty title="No migration runs yet">Run <strong>Info</strong> to see the database state.</Empty>;
  else if (inDetail || runsQ.isLoading) detail = <div className="space-y-3 p-5"><Skeleton className="h-6 w-64" /><Skeleton className="h-64" /></div>;
  else detail = <Empty title="Select a run">Pick a run to see its output.</Empty>;

  return (
    <div className="flex flex-col lg:h-full">
      <PageHeader title="Migrations" />
      <section aria-label="Run migration" className={cn('border-b bg-card p-4 lg:px-6', inDetail && 'hidden lg:block')}>
        <MigrationForm projects={flywayProjects} envs={envs} busy={busy} onStarted={(id) => navigate(`/migrations/${id}`)} />
      </section>
      <div className="flex min-h-0 flex-1">
        <section aria-label="Migration history" className={cn('w-full flex-col border-r lg:flex lg:w-[420px] lg:shrink-0', inDetail ? 'hidden' : 'flex')}>
          {runsQ.isError ? (
            <p className="p-4 text-sm text-bad">Could not load runs: {runsQ.error.message}</p>
          ) : (
            <RunList
              label="Migration runs"
              items={runs}
              getKey={(r) => r.id}
              getHref={(r) => `/migrations/${r.id}`}
              isSelected={(r) => r.id === selectedId}
              renderItem={(r) => (
                <>
                  <span className="flex items-center gap-2">
                    <span className="font-medium tabular-nums">#{r.run_number}</span>
                    <CommandTag command={r.command} />
                    <span className="min-w-0 flex-1 truncate text-[13px]">{whereOf(r)}</span>
                    <RunStatusBadge status={r.status} />
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    <span className="font-mono">{r.project}@{r.branch}</span> · {formatAgo(toIso(r.started_at), now)}
                  </span>
                </>
              )}
            />
          )}
        </section>
        <section aria-label="Run detail" className={cn('min-w-0 flex-1 flex-col', inDetail ? 'flex' : 'hidden lg:flex')}>
          {detail}
        </section>
      </div>
    </div>
  );
}
```

In `frontend/src/app/router.jsx`: remove `import FlywayView from '@/legacy/FlywayView';`, add `import MigrationsPage from '@/features/migrations/MigrationsPage';`, replace `{ path: 'migrations', element: legacy(FlywayView) },` with:
```js
      { path: 'migrations', element: <MigrationsPage /> },
      { path: 'migrations/:runId', element: <MigrationsPage /> },
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/features/migrations` → PASS; then `npx vitest run` → all PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/migrations frontend/src/app/router.jsx
git commit -m "feat(migrations): Migrations page with history, deep links and cancel"
```

---

### Task 14: Links in — activity panel and command palette

**Files:**
- Modify: `frontend/src/features/activity/ActivityPanel.jsx` (running-build `<Link to="/builds">`, ~line 42)
- Modify: `frontend/src/features/palette/CommandPalette.jsx`
- Test: `frontend/src/features/activity/__tests__/ActivityPanel.test.jsx`, `frontend/src/features/palette/__tests__/CommandPalette.test.jsx` (add cases)

**Interfaces:**
- Consumes: `qk.buildProjects`, `fetchProjects`.
- Produces: activity links `/builds/:project/:num`; palette items `Builds: <name>` → `/builds/:project`, `New build: <name>` → `/builds/:project?new=1`.

- [ ] **Step 1: Write the failing tests**

Append to `ActivityPanel.test.jsx` inside `describe('activity', …)`:
```jsx
  it('links a running build straight to its run', async () => {
    renderApp('/');
    const user = userEvent.setup();
    await screen.findByRole('heading', { name: 'Overview' });
    await user.keyboard('a');
    const panel = await screen.findByRole('complementary', { name: 'Activity' });
    expect(await within(panel).findByRole('link', { name: /backend #89/ })).toHaveAttribute('href', '/builds/backend/89');
  });
```

Append to `CommandPalette.test.jsx` inside `describe('CommandPalette', …)` (add `api.fetchProjects.mockResolvedValue({ api: { name: 'API' } });` and `api.fetchBuildRuns.mockResolvedValue({ runs: [], hasMore: false });` to that file's `beforeEach`):
```jsx
  it('opens a project on Builds and starts a new build', async () => {
    const { router } = renderApp('/');
    const user = userEvent.setup();
    await screen.findByRole('heading', { name: 'Overview' });
    await user.keyboard('{Control>}k{/Control}');
    await user.click(await screen.findByRole('option', { name: 'New build: API' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/builds/api'));
    expect(router.state.location.search).toBe('?new=1');
    await user.keyboard('{Escape}');
    await user.keyboard('{Control>}k{/Control}');
    await user.click(await screen.findByRole('option', { name: 'Builds: API' }));
    await waitFor(() => expect(router.state.location.search).toBe(''));
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/features/activity src/features/palette` → the two new tests FAIL.

- [ ] **Step 3: Implement**

`ActivityPanel.jsx`: change the running-build link to
```jsx
<Link to={`/builds/${encodeURIComponent(r.project)}/${r.build_number}`} className="flex items-center gap-2 rounded-md px-1 py-1 hover:bg-muted">
```
and replace the local `toIso` definition with `import { toIso } from '@/features/runs/runStatus';` (delete the local const).

`CommandPalette.jsx`: add imports
```js
import { useQuery } from '@tanstack/react-query';
import { fetchProjects } from '@/lib/api';
import { qk } from '@/lib/queries';
```
(merge `useQuery` into the existing `@tanstack/react-query` import). Inside the component:
```js
  const projects = useQuery({ queryKey: qk.buildProjects, queryFn: fetchProjects, staleTime: 5 * 60000 });
  const projectEntries = Object.entries(projects.data || {});
```
and add this group after the "Pages" group:
```jsx
        {projectEntries.length > 0 && (
          <CommandGroup heading="Builds">
            {projectEntries.map(([key, p]) => (
              <CommandItem key={`builds-${key}`} value={`builds ${p.name || key}`} onSelect={go(() => navigate(`/builds/${encodeURIComponent(key)}`))}>
                Builds: {p.name || key}
              </CommandItem>
            ))}
            {projectEntries.map(([key, p]) => (
              <CommandItem key={`new-${key}`} value={`new build ${p.name || key}`} onSelect={go(() => navigate(`/builds/${encodeURIComponent(key)}?new=1`))}>
                New build: {p.name || key}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run src/features/activity src/features/palette` → PASS; then `npx vitest run` → all PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/activity frontend/src/features/palette
git commit -m "feat(shell): deep-link running builds and add build commands to the palette"
```

---

### Task 15: PWA — manifest, icons, service worker, update toast, offline banner

**Files:**
- Modify: `frontend/package.json` (dev deps + script), `frontend/vite.config.js`, `frontend/index.html`, `frontend/src/main.jsx`, `frontend/src/app/AppLayout.jsx`, `nginx.conf`
- Create: `frontend/pwa-assets.config.js`, `frontend/src/app/PwaUpdater.jsx`, `frontend/src/app/OfflineBanner.jsx`, `frontend/src/lib/useOnline.js`, generated `frontend/public/{pwa-64x64,pwa-192x192,pwa-512x512,maskable-icon-512x512,apple-touch-icon-180x180}.png` + `favicon.ico`
- Test: `frontend/src/app/__tests__/OfflineBanner.test.jsx`

**Interfaces:**
- Produces: `useOnline() → boolean`; `<OfflineBanner />` (renders `role="status"` text "You're offline — data can't refresh." when offline); `<PwaUpdater />` (no UI besides the toast; mounted only in `main.jsx`).

- [ ] **Step 1: Write the failing test** — `frontend/src/app/__tests__/OfflineBanner.test.jsx`:

```jsx
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { OfflineBanner } from '@/app/OfflineBanner';

const setOnline = (value) => Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => value });
afterEach(() => setOnline(true));

describe('OfflineBanner', () => {
  it('appears when the browser goes offline and hides when it comes back', () => {
    setOnline(true);
    render(<OfflineBanner />);
    expect(screen.queryByRole('status')).toBeNull();
    act(() => { setOnline(false); window.dispatchEvent(new Event('offline')); });
    expect(screen.getByRole('status')).toHaveTextContent("You're offline — data can't refresh.");
    act(() => { setOnline(true); window.dispatchEvent(new Event('online')); });
    expect(screen.queryByRole('status')).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/app/__tests__/OfflineBanner.test.jsx` → FAIL (module missing).

- [ ] **Step 3: Implement the offline banner**

`frontend/src/lib/useOnline.js`:
```js
import { useSyncExternalStore } from 'react';

const subscribe = (onChange) => {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
};

export const useOnline = () => useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
```

`frontend/src/app/OfflineBanner.jsx`:
```jsx
import { WifiOff } from 'lucide-react';
import { useOnline } from '@/lib/useOnline';

export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div role="status" className="flex items-center gap-2 border-b bg-warn-bg px-4 py-2 text-sm text-warn">
      <WifiOff className="size-4" aria-hidden="true" /> You're offline — data can't refresh.
    </div>
  );
}
```

In `frontend/src/app/AppLayout.jsx`: `import { OfflineBanner } from '@/app/OfflineBanner';`, render `<OfflineBanner />` directly above `<main …>`, and add safe-area padding to the outer shell div:
```jsx
      <div className="flex h-dvh overflow-hidden bg-background pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]">
```

Run: `npx vitest run src/app` → PASS.

- [ ] **Step 4: Add the PWA tooling and icons**

From `frontend/`:
```bash
npm install -D vite-plugin-pwa@^0.21.1 @vite-pwa/assets-generator@^0.2.6
```

`frontend/pwa-assets.config.js`:
```js
import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: minimal2023Preset,
  images: ['public/favicon.svg'],
});
```

Add to `frontend/package.json` `scripts`: `"generate-pwa-assets": "pwa-assets-generator"`. Run `npm run generate-pwa-assets` and confirm `public/` now contains `pwa-64x64.png`, `pwa-192x192.png`, `pwa-512x512.png`, `maskable-icon-512x512.png`, `apple-touch-icon-180x180.png`, `favicon.ico`. Open `maskable-icon-512x512.png` and check the icon isn't clipped (the favicon is a full circle on dark — the preset pads it).

- [ ] **Step 5: Configure the plugin, HTML and updater**

`frontend/vite.config.js` — add `import { VitePWA } from 'vite-plugin-pwa';` and append to `plugins`:
```js
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'favicon.ico', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'Dockyard',
        short_name: 'Dockyard',
        description: 'Self-hosted Docker Compose management dashboard',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        theme_color: '#0d1117',
        background_color: '#0d1117',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // App shell only — live ops data (/api, /ws, build-info.json) is never cached.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/ws\//],
        cleanupOutdatedCaches: true,
      },
    }),
```

`frontend/index.html` `<head>` becomes:
```html
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <meta name="theme-color" content="#0d1117" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <meta name="apple-mobile-web-app-title" content="Dockyard" />
  <title>Dockyard</title>
  <link rel="icon" href="/favicon.ico" sizes="48x48" />
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <link rel="apple-touch-icon" href="/apple-touch-icon-180x180.png" />
```
(The plugin injects `<link rel="manifest">` at build time.)

`frontend/src/app/PwaUpdater.jsx`:
```jsx
import { useEffect } from 'react';
import { toast } from 'sonner';
import { useRegisterSW } from 'virtual:pwa-register/react';

const HOUR = 60 * 60 * 1000;

// Mounted only from main.jsx so tests never import the virtual module.
export function PwaUpdater() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    // Installed PWAs can stay open for days — check for a new deploy hourly.
    onRegisteredSW: (_url, registration) => registration && setInterval(() => registration.update(), HOUR),
    onRegisterError: (err) => console.warn('Service worker registration failed', err),
  });

  useEffect(() => {
    if (!needRefresh) return;
    toast('A new version of Dockyard is available', {
      id: 'pwa-update',
      duration: Infinity,
      action: { label: 'Reload', onClick: () => updateServiceWorker(true) },
    });
  }, [needRefresh, updateServiceWorker]);

  return null;
}
```

`frontend/src/main.jsx`: `import { PwaUpdater } from './app/PwaUpdater';` and render it inside `AppProviders` next to the router:
```jsx
    <AppProviders queryClient={queryClient}>
      <RouterProvider router={router} />
      <PwaUpdater />
    </AppProviders>
```

`nginx.conf` — add inside `server { … }` before `location / {`:
```nginx
    # PWA: never let a stale service worker, manifest or shell pin old code.
    location = /sw.js {
        add_header Cache-Control "no-cache";
        try_files $uri =404;
    }
    location = /manifest.webmanifest {
        default_type application/manifest+json;
        add_header Cache-Control "no-cache";
        try_files $uri =404;
    }
    location = /index.html {
        add_header Cache-Control "no-cache";
    }
```

- [ ] **Step 6: Verify build output and tests**

From `frontend/`:
```bash
npm run build
ls dist/sw.js dist/manifest.webmanifest
grep -o '"display":"standalone"' dist/manifest.webmanifest
grep -o 'rel="manifest"' dist/index.html
npx vitest run
```
Expected: both files exist, both greps print a match, all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/vite.config.js frontend/index.html frontend/pwa-assets.config.js frontend/public frontend/src/main.jsx frontend/src/app/PwaUpdater.jsx frontend/src/app/OfflineBanner.jsx frontend/src/app/AppLayout.jsx frontend/src/app/__tests__/OfflineBanner.test.jsx frontend/src/lib/useOnline.js nginx.conf
git commit -m "feat(pwa): installable app shell with update prompt and offline banner"
```

---

### Task 16: Remove legacy Builds/Flyway code and verify everything

**Files:**
- Delete: `frontend/src/legacy/BuildView.jsx`, `frontend/src/legacy/FlywayView.jsx`, `frontend/src/legacy/SearchableSelect.jsx`
- Modify: `frontend/src/legacy/legacy.css`

- [ ] **Step 1: Confirm nothing else imports them**

Run from repo root:
```bash
grep -rn "BuildView\|FlywayView\|SearchableSelect" frontend/src --include=*.js --include=*.jsx | grep -v "^frontend/src/legacy/\(BuildView\|FlywayView\|SearchableSelect\)\.jsx"
```
Expected: no output (router imports were removed in Tasks 11 and 13). If anything prints, fix that import first.

- [ ] **Step 2: Delete the files**

```bash
git rm frontend/src/legacy/BuildView.jsx frontend/src/legacy/FlywayView.jsx frontend/src/legacy/SearchableSelect.jsx
```

- [ ] **Step 3: Remove their CSS**

List candidate selectors: `grep -n "\.build-\|\.flyway-\|\.btn-build\|\.btn-flyway\|\.searchable-select\|\.pill\|\.toggle-" frontend/src/legacy/legacy.css`.
For each class, check whether History/Settings still use it: `grep -rn "<classname>" frontend/src/legacy --include=*.jsx`. Delete the rule blocks (and any `@media` blocks containing only such rules) whose classes are no longer referenced by any remaining `.jsx` file. Keep any class still used (e.g. `.toggle-*` or `.pill` if Settings uses them).

- [ ] **Step 4: Full verification**

From `frontend/`:
```bash
npx vitest run
npm run build
```
From repo root:
```bash
node backend/routes/flyway.test.js
node backend/routes/security.test.js
```
Expected: all pass; build succeeds with no missing-import errors.

- [ ] **Step 5: Commit**

```bash
git add -A frontend/src/legacy
git commit -m "chore(legacy): remove old Builds and Flyway views and their styles"
```

- [ ] **Step 6: Manual check (report results to the user; do not skip)**

Run the app (`cd backend && npm run dev` and `cd frontend && npm run dev`, or the deployed `feat/ui-rebuild` image) and check at **1440px** and **390px** widths, in light and dark themes:
1. Builds: clone (on a project that needs it) → new build → watch log → cancel → rebuild → deploy to a non-prod CapRover target → prod target asks to type the app name (cancel it).
2. Phone: list → run → "← Runs" and browser back both return to the list; no horizontal page scroll; log gets most of the screen; "Log options" menu works.
3. Migrations: Info on a non-prod DB; Migrate asks for confirmation; prod asks to type the DB name (cancel it); "← History" on phone.
4. Activity panel "Running builds" opens the exact run; ⌘K "New build: <project>" opens the sheet.
5. PWA (deployed HTTPS site): Chrome DevTools → Application → Manifest shows no errors and "Installable"; install on Android Chrome and iOS Safari (Add to Home Screen) → opens standalone, status bar doesn't cover the header; airplane mode shows the offline banner; after pushing a new build, the "A new version of Dockyard is available" toast appears and Reload loads it.
