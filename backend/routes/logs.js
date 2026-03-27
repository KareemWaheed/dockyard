const { WebSocketServer } = require('ws');
const db = require('../db');
const { connect } = require('../services/ssh');
const { subscribeRun } = require('../services/build-manager');

module.exports = function attachLogs(httpServer) {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws/logs' });

  wss.on('connection', async (ws, req) => {
    // Parse query params: ?env=prod&container=frontend
    const url = new URL(req.url, 'http://localhost');
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

  // ── Build run logs ───────────────────────────────────────────────────────
  const buildWss = new WebSocketServer({ server: httpServer, path: '/ws/builds' });

  buildWss.on('connection', (ws, req) => {
    const url = new URL(req.url, 'http://localhost');
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
        send({ type: 'done', status, exitCode });
        ws.close();
      }
    );

    ws.on('close', unsub);
  });
};
