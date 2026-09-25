const assert = require('assert');
const { execSync } = require('child_process');
const { shellQuote, isValidName } = require('./shell');

// shellQuote wraps in single quotes and escapes embedded single quotes
assert.strictEqual(shellQuote('abc'), "'abc'");
assert.strictEqual(shellQuote("it's"), "'it'\\''s'");
assert.strictEqual(shellQuote(''), "''");
assert.strictEqual(shellQuote(42), "'42'");

// Round-trip through a real shell: payloads must come back verbatim, never executed
for (const payload of ['$(id)', '`id`', 'a;id', "x' ; id ; echo '", '/path with spaces/dc.yml', '$HOME']) {
  const out = execSync(`printf %s ${shellQuote(payload)}`, { shell: 'bash' }).toString();
  assert.strictEqual(out, payload, `round-trip failed for ${payload}`);
}

// isValidName accepts docker container/service names
for (const ok of ['backend', 'my_app-1', 'stack.web.1', 'A1']) {
  assert.ok(isValidName(ok), `should accept ${ok}`);
}
// ...and rejects anything with shell metacharacters or a leading dash/dot
for (const bad of ['', 'x;id', '$(id)', 'a b', '-rf', '.hidden', 'a/b', undefined, null, 5]) {
  assert.ok(!isValidName(bad), `should reject ${bad}`);
}

console.log('shell tests passed');
