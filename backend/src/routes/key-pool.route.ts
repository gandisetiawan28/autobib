import { Router, Response, NextFunction } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth.middleware';
import {
  getKeyPool,
  addKey,
  updateKey,
  deleteKey,
  reorderKeys,
  resetKeyCooldown,
  getPoolMonitor,
  type Provider,
} from '../services/key-pool.service';
import { withRetry } from '../utils/retry-handler';
import { createError } from '../middleware/error.middleware';

const router = Router();
router.use(authMiddleware);

const VALID_PROVIDERS: Provider[] = ['openai', 'gemini', 'claude', 'groq'];

function assertProvider(p: string): Provider {
  if (!VALID_PROVIDERS.includes(p as Provider)) throw createError(`Invalid provider: ${p}`, 400, 'INVALID_PROVIDER');
  return p as Provider;
}

// ── GET /settings/key-pool/:provider ─────────────────────────
router.get('/:provider', (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const provider = assertProvider(req.params.provider);
    const keys = getKeyPool(req.userId!, provider);
    res.json({ success: true, keys });
  } catch (err) { next(err); }
});

// ── GET /settings/key-pool/:provider/monitor ─────────────────
router.get('/:provider/monitor', (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const provider = assertProvider(req.params.provider);
    const monitor = getPoolMonitor(req.userId!, provider);
    res.json({ success: true, monitor });
  } catch (err) { next(err); }
});

// ── POST /settings/key-pool — Add a new key ───────────────────
router.post('/', (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { provider, key_name, key_value, priority } = req.body;
    if (!provider || !key_name || !key_value)
      return next(createError('provider, key_name, and key_value are required', 400));

    const prov = assertProvider(provider);
    const key = addKey(req.userId!, prov, key_name, key_value, priority);
    res.status(201).json({ success: true, key });
  } catch (err) { next(err); }
});

// ── PUT /settings/key-pool/:id — Update a key ────────────────
router.put('/:id', (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { key_name, priority, key_value } = req.body;
    updateKey(req.params.id, req.userId!, { key_name, priority, key_value });
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ── DELETE /settings/key-pool/:id — Remove a key ─────────────
router.delete('/:id', (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    deleteKey(req.params.id, req.userId!);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ── PUT /settings/key-pool/:provider/reorder — Reorder keys ──
router.put('/:provider/reorder', (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const provider = assertProvider(req.params.provider);
    const { ordered_ids } = req.body;
    if (!Array.isArray(ordered_ids)) return next(createError('ordered_ids must be an array', 400));
    reorderKeys(req.userId!, provider, ordered_ids);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ── POST /settings/key-pool/:id/reset — Reset cooldown ───────
router.post('/:id/reset', (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    resetKeyCooldown(req.params.id, req.userId!);
    res.json({ success: true, message: 'Cooldown reset' });
  } catch (err) { next(err); }
});

// ── POST /settings/key-pool/:id/test — Test a single key ─────
router.post('/:id/test', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { provider } = req.body;
    if (!provider) return next(createError('provider is required', 400));
    const prov = assertProvider(provider);

    let valid = false;
    let errorMsg = '';

    try {
      await withRetry({ userId: req.userId!, provider: prov, config: { maxRetries: 0 } },
        async (apiKey) => {
          // Minimal test request per provider
          if (prov === 'openai') {
            const { default: OpenAI } = await import('openai');
            const client = new OpenAI({ apiKey });
            await client.models.list();
          } else if (prov === 'gemini') {
            const { GoogleGenerativeAI } = await import('@google/generative-ai');
            const client = new GoogleGenerativeAI(apiKey);
            const model = client.getGenerativeModel({ model: 'gemini-2.5-flash' });
            await model.generateContent('hi');
          } else if (prov === 'claude') {
            const Anthropic = (await import('@anthropic-ai/sdk')).default;
            const client = new Anthropic({ apiKey });
            await client.messages.create({
              model: 'claude-3-haiku-20240307', max_tokens: 5,
              messages: [{ role: 'user', content: 'hi' }],
            });
          } else if (prov === 'groq') {
            const Groq = (await import('groq-sdk')).default;
            const client = new Groq({ apiKey });
            await client.chat.completions.create({
              model: 'llama-3.1-8b-instant', max_tokens: 5,
              messages: [{ role: 'user', content: 'hi' }],
            });
          }
        }
      );
      valid = true;
    } catch (err) {
      errorMsg = (err as Error).message;
    }

    res.json({ success: true, valid, error: valid ? undefined : errorMsg });
  } catch (err) { next(err); }
});

export default router;
