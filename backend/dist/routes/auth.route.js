"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const database_1 = require("../utils/database");
const auth_middleware_1 = require("../middleware/auth.middleware");
const error_middleware_1 = require("../middleware/error.middleware");
const axios_1 = __importDefault(require("axios"));
const crypto_1 = require("../utils/crypto");
const uuid_1 = require("uuid");
const router = (0, express_1.Router)();
const MENDELEY_AUTH_URL = 'https://api.mendeley.com/oauth/authorize';
const MENDELEY_TOKEN_URL = 'https://api.mendeley.com/oauth/token';
// ── GET /auth/session — Create or retrieve a session token ────
router.get('/session', (req, res, next) => {
    try {
        const db = (0, database_1.getDb)();
        // For simplicity: single-user local mode. Create user if not exists.
        let user = db.prepare('SELECT id FROM users LIMIT 1').get();
        if (!user) {
            const id = (0, uuid_1.v4)();
            db.prepare('INSERT INTO users (id) VALUES (?)').run(id);
            // Create default settings
            db.prepare(`INSERT INTO user_settings (id, user_id) VALUES (?, ?)`).run((0, uuid_1.v4)(), id);
            user = { id };
        }
        const token = (0, auth_middleware_1.generateToken)(user.id);
        res.json({ success: true, token });
    }
    catch (err) {
        next(err);
    }
});
// ── GET /auth/mendeley — Redirect to Mendeley OAuth ───────────
router.get('/mendeley', (_req, res) => {
    const params = new URLSearchParams({
        client_id: process.env.MENDELEY_CLIENT_ID || '',
        redirect_uri: process.env.MENDELEY_REDIRECT_URI || '',
        response_type: 'code',
        scope: 'all',
    });
    res.redirect(`${MENDELEY_AUTH_URL}?${params}`);
});
// ── GET /auth/mendeley/callback — Handle OAuth callback ───────
router.get('/mendeley/callback', async (req, res, next) => {
    try {
        const { code } = req.query;
        if (!code)
            return next((0, error_middleware_1.createError)('No auth code received', 400, 'OAUTH_ERROR'));
        const tokenRes = await axios_1.default.post(MENDELEY_TOKEN_URL, new URLSearchParams({
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: process.env.MENDELEY_REDIRECT_URI || '',
        }), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': 'Basic ' + Buffer.from(`${process.env.MENDELEY_CLIENT_ID}:${process.env.MENDELEY_CLIENT_SECRET}`).toString('base64')
            },
        });
        const { access_token, refresh_token, expires_in } = tokenRes.data;
        const expiresAt = new Date(Date.now() + expires_in * 1000).toISOString();
        // Fetch Mendeley profile
        const profileRes = await axios_1.default.get('https://api.mendeley.com/profiles/me', {
            headers: { Authorization: `Bearer ${access_token}` },
        });
        const profile = profileRes.data;
        const db = (0, database_1.getDb)();
        const user = db.prepare('SELECT id FROM users LIMIT 1').get();
        const existingToken = db.prepare('SELECT id FROM mendeley_tokens WHERE user_id = ?').get(user.id);
        if (existingToken) {
            db.prepare(`UPDATE mendeley_tokens SET 
          access_token = ?, 
          refresh_token = ?, 
          expires_at = ?, 
          mendeley_profile = ?, 
          updated_at = datetime('now') 
         WHERE user_id = ?`).run((0, crypto_1.encrypt)(access_token), (0, crypto_1.encrypt)(refresh_token), expiresAt, JSON.stringify({ name: profile.display_name, email: profile.email, id: profile.id }), user.id);
        }
        else {
            db.prepare(`INSERT INTO mendeley_tokens (id, user_id, access_token, refresh_token, expires_at, mendeley_profile)
         VALUES (?, ?, ?, ?, ?, ?)`).run((0, uuid_1.v4)(), user.id, (0, crypto_1.encrypt)(access_token), (0, crypto_1.encrypt)(refresh_token), expiresAt, JSON.stringify({ name: profile.display_name, email: profile.email, id: profile.id }));
        }
        // Close popup and notify parent
        res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Mendeley Login Success</title>
          <script src="https://appsforoffice.microsoft.com/lib/1/hosted/office.js"></script>
          <style>
            body { font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background: #f9fafb; margin: 0; }
            .card { background: white; padding: 20px 30px; border-radius: 8px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); text-align: center; }
            h2 { color: #10b981; margin-top: 0; }
            p { color: #6b7280; font-size: 14px; }
            button { margin-top: 15px; padding: 8px 16px; background: #4f46e5; color: white; border: none; border-radius: 4px; cursor: pointer; }
          </style>
        </head>
        <body>
          <div class="card">
            <h2>✅ Login Berhasil!</h2>
            <p>Otentikasi Mendeley untuk <b>${profile.display_name}</b> sukses.</p>
            <p id="status">Menutup jendela...</p>
            <button onclick="closeWindow()">Tutup Manual</button>
          </div>
          <script>
            function closeWindow() {
              const msg = JSON.stringify({ type: 'MENDELEY_AUTH_SUCCESS', name: '${profile.display_name}' });
              if (window.Office && window.Office.context && window.Office.context.ui) {
                Office.context.ui.messageParent(msg);
              } else {
                window.opener?.postMessage(JSON.parse(msg), '*');
                window.close();
              }
            }
            
            Office.onReady(function() {
              setTimeout(closeWindow, 1000);
            });

            // Fallback for non-Office environments
            setTimeout(closeWindow, 1500);
          </script>
        </body>
      </html>
    `);
    }
    catch (err) {
        next(err);
    }
});
// ── GET /auth/mendeley/status ─────────────────────────────────
router.get('/mendeley/status', (req, res, next) => {
    try {
        const db = (0, database_1.getDb)();
        const user = db.prepare('SELECT id FROM users LIMIT 1').get();
        const token = db
            .prepare('SELECT mendeley_profile, expires_at FROM mendeley_tokens WHERE user_id = ?')
            .get(user.id);
        if (!token)
            return res.json({ connected: false });
        const profile = token.mendeley_profile ? JSON.parse(token.mendeley_profile) : {};
        const isExpired = new Date(token.expires_at) < new Date();
        res.json({ connected: !isExpired, profile, expires_at: token.expires_at });
    }
    catch (err) {
        next(err);
    }
});
// ── DELETE /auth/mendeley — Disconnect Mendeley ───────────────
router.delete('/mendeley', (_req, res, next) => {
    try {
        const db = (0, database_1.getDb)();
        const user = db.prepare('SELECT id FROM users LIMIT 1').get();
        db.prepare('DELETE FROM mendeley_tokens WHERE user_id = ?').run(user.id);
        res.json({ success: true, message: 'Mendeley disconnected' });
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
//# sourceMappingURL=auth.route.js.map