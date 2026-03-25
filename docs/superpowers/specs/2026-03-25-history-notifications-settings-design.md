# Design: Deployment History, Notifications, and Settings UI

**Date:** 2026-03-25
**Status:** Approved (rev 2)

## Overview

Three interconnected features that move the Namaa DevOps dashboard toward a shippable product:

1. **Deployment History** — persistent log of every container action with outcome, duration, and context
2. **Notifications** — email (SMTP) and generic webhook alerts on deploy success/failure
3. **Settings UI** — in-app management of servers, SSH credentials, notification config, GitLab, and AWS

All three share a common foundation: **SQLite** (via `better-sqlite3`) replacing `config.json` as the primary data store.

---

## Section 1: Data Layer

### Storage

**`better-sqlite3`** — synchronous API, zero-config, single file, fits the existing codebase style.

DB file location: `data/dashboard.db` (configurable via `DB_PATH` env var). On first run, the existing `config.json` is auto-migrated into SQLite and renamed to `config.json.bak`.

### Schema

```sql
-- Servers and their SSH connection details
CREATE TABLE servers (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  env_key            TEXT NOT NULL UNIQUE,   -- "dev", "stage", "prod"
  name               TEXT NOT NULL,
  host               TEXT NOT NULL,
  ssh_username       TEXT NOT NULL,
  ssh_password       TEXT,                   -- plain password auth (nullable)
  ssh_key_path       TEXT,                   -- file path on dashboard host (nullable)
  ssh_key_content    TEXT,                   -- base64-encoded key content (nullable)
  ssh_passphrase     TEXT,                   -- passphrase for key (nullable)
  docker_compose_cmd TEXT DEFAULT 'docker compose'
  -- Auth priority: ssh_key_content > ssh_key_path > ssh_password
  -- Exactly one auth method should be non-null per row
);

-- Compose stacks per server (one server can have multiple)
CREATE TABLE compose_stacks (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  server_id INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  name      TEXT NOT NULL,   -- human-readable, e.g. "Main", "Admin Panel"
  path      TEXT NOT NULL    -- absolute path on remote server
);

-- Append-only deploy history
CREATE TABLE deploy_history (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp      TEXT NOT NULL,           -- ISO 8601
  env            TEXT NOT NULL,
  container_name TEXT NOT NULL,
  service_name   TEXT NOT NULL,
  stack_path     TEXT NOT NULL,
  stack_name     TEXT NOT NULL,           -- denormalized display name, e.g. "Main"
  action         TEXT NOT NULL,
  -- action values: "update-tag" | "update-env" | "restart" | "up" |
  --                "force-recreate" | "stop"
  -- Note: "force-recreate" is the action value when the "up" route is called
  --       with forceRecreate=true in the request body; plain "up" otherwise.
  old_tag        TEXT,                    -- null for non-tag actions
  new_tag        TEXT,                    -- null for non-tag actions
  triggered_by   TEXT DEFAULT 'manual',  -- hardcoded in v1; becomes user id when auth is added
  success        INTEGER NOT NULL,        -- 1 | 0
  error_message  TEXT,
  duration_ms    INTEGER,
  note_snapshot  TEXT
);

-- Notification channels (email or webhook)
CREATE TABLE notifications (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  type        TEXT NOT NULL,              -- "email" | "webhook"
  label       TEXT NOT NULL,
  config_json TEXT NOT NULL,             -- SMTP fields or { url, headers }
  enabled     INTEGER DEFAULT 1,
  envs_json   TEXT                       -- JSON array of env keys, null = all envs
);

-- Freeform app config (gitlab, aws sg, projects, etc.)
-- Fixed keys used in this app:
--   "gitlab"   → { token, baseUrl, projects: { name: repoPath, ... } }
--   "awsSg"    → { region, groupId }
--   "projects" → [ { name, repo, buildScript }, ... ]
CREATE TABLE app_config (
  key        TEXT PRIMARY KEY,
  value_json TEXT NOT NULL
);
```

### Migration

`backend/db.js` initializes the database and handles migration. **It must be the first thing loaded in `server.js`**, before any routes that depend on config:

```js
// server.js — new startup order
const db = require('./db');   // 1. init SQLite, run migration if needed
// ... routes follow
```

