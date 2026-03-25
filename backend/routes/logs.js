const { WebSocketServer } = require('ws');
const db = require('../db');
const { connect } = require('../services/ssh');

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
};
