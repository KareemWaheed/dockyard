# UI Rebuild — Phase 2: Builds, Migrations & PWA — Design

Date: 2026-09-27 · Branch: `feat/ui-rebuild` · Follows: `2026-09-25-ui-rebuild-phase1-design.md`

---

## 1. Intent

**Stated by the user:**
- Rebuild the legacy Builds and Migrations views to match the Phase 1 UI.
- Builds uses a **runs-first** layout.
- Both views must be fully **mobile responsive**.
- Dockyard becomes an installable **PWA** in this phase (added 2026-09-27).

**Assumptions (confirmed during design):**
- Phase 1 rules carry over: Tailwind v4 + shadcn with existing theme tokens; no `alert/confirm/prompt`; confirmations via `DialogProvider`; keyboard support; no capability lost.
- JavaScript, same backend API. Only backend change: add env/db names to `GET /flyway/runs/:id`.
- Screens are URL-addressable, nothing depends on hover, touch targets ≥ 40px — so the layouts work unchanged when installed as a PWA.

**Decomposition:** Phase 2 (this spec) = Builds + Migrations + PWA. Phase 3 = History + Settings.

---

## 2. Builds

### 2.1 Routes
| Route | Shows |
|---|---|
| `/builds` | Redirects to last-used project (local storage), else first project |
| `/builds/:project` | Run list; on desktop the latest run is auto-selected |
| `/builds/:project/:buildNumber` | That run (deep-linkable) |

Unknown project → empty state with link to `/builds`. Unknown run → empty state with link back to the list. No projects configured → empty state linking to Settings → Build Projects.

### 2.2 Desktop / tablet (≥ 1024px)
```
PageHeader: Builds   [project tabs]                  [+ New build (n)] [⧉]
┌ Runs (320px) ─────────┬ Run detail ─────────────────────────────────┐
│ [type/status filter]  │ #142 · main · build · ● running   [Cancel]  │
│ #142 main    ● 2m     │ Deploy to CapRover bar (successful builds)  │
│ #141 main    ✓ 1h     │ Tabs: Params │ Commits (n) │ Images          │
│ #139 🚀 stage ✓        │ RunLog: search · follow · wrap · download   │
│ Load more             │ ▌ output                                    │
└───────────────────────┴─────────────────────────────────────────────┘
```
- **Project switcher:** header tabs when ≤ 5 projects, otherwise a searchable combobox.
- **Run row:** `#num`, branch (deploys: 🚀 + env), `RunStatusBadge`, relative time, queue position for queued runs.
- **Filter:** type (build / deploy / clone) and status; client-side over loaded runs.
- **Pagination:** "Load more" (offset-based, 20 per page) as today.
- **Run header actions:** Cancel (running/queued; `confirm` level), Rebuild (finished build runs; replays same branch + args).
- **Detail tabs:** Params (from `args_json` + branch), Commits (`commits_json`, live-updated via `meta`), Images (`pushed_images_json`). Deploy runs show a Deployment tab instead of Params (source build, branch, git hash, image, env, CapRover app).
- **Stuck banner** above the log on `stuck_alert`, cleared on next chunk.

### 2.3 Phones (< 1024px)
- List/detail pattern driven by the URL: `/builds/:project` = full-width list; `/builds/:project/:num` = full-width detail with **← Runs** back button. Browser back works.
- No auto-selection of the latest run on phones.
- Project tabs → combobox; "New build" → `+` icon button.
- Detail tabs collapsed by default; log keeps ≥ 60% of viewport height.
- Log controls collapse into a `⋯` dropdown.
- Deploy bar stacks: env → image → full-width Deploy.
- Touch targets ≥ 40px; no horizontal page scroll (log lines may scroll horizontally only when wrap is off).

