# UI Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Namaa DevOps Dashboard UI with a Deep Space Blue aesthetic, persistent sidebar navigation, a multi-view layout (Dashboard + Build), global ⌘K search, and a logs slide-over panel.

**Architecture:** `AppShell` replaces `App.jsx` as the root — it owns all-env container polling and renders either `DashboardView` (per-env container list) or `BuildView` (three-column build panel) based on sidebar navigation. A `CommandPalette` overlay searches across all environments. All inline `style` props are replaced with CSS classes.

**Tech Stack:** React 18, Vite 5, Vitest (added in Task 1 for pure logic tests), CSS custom properties, `createPortal` for overlays.

---

## Key Notes Before Starting

- **Dev server:** `cd frontend && npm run dev` — runs on http://localhost:3000. Keep it open; verify each task visually.
- **Project keys in BuildPanel.jsx** use `backend` and `adminPanel` (matching server-side script names). The spec table uses `irrigation`/`admin` — **ignore the spec table, use `backend`/`adminPanel`** throughout.
- **No backend changes.** All API calls in `api.js` stay exactly as-is.
- **CSS strategy:** Replace all inline `style` props with `className` references. No external CSS framework.
- **Existing files that change name:** `ServerTab.jsx` → `DashboardView.jsx`, `BuildPanel.jsx` → `BuildView.jsx`. Keep the old files until the new ones are wired in, then delete them.

---

## File Map

| Status | File | What changes |
|--------|------|-------------|
| **Create** | `frontend/src/AppShell.jsx` | Root shell; owns polling for all envs, activeView/activeEnv state |
| **Create** | `frontend/src/components/Sidebar.jsx` | Persistent sidebar nav (replaces tab row) |
| **Create** | `frontend/src/components/DashboardView.jsx` | Refactored from `ServerTab.jsx` — receives containers as prop |
| **Create** | `frontend/src/components/BuildView.jsx` | Three-column build page (replaces `BuildPanel.jsx`) |
| **Create** | `frontend/src/components/CommandPalette.jsx` | ⌘K global search overlay |
| **Rewrite** | `frontend/src/index.css` | New Deep Space Blue color system + utility classes |
| **Modify** | `frontend/src/App.jsx` | Becomes a thin wrapper rendering `<AppShell>` |
| **Modify** | `frontend/src/components/TopBar.jsx` | Strip to search bar + refresh only |
| **Modify** | `frontend/src/components/LogsPanel.jsx` | Fullscreen → right slide-over |
| **Modify** | `frontend/src/components/ContainerRow.jsx` | Restyle to single-line, CSS classes |
| **Modify** | `frontend/src/components/StackGroup.jsx` | Restyle, CSS classes |
| **Modify** | `frontend/src/components/BulkActionBar.jsx` | Restyle, CSS classes |
| **Modify** | `frontend/src/components/UpdateTagModal.jsx` | Restyle Modal component + UpdateTagModal |
| **Modify** | `frontend/src/components/EnvPanel.jsx` | Restyle (uses Modal — carries through automatically) |
| **Delete** | `frontend/src/components/ServerTab.jsx` | Replaced by DashboardView |
| **Delete** | `frontend/src/components/BuildPanel.jsx` | Replaced by BuildView |

---

## Task 1: CSS Foundation

**Files:**
- Rewrite: `frontend/src/index.css`

- [ ] **Step 1: Rewrite `index.css`** with the new Deep Space Blue color system and utility classes

