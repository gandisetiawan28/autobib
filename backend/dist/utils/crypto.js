"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.encrypt = encrypt;
exports.decrypt = decrypt;
exports.sha256 = sha256;
const crypto_1 = __importDefault(require("crypto"));
const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
function getEncryptionKey() {
    const raw = process.env.ENCRYPTION_KEY || 'fallback-key-change-in-production!';
    // Derive a consistent 32-byte key
    return crypto_1.default.scryptSync(raw, 'autobib-salt', KEY_LENGTH);
}
/**
 * Encrypt a plaintext string.
 * Returns: iv:tag:ciphertext (all base64, colon-separated)
 */
function encrypt(plaintext) {
    const iv = crypto_1.default.randomBytes(IV_LENGTH);
    const key = getEncryptionKey();
    const cipher = crypto_1.default.createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [iv.toString('base64'), tag.toString('base64'), encrypted.toString('base64')].join(':');
}
/**
 * Decrypt a string produced by encrypt().
 */
function decrypt(encoded) {
    const [ivB64, tagB64, dataB64] = encoded.split(':');
    if (!ivB64 || !tagB64 || !dataB64)
        throw new Error('Invalid encrypted format');
    const iv = Buffer.from(ivB64, 'base64');
    const tag = Buffer.from(tagB64, 'base64');
    const data = Buffer.from(dataB64, 'base64');
    const key = getEncryptionKey();
    const decipher = crypto_1.default.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    return decipher.update(data).toString('utf8') + decipher.final('utf8');
}
/**
 * Hash a string with SHA-256 (for cache lookups — not reversible).
 */
function sha256(input) {
    return crypto_1.default.createHash('sha256').update(input.trim().toLowerCase()).digest('hex');
}
//# sourceMappingURL=crypto.js.map