`db.js` on startup:
1. Creates the DB and tables if they don't exist (idempotent `CREATE TABLE IF NOT EXISTS`)
2. If `config.json` exists and `servers` table is empty: migrate all config into SQLite:
   - Each entry in `config.servers` → one `servers` row + one or more `compose_stacks` rows
   - Auth fields mapped: `ssh.password` → `ssh_password`, `ssh.privateKeyPath` → `ssh_key_path`, `ssh.passphrase` → `ssh_passphrase`
   - `config.awsSg` → `app_config` row with key `"awsSg"`
   - `config.gitlab` → `app_config` row with key `"gitlab"`
   - `config.projects` → `app_config` row with key `"projects"`
   - Rename `config.json` → `config.json.bak`
3. Export a `db` singleton used by all routes and services

**`config.js` is replaced** by direct SQLite reads in the routes that currently call `loadConfig()`. The old `loadConfig()` / `validateConfig()` pattern is removed. `server.js` no longer calls `loadConfig()` at startup — the DB init serves that role and exits on error if the DB cannot be opened.

**`notes.json` is intentionally left as-is in v1.** `notes.js` continues to read/write the flat file unchanged. Migration of notes to SQLite is deferred.

---

## Section 2: Deployment History

### Backend

**`backend/services/history.js`** — thin wrapper around SQLite writes:
```js
writeHistory({ env, containerName, serviceName, stackPath, stackName, action,
               oldTag, newTag, success, errorMessage, durationMs, noteSnapshot })
```

Every action route in `backend/routes/containers.js` is wrapped to:
- Record `startTime = Date.now()` before the SSH command
- Determine `action` string: routes `restart`, `stop`, `update-tag`, `update-env` map directly; the `up` route uses `forceRecreate ? 'force-recreate' : 'up'`
- Fetch `noteSnapshot` via `getNote(env, containerName)` from `notes.js` at the time of the action (captures the current note text; empty string if no note is set)
- On success: call `writeHistory({ ..., success: true, durationMs: Date.now() - startTime, noteSnapshot })`
- On failure (catch block): call `writeHistory({ ..., success: false, errorMessage: err.message, noteSnapshot })` then re-throw

**New routes** in `backend/routes/history.js`:
- `GET /api/history/:env` — history for one environment; query params: `container` (filter), `limit` (default 100), `offset` (default 0)
- `GET /api/history` — history across all environments (same params minus env filter); returns last 100 by default

Both return rows ordered by `timestamp DESC`.

### Frontend

New **History** view, added to the sidebar nav.

Layout: filter bar (environment tabs including "All" + container name search input) above a table:

| Time | Env | Container | Action | Tag change | Status | Duration |
|------|-----|-----------|--------|------------|--------|----------|
| 5m ago | stage | frontend | update-tag | stage-reports → demo-reports-vite | ✓ | 12s |
| 1h ago | stage | backend | restart | — | ✓ | 3s |
| 2h ago | prod | backend-sso | update-tag | stage-14.0.0 → stage-14.0.1 | ✗ | — |

- "All" tab uses `GET /api/history`; environment tabs use `GET /api/history/:env`
- Failed rows are expandable to show the full error message
- Timestamps shown as relative ("5 min ago") with full ISO on hover
- Initial load: last 100 entries, no pagination UI needed yet
- `triggered_by` column omitted from the table until auth is added (stored in DB ready for it)

---

## Section 3: Notifications

### Notifier types

**Email** — via `nodemailer`. Config fields stored in `notifications.config_json`:
```json
{
  "host": "smtp.example.com",
  "port": 587,
  "secure": false,
  "user": "alerts@example.com",
  "pass": "...",
  "from": "Namaa DevOps <alerts@example.com>",
  "to": "team@example.com"
}
```

**Webhook** — plain HTTP POST. Config fields:
```json
{
  "url": "https://hooks.example.com/...",
  "headers": { "Authorization": "Bearer ..." }
}
```

Payload sent to webhook:
```json
{
  "event": "deploy.success",
  "env": "stage",
  "container": "frontend",
  "action": "update-tag",
  "from_tag": "stage-reports-optimization",
  "to_tag": "demo-reports-vite",
  "duration_ms": 12400,
  "timestamp": "2026-03-25T17:44:25Z",
  "error": null
}
```

### `backend/services/notify.js`

```js
async function notifyDeploy({ env, container, action, fromTag, toTag,
                              durationMs, success, error })
```

