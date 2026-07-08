"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getKeyPool = getKeyPool;
exports.getActiveKey = getActiveKey;
exports.addKey = addKey;
exports.updateKey = updateKey;
exports.deleteKey = deleteKey;
exports.reorderKeys = reorderKeys;
exports.markKeyRateLimited = markKeyRateLimited;
exports.markKeyInvalid = markKeyInvalid;
exports.markKeySuccess = markKeySuccess;
exports.markKeyFailure = markKeyFailure;
exports.resetKeyCooldown = resetKeyCooldown;
exports.getPoolMonitor = getPoolMonitor;
/**
 * Key Pool Service
 * Manages multiple API keys per provider with rotation, cooldown, and usage logging.
 */
const uuid_1 = require("uuid");
const database_1 = require("../utils/database");
const crypto_1 = require("../utils/crypto");
const logger_1 = require("../utils/logger");
// ── Round-Robin state (in-memory per provider) ────────────────
const rrIndex = {};
// ═══════════════════════════════════════════════════════════════
// READ OPERATIONS
// ═══════════════════════════════════════════════════════════════
/**
 * Get all keys for a provider (without decrypted values — safe for frontend).
 */
function getKeyPool(userId, provider) {
    const db = (0, database_1.getDb)();
    return db
        .prepare(`SELECT id, provider, key_name, priority, status, created_at
       FROM api_key_pools
       WHERE user_id = ? AND provider = ?
       ORDER BY priority ASC, created_at ASC`)
        .all(userId, provider);
}
/**
 * Get the best available key for making an AI request,
 * based on the user's chosen rotation strategy.
 */
function getActiveKey(userId, provider) {
    const db = (0, database_1.getDb)();
    // Get strategy from settings
    const settings = db
        .prepare('SELECT rotation_strategy FROM user_settings WHERE user_id = ?')
        .get(userId);
    const strategy = settings?.rotation_strategy ?? 'failover';
    // Get all non-invalid, non-disabled keys
    const allKeys = db
        .prepare(`SELECT id, provider, key_name, key_value, priority, status, created_at
       FROM api_key_pools
       WHERE user_id = ? AND provider = ? AND status NOT IN ('invalid', 'disabled')
       ORDER BY priority ASC, created_at ASC`)
        .all(userId, provider);
    if (allKeys.length === 0)
        return null;
    // Filter out keys still in cooldown
    const now = new Date().toISOString();
    const available = allKeys.filter((k) => {
        if (k.status !== 'rate_limited')
            return true;
        const cooldown = db
            .prepare(`SELECT cooldown_until FROM key_cooldowns WHERE key_id = ? ORDER BY created_at DESC LIMIT 1`)
            .get(k.id);
        if (!cooldown)
            return true; // No cooldown record → key can be used
        if (cooldown.cooldown_until <= now) {
            // Cooldown expired → re-activate key
            db.prepare(`UPDATE api_key_pools SET status = 'active' WHERE id = ?`).run(k.id);
            return true;
        }
        return false; // Still cooling down
    });
    if (available.length === 0)
        return null;
    let chosen;
    switch (strategy) {
        case 'round_robin': {
            const key = `${userId}:${provider}`;
            rrIndex[key] = (rrIndex[key] ?? 0) % available.length;
            chosen = available[rrIndex[key]];
            rrIndex[key]++;
            break;
        }
        case 'least_used': {
            // Pick key with fewest successful requests in the last hour
            const hourAgo = new Date(Date.now() - 3600000).toISOString();
            const usageCounts = new Map();
            for (const k of available) {
                const row = db
                    .prepare(`SELECT COUNT(*) as cnt FROM key_usage_log
             WHERE key_id = ? AND timestamp > ? AND success = 1`)
                    .get(k.id, hourAgo);
                usageCounts.set(k.id, row.cnt);
            }
            chosen = available.reduce((a, b) => (usageCounts.get(a.id) ?? 0) <= (usageCounts.get(b.id) ?? 0) ? a : b);
            break;
        }
        case 'failover':
        default:
            chosen = available[0]; // Always try first (highest priority) key
    }
    if (!chosen)
        return null;
    return {
        ...chosen,
        key_value: (0, crypto_1.decrypt)(chosen.key_value),
    };
}
// ═══════════════════════════════════════════════════════════════
// WRITE OPERATIONS
// ═══════════════════════════════════════════════════════════════
function addKey(userId, provider, keyName, keyValue, priority) {
    const db = (0, database_1.getDb)();
    // Auto-set priority to end of queue if not specified
    const maxPriority = db
        .prepare(`SELECT COALESCE(MAX(priority), -1) + 1 as next_priority
       FROM api_key_pools WHERE user_id = ? AND provider = ?`)
        .get(userId, provider);
    const id = (0, uuid_1.v4)();
    const encrypted = (0, crypto_1.encrypt)(keyValue);
    db.prepare(`INSERT INTO api_key_pools (id, user_id, provider, key_name, key_value, priority, status)
     VALUES (?, ?, ?, ?, ?, ?, 'active')`).run(id, userId, provider, keyName, encrypted, priority ?? maxPriority.next_priority);
    logger_1.logger.info(`Key added: ${keyName} for ${provider}`);
    return getKeyPool(userId, provider).find((k) => k.id === id);
}
function updateKey(keyId, userId, updates) {
    const db = (0, database_1.getDb)();
    if (updates.key_name !== undefined) {
        db.prepare(`UPDATE api_key_pools SET key_name = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?`).run(updates.key_name, keyId, userId);
    }
    if (updates.priority !== undefined) {
        db.prepare(`UPDATE api_key_pools SET priority = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?`).run(updates.priority, keyId, userId);
    }
    if (updates.key_value !== undefined) {
        db.prepare(`UPDATE api_key_pools SET key_value = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?`).run((0, crypto_1.encrypt)(updates.key_value), keyId, userId);
    }
}
function deleteKey(keyId, userId) {
    (0, database_1.getDb)()
        .prepare(`DELETE FROM api_key_pools WHERE id = ? AND user_id = ?`)
        .run(keyId, userId);
    logger_1.logger.info(`Key deleted: ${keyId}`);
}
function reorderKeys(userId, provider, orderedIds) {
    const db = (0, database_1.getDb)();
    const update = db.prepare(`UPDATE api_key_pools SET priority = ? WHERE id = ? AND user_id = ? AND provider = ?`);
    const runAll = db.transaction(() => {
        orderedIds.forEach((id, idx) => update.run(idx, id, userId, provider));
    });
    runAll();
}
// ═══════════════════════════════════════════════════════════════
// STATUS UPDATES (called by Retry Handler)
// ═══════════════════════════════════════════════════════════════
/**
 * Mark a key as rate-limited and set a cooldown.
 * @param retryAfterSeconds - from the Retry-After response header
 */
