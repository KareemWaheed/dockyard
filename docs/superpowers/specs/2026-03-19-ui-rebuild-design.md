# UI Rebuild Design Spec
**Date:** 2026-03-19
**Status:** Approved

---

## Goal

Completely rebuild the Namaa DevOps Dashboard UI from scratch. The objective is not a visual refresh — it is a production-grade redesign that improves UX clarity, information hierarchy, information density, and introduces a premium "wow factor" aesthetic that is easier on the eyes than the current pure-black monospace interface.

---

## Core Pain Points Being Addressed

1. **Container discoverability** — hard to find a specific container quickly across environments
2. **Build panel** — too many clicks, inputs lost when switching projects, terminal output hijacks the panel, needs a full rethink as a dedicated view (not a modal)
3. **No visual wow factor** — current pure-black monospace aesthetic feels flat and hard on the eyes

---

## Aesthetic Direction: Deep Space Blue

A dark navy base with cool blue accents. Feels like a mission control interface — professional, spacious, focused, and easier on the eyes than the current `#0f1117` pure-black theme.

### Color Palette

```css
--bg:            #0a0e1a   /* Main background — deep navy */
--bg-secondary:  #0d1424   /* Gradient endpoint */
--bg-panel:      #0d1828   /* Panel / sidebar background */
--bg-card:       rgba(255,255,255,0.02)  /* Card surfaces */
--bg-input:      rgba(255,255,255,0.04)  /* Input fields */

--border:        rgba(99,179,237,0.08)   /* Default borders */
--border-accent: rgba(99,179,237,0.15)   /* Input / focused borders */
--border-active: #3e82dc                  /* Active/selected borders */

--text:          #cbd5e0   /* Primary text */
--text-muted:    #4a6fa5   /* Secondary text */
--text-dim:      #2d4a6e   /* Dimmed / placeholder text */

--blue:          #63b3ed   /* Primary accent — cool blue */
--blue-dark:     #3e82dc   /* Active state blue */
--green:         #48bb78   /* Running / success */
--red:           #f87171   /* Stopped / error */
--yellow:        #fbbf24   /* Restart / warning */
--purple:        #c084fc   /* Logs */
--orange:        #fb923c   /* Force recreate */
--indigo:        #a5b4fc   /* Up action */

--glow-green:    0 0 6px rgba(72,187,120,0.7)   /* Running status glow */
--glow-red:      0 0 6px rgba(248,113,113,0.6)  /* Stopped status glow */
--glow-blue:     0 0 8px rgba(99,179,237,0.4)   /* Active element glow */
```

### Typography
- **Font:** Keep monospace throughout (fits DevOps tool context). Use text labels (e.g., `[B]`, `[L]`) instead of emoji for tool icons in the sidebar — emoji rendering is inconsistent in monospace contexts.
- **Body:** 12px (up from 13px — tighter density)
- **Labels:** 9px uppercase with `letter-spacing: 2px`
- **Headings:** 13–14px, `letter-spacing: 1px`, blue accent color

### Background
- Linear gradient: `linear-gradient(160deg, #0a0e1a 0%, #0d1424 100%)` on the main area
- Subtle radial glow behind active panels (optional, low opacity)

---

## Layout: Sidebar + Main Content Area

The current top-tab navigation is replaced by a persistent left sidebar. The main content area changes based on the active view.

### Sidebar (160px fixed width)

```
┌─────────────────┐
│ NAMAA           │  ← logo + wordmark
│ DEVOPS          │
├─────────────────┤
│ ENVIRONMENTS    │  ← section label (9px uppercase)
│ ● DEV  [active] │  ← glowing status dot + env name
│ ● TEST          │
│ ● STAGE         │
│ ● PROD          │
├─────────────────┤
│ TOOLS           │
│ >> Build        │  ← text label, switches to Build view
│ >> Whitelist    │  ← text label, opens Whitelist modal (AWS only)
├─────────────────┤
│ 4 envs connected│  ← bottom status
│ ● all healthy   │
└─────────────────┘
```

- Active environment: blue background tint + left border accent + slightly brighter text
- Status dots glow based on `envStatuses` prop (see type definition below)
- Sidebar background: `rgba(0,0,0,0.3)` over the main gradient, `border-right: 1px solid var(--border)`

#### `envStatuses` Type

