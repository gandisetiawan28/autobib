"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.withRetry = withRetry;
/**
 * Retry Handler
 * Wraps AI API calls with automatic key rotation and exponential backoff retry logic.
 * - HTTP 429 → rotate to next key immediately
 * - HTTP 503 → retry with exponential backoff
 * - HTTP 401 → mark key invalid, skip permanently
 */
const logger_1 = require("../utils/logger");
const key_pool_service_1 = require("../services/key-pool.service");
function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}
function jitter(maxMs) {
    return Math.floor(Math.random() * maxMs);
}
function getRetryAfterSeconds(err) {
    const header = err.response?.headers?.['retry-after'];
    if (header) {
        const n = parseInt(header, 10);
        if (!isNaN(n))
            return n;
    }
    return 60; // default 60s cooldown
}
/**
 * Execute an AI request with automatic retry + key rotation.
 *
 * @param ctx - retry context (userId, provider, callbacks)
 * @param fn  - function that receives the decrypted API key and calls the AI SDK
 * @returns whatever fn returns
 */
async function withRetry(ctx, fn) {
    const { userId, provider, config = {}, onKeyRotated } = ctx;
    const maxRetries = config.maxRetries ?? 3;
    const baseDelay = config.baseDelayMs ?? 1000;
    const maxDelay = config.maxDelayMs ?? 30000;
    const jitterMax = config.jitterMs ?? 500;
    let lastError = new Error('No API key available');
    let currentKeyName = '';
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const keyEntry = (0, key_pool_service_1.getActiveKey)(userId, provider);
        if (!keyEntry) {
            const err = new Error('ALL_KEYS_EXHAUSTED');
            err.status = 503;
            throw Object.assign(err, { code: 'ALL_KEYS_EXHAUSTED' });
        }
        if (attempt > 0 && currentKeyName && currentKeyName !== keyEntry.key_name) {
            onKeyRotated?.(currentKeyName, keyEntry.key_name);
            logger_1.logger.info(`Key rotated: "${currentKeyName}" → "${keyEntry.key_name}" (attempt ${attempt + 1})`);
        }
        currentKeyName = keyEntry.key_name;
        const startMs = Date.now();
        try {
            const result = await fn(keyEntry.key_value, keyEntry.id);
            (0, key_pool_service_1.markKeySuccess)(keyEntry.id, 0, Date.now() - startMs);
            return result;
        }
        catch (raw) {
            const err = raw;
            const status = err.status ?? err.response?.status ?? 0;
            const msg = err.message ?? 'Unknown error';
            (0, key_pool_service_1.markKeyFailure)(keyEntry.id, status, msg);
            lastError = raw instanceof Error ? raw : new Error(msg);
            // ── 401 Invalid Key ──────────────────────────────────────
            if (status === 401) {
                (0, key_pool_service_1.markKeyInvalid)(keyEntry.id);
                logger_1.logger.error(`Key "${keyEntry.key_name}" is INVALID (401). Skipping.`);
                continue; // Try next key without delay
            }
            // ── 429 Rate Limited ─────────────────────────────────────
            if (status === 429) {
                const retryAfter = getRetryAfterSeconds(err);
                (0, key_pool_service_1.markKeyRateLimited)(keyEntry.id, retryAfter);
                logger_1.logger.warn(`Key "${keyEntry.key_name}" rate-limited (429). Retry-After: ${retryAfter}s`);
                continue; // Rotate immediately to next key
            }
            // ── 503 High Demand / Server Error ───────────────────────
            if (status === 503 || status === 500 || status === 502) {
                if (attempt < maxRetries) {
                    const delay = Math.min(baseDelay * Math.pow(2, attempt) + jitter(jitterMax), maxDelay);
                    logger_1.logger.warn(`Server error ${status}. Retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
                    await sleep(delay);
                    continue;
                }
            }
            // ── Other errors → throw immediately ─────────────────────
            throw lastError;
        }
    }
    throw lastError;
}
//# sourceMappingURL=retry-handler.js.map