// Helpers for building remote shell commands safely. Every value that comes
// from a request (or from the DB) and lands in an SSH exec string must go
// through shellQuote — double quotes are NOT enough, since $(...) and
// backticks still expand inside them.

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

// Docker's own container-name charset: [a-zA-Z0-9][a-zA-Z0-9_.-]*
const NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/;

function isValidName(name) {
  return typeof name === 'string' && NAME_RE.test(name);
}

module.exports = { shellQuote, isValidName };
