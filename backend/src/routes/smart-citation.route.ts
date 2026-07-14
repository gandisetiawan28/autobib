import { Router, Response, NextFunction } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth.middleware';
import { withRetry } from '../utils/retry-handler';
import { sha256 } from '../utils/crypto';
import { getDb } from '../utils/database';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import type { Provider } from '../services/key-pool.service';
import { LRUCache } from 'lru-cache';
import pLimit from 'p-limit';
import { z } from 'zod';

import * as crypto from 'crypto';

// ── LRU Cache (max 500 entry, TTL 1 jam) ─────────────────────
const parseCache = new LRUCache<string, string>({ max: 500, ttl: 1000 * 60 * 60 });
const extractCache = new LRUCache<string, string>({ max: 500, ttl: 1000 * 60 * 60 });
const mendeleyDocsCache = new LRUCache<string, any[]>({ max: 500, ttl: 1000 * 60 * 5 }); // 5 mins

// ── Concurrency limiter (max 20 concurrent API calls) ─────────
const resolveLimit = pLimit(20);

// ── Zod Schemas ───────────────────────────────────────────────
const ParseBodySchema = z.object({
  texts: z.array(z.string().min(1)).min(1).max(100),
});

const ExtractBodySchema = z.object({
  text: z.string().min(1).max(200000),
});

const ResolveBodySchema = z.object({
  parsed: z.array(z.object({
    raw_text: z.string().optional(),
    items: z.array(z.object({
      author: z.string().nullable().optional(),
      year: z.union([z.string(), z.number()]).nullable().optional(),
      title: z.string().nullable().optional(),
      doi: z.string().nullable().optional(),
      prefix: z.string().nullable().optional(),
      suffix: z.string().nullable().optional(),
    })).optional(),
  })).min(1),
});

const router = Router();
router.use(authMiddleware);

