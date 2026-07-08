"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../middleware/auth.middleware");
const database_1 = require("../utils/database");
const uuid_1 = require("uuid");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authMiddleware);
// ── GET /settings ─────────────────────────────────────────────
router.get('/', (req, res, next) => {
    try {
        const db = (0, database_1.getDb)();
        const settings = db
            .prepare('SELECT * FROM user_settings WHERE user_id = ?')
            .get(req.userId);
        res.json({ success: true, settings: settings ?? {} });
    }
    catch (err) {
        next(err);
    }
});
// ── PUT /settings ─────────────────────────────────────────────
router.put('/', (req, res, next) => {
    try {
        const db = (0, database_1.getDb)();
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
      `).run(active_provider ?? null, rotation_strategy ?? null, citation_format ?? null, output_language ?? null, max_retry ?? null, retry_delay_ms ?? null, local_bridge_url ?? null, req.userId);
        }
        else {
            db.prepare(`
        INSERT INTO user_settings (id, user_id, active_provider, rotation_strategy, citation_format, output_language, max_retry, retry_delay_ms, local_bridge_url)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run((0, uuid_1.v4)(), req.userId, active_provider ?? 'gemini', rotation_strategy ?? 'failover', citation_format ?? 'apa', output_language ?? 'id', max_retry ?? 3, retry_delay_ms ?? 1000, local_bridge_url ?? 'http://127.0.0.1:3000');
        }
        res.json({ success: true });
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
//# sourceMappingURL=settings.route.js.map