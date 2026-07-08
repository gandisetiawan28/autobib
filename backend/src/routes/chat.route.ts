import { Router, Response, NextFunction } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth.middleware';
import { getDb } from '../utils/database';
import { withRetry } from '../utils/retry-handler';
import { createError } from '../middleware/error.middleware';
import { logger } from '../utils/logger';
import type { Provider } from '../services/key-pool.service';
import { defaultRegistry } from '../utils/tool-registry';

const router = Router();
router.use(authMiddleware);

// ── GET /chat/sessions ────────────────────────────────────────
router.get('/sessions', (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const sessions = db.prepare('SELECT * FROM chat_sessions WHERE user_id = ? ORDER BY updated_at DESC').all(req.userId);
    res.json({ success: true, sessions });
  } catch (err) { next(err); }
});

// ── POST /chat/sessions ───────────────────────────────────────
router.post('/sessions', (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { title = 'Sesi Obrolan Baru' } = req.body;
    const db = getDb();
    const stmt = db.prepare(`INSERT INTO chat_sessions (user_id, title) VALUES (?, ?) RETURNING *`);
    const session = stmt.get(req.userId, title);
    res.json({ success: true, session });
  } catch (err) { next(err); }
});

// ── PUT /chat/sessions/:id ────────────────────────────────────
router.put('/sessions/:id', (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { title } = req.body;
    const db = getDb();
    db.prepare("UPDATE chat_sessions SET title = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?").run(title, req.params.id, req.userId);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ── DELETE /chat/sessions/:id ─────────────────────────────────
router.delete('/sessions/:id', (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    if (req.params.id === 'all') {
      db.prepare('DELETE FROM chat_sessions WHERE user_id = ?').run(req.userId);
    } else {
      db.prepare('DELETE FROM chat_sessions WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
    }
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ── GET /chat/sessions/:id/messages ───────────────────────────
router.get('/sessions/:id/messages', (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const messages = db.prepare('SELECT * FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC').all(req.params.id);
    res.json({ success: true, messages });
  } catch (err) { next(err); }
});

// ── POST /chat/agent-phase ────────────────────────────────────
router.post('/agent-phase', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { phase, content, documentContext, selectionContext } = req.body;
    if (!phase || !content) return next(createError('Phase and content are required', 400));
    
    let systemPrompt = '';
    
    if (phase === 1) {
      systemPrompt = "You are an expert Prompt Engineer. Rewrite the user's raw input into a highly detailed, structured, and unambiguous prompt suitable for an autonomous Word AI. Respond strictly with JSON format: { \"enhanced_prompt\": \"...\" }";
    } else if (phase === 2) {
      systemPrompt = "You are an AI Architect. Based on the enhanced prompt, write a logical step-by-step execution plan for manipulating a Word document. Do not execute it yet. Respond strictly with JSON format: { \"plan_steps\": [\"step 1...\", \"step 2...\"] }";
    } else if (phase === 3) {
      systemPrompt = `You are a Task Manager. Based on the plan, generate a strictly formatted JSON array of actionable tasks. Each task must have a description and a target tool. Respond strictly with JSON format: { "tasks": [{ "description": "...", "tool": "..." }] }. Available tools: replace, comment, highlight, insert, table, table_edit, format, delete, multi, view_code`;
    } else {
      return next(createError('Invalid phase', 400));
    }
    
    if (documentContext) {
      systemPrompt += `\n\n[DOCUMENT CONTEXT]\n${documentContext.substring(0, 15000)}`;
    }
    if (selectionContext) {
      systemPrompt += `\n\n[SELECTED TEXT]\n${selectionContext}`;
    }

    if (phase === 2 || phase === 3) {
      const { defaultRegistry } = await import('../utils/tool-registry');
      systemPrompt += defaultRegistry.getToolsInstruction();
      
      // Extra explicit warning for planner
      systemPrompt += `\nCRITICAL STRATEGY RULE: Do NOT instruct the execution agent to target Headings or Titles (like "BAB I", "1. 1. Latar Belakang") because the MS Word API will accidentally find them in the Table of Contents first! ALWAYS instruct the agent to target a unique sentence from the BODY paragraph instead! IF AND ONLY IF the section is completely empty (no body text below the heading), you MAY instruct the agent to target the Heading, but you MUST explicitly tell the agent to use '"match_index": 2' in their operation to skip the Table of Contents.`;
    }

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: content }
    ];

    const settings = getDb().prepare('SELECT active_provider, max_retry, retry_delay_ms FROM user_settings WHERE user_id = ?').get(req.userId) as any;
    const activeProvider: Provider = settings?.active_provider ?? 'gemini';

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    
    const sendEvent = (data: unknown) => {
      if (data === '[DONE]') {
        res.write(`data: [DONE]\n\n`);
      } else {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      }
    };

    const fullPrompt = systemPrompt + "\n\nUser: " + content;

    if (activeProvider.startsWith('local_')) {
      const bridgeProvider = activeProvider.replace('local_', '');
      const bridgeUrl = settings?.local_bridge_url || 'http://127.0.0.1:3000';
      try {
        const axios = (await import('axios')).default;
        const response = await axios.post(`${bridgeUrl}/api/${bridgeProvider}/chat/completions`, {
          messages: [
            { role: 'user', content: fullPrompt }
          ],
          stream: false
        }, { timeout: 600000 });
        
        const text = response.data?.choices?.[0]?.message?.content ?? '';
        if (text) sendEvent({ chunk: text });
      } catch (e: any) {
        if (e.code === 'ECONNREFUSED') throw new Error('Local Bridge tidak berjalan (port 3000)');
        throw new Error('Local Bridge error: ' + e.message);
      }
    } else {
      await withRetry(
        {
          userId: req.userId!,
          provider: activeProvider,
          config: { maxRetries: settings?.max_retry ?? 3, baseDelayMs: settings?.retry_delay_ms ?? 1000 },
        },
        async (apiKey, keyId) => {
          if (activeProvider === 'openai') {
            const { default: OpenAI } = await import('openai');
            const client = new OpenAI({ apiKey });
            const stream = await client.chat.completions.create({
              model: 'gpt-4o',
              messages: [{ role: 'user', content: fullPrompt }],
              stream: true,
              response_format: { type: "json_object" }
            });
            for await (const chunk of stream) {
              const text = chunk.choices[0]?.delta?.content ?? '';
              if (text) sendEvent({ chunk: text });
            }
          } else if (activeProvider === 'gemini') {
            const { GoogleGenerativeAI } = await import('@google/generative-ai');
            const client = new GoogleGenerativeAI(apiKey);
            const model = client.getGenerativeModel({ model: 'gemini-2.5-flash', generationConfig: { responseMimeType: "application/json" } });
            const result = await model.generateContentStream(fullPrompt);
            for await (const chunk of result.stream) {
              const text = chunk.text();
              if (text) sendEvent({ chunk: text });
            }
          } else {
             throw new Error("Provider not supported for agent mode yet.");
          }
        }
      );
    }
    
    sendEvent('[DONE]');
    res.end();
  } catch (err) { next(err); }
});

