/**
 * Retry Handler
 * Wraps AI API calls with automatic key rotation and exponential backoff retry logic.
 * - HTTP 429 → rotate to next key immediately
 * - HTTP 503 → retry with exponential backoff
 * - HTTP 401 → mark key invalid, skip permanently
 */
import { logger } from '../utils/logger';
import {
  getActiveKey,
  markKeyRateLimited,
  markKeyInvalid,
  markKeySuccess,
  markKeyFailure,
  type Provider,
} from '../services/key-pool.service';

export interface RetryConfig {
  maxRetries?: number;         // default 3
  baseDelayMs?: number;        // default 1000ms
  maxDelayMs?: number;         // default 30000ms
  jitterMs?: number;           // default 500ms
}

export interface RetryContext {
  userId: string;
  provider: Provider;
  config?: RetryConfig;
  /** Called when key rotates — useful for SSE notifications */
  onKeyRotated?: (oldKeyName: string, newKeyName: string) => void;
}

interface ApiError {
  status?: number;
  response?: { status: number; headers?: { 'retry-after'?: string } };
  message?: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function jitter(maxMs: number): number {
  return Math.floor(Math.random() * maxMs);
}

function getRetryAfterSeconds(err: ApiError): number {
  const header = err.response?.headers?.['retry-after'];
  if (header) {
    const n = parseInt(header, 10);
    if (!isNaN(n)) return n;
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
export async function withRetry<T>(
  ctx: RetryContext,
  fn: (apiKey: string, keyId: string) => Promise<T>
): Promise<T> {
  const { userId, provider, config = {}, onKeyRotated } = ctx;
  const maxRetries = config.maxRetries ?? 3;
  const baseDelay = config.baseDelayMs ?? 1000;
  const maxDelay = config.maxDelayMs ?? 30_000;
  const jitterMax = config.jitterMs ?? 500;

  let lastError: Error = new Error('No API key available');
  let currentKeyName = '';

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const keyEntry = getActiveKey(userId, provider);

    if (!keyEntry) {
      const err = new Error('ALL_KEYS_EXHAUSTED');
      (err as ApiError & Error).status = 503;
      throw Object.assign(err, { code: 'ALL_KEYS_EXHAUSTED' });
    }

    if (attempt > 0 && currentKeyName && currentKeyName !== keyEntry.key_name) {
      onKeyRotated?.(currentKeyName, keyEntry.key_name);
      logger.info(`Key rotated: "${currentKeyName}" → "${keyEntry.key_name}" (attempt ${attempt + 1})`);
    }
    currentKeyName = keyEntry.key_name;

    const startMs = Date.now();
    try {
      const result = await fn(keyEntry.key_value, keyEntry.id);
      markKeySuccess(keyEntry.id, 0, Date.now() - startMs);
      return result;
    } catch (raw) {
      const err = raw as ApiError;
      const status = err.status ?? err.response?.status ?? 0;
      const msg = err.message ?? 'Unknown error';

      markKeyFailure(keyEntry.id, status, msg);
      lastError = raw instanceof Error ? raw : new Error(msg);

      // ── 401 Invalid Key ──────────────────────────────────────
      if (status === 401) {
        markKeyInvalid(keyEntry.id);
        logger.error(`Key "${keyEntry.key_name}" is INVALID (401). Skipping.`);
        continue; // Try next key without delay
      }

      // ── 429 Rate Limited ─────────────────────────────────────
      if (status === 429) {
        const retryAfter = getRetryAfterSeconds(err);
        markKeyRateLimited(keyEntry.id, retryAfter);
        logger.warn(`Key "${keyEntry.key_name}" rate-limited (429). Retry-After: ${retryAfter}s`);
        continue; // Rotate immediately to next key
      }

      // ── 503 High Demand / Server Error ───────────────────────
      if (status === 503 || status === 500 || status === 502) {
        if (attempt < maxRetries) {
          const delay = Math.min(baseDelay * Math.pow(2, attempt) + jitter(jitterMax), maxDelay);
          logger.warn(`Server error ${status}. Retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
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
