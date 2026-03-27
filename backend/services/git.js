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
  // Sort by most recent commit date (committerdate) so newest branches come first
  const output = execSync(
    'git branch -r --sort=-committerdate --format="%(refname:short)"',
    { cwd: dir }
  ).toString();
  return output.trim().split('\n')
    .map(b => b.trim().replace(/^origin\//, ''))
    .filter(b => b && b !== 'HEAD');
}

function checkoutAndPull(projectKey, branch) {
  if (!/^[\w.\-\/]+$/.test(branch)) throw new Error(`Invalid branch name: ${branch}`);
  const dir = repoDir(projectKey);
  // Use -B to create/reset local branch tracking origin/<branch>, avoids detached HEAD.
  // Then fetch and pull to ensure the local branch is at the latest remote state.
  execSync(`git checkout -B ${branch} origin/${branch}`, { cwd: dir, stdio: 'pipe' });
  execSync(`git fetch origin ${branch} --prune`, { cwd: dir, stdio: 'pipe' });
  execSync(`git pull --ff-only origin ${branch}`, { cwd: dir, stdio: 'pipe' });
}

function getRecentCommits(projectKey, n = 3) {
  const dir = repoDir(projectKey);
  try {
    // Use ASCII unit-separator (x1F) between fields, newline between entries
    const out = execSync(
      `git log -${n} --pretty=format:"%H%x1F%h%x1F%s%x1F%an%x1F%ar%n"`,
      { cwd: dir }
    ).toString().trim();
    if (!out) return [];
    return out.split('\n')
      .map(line => {
        const [hash, shortHash, subject, author, date] = line.split('\x1f');
        return { hash, shortHash, subject, author, date };
      })
      .filter(c => c.hash);
  } catch {
    return [];
  }
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
  const proc = spawn('bash', [scriptPath, ...args], {
    cwd: dir,
    env: { ...process.env, ...env },
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  proc.stdout.on('data', (d) => onData(d.toString()));
  proc.stderr.on('data', (d) => onData(d.toString()));
  proc.on('close', onClose);
  return proc;
}

module.exports = { ensureCloned, listBranches, checkoutAndPull, getRecentCommits, spawnBuild, spawnClone, repoDir };