```css
/* frontend/src/index.css */
:root {
  --bg:            #0a0e1a;
  --bg-secondary:  #0d1424;
  --bg-panel:      #0d1828;
  --bg-card:       rgba(255,255,255,0.02);
  --bg-input:      rgba(255,255,255,0.04);

  --border:        rgba(99,179,237,0.08);
  --border-accent: rgba(99,179,237,0.15);
  --border-active: #3e82dc;
  --border-managed: rgba(72,187,120,0.3);

  --text:          #cbd5e0;
  --text-muted:    #4a6fa5;
  --text-dim:      #2d4a6e;

  --blue:          #63b3ed;
  --blue-dark:     #3e82dc;
  --green:         #48bb78;
  --red:           #f87171;
  --yellow:        #fbbf24;
  --purple:        #c084fc;
  --orange:        #fb923c;
  --indigo:        #a5b4fc;
}

* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  background: linear-gradient(160deg, var(--bg) 0%, var(--bg-secondary) 100%);
  min-height: 100vh;
  color: var(--text);
  font-family: monospace;
  font-size: 12px;
}

/* ── Layout shell ── */
.app-shell {
  display: flex;
  height: 100vh;
  overflow: hidden;
}

.app-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* ── Sidebar ── */
.sidebar {
  width: 160px;
  flex-shrink: 0;
  background: rgba(0,0,0,0.3);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  padding: 16px 0;
}

.sidebar-logo {
  padding: 0 14px 16px;
  border-bottom: 1px solid rgba(255,255,255,0.05);
  margin-bottom: 16px;
}

.sidebar-logo-name {
  font-size: 13px;
  font-weight: bold;
  letter-spacing: 2px;
  color: var(--blue);
}

.sidebar-logo-sub {
  font-size: 9px;
  color: var(--text-dim);
  letter-spacing: 1px;
  margin-top: 2px;
}

.sidebar-section {
  padding: 0 14px;
  margin-bottom: 4px;
}

.sidebar-label {
  font-size: 9px;
  color: var(--text-dim);
  letter-spacing: 2px;
  margin-bottom: 8px;
  text-transform: uppercase;
}

.sidebar-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-radius: 5px;
  color: var(--text-dim);
  cursor: pointer;
  font-size: 11px;
  border: none;
  background: transparent;
  width: 100%;
  text-align: left;
}

.sidebar-item:hover {
  background: rgba(99,179,237,0.06);
  color: var(--text-muted);
}

.sidebar-item.active {
  background: rgba(62,130,220,0.15);
  border-left: 2px solid var(--border-active);
  color: var(--blue);
  padding-left: 6px;
}

.sidebar-divider {
  border-top: 1px solid rgba(255,255,255,0.05);
  margin: 12px 0;
}

.sidebar-footer {
  margin-top: auto;
  padding: 12px 14px;
  border-top: 1px solid rgba(255,255,255,0.05);
  font-size: 9px;
  color: var(--text-dim);
}

.status-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  flex-shrink: 0;
}

.status-dot.running  { background: var(--green); box-shadow: 0 0 5px rgba(72,187,120,0.8); }
.status-dot.stopped  { background: var(--red);   box-shadow: 0 0 5px rgba(248,113,113,0.6); }
.status-dot.loading  { background: #334155; }
.status-dot.unknown  { background: #334155; }

/* ── Top bar ── */
.topbar {
  height: 44px;
  flex-shrink: 0;
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  padding: 0 16px;
  gap: 12px;
  background: rgba(0,0,0,0.15);
}

.topbar-search {
  flex: 1;
  max-width: 380px;
  background: var(--bg-input);
  border: 1px solid var(--border-accent);
  border-radius: 6px;
  padding: 5px 10px;
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  color: var(--text-dim);
  font-size: 10px;
}

.topbar-search:hover { border-color: rgba(99,179,237,0.25); }

.topbar-right {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 10px;
}

/* ── Buttons ── */
button { cursor: pointer; font-family: monospace; }

.btn {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text-muted);
  padding: 3px 8px;
  border-radius: 3px;
  font-size: 10px;
}

.btn:hover { border-color: var(--border-accent); color: var(--text); }
.btn:disabled { opacity: 0.4; cursor: not-allowed; }

.btn-primary {
  background: rgba(62,130,220,0.12);
  border: 1px solid rgba(99,179,237,0.2);
  color: var(--blue);
  padding: 4px 12px;
  border-radius: 4px;
  font-size: 10px;
}

.btn-primary:hover { background: rgba(62,130,220,0.2); }

.btn-action {
  background: transparent;
  border: none;
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 9px;
  opacity: 0.7;
}

.btn-action:hover { opacity: 1; background: rgba(255,255,255,0.05); }
.btn-action:disabled { opacity: 0.3; cursor: not-allowed; }

/* ── Inputs ── */
input, select, textarea {
  font-family: monospace;
  background: var(--bg-input);
  color: var(--text);
  border: 1px solid var(--border-accent);
  border-radius: 3px;
  padding: 5px 8px;
  font-size: 11px;
}

input:focus, select:focus, textarea:focus {
  outline: none;
  border-color: var(--border-active);
}

/* ── Dashboard view ── */
.dashboard-statusbar {
  padding: 6px 16px;
  background: rgba(0,0,0,0.15);
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  font-size: 11px;
}

.dashboard-content {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px;
}

/* ── Stack group ── */
.stack-group {
  margin-bottom: 16px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 6px;
  overflow: hidden;
}

.stack-header {
  padding: 7px 12px;
  background: rgba(99,179,237,0.04);
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.stack-name {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: var(--text-muted);
}

.stack-count {
  font-size: 9px;
  color: var(--text-dim);
}

/* ── Container row ── */
.container-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-bottom: 1px solid rgba(99,179,237,0.03);
}

.container-row:last-child { border-bottom: none; }

.container-row:hover { background: rgba(99,179,237,0.02); }

.container-row.managed {
  border-left: 2px solid var(--border-managed);
}

.container-row.unmanaged {
  opacity: 0.5;
}

.container-status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.container-status-dot.running { background: var(--green); box-shadow: 0 0 6px rgba(72,187,120,0.7); }
.container-status-dot.stopped { background: var(--red);   box-shadow: 0 0 6px rgba(248,113,113,0.6); }

.container-name {
  min-width: 140px;
  flex: 1;
  font-size: 11px;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.container-image {
  width: 120px;
  flex-shrink: 0;
  font-size: 10px;
  color: var(--text-dim);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.container-note {
  flex: 1;
  max-width: 180px;
  font-size: 10px;
  color: var(--text-muted);
  background: transparent;
  border: none;
  border-bottom: 1px solid transparent;
  padding: 2px 4px;
  border-radius: 0;
}

.container-note:focus {
  border-bottom-color: var(--border-accent);
  outline: none;
}

.container-actions {
  display: flex;
  gap: 3px;
  flex-shrink: 0;
}

/* ── Bulk action bar ── */
.bulk-bar {
  padding: 7px 16px;
  background: rgba(62,130,220,0.06);
  border-bottom: 1px solid rgba(99,179,237,0.1);
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 11px;
}

.bulk-results {
  width: 100%;
  margin-top: 4px;
  font-size: 10px;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

/* ── Modals ── */
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.7);
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal-box {
  background: var(--bg-panel);
  border: 1px solid var(--border-accent);
  border-radius: 8px;
  padding: 20px;
  min-width: 400px;
  max-width: 600px;
  width: 90%;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.modal-title {
  font-size: 12px;
  color: var(--blue);
  letter-spacing: 0.5px;
}

.modal-close {
  background: transparent;
  border: none;
  color: var(--text-dim);
  font-size: 14px;
  cursor: pointer;
  padding: 2px 6px;
}

.modal-close:hover { color: var(--text); }

/* ── Logs slide-over ── */
.logs-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.4);
  z-index: 199;
}

.logs-panel {
  position: fixed;
  right: 0;
  top: 0;
  bottom: 0;
  width: 45%;
  background: var(--bg-panel);
  border-left: 1px solid var(--border-accent);
  z-index: 200;
  display: flex;
  flex-direction: column;
  transform: translateX(100%);
  transition: transform 0.2s ease-out;
  box-shadow: -20px 0 40px rgba(0,0,0,0.5);
}

.logs-panel.open { transform: translateX(0); }

.logs-header {
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
  background: rgba(0,0,0,0.2);
}

.logs-body {
  flex: 1;
  overflow-y: auto;
  padding: 10px 12px;
  font-size: 10px;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-all;
}

.log-line { color: var(--text-muted); }
.log-line.error { color: var(--red); }
.log-line.highlight { background: rgba(72,187,120,0.12); }

/* ── Build view ── */
.build-view {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.build-projects {
  width: 140px;
  flex-shrink: 0;
  border-right: 1px solid var(--border);
  padding: 16px 0;
  background: rgba(0,0,0,0.1);
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}

.build-project-item {
  padding: 8px 12px;
  cursor: pointer;
  font-size: 11px;
  color: var(--text-dim);
  border: none;
  background: transparent;
  width: 100%;
  text-align: left;
  border-right: 2px solid transparent;
}

.build-project-item:hover { color: var(--text-muted); background: rgba(255,255,255,0.02); }

.build-project-item.active {
  color: var(--blue);
  background: rgba(62,130,220,0.1);
  border-right-color: var(--border-active);
}

.build-recent {
  margin-top: auto;
  padding: 12px;
  border-top: 1px solid var(--border);
}

.build-recent-label {
  font-size: 9px;
  color: var(--text-dim);
  letter-spacing: 2px;
  text-transform: uppercase;
  margin-bottom: 8px;
}

.build-recent-entry {
  font-size: 9px;
  color: var(--text-dim);
  line-height: 1.8;
  margin-bottom: 4px;
}

.build-form {
  flex: 1;
  padding: 16px;
  overflow-y: auto;
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.build-form-title {
  font-size: 13px;
  color: var(--blue);
  letter-spacing: 1px;
}

.build-form-subtitle {
  font-size: 9px;
  color: var(--text-dim);
  margin-top: 2px;
}

.form-field { display: flex; flex-direction: column; gap: 5px; }

.form-label {
  font-size: 9px;
  color: var(--text-muted);
  letter-spacing: 1px;
  text-transform: uppercase;
}

.pill-group { display: flex; gap: 5px; flex-wrap: wrap; }

.pill {
  padding: 4px 12px;
  border-radius: 4px;
  font-size: 10px;
  border: 1px solid var(--border);
  color: var(--text-dim);
  background: transparent;
  cursor: pointer;
  font-family: monospace;
}

.pill.active {
  background: rgba(62,130,220,0.15);
  border-color: var(--border-active);
  color: var(--blue);
}

.toggle-row {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  font-size: 11px;
  color: var(--text-muted);
  user-select: none;
}

.toggle-track {
  width: 32px;
  height: 16px;
  border-radius: 8px;
  position: relative;
  background: rgba(255,255,255,0.08);
  border: 1px solid var(--border);
  transition: all 0.2s;
}

.toggle-track.on {
  background: rgba(62,130,220,0.25);
  border-color: rgba(99,179,237,0.4);
}

.toggle-thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #4b5563;
  transition: left 0.2s, background 0.2s;
}

.toggle-track.on .toggle-thumb { left: 18px; background: var(--blue); }

.command-preview {
  background: rgba(0,0,0,0.3);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 8px 10px;
  font-size: 10px;
}

.command-preview-label {
  font-size: 9px;
  color: var(--text-dim);
  letter-spacing: 1px;
  text-transform: uppercase;
  margin-bottom: 4px;
}

.command-preview-text { color: var(--text-muted); }

.btn-build {
  padding: 9px 0;
  background: linear-gradient(90deg, rgba(62,130,220,0.3), rgba(99,179,237,0.2));
  border: 1px solid rgba(99,179,237,0.3);
  border-radius: 5px;
  color: var(--blue);
  font-size: 12px;
  font-family: monospace;
  letter-spacing: 1px;
  cursor: pointer;
  width: 100%;
}

.btn-build:hover { background: linear-gradient(90deg, rgba(62,130,220,0.4), rgba(99,179,237,0.3)); }
.btn-build:disabled { opacity: 0.4; cursor: not-allowed; }

.build-output {
  flex: 1.2;
  padding: 16px;
  display: flex;
  flex-direction: column;
  background: rgba(0,0,0,0.2);
  overflow: hidden;
}

.build-output-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
  font-size: 9px;
  color: var(--text-muted);
  letter-spacing: 2px;
  text-transform: uppercase;
}

.build-output-terminal {
  flex: 1;
  background: rgba(0,0,0,0.4);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 10px;
  overflow-y: auto;
  font-size: 10px;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-all;
  color: var(--text-muted);
}

/* ── Command palette ── */
.palette-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.6);
  z-index: 9990;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 80px;
  backdrop-filter: blur(2px);
}

.palette-box {
  background: var(--bg-panel);
  border: 1px solid rgba(99,179,237,0.2);
  border-radius: 8px;
  width: 520px;
  max-width: 90vw;
  box-shadow: 0 20px 60px rgba(0,0,0,0.6);
  overflow: hidden;
}

.palette-input-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border);
}

.palette-input {
  flex: 1;
  background: transparent;
  border: none;
  color: var(--blue);
  font-size: 13px;
  font-family: monospace;
  outline: none;
  padding: 0;
}

.palette-hint { font-size: 9px; color: var(--text-dim); }

.palette-results { padding: 6px 0; max-height: 320px; overflow-y: auto; }

.palette-section-label {
  padding: 3px 14px;
  font-size: 9px;
  color: var(--text-dim);
  letter-spacing: 2px;
  text-transform: uppercase;
  margin-bottom: 2px;
  margin-top: 4px;
}

.palette-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 14px;
  cursor: pointer;
  font-size: 11px;
}

.palette-item:hover,
.palette-item.focused {
  background: rgba(99,179,237,0.08);
  border-left: 2px solid var(--border-active);
  padding-left: 12px;
}

.palette-item-name { flex: 1; color: var(--text); }
.palette-item-sub  { font-size: 9px; color: var(--text-dim); }

.palette-env-badge {
  font-size: 9px;
  padding: 2px 6px;
  border-radius: 3px;
  background: rgba(62,130,220,0.1);
  color: var(--text-muted);
}

.palette-env-badge.prod { background: rgba(248,113,113,0.1); color: var(--red); }

.palette-footer {
  padding: 6px 14px;
  border-top: 1px solid var(--border);
  display: flex;
  gap: 14px;
  font-size: 9px;
  color: var(--text-dim);
}

/* ── Searchable select (BuildView) ── */
.searchable-select { position: relative; }

.searchable-select-input {
  width: 100%;
  background: var(--bg-input);
  border: 1px solid var(--border-accent);
  border-radius: 4px;
  padding: 6px 10px;
  color: var(--text);
  font-size: 11px;
  font-family: monospace;
}

.searchable-select-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0; right: 0;
  z-index: 20;
  background: var(--bg-panel);
  border: 1px solid var(--border-accent);
  border-radius: 4px;
  max-height: 200px;
  overflow-y: auto;
  box-shadow: 0 8px 24px rgba(0,0,0,0.5);
}

.searchable-select-option {
  padding: 6px 10px;
  cursor: pointer;
  font-size: 11px;
  font-family: monospace;
  color: var(--text-muted);
}

.searchable-select-option:hover { background: rgba(255,255,255,0.04); }
.searchable-select-option.selected { color: var(--blue); background: rgba(62,130,220,0.1); border-left: 2px solid var(--blue); padding-left: 8px; }
```

