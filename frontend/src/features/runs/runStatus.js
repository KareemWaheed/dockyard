const META = {
  running: { tone: 'warn', label: 'Running' },
  queued: { tone: 'idle', label: 'Queued' },
  success: { tone: 'ok', label: 'Success' },
  failed: { tone: 'bad', label: 'Failed' },
  cancelled: { tone: 'idle', label: 'Cancelled' },
};

export const runStatusMeta = (status) => META[status] ?? { tone: 'idle', label: status || 'Unknown' };
export const isActive = (status) => status === 'running' || status === 'queued';
// Backend timestamps are SQLite UTC ("YYYY-MM-DD HH:MM:SS") — make them parseable ISO.
export const toIso = (s) => (s && !s.includes('T') ? `${s.replace(' ', 'T')}Z` : s);
