import { Router, Request, Response, NextFunction } from 'express';
import { getDb } from '../utils/database';
import { generateToken } from '../middleware/auth.middleware';
import { createError } from '../middleware/error.middleware';
import axios from 'axios';
import { encrypt, decrypt } from '../utils/crypto';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

const MENDELEY_AUTH_URL = 'https://api.mendeley.com/oauth/authorize';
const MENDELEY_TOKEN_URL = 'https://api.mendeley.com/oauth/token';

// ── GET /auth/session — Create or retrieve a session token ────
router.get('/session', (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    // For simplicity: single-user local mode. Create user if not exists.
    let user = db.prepare('SELECT id FROM users LIMIT 1').get() as { id: string } | undefined;
    if (!user) {
      const id = uuidv4();
      db.prepare('INSERT INTO users (id) VALUES (?)').run(id);
      // Create default settings
      db.prepare(
        `INSERT INTO user_settings (id, user_id) VALUES (?, ?)`
      ).run(uuidv4(), id);
      user = { id };
    }
    const token = generateToken(user.id);
    res.json({ success: true, token });
  } catch (err) {
    next(err);
  }
});

// ── GET /auth/mendeley — Redirect to Mendeley OAuth ───────────
router.get('/mendeley', (_req: Request, res: Response) => {
  const params = new URLSearchParams({
    client_id: process.env.MENDELEY_CLIENT_ID || '',
    redirect_uri: process.env.MENDELEY_REDIRECT_URI || '',
    response_type: 'code',
    scope: 'all',
  });
  res.redirect(`${MENDELEY_AUTH_URL}?${params}`);
});

// ── GET /auth/mendeley/callback — Handle OAuth callback ───────
router.get('/mendeley/callback', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { code } = req.query;
    if (!code) return next(createError('No auth code received', 400, 'OAUTH_ERROR'));

    const tokenRes = await axios.post(
      MENDELEY_TOKEN_URL,
      new URLSearchParams({
        grant_type: 'authorization_code',
        code: code as string,
        redirect_uri: process.env.MENDELEY_REDIRECT_URI || '',
      }),
      {
        headers: { 
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': 'Basic ' + Buffer.from(`${process.env.MENDELEY_CLIENT_ID}:${process.env.MENDELEY_CLIENT_SECRET}`).toString('base64')
        },
      }
    );

    const { access_token, refresh_token, expires_in } = tokenRes.data;
    const expiresAt = new Date(Date.now() + expires_in * 1000).toISOString();

    // Fetch Mendeley profile
    const profileRes = await axios.get('https://api.mendeley.com/profiles/me', {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    const profile = profileRes.data;

    const db = getDb();
    const user = db.prepare('SELECT id FROM users LIMIT 1').get() as { id: string };

    const existingToken = db.prepare('SELECT id FROM mendeley_tokens WHERE user_id = ?').get(user.id) as { id: string } | undefined;

    if (existingToken) {
      db.prepare(
        `UPDATE mendeley_tokens SET 
          access_token = ?, 
          refresh_token = ?, 
          expires_at = ?, 
          mendeley_profile = ?, 
          updated_at = datetime('now') 
         WHERE user_id = ?`
      ).run(
        encrypt(access_token),
        encrypt(refresh_token),
        expiresAt,
        JSON.stringify({ name: profile.display_name, email: profile.email, id: profile.id }),
        user.id
      );
    } else {
      db.prepare(
        `INSERT INTO mendeley_tokens (id, user_id, access_token, refresh_token, expires_at, mendeley_profile)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(
        uuidv4(),
        user.id,
        encrypt(access_token),
        encrypt(refresh_token),
        expiresAt,
        JSON.stringify({ name: profile.display_name, email: profile.email, id: profile.id })
      );
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
  } catch (err) {
    next(err);
  }
});

// ── GET /auth/mendeley/status ─────────────────────────────────
router.get('/mendeley/status', (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const user = db.prepare('SELECT id FROM users LIMIT 1').get() as { id: string } | undefined;
    
    if (!user) return res.json({ connected: false });

    const token = db
      .prepare('SELECT mendeley_profile, expires_at FROM mendeley_tokens WHERE user_id = ?')
      .get(user.id) as { mendeley_profile: string; expires_at: string } | undefined;

    if (!token) return res.json({ connected: false });

    const profile = token.mendeley_profile ? JSON.parse(token.mendeley_profile) : {};
    const isExpired = new Date(token.expires_at) < new Date();

    res.json({ connected: !isExpired, profile, expires_at: token.expires_at });
  } catch (err) {
    next(err);
  }
});

// ── DELETE /auth/mendeley — Disconnect Mendeley ───────────────
router.delete('/mendeley', (_req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const user = db.prepare('SELECT id FROM users LIMIT 1').get() as { id: string };
    db.prepare('DELETE FROM mendeley_tokens WHERE user_id = ?').run(user.id);
    res.json({ success: true, message: 'Mendeley disconnected' });
  } catch (err) {
    next(err);
  }
});

export default router;
