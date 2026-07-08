/**
 * Encrypt a plaintext string.
 * Returns: iv:tag:ciphertext (all base64, colon-separated)
 */
export declare function encrypt(plaintext: string): string;
/**
 * Decrypt a string produced by encrypt().
 */
export declare function decrypt(encoded: string): string;
/**
 * Hash a string with SHA-256 (for cache lookups — not reversible).
 */
export declare function sha256(input: string): string;
//# sourceMappingURL=crypto.d.ts.map