- [ ] **Step 2: Start dev server and verify page still loads**

```bash
cd frontend && npm run dev
```

Open http://localhost:3000. The page should still render (old colors, but no crash).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/index.css
git commit -m "style: replace color system with Deep Space Blue CSS variables"
```

---

## Task 2: Vitest Setup + Pure Logic Tests

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/vite.config.js`
- Create: `frontend/src/__tests__/appShell.test.js`
- Create: `frontend/src/__tests__/commandPalette.test.js`

This task adds test infrastructure and tests for the two pure functions that will be written in later tasks. Write the tests first; they will fail until the implementation tasks complete.

- [ ] **Step 1: Install Vitest**

```bash
cd frontend && npm install --save-dev vitest @vitest/ui
```

- [ ] **Step 2: Add test script to `package.json`**

```json
"scripts": {
  "dev": "vite --port 3000",
  "build": "vite build",
  "preview": "vite preview",
  "test": "vitest run",
  "test:watch": "vitest"
}
```

- [ ] **Step 3: Add test config to `vite.config.js`**

Read the current `vite.config.js` first. Then add `test: { environment: 'node' }` inside `defineConfig`:

```js
// vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: { environment: 'node' },
})
```

- [ ] **Step 4: Write the `computeEnvStatuses` test**

```js
// frontend/src/__tests__/appShell.test.js
import { describe, it, expect } from 'vitest'
import { computeEnvStatuses } from '../AppShell'

describe('computeEnvStatuses', () => {
  it('returns loading when containers is null and no error', () => {
    expect(computeEnvStatuses({ dev: null }, { dev: false })).toEqual({ dev: 'loading' })
  })

  it('returns unknown when fetch errored', () => {
    expect(computeEnvStatuses({ dev: null }, { dev: true })).toEqual({ dev: 'unknown' })
  })

  it('returns healthy when all containers running', () => {
    const containers = [{ status: 'running' }, { status: 'running' }]
    expect(computeEnvStatuses({ dev: containers }, { dev: false })).toEqual({ dev: 'healthy' })
  })

  it('returns degraded when any container stopped', () => {
    const containers = [{ status: 'running' }, { status: 'stopped' }]
    expect(computeEnvStatuses({ dev: containers }, { dev: false })).toEqual({ dev: 'degraded' })
  })

  it('handles multiple envs independently', () => {
    const result = computeEnvStatuses(
      { dev: [{ status: 'running' }], prod: null },
      { dev: false, prod: false }
    )
    expect(result).toEqual({ dev: 'healthy', prod: 'loading' })
  })
})
```

- [ ] **Step 5: Write the `filterContainers` test**

```js
// frontend/src/__tests__/commandPalette.test.js
import { describe, it, expect } from 'vitest'
import { filterContainers } from '../components/CommandPalette'

const makeContainer = (name, env, status = 'running') => ({ name, env, status, stack: 'irrigation' })

describe('filterContainers', () => {
  const allContainers = [
    makeContainer('api-gateway', 'dev'),
    makeContainer('sensor-service', 'dev'),
    makeContainer('api-gateway', 'prod', 'stopped'),
  ]

  it('returns empty array for empty query', () => {
    expect(filterContainers(allContainers, '')).toEqual([])
  })

  it('matches by container name substring', () => {
    const result = filterContainers(allContainers, 'api')
    expect(result).toHaveLength(2)
    expect(result.map(r => r.env)).toContain('dev')
    expect(result.map(r => r.env)).toContain('prod')
  })

  it('is case-insensitive', () => {
    expect(filterContainers(allContainers, 'SENSOR')).toHaveLength(1)
  })

  it('returns empty when no match', () => {
    expect(filterContainers(allContainers, 'xyz')).toHaveLength(0)
  })
})
```

