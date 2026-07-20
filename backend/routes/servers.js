const router = require('express').Router();
const { spawn } = require('child_process');
const db = require('../db');
const { connect, exec } = require('../services/ssh');
const { parseComposePs, parseBatchInspect } = require('../services/docker');
const { getNote } = require('../notes');
const { decryptField } = require('../encryption');

router.get('/:env/containers', async (req, res) => {
  const { env } = req.params;

  const server = db.prepare('SELECT * FROM servers WHERE env_key = ?').get(env);
  if (!server) return res.status(404).json({ error: `Unknown environment: ${env}` });
  const stacks = db.prepare('SELECT * FROM compose_stacks WHERE server_id = ?').all(server.id);

  // Build serverCfg in the shape ssh.js / connect() expects
  const sshPassword = decryptField(server.ssh_password);
  const sshKeyContent = decryptField(server.ssh_key_content);
  const sshPassphrase = decryptField(server.ssh_passphrase);

  const serverCfg = {
    host: server.host,
    ssh: {
      username: server.ssh_username,
      password: sshPassword || undefined,
      privateKeyPath: server.ssh_key_path || undefined,
      privateKey: sshKeyContent ? Buffer.from(sshKeyContent, 'base64') : undefined,
      passphrase: sshPassphrase || undefined,
    },
  };
  const dc = server.docker_compose_cmd || 'docker compose';

  try {
    const conn = await connect(env, serverCfg);
    const result = [];

    for (const stack of stacks) {
      const psOutput = await exec(conn, `${dc} -f "${stack.path}" ps --all --format json`);
      const containers = parseComposePs(psOutput);

      let inspectMap = {};
      if (containers.length) {
        try {
          const names = containers.map(c => `"${c.name}"`).join(' ');
          const inspectOutput = await exec(conn, `docker inspect ${names}`);
          inspectMap = parseBatchInspect(inspectOutput);
        } catch {
          // fall through — containers will have managed: false
        }
      }

      let versionInfoCfg = {};
      try { versionInfoCfg = JSON.parse(stack.version_info_json || '{}'); } catch {}

      // Version info is fetched lazily (on-demand, see POST /:env/:containerName/version-info)
      // rather than on every poll — it rarely changes and an extra `exec` per configured
      // service on every 30s refresh doesn't pay for itself.
      const enriched = containers.map(c => {
        const info = inspectMap[c.name];
        const base = info
          ? { ...c, ...info, note: getNote(env, c.name), stackPath: stack.path, stackName: stack.name }
          : { ...c, managed: false, env: {}, note: '', stackPath: stack.path, stackName: stack.name };

        if (versionInfoCfg[c.serviceName]?.path) base.hasVersionInfo = true;
        return base;
      });

      result.push({ name: stack.name, path: stack.path, containers: enriched });
    }

    // Collect all compose container names to identify standalone ones
    const composeNames = new Set(result.flatMap(s => s.containers.map(c => c.name)));

    // Fetch ALL containers on the host
    let standaloneContainers = [];
    try {
      const allPsOutput = await exec(conn, 'docker ps -a --format "{{json .}}"');
      const allLines = allPsOutput.trim().split('\n').filter(Boolean);
      const allNames = allLines.map(line => {
        const item = JSON.parse(line);
        return item.Names || item.Name || '';
      }).filter(Boolean);

      // Filter out compose-managed containers
      const standaloneNames = allNames.filter(n => !composeNames.has(n));

      if (standaloneNames.length) {
        const names = standaloneNames.map(n => `"${n}"`).join(' ');
        try {
          const inspectOutput = await exec(conn, `docker inspect ${names}`);
          const inspectMap = parseBatchInspect(inspectOutput);
          standaloneContainers = standaloneNames.map(n => {
            const info = inspectMap[n];
            if (info) {
              return { name: n, ...info, note: getNote(env, n), stackPath: null, stackName: null, standalone: true };
            }
            return { name: n, managed: false, env: {}, status: 'unknown', image: '', note: '', stackPath: null, stackName: null, standalone: true };
          });
        } catch {
          standaloneContainers = standaloneNames.map(n => ({
            name: n, managed: false, env: {}, status: 'unknown', image: '', note: '', stackPath: null, stackName: null, standalone: true,
          }));
        }
      }
    } catch {
      // docker ps failed — skip standalone detection
    }

    res.json({ env, stacks: result, standalone: standaloneContainers });
  } catch (err) {
    res.status(503).json({ error: err.message });
  }
});

// GET /api/servers/vpn-status
// Checks the fortivpn service state on the host machine
router.get('/vpn-status', (req, res) => {
  const proc = spawn('bash', ['-c', 'nsenter -t 1 -m -u -n -i -- systemctl is-active fortivpn']);
  let out = '';
  proc.stdout.on('data', (d) => { out += d; });
  proc.stderr.on('data', (d) => { out += d; });
  proc.on('close', () => {
    const status = out.trim() || 'unknown';
    res.json({ status, active: status === 'active' });
  });
});

// POST /api/servers/vpn/:action
// Runs start/stop/restart on the fortivpn service locally on the backend machine, streams output
const VPN_COMMANDS = {
  start: 'nsenter -t 1 -m -u -n -i -- systemctl daemon-reload && nsenter -t 1 -m -u -n -i -- systemctl start fortivpn',
  stop: 'nsenter -t 1 -m -u -n -i -- systemctl stop fortivpn',
  restart: 'nsenter -t 1 -m -u -n -i -- systemctl daemon-reload && nsenter -t 1 -m -u -n -i -- systemctl restart fortivpn',
};

router.post('/vpn/:action', (req, res) => {
  const cmd = VPN_COMMANDS[req.params.action];
  if (!cmd) return res.status(400).json({ error: `Unknown VPN action: ${req.params.action}` });

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Transfer-Encoding', 'chunked');

  const proc = spawn('bash', ['-c', cmd]);

  proc.stdout.on('data', (d) => res.write(d));
  proc.stderr.on('data', (d) => res.write(d));
  proc.on('close', (code) => {
    res.write(`\n__EXIT_CODE__${code}`);
    res.end();
  });
});

module.exports = router;