// ── POST /smart-citation/parse ────────────────────────────────
router.post('/parse', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    // Validasi input dengan zod
    const validation = ParseBodySchema.safeParse(req.body);
    if (!validation.success) {
      return next({ statusCode: 400, message: 'Invalid request: ' + validation.error.message });
    }
    const { texts } = validation.data;
    const db = getDb();
    const settings = db
      .prepare('SELECT active_provider, local_bridge_url FROM user_settings WHERE user_id = ?')
      .get(req.userId) as { active_provider: Provider, local_bridge_url?: string } | undefined;
    const provider: Provider = settings?.active_provider ?? 'gemini';
    const bridgeUrl = settings?.local_bridge_url || 'http://127.0.0.1:3000';

    const getLocalResponse = async (systemInstruction: string, promptText: string, bridgeProvider: string) => {
      try {
        const response = await axios.post(`${bridgeUrl}/api/${bridgeProvider}/chat/completions`, {
          messages: [
            { role: 'system', content: systemInstruction },
            { role: 'user', content: promptText }
          ],
          stream: false
        }, { timeout: 600000 }); // 10 min timeout — bridge waits for browser extension
        return (response.data.choices?.[0]?.message?.content ?? '[]')
          .replace(/```json\n?/g, '')
          .replace(/```/g, '').trim();
      } catch (e: any) {
        if (e.code === 'ECONNREFUSED') throw new Error(`Local Bridge tidak berjalan. Jalankan server.js di folder Super Skripsi terlebih dahulu (${bridgeUrl}).`);
        if (e.code === 'ECONNABORTED' || e.message?.includes('timeout')) throw new Error(`Local Bridge timeout. Pastikan ekstensi Super Skripsi aktif di browser dan tab ${bridgeProvider} terbuka.`);
        throw new Error(`Local Bridge error: ${e.message}`);
      }
    };

    let results: any = null;

    if (provider.startsWith('local_')) {
      const bridgeProvider = provider.replace('local_', '');
      const systemInstruction = `You are a citation parser. Parse each citation text below into structured JSON.
Return a JSON array with EXACTLY ${texts.length} objects, matching the order of the input Texts.
Each object MUST have an "items" array containing all the distinct citations found within that text (e.g. if separated by semicolons).
For each citation item, provide:
{ "author": "Last, F.", "year": 2020, "title": "...", "journal": "...", "doi": "...", "prefix": "...", "suffix": "..." }
If a field is unknown, use null. Respond ONLY with valid JSON array, no markdown.

CRITICAL INSTRUCTIONS:
1. DO NOT split co-authors into separate citations! "A & B, 2020" or "A and B, 2020" is ONE single citation, not two.
2. NEVER include "et al." or "dkk" or "dkk." in the "author" field! If the citation is "Okta et al." or "Okta dkk", just extract the primary author: "Okta". Mendeley search will fail if "et al." is included.
3. For secondary or tertiary citations (e.g. "Kotler, 2008, dalam Sundari, 2023" or "Hasibuan, 2012, dalam Yuliani, 2023" or "Fraenkel (dalam Rasyid, 2015, dikutip oleh Sembiring, 2024)"):
   - The main reference to extract (author, year, title) MUST be the FINAL, MOST RECENT source actually read. In the example, it MUST be "Sundari, 2023" or "Yuliani, 2023". DO NOT extract the first author (Kotler / Hasibuan) as the main author.
   - Put ALL the preceding text (e.g. "Kotler, 2008, dalam " or "Hasibuan, 2012, dalam ") in the "prefix" field.
   - Put any trailing text (e.g. ", p. 5") in the "suffix" field.
4. Automatically convert the word "dan" (or "and") to the ampersand symbol "&" in any prefix or suffix you generate! (e.g. if the text is "Mathis dan Jackson (2006) dalam", your prefix MUST be "Mathis & Jackson (2006) dalam ").`;

      const userPrompt = `Citations:\n${texts.map((t, i) => `[${i}] ${t}`).join('\n')}`;
      const cacheKey = crypto.createHash('sha256').update(systemInstruction + userPrompt + bridgeProvider).digest('hex');

      let rawJson = '';
      if (parseCache.has(cacheKey)) {
        rawJson = parseCache.get(cacheKey)!;
      } else {
        rawJson = await getLocalResponse(systemInstruction, userPrompt, bridgeProvider);
        parseCache.set(cacheKey, rawJson);
      }
      try {
        let cleanJson = rawJson;
        const arrayMatch = cleanJson.match(/\[[\s\S]*\]/);
        const objMatch = cleanJson.match(/\{[\s\S]*\}/);
        if (arrayMatch && (!objMatch || arrayMatch[0].length > objMatch[0].length)) {
           cleanJson = arrayMatch[0];
        } else if (objMatch) {
           cleanJson = objMatch[0];
        }
        const parsed = JSON.parse(cleanJson);
        const arr = Array.isArray(parsed) ? parsed : (parsed.citations ?? parsed.results ?? []);
        
        results = texts.map((t, idx) => {
          const obj = arr[idx] || {};
          let items = Array.isArray(obj.items) ? obj.items : (Array.isArray(obj) ? obj : [obj]);
          // Clean items
          items = items.filter((i: any) => i && typeof i === 'object' && Object.keys(i).length > 0 && !Array.isArray(i));
          if (items.length === 0) items = [{ author: null, year: null }];
          return { raw_text: t, items };
        });
      } catch {
        results = texts.map((t) => ({ raw_text: t, items: [] }));
      }
    } else {
      results = await withRetry({ userId: req.userId!, provider }, async (apiKey) => {
      const prompt = `You are a citation parser. Parse each citation text below into structured JSON.
Return a JSON array with EXACTLY ${texts.length} objects, matching the order of the input Texts.
Each object MUST have an "items" array containing all the distinct citations found within that text (e.g. if separated by semicolons).
For each citation item, provide:
{ "author": "Last, F.", "year": 2020, "title": "...", "journal": "...", "doi": "...", "prefix": "...", "suffix": "..." }
If a field is unknown, use null. Respond ONLY with valid JSON array, no markdown.

CRITICAL INSTRUCTIONS:
1. DO NOT split co-authors into separate citations! "A & B, 2020" or "A and B, 2020" is ONE single citation, not two.
2. NEVER include "et al." or "dkk" or "dkk." in the "author" field! If the citation is "Okta et al." or "Okta dkk", just extract the primary author: "Okta". Mendeley search will fail if "et al." is included.
3. For secondary or tertiary citations (e.g. "Kotler, 2008, dalam Sundari, 2023" or "Hasibuan, 2012, dalam Yuliani, 2023" or "Fraenkel (dalam Rasyid, 2015, dikutip oleh Sembiring, 2024)"):
   - The main reference to extract (author, year, title) MUST be the FINAL, MOST RECENT source actually read. In the example, it MUST be "Sundari, 2023" or "Yuliani, 2023". DO NOT extract the first author (Kotler / Hasibuan) as the main author.
   - Put ALL the preceding text (e.g. "Kotler, 2008, dalam " or "Hasibuan, 2012, dalam ") in the "prefix" field.
   - Put any trailing text (e.g. ", p. 5") in the "suffix" field.
4. Automatically convert the word "dan" (or "and") to the ampersand symbol "&" in any prefix or suffix you generate! (e.g. if the text is "Mathis dan Jackson (2006) dalam", your prefix MUST be "Mathis & Jackson (2006) dalam ").

Citations:
${texts.map((t, i) => `[${i}] ${t}`).join('\n')}`;

      let rawJson = '';

      if (provider === 'openai') {
        const { default: OpenAI } = await import('openai');
        const c = new OpenAI({ apiKey });
        const r = await c.chat.completions.create({
          model: 'gpt-4o', messages: [{ role: 'user', content: prompt }], response_format: { type: 'json_object' },
        });
        rawJson = r.choices[0].message.content ?? '[]';
      } else if (provider === 'gemini') {
        const { GoogleGenerativeAI } = await import('@google/generative-ai');
        const c = new GoogleGenerativeAI(apiKey);
        const r = await c.getGenerativeModel({ model: 'gemini-2.5-flash' }).generateContent(prompt);
        rawJson = r.response.text().replace(/```json\n?/g, '').replace(/```/g, '').trim();
      } else if (provider === 'claude') {
        const Anthropic = (await import('@anthropic-ai/sdk')).default;
        const c = new Anthropic({ apiKey });
        const r = await c.messages.create({
          model: 'claude-3-5-sonnet-20241022', max_tokens: 2000,
          messages: [{ role: 'user', content: prompt }],
        });
        rawJson = (r.content[0] as { text: string }).text.replace(/```json\n?/g, '').replace(/```/g, '').trim();
      } else {
        const Groq = (await import('groq-sdk')).default;
        const c = new Groq({ apiKey });
        const r = await c.chat.completions.create({
          model: 'llama-3.3-70b-versatile', max_tokens: 2000,
          messages: [{ role: 'user', content: prompt }],
        });
        rawJson = r.choices[0].message.content ?? '[]';
      }

      try {
        const parsed = JSON.parse(rawJson);
        const arr = Array.isArray(parsed) ? parsed : (parsed.citations ?? parsed.results ?? []);
        
        return texts.map((t, idx) => {
          const obj = arr[idx] || {};
          let items = Array.isArray(obj.items) ? obj.items : (Array.isArray(obj) ? obj : [obj]);
          // Clean items
          items = items.filter((i: any) => i && typeof i === 'object' && Object.keys(i).length > 0 && !Array.isArray(i));
          if (items.length === 0) items = [{ author: null, year: null }];
          return { raw_text: t, items };
        });
      } catch {
        return texts.map((t) => ({ raw_text: t, items: [{ author: null, year: null }] }));
      }
    });
    }

    res.json({ success: true, parsed: results });
  } catch (err) { next(err); }
});

