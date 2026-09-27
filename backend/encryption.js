const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const TAG_POSITION = IV_LENGTH;

// New ciphertext is prefixed so a value that fails to decrypt (wrong key, corruption) is an
// error instead of being mistaken for a legacy plaintext and re-encrypted on the next save.
const MARKER = 'enc:v1:';

function getKey() {
  const keyHex = process.env.ENCRYPTION_KEY;
  if (!keyHex) throw new Error('ENCRYPTION_KEY environment variable is required');
  if (!/^[0-9a-fA-F]{64}$/.test(keyHex)) throw new Error('ENCRYPTION_KEY must be 64 hex characters (32 bytes), e.g. `openssl rand -hex 32`');
  return Buffer.from(keyHex, 'hex');
}

// Called at startup so a missing or malformed key stops the server before it serves requests.
function assertEncryptionKey() {
  getKey();
}

function encrypt(plaintext) {
  if (!plaintext) return null;
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return MARKER + Buffer.concat([iv, tag, encrypted]).toString('base64');
}

function decrypt(ciphertext) {
  if (!ciphertext) return null;
  const key = getKey();
  const raw = ciphertext.startsWith(MARKER) ? ciphertext.slice(MARKER.length) : ciphertext;
  const buf = Buffer.from(raw, 'base64');
  const iv = buf.subarray(0, IV_LENGTH);
  const tag = buf.subarray(TAG_POSITION, TAG_POSITION + TAG_LENGTH);
  const encrypted = buf.subarray(TAG_POSITION + TAG_LENGTH);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(encrypted) + decipher.final('utf8');
}

function isEncrypted(value) {
  if (!value || typeof value !== 'string') return false;
  if (value.startsWith(MARKER)) return true;
  try {
    const buf = Buffer.from(value, 'base64');
    return buf.length > IV_LENGTH + TAG_LENGTH;
  } catch {
    return false;
  }
}

function decryptField(value) {
  if (!value) return value;
  if (typeof value === 'string' && value.startsWith(MARKER)) return decrypt(value); // errors propagate
  // Legacy values (before the marker): unmarked ciphertext, or plaintext from older installs.
  if (isEncrypted(value)) {
    try {
      return decrypt(value);
    } catch {
      return value;
    }
  }
  return value;
}

module.exports = { encrypt, decrypt, decryptField, isEncrypted, assertEncryptionKey };
