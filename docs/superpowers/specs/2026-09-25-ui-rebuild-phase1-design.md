# UI Rebuild, Phase 1: Foundation + Core Deploy Loop

**Date:** 2026-09-25
**Status:** Draft, pending user review
**Branch:** `feat/ui-rebuild`, fast-forwarded onto `fix/security-hardening` (`a2fe1d8`, which is on top of `feat/caprover-deploy`), worktree `.worktrees/ui-rebuild`

---

## 1. Intent

**What the user said:**
- The current UI feels outdated in every dimension: visual style, navigation/layout, interaction patterns, and the lack of a cross-environment overview. They want a full UI built from scratch.
- The primary user is the owner, a solo power user whose main job is deploying.
- The first screen should answer **"what's deployed where"**.
- Chosen direction: clean light-first SaaS style (C), sidebar + detail drawer layout (A) with shareable URLs and a collapsible activity panel, a smart tag combobox for deploys (B), indigo accent, and the Tailwind + shadcn/ui toolkit.

**Success means:**
- Checking what's deployed across environments, deploying or promoting a tag, and checking its logs all happen on one screen in a few keystrokes.
- Risky actions are harder to trigger than safe ones.
- Nothing the app can do today is lost.

**Assumptions (not stated by the user):**
- A power-user feel is preserved in the light style through keyboard navigation and ⌘K, not through visual density.
- The app stays JavaScript (no TypeScript migration in this phase). React is upgraded 18 → 19 (see §3.1).
- The frontend is the only consumer of the backend API.

**Decomposition:**
- **Phase 1 (this spec):** foundation, Overview, Environment page, container drawer, activity panel, palette.
- **Phase 2:** Builds and Migrations views.
- **Phase 3:** History and Settings views.

Until Phases 2 and 3 land, the current Build, Flyway, History and Settings views render unchanged inside the new shell.

---

## 2. Current-state problems (observed on the live app, STAGE, 29 containers)

- **Unreadable text:** 10–11px low-contrast text; tags are truncated (`stage-r…`).
- **Crowded rows:** 11 controls per managed row, with destructive actions (■ Stop, ⚡ Force recreate) adjacent to and styled like harmless ones.
- **No cross-env view:** the sidebar shows only a status dot per env.
- **Unhelpful errors:** an unreachable env shows only "Connection failed — check FortiClient VPN".
- **Mixed lists:** managed and unmanaged containers are interleaved; unmanaged ones are only dimmed.
- **Browser dialogs:** `alert()`, `window.prompt()` (managed password) and `window.confirm()` are used for errors and confirmation.
- **Hand-rolled data layer:** manual polling state in `AppShell.jsx` (5 parallel `useState` maps).

---

## 3. Architecture

### 3.1 Stack

| Concern | Choice |
|---|---|
| Framework | **React 19** + Vite 5, JavaScript. Current shadcn components pass `ref` as a plain prop (no `forwardRef`), which only works on React 19; on 18, Radix `asChild` triggers lose their refs. No legacy code uses APIs removed in 19. |
| Styling | Tailwind CSS v4 via `@tailwindcss/vite` |
| Components | shadcn/ui (Radix primitives), copied into `src/components/ui/` (JS variant, `tsx: false`) |
| Combobox / palette | `cmdk` (via shadcn `Command`) |
| Toasts | `sonner` |
| Icons | `lucide-react` |
| Routing | `react-router` (v7, data-less `BrowserRouter` usage) |
| Server state | `@tanstack/react-query` |
| Fonts | Inter (UI), JetBrains Mono (tags, logs), self-hosted via `@fontsource` |

A path alias `@/` → `src/` is added to `vite.config.js` (and `jsconfig.json` for editor support).

The production nginx config already falls back to `index.html` for unknown paths (`try_files $uri $uri/ /index.html`), so client routes work without changes.

### 3.2 Routes

```
/                              Overview
/env/:env                      Environment page
/env/:env/:container           Environment page with the drawer open for :container
      ?tab=deploy|logs|env|info|history   (default: deploy)
/?open=:env/:container&tab=…   Overview with the drawer open
/builds  /migrations  /history  /settings   Legacy views inside the new shell
```

- Closing the drawer removes the container segment or `open` param.
- Browser back and forward move between drawer states.

