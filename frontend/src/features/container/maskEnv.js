const SECRET_RE = /PASS|SECRET|TOKEN|KEY|PWD|CREDENTIAL/i;
// Same rule as backend/services/compose.js validateEnvChanges.
export const ENV_KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function isSecretKey(key) {
  return SECRET_RE.test(key);
}
