const router = require('express').Router();
const db = require('../db');
const { ensureCloned, listBranches, checkoutAndPull, spawnBuild, spawnClone, repoDir } = require('../services/git');
const fs = require('fs');

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
  if (cfg.region) env.AWS_DEFAULT_REGION = cfg.region;
  return env;
}

// GET /api/builds/projects — return all projects with param schemas
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

// POST /api/builds/:project/clone — streams git clone output
router.post('/:project/clone', (req, res) => {
  const { project } = req.params;
  const proj = getProjects()[project];
  if (!proj) return res.status(404).json({ error: 'Project not found' });

  if (fs.existsSync(repoDir(project))) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.write('Repository already cloned.\n__EXIT_CODE__0');
    return res.end();
  }

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Transfer-Encoding', 'chunked');
  res.write(`Cloning ${proj.repo}...\n`);

  spawnClone(project, proj.repo, getGitlabToken(),
    (data) => res.write(data),
    (code) => {
      res.write(`\n__EXIT_CODE__${code}`);
      res.end();
    }
  );
});

// POST /api/builds/:project — body: { branch, args: [...] }
// Streams output as plain text (chunked)
router.post('/:project', async (req, res) => {
  const { project } = req.params;
  const { branch, args = [] } = req.body;
  if (!branch || !/^[\w.\-\/]+$/.test(branch)) {
    res.write('ERROR: Invalid branch name\n__EXIT_CODE__1');
    return res.end();
  }
  const proj = getProjects()[project];
  if (!proj) return res.status(404).json({ error: 'Project not found' });

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Transfer-Encoding', 'chunked');

  try {
    await ensureCloned(project, proj.repo, getGitlabToken());
    res.write(`Checking out ${branch}...\n`);
    checkoutAndPull(project, branch);
    res.write(`Running ${proj.buildScript}...\n`);
    spawnBuild(project, proj.buildScript, args,
      (data) => res.write(data),
      (code) => {
        res.write(`\n__EXIT_CODE__${code}`);
        res.end();
      },
      getAwsEnv()
    );
  } catch (err) {
    res.write(`ERROR: ${err.message}\n__EXIT_CODE__1`);
    res.end();
  }
});

module.exports = router;
