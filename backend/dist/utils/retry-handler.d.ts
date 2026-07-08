import { type Provider } from '../services/key-pool.service';
export interface RetryConfig {
    maxRetries?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
    jitterMs?: number;
}
export interface RetryContext {
    userId: string;
    provider: Provider;
    config?: RetryConfig;
    /** Called when key rotates — useful for SSE notifications */
    onKeyRotated?: (oldKeyName: string, newKeyName: string) => void;
}
/**
 * Execute an AI request with automatic retry + key rotation.
 *
 * @param ctx - retry context (userId, provider, callbacks)
 * @param fn  - function that receives the decrypted API key and calls the AI SDK
 * @returns whatever fn returns
 */
export declare function withRetry<T>(ctx: RetryContext, fn: (apiKey: string, keyId: string) => Promise<T>): Promise<T>;
//# sourceMappingURL=retry-handler.d.ts.map