### 3.3 Folder layout (`frontend/src/`)

```
main.jsx                 providers (QueryClient, Router, Theme, Toaster)
app/
  router.jsx             route table
  AppLayout.jsx          sidebar + <Outlet/> + activity panel
  Sidebar.jsx
  ThemeProvider.jsx
components/ui/           shadcn components (button, dialog, alert-dialog, sheet, command,
                         dropdown-menu, tabs, tooltip, popover, badge, input, checkbox,
                         skeleton, switch, scroll-area, table)
features/
  overview/              OverviewPage, OverviewMatrix, buildMatrix.js, drift.js
  env/                   EnvPage, StackTable, BulkBar, EnvHeaderMenu
  container/             ContainerDrawer, DeployTab, TagCombobox, suggestions.js,
                         LogsTab, EnvTab, maskEnv.js, InfoTab, HistoryTab,
                         DangerMenu, confirmPolicy.js
  activity/              ActivityPanel
  palette/               CommandPalette
lib/
  api.js                 existing HTTP helpers, moved (unchanged signatures)
  queries.js             query keys + hooks (useEnvContainers, useServers, …)
  useLogStream.js        WebSocket hook for /ws/logs
legacy/                  BuildView, FlywayView, HistoryView, SettingsView (+ their
                         subcomponents and current CSS), moved unchanged
```

- Old components that the new UI replaces are deleted: `AppShell`, `DashboardView`, `ContainerRow`, `StackGroup`, `BulkActionBar`, `TopBar`, the old `Sidebar`, the old `CommandPalette`, `LogsPanel`, `EnvPanel`, `UpdateTagModal`, `VersionInfoModal` and `AddServicePanel`.
- Their behavior moves into `features/`.

### 3.4 Data flow

- `useServers()` fetches `GET /api/settings/servers` once. It is the source of env keys, their order, and per-env flags (`aws_sg_id`, `maintenance_flag_path`).
- **`useEnvContainers(env)`** calls `GET /api/servers/:env/containers`:
  - `refetchInterval: 30s`, `refetchIntervalInBackground: false`, `retry: 1`.
  - `placeholderData` keeps the previous data during refetch.
  - On error, the last successful data stays readable and is marked stale.
- One hook is called per env and shared by the Overview, the Env page, the drawer and the palette. React Query deduplicates the requests.
- **Mutations** (container actions) invalidate `['containers', env]` on settle.
- Logs use `useLogStream(env, container)` over the existing `/ws/logs` WebSocket.

### 3.5 Legacy views

- `legacy/` views keep their own CSS files. That CSS is imported only by the legacy route components.
- A wrapper `<div className="legacy-scope">` redefines the old CSS variables (`--bg`, `--text`, `--border`, …) in terms of the new theme tokens so the old views don't clash with the new shell.
- Legacy CSS rules that target global selectors are scoped under `.legacy-scope` where needed.

### 3.6 Backend changes (additive, backward compatible)

1. **Container fields.** In `parseBatchInspect` (`backend/services/docker.js`), add to each container:
   - `health`: `State.Health.Status` or `null`
   - `startedAt`: `State.StartedAt`
   - `finishedAt`: `State.FinishedAt`
   - `exitCode`: `State.ExitCode`
   - `restartCount`: `RestartCount`

   No new SSH calls.
