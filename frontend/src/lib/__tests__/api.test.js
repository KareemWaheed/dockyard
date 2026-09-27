import { describe, it, expect, vi, afterEach } from 'vitest';
import * as api from '@/lib/api';
import { fetchBranches, fetchBuildRuns, startBuild, cloneRepo, cancelBuildRun, replayBuildRun, deployRunToCapRover } from '@/lib/api';

afterEach(() => vi.unstubAllGlobals());

describe('build API helpers encode the project key (Review Focus 4)', () => {
  it('keeps keys with slashes, ? and # inside one path segment', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ runs: [], hasMore: false }) }));
    vi.stubGlobal('fetch', fetchMock);
    const key = 'team/api?x#y';
    const enc = 'team%2Fapi%3Fx%23y';
    await fetchBranches(key);
    await fetchBuildRuns(key);
    await startBuild(key, 'main', []);
    await cloneRepo(key);
    await cancelBuildRun(key, 3);
    await replayBuildRun(key, 3);
    await deployRunToCapRover(key, 3, 1, 'img');
    const urls = fetchMock.mock.calls.map(([u]) => u);
    expect(urls).toEqual([
      `/api/builds/${enc}/branches`,
      `/api/builds/${enc}/runs?offset=0&limit=20`,
      `/api/builds/${enc}`,
      `/api/builds/${enc}/clone`,
      `/api/builds/${enc}/runs/3`,
      `/api/builds/${enc}/runs/3/replay`,
      `/api/builds/${enc}/runs/3/deploy-caprover`,
    ]);
  });
});

describe('environment keys are encoded in API paths (cubic #57)', () => {
  it('keeps an env key inside one path segment', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({}) }));
    vi.stubGlobal('fetch', fetchMock);
    await api.fetchContainers('prod/blue');
    await api.containerAction('prod/blue', 'web', 'restart', {});
    await api.fetchHistory('prod/blue', { limit: 5 });
    expect(fetchMock.mock.calls.map(([u]) => u.split('?')[0])).toEqual([
      '/api/servers/prod%2Fblue/containers',
      '/api/containers/prod%2Fblue/web/restart',
      '/api/history/prod%2Fblue',
    ]);
  });
});