- [ ] **Step 6: Run tests — expect failure (functions don't exist yet)**

```bash
cd frontend && npm test
```

Expected: FAIL — `Cannot find module '../AppShell'` and `Cannot find module '../components/CommandPalette'`. This is correct — tests are written before implementation.

- [ ] **Step 7: Commit**

```bash
git add frontend/package.json frontend/vite.config.js frontend/src/__tests__/
git commit -m "test: add vitest + pure logic tests for AppShell and CommandPalette"
```

---

## Task 3: AppShell

**Files:**
- Create: `frontend/src/AppShell.jsx`

`AppShell` is the new root component. It owns all-env polling, `activeView`/`activeEnv` state, and renders Sidebar + TopBar + active view.

- [ ] **Step 1: Create `frontend/src/AppShell.jsx`**

```jsx
import React, { useState, useEffect, useCallback } from 'react';
import { fetchContainers } from './api';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import DashboardView from './components/DashboardView';
import BuildView from './components/BuildView';
import CommandPalette from './components/CommandPalette';

const ENVS = ['dev', 'test', 'stage', 'prod'];
const POLL_MS = 30000;

export function computeEnvStatuses(containersByEnv, fetchErrorByEnv) {
  const result = {};
  for (const env of Object.keys(containersByEnv)) {
    const containers = containersByEnv[env];
    const hasError = fetchErrorByEnv[env];
    if (hasError) { result[env] = 'unknown'; continue; }
    if (containers === null) { result[env] = 'loading'; continue; }
    const allRunning = containers.every(c => c.status === 'running');
    result[env] = allRunning ? 'healthy' : 'degraded';
  }
  return result;
}

export default function AppShell() {
  const [activeEnv, setActiveEnv] = useState('dev');
  const [activeView, setActiveView] = useState('dashboard');
  const [paletteOpen, setPaletteOpen] = useState(false);

  const [containersByEnv, setContainersByEnv] = useState(
    Object.fromEntries(ENVS.map(e => [e, null]))
  );
  const [fetchErrorByEnv, setFetchErrorByEnv] = useState(
    Object.fromEntries(ENVS.map(e => [e, false]))
  );

  const loadEnv = useCallback(async (env) => {
    try {
      const result = await fetchContainers(env);
      // fetchContainers returns { stacks: [...] }
      // Flatten all containers from all stacks for the palette + status
      const allContainers = result.stacks?.flatMap(s =>
        s.containers.map(c => ({ ...c, stack: s.name, stackPath: s.path }))
      ) || [];
      setContainersByEnv(prev => ({ ...prev, [env]: allContainers }));
      setFetchErrorByEnv(prev => ({ ...prev, [env]: false }));
    } catch {
      setFetchErrorByEnv(prev => ({ ...prev, [env]: true }));
    }
  }, []);

  // Also store full stacks data separately so DashboardView can render grouped
  const [stacksByEnv, setStacksByEnv] = useState(
    Object.fromEntries(ENVS.map(e => [e, null]))
  );
  const [lastRefreshByEnv, setLastRefreshByEnv] = useState(
    Object.fromEntries(ENVS.map(e => [e, null]))
  );

  const loadEnvFull = useCallback(async (env) => {
    try {
      const result = await fetchContainers(env);
      const allContainers = result.stacks?.flatMap(s =>
        s.containers.map(c => ({ ...c, stack: s.name, stackPath: s.path }))
      ) || [];
      setContainersByEnv(prev => ({ ...prev, [env]: allContainers }));
      setStacksByEnv(prev => ({ ...prev, [env]: result.stacks || [] }));
      setLastRefreshByEnv(prev => ({ ...prev, [env]: new Date().toLocaleTimeString() }));
      setFetchErrorByEnv(prev => ({ ...prev, [env]: false }));
    } catch {
      setFetchErrorByEnv(prev => ({ ...prev, [env]: true }));
    }
  }, []);

  // Poll all envs on mount; re-poll active env more aggressively
  useEffect(() => {
    ENVS.forEach(env => loadEnvFull(env));
    const interval = setInterval(() => ENVS.forEach(env => loadEnvFull(env)), POLL_MS);
    return () => clearInterval(interval);
  }, [loadEnvFull]);

  // Keyboard shortcut for palette
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setPaletteOpen(o => !o);
      }
      if (e.key === 'Escape') setPaletteOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const envStatuses = computeEnvStatuses(containersByEnv, fetchErrorByEnv);

  const handleEnvChange = (env) => {
    setActiveEnv(env);
    setActiveView('dashboard');
  };

  const handleRefresh = useCallback((env) => loadEnvFull(env), [loadEnvFull]);

  return (
    <div className="app-shell">
      <Sidebar
        activeEnv={activeEnv}
        activeView={activeView}
        onEnvChange={handleEnvChange}
        onViewChange={setActiveView}
        envStatuses={envStatuses}
      />
      <div className="app-main">
        <TopBar
          onSearchClick={() => setPaletteOpen(true)}
          lastRefresh={lastRefreshByEnv[activeEnv]}
          onRefresh={() => handleRefresh(activeEnv)}
        />
        {activeView === 'dashboard' && (
          <DashboardView
            env={activeEnv}
            stacks={stacksByEnv[activeEnv]}
            fetchError={fetchErrorByEnv[activeEnv]}
            lastRefresh={lastRefreshByEnv[activeEnv]}
            onRefresh={() => handleRefresh(activeEnv)}
          />
        )}
        {activeView === 'build' && <BuildView />}
      </div>
      {paletteOpen && (
        <CommandPalette
          containersByEnv={containersByEnv}
          onEnvChange={handleEnvChange}
          onViewChange={setActiveView}
          onClose={() => setPaletteOpen(false)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Update `frontend/src/App.jsx` to render `AppShell`**

Replace the entire file content:

```jsx
import React from 'react';
import AppShell from './AppShell';

export default function App() {
  return <AppShell />;
}
```

- [ ] **Step 3: Check the test for `computeEnvStatuses` passes**

```bash
cd frontend && npm test -- --reporter=verbose 2>&1 | head -30
```

The `appShell.test.js` tests should now pass. The `commandPalette.test.js` tests will still fail (CommandPalette not yet created).

- [ ] **Step 4: Verify dev server renders (it will look broken — Sidebar/DashboardView/BuildView/CommandPalette not yet created)**

```bash
cd frontend && npm run dev
```

The page will error in the browser console because the imports don't exist yet. This is expected — we're building bottom-up. The key check is: no Vite compile error, only runtime errors from missing components.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/AppShell.jsx frontend/src/App.jsx
git commit -m "feat: add AppShell with all-env polling and view routing"
```

---

## Task 4: Sidebar

**Files:**
- Create: `frontend/src/components/Sidebar.jsx`

- [ ] **Step 1: Create `frontend/src/components/Sidebar.jsx`**

```jsx
import React from 'react';

export default function Sidebar({ activeEnv, activeView, onEnvChange, onViewChange, envStatuses }) {
  const envs = ['dev', 'test', 'stage', 'prod'];

  const totalConnected = Object.values(envStatuses).filter(s => s !== 'loading' && s !== 'unknown').length;
  const allHealthy = Object.values(envStatuses).every(s => s === 'healthy');

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="sidebar-logo-name">NAMAA</div>
        <div className="sidebar-logo-sub">DEVOPS</div>
      </div>

      <div className="sidebar-section">
        <div className="sidebar-label">Environments</div>
        {envs.map(env => (
          <button
            key={env}
            className={`sidebar-item ${activeView === 'dashboard' && activeEnv === env ? 'active' : ''}`}
            onClick={() => onEnvChange(env)}
          >
            <span className={`status-dot ${envStatuses[env] || 'loading'}`} />
            {env.toUpperCase()}
          </button>
        ))}
      </div>

      <div className="sidebar-divider" />

      <div className="sidebar-section">
        <div className="sidebar-label">Tools</div>
        <button
          className={`sidebar-item ${activeView === 'build' ? 'active' : ''}`}
          onClick={() => onViewChange('build')}
        >
          &gt;&gt; Build
        </button>
      </div>

      <div className="sidebar-footer">
        <div>{totalConnected} envs connected</div>
        <div style={{ color: allHealthy ? 'var(--green)' : 'var(--red)', marginTop: 3 }}>
          {allHealthy ? '● all healthy' : '● issues detected'}
        </div>
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: Verify dev server — sidebar should appear on the left**

Open http://localhost:3000. You should see the NAMAA DEVOPS sidebar with ENV items and a Build tool item. The main content area will still error until DashboardView is created.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/Sidebar.jsx
git commit -m "feat: add Sidebar component with env nav and tools section"
```

---

## Task 5: TopBar

**Files:**
- Modify: `frontend/src/components/TopBar.jsx`

Strip the TopBar down to search bar + refresh controls. The Build button is gone (Build is in the sidebar now).

- [ ] **Step 1: Rewrite `frontend/src/components/TopBar.jsx`**

```jsx
import React from 'react';

export default function TopBar({ onSearchClick, lastRefresh, onRefresh }) {
  return (
    <div className="topbar">
      <div className="topbar-search" onClick={onSearchClick}>
        <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>⌘</span>
        <span>Search containers, stacks...</span>
        <span style={{ marginLeft: 'auto', fontSize: 9, background: 'rgba(99,179,237,0.08)', padding: '1px 5px', borderRadius: 3, color: 'var(--text-dim)' }}>K</span>
      </div>
      <div className="topbar-right">
        {lastRefresh && <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>Refreshed {lastRefresh}</span>}
        <button className="btn-primary" onClick={onRefresh}>↻ Refresh</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify dev server — top bar should show search bar and refresh button**

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/TopBar.jsx
git commit -m "feat: strip TopBar to search bar + refresh only"
```

---

## Task 6: DashboardView

**Files:**
- Create: `frontend/src/components/DashboardView.jsx`

Refactored from `ServerTab.jsx`. Receives data as props; does not fetch.

- [ ] **Step 1: Create `frontend/src/components/DashboardView.jsx`**

```jsx
import React, { useState } from 'react';
import { whitelistIp } from '../api';
import StackGroup from './StackGroup';
import BulkActionBar from './BulkActionBar';

export default function DashboardView({ env, stacks, fetchError, lastRefresh, onRefresh }) {
  const [selected, setSelected] = useState(new Set());

  const isAwsEnv = ['stage', 'prod'].includes(env);
  const allContainers = stacks?.flatMap(s => s.containers) || [];
  const runningCount = allContainers.filter(c => c.status === 'running').length;
  const stoppedCount = allContainers.filter(c => c.status !== 'running').length;
  const selectedContainers = allContainers.filter(c => selected.has(c.name) && c.managed);

  const toggleSelect = (name) => setSelected(prev => {
    const next = new Set(prev);
    next.has(name) ? next.delete(name) : next.add(name);
    return next;
  });

  const errorHint = fetchError
    ? (isAwsEnv ? 'Connection failed — try whitelisting your IP first' : 'Connection failed — check FortiClient VPN')
    : null;

  return (
    <>
      <div className="dashboard-statusbar">
        {!stacks && !fetchError && <span style={{ color: 'var(--text-dim)' }}>Connecting…</span>}
        {fetchError && <span style={{ color: 'var(--red)', fontSize: 11 }}>⚠ {errorHint}</span>}
        {stacks && !fetchError && (
          <>
            <span style={{ color: 'var(--green)', fontSize: 11 }}>● Connected</span>
            <span style={{ color: 'var(--border)' }}>|</span>
            <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{runningCount} running · {stoppedCount} stopped</span>
            {lastRefresh && <span style={{ color: 'var(--text-dim)', fontSize: 10 }}>Refreshed {lastRefresh}</span>}
          </>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          {isAwsEnv && <WhitelistButton env={env} onSuccess={onRefresh} />}
        </div>
      </div>

      {selected.size > 0 && (
        <BulkActionBar
          env={env}
          selected={selectedContainers}
          onClear={() => setSelected(new Set())}
          onDone={onRefresh}
        />
      )}

      <div className="dashboard-content">
        {stacks?.map((stack, idx) => (
          <StackGroup
            key={stack.path}
            env={env}
            stack={stack}
            stackIdx={idx}
            selected={selected}
            onToggle={toggleSelect}
            onRefresh={onRefresh}
          />
        ))}
      </div>
    </>
  );
}

function WhitelistButton({ env, onSuccess }) {
  const [running, setRunning] = useState(false);
  const [output, setOutput] = useState('');
  const [show, setShow] = useState(false);

  const run = async () => {
    setRunning(true); setOutput(''); setShow(true);
    await whitelistIp(env, (chunk) => setOutput(o => o + chunk), (code) => {
      setRunning(false);
      if (code === 0) setTimeout(onSuccess, 4000);
    });
  };

  return (
    <>
      <button onClick={run} disabled={running} className="btn" style={{ color: 'var(--purple)', fontSize: 10 }}>
        {running ? 'Whitelisting…' : '>> Whitelist My IP'}
      </button>
      {show && (
        <div className="modal-backdrop">
          <div className="modal-box">
            <pre style={{ overflow: 'auto', maxHeight: '50vh', color: 'var(--green)', fontSize: 11 }}>{output}</pre>
            {!running && (
              <button onClick={() => setShow(false)} className="btn" style={{ marginTop: 10 }}>Close</button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2: Verify dev server — the dashboard should render (will look unstyled until StackGroup/ContainerRow are updated)**

The container list should appear. The layout (sidebar + topbar + content) should be visible.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/DashboardView.jsx
git commit -m "feat: add DashboardView (refactored from ServerTab, receives data as props)"
```

---

## Task 7: StackGroup

**Files:**
- Modify: `frontend/src/components/StackGroup.jsx`

- [ ] **Step 1: Rewrite `frontend/src/components/StackGroup.jsx`**

```jsx
import React, { useState } from 'react';
import ContainerRow from './ContainerRow';
import AddServicePanel from './AddServicePanel';

export default function StackGroup({ env, stack, stackIdx, selected, onToggle, onRefresh }) {
  const [addOpen, setAddOpen] = useState(false);

  const runningCount = stack.containers.filter(c => c.status === 'running').length;

  return (
    <div className="stack-group">
      <div className="stack-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="stack-name">{stack.name}</span>
          <span className="stack-count">{stack.containers.length} containers · {runningCount} running</span>
        </div>
        <button
          className="btn"
          style={{ fontSize: 10, color: 'var(--blue)' }}
          onClick={() => setAddOpen(true)}
        >
          + Add Service
        </button>
      </div>
      <div>
        {stack.containers.map(c => (
          <ContainerRow
            key={c.name}
            env={env}
            container={c}
            stackPath={stack.path}
            checked={selected.has(c.name)}
            onToggle={() => onToggle(c.name)}
            onRefresh={onRefresh}
          />
        ))}
      </div>
      {addOpen && (
        <AddServicePanel
          env={env}
          stackIdx={stackIdx}
          stackPath={stack.path}
          existingServices={stack.containers}
          onClose={() => setAddOpen(false)}
          onDone={onRefresh}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify stacks render with the new card style**

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/StackGroup.jsx
git commit -m "style: restyle StackGroup with card layout and container count"
```

---

## Task 8: ContainerRow

**Files:**
- Modify: `frontend/src/components/ContainerRow.jsx`

- [ ] **Step 1: Rewrite `frontend/src/components/ContainerRow.jsx`**

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

  const imageTag = image?.split(':').pop() || '';
  const imageBase = image?.split(':')[0]?.split('/').pop() || '';

  const containerId = name.replace(/^\//, '');

  return (
    <div
      id={containerId}
      className={`container-row ${managed ? 'managed' : 'unmanaged'}`}
    >
      {managed
        ? <input type="checkbox" checked={checked} onChange={onToggle} style={{ flexShrink: 0 }} />
        : <span style={{ width: 16 }} />}

      <span className={`container-status-dot ${status === 'running' ? 'running' : 'stopped'}`} />

      <span className="container-name" title={name}>{name}</span>

      <span className="container-image" title={image}>
        {imageBase}:<b style={{ color: status === 'running' ? 'var(--green)' : 'var(--red)' }}>{imageTag}</b>
      </span>

      <input
        className="container-note"
        value={localNote}
        onChange={e => setLocalNote(e.target.value)}
        onBlur={() => saveNote(env, name, localNote)}
        placeholder="notes…"
      />

      <div className="container-actions">
        {managed && <>
          <ActionBtn color="var(--green)"  title="Update image tag"              onClick={() => setTagOpen(true)}                        disabled={busy}>Tag</ActionBtn>
          <ActionBtn color="var(--blue)"   title="View / edit env vars"           onClick={() => setEnvOpen(true)}                        disabled={busy}>Env</ActionBtn>
          <ActionBtn color="var(--yellow)" title="Restart container"             onClick={() => act('restart')}                          disabled={busy}>↻</ActionBtn>
          <ActionBtn color="var(--indigo)" title="docker compose up -d"          onClick={() => act('up')}                               disabled={busy}>▶</ActionBtn>
          <ActionBtn color="var(--orange)" title="Force recreate"               onClick={() => act('up', { forceRecreate: true })}       disabled={busy}>⚡</ActionBtn>
        </>}
        {!managed && (
          <ActionBtn color="var(--blue)" title="View env vars (read-only)" onClick={() => setEnvOpen(true)} disabled={busy}>Env</ActionBtn>
        )}
        <ActionBtn color="var(--purple)" title="View live logs" onClick={() => setLogsOpen(true)} disabled={busy}>Logs</ActionBtn>
      </div>

      {logsOpen && <LogsPanel env={env} container={name} onClose={() => setLogsOpen(false)} />}
      {envOpen  && <EnvPanel  env={env} container={container} stackPath={stackPath} onClose={() => setEnvOpen(false)}  onDone={onRefresh} />}
      {tagOpen  && <UpdateTagModal env={env} container={container} stackPath={stackPath} onClose={() => setTagOpen(false)} onDone={onRefresh} />}
    </div>
  );
}

function ActionBtn({ color, title, onClick, disabled, children }) {
  return (
    <button
      className="btn-action"
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{ color }}
    >
      {children}
    </button>
  );
}
```

- [ ] **Step 2: Verify container rows render as single lines with the new style**

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/ContainerRow.jsx
git commit -m "style: restyle ContainerRow to single-line dense layout"
```

