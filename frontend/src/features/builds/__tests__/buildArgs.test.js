import { describe, it, expect } from 'vitest';
import { initFormState, buildArgs, isFormValid, parseArgs, parseJsonArray, parseDeployMeta, deployEnvOf, nextTag, nextTagValue, tagParamOf, argsToValues, withPendingTags } from '@/features/builds/buildArgs';

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

describe('nextTag (rebuild with next tag)', () => {
  it('bumps a trailing build counter', () => {
    expect(nextTag('dal-stg-1.0.0-2060')).toBe('dal-stg-1.0.0-2061');
    expect(nextTag('dal-stg-01')).toBe('dal-stg-02');
    expect(nextTag('1.4.0-9')).toBe('1.4.0-10');
    expect(nextTag('app-099')).toBe('app-100');
  });
  it('starts a counter when the tag has none', () => {
    expect(nextTag('dal-stg-1')).toBe('dal-stg-1-01');
    expect(nextTag('dal-stg')).toBe('dal-stg-01');
  });
  it('continues from the highest known tag with the same base so tags are never reused', () => {
    expect(nextTag('dal-stg-1.0.0-2060', ['dal-stg-1.0.0-2070', 'dal-prod-1.0.0-9000'])).toBe('dal-stg-1.0.0-2071');
    expect(nextTag('dal-stg', ['dal-stg-01', 'dal-stg-03'])).toBe('dal-stg-04');
  });
  it('returns empty for an empty tag', () => {
    expect(nextTag('')).toBe('');
  });
});

describe('tagParamOf / argsToValues', () => {
  it('finds the tag param by name or label', () => {
    expect(tagParamOf(params).name).toBe('tag');
    expect(tagParamOf([{ name: 'img', type: 'string', flag: '-t', label: 'Image tag' }]).name).toBe('img');
    expect(tagParamOf([{ name: 'env', type: 'select', flag: '--env' }])).toBeNull();
  });
  it('reads a run back into form values', () => {
    const json = JSON.stringify(['--tag', '1.2', '--env', 'prod', '--module', 'a', '--module', 'c', '--skip-tests']);
    expect(argsToValues(params, json)).toEqual({ tag: '1.2', env: 'prod', mods: ['a', 'c'], skip: true });
    expect(argsToValues(params, 'broken')).toEqual({ tag: '', env: 'dev', mods: [], skip: false });
  });

describe('review fixes (cubic #37, #38)', () => {
  it('only treats a whole-word "tag" parameter as the image tag', () => {
    expect(tagParamOf([{ name: 'stage', type: 'string', flag: '--stage' }])).toBeNull();
    expect(tagParamOf([{ name: 'staging_env', type: 'string', flag: '-s' }])).toBeNull();
    expect(tagParamOf([{ name: 'imageTag', type: 'string', flag: '-t' }]).name).toBe('imageTag');
    expect(tagParamOf([{ name: 'image_tag', type: 'string', flag: '-t' }]).name).toBe('image_tag');
    expect(tagParamOf([{ name: 'v', type: 'string', flag: '-t', label: 'Docker tag' }]).name).toBe('v');
  });
  it('enforces a required checkbox', () => {
    const p = [{ name: 'ack', type: 'checkbox', flag: '--ack', required: true }];
    expect(isFormValid(p, { ack: false }, 'main')).toBe(false);
    expect(isFormValid(p, { ack: true }, 'main')).toBe(true);
  });
});
});

describe('tags param type', () => {
  const tp = [{ name: 'tag', type: 'tags', flag: '-t', label: 'Tag', required: true }];
  it('defaults to an empty list', () => {
    expect(initFormState(tp)).toEqual({ tag: [] });
    expect(initFormState([{ ...tp[0], default: ['a'] }])).toEqual({ tag: ['a'] });
  });
  it('passes all tags as one comma-separated value', () => {
    expect(buildArgs(tp, { tag: ['stage-latest', 'prod-latest'] })).toEqual(['-t', 'stage-latest,prod-latest']);
    expect(buildArgs(tp, { tag: [] })).toEqual([]);
  });
  it('requires at least one tag when required', () => {
    expect(isFormValid(tp, { tag: [] }, 'main')).toBe(false);
    expect(isFormValid(tp, { tag: ['x'] }, 'main')).toBe(true);
  });
  it('reads a run back into a list, and shows it comma-separated', () => {
    const json = JSON.stringify(['-t', 'stage-latest,prod-latest']);
    expect(argsToValues(tp, json)).toEqual({ tag: ['stage-latest', 'prod-latest'] });
    expect(parseArgs(tp, json, '')).toEqual([{ label: 'Tag', value: 'stage-latest, prod-latest' }]);
  });
  it('counts as the image-tag param', () => {
    expect(tagParamOf(tp).name).toBe('tag');
  });
});

describe('nextTagValue', () => {
  it('bumps a string tag like nextTag', () => {
    expect(nextTagValue('dal-stg-01', ['dal-stg-03'])).toBe('dal-stg-04');
    expect(nextTagValue('')).toBeNull();
  });
  it('bumps only counter tags in a list and keeps floating tags', () => {
    expect(nextTagValue(['dal-stg-1.0.0-2060', 'stage-latest'], ['dal-stg-1.0.0-2070'])).toEqual(['dal-stg-1.0.0-2071', 'stage-latest']);
  });
  it('returns null when no tag in the list has a counter', () => {
    expect(nextTagValue(['stage-latest', 'prod-latest'])).toBeNull();
    expect(nextTagValue([])).toBeNull();
  });
});

describe('review fixes (cubic, PR #7)', () => {
  const tp = [{ name: 'tag', type: 'tags', flag: '-t', required: true }];
  it('normalizes string defaults and saved values for a tags param', () => {
    expect(initFormState([{ ...tp[0], default: 'stage-latest,prod-latest' }])).toEqual({ tag: ['stage-latest', 'prod-latest'] });
    expect(initFormState(tp, { tag: 'dal-stg-1.0.0-2060' })).toEqual({ tag: ['dal-stg-1.0.0-2060'] });
  });
  it('never bumps two counter tags with the same base to the same tag', () => {
    expect(nextTagValue(['app-01', 'app-02'])).toEqual(['app-03', 'app-04']);
  });
  it('counts pending tag text as entered and flags invalid pending text', () => {
    expect(withPendingTags(tp, { tag: [] }, { tag: '16.4.0' })).toEqual({ values: { tag: ['16.4.0'] }, invalid: false });
    expect(withPendingTags(tp, { tag: ['a'] }, { tag: 'bad/tag' })).toEqual({ values: { tag: ['a'] }, invalid: true });
    expect(withPendingTags(tp, { tag: ['a'] }, { tag: '  ' })).toEqual({ values: { tag: ['a'] }, invalid: false });
  });
});
