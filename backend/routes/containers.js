const router = require('express').Router();
const db = require('../db');
const { connect, exec, readFile, writeFile } = require('../services/ssh');
const { detectMode, extractVarName, updateImageInCompose, updateEnvVar, addEnvVarToCompose, setManagedLabelInCompose } = require('../services/compose');
const { setNote } = require('../notes');
const { getNote } = require('../notes');
const { writeHistory } = require('../services/history');
const { notifyDeploy } = require('../services/notify');
const path = require('path').posix;

const MANAGED_PASSWORD_ENV_KEYS = ['NAMAA_MANAGED_PASSWORD', 'DOCKYARD_MANAGED_PASSWORD'];

const ECR_REGISTRY_RE = /^(\d+\.dkr\.ecr\.([\w-]+)\.amazonaws\.com)\//;

function getAwsConfig() {
  const row = db.prepare("SELECT value_json FROM app_config WHERE key = 'awsSg'").get();
  return row ? JSON.parse(row.value_json) : {};
}

async function ecrLoginIfNeeded(conn, image) {
  const m = ECR_REGISTRY_RE.exec(image);
  if (!m) return;
  const registry = m[1];
  const region = m[2];
  const cfg = getAwsConfig();
  const envPrefix = cfg.accessKeyId && cfg.secretAccessKey
    ? `AWS_ACCESS_KEY_ID=${cfg.accessKeyId} AWS_SECRET_ACCESS_KEY=${cfg.secretAccessKey} AWS_DEFAULT_REGION=${region} `
    : '';
  await exec(conn, `${envPrefix}aws ecr get-login-password --region ${region} | docker login --username AWS --password-stdin ${registry}`);
}

function getServerConfig(server) {
  return {
    host: server.host,
    ssh: {
      username: server.ssh_username,
      password: server.ssh_password || undefined,
      privateKeyPath: server.ssh_key_path || undefined,
      privateKey: server.ssh_key_content ? Buffer.from(server.ssh_key_content, 'base64') : undefined,
      passphrase: server.ssh_passphrase || undefined,
    },
  };
}

function readManagedPasswordFromAppEnv() {
  for (const key of MANAGED_PASSWORD_ENV_KEYS) {
    if (process.env[key]) return process.env[key];
  }
  return null;
}

router.post('/:env/:containerName/restart', async (req, res) => {
  const { env, containerName } = req.params;
  const { stackPath, serviceName, stackName = '' } = req.body;
  const server = db.prepare('SELECT * FROM servers WHERE env_key = ?').get(env);
  if (!server) return res.status(404).json({ error: `Unknown environment: ${env}` });
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
  const startTime = Date.now();
  const noteSnapshot = getNote(env, containerName);
  try {
    const conn = await connect(env, serverCfg);
    await exec(conn, `${dc} -f "${stackPath}" restart "${serviceName}"`);
    writeHistory({ env, containerName, serviceName, stackPath, stackName, action: 'restart', success: true, durationMs: Date.now() - startTime, noteSnapshot });
    notifyDeploy({ env, container: containerName, action: 'restart', durationMs: Date.now() - startTime, success: true }).catch(() => {});
    res.json({ ok: true });
  } catch (err) {
    writeHistory({ env, containerName, serviceName, stackPath, stackName, action: 'restart', success: false, errorMessage: err.message, noteSnapshot });
    notifyDeploy({ env, container: containerName, action: 'restart', success: false, error: err.message }).catch(() => {});
    res.status(500).json({ error: err.message });
  }
});

router.post('/:env/:containerName/stop', async (req, res) => {
  const { env, containerName } = req.params;
  const { stackPath, serviceName, stackName = '' } = req.body;
  const server = db.prepare('SELECT * FROM servers WHERE env_key = ?').get(env);
  if (!server) return res.status(404).json({ error: `Unknown environment: ${env}` });
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
  const startTime = Date.now();
  const noteSnapshot = getNote(env, containerName);
  try {
    const conn = await connect(env, serverCfg);
    await exec(conn, `${dc} -f "${stackPath}" stop "${serviceName}"`);
    writeHistory({ env, containerName, serviceName, stackPath, stackName, action: 'stop', success: true, durationMs: Date.now() - startTime, noteSnapshot });
    notifyDeploy({ env, container: containerName, action: 'stop', durationMs: Date.now() - startTime, success: true }).catch(() => {});
    res.json({ ok: true });
  } catch (err) {
    writeHistory({ env, containerName, serviceName, stackPath, stackName, action: 'stop', success: false, errorMessage: err.message, noteSnapshot });
    notifyDeploy({ env, container: containerName, action: 'stop', success: false, error: err.message }).catch(() => {});
    res.status(500).json({ error: err.message });
  }
});

