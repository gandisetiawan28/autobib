import { Router, Response, NextFunction } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth.middleware';
import axios from 'axios';
import { getDb } from '../utils/database';
import { decrypt } from '../utils/crypto';
import { createError } from '../middleware/error.middleware';

const router = Router();
router.use(authMiddleware);

export async function getMendeleyToken(userId: string): Promise<string> {
  const db = getDb();
  const row = db
    .prepare('SELECT access_token, refresh_token, expires_at FROM mendeley_tokens WHERE user_id = ?')
    .get(userId) as { access_token: string; refresh_token: string; expires_at: string } | undefined;

  if (!row) throw createError('Mendeley not connected', 401, 'MENDELEY_NOT_CONNECTED');

  if (new Date(row.expires_at) > new Date()) {
    return decrypt(row.access_token);
  }

  // Token expired → refresh
  const res = await axios.post(
    'https://api.mendeley.com/oauth/token',
    new URLSearchParams({ grant_type: 'refresh_token', refresh_token: decrypt(row.refresh_token) }),
    {
      auth: { username: process.env.MENDELEY_CLIENT_ID!, password: process.env.MENDELEY_CLIENT_SECRET! },
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    }
  );
  const { access_token, expires_in } = res.data;
  const expiresAt = new Date(Date.now() + expires_in * 1000).toISOString();
  const { encrypt } = await import('../utils/crypto');
  db.prepare(
    `UPDATE mendeley_tokens SET access_token = ?, expires_at = ?, updated_at = datetime('now') WHERE user_id = ?`
  ).run(encrypt(access_token), expiresAt, userId);
  return access_token;
}

// ── GET /mendeley/documents ───────────────────────────────────
router.get('/documents', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const token = await getMendeleyToken(req.userId!);
    const { limit = 500, offset = 0, group_id } = req.query;
    const params: Record<string, unknown> = { limit, offset, view: 'bib' };
    if (group_id) params.group_id = group_id;

    const mendeleyRes = await axios.get('https://api.mendeley.com/documents', {
      headers: { Authorization: `Bearer ${token}` },
      params,
    });
    res.json({ success: true, documents: mendeleyRes.data });
  } catch (err) { next(err); }
});

// ── GET /mendeley/documents/search ───────────────────────────
router.get('/documents/search', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const token = await getMendeleyToken(req.userId!);
    const { q, limit = 100 } = req.query;
    if (!q || typeof q !== 'string') return next(createError('Query q is required', 400));

    // Mendeley does not have a /search/documents endpoint for user libraries.
    // We must fetch documents and filter them locally.
    const mendeleyRes = await axios.get('https://api.mendeley.com/documents', {
      headers: { Authorization: `Bearer ${token}` },
      params: { limit: 500, view: 'bib' },
    });
    
    const queryParts = q.toLowerCase().split(/\s+/);
    
    const filtered = mendeleyRes.data.filter((doc: any) => {
      let docText = (doc.title || '') + ' ' + (doc.year || '');
      if (doc.authors) {
        docText += ' ' + doc.authors.map((a: any) => `${a.first_name} ${a.last_name}`).join(' ');
      }
      docText = docText.toLowerCase();
      // Must match all parts of the query (e.g. "Palupi" AND "2025")
      return queryParts.every(part => docText.includes(part));
    });

    res.json({ success: true, documents: filtered.slice(0, Number(limit)) });
  } catch (err) { next(err); }
});

// ── GET /mendeley/documents/:id ───────────────────────────────
router.get('/documents/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const token = await getMendeleyToken(req.userId!);
    const mendeleyRes = await axios.get(`https://api.mendeley.com/documents/${req.params.id}`, {
      headers: { Authorization: `Bearer ${token}` },
      params: { view: 'all' },
    });
    res.json({ success: true, document: mendeleyRes.data });
  } catch (err) { next(err); }
});

