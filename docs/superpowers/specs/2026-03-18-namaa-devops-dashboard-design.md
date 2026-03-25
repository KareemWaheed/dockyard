# Namaa DevOps Dashboard — Design Spec

**Date:** 2026-03-18
**Author:** Kareem Waheed
**Status:** Approved

---

## Overview

A local web dashboard for managing Namaa's 4 server environments (DEV, TEST, STAGE, PROD). Runs on the user's machine, opens in a browser, and SSHes into servers to manage Docker Compose stacks. Replaces manual SSH + CLI for the most frequent deployment tasks.

---

## Server Landscape

| Environment | Host | SSH Auth | Notes |
|---|---|---|---|
| DEV | 10.0.20.156 | username + password | Requires FortiClient VPN |
| TEST | 10.0.30.27 | username + password | Requires FortiClient VPN |
| STAGE | 52.215.139.121 | ec2-user + PEM key | AWS — needs IP whitelisting first |
| PROD | 34.254.42.170 | ec2-user + PEM key | AWS — needs IP whitelisting first |

Each server runs one or more Docker Compose stacks. All servers must run **Docker Compose v2.20+** (the `docker compose` plugin, not `docker-compose` v1). Minimum v2.20 is required for stable `--format json` output from `docker compose ps` (newline-delimited JSON). The backend must handle both array and NDJSON formats defensively.

---

## Tech Stack

- **Backend:** Node.js + Express
- **Frontend:** React (dark theme)
- **SSH:** `ssh2` npm package
- **Live logs:** WebSocket (`ws` package)
- **Local script execution:** Node.js `child_process`
- **Run:** `npm start` from project root — backend on `localhost:3001`, frontend on `localhost:3000`

No database. Local files handle all persistence:
- `config.json` — server credentials, stack paths, GitLab token, project repo URLs (filled once, git-ignored)
- `notes.json` — per-container deployment notes keyed by `"server:containerName"` (git-ignored). Last-write-wins if multiple browser tabs are open simultaneously — acceptable for a single-user local tool.
- `repos/` — local git clones managed by the dashboard (git-ignored)

---

## Project Structure

```
namaa-dashboard/
├── backend/
│   ├── server.js
│   ├── routes/
│   │   ├── servers.js       # GET container list per server
│   │   ├── containers.js    # POST actions (restart, up, update tag, env)
│   │   ├── logs.js          # WebSocket log streaming
│   │   └── builds.js        # Trigger local build scripts
│   └── services/
│       ├── ssh.js           # SSH connection pool
│       ├── docker.js        # docker inspect / ps parsing
│       └── compose.js       # docker-compose.yml + .env file editing
├── frontend/
│   └── src/
│       ├── App.jsx
│       └── components/
│           ├── ServerTab.jsx
│           ├── ContainerRow.jsx
│           ├── LogsPanel.jsx
│           ├── EnvPanel.jsx
│           └── BuildPanel.jsx
├── aws-sg.sh                # Bundled — called via ./aws-sg.sh
├── frontend-build.sh
├── backend-build.sh
├── geoserver-build.sh
├── admin-panel-build.sh
├── repos/                   # Git-ignored — managed by dashboard
│   ├── namaa-coreui/
│   ├── irrigation_backend/
│   ├── namaa-geoserver/
│   └── namaa-admin-panel/
├── config.json              # Git-ignored (contains credentials + tokens)
├── config.example.json      # Committed — template with placeholder values
└── notes.json               # Git-ignored, auto-created on first note save
```

---

## Configuration (`config.json`)

Credentials are stored in plaintext — this is intentional. The dashboard is a local personal tool and is never exposed to a network. `config.json` is git-ignored.

```json
{
  "awsSg": {
    "description": "kareem"
  },
  "gitlab": {
    "token": "glpat-..."
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
      "ssh": {
        "username": "user",
        "password": "pass"
      },
      "composeStacks": [
        { "name": "Main", "path": "/absolute/path/on/server/docker-compose.yml" }
      ]
    },
    "test": {
      "host": "10.0.30.27",
      "ssh": {
        "username": "user",
        "password": "pass"
      },
      "composeStacks": [
        { "name": "Main", "path": "/absolute/path/on/server/docker-compose.yml" }
      ]
    },
    "stage": {
      "host": "52.215.139.121",
      "ssh": {
        "username": "ec2-user",
        "privateKeyPath": "/absolute/local/path/to/key.pem",
        "passphrase": ""
      },
      "composeStacks": [
        { "name": "Main", "path": "/home/ec2-user/letsencrypt-docker-compose/docker-compose.yml" }
      ]
    },
    "prod": {
      "host": "34.254.42.170",
      "ssh": {
        "username": "ec2-user",
        "privateKeyPath": "/absolute/local/path/to/key.pem",
        "passphrase": ""
      },
      "composeStacks": [
        { "name": "Main", "path": "/home/ec2-user/letsencrypt-docker-compose/docker-compose.yml" },
        { "name": "Admin Panel", "path": "/home/ec2-user/namaa-admin-panel/docker-compose.prod.yml" }
      ]
    }
  }
}
```

