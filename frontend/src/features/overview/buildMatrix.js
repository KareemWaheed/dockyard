import { imageTag } from '@/lib/image';

function envState(r) {
  if (r.isError) return r.data ? 'stale' : 'unreachable';
  if (!r.data) return 'loading';
  return 'ok';
}

export function buildMatrix(envResults, { showUnmanaged = false } = {}) {
  const envs = envResults.map((r) => ({ env: r.env, state: envState(r), error: r.error ? r.error.message ?? String(r.error) : null }));
  const byService = new Map(); // service → { managed, cells }

  envResults.forEach((r, i) => {
    const state = envs[i].state;
    if (!r.data) return;
    const perService = new Map(); // service → containers in stack order
    for (const stack of r.data.stacks || []) {
      for (const container of stack.containers || []) {
        const service = container.serviceName || container.name;
        if (!perService.has(service)) perService.set(service, []);
        perService.get(service).push(container);
      }
    }
    for (const [service, list] of perService) {
      if (!byService.has(service)) byService.set(service, { managed: false, cells: {} });
      const entry = byService.get(service);
      const [first] = list;
      entry.managed ||= list.some((c) => c.managed);
      entry.cells[r.env] = { kind: 'present', container: first, tag: imageTag(first.image), stale: state === 'stale', extra: list.length - 1 };
    }
  });

  const rows = [...byService.entries()]
    .filter(([, e]) => showUnmanaged || e.managed)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([service, e]) => {
      const cells = {};
      envs.forEach(({ env, state }) => {
        cells[env] = e.cells[env] ?? (state === 'ok' || state === 'stale' ? { kind: 'absent' } : { kind: 'unknown' });
      });
      return { service, managed: e.managed, cells };
    });

  return { envs, rows };
}