// ── PATCH /mendeley/documents/:id ─────────────────────────────
router.patch('/documents/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const token = await getMendeleyToken(req.userId!);
    const mendeleyRes = await axios.patch(`https://api.mendeley.com/documents/${req.params.id}`, req.body, {
      headers: { 
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/vnd.mendeley-document.1+json'
      }
    });
    res.json({ success: true, document: mendeleyRes.data });
  } catch (err) { next(err); }
});

// ── DELETE /mendeley/documents/:id ────────────────────────────
router.delete('/documents/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const token = await getMendeleyToken(req.userId!);
    await axios.delete(`https://api.mendeley.com/documents/${req.params.id}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ── GET /mendeley/groups ──────────────────────────────────────
router.get('/groups', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const token = await getMendeleyToken(req.userId!);
    const mendeleyRes = await axios.get('https://api.mendeley.com/groups/v2', {
      headers: { Authorization: `Bearer ${token}` },
    });
    res.json({ success: true, groups: mendeleyRes.data });
  } catch (err) { next(err); }
});

// ── GET /mendeley/folders ─────────────────────────────────────
router.get('/folders', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const token = await getMendeleyToken(req.userId!);
    const mendeleyRes = await axios.get('https://api.mendeley.com/folders', {
      headers: { Authorization: `Bearer ${token}` },
      params: { limit: 100 }
    });
    res.json({ success: true, folders: mendeleyRes.data });
  } catch (err) { next(err); }
});

// ── GET /mendeley/folders/:id/documents ───────────────────────
router.get('/folders/:id/documents', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const token = await getMendeleyToken(req.userId!);
    const mendeleyRes = await axios.get(`https://api.mendeley.com/folders/${req.params.id}/documents`, {
      headers: { Authorization: `Bearer ${token}` },
      params: { limit: 500 }
    });
    res.json({ success: true, document_ids: mendeleyRes.data.map((d: any) => d.id) });
  } catch (err) { next(err); }
});

// ── POST /mendeley/documents — Auto-add paper to library ──────
router.post('/documents', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const token = await getMendeleyToken(req.userId!);
    const { csl_json } = req.body;
    if (!csl_json) return next(createError('csl_json is required', 400));

    // Convert CSL JSON to Mendeley document format
    const doc = {
      title: csl_json.title,
      type: csl_json.type === 'article-journal' ? 'journal' : 'generic',
      year: csl_json.issued?.['date-parts']?.[0]?.[0],
      authors: (csl_json.author || []).map((a: { family?: string; given?: string; literal?: string }) => ({
        last_name: a.family || a.literal || 'Unknown',
        first_name: a.given || '',
      })),
      source: csl_json['container-title'] || csl_json.publisher,
      identifiers: csl_json.DOI ? { doi: csl_json.DOI } : undefined,
      abstract: csl_json.abstract,
      volume: csl_json.volume,
      issue: csl_json.issue,
      pages: csl_json.page,
    };

    const mendeleyRes = await axios.post('https://api.mendeley.com/documents', doc, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/vnd.mendeley-document.1+json' },
    });

    res.status(201).json({ success: true, document: mendeleyRes.data, uuid: mendeleyRes.data.id });
  } catch (err) { next(err); }
});

