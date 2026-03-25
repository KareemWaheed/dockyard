# Dockyard

A self-hosted dashboard for managing Docker Compose stacks and CI/CD builds across multiple remote servers (dev, test, stage, prod). All container actions run over SSH — no agent required on the target machine.

---

## Architecture

```
Browser (React)
    │  HTTP / WebSocket
    ▼
Express Backend  (Node.js, port 3001)
    │  SSH (ssh2 library)
    ▼
Remote Server  (docker / docker compose)
    ├─ docker-compose.yml
    └─ .env  (optional, for tag variables)
```

**Data store:** SQLite (`data/dashboard.db`) — stores server credentials, stack paths, deploy history, notification targets, and app config.  
**SSH connections:** One persistent connection per environment, cached in memory and reused across requests. Reconnects automatically on drop.

---

## Setup

### 1. Install

```bash
git clone <this-repo> && cd dockyard
npm run install:all
```

### 2. Configure

```bash
cp config.example.json config.json
```

On first start, `config.json` is automatically migrated into SQLite and renamed to `config.json.bak`. After that, all changes go through the **Settings** UI.

### 3. SSH Keys

For servers using key-based auth (stage, prod), place `.pem` files in `secret-keys/` (gitignored) and set `privateKeyPath` in config. Keys must be OpenSSH PEM format — convert `.ppk` files with PuTTYgen first.

### 4. Run

```bash
npm start          # backend :3001 + frontend :3000 (hot reload)
```

---

## Configuration Reference

```json
{
  "servers": {
    "dev": {
      "host": "10.0.20.x",
      "ssh": { "username": "root", "password": "yourpassword" },
      "composeStacks": [
        { "name": "Main", "path": "/home/docker/docker-compose.yml" }
      ]
    },
    "stage": {
      "host": "x.x.x.x",
      "dockerCompose": "docker-compose",
      "ssh": { "username": "ec2-user", "privateKeyPath": "secret-keys/stage.pem", "passphrase": "" },
      "composeStacks": [
        { "name": "Main", "path": "/home/ec2-user/app/docker-compose.yml" },
        { "name": "Admin", "path": "/home/ec2-user/admin/docker-compose.prod.yml" }
      ]
    }
  },
  "gitlab": { "token": "glpat-XXXX" },
  "projects": {
    "frontend": { "name": "Frontend", "repo": "https://gitlab.example.com/org/frontend.git", "buildScript": "frontend-build.sh" }
  }
}
```

| Field | Description |
|---|---|
| `servers[].dockerCompose` | Use `"docker-compose"` for older servers without the compose plugin. Default: `"docker compose"` |
| `servers[].composeStacks` | One or more compose files to manage on that server |
| `gitlab.token` | GitLab PAT with `read_repository` scope |
| `projects[].buildScript` | Filename inside `scripts/` to run during builds |

---

## Managed vs Unmanaged Containers

A container is **managed** when it has this label in its compose definition:

```yaml
services:
  backend:
    image: myrepo/backend:prod-14
    labels:
      - "com.dockyard.managed=true"
```

Managed containers get the full action set (update tag, edit env, restart, etc.). Unmanaged containers are visible but dimmed — you can only view logs and env vars.

---

## Action Flows

Every UI action sends an HTTP POST to the backend. The backend opens (or reuses) an SSH connection and runs real shell commands on the remote server. Here is exactly what runs for each action.

---

### Load Dashboard (Refresh)

**What runs on the remote server — for each configured compose stack:**

```bash
# 1. List all containers in the stack (running + stopped)
docker compose -f "/path/to/docker-compose.yml" ps --all --format json

# 2. Inspect them all in a single call to get image, env vars, labels, state
docker inspect "container1" "container2" ...
```

**Then, to find standalone containers (not in any stack):**

```bash
# 3. List every container on the host
docker ps -a --format "{{json .}}"

# 4. Inspect only the ones not already seen in compose stacks
docker inspect "standalone1" ...
```

The backend then:
- Parses the JSON output from `docker compose ps` (handles both NDJSON and array format)
- Merges inspect data (image, env, labels, state) onto each container
- Marks containers with `com.dockyard.managed=true` as managed
- Returns stacks + standalone containers to the browser

---

### Update Tag  `Tag` button

Clicking the image tag badge opens a modal where you enter a new tag. On save:

**Case A — tag is hardcoded in `docker-compose.yml`** (e.g. `image: myrepo/backend:prod-13`):

