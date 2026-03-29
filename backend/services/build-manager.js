// backend/services/build-manager.js
const { EventEmitter } = require('events');
const db = require('../db');
const { spawnBuild, spawnClone, checkoutAndPull, getRecentCommits } = require('./git');

const emitter = new EventEmitter();
emitter.setMaxListeners(100);

// runId → ChildProcess
const activeProcesses = new Map();

// cancelledRuns: set of runIds explicitly cancelled — so the natural 'close' event
// maps to 'cancelled' rather than 'failed', avoiding a double-finishRun race.
const cancelledRuns = new Set();

// Global build queue — only one build runs at a time.
const buildQueue = [];   // [{ project, branch, args, awsEnv, runId, buildNumber }]
let buildRunning = false;

function nextBuildNumber(project) {
  const row = db.prepare(
    'SELECT MAX(build_number) as n FROM build_runs WHERE project = ?'
  ).get(project);
  return (row.n || 0) + 1;
}

function appendLog(runId, chunk) {
  db.prepare('UPDATE build_runs SET log = log || ? WHERE id = ?').run(chunk, runId);
  emitter.emit(`run:${runId}:chunk`, chunk);
}

function finishRun(runId, exitCode) {
  if (!activeProcesses.has(runId) && !cancelledRuns.has(runId)) return;
  const runRow = db.prepare('SELECT type FROM build_runs WHERE id = ?').get(runId);
  const status = cancelledRuns.has(runId) ? 'cancelled'
    : exitCode === 0 ? 'success' : 'failed';
  cancelledRuns.delete(runId);
  db.prepare(
    "UPDATE build_runs SET status = ?, exit_code = ?, finished_at = datetime('now') WHERE id = ?"
  ).run(status, exitCode, runId);
  activeProcesses.delete(runId);
  emitter.emit(`run:${runId}:done`, { exitCode, status });
  if (runRow?.type === 'build') _dequeueNext();
}

function _dequeueNext() {
  if (buildQueue.length === 0) {
    buildRunning = false;
    return;
  }
  buildRunning = true;
  const { project, branch, args, awsEnv, runId, buildNumber } = buildQueue.shift();
  db.prepare("UPDATE build_runs SET status = 'running', started_at = datetime('now') WHERE id = ?").run(runId);
  _runBuild(project, branch, args, awsEnv, runId, buildNumber);
}

// Internal: execute a build that has already been inserted into build_runs.
// Called both for immediate runs and when dequeuing.
function _runBuild(project, branch, args, awsEnv, runId, buildNumber) {
  const cfgRow = db.prepare("SELECT value_json FROM app_config WHERE key = 'projects'").get();
  const projects = cfgRow ? JSON.parse(cfgRow.value_json) : {};
  const proj = projects[project];
  if (!proj) {
    appendLog(runId, `ERROR: Project '${project}' not found\n`);
    db.prepare("UPDATE build_runs SET status = 'failed', exit_code = 1, finished_at = datetime('now') WHERE id = ?").run(runId);
    emitter.emit(`run:${runId}:done`, { exitCode: 1, status: 'failed' });
    _dequeueNext();
    return;
  }

  appendLog(runId, `Checking out ${branch}...\n`);
  try {
    checkoutAndPull(project, branch);
  } catch (err) {
    appendLog(runId, `ERROR: ${err.message}\n`);
    db.prepare("UPDATE build_runs SET status = 'failed', exit_code = 1, finished_at = datetime('now') WHERE id = ?").run(runId);
    emitter.emit(`run:${runId}:done`, { exitCode: 1, status: 'failed' });
    _dequeueNext();
    return;
  }

  const commits = getRecentCommits(project);
  db.prepare('UPDATE build_runs SET commits_json = ? WHERE id = ?').run(JSON.stringify(commits), runId);

  appendLog(runId, `Running ${proj.buildScript}...\n`);
  activeProcesses.set(runId, null);
  const proc = spawnBuild(
    project, proj.buildScript, args,
    (chunk) => appendLog(runId, chunk),
    (code) => finishRun(runId, code),
    awsEnv
  );
  activeProcesses.set(runId, proc);
}

function startBuildRun(project, branch, args, awsEnv) {
  const buildNumber = nextBuildNumber(project);
  const status = buildRunning ? 'queued' : 'running';

  const info = db.prepare(
    "INSERT INTO build_runs (project, build_number, type, status, branch, args_json, started_at) VALUES (?, ?, 'build', ?, ?, ?, datetime('now'))"
  ).run(project, buildNumber, status, branch, JSON.stringify(args));
  const runId = info.lastInsertRowid;

  if (buildRunning) {
    buildQueue.push({ project, branch, args, awsEnv, runId, buildNumber });
    return { runId, buildNumber, queued: true };
  }

  buildRunning = true;
  _runBuild(project, branch, args, awsEnv, runId, buildNumber);
  return { runId, buildNumber, queued: false };
}

function startCloneRun(project, repoUrl, token) {
  const buildNumber = nextBuildNumber(project);
  const info = db.prepare(
    "INSERT INTO build_runs (project, build_number, type, status, started_at) VALUES (?, ?, 'clone', 'running', datetime('now'))"
  ).run(project, buildNumber);
  const runId = info.lastInsertRowid;

  appendLog(runId, `Cloning ${repoUrl}...\n`);
  activeProcesses.set(runId, null); // placeholder so finishRun sees it as active
  const proc = spawnClone(
    project, repoUrl, token,
    (chunk) => appendLog(runId, chunk),
    (code) => finishRun(runId, code)
  );
  activeProcesses.set(runId, proc);
  return { runId, buildNumber };
}

function cancelRun(runId) {
  if (!activeProcesses.has(runId)) return false;
  const proc = activeProcesses.get(runId);
  cancelledRuns.add(runId);
  appendLog(runId, '\n[Cancelled by user]\n');
  if (proc) {
    try {
      process.kill(-proc.pid, 'SIGTERM');
    } catch {
      proc.kill('SIGTERM');
    }
  }
  return true;
}

function subscribeRun(runId, onChunk, onDone) {
  const chunkKey = `run:${runId}:chunk`;
  const doneKey = `run:${runId}:done`;

  const doneWrapper = (result) => {
    emitter.off(chunkKey, onChunk);
    onDone(result);
  };

  emitter.on(chunkKey, onChunk);
  emitter.once(doneKey, doneWrapper);

  return () => {
    emitter.off(chunkKey, onChunk);
    emitter.off(doneKey, doneWrapper);
  };
}

module.exports = { startBuildRun, startCloneRun, cancelRun, subscribeRun };
