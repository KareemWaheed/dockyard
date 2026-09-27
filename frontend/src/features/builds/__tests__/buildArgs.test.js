import { describe, it, expect } from 'vitest';
import { initFormState, buildArgs, isFormValid, parseArgs, parseJsonArray, parseDeployMeta, deployEnvOf } from '@/features/builds/buildArgs';

const params = [
  { name: 'tag', type: 'string', flag: '--tag', label: 'Tag', required: true },
  { name: 'env', type: 'select', flag: '--env', options: ['dev', 'prod'], default: 'dev' },
  { name: 'mods', type: 'multiselect', flag: '--module', options: ['a', 'b', 'c'], required: true },
  { name: 'skip', type: 'checkbox', flag: '--skip-tests', label: 'Skip tests' },
];

describe('initFormState', () => {
  it('uses defaults per type', () => {
    expect(initFormState(params)).toEqual({ tag: '', env: 'dev', mods: [], skip: false });
  });
  it('overlays saved values for known params only', () => {
    expect(initFormState(params, { tag: '1.2', skip: true, gone: 'x' })).toEqual({ tag: '1.2', env: 'dev', mods: [], skip: true });
  });
});

describe('buildArgs', () => {
  it('turns values into CLI args', () => {
    expect(buildArgs(params, { tag: '1.2', env: 'prod', mods: ['a', 'c'], skip: true }))
      .toEqual(['--tag', '1.2', '--env', 'prod', '--module', 'a', '--module', 'c', '--skip-tests']);
  });
  it('omits empty strings and unchecked flags', () => {
    expect(buildArgs(params, { tag: '', env: 'dev', mods: [], skip: false })).toEqual(['--env', 'dev']);
  });
});

describe('isFormValid', () => {
  it('needs a branch and every required field', () => {
    expect(isFormValid(params, { tag: '1', mods: ['a'] }, '')).toBe(false);
    expect(isFormValid(params, { tag: '', mods: ['a'] }, 'main')).toBe(false);
    expect(isFormValid(params, { tag: '1', mods: [] }, 'main')).toBe(false);
    expect(isFormValid(params, { tag: '1', mods: ['a'] }, 'main')).toBe(true);
  });
});

describe('parseArgs', () => {
  it('reads a finished run back into labelled rows', () => {
    const json = JSON.stringify(['--tag', '1.2', '--module', 'a', '--module', 'b', '--skip-tests']);
    expect(parseArgs(params, json, 'main')).toEqual([
      { label: 'Branch', value: 'main' },
      { label: 'Tag', value: '1.2' },
      { label: 'mods', value: 'a, b' },
      { label: 'Skip tests', value: 'yes' },
    ]);
  });
  it('survives malformed JSON and params removed from the config (Review Focus 1)', () => {
    expect(parseArgs(params, '{not json', 'main')).toEqual([{ label: 'Branch', value: 'main' }, { label: 'Skip tests', value: 'no' }]);
    expect(parseArgs(undefined, '["--tag","1"]')).toEqual([]);
  });
});

describe('parseJsonArray / parseDeployMeta / deployEnvOf', () => {
  it('returns [] for bad input', () => {
    expect(parseJsonArray(null)).toEqual([]);
    expect(parseJsonArray('nope')).toEqual([]);
    expect(parseJsonArray('{"a":1}')).toEqual([]);
    expect(parseJsonArray('["x"]')).toEqual(['x']);
  });
  it('describes a deploy run', () => {
    const run = { type: 'deploy', branch: 'main', args_json: JSON.stringify({ sourceBuildNumber: 41, gitHash: 'abcdef1234567', image: 'reg/app:1', env: 'stage', app: 'app-stage' }) };
    expect(parseDeployMeta(run)).toEqual([
      { label: 'From build', value: '#41' },
      { label: 'Branch', value: 'main' },
      { label: 'Git hash', value: 'abcdef123' },
      { label: 'Image', value: 'reg/app:1' },
      { label: 'Environment', value: 'stage' },
      { label: 'CapRover app', value: 'app-stage' },
    ]);
    expect(deployEnvOf(run)).toBe('stage');
    expect(parseDeployMeta({ type: 'deploy', args_json: 'garbage' })).toEqual([]);
    expect(deployEnvOf({ type: 'build', args_json: '[]' })).toBe('');
  });
});
