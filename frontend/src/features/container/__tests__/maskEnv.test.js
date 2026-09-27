import { describe, it, expect } from 'vitest';
import { isSecretKey, ENV_KEY_RE } from '@/features/container/maskEnv';

describe('isSecretKey', () => {
  it.each([
    ['DB_PASSWORD', true], ['JWT_SECRET', true], ['GITLAB_TOKEN', true], ['API_KEY', true], ['MYSQL_PWD', true],
    ['AWS_CREDENTIALS', true], ['api_key', true], ['API_URL', false], ['TZ', false], ['KEYCLOAK_URL', true],
  ])('%s → %s', (key, secret) => expect(isSecretKey(key)).toBe(secret));
});

describe('ENV_KEY_RE', () => {
  it('matches the backend rule', () => {
    expect(ENV_KEY_RE.test('A_1')).toBe(true);
    expect(ENV_KEY_RE.test('1A')).toBe(false);
    expect(ENV_KEY_RE.test('A.B')).toBe(false);
  });
});
