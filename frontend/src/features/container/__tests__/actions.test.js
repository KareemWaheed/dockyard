import { describe, it, expect } from 'vitest';
import { ACTIONS, confirmPolicy, describeAction, isProd } from '@/features/container/actions';

describe('isProd', () => {
  it.each([['prod', true], ['PROD', true], ['production', true], ['preprod', false], ['stage', false], [undefined, false]])(
    '%s → %s', (env, out) => expect(isProd(env)).toBe(out));
});

describe('confirmPolicy (spec §6.1)', () => {
  it.each([
    ['deploy', 'stage', 'none'], ['deploy', 'prod', 'confirm'],
    ['restart', 'dev', 'none'], ['restart', 'prod', 'confirm'],
    ['pull-recreate', 'dev', 'none'], ['pull-recreate', 'prod', 'confirm'],
    ['start', 'dev', 'none'], ['start', 'prod', 'confirm'],
    ['update-env', 'dev', 'none'], ['update-env', 'prod', 'confirm'],
    ['stop', 'dev', 'confirm'], ['stop', 'prod', 'typed'],
    ['force-recreate', 'dev', 'confirm'], ['force-recreate', 'prod', 'typed'],
    ['maintenance-on', 'dev', 'confirm'], ['maintenance-on', 'prod', 'typed'],
    ['unmanage', 'dev', 'confirm'], ['unmanage', 'prod', 'typed'],
    ['maintenance-off', 'dev', 'confirm'], ['maintenance-off', 'prod', 'confirm'],
    ['manage', 'dev', 'confirm'], ['manage', 'prod', 'confirm'],
  ])('%s on %s → %s', (action, env, level) => expect(confirmPolicy(action, env)).toBe(level));

  it('rejects unknown actions loudly', () => expect(() => confirmPolicy('nuke', 'dev')).toThrow(/Unknown action/));
});

describe('ACTIONS / describeAction', () => {
  it('maps logical actions to backend endpoints', () => {
    expect(ACTIONS['force-recreate']).toEqual({ endpoint: 'up', body: { forceRecreate: true }, destructive: true });
    expect(ACTIONS.start.endpoint).toBe('up');
    expect(ACTIONS.deploy.endpoint).toBe('update-tag');
    expect(ACTIONS.unmanage.body).toEqual({ enabled: false });
  });
  it('describes a deploy with old → new', () => {
    const d = describeAction('deploy', { service: 'frontend', env: 'stage', fromTag: '1', toTag: '2' });
    expect(d.title).toBe('Deploy frontend to STAGE?');
    expect(d.description).toContain('1 → 2');
    expect(d.pending).toBe('deploying 2…');
    expect(d.success).toBe('frontend on STAGE → 2');
  });
  it('has copy for every action the policy knows', () => {
    for (const a of [...Object.keys(ACTIONS), 'maintenance-on', 'maintenance-off']) {
      const d = describeAction(a, { service: 's', env: 'dev', toTag: 't' });
      expect(d.title && d.confirmLabel && d.pending && d.success).toBeTruthy();
    }
  });
});