### 2.4 New build sheet
- shadcn `Sheet`: right side on desktop, full-screen on phones. Shortcut `n` (ignored while typing in inputs).
- Fields: branch (searchable combobox, same pattern as `TagCombobox`), then project params:
  - `string` → `Input` (trimmed on blur)
  - `select` → segmented button group
  - `multiselect` → checkbox group
  - `checkbox` → `Switch` with the flag shown as hint
- Required fields marked; Build disabled until valid (`isFormValid`).
- Prefilled from last-used values per project (`recentStore`, replaces the legacy "Recent" sidebar).
- Repo not cloned → sheet shows a **Clone repository** step instead of the form; clone starts a clone run and opens it.
- Submit: saves recents, starts the build, closes the sheet, navigates to the new run.

### 2.5 Deploy to CapRover
Shown only when: selected run is a `build`, status `success`, not active, has ≥ 1 pushed image, and ≥ 1 CapRover target for the project.
- Target select (`name|env_key → app_name`); image select only when > 1 image (single image auto-chosen).
- Deploy uses the action runner; `isProd(target.env_key)` → `typed` confirmation (type the app name), else `confirm`.
- Success navigates to the new deploy run. Errors show inline and as a toast.
- Selected target persists across runs; image choice and error reset per run.

---

## 3. Migrations

The backend keeps the last 50 runs, numbered globally, so there are no project tabs.

### 3.1 Routes
| Route | Shows |
|---|---|
| `/migrations` | Form + history; desktop auto-selects latest run |
| `/migrations/:runId` | That run (deep-linkable) |

### 3.2 Desktop (≥ 1024px)
```
PageHeader: Migrations                                              [⧉]
┌ Run migration ──────────────────────────────────────────────────────┐
│ Project [▾]  Branch [combobox]  Environment [▾]  Database [▾]        │
│                                            [Info]  [Migrate ⚠]       │
└─────────────────────────────────────────────────────────────────────┘
┌ History (420px) ─────────────────┬ #57 · migrate · stage / core ────┐
│ #57 migrate  stage/core  ● 1m    │ project@branch        [Cancel]   │
│ #56 info     dev/core    ✓ 1h    │ RunLog                           │
└──────────────────────────────────┴──────────────────────────────────┘
```
- Environment change resets database to that env's first database.
- **Info:** secondary button, no confirmation.
- **Migrate:** warning-toned. Confirmation via `DialogProvider`: `isProd(env.name)` → `typed` (type the database name); otherwise `confirm` naming env and database.
- While any run is active: Info/Migrate disabled with tooltip "A migration is running"; Cancel shown on the active run.
- History row: `#num`, command badge (migrate = warn tone, info = neutral), env/db, project@branch, status badge, relative time.
- Repo not cloned → branch field replaced by "Repo not cloned — clone it from Builds" linking to `/builds/:project`.
- Nothing configured → empty state with the two setup steps linking to Settings (Build Projects "Flyway project" toggle; Flyway environments).

### 3.3 Phones (< 1024px)
- Form stacks to one column; Info and Migrate side by side, full width.
- History full-width list; tapping opens `/migrations/:runId` full-width with **← History**.
- Log controls in `⋯` dropdown.

### 3.4 Backend change
`GET /api/flyway/runs/:id` joins `flyway_envs` / `flyway_databases` and returns `env_name`, `db_name` (same as the list endpoint), so deep links to runs outside the last 50 still show names.

---

## 4. Architecture

### 4.1 Shared (`features/runs/`)
| Unit | Purpose |
|---|---|
| `useRunStream(kind, runId)` | Owns the WebSocket to `/ws/builds` or `/ws/flyway`. Returns `{ lines, status, stuck, meta, reconnect }`. Uses `appendChunk` from `logBuffer.js` (5,000-line cap). Closes on run change/unmount. On `done`/`meta`, updates the React Query cache for that run list. |
| `RunLog` | Log viewer extracted from `LogsTab`: search, matches-only, wrap, follow + jump-to-bottom, download, expand. Takes `lines`, `status`, `onReconnect`, `downloadName`. `LogsTab` is refactored to use it (only Phase 1 code change besides links). |
| `RunStatusBadge` | running / queued / success / failed / cancelled using `StatusBadge` tones. |
| `RunList` | Keyboard-navigable list (↑/↓, Enter) with selected state; row content supplied by caller. |

