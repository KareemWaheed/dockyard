export function flattenEnv(data) {
  if (!data) return [];
  return [...(data.stacks || []).flatMap((s) => s.containers || []), ...(data.standalone || [])];
}

export function findContainer(data, name) {
  return flattenEnv(data).find((c) => c.name === name) ?? null;
}

export function formatAgo(iso, now = Date.now()) {
  if (!iso) return '';
  const secs = Math.max(0, Math.floor((now - Date.parse(iso)) / 1000));
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

const join = (...parts) => parts.filter(Boolean).join(' · ');

export function describeState(c, now = Date.now()) {
  if (c.status === 'running') {
    const up = formatAgo(c.startedAt, now);
    if (c.health === 'unhealthy') return { tone: 'bad', label: 'unhealthy', detail: join('unhealthy', up) };
    if (c.health === 'starting') return { tone: 'warn', label: 'starting', detail: join('starting', up) };
    if ((c.restartCount ?? 0) > 0) return { tone: 'warn', label: 'restarting', detail: join(`restarting ×${c.restartCount}`, up) };
    const label = c.health === 'healthy' ? 'healthy' : 'running';
    return { tone: 'ok', label, detail: join(label, up) };
  }
  if (c.status === 'stopped') {
    const code = c.exitCode ?? null;
    return { tone: 'bad', label: 'stopped', detail: join(code === null ? 'stopped' : `exited (${code})`, formatAgo(c.finishedAt, now)) };
  }
  return { tone: 'idle', label: 'unknown', detail: 'unknown' };
}
