const { WebSocketServer } = require('ws');
const db = require('../db');
const { connect } = require('../services/ssh');
const { subscribeRun } = require('../services/build-manager');

module.exports = function attachLogs(httpServer) {
  // Single WSS instance — ws@8.x aborts the socket if a path-filtered WSS
  // doesn't match, preventing a second WSS from ever receiving the upgrade.
  // Route manually instead.
  const wss = new WebSocketServer({ server: httpServer });

  wss.on('connection', async (ws, req) => {
    const url = new URL(req.url, 'http://localhost');
    const pathname = url.pathname;

    if (pathname === '/ws/builds') {
      handleBuildWs(ws, url);
      return;
    }

    if (pathname !== '/ws/logs') {
      ws.close();
      return;
    }

    // ── Container log streaming (/ws/logs) ──────────────────────────────
    // Parse query params: ?env=prod&container=frontend
    const env = url.searchParams.get('env');
    const container = url.searchParams.get('container');

    if (!env || !container) {
      ws.send(JSON.stringify({ type: 'error', message: 'env and container required' }));
      return ws.close();
    }

    const server = db.prepare('SELECT * FROM servers WHERE env_key = ?').get(env);
    if (!server) {
      ws.send(JSON.stringify({ type: 'error', message: `Unknown env: ${env}` }));
      return ws.close();
    }
    const serverCfg = {
      host: server.host,
      ssh: {
        username: server.ssh_username,
        password: server.ssh_password || undefined,
        privateKeyPath: server.ssh_key_path || undefined,
        privateKey: server.ssh_key_content ? Buffer.from(server.ssh_key_content, 'base64') : undefined,
        passphrase: server.ssh_passphrase || undefined,
      },
    };

    let stream;
    try {
      const conn = await connect(env, serverCfg);
      conn.exec(`docker logs --tail=200 -f ${container}`, (err, s) => {
        if (err) {
          ws.send(JSON.stringify({ type: 'error', message: err.message }));
          return ws.close();
        }
        stream = s;
        s.on('data', (d) => {
          if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'line', text: d.toString() }));
        });
        s.stderr.on('data', (d) => {
          if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'line', text: d.toString() }));
        });
        s.on('close', () => {
          if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'closed' }));
        });
      });
    } catch (err) {
      ws.send(JSON.stringify({ type: 'error', message: err.message }));
      return ws.close();
    }

    ws.on('close', () => {
      try { stream?.destroy?.(); } catch {}
    });
  });

  // ── Build run log streaming (/ws/builds) ────────────────────────────────
  function handleBuildWs(ws, url) {
    const runId = parseInt(url.searchParams.get('runId'), 10);

    if (!runId) {
      ws.send(JSON.stringify({ type: 'error', message: 'runId required' }));
      return ws.close();
    }

    const run = db.prepare('SELECT * FROM build_runs WHERE id = ?').get(runId);
    if (!run) {
      ws.send(JSON.stringify({ type: 'error', message: 'Run not found' }));
      return ws.close();
    }

    const send = (msg) => {
      if (ws.readyState === 1) ws.send(JSON.stringify(msg));
    };

    // Replay existing log
    if (run.log) send({ type: 'chunk', text: run.log });

    // If already finished, send done and close
    if (run.status !== 'running') {
      send({ type: 'done', status: run.status, exitCode: run.exit_code });
      return ws.close();
    }

    // Subscribe to live stream
    const unsub = subscribeRun(
      runId,
      (chunk) => send({ type: 'chunk', text: chunk }),
      ({ status, exitCode }) => {
        const freshRun = db.prepare('SELECT commits_json FROM build_runs WHERE id = ?').get(runId);
        send({ type: 'done', status, exitCode, commits_json: freshRun?.commits_json || null });
        ws.close();
      }
    );

    ws.on('close', unsub);
  }
};