### 4.2 Builds (`features/builds/`)
`BuildsPage`, `RunDetail`, `NewBuildSheet`, `ParamField`, `DeployBar`, and pure modules `buildArgs.js` (`buildArgs`, `parseArgs`, `isFormValid`, `initFormState`) and `recentStore.js` — ported from `legacy/BuildView.jsx` with tests.

### 4.3 Migrations (`features/migrations/`)
`MigrationsPage`, `MigrationForm`, `MigrationRunDetail`.

### 4.4 Data flow
- React Query for server state. New keys in `lib/queries.js`: branches(project), caproverTargets, flywayEnvs, flywayRuns, buildRun(project, num), flywayRun(id). Builds run lists reuse `qk.buildRuns(project)` so the sidebar badge and activity panel stay consistent.
- Deep link to a run not in the loaded list → fetch single run (`GET /builds/:project/runs/:num`, `GET /flyway/runs/:id`).
- Mutations (start build, clone, cancel, replay, deploy, flyway run/cancel) go through the Phase 1 action runner: pending toast → success/error toast → invalidate run list → navigate to the new run.
- Local storage only via `lib/storage.js` safe wrappers (recents, last project).

### 4.5 Error handling
- API failures → error toast with backend message (legacy only logged to console).
- Stream drop → "Stream ended — Reconnect" (same as container logs).
- Deploy error → inline in deploy bar + toast.
- Missing run/project → empty state with a way back.
- No `alert/confirm/prompt`.

### 4.6 Links in
- Activity panel running builds → `/builds/:project/:num`.
- ⌘K: "Builds: <project>" and "New build: <project>" (opens the page with the sheet open via `?new=1`).

---

## 5. Testing

Vitest + jsdom, same setup as Phase 1.
- **Pure:** `buildArgs`, `parseArgs` (multiselect, checkbox, missing, malformed JSON), `isFormValid`, `recentStore` (including storage failure).
- **`useRunStream`** with a mock WebSocket: chunks, `stuck_alert`, `meta`, `done` updating the cache, run switch closes old socket, error/close.
- **Components:** NewBuildSheet (field per param type, prefill, clone step, Build disabled until valid); DeployBar visibility and multi-image selection; Migrate confirmation level (prod typed vs confirm); buttons disabled while a run is active; RunList keyboard nav; phone list/detail switching by URL at narrow viewport; `LogsTab` tests still pass after the `RunLog` extraction.
- **Backend:** `GET /flyway/runs/:id` returns `env_name`/`db_name` — plain Node script in the style of `security.test.js`.
- **Manual (before merge):** at 1440px and 390px — Builds: clone → build → watch → cancel → rebuild → deploy; Migrations: info, migrate on non-prod, prod confirmation cancelled. Light and dark themes. Activity panel deep links.

---

## 6. Cleanup

- Delete `legacy/BuildView.jsx`, `legacy/FlywayView.jsx`, and their `build-*` / `flyway-*` rules in `legacy.css` (~68 rules).
- Keep `legacy/SearchableSelect.jsx` only if Settings still imports it; otherwise delete.
- Router: `builds` and `migrations` routes point at the new pages; `legacy/` remains for History and Settings.

---

## 7. Done when

1. Every capability of the legacy Builds and Migrations views works in the new pages.
2. Both pages work at 390px width with no horizontal page scroll.
3. Every run is URL-addressable; links survive refresh and browser back.
4. No `alert/confirm/prompt`; no API failure is only logged to the console.
5. Vitest suite and backend test pass; `vite build` succeeds.
6. Lighthouse "Installable" passes on the deployed site; Dockyard installs on Android Chrome and iOS Safari (Add to Home Screen) and opens standalone.

