// backend/services/flyway-manager.js
const { EventEmitter } = require('events');
const { spawn } = require('child_process');
const path = require('path');
const db = require('../db');
const { checkoutAndPull, repoDir } = require('./git');

const emitter = new EventEmitter();
emitter.setMaxListeners(100);

// runId → ChildProcess (or null placeholder while starting)
const activeProcesses = new Map();
const cancelledRuns = new Set();

function nextRunNumber() {
  const row = db.prepare('SELECT MAX(run_number) as n FROM flyway_runs').get();
  return (row.n || 0) + 1;
}

function appendLog(runId, chunk) {
  db.prepare('UPDATE flyway_runs SET log = log || ? WHERE id = ?').run(chunk, runId);
  emitter.emit(`flyway:${runId}:chunk`, chunk);
}

function finishRun(runId, exitCode) {
  if (!activeProcesses.has(runId) && !cancelledRuns.has(runId)) return;
  const status = cancelledRuns.has(runId) ? 'cancelled'
    : exitCode === 0 ? 'success' : 'failed';
  cancelledRuns.delete(runId);
  db.prepare(
    "UPDATE flyway_runs SET status = ?, exit_code = ?, finished_at = datetime('now') WHERE id = ?"
  ).run(status, exitCode, runId);
  activeProcesses.delete(runId);
  emitter.emit(`flyway:${runId}:done`, { exitCode, status });
}

function getProjects() {
  const row = db.prepare("SELECT value_json FROM app_config WHERE key = 'projects'").get();
  return row ? JSON.parse(row.value_json) : {};
}

function startFlywayRun(envId, dbId, project, branch, command) {
  const env = db.prepare('SELECT * FROM flyway_envs WHERE id = ?').get(envId);
  const dbCfg = db.prepare('SELECT * FROM flyway_databases WHERE id = ?').get(dbId);
  if (!env || !dbCfg) throw new Error('Environment or database not found');

  const projects = getProjects();
  const proj = projects[project];
  if (!proj || !proj.isFlyway) throw new Error(`Project '${project}' is not a flyway project`);

  const runNumber = nextRunNumber();
  const info = db.prepare(
    "INSERT INTO flyway_runs (run_number, env_id, db_id, project, branch, command, status, started_at) VALUES (?, ?, ?, ?, ?, ?, 'running', datetime('now'))"
  ).run(runNumber, envId, dbId, project, branch, command);
  const runId = info.lastInsertRowid;

  // Checkout branch (synchronous — same pattern as build-manager)
  appendLog(runId, `Checking out ${branch}...\n`);
  try {
    checkoutAndPull(project, branch);
  } catch (err) {
    appendLog(runId, `ERROR: ${err.message}\n`);
    db.prepare("UPDATE flyway_runs SET status = 'failed', exit_code = 1, finished_at = datetime('now') WHERE id = ?").run(runId);
    emitter.emit(`flyway:${runId}:done`, { exitCode: 1, status: 'failed' });
    return { runId, runNumber };
  }

  // Build working directory: repos/<project>/<flywayPath>
  const workDir = proj.flywayPath
    ? path.join(repoDir(project), proj.flywayPath)
    : repoDir(project);

  // Build mvn args — password is masked in the logged line
  const mvnArgs = [
    `-Dflyway.url=${dbCfg.url}`,
    `-Dflyway.user=${dbCfg.db_user}`,
    `-Dflyway.password=${dbCfg.db_password}`,
    `-Dflyway.schemas=${dbCfg.schemas}`,
    `-Dflyway.locations=${dbCfg.locations}`,
    `-Dflyway.baselineOnMigrate=${dbCfg.baseline_on_migrate ? 'true' : 'false'}`,
    `-Dflyway.baselineVersion=${dbCfg.baseline_version}`,
    `flyway:${command}`,
  ];

  const maskedArgs = mvnArgs.map(a =>
    a.startsWith('-Dflyway.password=') ? '-Dflyway.password=***' : a
  );
  appendLog(runId, `Running: mvn ${maskedArgs.join(' ')}\n`);
  appendLog(runId, `Working dir: ${workDir}\n\n`);

  activeProcesses.set(runId, null); // placeholder so finishRun sees it as active

  const proc = spawn('mvn', mvnArgs, {
    cwd: workDir,
    shell: true,
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  activeProcesses.set(runId, proc);
  proc.stdout.on('data', (d) => appendLog(runId, d.toString()));
  proc.stderr.on('data', (d) => appendLog(runId, d.toString()));
  proc.on('close', (code) => finishRun(runId, code ?? 1));

  return { runId, runNumber };
}

function cancelRun(runId) {
  if (!activeProcesses.has(runId)) return false;
  const proc = activeProcesses.get(runId);
  cancelledRuns.add(runId);
  appendLog(runId, '\n[Cancelled by user]\n');
  if (proc) {
    try {
      if (process.platform !== 'win32') process.kill(-proc.pid, 'SIGTERM');
      else proc.kill('SIGTERM');
    } catch {
      try { proc.kill('SIGTERM'); } catch {}
    }
  }
  return true;
}

function subscribeRun(runId, onChunk, onDone) {
  const chunkKey = `flyway:${runId}:chunk`;
  const doneKey = `flyway:${runId}:done`;
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

module.exports = { startFlywayRun, cancelRun, subscribeRun };
