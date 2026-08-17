const { execFileSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const REPOS_DIR = path.join(__dirname, '..', '..', 'repos');

const GIT_ENV = {
  ...process.env,
  GIT_TERMINAL_PROMPT: '0',
  GIT_SSH_COMMAND: 'ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new',
};

function repoDir(projectKey) {
  return path.join(REPOS_DIR, projectKey);
}

// Branch is passed as an argv element (not shell-interpolated), so this only
// needs to block leading '-' (arg injection) and whitespace/control chars —
// not restrict to a narrow charset of "shell-safe" punctuation.
function isSafeBranchName(branch) {
  return typeof branch === 'string' && branch.length > 0
    && !branch.startsWith('-')
    && !/[\s\x00-\x1f]/.test(branch);
}

function buildAuthUrl(repoUrl, token) {
  if (!token) return repoUrl;
  // Insert oauth2:token@ after http:// or https://
  return repoUrl.replace(/^(https?:\/\/)/, `$1oauth2:${token}@`);
}

async function ensureCloned(projectKey, repoUrl, token) {
  const dir = repoDir(projectKey);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(REPOS_DIR, { recursive: true });
    const authUrl = buildAuthUrl(repoUrl, token);
    execFileSync('git', ['clone', authUrl, dir], {
      stdio: 'pipe',
      env: GIT_ENV,
      timeout: 120_000,
    });
  }
}

function listBranches(projectKey) {
  const dir = repoDir(projectKey);
  execFileSync('git', ['fetch', '--all', '--prune'], {
    cwd: dir,
    stdio: 'pipe',
    env: GIT_ENV,
    timeout: 30_000,
  });
  // Sort by most recent commit date (committerdate) so newest branches come first
  const output = execFileSync(
    'git',
    ['branch', '-r', '--sort=-committerdate', '--format=%(refname:short)'],
    { cwd: dir, env: GIT_ENV, timeout: 10_000 }
  ).toString();
  return output.trim().split('\n')
    .map(b => b.trim().replace(/^origin\//, ''))
    .filter(b => b && b !== 'HEAD');
}

function checkoutAndPull(projectKey, branch) {
  if (!isSafeBranchName(branch)) throw new Error(`Invalid branch name: ${branch}`);
  const dir = repoDir(projectKey);
  const opts = { cwd: dir, stdio: 'pipe', env: GIT_ENV, timeout: 60_000 };
  // Fetch latest branch state from origin first
  execFileSync('git', ['fetch', 'origin', branch, '--prune'], opts);
  // Discard uncommitted modifications and untracked artifacts left by prior builds,
  // so `checkout -B` below can't fail on a dirty working tree.
  execFileSync('git', ['reset', '--hard', 'HEAD'], opts);
  execFileSync('git', ['clean', '-fd'], opts);
  // Use -B to create/reset local branch tracking origin/<branch>, avoids detached HEAD.
  execFileSync('git', ['checkout', '-B', branch, `origin/${branch}`], opts);
  // Ensure local branch strictly matches origin/<branch>
  execFileSync('git', ['reset', '--hard', `origin/${branch}`], opts);
  execFileSync('git', ['clean', '-fd'], opts);
}

function getRecentCommits(projectKey, n = 3) {
  const dir = repoDir(projectKey);
  try {
    // Use ASCII unit-separator (x1F) between fields, newline between entries
    const out = execFileSync(
      'git',
      ['log', `-${n}`, '--pretty=format:%H%x1F%h%x1F%s%x1F%an%x1F%ar%n'],
      { cwd: dir, env: GIT_ENV, timeout: 10_000 }
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

function getRemoteUrl(projectKey) {
  const dir = repoDir(projectKey);
  if (!fs.existsSync(dir)) return null;
  try {
    const raw = execFileSync('git', ['remote', 'get-url', 'origin'], {
      cwd: dir,
      env: GIT_ENV,
      timeout: 5000,
    }).toString().trim();
    const cleanUrl = raw.replace(/oauth2:[^@]+@/, '');
    return { raw, cleanUrl };
  } catch {
    return null;
  }
}

function setRemoteUrl(projectKey, newRepoUrl, token) {
  const dir = repoDir(projectKey);
  if (!fs.existsSync(dir)) throw new Error('Repository is not cloned yet');
  const authUrl = token ? buildAuthUrl(newRepoUrl, token) : newRepoUrl;
  execFileSync('git', ['remote', 'set-url', 'origin', authUrl], {
    cwd: dir,
    env: GIT_ENV,
    timeout: 10_000,
  });
  return getRemoteUrl(projectKey);
}

function spawnClone(projectKey, repoUrl, token, onData, onClose) {
  const dir = repoDir(projectKey);
  fs.mkdirSync(REPOS_DIR, { recursive: true });
  const authUrl = buildAuthUrl(repoUrl, token);
  const proc = spawn('git', ['clone', '--progress', authUrl, dir], {
    env: GIT_ENV,
  });
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
    env: { ...process.env, ...GIT_ENV, ...env },
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  proc.stdout.on('data', (d) => onData(d.toString()));
  proc.stderr.on('data', (d) => onData(d.toString()));
  proc.on('close', onClose);
  return proc;
}

module.exports = {
  ensureCloned,
  listBranches,
  checkoutAndPull,
  getRecentCommits,
  getRemoteUrl,
  setRemoteUrl,
  spawnBuild,
  spawnClone,
  repoDir,
  isSafeBranchName,
  buildAuthUrl,
};