## 8. Out of scope

- Push notifications, background sync, offline caching of API data, a custom install button.
- History and Settings redesign (Phase 3).
- Backend changes beyond §3.4.
- Server-side run filtering or search.

---

## 9. PWA

### 9.1 Decisions
| Topic | Decision |
|---|---|
| Tooling | `vite-plugin-pwa` (Workbox `generateSW`), `registerType: 'prompt'`. |
| What is cached | Precache the built app shell only (JS, CSS, HTML, icons, fonts). **No runtime caching of `/api`, `/ws` or `/build-info.json`** — this is a live ops dashboard; stale container or build data is worse than none. |
| Navigation | `navigateFallback: '/index.html'`, `navigateFallbackDenylist: [/^\/api\//, /^\/ws\//]`. |
| Updates | When a new service worker is waiting, a persistent toast "A new version of Dockyard is available" with **Reload** (activates it and reloads). No silent auto-reload mid-deploy. |
| Offline | App shell still opens. A banner at the top of the main area: "You're offline — data can't refresh." driven by `navigator.onLine` + `online`/`offline` events. Queries keep showing their last data. |
| Manifest | `name: Dockyard`, `short_name: Dockyard`, `display: standalone`, `start_url: /`, `scope: /`, `theme_color`/`background_color: #0d1117` (matches the icon). |
| Icons | Generated once from `public/favicon.svg` with `@vite-pwa/assets-generator` (minimal-2023 preset): 64, 192, 512, maskable 512, apple-touch 180. PNGs committed to `public/`. |
| iOS | `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style: black-translucent`, `viewport-fit=cover`; app shell pads with `env(safe-area-inset-*)`. |
| Resume | `useRunStream` reconnects automatically when the page becomes visible again and the run hasn't finished (phones drop sockets in the background). |
| Serving | nginx: `sw.js`, `registerSW.js`, `manifest.webmanifest` and `index.html` served with `Cache-Control: no-cache` so updates are picked up; hashed assets keep default caching. |

### 9.2 Components
- `vite.config.js`: `VitePWA({...})` with the manifest and Workbox options above.
- `src/app/PwaUpdater.jsx`: uses `useRegisterSW` from `virtual:pwa-register/react`; shows the update toast. Mounted in `main.jsx` only (keeps tests free of the virtual module).
- `src/app/OfflineBanner.jsx` + `src/lib/useOnline.js`: rendered in `AppLayout` above `<Outlet />`.

### 9.3 Testing
- `useOnline` and `OfflineBanner`: toggling `navigator.onLine` and dispatching `offline`/`online` shows/hides the banner.
- `useRunStream`: `visibilitychange` to visible after an unexpected close opens a new socket; no reconnect after `done`.
- After `vite build`, `dist/` contains `sw.js` and `manifest.webmanifest` (checked with a shell command in the plan, not a unit test — build output isn't available to Vitest).
- Manual: install on Android Chrome and iOS Safari; standalone launch; offline banner with airplane mode; deploy a new build and confirm the Reload toast appears.

---

## 10. Rebuild options (added 2026-09-27)

The run header's **Rebuild** is a menu on finished build runs:
- **Same parameters** — replays the run (existing replay endpoint).
- **Next tag: `<tag>`** — shown when the project has a tag param (string param named/labelled "tag"). Starts a build with the same branch and params, tag bumped: a trailing `-<digits>` counter with 2+ digits or after a dotted version is incremented (keeping zero-padding), otherwise `-01` is appended (`dal-stg-1.0.0-2060`→`-2061`, `dal-stg-01`→`-02`, `dal-stg-1`→`dal-stg-1-01`, `dal-stg`→`dal-stg-01`). The counter continues from the highest loaded tag with the same base, so a tag is never reused.
- **Change parameters…** — opens the New build sheet (`?new=1&from=<num>`) prefilled with that run's branch and params instead of the last-used values.