**Notes on fields:**
- `composeStacks[].path` — absolute path on the **remote server**
- `privateKeyPath` — absolute path on the **local machine**
- `passphrase` — leave empty string `""` if the PEM key has no passphrase. The backend passes `undefined` (not `""`) to the `ssh2` library when the field is empty or absent, to correctly handle unencrypted keys.

---

## UI Layout

### Top Bar
- App name
- **⚡ Build** → opens BuildPanel with project selector (Frontend / Backend / Geoserver / Admin Panel)

### Tabs
DEV · TEST · STAGE · PROD. STAGE and PROD tabs show a **🔐 Whitelist My IP** button.

### Status Bar (per tab)
- Connection status: Connecting… / Connected / Failed (with error message)
  - If connection fails for DEV/TEST: show "Connection failed — check FortiClient VPN"
  - If connection fails for STAGE/PROD: show "Connection failed — try whitelisting your IP first"
- Running / stopped container count
- Last refreshed timestamp
- Refresh button
- **Bulk action bar** — appears when ≥1 managed container is checked:
  ↻ Restart All · ▶ Up -d All · ⚡ Force Recreate All · ✏ Set Tag for All · ✕ Clear

### Container List

Containers are grouped by stack name within each tab. Each row shows:
- **Checkbox** (managed containers only)
- **Status dot** — 🟢 running / 🔴 stopped
- **Container name**
- **Image + tag** (truncated, full on hover)
- **Notes** — inline editable text field, auto-saved to `notes.json` on blur
- **Action buttons**

#### Managed (`com.namaa.dashboard.managed=true`)
**✏ Tag · ⚙ Env · ↻ Restart · ▶ Up · ⚡ Force Recreate · 📋 Logs**

#### Unmanaged (no label or `managed=false`)
**⚙ Env · 📋 Logs** — view only, no modifications

**Label check timing:** Labels are read at page load and on each manual refresh. The managed/unmanaged state shown in the UI reflects the last refresh. There is no per-action re-check.

---

## Reading Server State

On tab open (or manual refresh), for each stack:

1. SSH in, run: `docker compose -f <path> ps --format json`
2. For each container returned, run: `docker inspect <containerName>`
3. From inspect response, extract:
   - `Config.Labels` → check `com.namaa.dashboard.managed`
   - `Config.Env` → env vars (resolved values)
   - `Config.Image` → current image including tag
   - `State.Status` → running / stopped

All data cached in memory until next refresh.

---

## Actions

### Compose File vs `.env` File Detection

This rule applies to all write operations (update tag, edit env var):

1. SSH in, read the relevant service's `image:` line from the compose file
2. If the value contains any `${...}` placeholder (e.g. `image: ${REGISTRY}/name:${IMAGE_TAG}` or `image: myrepo/name:${TAG}`) → **env-file mode**: find the `.env` file in the same directory as the compose file, update only the specific variable(s) referenced in the image line. The compose file itself is **not modified** in env-file mode.
3. If the value is fully literal (e.g. `image: 10.0.20.156:5000/namaa-frontend:test-r15-s1`) → **compose-file mode**: edit the image line directly in the compose file

For env var edits: same logic — if the environment block entry references `${VAR_NAME}`, update the `.env` file. If the value is a literal, update the compose file environment block.

**Detection is always driven by the compose file line.** The backend reads the compose file first, inspects the `image:` line (or environment entry), and decides mode based on whether it contains `${...}`. There is no cross-checking of the `.env` file during detection. The rule "if var in both files, write to .env" describes write priority, not detection — it applies only in env-file mode, meaning the compose file already showed a `${...}` reference and the `.env` file is therefore the authoritative target. The compose file entry is left untouched in all cases.

### Update Tag (`✏ Tag`)
1. User enters new tag + optional notes
2. Auto-detect compose vs env-file mode
3. Update the appropriate file on the server via SSH
4. Run: `docker compose -f <path> up -d <serviceName>`
5. Save notes to local `notes.json` keyed by `"server:containerName"`

### View / Edit Env Vars (`⚙ Env`)
- **View:** Show env vars from `docker inspect` (resolved, actual running values)
- **Add new var:** User types key + value → appended to compose file environment block (or `.env` file if env-file mode) → `docker compose -f <path> up -d <serviceName>`
- **Edit existing var:** User changes value → auto-detect mode → write to compose or `.env` file → `docker compose -f <path> up -d <serviceName>`
- **Delete:** Not supported — too risky to automate; user must edit files directly
- **Read-only vars note:** Vars sourced from `.env` show their resolved value. The original `${VAR}` placeholder in the compose file is preserved — only the `.env` value is changed.

### Restart (`↻`)
`docker compose -f <path> restart <serviceName>`

### Up -d (`▶`)
`docker compose -f <path> up -d <serviceName>`

### Force Recreate (`⚡`)
`docker compose -f <path> up -d --force-recreate <serviceName>`

