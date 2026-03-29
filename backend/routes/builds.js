const router = require('express').Router();
const db = require('../db');
const { ensureCloned, listBranches, repoDir } = require('../services/git');
const { startBuildRun, startCloneRun, cancelRun } = require('../services/build-manager');
const fs = require('fs');
const path = require('path');

function getProjects() {
  const row = db.prepare("SELECT value_json FROM app_config WHERE key = 'projects'").get();
  return row ? JSON.parse(row.value_json) : {};
}
function getGitlabToken() {
  const row = db.prepare("SELECT value_json FROM app_config WHERE key = 'gitlab'").get();
  return row ? JSON.parse(row.value_json).token : '';
}
function getAwsEnv() {
  const row = db.prepare("SELECT value_json FROM app_config WHERE key = 'awsSg'").get();
  const cfg = row ? JSON.parse(row.value_json) : {};
  const env = {};
  if (cfg.accessKeyId) env.AWS_ACCESS_KEY_ID = cfg.accessKeyId;
  if (cfg.secretAccessKey) env.AWS_SECRET_ACCESS_KEY = cfg.secretAccessKey;
  if (cfg.region) { env.AWS_DEFAULT_REGION = cfg.region; env.AWS_REGION = cfg.region; }
  return env;
}
function writeAwsConfig() {
  const row = db.prepare("SELECT value_json FROM app_config WHERE key = 'awsSg'").get();
  const cfg = row ? JSON.parse(row.value_json) : {};
  if (!cfg.accessKeyId || !cfg.secretAccessKey) return;
  const home = process.env.HOME || '/root';
  const awsDir = `${home}/.aws`;
  fs.mkdirSync(awsDir, { recursive: true });
  fs.writeFileSync(`${awsDir}/credentials`,
    `[default]\naws_access_key_id=${cfg.accessKeyId}\naws_secret_access_key=${cfg.secretAccessKey}\n`);
  fs.writeFileSync(`${awsDir}/config`,
    `[default]\nregion=${cfg.region || 'us-east-1'}\n`);
}

// GET /api/builds/projects
router.get('/projects', (req, res) => {
  res.json(getProjects());
});

// GET /api/builds/:project/branches
router.get('/:project/branches', async (req, res) => {
  const { project } = req.params;
  const proj = getProjects()[project];
  if (!proj) return res.status(404).json({ error: 'Project not found' });

  if (!fs.existsSync(repoDir(project))) {
    return res.json({ branches: [], needsClone: true });
  }

  try {
    const branches = listBranches(project);
    res.json({ branches });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/builds/:project/clone — returns { runId, buildNumber } or { alreadyCloned: true }
router.post('/:project/clone', (req, res) => {
  const { project } = req.params;
  const proj = getProjects()[project];
  if (!proj) return res.status(404).json({ error: 'Project not found' });

  if (fs.existsSync(repoDir(project))) {
    return res.json({ alreadyCloned: true });
  }

  const { runId, buildNumber } = startCloneRun(project, proj.repo, getGitlabToken());
  res.json({ runId, buildNumber });
});

// POST /api/builds/:project — body: { branch, args } — returns { runId, buildNumber }
router.post('/:project', async (req, res) => {
  const { project } = req.params;
  const { branch, args = [] } = req.body;

  if (!branch || !/^[\w.\-\/]+$/.test(branch)) {
    return res.status(400).json({ error: 'Invalid branch name' });
  }
  const proj = getProjects()[project];
  if (!proj) return res.status(404).json({ error: 'Project not found' });

  try {
    await ensureCloned(project, proj.repo, getGitlabToken());
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }

  writeAwsConfig();
  const { runId, buildNumber } = startBuildRun(project, branch, args, getAwsEnv());
  res.json({ runId, buildNumber });
});

// GET /api/builds/:project/runs — list last 50 runs (no log)
router.get('/:project/runs', (req, res) => {
  const { project } = req.params;
  const runs = db.prepare(
    'SELECT id, project, build_number, type, status, exit_code, branch, args_json, commits_json, started_at, finished_at FROM build_runs WHERE project = ? ORDER BY id DESC LIMIT 50'
  ).all(project);
  res.json(runs);
});

// GET /api/builds/:project/runs/:num — single run with full log
router.get('/:project/runs/:num', (req, res) => {
  const { project, num } = req.params;
  const run = db.prepare(
    'SELECT * FROM build_runs WHERE project = ? AND build_number = ?'
  ).get(project, parseInt(num, 10));
  if (!run) return res.status(404).json({ error: 'Run not found' });
  res.json(run);
});

// POST /api/builds/:project/runs/:num/replay — re-run with identical params
router.post('/:project/runs/:num/replay', (req, res) => {
  const { project, num } = req.params;
  const run = db.prepare(
    'SELECT * FROM build_runs WHERE project = ? AND build_number = ?'
  ).get(project, parseInt(num, 10));
  if (!run) return res.status(404).json({ error: 'Run not found' });
  if (run.type !== 'build') return res.status(400).json({ error: 'Only build runs can be replayed' });

  writeAwsConfig();
  const args = (() => { try { return JSON.parse(run.args_json || '[]'); } catch { return []; } })();
  const { runId, buildNumber } = startBuildRun(project, run.branch, args, getAwsEnv());
  res.json({ runId, buildNumber });
});

// DELETE /api/builds/:project/runs/:num — cancel
router.delete('/:project/runs/:num', (req, res) => {
  const { project, num } = req.params;
  const run = db.prepare(
    'SELECT * FROM build_runs WHERE project = ? AND build_number = ?'
  ).get(project, parseInt(num, 10));
  if (!run) return res.status(404).json({ error: 'Run not found' });
  if (run.status !== 'running' && run.status !== 'queued') {
    return res.status(400).json({ error: 'Run is not active' });
  }
  const cancelled = cancelRun(run.id);
  res.json({ cancelled });
});

module.exports = router;