router.post('/:env/:containerName/up', async (req, res) => {
  const { env, containerName } = req.params;
  const { stackPath, serviceName, forceRecreate, stackName = '' } = req.body;
  const server = db.prepare('SELECT * FROM servers WHERE env_key = ?').get(env);
  if (!server) return res.status(404).json({ error: `Unknown environment: ${env}` });
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
  const startTime = Date.now();
  const noteSnapshot = getNote(env, containerName);
  try {
    const conn = await connect(env, serverCfg);
    const flag = forceRecreate ? '--force-recreate' : '';
    await exec(conn, `${dc} -f "${stackPath}" up -d ${flag} "${serviceName}"`);
    const upAction = forceRecreate ? 'force-recreate' : 'up';
    writeHistory({ env, containerName, serviceName, stackPath, stackName, action: upAction, success: true, durationMs: Date.now() - startTime, noteSnapshot });
    notifyDeploy({ env, container: containerName, action: upAction, durationMs: Date.now() - startTime, success: true }).catch(() => {});
    res.json({ ok: true });
  } catch (err) {
    const upActionFail = forceRecreate ? 'force-recreate' : 'up';
    writeHistory({ env, containerName, serviceName, stackPath, stackName, action: upActionFail, success: false, errorMessage: err.message, noteSnapshot });
    notifyDeploy({ env, container: containerName, action: upActionFail, success: false, error: err.message }).catch(() => {});
    res.status(500).json({ error: err.message });
  }
});

router.post('/:env/:containerName/pull-recreate', async (req, res) => {
  const { env, containerName } = req.params;
  const { stackPath, serviceName, stackName = '' } = req.body;
  const server = db.prepare('SELECT * FROM servers WHERE env_key = ?').get(env);
  if (!server) return res.status(404).json({ error: `Unknown environment: ${env}` });
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
  const startTime = Date.now();
  const noteSnapshot = getNote(env, containerName);
  try {
    const conn = await connect(env, serverCfg);
    const composeContentForEcr = await readFile(conn, stackPath).catch(() => '');
    const composeDocForEcr = require('js-yaml').load(composeContentForEcr);
    const imageForEcr = composeDocForEcr?.services?.[serviceName]?.image || '';
    await ecrLoginIfNeeded(conn, imageForEcr);
    await exec(conn, `${dc} -f "${stackPath}" pull "${serviceName}"`);
    await exec(conn, `${dc} -f "${stackPath}" up -d --force-recreate "${serviceName}"`);
    writeHistory({ env, containerName, serviceName, stackPath, stackName, action: 'pull-recreate', success: true, durationMs: Date.now() - startTime, noteSnapshot });
    notifyDeploy({ env, container: containerName, action: 'pull-recreate', durationMs: Date.now() - startTime, success: true }).catch(() => {});
    res.json({ ok: true });
  } catch (err) {
    writeHistory({ env, containerName, serviceName, stackPath, stackName, action: 'pull-recreate', success: false, errorMessage: err.message, noteSnapshot });
    notifyDeploy({ env, container: containerName, action: 'pull-recreate', success: false, error: err.message }).catch(() => {});
    res.status(500).json({ error: err.message });
  }
});

router.post('/:env/:containerName/toggle-managed', async (req, res) => {
  const { env, containerName } = req.params;
  const { stackPath, serviceName, password, enabled, stackName = '' } = req.body;
  const server = db.prepare('SELECT * FROM servers WHERE env_key = ?').get(env);
  if (!server) return res.status(404).json({ error: `Unknown environment: ${env}` });
  if (!stackPath || !serviceName) return res.status(400).json({ error: 'stackPath and serviceName are required' });

  const serverCfg = getServerConfig(server);
  const dc = server.docker_compose_cmd || 'docker compose';
  const startTime = Date.now();
  const noteSnapshot = getNote(env, containerName);
  const action = enabled ? 'set-managed' : 'unset-managed';

  try {
    const conn = await connect(env, serverCfg);
    const expectedPassword = readManagedPasswordFromAppEnv();

    if (!expectedPassword) {
      return res.status(400).json({ error: `Managed password is not configured in Dockyard environment. Expected one of: ${MANAGED_PASSWORD_ENV_KEYS.join(', ')}` });
    }
    if (!password || password !== expectedPassword) {
      return res.status(403).json({ error: 'Invalid managed password' });
    }

    const composeContent = await readFile(conn, stackPath);
    const updatedCompose = setManagedLabelInCompose(composeContent, serviceName, !!enabled);
    await writeFile(conn, stackPath, updatedCompose);
    await exec(conn, `${dc} -f "${stackPath}" up -d "${serviceName}"`);

    writeHistory({ env, containerName, serviceName, stackPath, stackName, action, success: true, durationMs: Date.now() - startTime, noteSnapshot });
    notifyDeploy({ env, container: containerName, action, durationMs: Date.now() - startTime, success: true }).catch(() => {});
    res.json({ ok: true, managed: !!enabled });
  } catch (err) {
    writeHistory({ env, containerName, serviceName, stackPath, stackName, action, success: false, errorMessage: err.message, noteSnapshot });
    notifyDeploy({ env, container: containerName, action, success: false, error: err.message }).catch(() => {});
    res.status(500).json({ error: err.message });
  }
});