- Reads all enabled notification rows from SQLite where `envs_json` is null or contains `env`
- Fires all matching notifiers in parallel (`Promise.allSettled` — failures are logged, never thrown)
- Called from `containers.js` at the end of every action (both success and failure paths)

**No retry logic** in v1. A failed notification is logged to console.

---

## Section 4: Settings UI

### Backend

**`backend/routes/settings.js`** — mounted at `/api/settings`:

```
GET    /api/settings/servers              list all servers with stacks
POST   /api/settings/servers              add server
PUT    /api/settings/servers/:id          update server
DELETE /api/settings/servers/:id          remove server

GET    /api/settings/notifications        list all notifiers
POST   /api/settings/notifications        add notifier
PUT    /api/settings/notifications/:id    update notifier
DELETE /api/settings/notifications/:id    remove notifier

GET    /api/settings/config/:key          get app config value (keys: "gitlab", "awsSg", "projects")
PUT    /api/settings/config/:key          set app config value
```

SSH key content is stored base64-encoded in SQLite. No at-rest encryption in v1 — documented as a known limitation; add when first customer explicitly requires it.

After any server create/update/delete, call `disconnect(env)` from `ssh.js` (already exported) to drop the cached SSH connection so the next request reconnects with updated credentials.

### Frontend

New **Settings** view in the sidebar (gear icon), with four tabs:

**Servers tab**
- List of server cards, one per environment (env_key, host, username)
- Each card expandable to show compose stacks
- Add/Edit form: env key, display name, host, SSH username, auth method toggle (password | file path | paste key), passphrase field (shown when key auth selected), docker compose command override
- Delete button with confirmation

**Notifications tab**
- List of configured notifiers with type badge (Email / Webhook), label, enabled toggle, env filter
- Add notifier: pick type → show relevant fields
- For webhook: URL field + optional headers (key/value pairs)
- For email: SMTP host, port, secure toggle, user, pass, from, to
- "Send test notification" button per notifier

**GitLab tab**
- Fields for `app_config["gitlab"]`: token, base URL, project list (key/value pairs: project name → repo path)

**AWS tab**
- Fields for `app_config["awsSg"]`: region, security group ID(s)

**Projects tab** — deferred to v2. `app_config["projects"]` is migrated and stored in SQLite in v1, but there is no UI to edit it yet. Existing projects config continues to work as before via the builds routes; editing requires direct DB access until the tab is built.

After saving any server change, the sidebar environment list refreshes automatically.

---

## File Structure Changes

```
backend/
  db.js                        NEW — SQLite init, migration, singleton
  services/
    history.js                 NEW — writeHistory()
    notify.js                  NEW — notifyDeploy()
  routes/
    settings.js                NEW — CRUD for servers, notifications, app_config
    history.js                 NEW — GET /api/history and GET /api/history/:env
    containers.js              MODIFIED — wrap all 5 actions with history + notify;
                                          read server config from db instead of loadConfig()
    servers.js                 MODIFIED — existing route that lists running containers per server;
                                          updated to read SSH/stack config from db instead of loadConfig().
                                          Distinct from settings.js: servers.js is operational (SSH + docker),
                                          settings.js is CRUD for the config data itself.
  server.js                    MODIFIED — require('./db') first, remove loadConfig() call
  config.js                    REMOVED — replaced by db.js

frontend/src/
  components/
    HistoryView.jsx             NEW
    SettingsView.jsx            NEW — tabbed settings page
    settings/
      ServersTab.jsx            NEW
      NotificationsTab.jsx      NEW
      GitLabTab.jsx             NEW
      AwsTab.jsx                NEW
  api.js                       MODIFIED — add history + settings API calls

package.json (backend)         MODIFIED — add better-sqlite3, nodemailer
data/                          NEW dir — .gitignored, holds dashboard.db
```

---

## Dependencies to Add

| Package | Purpose |
|---------|---------|
| `better-sqlite3` | SQLite driver (sync API) |
| `nodemailer` | Email sending |

No new frontend dependencies needed.

---

## Out of Scope (v1)

- At-rest encryption of SSH key content in SQLite
- Notification retry logic
- Pagination UI for history (backend supports limit/offset)
- Auth / `triggered_by` user tracking (DB column is ready, hardcoded to "manual")
- Teams-specific webhook formatting (generic webhook works with Teams via Power Automate)
- Migration of `notes.json` to SQLite (`notes.js` is unchanged in v1)