function markKeyRateLimited(keyId, retryAfterSeconds = 60) {
    const db = (0, database_1.getDb)();
    const cooldownUntil = new Date(Date.now() + retryAfterSeconds * 1000).toISOString();
    db.prepare(`UPDATE api_key_pools SET status = 'rate_limited' WHERE id = ?`).run(keyId);
    db.prepare(`INSERT INTO key_cooldowns (id, key_id, cooldown_until, retry_after) VALUES (?, ?, ?, ?)`).run((0, uuid_1.v4)(), keyId, cooldownUntil, retryAfterSeconds);
    logger_1.logger.warn(`Key ${keyId} rate-limited. Cooldown until: ${cooldownUntil}`);
}
/**
 * Mark a key as invalid (401 Unauthorized).
 */
function markKeyInvalid(keyId) {
    (0, database_1.getDb)().prepare(`UPDATE api_key_pools SET status = 'invalid' WHERE id = ?`).run(keyId);
    logger_1.logger.error(`Key ${keyId} marked INVALID (401)`);
}
/**
 * Mark a successful request for a key.
 */
function markKeySuccess(keyId, tokensUsed = 0, responseMs = 0) {
    const db = (0, database_1.getDb)();
    db.prepare(`UPDATE api_key_pools SET status = 'active' WHERE id = ? AND status = 'rate_limited'`).run(keyId);
    db.prepare(`INSERT INTO key_usage_log (id, key_id, success, tokens_used, response_ms) VALUES (?, ?, 1, ?, ?)`).run((0, uuid_1.v4)(), keyId, tokensUsed, responseMs);
}
/**
 * Log a failed request.
 */
function markKeyFailure(keyId, errorCode, errorMsg) {
    (0, database_1.getDb)()
        .prepare(`INSERT INTO key_usage_log (id, key_id, success, error_code, error_msg) VALUES (?, ?, 0, ?, ?)`)
        .run((0, uuid_1.v4)(), keyId, errorCode, errorMsg);
}
/**
 * Force-reset a key's cooldown (manual override from UI).
 */
function resetKeyCooldown(keyId, userId) {
    const db = (0, database_1.getDb)();
    const key = db
        .prepare(`SELECT id FROM api_key_pools WHERE id = ? AND user_id = ?`)
        .get(keyId, userId);
    if (!key)
        throw new Error('Key not found');
    db.prepare(`DELETE FROM key_cooldowns WHERE key_id = ?`).run(keyId);
    db.prepare(`UPDATE api_key_pools SET status = 'active' WHERE id = ?`).run(keyId);
    logger_1.logger.info(`Cooldown manually reset for key ${keyId}`);
}
// ═══════════════════════════════════════════════════════════════
// MONITOR DASHBOARD DATA
// ═══════════════════════════════════════════════════════════════
function getPoolMonitor(userId, provider) {
    const db = (0, database_1.getDb)();
    const keys = getKeyPool(userId, provider);
    const now = new Date().toISOString();
    return keys.map((k) => {
        const total = db.prepare(`SELECT COUNT(*) as cnt FROM key_usage_log WHERE key_id = ?`).get(k.id).cnt;
        const success = db
            .prepare(`SELECT COUNT(*) as cnt FROM key_usage_log WHERE key_id = ? AND success = 1`)
            .get(k.id).cnt;
        const lastError = db
            .prepare(`SELECT error_code FROM key_usage_log WHERE key_id = ? AND success = 0 ORDER BY timestamp DESC LIMIT 1`)
            .get(k.id);
        const cooldown = db
            .prepare(`SELECT cooldown_until FROM key_cooldowns WHERE key_id = ? AND cooldown_until > ? ORDER BY created_at DESC LIMIT 1`)
            .get(k.id, now);
        return {
            ...k,
            total_requests: total,
            success_rate: total > 0 ? Math.round((success / total) * 100) : 100,
            last_error_code: lastError?.error_code,
            cooldown_until: cooldown?.cooldown_until,
        };
    });
}
//# sourceMappingURL=key-pool.service.js.map