```ts
type EnvStatus = 'healthy' | 'degraded' | 'loading' | 'unknown'
// healthy  = all containers running
// degraded = at least one container stopped
// loading  = containers not yet fetched for this env
// unknown  = fetch failed or env not polled yet
```

`envStatuses` is a `Record<string, EnvStatus>` (e.g. `{ dev: 'healthy', prod: 'degraded' }`). It is computed in `AppShell` from the all-env container data (see State Ownership below). Dot color: `healthy` → green glow, `degraded` → red glow, `loading`/`unknown` → dim grey, no glow.

### Top Bar (44px height)

```
[ ⌘  Search containers, stacks...          K ] [ Last refresh: 12s ago ] [ ↻ Refresh ]
```

- Search field: `flex: 1`, max-width 380px, opens ⌘K palette on click or Cmd/Ctrl+K
- Right: refresh timestamp + refresh button
- No other content — keep it clean

---

## State Ownership & Data Fetching

This is the most structurally important change from the current architecture. The current `ServerTab.jsx` owns per-environment container data. The new architecture lifts container data to `AppShell` so that `CommandPalette` can search across all environments simultaneously.

### Container Data in `AppShell`

`AppShell` holds two parallel state maps:
```js
const [containersByEnv, setContainersByEnv] = useState({
  dev: null, test: null, stage: null, prod: null
  // null = not yet fetched; [] = fetched but empty; [...] = fetched
})
const [fetchErrorByEnv, setFetchErrorByEnv] = useState({
  dev: false, test: false, stage: false, prod: false
})
```

`AppShell` runs a polling loop for **all environments** on mount (same interval as current `ServerTab` polling). On success for an env: set `containersByEnv[env] = data` and `fetchErrorByEnv[env] = false`. On failure: set `fetchErrorByEnv[env] = true` (leave `containersByEnv[env]` unchanged so stale data remains visible).

`DashboardView` receives `containers={containersByEnv[activeEnv]}` and renders only the active environment's data. It does not fetch data itself.

`CommandPalette` receives the full `containersByEnv` map to search across all envs.

`AppShell` computes `envStatuses` from both maps:
- `containersByEnv[env] === null && !fetchErrorByEnv[env]` → `'loading'`
- `fetchErrorByEnv[env] === true` → `'unknown'`
- all containers running → `'healthy'`
- any container stopped → `'degraded'`

### `ServerTab.jsx` → `DashboardView.jsx`

`ServerTab.jsx` is **renamed and refactored** into `DashboardView.jsx`. It loses its data-fetching and polling logic (moved to `AppShell`), but retains:
- `selected` container set and `BulkActionBar` management
- Stack group rendering
- Status bar (last refresh time, container counts, Whitelist button)

Props change: instead of `env` (and fetching internally), it receives `env`, `containers`, `onRefresh`.

---

## View 1: Dashboard (Container List)

Active when any environment is selected in the sidebar. Rendered by `DashboardView.jsx`.

### Container Row

Each row is a single line (no wrapping):

```
[checkbox] [●] [container-name          ] [image:tag          ] [notes input...] [Tag] [Env] [↻] [▶] [⚡] [📋]
```

- Status dot: 6px, glows green or red
- Container name: `flex: 1`, min-width 140px, monospace
- Image:tag: fixed `~120px`, muted text, truncated
- Notes input: `flex: 1`, subtle, auto-saves on blur
- Action buttons: small (9–10px), colored text on transparent bg, `border-radius: 3px`, subtle bg on hover
- Managed containers: green left-border accent (`border-left: 2px solid rgba(72,187,120,0.3)`)
- Unmanaged containers: `opacity: 0.5`, no checkbox, no mutating actions

### Stack Group

```
┌─ IRRIGATION ─────────────────── 4 containers · 3 running  [+ Add Service] ─┐
│  [container row]                                                              │
│  [container row]                                                              │
│  [container row]                                                              │
└───────────────────────────────────────────────────────────────────────────────┘
```

- Header: `background: rgba(99,179,237,0.04)`, `border-bottom: 1px solid var(--border)`
- Stack name: 10px uppercase, `color: var(--text-muted)`
- Container count summary in header
- Stack group card: `background: var(--bg-card)`, `border: 1px solid var(--border)`, `border-radius: 6px`

### Bulk Action Bar

Appears above container list when 1+ containers are checked. Same functionality as current but restyled to match new theme.

---