// ── POST /smart-citation/extract-full ────────────────────────
router.post('/extract-full', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const validation = ExtractBodySchema.safeParse(req.body);
    if (!validation.success) {
      return next({ statusCode: 400, message: 'Invalid request: ' + validation.error.message });
    }
    const { text } = validation.data;

    const systemInstruction = `Extract all academic citations from the text AND parse them into structured data.
Return ONLY a valid JSON array of objects. Each object represents one citation found in the text.
Each object MUST have:
1. "raw_text": The EXACT citation text as it appears in the document.
2. "items": An array of the distinct citations found within that text, with "author" and "year", and optionally "prefix" or "suffix".

CRITICAL INSTRUCTIONS FOR PARSING:
- For secondary citations containing "dalam" (e.g., "(Schuler et al. dalam Yuliani, 2023)" or "Henry Simamora (1997, dalam Setiari, 2025)"):
  - The MAIN "author" and "year" must be the FINAL, MOST RECENT source (e.g., "Yuliani" or "Setiari").
  - ALL preceding text including the original author, their year, and the word "dalam " MUST be placed in the "prefix" field.
  - Examples of correct prefix handling:
    - "(Sutrisno, 2016, dalam Okta et al., 2023)" -> items: [{ "author": "Okta et al.", "year": 2023, "prefix": "Sutrisno, 2016, dalam " }]
    - "Mangkunegara dalam Siagian, 2023" -> items: [{ "author": "Siagian", "year": 2023, "prefix": "Mangkunegara dalam " }]
    - "Henry Simamora (1997, dalam Setiari, 2025)" -> items: [{ "author": "Setiari", "year": 2025, "prefix": "Henry Simamora (1997, dalam " }]
    - "(Rivai & Sagala dalam Praskadinata, 2024; Dessler dalam Priatna et al., 2025)" -> items: [{ "author": "Praskadinata", "year": 2024, "prefix": "Rivai & Sagala dalam " }, { "author": "Priatna et al.", "year": 2025, "prefix": "Dessler dalam " }]
- DO NOT split co-authors! "(Syufa & Prayudista, 2023)" is ONE item with author "Syufa & Prayudista".
- For multiple citations in one bracket like "(Setiari, 2025; Okta et al., 2023)", the items array should contain multiple objects.

Example output format:
[
  {
    "raw_text": "(Sugiyono, 2020)",
    "items": [ { "author": "Sugiyono", "year": 2020 } ]
  },
  {
    "raw_text": "(Hasibuan, 2011, dalam Supriyati & Hutapea, 2022)",
    "items": [ { "author": "Supriyati & Hutapea", "year": 2022, "prefix": "Hasibuan, 2011, dalam " } ]
  }
]
Do not include bibliography items, only inline citations. Do not include markdown formatting.
If no citations are found, return [].

CRITICAL: You MUST extract the citation EXACTLY character-by-character as it appears in the text, INCLUDING the surrounding parentheses/brackets if they exist. 
WARNING: DO NOT ADD parentheses if they are not in the original text! For narrative citations like "Henry Simamora (1997)", DO NOT output "(Henry Simamora (1997))". Just output "Henry Simamora (1997)". DO NOT clean, alter, or remove ANY punctuation!`;

    const prompt = `${systemInstruction}

Text:
${text.substring(0, 150000)}`;

    const db = await import('../utils/database').then(m => m.getDb());
    const settings = db.prepare('SELECT active_provider, local_bridge_url FROM user_settings WHERE user_id = ?').get(req.userId) as any;
    const provider = settings?.active_provider ?? 'gemini';
    const bridgeUrl = settings?.local_bridge_url || 'http://127.0.0.1:3000';

    const cacheKey = crypto.createHash('sha256').update(prompt + provider).digest('hex');
    if (extractCache.has(cacheKey)) {
      const cachedJson = extractCache.get(cacheKey)!;
      try {
        let cleanJson = cachedJson.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/```thought[\s\S]*?```/gi, '').trim();
        const arrayMatch = cleanJson.match(/\[[\s\S]*\]/);
        if (arrayMatch) {
           cleanJson = arrayMatch[0];
        }
        const parsed = JSON.parse(cleanJson);
        const uniqueCitations = [...new Set(Array.isArray(parsed) ? parsed : [])];
        return res.json({ success: true, citations: uniqueCitations });
      } catch {
        return res.json({ success: true, citations: [] });
      }
    }

    let rawJson = '[]';
    
    if (provider.startsWith('local_')) {
      const bridgeProvider = provider.replace('local_', '');
      try {
        const response = await axios.post(`${bridgeUrl}/api/${bridgeProvider}/chat/completions`, {
          messages: [
            { role: 'system', content: systemInstruction },
            { role: 'user', content: `Text:\n${text.substring(0, 150000)}` }
          ],
          stream: false
        }, { timeout: 600000 });
        rawJson = (response.data.choices?.[0]?.message?.content ?? '[]')
          .replace(/```json\n?/g, '').replace(/```/g, '').trim();
      } catch (e: any) {
        if (e.code === 'ECONNREFUSED') throw new Error(`Local Bridge tidak berjalan. Jalankan server.js di Super Skripsi (${bridgeUrl}).`);
        if (e.code === 'ECONNABORTED' || e.message?.includes('timeout')) throw new Error(`Local Bridge timeout. Pastikan ekstensi aktif di browser dan tab ${bridgeProvider} terbuka.`);
        throw new Error(`Local Bridge error: ${e.message}`);
      }
    } else {
      await withRetry({ userId: req.userId!, provider }, async (apiKey) => {
        const { GoogleGenerativeAI } = await import('@google/generative-ai');
        const c = new GoogleGenerativeAI(apiKey);
        const r = await c.getGenerativeModel({ model: 'gemini-2.5-flash' }).generateContent(prompt);
        rawJson = r.response.text().replace(/```json\n?/g, '').replace(/```/g, '').trim();
      });
    }
    
    extractCache.set(cacheKey, rawJson);
    
    try {
      let cleanJson = rawJson.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/```thought[\s\S]*?```/gi, '').trim();
      const arrayMatch = cleanJson.match(/\[[\s\S]*\]/);
      if (arrayMatch) {
         cleanJson = arrayMatch[0];
      }
      const parsed = JSON.parse(cleanJson);
      const uniqueCitations = [...new Set(Array.isArray(parsed) ? parsed : [])];
      res.json({ success: true, citations: uniqueCitations });
    } catch {
      res.json({ success: true, citations: [] });
    }
  } catch (err) { next(err); }
});