```bash
# 1. Read the compose file
cat "/path/to/docker-compose.yml"

# 2. Backend rewrites the image line: myrepo/backend:prod-14
#    Written via base64 to safely handle special characters
echo '<base64_encoded_content>' | base64 -d > "/path/to/docker-compose.yml"

# 3. Pull new image + recreate the container
docker compose -f "/path/to/docker-compose.yml" up -d --pull always --force-recreate "service-name"
```

**Case B — tag comes from a `.env` variable** (e.g. `image: myrepo/backend:${BACKEND_TAG}`):

```bash
# 1. Read both files
cat "/path/to/docker-compose.yml"
cat "/path/to/.env"

# 2. Backend rewrites only the variable in .env: BACKEND_TAG=prod-14
echo '<base64_encoded_content>' | base64 -d > "/path/to/.env"

# 3. Pull new image + recreate
docker compose -f "/path/to/docker-compose.yml" up -d --pull always --force-recreate "service-name"
```

The mode (hardcoded vs env-variable) is detected automatically by checking if the image line contains `${...}`.

After success: the old and new tag are saved to deploy history, and a notification is sent if configured.

---

### Update Environment Variable  `Env` button

Opens the env panel. On save:

**Case A — variable is defined inline** in `environment:` block of the compose file:

```bash
cat "/path/to/docker-compose.yml"
# Backend adds/replaces KEY=VALUE in the environment array, dumps YAML back
echo '<base64_encoded_content>' | base64 -d > "/path/to/docker-compose.yml"
docker compose -f "/path/to/docker-compose.yml" up -d "service-name"
```

**Case B — variable uses `${VAR}` syntax** (sourced from `.env` file):

```bash
cat "/path/to/.env"
# Backend rewrites KEY=VALUE in the .env file
echo '<base64_encoded_content>' | base64 -d > "/path/to/.env"
docker compose -f "/path/to/docker-compose.yml" up -d "service-name"
```

> Files are always written via `base64 -d` pipe to avoid shell quoting issues with special characters.

---

### Restart  `↻` button

```bash
docker compose -f "/path/to/docker-compose.yml" restart "service-name"
```

Signals the running container to stop and start again. Does not pull a new image. Does not recreate.

---

### Up / Start  `▶` button

```bash
docker compose -f "/path/to/docker-compose.yml" up -d "service-name"
```

Starts a stopped container. If the image has changed since last `up`, Docker will use the new image definition.

---

### Force Recreate  `⚡` button

```bash
docker compose -f "/path/to/docker-compose.yml" up -d --force-recreate "service-name"
```

Destroys and recreates the container from its **current image on disk** — does **not** pull from the registry. Useful when you've changed env vars or the compose config.

---

### Pull & Recreate  `⤓` button

```bash
# Step 1 — pull the latest image for the current tag from the registry
docker compose -f "/path/to/docker-compose.yml" pull "service-name"

# Step 2 — recreate the container with the newly pulled image
docker compose -f "/path/to/docker-compose.yml" up -d --force-recreate "service-name"
```

Used when the tag is mutable (e.g. `latest`, a branch name, or a rolling tag). Pulls whatever the registry currently has for that tag, then recreates.

---

### Stop  `■` button

```bash
docker compose -f "/path/to/docker-compose.yml" stop "service-name"
```

Stops the container without removing it.

---

### View Logs  `Logs` button

Uses a **WebSocket** connection (`ws://localhost:3001`). The backend runs:

```bash
docker logs "container-name" --tail 200 --follow
```

Each line is streamed to the browser in real time. Closing the panel closes the SSH exec channel and stops the stream.

---

### Add Service  `+` in stack header

Fill out the form (name, image, ports, env vars) → Add:

```bash
# 1. Read the existing compose file
cat "/path/to/docker-compose.yml"

# 2. Backend appends the new service definition to the YAML
#    New services get label: com.dockyard.managed=true
echo '<base64_encoded_content>' | base64 -d > "/path/to/docker-compose.yml"

# 3. Start the new service
docker compose -f "/path/to/docker-compose.yml" up -d "new-service-name"
```

---

### Bulk Actions

Selecting multiple containers and clicking a bulk action (restart / up / force-recreate / update-tag) sends one HTTP POST per container in sequence. Each follows the same flow as the individual action above.

---

### Build & Push  (Build view)

Runs **locally on the dashboard server** — not over SSH.

#### Dynamic parameterized builds

Projects and their build parameters are configured in **Settings → Build Projects** and stored in SQLite (`app_config.projects`). There is no hardcoded project list — the UI renders forms dynamically from the stored param schemas.

Each project has:
- `name` — display name
- `repo` — Git clone URL
- `buildScript` — filename inside `scripts/` to run
- `params[]` — array of parameter definitions

