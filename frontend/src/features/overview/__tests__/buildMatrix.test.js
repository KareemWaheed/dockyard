import { describe, it, expect } from 'vitest';
import { buildMatrix } from '@/features/overview/buildMatrix';

const c = (serviceName, tag, extra = {}) => ({
  name: `${serviceName}-${extra.suffix ?? '1'}`, serviceName, image: `reg/${serviceName}:${tag}`, status: 'running', managed: true, ...extra,
});
const env = (name, stacks, over = {}) => ({
  env: name, isLoading: false, isError: false, error: null,
  data: { stacks: stacks.map((containers, i) => ({ name: `S${i}`, path: `/s${i}`, containers })), standalone: [{ name: 'dozzle', serviceName: 'dozzle', standalone: true }] },
  ...over,
});

describe('buildMatrix', () => {
  it('unions services across envs, sorted, skipping standalone containers', () => {
    const m = buildMatrix([env('dev', [[c('web', '2'), c('api', '2')]]), env('prod', [[c('web', '1')]])]);
    expect(m.rows.map((r) => r.service)).toEqual(['api', 'web']);
    expect(m.rows[0].cells.prod).toEqual({ kind: 'absent' });
    expect(m.rows[1].cells.dev).toMatchObject({ kind: 'present', tag: '2', stale: false, extra: 0 });
  });

  it('reports env states: loading, stale (error + data), unreachable (error, no data)', () => {
    const m = buildMatrix([
      { env: 'dev', isLoading: true, isError: false, data: undefined },
      env('stage', [[c('web', '1')]], { isError: true, error: new Error('ssh down') }),
      { env: 'prod', isLoading: false, isError: true, error: new Error('timeout'), data: undefined },
    ]);
    expect(m.envs).toEqual([
      { env: 'dev', state: 'loading', error: null },
      { env: 'stage', state: 'stale', error: 'ssh down' },
      { env: 'prod', state: 'unreachable', error: 'timeout' },
    ]);
    const web = m.rows[0];
    expect(web.cells.dev).toEqual({ kind: 'unknown' });
    expect(web.cells.stage).toMatchObject({ kind: 'present', stale: true });
    expect(web.cells.prod).toEqual({ kind: 'unknown' });
  });

  it('uses the first stack for a service present in several stacks and counts the rest', () => {
    const m = buildMatrix([env('dev', [[c('web', '1', { suffix: 'a' })], [c('web', '9', { suffix: 'b' })]])]);
    expect(m.rows[0].cells.dev).toMatchObject({ tag: '1', extra: 1 });
    expect(m.rows[0].cells.dev.container.name).toBe('web-a');
  });

  it('hides unmanaged-only services unless asked', () => {
    const results = [env('dev', [[c('web', '1'), c('postgres', '14', { managed: false })]])];
    expect(buildMatrix(results).rows.map((r) => r.service)).toEqual(['web']);
    const all = buildMatrix(results, { showUnmanaged: true });
    expect(all.rows.map((r) => r.service)).toEqual(['postgres', 'web']);
    expect(all.rows[0].managed).toBe(false);
  });
});