---

## Task 9: BulkActionBar

**Files:**
- Modify: `frontend/src/components/BulkActionBar.jsx`

- [ ] **Step 1: Rewrite `frontend/src/components/BulkActionBar.jsx`**

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
    <div className="bulk-bar">
      <span style={{ color: 'var(--blue)', fontWeight: 'bold' }}>{selected.length} selected</span>
      <span style={{ color: 'var(--border)' }}>|</span>
      <button className="btn-action" style={{ color: 'var(--yellow)' }} onClick={() => runBulk('restart')} disabled={busy}>↻ Restart All</button>
      <button className="btn-action" style={{ color: 'var(--indigo)' }} onClick={() => runBulk('up')} disabled={busy}>▶ Up All</button>
      <button className="btn-action" style={{ color: 'var(--orange)' }} onClick={() => runBulk('up', { forceRecreate: true })} disabled={busy}>⚡ Force Recreate All</button>
      <button className="btn-action" style={{ color: 'var(--green)' }} onClick={() => setShowTagInput(t => !t)} disabled={busy}>Set Tag</button>
      {showTagInput && (
        <>
          <input value={bulkTag} onChange={e => setBulkTag(e.target.value)} placeholder="new-tag" style={{ width: 140 }} />
          <button className="btn-primary" onClick={() => runBulk('update-tag', { newTag: bulkTag })} disabled={busy || !bulkTag}>Apply</button>
        </>
      )}
      <button className="btn-action" style={{ color: 'var(--red)', marginLeft: 'auto' }} onClick={onClear}>✕ Clear</button>
      {results.length > 0 && (
        <div className="bulk-results">
          {results.map(r => (
            <span key={r.name} style={{ color: r.status === 'done' ? 'var(--green)' : r.status === 'failed' ? 'var(--red)' : 'var(--text-dim)' }}>
              {r.name}: {r.status === 'done' ? '✓' : r.status === 'failed' ? `✗ ${r.error}` : '…'}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Select some containers, verify the bulk bar appears with the new style**

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/BulkActionBar.jsx
git commit -m "style: restyle BulkActionBar with Deep Space Blue theme"
```

---

## Task 10: Modal + UpdateTagModal + EnvPanel

**Files:**
- Modify: `frontend/src/components/UpdateTagModal.jsx`
- Modify: `frontend/src/components/EnvPanel.jsx`

Restyling the `Modal` component in `UpdateTagModal.jsx` automatically updates `EnvPanel` and `AddServicePanel` since they import `Modal` from the same file.

- [ ] **Step 1: Rewrite `frontend/src/components/UpdateTagModal.jsx`**

```jsx
import React, { useState } from 'react';
import { createPortal } from 'react-dom';
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
        stackPath, serviceName: container.name, newTag: tag.trim(), note,
      });
      onDone(); onClose();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  return (
    <Modal title={`Update Tag — ${container.name}`} onClose={onClose}>
      <div className="form-field" style={{ marginBottom: 10 }}>
        <label className="form-label">New image tag</label>
        <input value={tag} onChange={e => setTag(e.target.value)} style={{ width: '100%' }} />
      </div>
      <div className="form-field" style={{ marginBottom: 14 }}>
        <label className="form-label">Notes (branch / release)</label>
        <input value={note} onChange={e => setNote(e.target.value)} style={{ width: '100%' }} />
      </div>
      {error && <div style={{ color: 'var(--red)', marginBottom: 10, fontSize: 11 }}>{error}</div>}
      <button
        onClick={submit}
        disabled={busy}
        className="btn-primary"
        style={{ padding: '6px 20px' }}
      >
        {busy ? 'Deploying…' : 'Deploy ↗'}
      </button>
    </Modal>
  );
}

export function Modal({ title, onClose, children }) {
  return createPortal(
    <div className="modal-backdrop">
      <div className="modal-box">
        <div className="modal-header">
          <span className="modal-title">{title}</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}
```

- [ ] **Step 2: Verify Tag modal and Env modal open with new Deep Space Blue style**

Click "Tag" on a container, then "Env". Both should show the restyled modal.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/UpdateTagModal.jsx frontend/src/components/EnvPanel.jsx
git commit -m "style: restyle Modal, UpdateTagModal, and EnvPanel"
```

---

## Task 11: LogsPanel Slide-Over

**Files:**
- Modify: `frontend/src/components/LogsPanel.jsx`

Convert from fullscreen overlay to a right slide-over using the `.logs-panel` CSS class defined in Task 1.

- [ ] **Step 1: Rewrite `frontend/src/components/LogsPanel.jsx`**

```jsx
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export default function LogsPanel({ env, container, onClose }) {
  const [lines, setLines] = useState([]);
  const [search, setSearch] = useState('');
  const [disconnected, setDisconnected] = useState(false);
  const [open, setOpen] = useState(false);
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
    // Trigger open animation on next frame
    requestAnimationFrame(() => setOpen(true));
    return () => wsRef.current?.close();
  }, []);

  const filtered = search
    ? lines.filter(l => l.toLowerCase().includes(search.toLowerCase()))
    : lines;

  return createPortal(
    <>
      <div className="logs-backdrop" onClick={onClose} />
      <div className={`logs-panel ${open ? 'open' : ''}`}>
        <div className="logs-header">
          <span style={{ color: 'var(--purple)', flexShrink: 0 }}>Logs</span>
          <span style={{ color: 'var(--text)', flex: 1 }}>{container}</span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search…"
            style={{ width: 160, fontSize: 10 }}
          />
          {disconnected && (
            <>
              <span style={{ color: 'var(--red)', fontSize: 10 }}>Disconnected</span>
              <button onClick={connect} className="btn" style={{ color: 'var(--green)', fontSize: 10 }}>Reconnect</button>
            </>
          )}
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="logs-body">
          {filtered.map((line, i) => (
            <div
              key={i}
              className={`log-line ${line.toLowerCase().includes('error') ? 'error' : ''} ${search && line.toLowerCase().includes(search.toLowerCase()) ? 'highlight' : ''}`}
            >
              {line}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      </div>
    </>,
    document.body
  );
}
```

- [ ] **Step 2: Click Logs on a container — verify the slide-over appears from the right, container list visible behind it**

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/LogsPanel.jsx
git commit -m "feat: convert LogsPanel from fullscreen to right slide-over"
```

---

## Task 12: BuildView

**Files:**
- Create: `frontend/src/components/BuildView.jsx`

Three-column layout: project picker | form | terminal output. Form state preserved per-project. Uses `SearchableSelect` component extracted from old `BuildPanel.jsx`.

- [ ] **Step 1: Create `frontend/src/components/BuildView.jsx`**

```jsx
import React, { useState, useEffect, useRef } from 'react';
import { fetchBranches, startBuild, cloneRepo } from '../api';

const PROJECTS = [
  { key: 'frontend',   label: 'Frontend',          script: 'frontend-build.sh' },
  { key: 'backend',    label: 'Irrigation Backend', script: 'backend-build.sh' },
  { key: 'geoserver',  label: 'Geoserver',          script: 'geoserver-build.sh' },
  { key: 'adminPanel', label: 'Admin Panel',        script: 'admin-panel-build.sh' },
];

const BACKEND_MODULES = ['apis', 'sensors_readings', 'events', 'weather_forecast', 'partitioning'];

const RECENT_KEY = 'namaa_build_recent';

const ENV_OPTIONS = {
  frontend:   ['dev', 'aws'],
  backend:    ['dev', 'test', 'stage', 'prod'],
  geoserver:  ['dev', 'aws'],
  adminPanel: ['dev', 'aws'],
};

const DEFAULT_FORM = {
  frontend:   { branch: '', tag: '', env: 'dev', incrementBeta: false },
  backend:    { branch: '', tag: '', env: 'dev', allModules: false, modules: [], version: '', runMvn: true, releaseType: '' },
  geoserver:  { branch: '', tag: '', env: 'dev' },
  adminPanel: { branch: '', tag: '', env: 'dev', incrementBeta: false, service: 'all' },
};

function loadRecent() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY)) || {}; } catch { return {}; }
}