// ── POST /smart-citation/resolve ──────────────────────────────
router.post('/resolve', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    // Validasi input dengan zod
    const validation = ResolveBodySchema.safeParse(req.body);
    if (!validation.success) {
      return next({ statusCode: 400, message: 'Invalid request body: ' + validation.error.message });
    }
    const { parsed } = validation.data as { parsed: { raw_text?: string; items?: any[] }[] };
    const db = getDb();

    let mendeleyToken: string | null = null;
    let mendeleyDocs: any[] = [];
    try {
      const { getMendeleyToken } = await import('./mendeley.route');
      mendeleyToken = await getMendeleyToken(req.userId!);
      
      if (mendeleyToken) {
        if (mendeleyDocsCache.has(req.userId!)) {
           mendeleyDocs = mendeleyDocsCache.get(req.userId!)!;
        } else {
          // Fetch user's personal library ONCE per request instead of for each citation
          const mRes = await axios.get('https://api.mendeley.com/documents', {
            headers: { Authorization: `Bearer ${mendeleyToken}` },
            params: { limit: 500, view: 'bib' },
            timeout: 8000
          });
          mendeleyDocs = mRes.data || [];
          mendeleyDocsCache.set(req.userId!, mendeleyDocs);
        }
      }
    } catch {}

    // Gunakan p-limit untuk batasi concurrent API calls
    const results = await Promise.all(
      parsed.map((group) => resolveLimit(async () => {
        const items = group.items || [];
        const resolvedItems = await Promise.all(
          items.map((item) => resolveLimit(async () => {
            const hash = sha256(JSON.stringify(item));
            const cached = db.prepare('SELECT * FROM citation_cache WHERE raw_text_hash = ?').get(hash) as {
              csl_json: string; mendeley_uuid: string; resolve_source: string; resolve_status: string;
            } | undefined;
            // if (cached?.resolve_status === 'found') {
            //   return { ...item, csl_json: JSON.parse(cached.csl_json), mendeley_uuid: cached.mendeley_uuid, source: cached.resolve_source, status: 'found', prefix: item.prefix, suffix: item.suffix };
            // }

            // 1. Try User's Mendeley Library first
            if (mendeleyToken && mendeleyDocs.length > 0) {
              try {
                const q = item.title ?? (item.author && item.year ? `${item.author} ${item.year}` : '');
                if (q) {
                  // Local search algorithm using pre-fetched docs
                  const targetYear = parseInt(String(item.year));
                  const targetAuthor = (item.author || '').toLowerCase().replace(/et al\\.?/g, '').replace(/[^a-z0-9]/g, ' ').trim().split(' ')[0];
                  
                  let mDoc = mendeleyDocs.find((doc: any) => {
                    const docYear = parseInt(String(doc.year));
                    if (item.title && doc.title && doc.title.toLowerCase().includes(item.title.toLowerCase())) return true;
                    if (targetYear && docYear === targetYear && targetAuthor) {
                       const docAuthors = (doc.authors || []).map((a: any) => (a.last_name || '').toLowerCase());
                       if (docAuthors.some((a: string) => a.includes(targetAuthor))) return true;
                    }
                    return false;
                  });

                  if (mDoc) {
                    const csl = {
                      title: mDoc.title,
                      author: (mDoc.authors || []).map((a: any) => ({ family: a.last_name, given: a.first_name })),
                      issued: { 'date-parts': [[mDoc.year ?? item.year]] },
                      'container-title': mDoc.source,
                      DOI: mDoc.identifiers?.doi,
                      volume: mDoc.volume,
                      issue: mDoc.issue,
                      page: mDoc.pages,
                      type: mDoc.type === 'journal' ? 'article-journal' : 'generic',
                      abstract: mDoc.abstract
                    };
                    db.prepare(
                      `INSERT OR REPLACE INTO citation_cache (id, raw_text, raw_text_hash, csl_json, mendeley_uuid, resolve_source, resolve_status) VALUES (?, ?, ?, ?, ?, 'mendeley_search', 'found')`
                    ).run(mDoc.id, group.raw_text ?? item.title ?? '', hash, JSON.stringify(csl), mDoc.id);
                    
                    return { ...item, csl_json: csl, mendeley_uuid: mDoc.id, source: 'mendeley_search', status: 'found', prefix: item.prefix, suffix: item.suffix };
                  }
                }
              } catch { /* fallthrough */ }
            }

      // 2. Try CrossRef
      if (item.doi || (item.title && item.title.length > 5)) {
        try {
          const query = item.doi
            ? `https://api.crossref.org/works/${item.doi}`
            : `https://api.crossref.org/works?query.title=${encodeURIComponent(item.title!)}&rows=3`;

          const headers = { 'User-Agent': 'AutoBib/1.0 (mailto:autobib@example.com)' };
          const crossrefRes = await axios.get(query, { headers, timeout: 8000 });
          let work = item.doi ? crossrefRes.data.message : null;
          
          if (!work && crossrefRes.data.message.items) {
             work = crossrefRes.data.message.items.find((w: any) => {
               if (item.title) return true;
               return false;
             }) || crossrefRes.data.message.items[0];
          }

          if (work) {
            const csl = {
              title: work.title?.[0] ?? item.title,
              author: (work.author || []).map((a: { family?: string; given?: string }) => ({ family: a.family, given: a.given })),
              issued: { 'date-parts': work.published?.['date-parts'] ?? [[item.year]] },
              'container-title': work['container-title']?.[0],
              DOI: work.DOI,
              volume: work.volume,
              issue: work.issue,
              page: work.page,
              type: work.type,
            };
            db.prepare(
              `INSERT OR REPLACE INTO citation_cache (id, raw_text, raw_text_hash, csl_json, resolve_source, resolve_status) VALUES (?, ?, ?, ?, 'crossref', 'found')`
            ).run(uuidv4(), group.raw_text ?? item.title ?? '', hash, JSON.stringify(csl));
            return { ...item, csl_json: csl, source: 'crossref', status: 'found', prefix: item.prefix, suffix: item.suffix };
          }
        } catch { /* fallthrough to Semantic Scholar */ }
      }

      // 3. Try Semantic Scholar
      if (item.title) {
        try {
          const ssRes = await axios.get(
            `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(item.title)}&fields=title,authors,year,externalIds,venue&limit=1`,
            { timeout: 8000 }
          );
          const paper = ssRes.data.data?.[0];
          if (paper) {
            const csl = {
              title: paper.title,
              author: (paper.authors || []).map((a: { name: string }) => {
                const parts = a.name.split(' ');
                return { family: parts[parts.length - 1], given: parts.slice(0, -1).join(' ') };
              }),
              issued: { 'date-parts': [[paper.year]] },
              'container-title': paper.venue,
              DOI: paper.externalIds?.DOI,
              type: 'article-journal',
            };
            db.prepare(
              `INSERT OR REPLACE INTO citation_cache (id, raw_text, raw_text_hash, csl_json, resolve_source, resolve_status) VALUES (?, ?, ?, ?, 'semantic_scholar', 'found')`
            ).run(uuidv4(), group.raw_text ?? item.title ?? '', hash, JSON.stringify(csl));
            return { ...item, csl_json: csl, source: 'semantic_scholar', status: 'found', prefix: item.prefix, suffix: item.suffix };
          }
        } catch { /* fallthrough to partial */ }
      }

      // Best-effort partial from parsed data
      const csl = {
        title: item.title ?? 'Unknown Title',
        author: item.author ? [{ family: item.author.split(',')[0]?.trim(), given: '' }] : [],
        issued: { 'date-parts': [[item.year ?? new Date().getFullYear()]] },
        type: 'article-journal',
      };
      db.prepare(
        `INSERT OR REPLACE INTO citation_cache (id, raw_text, raw_text_hash, csl_json, resolve_source, resolve_status) VALUES (?, ?, ?, ?, 'ai', 'partial')`
      ).run(uuidv4(), group.raw_text ?? item.title ?? '', hash, JSON.stringify(csl));
      return { ...item, csl_json: csl, source: 'ai', status: 'partial' };
    }))
  );
  return { raw_text: group.raw_text, items: resolvedItems };
  }))
);

    res.json({ success: true, resolved: results });
  } catch (err) { next(err); }
});

