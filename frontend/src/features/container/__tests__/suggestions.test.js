import { describe, it, expect } from 'vitest';
import { buildSuggestionGroups, isValidTag } from '@/features/container/suggestions';

const NOW = Date.parse('2026-09-25T12:00:00Z');

describe('buildSuggestionGroups', () => {
  it('orders groups, de-duplicates by tag (first wins) and excludes the current tag', () => {
    const groups = buildSuggestionGroups({
      env: 'stage',
      current: '1.0',
      otherEnvs: [{ env: 'prod', tag: '0.9' }, { env: 'dev', tag: '2.0' }, { env: 'test', tag: '1.0' }],
      recentBuilds: [
        { tag: '2.0', project: 'fe', buildNumber: 90, branch: 'main', finishedAt: '2026-09-25 10:00:00' },
        { tag: '2.1', project: 'fe', buildNumber: 91, branch: 'release/2', finishedAt: '2026-09-25 11:59:30' },
      ],
      previous: [{ tag: '0.9', at: '2026-09-20T12:00:00Z' }, { tag: '0.8', at: '2026-09-18T12:00:00Z' }],
      now: NOW,
    });
    expect(groups).toEqual([
      { heading: 'Other environments', items: [
        { tag: '0.9', hint: 'on PROD', source: 'env' },
        { tag: '2.0', hint: 'on DEV', source: 'env' },
      ] },
      { heading: 'Recent builds', items: [{ tag: '2.1', hint: '#91 · release/2 · just now', source: 'build' }] },
      { heading: 'Previously on STAGE', items: [{ tag: '0.8', hint: '7d ago', source: 'previous' }] },
    ]);
  });

  it('drops empty groups', () => {
    expect(buildSuggestionGroups({ env: 'dev', current: 'x', otherEnvs: [], recentBuilds: [], previous: [], now: NOW })).toEqual([]);
  });
});

describe('isValidTag', () => {
  it.each([['1.2.3', true], ['stage-16.3.0-20', true], ['v1_rc.2', true], ['', false], ['-lead', false], ['a b', false], ['a\nb', false], ['x'.repeat(129), false]])(
    '%j → %s', (tag, ok) => expect(isValidTag(tag)).toBe(ok));
});