Each param has:
- `name` — display label
- `type` — `string`, `select`, `checkbox`, or `multiselect`
- `flag` — CLI flag template, e.g. `"-e %s"`, `"-m %s"` (supports `%s` placeholder)
- `default` — default value
- `options` — array of `{ label, value }` for select/multiselect types

When the user clicks **Build**, the frontend collects form values and converts them to CLI args using the `flag` template. For example, a `multiselect` param with flag `"-m %s"` and selected values `["apis", "events"]` produces args `["-m", "apis", "-m", "events"]`.

#### Build execution

**Step 1 — clone (first time only):**
```bash
git clone "https://oauth2:<gitlab_token>@gitlab.example.com/org/repo.git" repos/<project>/
```

**Step 2 — checkout the selected branch:**
```bash
git checkout -B <branch> origin/<branch>
```

**Step 3 — run the build script** with the assembled args, streaming output line-by-line to the browser:
```bash
bash scripts/<buildScript>.sh -e prod -m apis -m events -t v2.1.0
```

Build scripts are **user-provided** and gitignored (`scripts/*-build.sh`). Only `aws-sg.sh` is tracked. Each script typically runs `docker build` + `docker push`. The browser shows live output until the script exits, then reports the exit code.

---

## SSH Connection Lifecycle

```
First request for env "prod"
  → new ssh2 Client connects to host (password or PEM key)
  → stored in memory: connections["prod"]

All subsequent requests for "prod"
  → reuse the existing connection (no re-handshake)

Server reboots / connection times out
  → "close" event fires → removed from cache
  → next request triggers a new connect()
```

Authentication options (tried in order):
1. Inline private key (base64, stored in DB via Settings UI)
2. Private key file at `privateKeyPath`
3. Password

---

## Database Tables

| Table | Purpose |
|---|---|
| `servers` | One row per environment — host, SSH credentials, docker compose command |
| `compose_stacks` | One or more compose file paths per server |
| `deploy_history` | Append-only log of every action (tag changes, restarts, etc.) |
| `notifications` | Webhook / email targets, optional per-environment filtering |
| `app_config` | GitLab token, AWS SG config, build project definitions |

---

## How Files Are Modified on the Server

This section explains exactly how the backend reads and writes files on remote servers — no `sed`, no `grep`, no in-place regex substitution.

### Reading a file

```bash
cat "/path/to/docker-compose.yml"
```

`ssh.readFile()` just runs `cat` over SSH and returns the full string. No temp files, no streaming.

---

### Writing a file (all modifications)

Every write uses the same pattern: base64-encode the new content locally, pipe it through `echo | base64 -d` into the target file:

```bash
echo '<base64_of_new_content>' | base64 -d > "/path/to/file"
```

**Why base64?** Writing arbitrary YAML/env content directly through a shell command would break on quotes, dollar signs, newlines, and backslashes. Base64 is always safe ASCII — no escaping needed.

---

### Updating an image tag in `docker-compose.yml`

The backend uses the `js-yaml` library — it **never uses regex or sed** on the YAML.

1. Read the full compose file with `cat`
2. Parse it into a JavaScript object with `yaml.load()`
3. Find the service by name in `doc.services`
4. Rewrite `service.image`:
   - The current image string is split on the **last colon** (`myrepo/backend:prod-13`)
   - Everything before the last colon is kept, the new tag is appended: `myrepo/backend:prod-14`
5. Serialize back to YAML with `yaml.dump()`
6. Write back to the server via `base64 -d`

Example — before:
```yaml
services:
  backend:
    image: "myrepo/backend:prod-13"
```
After updating to `prod-14`:
```yaml
services:
  backend:
    image: "myrepo/backend:prod-14"
```

---

### Updating a tag stored in a `.env` variable

When the compose image line contains `${VAR}` (e.g. `image: myrepo/backend:${BACKEND_TAG}`), the tag lives in a `.env` file next to the compose file.

1. Read the `.env` file with `cat`
2. Parse it into a key/value map (splits on `=`, skips blank lines and `#` comments)
3. Overwrite the target key: `BACKEND_TAG=prod-14`
4. Re-serialize: `KEY=VALUE\n` per line
5. Write back via `base64 -d`
6. The compose file itself is **not touched**

Example `.env` — before:
```
BACKEND_TAG=prod-13
FRONTEND_TAG=fe-22
```
After:
```
BACKEND_TAG=prod-14
FRONTEND_TAG=fe-22
```

---

### Updating an environment variable in `docker-compose.yml`