router.post('/:env/:containerName/update-tag', async (req, res) => {
  const { env, containerName } = req.params;
  const { stackPath, serviceName, newTag, note, stackName = '' } = req.body;
  const server = db.prepare('SELECT * FROM servers WHERE env_key = ?').get(env);
  if (!server) return res.status(404).json({ error: `Unknown environment: ${env}` });
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
  const startTime = Date.now();
  const noteSnapshot = getNote(env, containerName);
  try {
    const conn = await connect(env, serverCfg);
    const composeContent = await readFile(conn, stackPath);
    const composeDoc = require('js-yaml').load(composeContent);
    const imageLine = composeDoc.services?.[serviceName]?.image || '';
    const mode = detectMode(imageLine);

    let oldTag = null;
    if (mode === 'env') {
      const varName = extractVarName(imageLine);
      const envPath = path.join(path.dirname(stackPath), '.env');
      const envContent = await readFile(conn, envPath).catch(() => '');
      oldTag = (envContent.match(new RegExp(`^${varName}=(.+)$`, 'm')) || [])[1] ?? null;
      const updated = updateEnvVar(envContent, varName, newTag);
      await writeFile(conn, envPath, updated);
    } else {
      oldTag = imageLine.split(':')[1] ?? null;
      const updated = updateImageInCompose(composeContent, serviceName, newTag);
      await writeFile(conn, stackPath, updated);
    }

    await ecrLoginIfNeeded(conn, imageLine);
    await exec(conn, `${dc} -f "${stackPath}" up -d --pull always --force-recreate "${serviceName}"`);
    if (note !== undefined) setNote(env, containerName, note);
    writeHistory({ env, containerName, serviceName, stackPath, stackName, action: 'update-tag', oldTag, newTag, success: true, durationMs: Date.now() - startTime, noteSnapshot });
    notifyDeploy({ env, container: containerName, action: 'update-tag', fromTag: oldTag, toTag: newTag, durationMs: Date.now() - startTime, success: true }).catch(() => {});
    res.json({ ok: true });
  } catch (err) {
    writeHistory({ env, containerName, serviceName, stackPath, stackName, action: 'update-tag', success: false, errorMessage: err.message, noteSnapshot });
    notifyDeploy({ env, container: containerName, action: 'update-tag', success: false, error: err.message }).catch(() => {});
    res.status(500).json({ error: err.message });
  }
});

router.post('/:env/:containerName/update-env', async (req, res) => {
  const { env, containerName } = req.params;
  const { stackPath, serviceName, key, value, stackName = '' } = req.body;
  const server = db.prepare('SELECT * FROM servers WHERE env_key = ?').get(env);
  if (!server) return res.status(404).json({ error: `Unknown environment: ${env}` });
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
  const startTime = Date.now();
  const noteSnapshot = getNote(env, containerName);
  try {
    const conn = await connect(env, serverCfg);
    const composeContent = await readFile(conn, stackPath);
    const composeDoc = require('js-yaml').load(composeContent);
    const service = composeDoc.services?.[serviceName];
    const envEntry = Array.isArray(service?.environment)
      ? service.environment.find(e => e.startsWith(`${key}=`))
      : service?.environment?.[key];

    if (envEntry && typeof envEntry === 'string' && envEntry.includes('${')) {
      // env-file mode
      const envPath = path.join(path.dirname(stackPath), '.env');
      const envContent = await readFile(conn, envPath).catch(() => '');
      const updated = updateEnvVar(envContent, key, value);
      await writeFile(conn, envPath, updated);
    } else {
      const updated = addEnvVarToCompose(composeContent, serviceName, key, value);
      await writeFile(conn, stackPath, updated);
    }

    await exec(conn, `${dc} -f "${stackPath}" up -d "${serviceName}"`);
    writeHistory({ env, containerName, serviceName, stackPath, stackName, action: 'update-env', success: true, durationMs: Date.now() - startTime, noteSnapshot });
    notifyDeploy({ env, container: containerName, action: 'update-env', durationMs: Date.now() - startTime, success: true }).catch(() => {});
    res.json({ ok: true });
  } catch (err) {
    writeHistory({ env, containerName, serviceName, stackPath, stackName, action: 'update-env', success: false, errorMessage: err.message, noteSnapshot });
    notifyDeploy({ env, container: containerName, action: 'update-env', success: false, error: err.message }).catch(() => {});
    res.status(500).json({ error: err.message });
  }
});

router.post('/:env/:containerName/note', async (req, res) => {
  const { env, containerName } = req.params;
  const { note } = req.body;
  setNote(env, containerName, note);
  res.json({ ok: true });
});

module.exports = router;