## View 2: Build View

Active when "Build" is clicked in the sidebar. The entire main content area becomes the Build view — no modal, no overlay. Rendered by `BuildView.jsx`.

### Three-Column Layout

```
┌─────────────┬──────────────────────┬───────────────────────────┐
│  PROJECT    │  FORM                │  OUTPUT                   │
│             │                      │                           │
│ Frontend ◀  │  Branch: [main    ▾] │  [09:41:22] Starting...   │
│ Irrigation  │  Tag:    [1.4.3   ] │  [09:41:25] Installing... │
│ Geoserver   │  Env:    dev test.. │  [09:41:48] ✓ Complete    │
│ Admin       │  Options: toggle    │                           │
│             │  Preview: bash ...  │                           │
│ ─────────── │  [BUILD]            │                           │
│ RECENT      │                      │                           │
│ Frontend    │                      │                           │
│ main·1.4.2  │                      │                           │
└─────────────┴──────────────────────┴───────────────────────────┘
```

**Column 1 — Project Picker (140px)**
- Vertical list of project names
- Active project: blue right-border accent, blue text, light bg tint
- "Recent" section below: last branch+tag per project, persisted in `localStorage` under key `namaa_build_recent` as `Record<projectKey, { branch: string, tag: string }>`

**Column 2 — Form**
- Branch: searchable dropdown (existing logic preserved)
- Tag: text input
- Environment pill selector — options vary by project:
  - Frontend, Geoserver, Admin Panel: `['dev', 'aws']`
  - Irrigation Backend: `['dev', 'test', 'stage', 'prod']`
- Project-specific options (toggles, checkboxes, selectors) — same as current but restyled
- Command preview: dark code block showing the bash command
- Build button: blue gradient, full-width, disabled until required fields filled

**Canonical project keys** (used as keys in `formStates` and `namaa_build_recent`):

| Display Name       | Key          |
|--------------------|--------------|
| Frontend           | `frontend`   |
| Irrigation Backend | `irrigation` |
| Geoserver          | `geoserver`  |
| Admin Panel        | `admin`      |

**Form state per project:** Use a `useState` map keyed by the canonical project key:
```js
const [formStates, setFormStates] = useState({
  frontend:   { branch: '', tag: '', env: 'dev', incrementBeta: false },
  irrigation: { branch: '', tag: '', env: 'dev', modules: { all: true, apis: false, ... }, version: '', releaseType: 'none', runMvn: false },
  geoserver:  { branch: '', tag: '', env: 'dev', incrementBeta: false },
  admin:      { branch: '', tag: '', env: 'dev', incrementBeta: false, service: 'all' },
})
```
Switching projects reads from / writes to the relevant key. Inputs are never cleared when switching projects.

**Column 3 — Terminal Output (flex: 1.2)**
- Dark background (`rgba(0,0,0,0.4)`)
- Timestamped log lines, color-coded: info = muted blue, success = green, error = red
- Running indicator (glowing green dot) when build is active
- Auto-scrolls to bottom; same 1000-line buffer as current
- Exit code shown on completion
- Output is **shared** — it shows the output of the most recent build regardless of which project is selected in Column 1

---

## ⌘K Global Search Palette

Triggered by clicking the search bar or pressing Cmd/Ctrl+K. Rendered as a centered overlay with backdrop blur via `createPortal` to `document.body`.

### Behavior
- Input: free-text search
- Results sections: **CONTAINERS** (matched by name, filtered to show env badge), **STACKS**, **ACTIONS** (e.g., "Build Frontend → switch to Build view")
- Each container result shows: status dot, name, stack name, env badge
- Keyboard navigation: ↑↓ to move, Enter to select, ESC or click outside to close

### Navigation on Selection
When a container result is selected:
1. Call `onEnvChange(result.env)` to switch the active environment
2. Close the palette
3. After the next render, scroll to the container row. Container rows must have `id={container.Names[0].replace('/', '')}` (stripping the leading `/`). The palette calls `document.getElementById(containerId)?.scrollIntoView({ behavior: 'smooth', block: 'center' })` in a `setTimeout(fn, 50)` to allow the DOM to settle after the env switch.

When an action result (e.g., "Build Frontend") is selected:
1. Call `onViewChange('build')` to switch to the Build view
2. Close the palette

---

## Logs Slide-Over