// ── POST /smart-citation/build-field ─────────────────────────
router.post('/build-field', (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { items, formatted_citation } = _req.body;
    if (!items || !items.length) return next({ statusCode: 400, message: 'items required' });

    let inline = formatted_citation ?? `(${items[0].csl_json?.author?.[0]?.family ?? 'Author'}, ${items[0].csl_json?.issued?.['date-parts']?.[0]?.[0] ?? 'n.d.'})`;
    
    // Auto-fix human error typos
    inline = inline.replace(/,\s*/g, ', '); // Fix missing space after comma
    inline = inline.replace(/\s*,/g, ','); // Fix space before comma (e.g. "2012 , dalam")
    inline = inline.replace(/([a-zA-Z])\(/g, '$1 ('); // Fix missing space before parenthesis
    inline = inline.replace(/\s{2,}/g, ' '); // Fix double spaces
    inline = inline.replace(/\b(\w+)\s+\1\b/gi, '$1'); // Fix repeated words (e.g. "dalam dalam" -> "dalam")
    inline = inline.replace(/(\d{4})\.\s*\)/g, '$1)'); // Fix rogue period after year (e.g. "2022.)" -> "2022)")
    inline = inline.replace(/,\s*\)/g, ')'); // Fix rogue comma before parenthesis (e.g. "2022, )" -> "2022)")
    inline = inline.replace(/,{2,}/g, ','); // Fix double commas
    inline = inline.replace(/\b(?:et\.?\s*al|dkk)\b\.?/gi, 'et al.'); // Normalize et al and prevent double dots
    inline = inline.replace(/\(\s+/g, '('); // Fix space after opening parenthesis
    inline = inline.replace(/\s+\)/g, ')'); // Fix space before closing parenthesis

    // Convert "dan" or "and" to "&" automatically for the display text
    inline = inline.replace(/\b(?:dan|and)\b/gi, '&');
    
    // Exact Mendeley Cite v3 JSON schema
    const citationItems = items.map((item: any) => {
      const mUuid = item.mendeley_uuid ?? uuidv4();
      return {
        id: mUuid,
        itemData: {
          ...item.csl_json,
          id: mUuid
        },
        isTemporary: false,
        "suppress-author": item.suppress_author === true,
        composite: false,
        "author-only": item.author_only === true,
        ...(item.prefix ? { prefix: item.prefix } : {}),
        ...(item.suffix ? { suffix: item.suffix } : {})
      };
    });

    const citationData = {
      citationID: `MENDELEY_CITATION_${uuidv4()}`,
      properties: { noteIndex: 0 },
      isEdited: true,
      manualOverride: {
        isManuallyOverridden: true,
        citeprocText: inline,
        manualOverrideText: inline
      },
      citationItems: citationItems
    };

    const safeInline = inline.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const base64Data = Buffer.from(JSON.stringify(citationData)).toString('base64');
    const sdtId = Math.floor(Math.random() * 2000000000);

    // Build OOXML (Flat OPC format) for Word insertOoxml()
    const ooxml = `<?xml version="1.0" standalone="yes"?>
<?mso-application progid="Word.Document"?>
<pkg:package xmlns:pkg="http://schemas.microsoft.com/office/2006/xmlPackage">
  <pkg:part pkg:name="/_rels/.rels" pkg:contentType="application/vnd.openxmlformats-package.relationships+xml" pkg:padding="512">
    <pkg:xmlData>
      <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
      </Relationships>
    </pkg:xmlData>
  </pkg:part>
  <pkg:part pkg:name="/word/document.xml" pkg:contentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml">
    <pkg:xmlData>
      <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:body>
          <w:p>
            <w:sdt>
              <w:sdtPr>
                <w:tag w:val="MENDELEY_CITATION_v3_${base64Data}"/>
                <w:id w:val="${sdtId}"/>
              </w:sdtPr>
              <w:sdtContent>
                <w:r>
                  <w:t xml:space="preserve">${safeInline}</w:t>
                </w:r>
              </w:sdtContent>
            </w:sdt>
          </w:p>
        </w:body>
      </w:document>
    </pkg:xmlData>
  </pkg:part>
</pkg:package>`;

    res.json({ success: true, ooxml, inline, base64Data });
  } catch (err) { next(err); }
});

