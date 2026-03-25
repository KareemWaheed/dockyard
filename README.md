# Dockyard

A self-hosted web dashboard for managing Docker Compose stacks across multiple remote servers. Restart containers, update image tags, edit environment variables, view logs, and trigger CI/CD builds — all from a single browser tab. Everything runs over SSH; no agent or daemon is needed on the target machines.

> **Disclaimer:** This project was mostly built with the help of [Claude Code](https://claude.ai) to solve specific internal needs at my team. It was never intended to be a public product, but I figured it might be useful to someone facing similar problems. If you have suggestions, fixes, or improvements — feel free to open an issue or PR.

> **Warning:** This tool runs real Docker and SSH commands on your servers. **Test it in an isolated environment first.** It is not fully tested across all edge cases, and there is no undo for destructive actions like stopping or recreating containers.

## Why I Built This

I was managing a handful of servers across dev, staging, and production — all running Docker Compose stacks. Every deployment meant SSH-ing into a machine, editing a compose file or `.env`, pulling an image, and recreating a container. Multiply that by several services and environments and it gets tedious fast.

Tools like Portainer exist, but they felt like overkill for this use case — I didn't want to install an agent on every server, deal with Portainer's own stack management, or pay for the business tier just to get multi-host support. I just wanted a simple UI that wraps the SSH commands I was already running manually.

So I built Dockyard: a thin dashboard that sits on top of your existing SSH access and compose files, adds no infrastructure overhead, and gets out of your way.

## How It Compares

| | Dockyard | Portainer | Yacht | Cockpit |
|---|---|---|---|---|
| No agent on target servers | ✅ SSH only | ❌ Requires agent | ❌ Requires agent | ❌ Requires agent |
| Multi-server (dev/stage/prod) | ✅ | ✅ Business tier | ❌ | ✅ |
| Works with existing compose files | ✅ | ⚠️ Reimports stacks | ✅ | ❌ |
| Edit env vars / image tags in UI | ✅ | ⚠️ Limited | ❌ | ❌ |
| Parameterized build & push | ✅ | ❌ | ❌ | ❌ |
| Deploy history | ✅ | ❌ | ❌ | ❌ |
| Webhook / email notifications | ✅ | ❌ | ❌ | ❌ |
| Self-hosted, fully open source | ✅ | ✅ CE | ✅ | ✅ |

**The key difference:** Dockyard uses plain SSH — it reads and writes your actual `docker-compose.yml` and `.env` files directly. There is no separate stack state to sync, no agent to install, and no Docker socket exposure. If you can already SSH into your servers, Dockyard works.

## What It Does

- **Multi-server dashboard** — manage dev, staging, and production from one place
- **Container actions** — restart, stop, start, force-recreate, pull & recreate, update image tags
- **Environment variable editing** — modify env vars inline in compose files or in `.env` files
- **Live log streaming** — tail container logs in real time via WebSocket
- **Build & push** — dynamic parameterized builds: define projects and their CLI params in Settings, clone a Git repo, run your build script with the assembled flags, stream output to the browser
- **Deploy history** — every action is logged with before/after state
- **Notifications** — webhook and email alerts on deploys
- **Add services** — add new containers to a compose stack from the UI
- **AWS Security Group** — quick IP whitelisting (optional)
- **Dark / Light theme** — Tokyo Night color palette, persisted per browser

## Screenshots

<!-- Add screenshots here -->

## Quick Start

### Prerequisites

- Node.js 18+ (on the machine running the dashboard)
- SSH access to your target servers
- Docker and Docker Compose installed on the target servers

### 1. Clone and install

```bash
git clone https://github.com/KareemWaheed/dockyard.git
cd dockyard
npm run install:all
```

### 2. Configure

```bash
cp config.example.json config.json
```

Edit `config.json` with your server details:

```json
{
  "servers": {
    "dev": {
      "host": "10.0.0.10",
      "ssh": { "username": "root", "password": "yourpassword" },
      "composeStacks": [
        { "name": "App", "path": "/home/docker/docker-compose.yml" }
      ]
    },
    "prod": {
      "host": "1.2.3.4",
      "ssh": {
        "username": "ec2-user",
        "privateKeyPath": "secret-keys/prod.pem"
      },
      "composeStacks": [
        { "name": "App", "path": "/home/ec2-user/app/docker-compose.yml" }
      ]
    }
  }
}
```

See [config.example.json](config.example.json) for the full schema with all options.

### 3. SSH keys

For key-based auth, place `.pem` files in `secret-keys/` (gitignored) and set `privateKeyPath` in your config. Keys must be in OpenSSH PEM format — convert `.ppk` files with PuTTYgen if needed.

### 4. Run

```bash
npm start
```

Opens the dashboard at **http://localhost:3000**. On first start, `config.json` is migrated into SQLite and renamed to `config.json.bak`. After that, all configuration is managed through the **Settings** UI — no need to edit files manually.

### Run with Docker

To run the dashboard itself in Docker:

```bash
docker compose up -d
```

The dashboard will be available at **http://localhost:3000**. Mount your SSH keys into the container if needed.

## Usage

### Dashboard

Select an environment (dev / staging / prod) from the sidebar. Dockyard connects over SSH and lists all running and stopped containers grouped by compose stack.

Each container shows its image tag, status, and action buttons:

| Button | Action |
|---|---|
| `↻` Restart | `docker compose restart <service>` |
| `▶` Up | `docker compose up -d <service>` |
| `■` Stop | `docker compose stop <service>` |
| `⚡` Force recreate | `up -d --force-recreate` (current image) |
| `⤓` Pull & recreate | Pull latest for current tag, then recreate |
| Tag badge | Update the image tag (edits `docker-compose.yml` or `.env`) |
| `Env` | Edit environment variables inline |
| `Logs` | Stream live logs in a panel |

### Build & Push

Go to the **Build** view. If you haven't set up projects yet, go to **Settings → Build Projects** first:

1. Add a project — give it a name, paste the repo URL, and set the build script filename (e.g. `backend-build.sh`)
2. Add parameters — each param maps to a CLI flag on your script (e.g. `-e prod`, `-m apis`)
3. Place your build script in `scripts/` (gitignored by default)

Then in the Build view: select a project, pick a branch, fill in the params, and click **Build**. Output streams live to the browser.

### Settings

All configuration after first run is done through Settings:

- **Servers** — add/edit server hosts, SSH credentials, compose stack paths
- **GitLab** — set your PAT for fetching branches in the Build view
- **Build Projects** — manage project definitions and build param schemas
- **Notifications** — configure webhook or email alerts on deploys
- **AWS** — set credentials and Security Group IDs for the IP whitelist tool

## Architecture

```
Browser (React + Vite)
    │  HTTP / WebSocket
    ▼
Express Backend (Node.js)
    │  SSH (ssh2 library)
    ▼
Remote Server (docker compose)
    ├── docker-compose.yml
    └── .env (optional)
```

- **Backend** reads and writes files on the remote server over SSH. No files are edited with `sed` or `awk` — the backend reads the full file, parses it in Node.js (YAML via `js-yaml`, `.env` by line splitting), modifies the in-memory object, serializes it back, and writes the entire file via a base64 pipe to avoid shell escaping issues.
- **Frontend** is a React SPA that polls the backend for container state and streams logs/build output.
- **Database** is SQLite — stores server credentials, stack paths, deploy history, notification targets, and app config.

## How It Works

For a detailed explanation of every action flow (what SSH commands run, how files are read and written, YAML parsing, env file handling), see [INTERNALS.md](INTERNALS.md).

## Project Structure

```
dockyard/
├── backend/
│   ├── server.js           # Express + WebSocket server
│   ├── db.js               # SQLite schema + config migration
│   ├── routes/             # REST API endpoints
│   └── services/           # SSH, Docker, Git, Compose, History
├── frontend/
│   └── src/
│       ├── AppShell.jsx    # Main app shell, routing, theme
│       ├── api.js          # HTTP + streaming client helpers
│       └── components/     # UI components
├── scripts/                # Build scripts (user-provided, *-build.sh gitignored)
├── secret-keys/            # SSH keys (gitignored)
├── data/                   # SQLite database (gitignored)
├── config.example.json     # Template config
└── docker-compose.yml      # Run the dashboard itself in Docker
```

## Contributing

This is a side project. If you find it useful and want to contribute:

1. Fork the repo
2. Create a feature branch
3. Test your changes in an isolated environment
4. Open a PR

Bug reports and suggestions are welcome in Issues.

## License

MIT