### Logs (`📋`)
- Opens a full-screen panel
- Backend opens SSH channel, runs: `docker logs --tail=200 -f <containerName>`
- Output streamed via WebSocket to frontend
- Frontend maintains a **rolling buffer of 1000 lines per session** — oldest lines dropped as new arrive
- Client-side search input: filters/highlights matching lines in real time
- Closing the panel sends a close signal → backend kills the SSH channel
- Reopening starts a fresh stream from `--tail=200` (no buffer persistence between sessions)
- If the WebSocket drops mid-stream (network hiccup): show "Log stream disconnected" banner with a **Reconnect** button. No auto-reconnect. Reconnect opens a fresh `docker logs --tail=200 -f` — the existing buffer is cleared. The user loses prior context; this is acceptable.

### Bulk Actions
Applies only to managed containers. Scope: **all checked containers in the current server tab** (not across tabs). Actions run **sequentially**. Each container shows an inline status (pending → running → ✅ done / ❌ failed). On failure, the loop **skips and continues** to the next container (no rollback). Build output is non-zero exit: shown as "Build failed" in red at bottom of panel.

**Set Tag for All:** single shared tag input → auto-detect mode applied independently per container. On partial failure (some containers updated, some not), the post-bulk summary clearly shows which containers succeeded and which failed. No rollback. Mixed-tag state is acceptable — the user can re-run for failed containers.

### Whitelist My IP (STAGE / PROD)
`aws-sg.sh` handles upsert by description: if a rule with the same `-d` description already exists, it revokes the old IP and adds the new one. Duplicate description is not an error — it is the expected update path. The dashboard does not need to handle this case.

1. Runs locally: `./aws-sg.sh -d <description> -e <stage|prod>`
2. Output streamed in a modal
3. On script exit code 0: **wait 4 seconds** (best-effort propagation delay) then attempt SSH. If SSH still fails, show: "Connection failed — AWS SG rule may still be propagating, try refreshing in a few seconds." No automatic retry.
4. On non-zero exit: show error, do not attempt SSH

### Build Panel (all projects)

The top bar "⚡ Build" button opens a unified BuildPanel. All projects share the same git flow:

**Git flow (runs before every build):**
1. If `repos/<project>/` doesn't exist → `git clone https://oauth2:<token>@<repo-url> repos/<project>/`
2. `git fetch --all`
3. Frontend fetches and displays available branches for the user to pick
4. On user selecting branch → `git checkout <branch> && git pull`
5. Run the project's build script from `repos/<project>/`, streaming output live
6. On non-zero exit: show error in red

**Per-project build form fields:**

**Frontend (namaa-coreui → `frontend-build.sh`):**
- Branch: dropdown (fetched from git)
- Environment (`-e`): dropdown — dev / aws
- Tag (`-t`): text input (optional)
- Increment beta (`-i`): checkbox

**Backend (irrigation_backend → `backend-build.sh`):**
- Branch: dropdown
- Modules (`-m`): multi-select — apis / sensors_readings / events / weather_forecast / partitioning — plus "All" (`-a`)
- Environment (`-e`): dropdown — dev / test / stage / prod
- Version (`-v`): text input (optional)
- Run mvn clean install first (`-s`): checkbox
- Release type (`-x`): dropdown — none / major / minor / patch

**Geoserver (namaa-geoserver → `geoserver-build.sh`):**
- Branch: dropdown
- Tag (`-t`): text input (optional, defaults to `latest`)
- Environment (`-e`): dropdown — dev / aws

**Admin Panel (namaa-admin-panel → `admin-panel-build.sh`):**
- Branch: dropdown
- Service (`-s`): dropdown — all / frontend / backend
- Tag (`-t`): text input (optional)
- Environment (`-e`): dropdown — dev / aws
- Increment beta (`-i`): checkbox

### Add Service (per stack)

Each stack group header has an **"+ Add Service"** button. Opens a panel with two modes:

**Clone mode** — pick any existing service in the stack as a template:
- All fields pre-filled from the source service (image, ports, env vars, restart policy)
- User must set a new unique service/container name
- User edits tag, ports, env vars as needed before saving

**New mode** — blank form:
- Service name (used as both service key and `container_name`)
- Image + tag
- Ports: list of `host:container` pairs, add/remove rows
- Environment variables: key/value pairs, add/remove rows
- Restart policy: dropdown — always / unless-stopped / on-failure / no

In both modes:
- `com.namaa.dashboard.managed=true` is **automatically added** to labels
- On submit: backend SSHes in, appends the new service block to the compose file, runs `docker compose up -d <serviceName>`
- New service appears immediately in the container list after refresh

---

## Security Notes

- `config.json` and `repos/` are git-ignored — never committed
- Dashboard has **no authentication** — intentional, it is a local-only tool never exposed to a network
- All destructive actions require an explicit user click — no auto-apply
- Unmanaged containers cannot be restarted, updated, or recreated from the dashboard
- PEM key files are read from the local filesystem at connection time and never transmitted or logged
