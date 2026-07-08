"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../middleware/auth.middleware");
const key_pool_service_1 = require("../services/key-pool.service");
const retry_handler_1 = require("../utils/retry-handler");
const error_middleware_1 = require("../middleware/error.middleware");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authMiddleware);
const VALID_PROVIDERS = ['openai', 'gemini', 'claude', 'groq'];
function assertProvider(p) {
    if (!VALID_PROVIDERS.includes(p))
        throw (0, error_middleware_1.createError)(`Invalid provider: ${p}`, 400, 'INVALID_PROVIDER');
    return p;
}
// ── GET /settings/key-pool/:provider ─────────────────────────
router.get('/:provider', (req, res, next) => {
    try {
        const provider = assertProvider(req.params.provider);
        const keys = (0, key_pool_service_1.getKeyPool)(req.userId, provider);
        res.json({ success: true, keys });
    }
    catch (err) {
        next(err);
    }
});
// ── GET /settings/key-pool/:provider/monitor ─────────────────
router.get('/:provider/monitor', (req, res, next) => {
    try {
        const provider = assertProvider(req.params.provider);
        const monitor = (0, key_pool_service_1.getPoolMonitor)(req.userId, provider);
        res.json({ success: true, monitor });
    }
    catch (err) {
        next(err);
    }
});
// ── POST /settings/key-pool — Add a new key ───────────────────
router.post('/', (req, res, next) => {
    try {
        const { provider, key_name, key_value, priority } = req.body;
        if (!provider || !key_name || !key_value)
            return next((0, error_middleware_1.createError)('provider, key_name, and key_value are required', 400));
        const prov = assertProvider(provider);
        const key = (0, key_pool_service_1.addKey)(req.userId, prov, key_name, key_value, priority);
        res.status(201).json({ success: true, key });
    }
    catch (err) {
        next(err);
    }
});
// ── PUT /settings/key-pool/:id — Update a key ────────────────
router.put('/:id', (req, res, next) => {
    try {
        const { key_name, priority, key_value } = req.body;
        (0, key_pool_service_1.updateKey)(req.params.id, req.userId, { key_name, priority, key_value });
        res.json({ success: true });
    }
    catch (err) {
        next(err);
    }
});
// ── DELETE /settings/key-pool/:id — Remove a key ─────────────
router.delete('/:id', (req, res, next) => {
    try {
        (0, key_pool_service_1.deleteKey)(req.params.id, req.userId);
        res.json({ success: true });
    }
    catch (err) {
        next(err);
    }
});
// ── PUT /settings/key-pool/:provider/reorder — Reorder keys ──
router.put('/:provider/reorder', (req, res, next) => {
    try {
        const provider = assertProvider(req.params.provider);
        const { ordered_ids } = req.body;
        if (!Array.isArray(ordered_ids))
            return next((0, error_middleware_1.createError)('ordered_ids must be an array', 400));
        (0, key_pool_service_1.reorderKeys)(req.userId, provider, ordered_ids);
        res.json({ success: true });
    }
    catch (err) {
        next(err);
    }
});
// ── POST /settings/key-pool/:id/reset — Reset cooldown ───────
router.post('/:id/reset', (req, res, next) => {
    try {
        (0, key_pool_service_1.resetKeyCooldown)(req.params.id, req.userId);
        res.json({ success: true, message: 'Cooldown reset' });
    }
    catch (err) {
        next(err);
    }
});
// ── POST /settings/key-pool/:id/test — Test a single key ─────
router.post('/:id/test', async (req, res, next) => {
    try {
        const { provider } = req.body;
        if (!provider)
            return next((0, error_middleware_1.createError)('provider is required', 400));
        const prov = assertProvider(provider);
        let valid = false;
        let errorMsg = '';
        try {
            await (0, retry_handler_1.withRetry)({ userId: req.userId, provider: prov, config: { maxRetries: 0 } }, async (apiKey) => {
                // Minimal test request per provider
                if (prov === 'openai') {
                    const { default: OpenAI } = await Promise.resolve().then(() => __importStar(require('openai')));
                    const client = new OpenAI({ apiKey });
                    await client.models.list();
                }
                else if (prov === 'gemini') {
                    const { GoogleGenerativeAI } = await Promise.resolve().then(() => __importStar(require('@google/generative-ai')));
                    const client = new GoogleGenerativeAI(apiKey);
                    const model = client.getGenerativeModel({ model: 'gemini-2.5-flash' });
                    await model.generateContent('hi');
                }
                else if (prov === 'claude') {
                    const Anthropic = (await Promise.resolve().then(() => __importStar(require('@anthropic-ai/sdk')))).default;
                    const client = new Anthropic({ apiKey });
                    await client.messages.create({
                        model: 'claude-3-haiku-20240307', max_tokens: 5,
                        messages: [{ role: 'user', content: 'hi' }],
                    });
                }
                else if (prov === 'groq') {
                    const Groq = (await Promise.resolve().then(() => __importStar(require('groq-sdk')))).default;
                    const client = new Groq({ apiKey });
                    await client.chat.completions.create({
                        model: 'llama-3.1-8b-instant', max_tokens: 5,
                        messages: [{ role: 'user', content: 'hi' }],
                    });
                }
            });
            valid = true;
        }
        catch (err) {
            errorMsg = err.message;
        }
        res.json({ success: true, valid, error: valid ? undefined : errorMsg });
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
//# sourceMappingURL=key-pool.route.js.map