Triggered by the logs button on a container row. **Slides in from the right** instead of going fullscreen. Continues to use `createPortal` to `document.body` (same as current).

- CSS: `position: fixed; right: 0; top: 0; bottom: 0; width: 45%; z-index: 200`
- Entry animation: CSS transition `transform: translateX(100%) → translateX(0)` on mount (200ms ease-out)
- Backdrop: `position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 199` (click to close)
- Main content area remains visible (dimmed) behind the backdrop
- Header: container name + search input + reconnect button + close
- Body: same log output as current (WebSocket, 1000-line buffer, error highlighting, search highlighting)
- Closing the slide-over does not disconnect the WebSocket until component unmounts

---

## Env & Tag Modals

No changes to pattern — kept as centered modal overlays. Restyled to match the new color system.

The `Modal` component exported from `UpdateTagModal.jsx` will be restyled as part of the color system update. This automatically carries through to `AddServicePanel.jsx`, which imports and uses that `Modal` component — no changes needed to `AddServicePanel`'s logic.

---

## Component Architecture Changes

### New: `AppShell.jsx`
- Top-level component replacing `App.jsx` as the root
- Holds `activeView: 'dashboard' | 'build'`, `activeEnv: string`, `containersByEnv: Record<string, Container[] | null>`, `fetchErrorByEnv: Record<string, boolean>`
- Runs polling loop for all 4 environments on mount
- Computes and passes `envStatuses` to `Sidebar`
- Renders `<Sidebar>`, `<TopBar>`, and either `<DashboardView>` or `<BuildView>`
- Renders `<CommandPalette>` when open (state: `paletteOpen: boolean`)

### New: `Sidebar.jsx`
- Replaces navigation role of `TopBar.jsx`
- Props: `activeEnv`, `activeView`, `onEnvChange`, `onViewChange`, `envStatuses: Record<string, EnvStatus>`

### New: `DashboardView.jsx` (renamed/refactored from `ServerTab.jsx`)
- Receives `env`, `containers: Container[] | null`, `onRefresh`
- Owns `selected` container set, `BulkActionBar` visibility
- Renders status bar + stack groups
- Does not fetch data
- Calls `api.js` functions directly for container mutations (restart, up, force-recreate, tag update, env vars) — same as current `ServerTab`. No callbacks needed for mutations; modal state (`logsContainer`, `envContainer`, `tagContainer`) is owned locally within `DashboardView`.

### New: `BuildView.jsx` (replaces `BuildPanel.jsx`)
- Three-column layout
- `formStates` map keyed by project key (see above)
- Keeps all existing build/streaming API logic

### New: `CommandPalette.jsx`
- Receives `containersByEnv`, `onEnvChange`, `onViewChange`, `onClose`
- Searches by container name across all envs
- Handles scroll-to-container navigation (see ⌘K section)

### Modified: `LogsPanel.jsx`
- Retain `createPortal` to `document.body`
- Change overlay to right slide-over (`position: fixed; right: 0; top: 0; bottom: 0; width: 45%`)
- Add separate backdrop div (z-index 199) and panel div (z-index 200)
- Add CSS entry animation

### Modified: `ContainerRow.jsx`
- Tighter single-line layout
- Action buttons: tooltip on hover (using `title` attribute)

### Modified: `TopBar.jsx`
- Stripped down to search bar + refresh controls only
- No longer contains Build button or tab navigation

### Preserved (logic only, restyled):
- `EnvPanel.jsx`, `UpdateTagModal.jsx` (+ its exported `Modal`), `AddServicePanel.jsx`, `BulkActionBar.jsx`, `StackGroup.jsx`
- All API calls in `api.js`
- WebSocket logic
- Backend server — zero changes

---

## CSS Strategy

- Replace all inline `style` props with CSS classes in `index.css` using the custom properties defined above
- Use `className` throughout — no inline `style` props in new code
- **Delete all local color constants** in components (e.g., the `C` object in `BuildPanel.jsx`, any other per-component color maps). All colors come exclusively from CSS custom properties in `index.css`.
- Keep no external CSS framework dependency
- Animations via CSS transitions: slide-over entry, palette fade-in, status dot pulse

---

## Out of Scope

- No URL routing (view state managed in React)
- No changes to backend / API / WebSocket protocol
- No new features beyond what is described above
- No changes to `AddServicePanel.jsx` logic (it will be visually updated via the restyled `Modal` component)
