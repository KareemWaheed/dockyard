import { describe, it, expect } from 'vitest';
import { computeDrift } from '@/features/overview/drift';

const present = (tag) => ({ kind: 'present', tag });
const row = (cells) => ({ service: 'web', managed: true, cells });
const ORDER = ['dev', 'test', 'stage', 'prod'];

describe('computeDrift', () => {
  it('flags a cell whose tag differs from the nearest env to its left', () => {
    const d = computeDrift(row({ dev: present('3'), test: present('3'), stage: present('2'), prod: present('2') }), ORDER);
    expect(d).toEqual({ stage: { upstreamEnv: 'test', upstreamTag: '3' } });
  });

  it('never flags the first column', () => {
    expect(computeDrift(row({ dev: present('9'), test: present('9') }), ORDER)).toEqual({});
  });

  it('skips absent and unknown envs when looking left', () => {
    const d = computeDrift(row({ dev: present('3'), test: { kind: 'absent' }, stage: { kind: 'unknown' }, prod: present('1') }), ORDER);
    expect(d).toEqual({ prod: { upstreamEnv: 'dev', upstreamTag: '3' } });
  });

  it('ignores non-present cells themselves', () => {
    expect(computeDrift(row({ dev: present('3'), test: { kind: 'absent' } }), ORDER)).toEqual({});
  });

  it('does not offer a promote from an upstream env whose data is stale (cubic #12)', () => {
    const d = computeDrift(row({ dev: { kind: 'present', tag: '3', stale: true }, test: present('2') }), ORDER);
    expect(d).toEqual({});
  });
});
