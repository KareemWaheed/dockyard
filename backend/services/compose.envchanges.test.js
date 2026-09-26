const assert = require('assert');
const yaml = require('js-yaml');
const { validateEnvChanges, applyEnvChanges, updateEnvVar } = require('./compose');

assert.strictEqual(validateEnvChanges([{ key: 'API_URL', value: 'http://x' }]), null);
assert.match(validateEnvChanges([]), /at least one/);
assert.match(validateEnvChanges('nope'), /at least one/);
assert.match(validateEnvChanges([{ key: 'A.B', value: '1' }]), /Invalid key/);
assert.match(validateEnvChanges([{ key: 'X|Y', value: '1' }]), /Invalid key/);
assert.match(validateEnvChanges([{ key: '1ABC', value: '1' }]), /Invalid key/);
assert.match(validateEnvChanges([{ key: 'OK', value: 'a\nINJECTED=1' }]), /newline/);
assert.match(validateEnvChanges([{ key: 'OK', value: 5 }]), /must be a string/);

const compose = [
  'services:',
  '  web:',
  '    image: app:1',
  '    environment:',
  '      - PLAIN=old',
  '      - FROM_FILE=${FROM_FILE}',
  '',
].join('\n');
const envFile = 'FROM_FILE=before\nOTHER=keep\n';

const out = applyEnvChanges(compose, envFile, 'web', [
  { key: 'PLAIN', value: 'new' },
  { key: 'ADDED', value: 'yes' },
  { key: 'FROM_FILE', value: 'after' },
]);
const svc = yaml.load(out.compose).services.web;
assert.ok(svc.environment.includes('PLAIN=new'));
assert.ok(svc.environment.includes('ADDED=yes'));
assert.ok(!svc.environment.includes('PLAIN=old'));
assert.strictEqual(out.env, 'FROM_FILE=after\nOTHER=keep\n');

const onlyCompose = applyEnvChanges(compose, envFile, 'web', [{ key: 'PLAIN', value: 'x' }]);
assert.strictEqual(onlyCompose.env, null, '.env untouched → null');
const onlyEnv = applyEnvChanges(compose, envFile, 'web', [{ key: 'FROM_FILE', value: 'y' }]);
assert.strictEqual(onlyEnv.compose, null, 'compose untouched → null');
assert.throws(() => applyEnvChanges(compose, envFile, 'missing', [{ key: 'A', value: '1' }]), /not found/);

// I-1: `$`-bearing values must round-trip verbatim through String.prototype.replace's
// special replacement patterns ($$, $', $&, $`, $1...).
for (const value of ['x$$y', "x$'z", 'p$&q', 'a$`b', 'v$1w']) {
  const result = updateEnvVar('FROM_FILE=before\nOTHER=keep\n', 'FROM_FILE', value);
  assert.strictEqual(result, `FROM_FILE=${value}\nOTHER=keep\n`, `updateEnvVar must not interpret $ specials in ${JSON.stringify(value)}`);
}
const dollarOut = applyEnvChanges(compose, envFile, 'web', [{ key: 'FROM_FILE', value: 'x$$y' }]);
assert.strictEqual(dollarOut.env, 'FROM_FILE=x$$y\nOTHER=keep\n');

console.log('compose env-changes tests passed');