// ── POST /mendeley/upload — Upload PDF & Create Document ──────
import express from 'express';
router.post('/upload', express.raw({ type: '*/*', limit: '50mb' }), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const token = await getMendeleyToken(req.userId!);
    const { filename, target } = req.query;
    
    if (!req.body || !Buffer.isBuffer(req.body)) {
      return next(createError('File data is missing or invalid', 400));
    }
    
    // Set up params based on target
    const params: any = {};
    if (target && typeof target === 'string' && target.startsWith('group_')) {
      params.group_id = target.replace('group_', '');
    }
    
    // 1. Upload to Mendeley to extract metadata and create document
    const mendeleyRes = await axios.post('https://api.mendeley.com/documents', req.body, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename || 'document.pdf'}"`
      },
      params
    });
    
    const newDocId = mendeleyRes.data.id;
    
    // 2. If target is a folder, link it to the folder
    if (target && typeof target === 'string' && target.startsWith('folder_')) {
      const folderId = target.replace('folder_', '');
      try {
        await axios.post(`https://api.mendeley.com/folders/${folderId}/documents`, { id: newDocId }, {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/vnd.mendeley-document.1+json'
          }
        });
      } catch (err) {
        // If folder linking fails, we still created the document successfully.
        console.error('Failed to link document to folder', err);
      }
    }
    
    res.status(201).json({ success: true, document: mendeleyRes.data });
  } catch (err) { next(err); }
});

// ── POST /mendeley/add-link — Add Web Page by URL ─────────────
router.post('/add-link', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const token = await getMendeleyToken(req.userId!);
    const { url, target } = req.body;
    
    if (!url) return next(createError('URL is required', 400));
    
    // Fetch HTML
    let html = '';
    try {
      const pageRes = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36' }, timeout: 10000 });
      html = pageRes.data;
    } catch (e) {
      console.warn('Could not fetch URL for scraping', e);
      // We will just create a generic link document
    }

    // Extract metadata via regex
    const getMatch = (regex: RegExp) => {
      const match = html.match(regex);
      return match ? match[1].trim() : null;
    };
    
    const title = getMatch(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i) 
               || getMatch(/<title[^>]*>([^<]+)<\/title>/i) 
               || url;
               
    const abstract = getMatch(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i) 
                  || getMatch(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i) 
                  || '';
                  
    const source = getMatch(/<meta[^>]*property=["']og:site_name["'][^>]*content=["']([^"']+)["']/i) 
                || new URL(url).hostname;
                
    const authorRaw = getMatch(/<meta[^>]*name=["']author["'][^>]*content=["']([^"']+)["']/i);
    let authors = [];
    if (authorRaw) {
      const parts = authorRaw.split(' ');
      if (parts.length === 1) {
        authors.push({ last_name: parts[0], first_name: '' });
      } else {
        authors.push({ last_name: parts.pop(), first_name: parts.join(' ') });
      }
    }

    const pubDateRaw = getMatch(/<meta[^>]*property=["']article:published_time["'][^>]*content=["']([^"']+)["']/i)
                    || getMatch(/<meta[^>]*name=["']pubdate["'][^>]*content=["']([^"']+)["']/i);
    let year = undefined;
    if (pubDateRaw) {
      const matchYear = pubDateRaw.match(/^(\d{4})/);
      if (matchYear) year = parseInt(matchYear[1], 10);
    }

    const doc = {
      title,
      type: 'web_page',
      source,
      abstract,
      year,
      websites: [url],
      authors: authors.length > 0 ? authors : undefined,
      accessed: new Date().toISOString().split('T')[0] // current date YYYY-MM-DD
    };

    // Set up params based on target
    const params: any = {};
    if (target && typeof target === 'string' && target.startsWith('group_')) {
      params.group_id = target.replace('group_', '');
    }
    
    const mendeleyRes = await axios.post('https://api.mendeley.com/documents', doc, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/vnd.mendeley-document.1+json'
      },
      params
    });
    
    const newDocId = mendeleyRes.data.id;
    
    // Link to folder if needed
    if (target && typeof target === 'string' && target.startsWith('folder_')) {
      const folderId = target.replace('folder_', '');
      try {
        await axios.post(`https://api.mendeley.com/folders/${folderId}/documents`, { id: newDocId }, {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/vnd.mendeley-document.1+json'
          }
        });
      } catch (err) {
        console.error('Failed to link document to folder', err);
      }
    }
    
    res.status(201).json({ success: true, document: mendeleyRes.data });
  } catch (err) { next(err); }
});

export default router;
