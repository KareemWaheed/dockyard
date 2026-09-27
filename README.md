![Dockyard](https://raw.githubusercontent.com/KareemWaheed/dockyard/master/.github/banner.png)

# Dockyard

A self-hosted web dashboard for managing Docker Compose stacks across multiple remote servers. Restart containers, update image tags, edit environment variables, view logs, trigger builds, run database migrations and deploy to CapRover, all from a single browser tab or from your phone. Everything runs over SSH; no agent or daemon is needed on the target machines.

> **Disclaimer:** This project was mostly built with the help of [Claude Code](https://claude.ai) to solve specific internal needs at my team. It was never intended to be a public product, but I figured it might be useful to someone facing similar problems. If you have suggestions, fixes, or improvements, feel free to open an issue or PR.

> **Warning:** This tool runs real Docker and SSH commands on your servers. **Test it in an isolated environment first.** It is not fully tested across all edge cases. Risky actions ask for confirmation (typed confirmation on prod), but there is no undo for actions like stopping or recreating containers.

## Why I Built This

I was managing a handful of servers across dev, staging, and production — all running Docker Compose stacks. Every deployment meant SSH-ing into a machine, editing a compose file or `.env`, pulling an image, and recreating a container. Multiply that by several services and environments and it gets tedious fast.

Tools like Portainer exist, but they felt like overkill for this use case — I didn't want to install an agent on every server, deal with Portainer's own stack management, or pay for the business tier just to get multi-host support. I just wanted a simple UI that wraps the SSH commands I was already running manually.

So I built Dockyard: a thin dashboard that sits on top of your existing SSH access and compose files, adds no infrastructure overhead, and gets out of your way.

## How It Compares

|                                   | Dockyard    | Portainer           | Yacht             | Cockpit           |
| --------------------------------- | ----------- | ------------------- | ----------------- | ----------------- |
| No agent on target servers        | ✅ SSH only | ❌ Requires agent   | ❌ Requires agent | ❌ Requires agent |
| Multi-server (dev/stage/prod)     | ✅          | ✅ Business tier    | ❌                | ✅                |
| Works with existing compose files | ✅          | ⚠️ Reimports stacks | ✅                | ❌                |
| Edit env vars / image tags in UI  | ✅          | ⚠️ Limited          | ❌                | ❌                |
| Parameterized build & push        | ✅          | ❌                  | ❌                | ❌                |
| Deploy history                    | ✅          | ❌                  | ❌                | ❌                |
| Webhook / email notifications     | ✅          | ❌                  | ❌                | ❌                |
| Installable on phones (PWA)       | ✅          | ❌                  | ❌                | ❌                |
| Self-hosted, fully open source    | ✅          | ✅ CE               | ✅                | ✅                |

**The key difference:** Dockyard uses plain SSH — it reads and writes your actual `docker-compose.yml` and `.env` files directly. There is no separate stack state to sync, no agent to install, and no Docker socket exposure. If you can already SSH into your servers, Dockyard works.

## What It Does

- **Overview:** one matrix of every service in every environment. Tags that differ from the upstream environment are highlighted, and **promote** deploys the upstream tag in one step.
- **Environment pages:** stack tables with health, uptime and restart counts. They also have a maintenance-mode switch, bulk actions, and a dialog to add a service to a stack.
- **Container drawer:**
  - **Deploy:** pick a tag, with suggestions from other environments, recent builds and history. Undo is one click.
  - **Logs:** live logs with search, wrap and download.
  - **Env:** secrets are masked, and all changes apply with one recreate.
  - **Build info** and **History:** plus a note on each container.
- **Container actions:** restart, stop, start, force-recreate and pull & recreate. Confirmations get stricter for risky actions and on prod.
- **Builds:** clone a Git repo and run your build script with parameters you define per project.
  - A run history with live logs and a link to every run.
  - A queue, and a watchdog for stuck builds.
  - **Rebuild** with the same parameters, with the next tag (`…-2060` → `…-2061`), or with changed parameters.
- **CapRover deploys:** one click deploys an image from a successful build to a CapRover app. The build's git hash is sent along, so CapRover's version history shows the real commit.
- **Migrations:** run Flyway `info` and `migrate` against configured databases, with live output and history. Migrating a prod database requires typing its name.
- **Mobile and PWA:** every page works at phone width. Install Dockyard to your home screen for a full-screen app with pull to refresh, an offline banner and update prompts.
- **Everywhere:** a command palette (⌘K / Ctrl+K), an activity panel with running builds and recent actions, and light and dark themes.
- **Deploy history and notifications:** every action is logged with before and after state, and webhook or email alerts can be sent on deploys.
- **Security:** SSH passwords and tokens are encrypted at rest (AES-256-GCM). Values sent to shell commands are escaped, and requests from other sites are rejected.
- **Extras:** AWS Security Group IP whitelisting, FortiVPN controls, and settings backup and restore.

## Screenshots

![Dockyard Dashboard](https://raw.githubusercontent.com/KareemWaheed/dockyard/master/.github/banner.png)

## Quick Start

### Option A — Docker (recommended)

1. **Create an encryption key.** Dockyard encrypts stored secrets and will not start without this key. Keep it safe: secrets can't be read without it.

   ```bash
   echo "ENCRYPTION_KEY=$(openssl rand -hex 32)" > .env
   ```

2. **Start it** with the included [`docker-compose.yml`](docker-compose.yml):

   ```bash
   docker compose up -d
   ```

3. **Put a reverse proxy in front of it.** The sample compose file binds `127.0.0.1:80`, so the dashboard is only reachable through a proxy such as nginx, Caddy or Cloudflare Tunnel.
   - Dockyard has no user accounts, so keep it off the public internet.
   - The **PWA install** needs HTTPS.
   - If your proxy rewrites the `Host` header, set `CORS_ORIGIN` to your public URL so WebSockets are accepted.

Notes on the compose file:
- **`privileged: true` and `pid: host`** are only needed for the FortiVPN start, stop and restart controls. Remove them if you don't use the VPN.
- **`/var/run/docker.sock`** is used by build scripts that build and push images.
- **Build scripts:** mount your scripts at `/scripts`. SSH keys go in `./secret-keys`.

### Option B — Run from source

Prerequisites: **Node.js 20+** on the machine running the dashboard, SSH access to your servers, and Docker Compose on the target servers.

```bash
git clone https://github.com/KareemWaheed/dockyard.git
cd dockyard
npm run install:all
export ENCRYPTION_KEY=$(openssl rand -hex 32)   # save this value and reuse it on every start
npm start
```

The dashboard opens at **http://localhost:3000**. It's the Vite dev server, with the API on port 3001.

### First-time setup

Add your servers in **Settings → Servers**. You'll need the host, SSH credentials, the Docker Compose command, and the path of each compose stack.

- **SSH keys:** for key-based auth, place `.pem` files in `secret-keys/` (gitignored) and reference them from the server settings. Keys must be in OpenSSH PEM format; convert `.ppk` files with PuTTYgen if needed.
- **Environment names:** these appear in URLs, so use letters, digits, `-` and `_` (for example `stage` or `prod-eu`).
- **Environment order:** servers are listed in the order they were added. The Overview treats each column as the upstream of the next one (dev → stage → prod).

Optionally, you can seed servers from a `config.json` (see [config.example.json](config.example.json)). On first start, it is imported into SQLite and renamed to `config.json.bak`.

## Usage

### Overview and environments

- **Overview:** shows which tag of each service runs in each environment. A highlighted tag differs from the environment to its left. Click it, or press `p`, to promote the upstream tag.
- **Environment pages:** list every compose stack with its containers. Unmanaged containers are collapsed.
- **Container drawer:** click a container to open it. It has tabs for Deploy, Logs, Env, Build info and History, plus a note field.

| Action            | What runs                                                   |
| ----------------- | ----------------------------------------------------------- |
| Deploy tag        | Updates the image tag (in `docker-compose.yml` or `.env`) and recreates |
| Restart           | `docker compose restart <service>`                          |
| Start             | `docker compose up -d <service>`                            |
| Stop              | `docker compose stop <service>`                             |
| Force recreate    | `up -d --force-recreate` with the current image             |
| Pull & recreate   | Pulls the current tag again, then recreates                 |
| Apply env changes | Edits the variables, then recreates the container once      |

### Builds

Set up projects first in **Settings → Build Projects**:

1. **Add a project:** give it a name, paste the repo URL, and set the build script filename (for example `backend-build.sh`).
2. **Add parameters:** each parameter maps to a CLI flag on your script, such as `-e prod` or `-m apis`. Parameter types are text, single choice, multiple choice and on/off. A text parameter named "tag" enables **Rebuild → Next tag**.
3. **Place your build script** in `scripts/` (gitignored by default), or mount it at `/scripts` in Docker.

On the **Builds** page:
- **New build** (or press `n`) opens a panel pre-filled with your last settings for that project.
- **Runs** are listed on the left with a live log on the right, and every run has its own link.
- **After a successful build**, the deploy bar can send the pushed image to a CapRover target.

### Migrations

Mark a build project as a Flyway project in **Settings → Build Projects**. Then add environments and databases in **Settings → Flyway**.

The **Migrations** page runs `info` or `migrate` for a project, branch, environment and database, and streams the output.

### On your phone

Open Dockyard over HTTPS and install it:
- **Android:** Chrome's install icon.
- **iPhone:** Safari → Share → **Add to Home Screen**.

It opens full screen. Pull down on any page to refresh, and when a new version is deployed, a prompt offers to reload.

### Settings

- **Servers:** hosts, SSH credentials, Docker Compose command and compose stack paths.
- **GitLab:** the personal access token used to fetch branches and clone repos.
- **Build Projects:** projects, their build parameters, and the Flyway toggle.
- **Flyway:** migration environments and databases.
- **CapRover:** maps a build project and an environment to a CapRover app (URL, app name, app token).
- **Notifications:** webhook or email alerts on deploys.
- **AWS:** credentials and Security Group IDs for the IP whitelist tool.
- **VPN:** start, stop and restart the host's FortiVPN service.
- **Backup & Restore:** export all settings to a file and import them again.

## Architecture

```
Browser (React PWA)
    │  HTTP / WebSocket
    ▼
nginx ── Express backend (Node.js, SQLite)
              │  SSH (ssh2)
              ▼
         Remote servers (docker compose)
              ├── docker-compose.yml
              └── .env (optional)
```

- **Backend:** reads and writes files on remote servers over SSH. No files are edited with `sed` or `awk`: the backend reads the whole file, parses it in Node.js (YAML with `js-yaml`, `.env` line by line), changes it in memory, and writes the whole file back through a base64 pipe to avoid shell escaping issues. It also runs builds, clones and Flyway migrations locally and streams their output over WebSockets.
- **Frontend:** a React 19 single-page app built with Tailwind CSS v4, shadcn/ui and TanStack Query. It's installable as a PWA; the app itself is cached on the device, and live data is always fetched fresh.
- **Database:** SQLite stores servers (secrets encrypted), stack paths, deploy and build history, notification targets and app config.

## How It Works

For a detailed explanation of every action flow (what SSH commands run, how files are read and written, YAML parsing, env file handling), see [INTERNALS.md](INTERNALS.md).

## Project Structure

```
dockyard/
├── backend/
│   ├── server.js           # Express + WebSocket server
│   ├── db.js               # SQLite schema + config migration
│   ├── encryption.js       # AES-256-GCM for secrets at rest
│   ├── routes/             # REST API endpoints
│   └── services/           # SSH, Docker, Git, Compose, builds, Flyway, CapRover
├── frontend/
│   └── src/
│       ├── app/            # App shell, router, sidebar, theme, dialogs, PWA
│       ├── features/       # overview, env, container drawer, builds, migrations, runs, palette
│       ├── components/     # shared UI (shadcn/ui) and the Dockyard logo
│       ├── lib/            # API client, React Query keys, helpers
│       └── legacy/         # History and Settings views (redesign pending)
├── scripts/                # Build scripts (user-provided, *-build.sh gitignored)
├── secret-keys/            # SSH keys (gitignored)
├── config.example.json     # Optional seed config
├── nginx.conf              # nginx config used in the Docker image
└── docker-compose.yml      # Run the dashboard itself in Docker
```

## Development

```bash
cd frontend && npx vitest run --maxWorkers=2   # frontend tests
node backend/routes/security.test.js           # backend tests are plain Node scripts (*.test.js)
```

Pushes to `master` build and publish the `kareemwaheed/dockyard:latest` image through GitHub Actions.

## Contributing

This is a side project. If you find it useful and want to contribute:

1. Fork the repo
2. Create a feature branch
3. Test your changes in an isolated environment
4. Open a PR

Bug reports and suggestions are welcome in Issues.

## License

MIT
