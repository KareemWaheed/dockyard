const BASE = "/api";

// Builds a readable Error from a failed response. JSON {error} bodies pass
// through; HTML bodies (proxy/Cloudflare error pages, Express default 404s)
// are collapsed to a short status line instead of dumping page source.
async function readError(r) {
  const text = await r.text();
  try {
    const parsed = JSON.parse(text);
    if (parsed.error) return new Error(parsed.error);
  } catch {}
  if (/^\s*</.test(text)) {
    return new Error(
      `HTTP ${r.status} — the server returned an error page instead of a response (backend down or unreachable?)`,
    );
  }
  return new Error(text.slice(0, 300) || `HTTP ${r.status}`);
}

export async function fetchContainers(env) {
  const r = await fetch(`${BASE}/servers/${env}/containers`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function containerAction(env, containerName, action, body) {
  const r = await fetch(
    `${BASE}/containers/${env}/${containerName}/${action}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
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

export async function fetchProjectRemote(project) {
  const r = await fetch(`${BASE}/builds/${project}/remote`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function updateProjectRemote(project, repoUrl) {
  const r = await fetch(`${BASE}/builds/${project}/remote`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ repoUrl }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function saveNote(env, containerName, note) {
  return containerAction(env, containerName, "note", { note });
}

export async function addService(env, stackIdx, body) {
  const r = await fetch(`${BASE}/services/${env}/${stackIdx}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

// Starts a clone — returns { runId, buildNumber } or { alreadyCloned: true }
export async function cloneRepo(project) {
  const r = await fetch(`${BASE}/builds/${project}/clone`, { method: "POST" });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

// Starts a build — returns { runId, buildNumber }
export async function startBuild(project, branch, args) {
  const r = await fetch(`${BASE}/builds/${project}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ branch, args }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

// List runs for a project (no log content) — returns { runs, hasMore }
export async function fetchBuildRuns(project, { offset = 0, limit = 20 } = {}) {
  const r = await fetch(
    `${BASE}/builds/${project}/runs?offset=${offset}&limit=${limit}`,
  );
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

// Cancel a running build
export async function cancelBuildRun(project, buildNumber) {
  const r = await fetch(`${BASE}/builds/${project}/runs/${buildNumber}`, {
    method: "DELETE",
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

// Replay a finished build with the same branch + args
export async function replayBuildRun(project, buildNumber) {
  const r = await fetch(
    `${BASE}/builds/${project}/runs/${buildNumber}/replay`,
    { method: "POST" },
  );
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

// FortiVPN service state on the backend host machine
export async function getVpnStatus() {
  const r = await fetch(`${BASE}/servers/vpn-status`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

// Streams VPN start/stop/restart output (runs locally on the backend machine)
export async function vpnAction(action, onChunk, onDone) {
  const r = await fetch(`${BASE}/servers/vpn/${action}`, { method: "POST" });
  if (!r.ok) {
    const err = await r.text();
    onChunk(`ERROR: ${err}\n`);
    onDone(1);
    return;
  }
  await streamWithSentinel(r, onChunk, onDone);
}

export const restartVpn = (onChunk, onDone) =>
  vpnAction("restart", onChunk, onDone);

// Streams whitelist output
export async function whitelistIp(env, onChunk, onDone) {
  const r = await fetch(`${BASE}/awssg/whitelist`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
  let buffer = "";
  let finished = false;
  while (true) {
    const { done, value } = await reader.read();
    if (value) buffer += decoder.decode(value, { stream: true });
    const exitMatch = buffer.match(/__EXIT_CODE__(\d+)/);
    if (exitMatch) {
      const before = buffer.slice(0, buffer.indexOf("__EXIT_CODE__"));
      if (before) onChunk(before);
      onDone(parseInt(exitMatch[1]));
      finished = true;
      return;
    }
    if (done) break;
    // Flush safe prefix (keep possible partial sentinel at end)
    const safeEnd = buffer.lastIndexOf("__E");
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

// ─── Maintenance ─────────────────────────────────────────────────────────────

export async function getMaintenance(env) {
  const r = await fetch(`${BASE}/maintenance/${env}`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function setMaintenance(env, enabled) {
  const r = await fetch(`${BASE}/maintenance/${env}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

// ─── History ─────────────────────────────────────────────────────────────────

export async function fetchHistory(
  env,
  { container, limit = 100, offset = 0 } = {},
) {
  const params = new URLSearchParams({ limit, offset });
  if (container) params.set("container", container);
  const url = env
    ? `${BASE}/history/${env}?${params}`
    : `${BASE}/history?${params}`;
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
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function updateSettingsServer(id, body) {
  const r = await fetch(`${BASE}/settings/servers/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function deleteSettingsServer(id) {
  const r = await fetch(`${BASE}/settings/servers/${id}`, { method: "DELETE" });
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
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function updateNotification(id, body) {
  const r = await fetch(`${BASE}/settings/notifications/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function deleteNotification(id) {
  const r = await fetch(`${BASE}/settings/notifications/${id}`, {
    method: "DELETE",
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function testNotification(id) {
  const r = await fetch(`${BASE}/settings/notifications/${id}/test`, {
    method: "POST",
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function fetchCapRoverTargets() {
  const r = await fetch(`${BASE}/settings/caprover-targets`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function createCapRoverTarget(body) {
  const r = await fetch(`${BASE}/settings/caprover-targets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function updateCapRoverTarget(id, body) {
  const r = await fetch(`${BASE}/settings/caprover-targets/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

// Validate a CapRover target's URL/app/token without saving it.
// Test failures come back as 200 { ok: false, error } — proxies like
// Cloudflare replace origin 5xx bodies with their own error page.
export async function testCapRoverTarget(body) {
  const r = await fetch(`${BASE}/settings/caprover-targets/test`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw await readError(r);
  return r.json();
}

export async function deleteCapRoverTarget(id) {
  const r = await fetch(`${BASE}/settings/caprover-targets/${id}`, {
    method: "DELETE",
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

// Trigger a CapRover deploy of an image pushed by a finished build run
export async function deployRunToCapRover(
  project,
  buildNumber,
  targetId,
  imageName,
) {
  const r = await fetch(
    `${BASE}/builds/${project}/runs/${buildNumber}/deploy-caprover`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetId, imageName }),
    },
  );
  if (!r.ok) throw await readError(r);
  return r.json();
}

export async function fetchAppConfig(key) {
  const r = await fetch(`${BASE}/settings/config/${key}`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function updateAppConfig(key, body) {
  const r = await fetch(`${BASE}/settings/config/${key}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function exportSettings() {
  const r = await fetch(`${BASE}/settings/export`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function importSettings(payload) {
  const r = await fetch(`${BASE}/settings/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
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
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function updateFlywayEnv(id, body) {
  const r = await fetch(`${BASE}/flyway/envs/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function deleteFlywayEnv(id) {
  const r = await fetch(`${BASE}/flyway/envs/${id}`, { method: "DELETE" });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function createFlywayDatabase(envId, body) {
  const r = await fetch(`${BASE}/flyway/envs/${envId}/databases`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function updateFlywayDatabase(id, body) {
  const r = await fetch(`${BASE}/flyway/databases/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function deleteFlywayDatabase(id) {
  const r = await fetch(`${BASE}/flyway/databases/${id}`, { method: "DELETE" });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function startFlywayRun(body) {
  const r = await fetch(`${BASE}/flyway/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
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
  const r = await fetch(`${BASE}/flyway/runs/${id}`, { method: "DELETE" });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}
