const BASE = '/api';

export async function fetchContainers(env) {
  const r = await fetch(`${BASE}/servers/${env}/containers`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function containerAction(env, containerName, action, body) {
  const r = await fetch(`${BASE}/containers/${env}/${containerName}/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function fetchBranches(project) {
  const r = await fetch(`${BASE}/builds/${project}/branches`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function fetchProjects() {
  const r = await fetch(`${BASE}/builds/projects`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function saveNote(env, containerName, note) {
  return containerAction(env, containerName, 'note', { note });
}

export async function addService(env, stackIdx, body) {
  const r = await fetch(`${BASE}/services/${env}/${stackIdx}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

// Starts a clone — returns { runId, buildNumber } or { alreadyCloned: true }
export async function cloneRepo(project) {
  const r = await fetch(`${BASE}/builds/${project}/clone`, { method: 'POST' });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

// Starts a build — returns { runId, buildNumber }
export async function startBuild(project, branch, args) {
  const r = await fetch(`${BASE}/builds/${project}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ branch, args }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

// List runs for a project (no log content) — returns { runs, hasMore }
export async function fetchBuildRuns(project, { offset = 0, limit = 20 } = {}) {
  const r = await fetch(`${BASE}/builds/${project}/runs?offset=${offset}&limit=${limit}`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

// Cancel a running build
export async function cancelBuildRun(project, buildNumber) {
  const r = await fetch(`${BASE}/builds/${project}/runs/${buildNumber}`, { method: 'DELETE' });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

// Replay a finished build with the same branch + args
export async function replayBuildRun(project, buildNumber) {
  const r = await fetch(`${BASE}/builds/${project}/runs/${buildNumber}/replay`, { method: 'POST' });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

// Streams whitelist output
export async function whitelistIp(env, onChunk, onDone) {
  const r = await fetch(`${BASE}/awssg/whitelist`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ env }),
  });
  if (!r.ok) {
    const err = await r.text();
    onChunk(`ERROR: ${err}\n`);
    onDone(1);
    return;
  }
  await streamWithSentinel(r, onChunk, onDone);
}

async function streamWithSentinel(r, onChunk, onDone) {
  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finished = false;
  while (true) {
    const { done, value } = await reader.read();
    if (value) buffer += decoder.decode(value, { stream: true });
    const exitMatch = buffer.match(/__EXIT_CODE__(\d+)/);
    if (exitMatch) {
      const before = buffer.slice(0, buffer.indexOf('__EXIT_CODE__'));
      if (before) onChunk(before);
      onDone(parseInt(exitMatch[1]));
      finished = true;
      return;
    }
    if (done) break;
    // Flush safe prefix (keep possible partial sentinel at end)
    const safeEnd = buffer.lastIndexOf('__E');
    const flush = safeEnd > 0 ? buffer.slice(0, safeEnd) : buffer;
    if (flush) onChunk(flush);
    buffer = buffer.slice(flush.length);
  }
  // Stream ended without sentinel — flush remaining and signal failure
  if (!finished) {
    if (buffer) onChunk(buffer);
    onDone(1);
  }
}

// ─── History ─────────────────────────────────────────────────────────────────

export async function fetchHistory(env, { container, limit = 100, offset = 0 } = {}) {
  const params = new URLSearchParams({ limit, offset });
  if (container) params.set('container', container);
  const url = env ? `${BASE}/history/${env}?${params}` : `${BASE}/history?${params}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

// ─── Settings ────────────────────────────────────────────────────────────────

export async function fetchSettingsServers() {
  const r = await fetch(`${BASE}/settings/servers`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function createSettingsServer(body) {
  const r = await fetch(`${BASE}/settings/servers`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function updateSettingsServer(id, body) {
  const r = await fetch(`${BASE}/settings/servers/${id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function deleteSettingsServer(id) {
  const r = await fetch(`${BASE}/settings/servers/${id}`, { method: 'DELETE' });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function fetchNotifications() {
  const r = await fetch(`${BASE}/settings/notifications`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function createNotification(body) {
  const r = await fetch(`${BASE}/settings/notifications`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function updateNotification(id, body) {
  const r = await fetch(`${BASE}/settings/notifications/${id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function deleteNotification(id) {
  const r = await fetch(`${BASE}/settings/notifications/${id}`, { method: 'DELETE' });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function testNotification(id) {
  const r = await fetch(`${BASE}/settings/notifications/${id}/test`, { method: 'POST' });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function fetchAppConfig(key) {
  const r = await fetch(`${BASE}/settings/config/${key}`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function updateAppConfig(key, body) {
  const r = await fetch(`${BASE}/settings/config/${key}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

// ─── Flyway ───────────────────────────────────────────────────────────────────

export async function fetchFlywayEnvs() {
  const r = await fetch(`${BASE}/flyway/envs`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function createFlywayEnv(body) {
  const r = await fetch(`${BASE}/flyway/envs`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function updateFlywayEnv(id, body) {
  const r = await fetch(`${BASE}/flyway/envs/${id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function deleteFlywayEnv(id) {
  const r = await fetch(`${BASE}/flyway/envs/${id}`, { method: 'DELETE' });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function createFlywayDatabase(envId, body) {
  const r = await fetch(`${BASE}/flyway/envs/${envId}/databases`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function updateFlywayDatabase(id, body) {
  const r = await fetch(`${BASE}/flyway/databases/${id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function deleteFlywayDatabase(id) {
  const r = await fetch(`${BASE}/flyway/databases/${id}`, { method: 'DELETE' });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function startFlywayRun(body) {
  const r = await fetch(`${BASE}/flyway/run`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function fetchFlywayRuns() {
  const r = await fetch(`${BASE}/flyway/runs`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function cancelFlywayRun(id) {
  const r = await fetch(`${BASE}/flyway/runs/${id}`, { method: 'DELETE' });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}
