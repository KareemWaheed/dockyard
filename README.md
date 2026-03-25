# Namaa DevOps Dashboard

A self-hosted web dashboard for managing Docker Compose stacks across multiple remote servers. Restart containers, update image tags, edit environment variables, view logs, and trigger CI/CD builds — all from a single browser tab. Everything runs over SSH; no agent or daemon is needed on the target machines.

> **Disclaimer:** This project was mostly built with the help of [Claude Code](https://claude.ai) to solve specific internal needs at my team. It was never intended to be a public product, but I figured it might be useful to someone facing similar problems. If you have suggestions, fixes, or improvements — feel free to open an issue or PR.

> **Warning:** This tool runs real Docker and SSH commands on your servers. **Test it in an isolated environment first.** It is not fully tested across all edge cases, and there is no undo for destructive actions like stopping or recreating containers.

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

## Quick Start

### Prerequisites

- Node.js 18+
- SSH access to your target servers
- Docker and Docker Compose installed on the target servers

### Install

```bash
git clone https://github.com/youruser/namaa-devops.git
cd namaa-devops
npm run install:all
```

### Configure

```bash
cp config.example.json config.json
```

Edit `config.json` with your server details. See [config.example.json](config.example.json) for the full schema.

On first start, `config.json` is automatically migrated into SQLite and renamed to `config.json.bak`. After that, all configuration is managed through the **Settings** UI in the dashboard.

### SSH Keys

For servers using key-based auth, place `.pem` files in `secret-keys/` (gitignored) and set `privateKeyPath` in your config. Keys must be in OpenSSH PEM format — convert `.ppk` files with PuTTYgen if needed.

### Run

```bash
npm start
```

This starts both the backend (port 3001) and frontend dev server (port 3000).

### Docker

```bash
docker compose up -d
```

## Configuration

The initial config is a JSON file with three sections:

| Section | Purpose |
|---|---|
| `servers` | One entry per environment (dev, staging, prod) — hostname, SSH credentials, and paths to compose files |
| `projects` | Git repos, build scripts, and parameterized build forms (defined in Settings → Build Projects) |
| `gitlab` | GitLab personal access token (`read_repository` scope) for fetching branches |

Each server can have multiple `composeStacks` — each pointing to a different `docker-compose.yml` on that machine.

Set `dockerCompose` to `"docker-compose"` (hyphenated) for older servers that don't have the Docker Compose V2 plugin.

See [config.example.json](config.example.json) for a complete example.

## How It Works

For a detailed explanation of every action flow (what SSH commands run, how files are read and written, YAML parsing, env file handling), see [INTERNALS.md](INTERNALS.md).

## Project Structure

```
namaa-devops/
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