// ── POST /chat/sessions/:id/message (Streaming) ───────────────
router.post('/sessions/:id/message', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { content, documentContext, selectionContext, persona } = req.body;
    if (!content) return next(createError('Message content is required', 400));
    
    const db = getDb();
    
    // Save User Message
    db.prepare('INSERT INTO chat_messages (session_id, role, content) VALUES (?, ?, ?)')
      .run(req.params.id, 'user', content);
    db.prepare("UPDATE chat_sessions SET updated_at = datetime('now') WHERE id = ?").run(req.params.id);

    const sessionRow = db.prepare('SELECT title FROM chat_sessions WHERE id = ?').get(req.params.id) as any;
    const isNewSession = sessionRow?.title === 'Sesi Obrolan Baru' || sessionRow?.title === 'Sesi Baru';

    // Persona logic
    let personaInstruction = "You are AutoBib Copilot, an advanced AI Agent integrated into Microsoft Word. You must act intelligently and autonomously.";
    if (persona === 'reviewer') {
      personaInstruction += " You are an Academic Reviewer. Critically analyze the text for scientific rigor, methodology, and logical flow.";
    } else if (persona === 'proofreader') {
      personaInstruction += " You are an Academic Proofreader. Focus strictly on grammar, spelling, typography, and academic tone.";
    }

    // Build System Prompt with Context
    let systemPrompt = `${personaInstruction}
CRITICAL INSTRUCTION: You MUST ALWAYS respond with a SINGLE valid JSON object. DO NOT output any raw text, markdown blocks, or conversational prose outside of the JSON object.

Your JSON MUST strictly follow this structure:
{
  "thought": "Your internal reasoning process. Plan your actions here step-by-step.",
  "message": "Your conversational reply to the user. Use '\\n' for newlines.",
  "title": "A short 2-4 word title summarizing the overall conversation based on the latest context.",
  "tool": "replace" | "comment" | "highlight" | "insert" | "table" | "format" | "delete" | "multi" | "view_code" | "none",
  "operations": [
     // Tool-specific JSON objects go here. Leave empty array if tool is 'none' or not needed.
  ],
  "stream_to_word": "ONLY use this field if you are generating BRAND NEW text to be inserted/typed directly into the document. Otherwise, leave it empty.",
  "needs_followup": true/false // CRITICAL: Set to FALSE in 99% of cases! ONLY set to TRUE if you are using 'view_code' OR if you EXPLICITLY want the system to automatically trigger you again without waiting for the user. If your task is done, MUST be FALSE.
}

Example 1 - Using tools:
{
  "tool": "comment",
  "operations": [ {"find": "...", "comment": "..."} ],
  "thought": "I need to add a comment...",
  "message": "Saya akan menambahkan komentar pada teks tersebut. Sistem sedang memprosesnya...",
  "stream_to_word": ""
}

Example 2 - Generating new text into the document:
{
  "tool": "none",
  "operations": [],
  "thought": "The user is asking for a new paragraph.",
  "message": "Berikut adalah paragraf yang Anda minta:",
  "stream_to_word": "Manajemen Sumber Daya Manusia adalah..."
}
\n`;
    if (documentContext) {
      systemPrompt += `\n[DOCUMENT CONTENT]\n${documentContext}\n[/DOCUMENT CONTENT]\n`;
    }
    if (selectionContext) {
      systemPrompt += `\n[SELECTED TEXT]\n${selectionContext}\n[/SELECTED TEXT]\n`;
    }
    
    if (documentContext || selectionContext) {
      systemPrompt += defaultRegistry.getToolsInstruction();
    }
    
    systemPrompt += `\nRemember, you MUST output ONLY valid JSON. No markdown blocks outside the JSON!\nCRITICAL: ALWAYS verify that the text you are targeting in 'find', 'before', or 'after' actually exists exactly as plain text in the current [DOCUMENT CONTENT]. DO NOT rely on chat history.
IMPORTANT RULE FOR TABLES: The [DOCUMENT CONTENT] extracts tables using Markdown format (e.g. '| No | Nama |'). DO NOT use these markdown-formatted table strings as search targets or anchors in your tools! MS Word does not store them as text with pipes. If you need to insert something near a table, use 'location: end', target a plain paragraph outside the table, or use the 'table_edit' tool instead.
FORBIDDEN - MANUAL DELETION: NEVER suggest or advise the user to manually delete text. If the user asks you to delete something, you MUST ALWAYS use the 'delete' tool in your JSON response with a proper 'find' anchor. ALWAYS perform deletions automatically using the tool - do NOT tell the user to manually delete anything.
CUSTOM INSTRUCTION FOR HEADING NUMBERING:
JANGAN pernah menggunakan penomoran manual (seperti '1.', '2.', '1.1.', '2.1.1.') pada heading atau judul di dalam dokumen Word.

**Alasan:**
- Format style Word (seperti Heading 1, Heading 2) sudah memiliki fitur penomoran otomatis (multilevel list).
- Jika Anda menambahkan nomor secara manual, hasilnya akan menjadi duplikat atau formatnya menjadi rusak (contoh: "2. 1. 1. 2. 1. 1. Konsep Harga").

**Cara yang benar:**
Gunakan style heading yang disediakan oleh Word (Heading 1, Heading 2, dst.) dan biarkan Word yang menangani penomorannya secara otomatis.

CRITICAL RULE FOR SEQUENTIAL INSERTIONS:
When you need to insert multiple items (e.g., headings, paragraphs) sequentially, you MUST use the newly inserted text as the anchor for the next insertion.
DO NOT reuse the same anchor text (e.g., "Konsep Harga") for multiple insertions, because the system will always find the first occurrence and insert there, causing all items to cluster.
Instead, after inserting the first item, use that item's exact text as the 'after' target for the next insertion.
Example: Insert "Konsep Harga" after "Landasan Teori". Then insert "Indikator Harga" after "Konsep Harga". Then insert "Konsep Lokasi" after "Indikator Harga", and so on.
This ensures proper hierarchical ordering.

PROMPT ANALYSIS & SUGGESTIONS: Always analyze the user's prompt. If the user's request is ambiguous, relies on bad anchors, or could be executed more effectively (e.g. they should have used 'multi' tool, or specified a target style), proactively give them "Saran Prompt" in your 'message' to teach them how to command you better next time.

CUSTOM INSTRUCTION FOR DELETE OPERATIONS:
Masalah judul ikut terhapus bukan disebabkan oleh sistem atau prompting, melainkan **cara Anda menggunakan fitur delete** yang kurang spesifik.

Sistem sudah menyediakan parameter seperti `target_style` dan `target_type` untuk membatasi pencarian hanya pada area tertentu. Jika Anda tidak menggunakannya, sistem akan mencari teks di seluruh dokumen dan menghapus semua kemunculan, termasuk di daftar isi dan halaman judul.

Jadi, yang perlu diperbaiki adalah **cara Anda memberikan instruksi delete**, bukan sistem atau prompt secara keseluruhan. Berikut saran perbaikan:

- Saat menghapus heading, selalu sertakan `"target_style": "Heading 1;Judul;BAB"` atau style yang sesuai.
- Untuk paragraf biasa, gunakan `"target_type": "paragraph"` dan masukkan 5-7 kata pertama yang unik dari paragraf tersebut.
- Hindari menggunakan kata yang muncul di banyak tempat (seperti 'PENGARUH', 'KATA PENGANTAR') tanpa pembatasan style.

Dengan cara ini, Anda dapat menghapus konten yang diinginkan tanpa merusak bagian lain. Jika Anda masih bingung, beri tahu saya teks spesifik yang ingin dihapus, dan saya akan buatkan operasi delete yang tepat untuk Anda.`;
    
    // Get History (last 10 messages) to provide context
    const history = db.prepare(`
      SELECT role, content FROM (
        SELECT role, content, created_at FROM chat_messages WHERE session_id = ? ORDER BY created_at DESC LIMIT 10
      ) ORDER BY created_at ASC
    `).all(req.params.id) as any[];
    
    let userPrompt = `[CHAT HISTORY]\n`;
    for(const msg of history) {
        userPrompt += `${msg.role.toUpperCase()}: ${msg.content}\n`;
    }
    userPrompt += `AI:\n`;
    
    const fullPrompt = systemPrompt + "\n" + userPrompt;

    // Fetch User Settings to determine provider
    const settings = db.prepare('SELECT active_provider, max_retry, retry_delay_ms, local_bridge_url FROM user_settings WHERE user_id = ?').get(req.userId) as any;
    const activeProvider: Provider = settings?.active_provider ?? 'gemini';

    // Set up SSE (Disable timeouts for long AI generation)
    req.setTimeout(0);
    res.setTimeout(0);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const sendEvent = (event: string, data: unknown) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    let aiFullResponse = "";

    if (activeProvider.startsWith('local_')) {
      const bridgeProvider = activeProvider.replace('local_', '');
      const bridgeUrl = settings?.local_bridge_url || 'http://127.0.0.1:3000';
      try {
        const axios = (await import('axios')).default;
        const res = await axios.post(`${bridgeUrl}/api/${bridgeProvider}/chat/completions`, {
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          stream: false
        }, { timeout: 600000 });
        
        const text = res.data?.choices?.[0]?.message?.content ?? '';
        if (text) {
          aiFullResponse += text;
          // Fake stream to keep UI happy
          const chunks = text.match(/.{1,10}/g) || [text];
          for (const chunk of chunks) {
            sendEvent('chunk', { text: chunk });
            await new Promise(r => setTimeout(r, 10));
          }
        }
      } catch (e: any) {
        if (e.code === 'ECONNREFUSED') throw new Error('Local Bridge tidak berjalan (port 3000)');
        throw new Error('Local Bridge error: ' + e.message);
      }
    } else {
      await withRetry(
        {
          userId: req.userId!,
          provider: activeProvider,
          config: { maxRetries: settings?.max_retry ?? 3, baseDelayMs: settings?.retry_delay_ms ?? 1000 },
          onKeyRotated: (oldKey, newKey) => {
            sendEvent('key_rotated', { from: oldKey, to: newKey });
          },
        },
        async (apiKey, keyId) => {
          if (activeProvider === 'openai') {
          const { default: OpenAI } = await import('openai');
          const client = new OpenAI({ apiKey });
          const stream = await client.chat.completions.create({
            model: 'gpt-4o',
            messages: [{ role: 'user', content: fullPrompt }],
            stream: true,
          });
          for await (const chunk of stream) {
            const text = chunk.choices[0]?.delta?.content ?? '';
            if (text) { aiFullResponse += text; sendEvent('chunk', { text }); }
          }
        } else if (activeProvider === 'gemini') {
          const { GoogleGenerativeAI } = await import('@google/generative-ai');
          const client = new GoogleGenerativeAI(apiKey);
          const model = client.getGenerativeModel({ model: 'gemini-2.5-flash' });
          const result = await model.generateContentStream(fullPrompt);
          for await (const chunk of result.stream) {
            const text = chunk.text();
            if (text) { aiFullResponse += text; sendEvent('chunk', { text }); }
          }
        } else if (activeProvider === 'claude') {
          const Anthropic = (await import('@anthropic-ai/sdk')).default;
          const client = new Anthropic({ apiKey });
          const stream = client.messages.stream({
            model: 'claude-3-5-sonnet-20241022',
            max_tokens: 4096,
            messages: [{ role: 'user', content: fullPrompt }],
          });
          for await (const event of stream) {
            if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
              aiFullResponse += event.delta.text;
              sendEvent('chunk', { text: event.delta.text });
            }
          }
        } else if (activeProvider === 'groq') {
          const Groq = (await import('groq-sdk')).default;
          const client = new Groq({ apiKey });
          const stream = await client.chat.completions.create({
            model: 'llama-3.3-70b-versatile',
            messages: [{ role: 'user', content: fullPrompt }],
            stream: true,
          });
          for await (const chunk of stream) {
            const text = chunk.choices[0]?.delta?.content ?? '';
            if (text) { aiFullResponse += text; sendEvent('chunk', { text }); }
          }
        }
      }
    );
    }

    // Save AI Response to DB
    db.prepare('INSERT INTO chat_messages (session_id, role, content) VALUES (?, ?, ?)')
      .run(req.params.id, 'ai', aiFullResponse);

    try {
      const jsonMatch = aiFullResponse.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : aiFullResponse);
      if (parsed.title) {
        db.prepare("UPDATE chat_sessions SET title = ? WHERE id = ?").run(parsed.title, req.params.id);
        sendEvent('title_updated', { title: parsed.title });
      }
    } catch (e) {
      // ignore parse error for title
    }

    sendEvent('done', { success: true });
    res.end();

  } catch (err: any) {
    logger.error('Chat Streaming Error:', err);
    res.write(`event: error\ndata: ${JSON.stringify({ message: err.message || 'Server error' })}\n\n`);
    res.end();
  }
});

export default router;
