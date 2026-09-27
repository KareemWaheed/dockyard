import { describe, it, expect, vi, afterEach } from 'vitest';
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
