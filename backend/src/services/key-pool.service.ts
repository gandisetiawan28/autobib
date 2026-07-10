/**
 * Key Pool Service
 * Manages multiple API keys per provider with rotation, cooldown, and usage logging.
 */
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../utils/database';
import { encrypt, decrypt } from '../utils/crypto';
import { logger } from '../utils/logger';

export type Provider = 'openai' | 'gemini' | 'claude' | 'groq' | string;
export type RotationStrategy = 'round_robin' | 'failover' | 'least_used';
export type KeyStatus = 'active' | 'rate_limited' | 'invalid' | 'disabled';

export interface ApiKeyPool {
  id: string;
  provider: Provider;
  key_name: string;
  priority: number;
  status: KeyStatus;
  created_at: string;
}

export interface ApiKeyWithValue extends ApiKeyPool {
  key_value: string; // decrypted
}

export interface KeyPoolStatus extends ApiKeyPool {
  total_requests: number;
  success_rate: number;
  last_error_code?: number;
  cooldown_until?: string;
}

// ── Round-Robin state (in-memory per provider) ────────────────
const rrIndex: Record<string, number> = {};

// ═══════════════════════════════════════════════════════════════
// READ OPERATIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Get all keys for a provider (without decrypted values — safe for frontend).
 */
export function getKeyPool(userId: string, provider: Provider): ApiKeyPool[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT id, provider, key_name, priority, status, created_at
       FROM api_key_pools
       WHERE user_id = ? AND provider = ?
       ORDER BY priority ASC, created_at ASC`
    )
    .all(userId, provider) as ApiKeyPool[];
}

/**
 * Get the best available key for making an AI request,
 * based on the user's chosen rotation strategy.
 */
export function getActiveKey(userId: string, provider: Provider): ApiKeyWithValue | null {
  const db = getDb();

  // Get strategy from settings
  const settings = db
    .prepare('SELECT rotation_strategy FROM user_settings WHERE user_id = ?')
    .get(userId) as { rotation_strategy: RotationStrategy } | undefined;
  const strategy = settings?.rotation_strategy ?? 'failover';

  // Get all non-invalid, non-disabled keys
  const allKeys = db
    .prepare(
      `SELECT id, provider, key_name, key_value, priority, status, created_at
       FROM api_key_pools
       WHERE user_id = ? AND provider = ? AND status NOT IN ('invalid', 'disabled')
       ORDER BY priority ASC, created_at ASC`
    )
    .all(userId, provider) as (ApiKeyPool & { key_value: string })[];

  if (allKeys.length === 0) return null;

  // Filter out keys still in cooldown
  const now = new Date().toISOString();
  const available = allKeys.filter((k) => {
    if (k.status !== 'rate_limited') return true;
    const cooldown = db
      .prepare(
        `SELECT cooldown_until FROM key_cooldowns WHERE key_id = ? ORDER BY created_at DESC LIMIT 1`
      )
      .get(k.id) as { cooldown_until: string } | undefined;
    if (!cooldown) return true; // No cooldown record → key can be used
    if (cooldown.cooldown_until <= now) {
      // Cooldown expired → re-activate key
      db.prepare(`UPDATE api_key_pools SET status = 'active' WHERE id = ?`).run(k.id);
      return true;
    }
    return false; // Still cooling down
  });

  if (available.length === 0) return null;

  let chosen: (ApiKeyPool & { key_value: string }) | undefined;

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
      const hourAgo = new Date(Date.now() - 3600_000).toISOString();
      const usageCounts = new Map<string, number>();
      for (const k of available) {
        const row = db
          .prepare(
            `SELECT COUNT(*) as cnt FROM key_usage_log
             WHERE key_id = ? AND timestamp > ? AND success = 1`
          )
          .get(k.id, hourAgo) as { cnt: number };
        usageCounts.set(k.id, row.cnt);
      }
      chosen = available.reduce((a, b) =>
        (usageCounts.get(a.id) ?? 0) <= (usageCounts.get(b.id) ?? 0) ? a : b
      );
      break;
    }
    case 'failover':
    default:
      chosen = available[0]; // Always try first (highest priority) key
  }

  if (!chosen) return null;

  return {
    ...chosen,
    key_value: decrypt(chosen.key_value),
  };
}

// ═══════════════════════════════════════════════════════════════
// WRITE OPERATIONS
// ═══════════════════════════════════════════════════════════════

export function addKey(
  userId: string,
  provider: Provider,
  keyName: string,
  keyValue: string,
  priority?: number
): ApiKeyPool {
  const db = getDb();

  // Auto-set priority to end of queue if not specified
  const maxPriority = db
    .prepare(
      `SELECT COALESCE(MAX(priority), -1) + 1 as next_priority
       FROM api_key_pools WHERE user_id = ? AND provider = ?`
    )
    .get(userId, provider) as { next_priority: number };

  const id = uuidv4();
  const encrypted = encrypt(keyValue);

  db.prepare(
    `INSERT INTO api_key_pools (id, user_id, provider, key_name, key_value, priority, status)
     VALUES (?, ?, ?, ?, ?, ?, 'active')`
  ).run(id, userId, provider, keyName, encrypted, priority ?? maxPriority.next_priority);

  logger.info(`Key added: ${keyName} for ${provider}`);
  return getKeyPool(userId, provider).find((k) => k.id === id)!;
}

export function updateKey(
  keyId: string,
  userId: string,
  updates: { key_name?: string; priority?: number; key_value?: string }
): void {
  const db = getDb();
  if (updates.key_name !== undefined) {
    db.prepare(
      `UPDATE api_key_pools SET key_name = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?`
    ).run(updates.key_name, keyId, userId);
  }
  if (updates.priority !== undefined) {
    db.prepare(
      `UPDATE api_key_pools SET priority = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?`
    ).run(updates.priority, keyId, userId);
  }
  if (updates.key_value !== undefined) {
    db.prepare(
      `UPDATE api_key_pools SET key_value = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?`
    ).run(encrypt(updates.key_value), keyId, userId);
  }
}

export function deleteKey(keyId: string, userId: string): void {
  getDb()
    .prepare(`DELETE FROM api_key_pools WHERE id = ? AND user_id = ?`)
    .run(keyId, userId);
  logger.info(`Key deleted: ${keyId}`);
}

export function reorderKeys(userId: string, provider: Provider, orderedIds: string[]): void {
  const db = getDb();
  const update = db.prepare(
    `UPDATE api_key_pools SET priority = ? WHERE id = ? AND user_id = ? AND provider = ?`
  );
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
export function markKeyRateLimited(keyId: string, retryAfterSeconds = 60): void {
  const db = getDb();
  const cooldownUntil = new Date(Date.now() + retryAfterSeconds * 1000).toISOString();

  db.prepare(`UPDATE api_key_pools SET status = 'rate_limited' WHERE id = ?`).run(keyId);
  db.prepare(
    `INSERT INTO key_cooldowns (id, key_id, cooldown_until, retry_after) VALUES (?, ?, ?, ?)`
  ).run(uuidv4(), keyId, cooldownUntil, retryAfterSeconds);

  logger.warn(`Key ${keyId} rate-limited. Cooldown until: ${cooldownUntil}`);
}

/**
 * Mark a key as invalid (401 Unauthorized).
 */
export function markKeyInvalid(keyId: string): void {
  getDb().prepare(`UPDATE api_key_pools SET status = 'invalid' WHERE id = ?`).run(keyId);
  logger.error(`Key ${keyId} marked INVALID (401)`);
}

/**
 * Mark a successful request for a key.
 */
export function markKeySuccess(keyId: string, tokensUsed = 0, responseMs = 0): void {
  const db = getDb();
  db.prepare(`UPDATE api_key_pools SET status = 'active' WHERE id = ? AND status = 'rate_limited'`).run(keyId);
  db.prepare(
    `INSERT INTO key_usage_log (id, key_id, success, tokens_used, response_ms) VALUES (?, ?, 1, ?, ?)`
  ).run(uuidv4(), keyId, tokensUsed, responseMs);
}

/**
 * Log a failed request.
 */
export function markKeyFailure(keyId: string, errorCode: number, errorMsg: string): void {
  getDb()
    .prepare(
      `INSERT INTO key_usage_log (id, key_id, success, error_code, error_msg) VALUES (?, ?, 0, ?, ?)`
    )
    .run(uuidv4(), keyId, errorCode, errorMsg);
}

/**
 * Force-reset a key's cooldown (manual override from UI).
 */
export function resetKeyCooldown(keyId: string, userId: string): void {
  const db = getDb();
  const key = db
    .prepare(`SELECT id FROM api_key_pools WHERE id = ? AND user_id = ?`)
    .get(keyId, userId);
  if (!key) throw new Error('Key not found');
  db.prepare(`DELETE FROM key_cooldowns WHERE key_id = ?`).run(keyId);
  db.prepare(`UPDATE api_key_pools SET status = 'active' WHERE id = ?`).run(keyId);
  logger.info(`Cooldown manually reset for key ${keyId}`);
}

// ═══════════════════════════════════════════════════════════════
// MONITOR DASHBOARD DATA
// ═══════════════════════════════════════════════════════════════

export function getPoolMonitor(userId: string, provider: Provider): KeyPoolStatus[] {
  const db = getDb();
  const keys = getKeyPool(userId, provider);
  const now = new Date().toISOString();

  return keys.map((k) => {
    const total = (
      db.prepare(`SELECT COUNT(*) as cnt FROM key_usage_log WHERE key_id = ?`).get(k.id) as {
        cnt: number;
      }
    ).cnt;

    const success = (
      db
        .prepare(`SELECT COUNT(*) as cnt FROM key_usage_log WHERE key_id = ? AND success = 1`)
        .get(k.id) as { cnt: number }
    ).cnt;

    const lastError = db
      .prepare(
        `SELECT error_code FROM key_usage_log WHERE key_id = ? AND success = 0 ORDER BY timestamp DESC LIMIT 1`
      )
      .get(k.id) as { error_code: number } | undefined;

    const cooldown = db
      .prepare(
        `SELECT cooldown_until FROM key_cooldowns WHERE key_id = ? AND cooldown_until > ? ORDER BY created_at DESC LIMIT 1`
      )
      .get(k.id, now) as { cooldown_until: string } | undefined;

    return {
      ...k,
      total_requests: total,
      success_rate: total > 0 ? Math.round((success / total) * 100) : 100,
      last_error_code: lastError?.error_code,
      cooldown_until: cooldown?.cooldown_until,
    };
  });
}
