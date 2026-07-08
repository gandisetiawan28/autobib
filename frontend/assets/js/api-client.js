/* ═══════════════════════════════════════════════════════════
   api-client.js — HTTP client to AutoBib backend
   ═══════════════════════════════════════════════════════════ */

const API_BASE = 'http://localhost:3001';

const ApiClient = (() => {
  let _token = null;

  async function _getToken() {
    if (_token) return _token;
    const stored = localStorage.getItem('autobib_token');
    if (stored) { _token = stored; return _token; }
    const res = await fetch(`${API_BASE}/auth/session`);
    const data = await res.json();
    _token = data.token;
    localStorage.setItem('autobib_token', _token);
    return _token;
  }

  async function request(method, path, body, isRetry = false) {
    const token = await _getToken();
    const opts = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(`${API_BASE}${path}`, opts);
    
    if (res.status === 401 && !isRetry) {
      localStorage.removeItem('autobib_token');
      _token = null;
      return request(method, path, body, true);
    }
    
    let data = null;
    try {
      data = await res.json();
    } catch (e) {
      try { const txt = await res.text(); data = txt || null; } catch (e2) { data = null; }
    }
    if (!res.ok) {
      const msg = (data && (data.error?.message || data.message)) || (typeof data === 'string' ? data : `HTTP ${res.status}`);
      const err = new Error(msg);
      err.status = res.status;
      err.code = data?.error?.code;
      throw err;
    }
    return data;
  }

  // ── Key Pool ─────────────────────────────────────────────
  const keyPool = {
    list:    (provider)   => request('GET', `/settings/key-pool/${provider}`),
    add:     (body)       => request('POST', '/settings/key-pool', body),
    update:  (id, body)   => request('PUT', `/settings/key-pool/${id}`, body),
    remove:  (id)         => request('DELETE', `/settings/key-pool/${id}`),
    reorder: (provider, ordered_ids) => request('PUT', `/settings/key-pool/${provider}/reorder`, { ordered_ids }),
    reset:   (id)         => request('POST', `/settings/key-pool/${id}/reset`),
    test:    (id, provider) => request('POST', `/settings/key-pool/${id}/test`, { provider }),
    monitor: (provider)   => request('GET', `/settings/key-pool/${provider}/monitor`),
  };

  // ── Settings ─────────────────────────────────────────────
  const settings = {
    get:  ()     => request('GET', '/settings'),
    save: (body) => request('PUT', '/settings', body),
  };

  // ── Mendeley ──────────────────────────────────────────────
  const mendeley = {
    status:    ()       => request('GET', '/auth/mendeley/status'),
    documents: (params) => request('GET', `/mendeley/documents?${new URLSearchParams(params)}`),
    search:    (q)      => request('GET', `/mendeley/documents/search?q=${encodeURIComponent(q)}`),
    document:  (id)     => request('GET', `/mendeley/documents/${id}`),
    groups:    ()       => request('GET', '/mendeley/groups'),
    folders:   ()       => request('GET', '/mendeley/folders'),
    folderDocs: (id)    => request('GET', `/mendeley/folders/${id}/documents`),
    addDoc:    (csl_json) => request('POST', '/mendeley/documents', { csl_json }),
    updateDoc: (id, data) => request('PATCH', `/mendeley/documents/${id}`, data),
    deleteDoc: (id)       => request('DELETE', `/mendeley/documents/${id}`),
    disconnect:()       => request('DELETE', '/auth/mendeley'),
    upload:    async (file, target) => {
      const token = await _getToken();
      let url = `${API_BASE}/mendeley/upload?filename=${encodeURIComponent(file.name)}`;
      if (target) url += `&target=${encodeURIComponent(target)}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': file.type || 'application/pdf' },
        body: file
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Upload failed');
      return data;
    },
    addLink:   (url, target) => request('POST', '/mendeley/add-link', { url, target }),
  };

  // ── Citation ──────────────────────────────────────────────
  const ai = {
    generate: (mode, abstracts, custom_prompt) => request('POST', '/ai/generate', { mode, abstracts, custom_prompt }),
    fixMetadata: (documents) => request('POST', '/ai/fix-metadata', { documents }),
  };

  // ── Citation ──────────────────────────────────────────────
  const citation = {
    format: (documents, format) => request('POST', '/citation/format', { documents, format }),
  };

  // ── Smart Citation ────────────────────────────────────────
  const smartCitation = {
    parse:      (texts)      => request('POST', '/smart-citation/parse', { texts }),
    extractFull:(text)       => request('POST', '/smart-citation/extract-full', { text }),
    resolve:    (parsed)     => request('POST', '/smart-citation/resolve', { parsed }),
    buildField: (body)       => request('POST', '/smart-citation/build-field', body),
  };

  // ── AI Generate (SSE) ─────────────────────────────────────
  async function generateStream({ abstracts, mode, custom_prompt, provider }, callbacks) {
    const token = await _getToken();
    const res = await fetch(`${API_BASE}/ai/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ abstracts, mode, custom_prompt, provider }),
    });

    if (!res.ok) {
      let txt = '';
      try { txt = await res.text(); } catch (e) {}
      throw new Error(txt || `HTTP ${res.status}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        try {
          const payload = JSON.parse(line.slice(5).trim());
          if (payload.text && callbacks.onChunk) callbacks.onChunk(payload.text);
          if (callbacks.onKeyRotated && line.includes('"key_rotated"')) callbacks.onKeyRotated(payload);
          if (callbacks.onDone && line.includes('"done"')) callbacks.onDone();
          if (callbacks.onError && payload.message) callbacks.onError(payload);
        } catch { /* skip malformed lines */ }
      }
    }
    if (callbacks.onDone) callbacks.onDone();
  }

  // ── Chat AI ───────────────────────────────────────────────
  const chat = {
    getSessions:  () => request('GET', '/chat/sessions'),
    createSession:(title) => request('POST', '/chat/sessions', { title }),
    updateSession:(id, title) => request('PUT', `/chat/sessions/${id}`, { title }),
    deleteSession:(id) => request('DELETE', `/chat/sessions/${id}`),
    getMessages:  (id) => request('GET', `/chat/sessions/${id}/messages`),
    runAgentPhase: async (phase, content, documentContext, selectionContext) => {
      return new Promise((resolve, reject) => {
        const token = localStorage.getItem('autobib_token');
        fetch(`${API_BASE}/chat/agent-phase`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
          },
          body: JSON.stringify({ phase, content, documentContext, selectionContext })
        })
        .then(async (response) => {
          if (!response.ok) {
            let txt = '';
            try { txt = await response.text(); } catch (e) {}
            throw new Error(txt || `HTTP error! status: ${response.status}`);
          }
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let fullResponse = '';
          
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const chunkText = decoder.decode(value, { stream: true });
            const lines = chunkText.split('\n');
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const raw = line.slice(6).trim();
                if (raw === '[DONE]') continue;
                try {
                  const data = JSON.parse(raw);
                  if (data.chunk) fullResponse += data.chunk;
                } catch(e){}
              }
            }
          }
          resolve(fullResponse);
        }).catch(reject);
      });
    },
    sendMessageStream: async (id, content, documentContext, selectionContext, isLiveEdit, persona, onChunk, signal) => {
      return new Promise((resolve, reject) => {
        const token = localStorage.getItem('autobib_token');
        fetch(`${API_BASE}/chat/sessions/${id}/message`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
          },
          body: JSON.stringify({ content, documentContext, selectionContext, isLiveEdit, persona }),
          signal
        })
        .then(async (response) => {
          if (!response.ok) {
            let txt = '';
            try { txt = await response.text(); } catch (e) {}
            throw new Error(txt || `HTTP error! status: ${response.status}`);
          }
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          
          let currentEvent = 'message';
          let buffer = '';
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop();
            
            for (const line of lines) {
              if (line.startsWith('event: ')) {
                currentEvent = line.slice(7).trim();
              } else if (line.startsWith('data: ')) {
                const data = line.slice(6).trim();
                if (data === '[DONE]') {
                  resolve();
                  return;
                }
                try {
                  const parsed = JSON.parse(data);
                  if (parsed.error) reject(new Error(parsed.error));
                  else if (parsed.message && currentEvent === 'error') reject(new Error(parsed.message));
                  else if (currentEvent === 'title_updated') onChunk({ type: 'title_updated', title: parsed.title });
                  else if (parsed.chunk) onChunk(parsed.chunk);
                  else if (parsed.text) onChunk(parsed.text);
                  else if (parsed.success) { resolve(); return; }
                } catch (e) {
                  // ignore parse error for incomplete chunks
                }
                currentEvent = 'message'; // reset
              }
            }
          }
          resolve();
        })
        .catch(reject);
      });
    }
  };

  return { keyPool, settings, mendeley, ai, citation, smartCitation, chat, generateStream };
})();

window.ApiClient = ApiClient;
