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
    key_value: string;
}
export interface KeyPoolStatus extends ApiKeyPool {
    total_requests: number;
    success_rate: number;
    last_error_code?: number;
    cooldown_until?: string;
}
/**
 * Get all keys for a provider (without decrypted values — safe for frontend).
 */
export declare function getKeyPool(userId: string, provider: Provider): ApiKeyPool[];
/**
 * Get the best available key for making an AI request,
 * based on the user's chosen rotation strategy.
 */
export declare function getActiveKey(userId: string, provider: Provider): ApiKeyWithValue | null;
export declare function addKey(userId: string, provider: Provider, keyName: string, keyValue: string, priority?: number): ApiKeyPool;
export declare function updateKey(keyId: string, userId: string, updates: {
    key_name?: string;
    priority?: number;
    key_value?: string;
}): void;
export declare function deleteKey(keyId: string, userId: string): void;
export declare function reorderKeys(userId: string, provider: Provider, orderedIds: string[]): void;
/**
 * Mark a key as rate-limited and set a cooldown.
 * @param retryAfterSeconds - from the Retry-After response header
 */
export declare function markKeyRateLimited(keyId: string, retryAfterSeconds?: number): void;
/**
 * Mark a key as invalid (401 Unauthorized).
 */
export declare function markKeyInvalid(keyId: string): void;
/**
 * Mark a successful request for a key.
 */
export declare function markKeySuccess(keyId: string, tokensUsed?: number, responseMs?: number): void;
/**
 * Log a failed request.
 */
export declare function markKeyFailure(keyId: string, errorCode: number, errorMsg: string): void;
/**
 * Force-reset a key's cooldown (manual override from UI).
 */
export declare function resetKeyCooldown(keyId: string, userId: string): void;
export declare function getPoolMonitor(userId: string, provider: Provider): KeyPoolStatus[];
//# sourceMappingURL=key-pool.service.d.ts.map