1. Read the compose file, parse with `yaml.load()`
2. Check the service's `environment` block:
   - If the value for the key uses `${VAR}` syntax → edit the `.env` file instead (same flow as above)
   - Otherwise → modify the `environment` array directly in the parsed object
3. For array-style environments (`- KEY=VALUE`):
   - Filter out any existing entry that starts with `KEY=`
   - Push the new `KEY=VALUE` entry
4. Serialize back with `yaml.dump()` and write via `base64 -d`
5. Run `docker compose up -d "service-name"` to apply (no `--force-recreate` — Docker applies env changes on next up)

---

### Adding a new service to `docker-compose.yml`

1. Read the compose file, parse with `yaml.load()`
2. Append a new key under `doc.services` with the provided definition:
   ```yaml
   services:
     new-service:
       container_name: "new-service"
       image: "myrepo/new-service:latest"
       restart: "always"
       labels:
         com.dockyard.managed: "true"
       ports:
         - "8080:8080"
       environment:
         - KEY=VALUE
   ```
3. Serialize with `yaml.dump()` and write via `base64 -d`
4. Run `docker compose up -d "new-service"` to start it

---

### Summary table

| Operation | File(s) touched | How content is modified | Written via |
|---|---|---|---|
| Update tag (hardcoded) | `docker-compose.yml` | `yaml.load` → change `service.image` → `yaml.dump` | `echo base64 \| base64 -d >` |
| Update tag (env var) | `.env` | Parse lines → update key → rejoin | `echo base64 \| base64 -d >` |
| Update env var (inline) | `docker-compose.yml` | `yaml.load` → edit `environment` array → `yaml.dump` | `echo base64 \| base64 -d >` |
| Update env var (env-file) | `.env` | Parse lines → update key → rejoin | `echo base64 \| base64 -d >` |
| Add new service | `docker-compose.yml` | `yaml.load` → append to `services` → `yaml.dump` | `echo base64 \| base64 -d >` |

**Nothing uses `sed`, `awk`, `grep -i`, or in-place regex.** All YAML edits go through a proper parse → modify → serialize cycle to preserve the file structure.

---

## Project Structure

```
dockyard/
├── backend/
│   ├── server.js               # Express app + WebSocket setup
│   ├── db.js                   # SQLite init + config.json migration
│   ├── notes.js                # In-memory container notes
│   ├── routes/
│   │   ├── servers.js          # GET /:env/containers (list + inspect)
│   │   ├── containers.js       # POST actions: restart/up/stop/update-tag/update-env/pull-recreate
│   │   ├── builds.js           # GET branches, POST clone, POST build (streamed)
│   │   ├── services.js         # POST add service to compose stack
│   │   ├── logs.js             # WebSocket log streaming
│   │   ├── history.js          # GET deploy history
│   │   ├── settings.js         # CRUD for servers, stacks, notifications, config
│   │   └── awssg.js            # AWS SG IP whitelist (streamed)
│   └── services/
│       ├── ssh.js              # SSH connection pool + exec/readFile/writeFile
│       ├── git.js              # Git clone / fetch / checkout / spawn build
│       ├── docker.js           # Parse docker compose ps + docker inspect output
│       ├── compose.js          # Read & rewrite docker-compose.yml / .env files
│       ├── history.js          # Write deploy history rows to SQLite
│       └── notify.js           # Send webhook / email notifications
├── frontend/
│   └── src/
│       ├── AppShell.jsx        # Env polling, view routing, theme state
│       ├── api.js              # Fetch + streaming helpers
│       └── components/
│           ├── DashboardView.jsx
│           ├── ContainerRow.jsx    # Action buttons per container
│           ├── BuildView.jsx
│           ├── LogsPanel.jsx
│           ├── EnvPanel.jsx
│           ├── UpdateTagModal.jsx
│           ├── AddServicePanel.jsx
│           ├── BulkActionBar.jsx
│           ├── HistoryView.jsx
│           ├── SettingsView.jsx
│           └── settings/
│               ├── BuildProjectsTab.jsx  # Project + param schema editor
│               └── AwsTab.jsx            # AWS credentials + SG config
├── scripts/                    # Build scripts (run locally, *-build.sh are gitignored)
│   ├── aws-sg.sh               # AWS SG whitelist script (tracked)
│   └── *-build.sh              # User-provided build scripts (gitignored)
├── secret-keys/                # SSH keys — gitignored
├── data/                       # SQLite DB — gitignored
├── repos/                      # Cloned git repos — gitignored
├── config.example.json
└── package.json
```
