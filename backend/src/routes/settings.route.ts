import { Router, Response, NextFunction } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth.middleware';
import { getDb } from '../utils/database';
import { v4 as uuidv4 } from 'uuid';

const router = Router();
router.use(authMiddleware);

// ── GET /settings ─────────────────────────────────────────────
router.get('/', (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const settings = db
      .prepare('SELECT * FROM user_settings WHERE user_id = ?')
      .get(req.userId) as Record<string, unknown> | undefined;
    res.json({ success: true, settings: settings ?? {} });
  } catch (err) { next(err); }
});

// ── PUT /settings ─────────────────────────────────────────────
router.put('/', (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const { active_provider, rotation_strategy, citation_format, output_language, max_retry, retry_delay_ms, local_bridge_url } = req.body;

    const existing = db.prepare('SELECT id FROM user_settings WHERE user_id = ?').get(req.userId);
    if (existing) {
      db.prepare(`
        UPDATE user_settings SET
          active_provider = COALESCE(?, active_provider),
          rotation_strategy = COALESCE(?, rotation_strategy),
          citation_format = COALESCE(?, citation_format),
          output_language = COALESCE(?, output_language),
          max_retry = COALESCE(?, max_retry),
          retry_delay_ms = COALESCE(?, retry_delay_ms),
          local_bridge_url = COALESCE(?, local_bridge_url),
          updated_at = datetime('now')
        WHERE user_id = ?
      `).run(
        active_provider ?? null,
        rotation_strategy ?? null,
        citation_format ?? null,
        output_language ?? null,
        max_retry ?? null,
        retry_delay_ms ?? null,
        local_bridge_url ?? null,
        req.userId
      );
    } else {
      db.prepare(`
        INSERT INTO user_settings (id, user_id, active_provider, rotation_strategy, citation_format, output_language, max_retry, retry_delay_ms, local_bridge_url)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(uuidv4(), req.userId, active_provider ?? 'gemini', rotation_strategy ?? 'failover',
             citation_format ?? 'apa', output_language ?? 'id', max_retry ?? 3, retry_delay_ms ?? 1000, local_bridge_url ?? 'http://127.0.0.1:3000');
    }
    res.json({ success: true });
  } catch (err) { next(err); }
});

export default router;
