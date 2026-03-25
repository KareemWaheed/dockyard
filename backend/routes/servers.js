const router = require('express').Router();
const db = require('../db');
const { connect, exec } = require('../services/ssh');
const { parseComposePs, parseBatchInspect } = require('../services/docker');
const { getNote } = require('../notes');

router.get('/:env/containers', async (req, res) => {
  const { env } = req.params;

  const server = db.prepare('SELECT * FROM servers WHERE env_key = ?').get(env);
  if (!server) return res.status(404).json({ error: `Unknown environment: ${env}` });
  const stacks = db.prepare('SELECT * FROM compose_stacks WHERE server_id = ?').all(server.id);

  // Build serverCfg in the shape ssh.js / connect() expects
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

      const enriched = containers.map(c => {
        const info = inspectMap[c.name];
        if (info) {
          return { ...c, ...info, note: getNote(env, c.name), stackPath: stack.path, stackName: stack.name };
        }
        return { ...c, managed: false, env: {}, note: '', stackPath: stack.path, stackName: stack.name };
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

module.exports = router;
