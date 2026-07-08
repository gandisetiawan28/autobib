import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY || 'fallback-key-change-in-production!';
  // Derive a consistent 32-byte key
  return crypto.scryptSync(raw, 'autobib-salt', KEY_LENGTH);
}

/**
 * Encrypt a plaintext string.
 * Returns: iv:tag:ciphertext (all base64, colon-separated)
 */
export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = getEncryptionKey();
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv) as crypto.CipherGCM;
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64'), tag.toString('base64'), encrypted.toString('base64')].join(':');
}

/**
 * Decrypt a string produced by encrypt().
 */
export function decrypt(encoded: string): string {
  const [ivB64, tagB64, dataB64] = encoded.split(':');
  if (!ivB64 || !tagB64 || !dataB64) throw new Error('Invalid encrypted format');
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const data = Buffer.from(dataB64, 'base64');
  const key = getEncryptionKey();
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv) as crypto.DecipherGCM;
  decipher.setAuthTag(tag);
  return decipher.update(data).toString('utf8') + decipher.final('utf8');
}

/**
 * Hash a string with SHA-256 (for cache lookups — not reversible).
 */
export function sha256(input: string): string {
  return crypto.createHash('sha256').update(input.trim().toLowerCase()).digest('hex');
}