// ── POST /smart-citation/format-bibliography ──────────────────
// Ubah array CSL JSON menjadi teks daftar pustaka terformat (APA, IEEE, dll.)
router.post('/format-bibliography', async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const FormatSchema = z.object({
      items: z.array(z.record(z.any())).min(1),
      style: z.string().optional().default('apa'),
      locale: z.string().optional().default('id-ID'),
    });

    const validation = FormatSchema.safeParse(_req.body);
    if (!validation.success) {
      return next({ statusCode: 400, message: 'Invalid request: ' + validation.error.message });
    }
    const { items, style, locale } = validation.data;

    const { formatBibliography } = await import('../utils/citeproc-formatter');
    const result = formatBibliography(items, locale, style);

    res.json({ success: true, ...result });
  } catch (err) { next(err); }
});

// ── POST /smart-citation/extract-pdf ─────────────────────────
// Ekstrak teks & metadata dari file PDF untuk otomatis temukan citasi
import express from 'express';
router.post(
  '/extract-pdf',
  express.raw({ type: ['application/pdf', 'application/octet-stream'], limit: '20mb' }),
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.body || !Buffer.isBuffer(req.body)) {
        return next({ statusCode: 400, message: 'PDF file buffer is required' });
      }

      const { extractTextFromPdf, inferCslFromPdfInfo } = await import('../utils/pdf-extractor');
      const extracted = await extractTextFromPdf(req.body);
      const inferredCsl = inferCslFromPdfInfo(extracted.info);

      res.json({
        success: true,
        text: extracted.text,
        numPages: extracted.numPages,
        info: extracted.info,
        inferred_csl: inferredCsl,
      });
    } catch (err) { next(err); }
  }
);

export default router;

