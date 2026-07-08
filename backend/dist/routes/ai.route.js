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
const retry_handler_1 = require("../utils/retry-handler");
const database_1 = require("../utils/database");
const error_middleware_1 = require("../middleware/error.middleware");
const uuid_1 = require("uuid");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authMiddleware);
function buildPrompt(mode, abstracts, customPrompt, language) {
    const lang = language === 'id' ? 'bahasa Indonesia' : 'English';
    const text = abstracts.map((a, i) => `[${i + 1}] ${a}`).join('\n\n');
    const modeInstructions = {
        summarize: `Summarize the following academic abstracts into a concise paragraph in ${lang}.`,
        paraphrase: `Paraphrase the following academic abstracts in ${lang}, maintaining academic tone.`,
        literature_review: `Write a comprehensive literature review paragraph in ${lang} based on the following abstracts. Synthesize the key findings, identify common themes, and note any contradictions.`,
        custom: `${customPrompt}`,
    };
    const system = modeInstructions[mode] || modeInstructions.summarize;
    const user = `Abstracts:\n${text}`;
    return { system, user, full: `${system}\n\n${user}` };
}
// ── POST /ai/generate (streaming SSE) ─────────────────────────
router.post('/generate', async (req, res, next) => {
    try {
        const { mode = 'summarize', abstracts = [], custom_prompt = '', provider } = req.body;
        if (!abstracts.length)
            return next((0, error_middleware_1.createError)('abstracts array is required', 400));
        const db = (0, database_1.getDb)();
        const settings = db
            .prepare('SELECT active_provider, output_language, max_retry, retry_delay_ms, local_bridge_url FROM user_settings WHERE user_id = ?')
            .get(req.userId);
        const activeProvider = provider ?? settings?.active_provider ?? 'gemini';
        const language = settings?.output_language ?? 'id';
        const promptData = buildPrompt(mode, abstracts, custom_prompt, language);
        const prompt = promptData.full;
        // Set up SSE
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders();
        const sendEvent = (event, data) => {
            res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        };
        try {
            if (activeProvider.startsWith('local_')) {
                const bridgeProvider = activeProvider.replace('local_', '');
                const bridgeUrl = settings?.local_bridge_url || 'http://127.0.0.1:3000';
                try {
                    const axios = (await Promise.resolve().then(() => __importStar(require('axios')))).default;
                    const res = await axios.post(`${bridgeUrl}/api/${bridgeProvider}/chat/completions`, {
                        messages: [
                            { role: 'system', content: promptData.system },
                            { role: 'user', content: promptData.user }
                        ],
                        stream: false
                    }, { timeout: 600000 });
                    const text = res.data?.choices?.[0]?.message?.content ?? '';
                    if (text) {
                        // Fake stream to keep UI happy
                        const chunks = text.match(/.{1,10}/g) || [text];
                        for (const chunk of chunks) {
                            sendEvent('chunk', { text: chunk });
                            await new Promise(r => setTimeout(r, 10));
                        }
                    }
                    sendEvent('done', { success: true });
                }
                catch (e) {
                    if (e.code === 'ECONNREFUSED')
                        sendEvent('error', { message: 'Local Bridge tidak berjalan (port 3000)' });
                    else
                        sendEvent('error', { message: 'Local Bridge error: ' + e.message });
                }
            }
            else {
                await (0, retry_handler_1.withRetry)({
                    userId: req.userId,
                    provider: activeProvider,
                    config: { maxRetries: settings?.max_retry ?? 3, baseDelayMs: settings?.retry_delay_ms ?? 1000 },
                    onKeyRotated: (oldKey, newKey) => {
                        sendEvent('key_rotated', { from: oldKey, to: newKey });
                    },
                }, async (apiKey, keyId) => {
                    if (activeProvider === 'openai') {
                        const { default: OpenAI } = await Promise.resolve().then(() => __importStar(require('openai')));
                        const client = new OpenAI({ apiKey });
                        const stream = await client.chat.completions.create({
                            model: 'gpt-4o',
                            messages: [{ role: 'user', content: prompt }],
                            stream: true,
                        });
                        for await (const chunk of stream) {
                            const text = chunk.choices[0]?.delta?.content ?? '';
                            if (text)
                                sendEvent('chunk', { text });
                        }
                    }
                    else if (activeProvider === 'gemini') {
                        const { GoogleGenerativeAI } = await Promise.resolve().then(() => __importStar(require('@google/generative-ai')));
                        const client = new GoogleGenerativeAI(apiKey);
                        const model = client.getGenerativeModel({ model: 'gemini-2.5-flash' });
                        const result = await model.generateContentStream(prompt);
                        for await (const chunk of result.stream) {
                            const text = chunk.text();
                            if (text)
                                sendEvent('chunk', { text });
                        }
                    }
                    else if (activeProvider === 'claude') {
                        const Anthropic = (await Promise.resolve().then(() => __importStar(require('@anthropic-ai/sdk')))).default;
                        const client = new Anthropic({ apiKey });
                        const stream = client.messages.stream({
                            model: 'claude-3-5-sonnet-20241022',
                            max_tokens: 4096,
                            messages: [{ role: 'user', content: prompt }],
                        });
                        for await (const event of stream) {
                            if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
                                sendEvent('chunk', { text: event.delta.text });
                            }
                        }
                    }
                    else if (activeProvider === 'groq') {
                        const Groq = (await Promise.resolve().then(() => __importStar(require('groq-sdk')))).default;
                        const client = new Groq({ apiKey });
                        const stream = await client.chat.completions.create({
                            model: 'llama-3.3-70b-versatile',
                            messages: [{ role: 'user', content: prompt }],
                            stream: true,
                        });
                        for await (const chunk of stream) {
                            const text = chunk.choices[0]?.delta?.content ?? '';
                            if (text)
                                sendEvent('chunk', { text });
                        }
                    }
                    // Save to history
                    db.prepare(`INSERT INTO generate_history (id, user_id, provider, key_id, mode) VALUES (?, ?, ?, ?, ?)`).run((0, uuid_1.v4)(), req.userId, activeProvider, keyId, mode);
                });
                sendEvent('done', { success: true });
            }
        }
        catch (err) {
            const msg = err.message;
            sendEvent('error', { message: msg, code: err.code });
        }
        res.end();
    }
    catch (err) {
        next(err);
    }
});
// ── POST /ai/fix-metadata ────────────────────────────────────
router.post('/fix-metadata', async (req, res, next) => {
    try {
        const { documents } = req.body;
        if (!documents || !Array.isArray(documents))
            return next((0, error_middleware_1.createError)('documents array is required', 400));
        const db = (0, database_1.getDb)();
        const settings = db
            .prepare('SELECT active_provider, local_bridge_url FROM user_settings WHERE user_id = ?')
            .get(req.userId);
        const provider = settings?.active_provider ?? 'gemini';
        const systemInstruction = `You are an academic metadata fixer. Here is a JSON array of document metadata.
Many of them have ALL CAPS titles, incorrectly categorized types, incorrectly formatted author names, or missing volume/issue details that might be stuck inside the title or source fields.
We have provided comprehensive context fields like 'year', 'type', 'source', 'volume', 'issue', 'identifiers', and 'abstract' (if available) to help you accurately correct the document metadata.

YOUR TASKS:
1. Fix the capitalization for the 'title' and 'authors' fields using standard Title Case rules (capitalize main words, keep conjunctions like 'and', 'di', 'ke', 'dari', 'yang', 'untuk', 'pada', 'terhadap' lowercase unless they start the title).
2. CLEAN THE TITLE: Very often, the 'title' field incorrectly contains the Journal Name, Publisher, or "Volume/Issue" text at the beginning (e.g. "Jurnal Riset Multidisiplin Edukasi PERAN PELATIHAN..."). You must REMOVE this irrelevant prefix so that ONLY the actual research title remains.
3. FIX AUTHORS FORMAT: Ensure that for each author, 'last_name' strictly contains ONLY the family name (usually a single word, the very last part of their full name), and 'first_name' contains all the preceding given names.
4. FIX DOCUMENT TYPE & METADATA: If the 'type' seems incorrect based on the context, change it to the correct type. Supported types: 'journal', 'book', 'book_section', 'case', 'computer_program', 'conference_proceedings', 'encyclopedia_article', 'film', 'hearing', 'magazine_article', 'newspaper_article', 'patent', 'report', 'statute', 'television_broadcast', 'thesis', 'generic', 'web_page', 'working_paper'. CRITICAL: If the 'source' is a news website or blog (e.g., 'detikfinance', 'kompas', 'tribun', 'medium'), you MUST set the type to 'web_page' and NEVER to 'journal'. If you extract a volume, issue, or year from the dirty title or abstract, you may add/correct the 'volume', 'issue', 'source', or 'year' fields.

Return a JSON array of exactly the same length. For each item, you MUST return the 'id' field, PLUS any fields that you have corrected or added (e.g. 'title', 'authors', 'type', 'volume', 'issue', 'source', 'year'). You do not need to return fields that you did not change, except 'id'.
DO NOT return markdown, only the raw JSON array.`;
        const prompt = `${systemInstruction}

Input Data:
${JSON.stringify(documents, null, 2)}`;
        let results = [];
        if (provider.startsWith('local_')) {
            const bridgeProvider = provider.replace('local_', '');
            const bridgeUrl = settings?.local_bridge_url || 'http://127.0.0.1:3000';
            try {
                const axios = (await Promise.resolve().then(() => __importStar(require('axios')))).default;
                const res = await axios.post(`${bridgeUrl}/api/${bridgeProvider}/chat/completions`, {
                    messages: [
                        { role: 'system', content: systemInstruction },
                        { role: 'user', content: `Input Data:\n${JSON.stringify(documents, null, 2)}` }
                    ],
                    stream: false
                }, { timeout: 600000 });
                const rawJson = res.data?.choices?.[0]?.message?.content ?? '[]';
                let parsed;
                try {
                    const arrayMatch = rawJson.match(/\[[\s\S]*\]/);
                    const objMatch = rawJson.match(/\{[\s\S]*\}/);
                    let cleanJson = rawJson;
                    if (arrayMatch && (!objMatch || arrayMatch[0].length > objMatch[0].length)) {
                        cleanJson = arrayMatch[0];
                    }
                    else if (objMatch) {
                        cleanJson = objMatch[0];
                    }
                    parsed = JSON.parse(cleanJson);
                }
                catch (e) {
                    parsed = [];
                }
                if (parsed.fixed_documents)
                    parsed = parsed.fixed_documents;
                if (parsed.documents)
                    parsed = parsed.documents;
                if (!Array.isArray(parsed))
                    parsed = [parsed];
                results = parsed;
            }
            catch (e) {
                throw new Error('Local Bridge error: ' + e.message);
            }
        }
        else {
            results = await (0, retry_handler_1.withRetry)({ userId: req.userId, provider }, async (apiKey) => {
                let rawJson = '';
                if (provider === 'openai') {
                    const { default: OpenAI } = await Promise.resolve().then(() => __importStar(require('openai')));
                    const c = new OpenAI({ apiKey });
                    const r = await c.chat.completions.create({
                        model: 'gpt-4o', messages: [{ role: 'user', content: prompt }], response_format: { type: 'json_object' },
                    });
                    rawJson = r.choices[0].message.content ?? '[]';
                }
                else if (provider === 'gemini') {
                    const { GoogleGenerativeAI } = await Promise.resolve().then(() => __importStar(require('@google/generative-ai')));
                    const c = new GoogleGenerativeAI(apiKey);
                    const r = await c.getGenerativeModel({ model: 'gemini-2.5-flash' }).generateContent(prompt);
                    rawJson = r.response.text().replace(/```json\n?/g, '').replace(/```/g, '').trim();
                }
                else if (provider === 'claude') {
                    const Anthropic = (await Promise.resolve().then(() => __importStar(require('@anthropic-ai/sdk')))).default;
                    const c = new Anthropic({ apiKey });
                    const r = await c.messages.create({
                        model: 'claude-3-5-sonnet-20241022', max_tokens: 3000,
                        messages: [{ role: 'user', content: prompt }],
                    });
                    rawJson = r.content[0].text.replace(/```json\n?/g, '').replace(/```/g, '').trim();
                }
                else {
                    const Groq = (await Promise.resolve().then(() => __importStar(require('groq-sdk')))).default;
                    const c = new Groq({ apiKey });
                    const r = await c.chat.completions.create({
                        model: 'llama-3.3-70b-versatile', max_tokens: 3000,
                        messages: [{ role: 'user', content: prompt }],
                    });
                    rawJson = r.choices[0].message.content ?? '[]';
                }
                let parsed;
                try {
                    const arrayMatch = rawJson.match(/\[[\s\S]*\]/);
                    const objMatch = rawJson.match(/\{[\s\S]*\}/);
                    let cleanJson = rawJson;
                    if (arrayMatch && (!objMatch || arrayMatch[0].length > objMatch[0].length)) {
                        cleanJson = arrayMatch[0];
                    }
                    else if (objMatch) {
                        cleanJson = objMatch[0];
                    }
                    parsed = JSON.parse(cleanJson);
                }
                catch (e) {
                    console.error('Failed to parse JSON:', rawJson.substring(0, 100));
                    parsed = [];
                }
                if (parsed.fixed_documents)
                    parsed = parsed.fixed_documents;
                if (parsed.documents)
                    parsed = parsed.documents;
                if (!Array.isArray(parsed))
                    parsed = [parsed];
                return parsed;
            });
        }
        res.json({ success: true, fixed: results });
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
//# sourceMappingURL=ai.route.js.map