function saveRecent(projectKey, branch, tag) {
  const recent = loadRecent();
  recent[projectKey] = { branch, tag };
  localStorage.setItem(RECENT_KEY, JSON.stringify(recent));
}

export default function BuildView() {
  const [activeProject, setActiveProject] = useState('frontend');
  const [formStates, setFormStates] = useState(DEFAULT_FORM);
  const [branches, setBranches] = useState([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [needsClone, setNeedsClone] = useState(false);
  const [cloning, setCloning] = useState(false);
  const [output, setOutput] = useState('');
  const [building, setBuilding] = useState(false);
  const [exitCode, setExitCode] = useState(null);
  const [recent, setRecent] = useState(loadRecent);
  const outputRef = useRef(null);

  const form = formStates[activeProject];

  const setField = (key, value) => {
    setFormStates(prev => ({
      ...prev,
      [activeProject]: { ...prev[activeProject], [key]: value },
    }));
  };

  const loadBranches = () => {
    setLoadingBranches(true); setNeedsClone(false);
    fetchBranches(activeProject)
      .then(r => {
        setNeedsClone(!!r.needsClone);
        setBranches(r.branches);
        if (!form.branch) setField('branch', r.branches[0] || '');
      })
      .catch(() => {})
      .finally(() => setLoadingBranches(false));
  };

  useEffect(() => { loadBranches(); }, [activeProject]);

  useEffect(() => {
    if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight;
  }, [output]);

  const buildArgs = () => {
    const f = form;
    switch (activeProject) {
      case 'frontend':   { const a=['-e',f.env]; if(f.tag) a.push('-t',f.tag); if(f.incrementBeta) a.push('-i'); return a; }
      case 'backend':    { const a=['-e',f.env]; if(f.tag) a.push('-t',f.tag);
                          if(f.allModules) a.push('-a'); else f.modules.forEach(m=>a.push('-m',m));
                          if(f.version) a.push('-v',f.version); if(f.runMvn) a.push('-s');
                          if(f.releaseType) a.push('-x',f.releaseType); return a; }
      case 'geoserver':  { const a=['-e',f.env]; if(f.tag) a.push('-t',f.tag); return a; }
      case 'adminPanel': { const a=['-e',f.env,'-s',f.service]; if(f.tag) a.push('-t',f.tag); if(f.incrementBeta) a.push('-i'); return a; }
      default: return [];
    }
  };

  const proj = PROJECTS.find(p => p.key === activeProject);
  const commandPreview = form.branch && form.tag ? `bash scripts/${proj.script} ${buildArgs().join(' ')}` : null;
  const canBuild = !building && !cloning && !needsClone && form.branch && form.tag;

  const clone = async () => {
    setOutput(''); setExitCode(null); setCloning(true);
    await cloneRepo(activeProject, c => setOutput(o => o + c), code => {
      setCloning(false); setExitCode(code);
      if (code === 0) loadBranches();
    });
  };

  const build = async () => {
    if (!canBuild) return;
    setOutput(''); setExitCode(null); setBuilding(true);
    saveRecent(activeProject, form.branch, form.tag);
    setRecent(loadRecent());
    await startBuild(activeProject, form.branch, buildArgs(), c => setOutput(o => o + c), code => {
      setExitCode(code); setBuilding(false);
    });
  };

  return (
    <div className="build-view">
      {/* Col 1: Project picker */}
      <div className="build-projects">
        <div style={{ padding: '0 12px', marginBottom: 8 }}>
          <div className="build-recent-label">Project</div>
        </div>
        {PROJECTS.map(p => (
          <button
            key={p.key}
            className={`build-project-item ${activeProject === p.key ? 'active' : ''}`}
            onClick={() => setActiveProject(p.key)}
          >
            {p.label}
          </button>
        ))}
        <div className="build-recent">
          <div className="build-recent-label">Recent</div>
          {PROJECTS.map(p => recent[p.key] && (
            <div key={p.key} className="build-recent-entry">
              <div style={{ color: 'var(--text-dim)' }}>{p.label}</div>
              <div style={{ color: 'var(--text-dim)', opacity: 0.6 }}>{recent[p.key].branch} · {recent[p.key].tag}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Col 2: Form */}
      <div className="build-form">
        <div>
          <div className="build-form-title">{proj.label}</div>
          <div className="build-form-subtitle">Build & push a new image</div>
        </div>

        {/* Branch */}
        <div className="form-field">
          <label className="form-label">Branch</label>
          {loadingBranches
            ? <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>Fetching branches…</span>
            : needsClone
              ? <button className="btn-primary" onClick={clone} disabled={cloning}>
                  {cloning ? 'Cloning…' : '>> Clone Repository'}
                </button>
              : <SearchableSelect value={form.branch} options={branches} onChange={v => setField('branch', v)} />
          }
        </div>

        {/* Tag */}
        <div className="form-field">
          <label className="form-label">Tag *</label>
          <input value={form.tag} onChange={e => setField('tag', e.target.value)} placeholder="e.g. 1.4.2-beta.3" style={{ width: '100%' }} />
        </div>

        {/* Environment */}
        <div className="form-field">
          <label className="form-label">Environment</label>
          <div className="pill-group">
            {ENV_OPTIONS[activeProject].map(e => (
              <button key={e} className={`pill ${form.env === e ? 'active' : ''}`} onClick={() => setField('env', e)}>
                {e.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Project-specific options */}
        {(activeProject === 'frontend' || activeProject === 'adminPanel') && (
          <Toggle
            label="Increment beta (-i)"
            value={form.incrementBeta}
            onChange={v => setField('incrementBeta', v)}
          />
        )}
        {activeProject === 'adminPanel' && (
          <div className="form-field">
            <label className="form-label">Service</label>
            <div className="pill-group">
              {['all', 'frontend', 'backend'].map(s => (
                <button key={s} className={`pill ${form.service === s ? 'active' : ''}`} onClick={() => setField('service', s)}>{s}</button>
              ))}
            </div>
          </div>
        )}
        {activeProject === 'backend' && (
          <>
            <div className="form-field">
              <label className="form-label">Modules</label>
              <div className="pill-group" style={{ flexWrap: 'wrap' }}>
                <button className={`pill ${form.allModules ? 'active' : ''}`} onClick={() => setField('allModules', !form.allModules)}>All modules</button>
                {!form.allModules && BACKEND_MODULES.map(m => (
                  <button key={m} className={`pill ${form.modules.includes(m) ? 'active' : ''}`}
                    onClick={() => setField('modules', form.modules.includes(m) ? form.modules.filter(x => x !== m) : [...form.modules, m])}>
                    {m}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div className="form-field">
                <label className="form-label">Version (-v)</label>
                <input value={form.version} onChange={e => setField('version', e.target.value)} placeholder="e.g. 2.1.0" style={{ width: '100%' }} />
              </div>
              <div className="form-field">
                <label className="form-label">Release type (-x)</label>
                <div className="pill-group">
                  {['', 'major', 'minor', 'patch'].map(r => (
                    <button key={r} className={`pill ${form.releaseType === r ? 'active' : ''}`} onClick={() => setField('releaseType', r)}>{r || 'none'}</button>
                  ))}
                </div>
              </div>
            </div>
            <Toggle label="Run mvn clean install (-s)" value={form.runMvn} onChange={v => setField('runMvn', v)} />
          </>
        )}

        {/* Command preview */}
        {commandPreview && (
          <div className="command-preview">
            <div className="command-preview-label">Command</div>
            <div className="command-preview-text">{commandPreview}</div>
          </div>
        )}

        {/* Build button */}
        <button className="btn-build" onClick={build} disabled={!canBuild}>
          {building ? 'Building…' : cloning ? 'Cloning…' : '>> Build & Push'}
        </button>
      </div>

      {/* Col 3: Output */}
      <div className="build-output">
        <div className="build-output-header">
          <span>Output</span>
          {building && <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span className="status-dot running" />
            <span style={{ color: 'var(--green)', letterSpacing: 0 }}>running</span>
          </span>}
        </div>
        <div className="build-output-terminal" ref={outputRef}>
          {output || <span style={{ color: 'var(--text-dim)' }}>Output will appear here…</span>}
          {exitCode !== null && (
            <div style={{ color: exitCode === 0 ? 'var(--green)' : 'var(--red)', fontWeight: 'bold', marginTop: 8 }}>
              {exitCode === 0 ? '✓ Build succeeded' : `✗ Build failed (exit ${exitCode})`}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Toggle({ label, value, onChange }) {
  return (
    <div className="toggle-row" onClick={() => onChange(!value)}>
      <div className={`toggle-track ${value ? 'on' : ''}`}>
        <div className="toggle-thumb" />
      </div>
      <span>{label}</span>
    </div>
  );
}

function SearchableSelect({ value, options, onChange }) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const filtered = options.filter(o => o.toLowerCase().includes(search.toLowerCase()));

  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const select = opt => { onChange(opt); setSearch(''); setOpen(false); };

  return (
    <div className="searchable-select" ref={ref}>
      <input
        className="searchable-select-input"
        value={open ? search : value}
        onChange={e => { setSearch(e.target.value); setOpen(true); }}
        onFocus={() => { setSearch(''); setOpen(true); }}
        placeholder="Search branch…"
      />
      {open && filtered.length > 0 && (
        <div className="searchable-select-dropdown">
          {filtered.map(o => (
            <div key={o} className={`searchable-select-option ${o === value ? 'selected' : ''}`} onMouseDown={() => select(o)}>{o}</div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Click ">> Build" in the sidebar — verify the three-column Build view appears**

Test: select a project, fill in branch + tag, verify command preview updates. Switch to another project and back — verify inputs are preserved.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/BuildView.jsx
git commit -m "feat: add BuildView with three-column layout and per-project state"
```

---

## Task 13: CommandPalette

**Files:**
- Create: `frontend/src/components/CommandPalette.jsx`

- [ ] **Step 1: Create `frontend/src/components/CommandPalette.jsx`**

```jsx
import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export function filterContainers(allContainers, query) {
  if (!query.trim()) return [];
  const q = query.toLowerCase();
  return allContainers.filter(c => c.name.toLowerCase().includes(q));
}

export default function CommandPalette({ containersByEnv, onEnvChange, onViewChange, onClose }) {
  const [query, setQuery] = useState('');
  const [focusedIdx, setFocusedIdx] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  // Flatten all containers across envs with their env tag
  const allContainers = Object.entries(containersByEnv).flatMap(([env, containers]) =>
    (containers || []).map(c => ({ ...c, env }))
  );

  const containerResults = filterContainers(allContainers, query);

  // Action results
  const actionResults = query.toLowerCase().includes('build')
    ? [{ type: 'action', label: 'Go to Build', key: 'build' }]
    : [];

  const allResults = [...containerResults.map(c => ({ type: 'container', ...c })), ...actionResults];

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setFocusedIdx(i => Math.min(i + 1, allResults.length - 1)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setFocusedIdx(i => Math.max(i - 1, 0)); }
    if (e.key === 'Enter' && allResults[focusedIdx]) selectResult(allResults[focusedIdx]);
    if (e.key === 'Escape') onClose();
  };

  const selectResult = (result) => {
    if (result.type === 'container') {
      onEnvChange(result.env);
      onClose();
      const containerId = result.name.replace(/^\//, '');
      setTimeout(() => {
        document.getElementById(containerId)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 50);
    }
    if (result.type === 'action' && result.key === 'build') {
      onViewChange('build');
      onClose();
    }
  };

  return createPortal(
    <div className="palette-backdrop" onClick={onClose}>
      <div className="palette-box" onClick={e => e.stopPropagation()}>
        <div className="palette-input-row">
          <span style={{ color: 'var(--text-dim)', fontSize: 13 }}>⌘</span>
          <input
            ref={inputRef}
            className="palette-input"
            value={query}
            onChange={e => { setQuery(e.target.value); setFocusedIdx(0); }}
            onKeyDown={handleKeyDown}
            placeholder="Search containers..."
          />
          <span className="palette-hint">ESC to close</span>
        </div>

        <div className="palette-results">
          {allResults.length === 0 && query && (
            <div style={{ padding: '12px 14px', color: 'var(--text-dim)', fontSize: 11 }}>No results for "{query}"</div>
          )}
          {containerResults.length > 0 && (
            <>
              <div className="palette-section-label">Containers</div>
              {containerResults.map((c, i) => (
                <div
                  key={`${c.env}-${c.name}`}
                  className={`palette-item ${focusedIdx === i ? 'focused' : ''}`}
                  onClick={() => selectResult({ type: 'container', ...c })}
                >
                  <span className={`container-status-dot ${c.status === 'running' ? 'running' : 'stopped'}`} />
                  <span className="palette-item-name">{c.name}</span>
                  <span className="palette-item-sub">{c.stack}</span>
                  <span className={`palette-env-badge ${c.env === 'prod' ? 'prod' : ''}`}>{c.env.toUpperCase()}</span>
                </div>
              ))}
            </>
          )}
          {actionResults.length > 0 && (
            <>
              <div className="palette-section-label">Actions</div>
              {actionResults.map((a, i) => {
                const idx = containerResults.length + i;
                return (
                  <div
                    key={a.key}
                    className={`palette-item ${focusedIdx === idx ? 'focused' : ''}`}
                    onClick={() => selectResult(a)}
                  >
                    <span style={{ color: 'var(--blue)' }}>&gt;&gt;</span>
                    <span className="palette-item-name">{a.label}</span>
                  </div>
                );
              })}
            </>
          )}
        </div>

        <div className="palette-footer">
          <span>↑↓ navigate</span>
          <span>↵ select</span>
          <span>ESC close</span>
        </div>
      </div>
    </div>,
    document.body
  );
}
```

- [ ] **Step 2: Run all tests — all should now pass**

```bash
cd frontend && npm test
```

Expected: all tests PASS. If `filterContainers` test fails, the function signature doesn't match the test expectations — re-check the export.

- [ ] **Step 3: Verify palette opens with Ctrl+K / Cmd+K and finds containers**

Type a partial container name — results should appear with env badge and status dot. Arrow keys navigate. Enter jumps to that container.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/CommandPalette.jsx
git commit -m "feat: add CommandPalette with cross-env container search and keyboard navigation"
```

---

## Task 14: Cleanup

**Files:**
- Delete: `frontend/src/components/ServerTab.jsx`
- Delete: `frontend/src/components/BuildPanel.jsx`

- [ ] **Step 1: Verify nothing imports the old files**

```bash
grep -r "ServerTab\|BuildPanel" frontend/src/
```

Expected output: no results. If any file still imports them, fix the import first.

- [ ] **Step 2: Delete the old files**

```bash
rm frontend/src/components/ServerTab.jsx
rm frontend/src/components/BuildPanel.jsx
```

- [ ] **Step 3: Run dev server — confirm no errors**

```bash
cd frontend && npm run dev
```

Open http://localhost:3000. Full app should work: sidebar nav, dashboard, build view, ⌘K search, logs slide-over, tag/env modals.

- [ ] **Step 4: Run tests one final time**

```bash
cd frontend && npm test
```

Expected: all PASS.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "chore: remove old ServerTab and BuildPanel, complete UI rebuild"
```

---

## Verification Checklist

After all tasks complete, manually verify:

- [ ] Sidebar shows all 4 environments with live status dots
- [ ] Clicking an env switches the container list
- [ ] Clicking ">> Build" in sidebar shows the three-column build view
- [ ] Switching build projects preserves inputs
- [ ] Build runs and streams output to the right panel
- [ ] ⌘K opens the command palette; typing finds containers; Enter navigates to them
- [ ] Logs button opens a slide-over (not fullscreen); container list visible behind it
- [ ] Tag and Env modals open centered with the new style
- [ ] Bulk action bar appears when containers are selected; actions work
- [ ] "+ Add Service" still works in stack headers
- [ ] Whitelist IP button visible on stage/prod envs
- [ ] All CSS custom properties applied (deep navy background, blue accents, glowing status dots)