2. **`GET /api/deploy-suggestions/:env/:service`** (new route file `routes/suggestions.js`). Returns:
   ```json
   {
     "otherEnvs":   [{ "env": "prod", "tag": "16.3.0-20" }],
     "recentBuilds":[{ "tag": "16.3.1-2", "project": "backend", "buildNumber": 88,
                      "branch": "release/16.3", "finishedAt": "…" }],
     "previous":    [{ "tag": "16.3.0-10", "at": "…" }]
   }
   ```
   - **`otherEnvs`:** the frontend already has this data, so the endpoint returns an empty array here and the frontend fills it in. This keeps the endpoint free of SSH.
   - **`recentBuilds`:** the last 20 successful `build_runs` whose `pushed_images_json` contains an image whose repository (the ref without its tag) equals the container's image repository.
     - The repository is taken from the query param `image` (the frontend passes the container's current image).
     - Limit 10, newest first.
   - **`previous`:** distinct `new_tag`/`old_tag` values from `deploy_history` for `(env, service_name)` where `success = 1`, newest first, limit 10.
     - The current tag is excluded (it is passed as the query param `current`).
3. **Batched env update.** `POST /api/containers/:env/:container/update-env` accepts either:
   - the existing `{ key, value }`, or
   - `{ changes: [{ key, value }, …] }`.

   With `changes`, it applies every change to the compose/.env file(s), runs `up -d` once, and writes one history entry (`action: 'update-env'`). The single-key form behaves exactly as today.

Standalone containers (no `stackPath`) keep their current capabilities: logs and env view only.

---

## 4. Visual system

- **Theme:** light by default. Dark mode maps the same tokens to a neutral charcoal base (`#0f1115`).
  - The initial theme follows `prefers-color-scheme`.
  - A toggle in the sidebar footer persists the choice to `localStorage` (wrapped in try/catch).
- **Accent:** indigo `#3B5BDB` (shadcn `--primary`). Used for primary buttons, the active nav item, focus rings, links and the selected cell outline.
- **Type scale:**

  | Use | Size / weight |
  |---|---|
  | Page title | 20/600 |
  | Section / drawer title | 15/600 |
  | Body and table rows | 13/400 |
  | Secondary text | 12, muted |
  | Minimum anywhere | 11 |

  - Tags use JetBrains Mono 12.5.
  - All text meets 4.5:1 contrast in both themes.
- **Status colors** (text / background pairs, light theme; dark theme uses the equivalent tinted variants):

  | Meaning | Text | Background |
  |---|---|---|
  | Running / healthy / success | `#1F7A45` | `#E8F7EE` |
  | Drift / starting / queued | `#9A5B00` | `#FFF4E0` |
  | Stopped / unhealthy / failed / destructive | `#B42318` | `#FDECEC` |
  | Unmanaged / unknown / stale | `#4A5068` | `#F1F3F7` |

  Status is always shown as dot or icon + word, never by color alone.
- **Density:**
  - Table rows 36px, with a "Compact" toggle (30px) persisted in `localStorage`.
  - Radius 8–10px on panels and 6px on controls.
- **Motion:** the drawer slides in over 150ms. No other decorative animation. Respects `prefers-reduced-motion`.

---

## 5. Screens

### 5.1 Layout shell

- **Sidebar (224px):**
  - "⚓ Dockyard" wordmark.
  - **Overview.**
  - **Environments** section: one item per env in settings order, each with a status dot and a short status label:
    - container count when healthy
    - "N down" when degraded
    - "offline" when unreachable
    - a skeleton while loading
  - **Tools** section: Builds (badge = running + queued build count; hidden when 0), Migrations, History, Settings.
  - **Footer:** theme toggle, deployed build SHA (from `/build-info.json`, as today).
- **Main area:** the routed page.
- **Activity panel (right, 320px, collapsible):**
  - Toggled from a header button and the `a` key.
  - Closed by default; the open/closed state is persisted in `localStorage`.
  - Contents:
    - **Running and queued builds:** project, number, status, elapsed time. Uses the existing `GET /api/builds/projects` and `GET /api/builds/:project/runs?limit=5` for each project.
      - Polled every 30s at all times, because the sidebar Builds badge depends on it.
      - Polled every 10s while the panel is open.
    - **Recent activity:** the last 20 `deploy_history` rows via `GET /api/history?limit=20`, polled every 30s while open.
  - Clicking an activity row opens that container's drawer.
- **Below 768px:**
  - The sidebar becomes a left `Sheet` opened from a header menu button.
  - The activity panel becomes a right `Sheet`.
  - The drawer becomes a full-screen sheet.

### 5.2 Overview (`/`)

- **Header:**
  - "Overview" title.
  - Filter input (`/` focuses it; filters rows by service name).
  - Toggles: **Only differences** and **Show unmanaged**, both off by default and persisted in `localStorage`.
  - Refresh indicator: "⟳ 12s" means seconds since the last successful refresh of all envs; it spins while any env is refetching. Clicking it refetches all envs.
  - Activity toggle.
- **Matrix construction (`buildMatrix.js`, pure):**
  - **Rows:** the union of `serviceName` across all envs' compose-stack containers. Standalone containers are excluded from the Overview.
  - Rows are sorted alphabetically. Unmanaged-only rows are hidden unless "Show unmanaged" is on.
  - A service present in several stacks of the same env shows the first stack's container. A small "+N" marker lists the others in a tooltip.
  - **Columns:** envs in settings order.
  - **Cell states:**

    | State | Rendering |
    |---|---|
    | Present and running | Tag in mono |
    | Present and stopped | Red "● stopped" badge + tag |
    | Unhealthy | Red "● unhealthy" badge + tag |
    | Starting | Amber "● starting" badge + tag |
    | Absent | Muted "not deployed" |
    | Env unreachable | Last known tag, muted, with a "(stale)" suffix; "—" if never loaded this session |

- **Drift (`drift.js`, pure):**
  - A present cell is amber when its tag differs from the tag of the nearest env to its left that has the same service present.
  - The first env column is never amber.
  - "Only differences" shows rows where at least one cell is amber.
- **Promote affordance:**
  - Hovering or focusing an amber cell shows "↑ promote". Activating it opens the drawer on the Deploy tab with the upstream env's tag prefilled.
  - Pressing `p` on a focused amber cell does the same.
- **Unreachable env column header:**
  - Red "unreachable" label with an info popover.
  - The popover holds the error message plus the env's fix actions: **Whitelist my IP** (if `aws_sg_id`) or **Restart FortiVPN** (otherwise).
  - Each action streams its output into the popover, as today.
- **Keyboard:**
  - Arrow keys move the focused cell.
  - Enter or click opens the drawer for that cell's container (the Deploy tab).
  - `l` opens the Logs tab, `p` promotes, `/` filters.
  - Cells are a roving-tabindex grid (`role="grid"`).
- **Empty state:** with no servers configured, a card "Add your first server" links to `/settings`.

### 5.3 Environment page (`/env/:env`)

- **Header:**
  - Env name (title) and a connection badge (connected / connecting / unreachable).
  - Host, running and stopped counts, last refresh.
  - **Maintenance** switch (only if `maintenance_flag_path` is set).
  - A "⋯" `DropdownMenu`: Whitelist my IP (if `aws_sg_id`), Restart FortiVPN (if not `aws_sg_id`), Refresh.
- **Stacks:**
  - One panel per stack. The panel header shows the stack name, container count and a "+ Add service" button (opens a dialog with today's AddServicePanel fields).
  - **Rows:** checkbox (managed only), status dot, name, image tag (mono), health/uptime text, note (truncated, muted).
  - **Health/uptime text:**
    - `healthy · 3d` / `running · 3d` when running (uptime from `startedAt`)
    - `exited (1) · 2h` when stopped (from `exitCode` and `finishedAt`)
    - `restarting ×N` when `restartCount > 0` and the container is running
  - Row click or Enter opens the drawer. Rows have no action buttons.
  - Unmanaged containers collapse into one expandable row: "▸ N unmanaged (a, b, c, …)". Expanded, they render as muted rows that also open the drawer (read-only tabs).
  - A final "Standalone containers" panel lists standalone containers (drawer: Logs and Env only).
- **Bulk bar:**
  - Appears floating at the bottom when one or more rows are checked.
  - Actions: **Restart**, **Pull & recreate**, **Force recreate**, **Set tag…** (popover with the tag combobox, fed by the union of suggestions), **Stop**, **Clear**.
  - Confirmation follows §6.1, applied once for the whole batch.
  - Execution is sequential. A single progress toast updates per container; the final toast lists failures, each with a "Show error".
- **Unreachable env:** the page shows an error state with the message and the same fix actions as the Overview popover, plus Retry.

### 5.4 Container drawer

- **Shell:**
  - A right `Sheet`, 440px, resizable by dragging its left edge (320–800px, width persisted).
  - On desktop it sits beside the page content (the page narrows) rather than covering it, so every environment column stays visible and clickable. On small screens it is a full-screen sheet.
  - Clicking outside does not close it. Clicking another cell or row switches it to that container. It closes only via Esc or ✕.
  - A deploy tag can be prefilled via a `tag` URL param (used by "↑ promote").
  - Esc closes it. The URL reflects env, container and tab (§3.2).
- **Header:**
  - Service name (title); env and stack name (subtitle).
  - Status chips: state, current tag (mono), health, uptime, restart count.
  - An editable note (inline input, saved on blur or Enter via the existing note endpoint).
  - A close button.
- **Tabs:** Deploy · Logs · Env · Build info (only when `hasVersionInfo`) · History.
  - Unmanaged containers show: Logs, Env (read-only), Build info, History, plus a "Manage…" button.
- **Deploy tab (managed only):**
  - **`TagCombobox`** (cmdk), opened focused. The input is free text. Suggestions are grouped and de-duplicated by tag, first occurrence wins, in this group order:
    1. **Other environments:** `{tag} · on PROD` (from the React Query cache, reachable envs only; excludes the current tag)
    2. **Recent builds:** `{tag} · #88 · release/16.3 · 2h` (from `recentBuilds`)
    3. **Previously on {ENV}:** `{tag} · 4d ago` (from `previous`)
  - Typing filters all groups. Enter with a highlighted suggestion selects it; Enter on free text uses the text.
  - **Preview line:** `current → selected` (mono).
  - **Primary button:** "Deploy to {ENV}". Calls the existing `update-tag` endpoint, with the note unchanged.
  - **Below the button:** secondary buttons **Restart** and **Pull & recreate**, and a **More ▾** `DropdownMenu` containing **Force recreate**, **Stop** (or **Start** when stopped), and **Unmanage** (stack containers only).
- **Logs tab:**
  - Streams via `useLogStream`. The buffer holds 5,000 lines (oldest dropped).
  - Auto-follow while at the bottom; scrolling up pauses it, and a "Jump to latest" pill resumes.
  - Search input highlights matches; "matches only" is a toggle.
  - Wrap toggle. Download button (the current buffer as `{container}-{timestamp}.log`).
  - Expand button: widens the drawer to full width minus the sidebar.
  - Disconnect shows an inline banner with Reconnect.
- **Env tab:**
  - A table of KEY / value.
  - Values whose key matches `/PASS|SECRET|TOKEN|KEY|PWD|CREDENTIAL/i` are masked (`••••••`) with a per-row reveal toggle.
  - Managed containers: each value is editable inline, and "+ Add variable" appends a row.
    - Edited and added rows are marked as pending.
    - A sticky footer shows "Apply N changes" and "Discard".
    - Apply calls `update-env` with `changes` (§3.6.3), then invalidates.
  - Unmanaged: read-only.
- **Build info tab:** the current VersionInfoModal content (curated fields + raw key/values), fetched on tab open.
- **History tab:** `GET /api/history/:env?container=…&limit=50`, as a compact list: time ago, action, `old → new`, success or failure, duration. Failed rows expand to show the error.

### 5.5 Command palette (⌘K / Ctrl+K)

- cmdk dialog with these groups:
  - **Containers:** every container across envs as `service · ENV · tag`; selecting opens its drawer.
  - **Environments.**
  - **Pages:** Overview, Builds, Migrations, History, Settings.
  - **Actions:**
    - Toggle theme
    - Toggle activity panel
    - Refresh all
    - "Deploy {service} to {env}…", generated for the focused service/cell when on the Overview; opens the drawer's Deploy tab.

---

## 6. Behavior

### 6.1 Confirmation policy (`confirmPolicy.js`, pure)

`confirmPolicy(action, env)` returns `none | confirm | typed`. The PROD rules apply to env keys matching `/^prod/i`.

| Action | Non-PROD | PROD |
|---|---|---|
| deploy (update-tag), restart, pull-recreate, up/start, update-env | `none` | `confirm` |
| stop, force-recreate, maintenance ON, unmanage | `confirm` | `typed` |
| maintenance OFF, manage | `confirm` | `confirm` |

- **`confirm`:**
  - An `AlertDialog` that states the effect, e.g. "Stop frontend on stage? The container will be stopped until you start it again."
  - Deploy dialogs show `old → new`.
  - Enter confirms and Esc cancels.
  - The destructive variant uses the red button style.
- **`typed`:** the same dialog plus an input. The confirm button enables only when the typed text equals the env key.
- **Manage / Unmanage** additionally require the managed password: a password input in the dialog replaces `window.prompt`.
- `alert()`, `confirm()` and `prompt()` are removed from the codebase, legacy views excepted.

### 6.2 In-flight operations

- While a mutation for `(env, container)` is pending:
  - its Overview cell and Env-page row show a spinner and the target ("deploying 16.3.0-20…", "restarting…");
  - that container's drawer actions are disabled.
- The drawer can be closed; the mutation continues.
- **Success toast:** "{service} on {ENV} → {tag}" (or "restarted", etc.).
  - Deploy success toasts include **Undo**, which re-runs `update-tag` with the previous tag. The confirmation policy still applies.
- **Failure toast:** persistent until dismissed, with **Show details** expanding the full error message.
- The history list picks up the new row on the next refetch.

### 6.3 Loading, refresh and errors

- **First load per env:** skeleton rows (Overview cells, Env-page rows, sidebar labels).
- **Background refetch:** keeps the current data and shows only the header refresh indicator.
- **Refetch failure:**
  - The env is marked unreachable (sidebar, Overview column, Env page) while its last data stays visible as stale.
  - React Query retries once and then waits for the next interval.
  - The other envs are unaffected.
- Failures of mutations or one-off fetches (build info, suggestions) show inline in the tab plus a toast. Suggestions failing just omits those groups.

### 6.4 Persistence (per browser, `localStorage` with try/catch; the app works without it)

theme, compact density, "only differences", "show unmanaged", activity panel open, drawer width.

---

## 7. Testing

- **Frontend unit tests (Vitest, existing):**
  - `buildMatrix`: union of services, multi-stack "+N", unmanaged filtering.
  - `drift`: nearest-left comparison, absent envs skipped, first column never drifts.
  - `suggestions`: grouping order, de-duplication, current-tag exclusion.
  - `confirmPolicy`: full table in §6.1.
  - `maskEnv`: key patterns.
- **Frontend component tests:** add `@testing-library/react`, `@testing-library/user-event` and `jsdom`.
  - Clicking a matrix cell opens the drawer and updates the URL.
  - Picking a suggestion and deploying calls `update-tag` with the right body.
  - A PROD stop requires typing `prod`.
  - Undo on the success toast re-deploys the old tag.
- **Backend tests (plain Node `assert`, matching the existing style):**
  - `parseBatchInspect` returns `health`, `startedAt`, `finishedAt`, `exitCode` and `restartCount`.
  - `deploy-suggestions`:
    - matches builds by image repository
    - excludes the current tag
    - de-duplicates `previous`
    - limits results
  - `update-env`:
    - `changes` applies all changes and runs one `up`
    - the single-key form is unchanged
    - validation from `fix/security-hardening` still applies once merged
- **Manual verification before completion:**
  - Run the dev server against the real config and click through Overview, the Env pages, every drawer tab and the palette. Read-only: no container actions against real envs.
  - Check light and dark themes and 375px width.
  - Check that the legacy Builds, Flyway, History and Settings views still work inside the shell.

---

## 8. Acceptance criteria

1. The Overview shows every env's services, with drift highlighting, stale/unreachable handling and the promote affordance as specified.
2. Every container action available today can be reached from the drawer or the bulk bar. Table rows have no action buttons.
3. Deploying from the tag combobox works for all four sources (other env, build, previous tag, free text), and Undo works.
4. No `alert()`, `confirm()` or `prompt()` remain outside `legacy/`.
5. Builds, Flyway, History and Settings are reachable and behave as before.
6. Every page and drawer state has a URL; back and forward work.
7. All frontend and backend tests pass.

## 9. Out of scope (this phase)

- Redesigning Builds and Migrations (Phase 2) and History and Settings (Phase 3).
- TypeScript migration.
- Authentication (Cloudflare Access covers production).
- Registry-based tag browsing, container resource stats, compose diff/backup.

## 10. Merge notes

- `feat/ui-rebuild` is built on top of `fix/security-hardening`, because §3.6 edits `backend/routes/containers.js` and `backend/server.js`, which that commit also changes.
- The batched `update-env` therefore runs behind the stack/service validation middleware.
- If the security branch is not merged first, the UI PR will contain the security commit.
- Batched `update-env` also validates each key against `^[A-Za-z_][A-Za-z0-9_]*$` and rejects values containing newlines.
- Spec and plan files are not committed (user preference).
