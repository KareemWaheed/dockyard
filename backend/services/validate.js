// Validation for settings values that end up in shell commands or filesystem paths.

// docker_compose_cmd is interpolated into remote shell commands, so only known forms are allowed.
const COMPOSE_COMMANDS = ['docker compose', 'docker-compose', 'sudo docker compose', 'sudo docker-compose'];
const INVALID_COMPOSE_CMD = `Invalid Docker Compose command in this environment's settings. Use one of: ${COMPOSE_COMMANDS.join(', ')}.`;

function isValidComposeCmd(value) {
  return COMPOSE_COMMANDS.includes(value);
}

// The server's compose command, or null if the stored value isn't an allowed one.
function composeCmd(server) {
  const value = (server && server.docker_compose_cmd) || 'docker compose';
  return isValidComposeCmd(value) ? value : null;
}

// Project keys name folders under repos/: letters, digits, dot, dash, underscore; no leading dot/dash.
function isValidProjectKey(key) {
  return typeof key === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(key) && !key.includes('..');
}

// Environment keys appear in URLs (/env/<key>) and API paths: letters, digits, dash, underscore.
function isValidEnvKey(key) {
  return typeof key === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(key);
}

module.exports = { COMPOSE_COMMANDS, INVALID_COMPOSE_CMD, isValidComposeCmd, composeCmd, isValidProjectKey, isValidEnvKey };
