const { execSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const REPOS_DIR = path.join(__dirname, '..', '..', 'repos');

function repoDir(projectKey) {
  return path.join(REPOS_DIR, projectKey);
}

function buildAuthUrl(repoUrl, token) {
  // Insert oauth2:token@ after http:// or https://
  return repoUrl.replace(/^(https?:\/\/)/, `$1oauth2:${token}@`);
}

async function ensureCloned(projectKey, repoUrl, token) {
  const dir = repoDir(projectKey);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(REPOS_DIR, { recursive: true });
    const authUrl = buildAuthUrl(repoUrl, token);
    execSync(`git clone "${authUrl}" "${dir}"`, { stdio: 'inherit' });
  }
}

function listBranches(projectKey) {
  const dir = repoDir(projectKey);
  execSync('git fetch --all --prune', { cwd: dir, stdio: 'pipe' });
  const output = execSync('git branch -r --format="%(refname:short)"', { cwd: dir }).toString();
  return output.trim().split('\n')
    .map(b => b.trim().replace(/^origin\//, ''))
    .filter(b => b && b !== 'HEAD');
}

function checkoutAndPull(projectKey, branch) {
  if (!/^[\w.\-\/]+$/.test(branch)) throw new Error(`Invalid branch name: ${branch}`);
  const dir = repoDir(projectKey);
  // Use -B to create/reset local branch tracking origin/<branch>, avoids detached HEAD
  execSync(`git checkout -B ${branch} origin/${branch}`, { cwd: dir, stdio: 'pipe' });
}

function spawnClone(projectKey, repoUrl, token, onData, onClose) {
  const dir = repoDir(projectKey);
  fs.mkdirSync(REPOS_DIR, { recursive: true });
  const authUrl = buildAuthUrl(repoUrl, token);
  const proc = spawn('git', ['clone', '--progress', authUrl, dir]);
  proc.stdout.on('data', (d) => onData(d.toString()));
  proc.stderr.on('data', (d) => onData(d.toString())); // git clone writes progress to stderr
  proc.on('close', onClose);
  return proc;
}

function spawnBuild(projectKey, scriptName, args, onData, onClose, env = {}) {
  const dir = repoDir(projectKey);
  const scriptPath = path.join(dir, scriptName);
  const proc = spawn('bash', [scriptPath, ...args], { cwd: dir, env: { ...process.env, ...env } });
  proc.stdout.on('data', (d) => onData(d.toString()));
  proc.stderr.on('data', (d) => onData(d.toString()));
  proc.on('close', onClose);
  return proc;
}

module.exports = { ensureCloned, listBranches, checkoutAndPull, spawnBuild, spawnClone, repoDir };
