/* ═══════════════════════════════════════════════════════════
   chat.js — AI Chat Copilot Integration
   ═══════════════════════════════════════════════════════════ */

window.initChat = () => {
  if (window.marked) {
    const renderer = new window.marked.Renderer();
    renderer.code = function (code, language) {
      let actualCode = code;
      let lang = language;

      if (typeof code === 'object') {
        actualCode = code.text;
        lang = code.lang;
      }

      const validLang = (window.Prism && window.Prism.languages[lang]) ? lang : 'plaintext';
      const highlighted = (window.Prism && window.Prism.languages[validLang]) ? window.Prism.highlight(actualCode, window.Prism.languages[validLang], validLang) : actualCode;

      return `<div class="code-block-wrapper" style="margin: 10px 0; border-radius:6px; overflow:hidden; border:1px solid var(--border); text-align:left; width: 100%; max-width: 100%; min-width: 0; box-sizing: border-box;">
                 <div class="code-block-header" style="display:flex; justify-content:space-between; align-items:center; background:#1e1e1e; padding:6px 10px; font-size:11px; color:#a0a0a0; border-bottom:1px solid #333;">
                    <span class="code-block-lang" style="text-transform:uppercase; font-family:var(--font-mono); font-weight:600;">${lang || 'CODE'}</span>
                    <button class="btn-copy-code" style="background:transparent; border:none; color:#a0a0a0; cursor:pointer; display:flex; align-items:center; gap:4px; font-family:inherit; transition:color 0.2s;" onmouseover="this.style.color='#fff'" onmouseout="this.style.color='#a0a0a0'" onclick="navigator.clipboard.writeText(decodeURIComponent('${encodeURIComponent(actualCode)}')); this.innerHTML='<svg width=\\'12\\' height=\\'12\\' viewBox=\\'0 0 24 24\\' fill=\\'none\\' stroke=\\'#10b981\\' stroke-width=\\'2\\'><polyline points=\\'20 6 9 17 4 12\\'/></svg> Disalin!'; this.style.color='#10b981'; setTimeout(()=> { this.innerHTML='<svg width=\\'12\\' height=\\'12\\' viewBox=\\'0 0 24 24\\' fill=\\'none\\' stroke=\\'currentColor\\' stroke-width=\\'2\\'><rect x=\\'9\\' y=\\'9\\' width=\\'13\\' height=\\'13\\' rx=\\'2\\' ry=\\'2\\'></rect><path d=\\'M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1\\'></path></svg> Salin'; this.style.color='#a0a0a0'; }, 2000)">
                       <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                       Salin
                    </button>
                 </div>
                 <pre style="margin:0; padding:12px; background:#111; overflow-x:auto; overflow-y:auto; max-height:250px;"><code class="language-${validLang}" style="color:#e2e8f0; font-family:var(--font-mono); font-size:11px; line-height:1.4;">${highlighted}</code></pre>
               </div>`;
    };

    if (window.marked.use) {
      window.marked.use({ renderer });
    } else {
      window.marked.setOptions({ renderer });
    }
  }

  const els = {
    sidebar: document.getElementById('chat-sidebar'),
    sessionList: document.getElementById('chat-session-list'),
    messages: document.getElementById('chat-messages'),
    input: document.getElementById('chat-input'),
    btnSend: document.getElementById('btn-send-chat'),
    btnNew: document.getElementById('btn-new-chat'),
    btnDelete: document.getElementById('btn-delete-chat'),
    btnToggleSidebar: document.getElementById('btn-toggle-sidebar'),
    title: document.getElementById('current-chat-title'),
    ctxFull: document.getElementById('chat-ctx-full'),
    ctxSel: document.getElementById('chat-ctx-selection'),
    ctxLive: document.getElementById('chat-ctx-live'),
    ctxAgent: document.getElementById('chat-agent-mode'),
    personaSelect: document.getElementById('chat-persona-select'),
    btnAttachDoc: document.getElementById('btn-attach-doc'),
    attachmentPanel: document.getElementById('chat-attachment-panel'),
  };

  let currentSessionId = null;
  let isGenerating = false;
  let isAgentModeOn = false;
  let attachedDocs = [];

  // ── Restore & Persist toggle state ──────────────────────────
  const TOGGLE_KEYS = {
    ctxFull: 'autobib_chat_ctx_full',
    ctxSel: 'autobib_chat_ctx_sel',
    ctxLive: 'autobib_chat_ctx_live',
    ctxAgent: 'autobib_chat_ctx_agent',
  };
  const TOGGLE_DEFAULTS = {
    ctxFull: false,
    ctxSel: true,   // default checked sesuai HTML
    ctxLive: false,
    ctxAgent: false,
  };

  // Restore saved state on load
  Object.keys(TOGGLE_KEYS).forEach(key => {
    const el = els[key];
    if (!el) return;
    const saved = localStorage.getItem(TOGGLE_KEYS[key]);
    el.checked = saved !== null ? saved === 'true' : TOGGLE_DEFAULTS[key];
  });
  isAgentModeOn = els.ctxAgent ? els.ctxAgent.checked : false;

  // Save state on change
  if (els.ctxFull) {
    els.ctxFull.addEventListener('change', (e) => {
      localStorage.setItem(TOGGLE_KEYS.ctxFull, e.target.checked);
    });
  }
  if (els.ctxSel) {
    els.ctxSel.addEventListener('change', (e) => {
      localStorage.setItem(TOGGLE_KEYS.ctxSel, e.target.checked);
    });
  }
  if (els.ctxLive) {
    els.ctxLive.addEventListener('change', (e) => {
      localStorage.setItem(TOGGLE_KEYS.ctxLive, e.target.checked);
    });
  }
  if (els.ctxAgent) {
    els.ctxAgent.addEventListener('change', (e) => {
      isAgentModeOn = e.target.checked;
      localStorage.setItem(TOGGLE_KEYS.ctxAgent, e.target.checked);
      if (isAgentModeOn) {
        window.showToast('🤖 Agent Mode diaktifkan. AI akan merencanakan dan mengeksekusi instruksi secara otonom.', 'info');
      }
    });
  }

  async function runAgentModePipeline(userText) {
    if (isGenerating) return;
    isGenerating = true;
    els.btnSend.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="6" width="12" height="12"></rect></svg>';
    els.btnSend.classList.add('text-danger');
    let abortController = new AbortController();

    let docContext = els.ctxFull.checked ? await OfficeBridge.getAllText() : '';
    let selContext = els.ctxSel.checked ? await OfficeBridge.getSelectedText() : '';

    if (docContext) {
      try {
        const styles = await OfficeBridge.getAllStyles();
        if (styles && styles.length) {
          docContext += "\n\n[AVAILABLE STYLES]\n" + styles.join(", ");
        }
      } catch (e) { }
    }

    if (!currentSessionId) {
      try {
        const res = await ApiClient.chat.createSession(userText.substring(0, 20) + '...');
        currentSessionId = res.session.id;
        els.title.textContent = userText.substring(0, 20) + '...';
        loadSessions();
      } catch (e) { }
    }

    appendMessage('user', userText);
    scrollToBottom();

    const aiMessageDiv = appendMessage('ai', '<div class="agent-pipeline-status" style="font-size:12px; color:var(--text-secondary);"><p>⚙️ Step 1: Merapikan instruksi...</p></div>');
    const bubble = aiMessageDiv.querySelector('.chat-bubble');
    scrollToBottom();

    try {
      // Phase 1
      const p1Res = await ApiClient.chat.runAgentPhase(1, userText, docContext, selContext);
      let enhancedPrompt = "";
      try {
        let clean = p1Res.trim();
        const match = clean.match(/\{[\s\S]*\}/);
        if (match) clean = match[0];
        enhancedPrompt = JSON.parse(clean).enhanced_prompt;
      } catch (e) {
        enhancedPrompt = userText; // Fallback
      }
      if (!enhancedPrompt) enhancedPrompt = userText;
      bubble.innerHTML += `<p>✅ Instruksi matang dibuat: <em>"${enhancedPrompt.substring(0, 50)}..."</em></p><p>⚙️ Step 2: Merancang strategi eksekusi...</p>`;
      scrollToBottom();

      // Phase 2
      const p2Res = await ApiClient.chat.runAgentPhase(2, enhancedPrompt, docContext, selContext);
      let planSteps = [];
      try {
        let clean = p2Res.trim();
        const match = clean.match(/\{[\s\S]*\}/);
        if (match) clean = match[0];
        planSteps = JSON.parse(clean).plan_steps;
      } catch (e) {
        planSteps = [enhancedPrompt]; // Fallback
      }
      if (!planSteps || planSteps.length === 0) planSteps = [enhancedPrompt];
      bubble.innerHTML += `<p>✅ Rencana tersusun (${planSteps.length} langkah).</p><p>⚙️ Step 3: Membangun task list...</p>`;
      scrollToBottom();

      // Phase 3
      const p3Res = await ApiClient.chat.runAgentPhase(3, JSON.stringify(planSteps), docContext, selContext);
      let tasks = [];
      try {
        let clean = p3Res.trim();
        const match = clean.match(/\{[\s\S]*\}/);
        if (match) clean = match[0];
        tasks = JSON.parse(clean).tasks;
      } catch (e) {
        console.warn("Gagal mengekstrak JSON task:", e);
        bubble.innerHTML += `<p style="color:var(--error)">⚠️ Gagal mengekstrak JSON task. Respon raw: ${p3Res.substring(0, 100)}</p>`;
        tasks = [];
      }
      if (!tasks || tasks.length === 0) {
        bubble.innerHTML += `<p style="color:var(--error)">⚠️ AI tidak mengembalikan task apa pun.</p>`;
        // Reset UI state and stop pipeline gracefully
        isGenerating = false;
        abortController = null;
        els.btnSend.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>';
        els.btnSend.classList.remove('text-danger');
        scrollToBottom();
        return;
      }
      bubble.innerHTML += `<p>✅ Menemukan ${tasks.length} task.</p><p>⚙️ Step 4: Mengeksekusi task...</p>`;

      let taskListHtml = '<ul style="padding-left:16px; margin: 8px 0; list-style-type:none;" id="agent-task-list">';
      tasks.forEach((t, i) => {
        taskListHtml += `<li id="task-item-${i}" style="margin-bottom:4px;">[ ] ${t.description} <span style="font-size:10px;color:var(--accent);">(${t.tool})</span></li>`;
      });
      taskListHtml += '</ul>';
      bubble.innerHTML += taskListHtml;
      scrollToBottom();

      // Phase 4 - Execution
      for (let i = 0; i < tasks.length; i++) {
        if (!abortController) break;
        const t = tasks[i];
        const li = bubble.querySelector(`#task-item-${i}`);

        let attempts = 0;
        let success = false;
        let taskPrompt = `Eksekusi task agent ini secara otonom: ${t.description}. Gunakan tool: ${t.tool}.`;

        while (attempts < 3 && !success && abortController) {
          attempts++;
          if (attempts === 1) {
            li.innerHTML = `[⏳] <strong>Mengeksekusi:</strong> ${t.description}`;
          } else {
            li.innerHTML = `[🔄] <strong>Memulihkan (Attempt ${attempts}/3):</strong> ${t.description}`;
          }

          let taskRes = '';
          try {
            await ApiClient.chat.sendMessageStream(currentSessionId, taskPrompt, docContext, selContext, true, 'default', (chunk) => {
              if (typeof chunk === 'string') {
                taskRes += chunk;
              }
            });

            let parsed = null;
            try {
              const cleanResp = taskRes.trim();
              const jsonMatch = cleanResp.match(/\{[\s\S]*\}/);
              if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
            } catch (e) {
              try {
                let safeStr = taskRes.replace(/\\(?!["\\/bfnrtu])/g, '\\\\').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t');
                const jsonMatch = safeStr.match(/\{[\s\S]*\}/);
                if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
              } catch (e2) { }
            }

            if (parsed && parsed.tool && parsed.tool !== 'none' && parsed.operations && parsed.operations.length > 0) {
              const ops = parsed.operations;
              ops.forEach(op => {
                if (!op.find && (op.text_selection || op.target || op.text)) {
                  op.find = op.text_selection || op.target || op.text;
                }
              });

              if (parsed.tool === 'replace') await OfficeBridge.searchAndReplaceSelection(ops);
              else if (parsed.tool === 'insert') await OfficeBridge.insertTextAtTarget(ops);
              else if (parsed.tool === 'table') await OfficeBridge.insertTableSelection(ops[0]);
              else if (parsed.tool === 'table_edit') await OfficeBridge.editTableSelection(ops);
              else if (parsed.tool === 'format') await OfficeBridge.formatSelection(ops);
              else if (parsed.tool === 'delete') await OfficeBridge.deleteSelection(ops);
              else if (parsed.tool === 'comment') await OfficeBridge.addCommentSelection(ops);
              else if (parsed.tool === 'highlight') await OfficeBridge.highlightSelection(ops);
              else if (parsed.tool === 'manage_skill') {
                const op = ops[0];
                if (op.action === 'delete') {
                  if (op.id) await ApiClient.skills.remove(op.id);
                } else if (op.action === 'update') {
                  if (op.id) {
                    await ApiClient.skills.update(op.id, {
                        name: op.name,
                        description: op.description || 'Dibuat otomatis oleh AI',
                        prompt_injection: op.prompt_injection,
                        is_active: true
                    });
                  }
                } else {
                  await ApiClient.skills.add({
                      name: op.name,
                      description: op.description || 'Dibuat otomatis oleh AI',
                      prompt_injection: op.prompt_injection,
                      is_active: true
                  });
                }
                if (window.SkillsManager) window.SkillsManager.loadSkills();
              }
              else if (parsed.tool === 'view_code') {
                const pathToView = ops[0].path;
                const res = await fetch('http://localhost:3001/system/view-code', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ filePath: pathToView })
                });
                const data = await res.json();
                if (res.ok) {
                  taskPrompt = `[SYSTEM AUTO-REPORT] Tool 'view_code' berhasil. Isi file ${pathToView}:\n\n${data.content.substring(0, 5000)}\n\nBerdasarkan kode tersebut, perbaiki strategi eksekusi.`;
                  success = false;
                  attempts--; // Do not count view_code as a failed attempt
                  continue;
                } else {
                  console.warn("Gagal view_code:", data.error);
                  li.innerHTML = `[⚠️] Gagal view_code: ${data.error}`;
                  taskPrompt = `Tugas sebelumnya gagal dengan error: ${data.error}.`;
                  // allow retry by continuing the attempts loop
                  continue;
                }
              }
            }

            success = true;
            li.innerHTML = `[x] <strong>Selesai:</strong> ${t.description}`;

          } catch (err) {
            console.warn("Task error:", err);
            taskPrompt = `Tugas sebelumnya gagal dengan error: ${err.message}. Lakukan analisis mengapa ini gagal, periksa kondisi dokumen, atau gunakan tool 'view_code' jika perlu untuk memeriksa source code internal. Lakukan self-healing dan selesaikan kembali.`;
          }
        }
        if (!success) {
          li.innerHTML = `[❌] <strong>Gagal:</strong> ${t.description}`;
        }

        if (els.ctxFull.checked) docContext = await OfficeBridge.getAllText();
      }

      bubble.innerHTML += `<p>🎉 Semua task agen telah selesai dieksekusi secara otonom!</p>`;

    } catch (err) {
      bubble.innerHTML += `<p style="color:var(--red);">❌ Agen mengalami kegagalan: ${err.message}</p>`;
    }

    isGenerating = false;
    abortController = null;
    els.btnSend.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>';
    els.btnSend.classList.remove('text-danger');
    scrollToBottom();
  }

  if (els.btnAttachDoc) {
    els.btnAttachDoc.addEventListener('click', () => {
      const docName = prompt('URL atau nama dokumen untuk dilampirkan:');
      if (docName && docName.trim()) {
        attachedDocs.push(docName.trim());
        renderAttachments();
      }
    });
  }

  const btnAttachImg = document.getElementById('btn-attach-img');
  const imgUpload = document.getElementById('chat-image-upload');

  if (btnAttachImg && imgUpload) {
    btnAttachImg.addEventListener('click', () => imgUpload.click());
    imgUpload.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        attachedDocs.push({ type: 'image', name: file.name, data: ev.target.result });
        renderAttachments();
      };
      reader.readAsDataURL(file);
      e.target.value = '';
    });
  }

  // C1.1.1 Voice Input
  const btnVoice = document.getElementById('btn-voice-input');
  if (btnVoice) {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
      const recognition = new SpeechRec();
      recognition.lang = 'id-ID';
      recognition.continuous = true;
      recognition.interimResults = true;

      let finalTranscript = '';
      let isRecording = false;

      recognition.onstart = () => {
        isRecording = true;
        finalTranscript = els.input.value ? els.input.value + ' ' : '';
        btnVoice.classList.add('recording-pulse');
        // Biarkan icon tetap mic
        btnVoice.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>`;
      };

      recognition.onresult = (event) => {
        let interimTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }
        els.input.value = finalTranscript + interimTranscript;
        els.input.dispatchEvent(new Event('input', { bubbles: true }));
        els.input.style.height = 'auto';
        els.input.style.height = (els.input.scrollHeight) + 'px';
        els.input.scrollTop = els.input.scrollHeight; // Auto-scroll ke bawah saat teks bertambah panjang
      };

      recognition.onend = () => {
        isRecording = false;
        btnVoice.classList.remove('recording-pulse');
        btnVoice.style.color = 'var(--text-muted)';
        btnVoice.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>`;
      };

      btnVoice.addEventListener('click', () => {
        if (isRecording) {
          recognition.stop();
        } else {
          recognition.start();
        }
      });
    } else {
      btnVoice.style.display = 'none';
    }
  }

  function renderAttachments() {
    if (!els.attachmentPanel) return;
    if (attachedDocs.length === 0) {
      els.attachmentPanel.style.display = 'none';
      els.attachmentPanel.innerHTML = '';
      return;
    }

    els.attachmentPanel.style.display = 'flex';
    els.attachmentPanel.innerHTML = '';

    attachedDocs.forEach((doc, idx) => {
      const item = document.createElement('div');
      item.style.cssText = 'display:flex; align-items:center; gap:4px; padding:4px 8px; background:var(--bg-elevated); border:1px solid var(--border); border-radius:4px; font-size:11px; white-space:nowrap; color:var(--text-primary);';

      const icon = document.createElement('span');
      const text = document.createElement('span');

      if (typeof doc === 'string') {
        icon.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--accent);"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path></svg>';
        text.textContent = doc.length > 20 ? doc.substring(0, 20) + '...' : doc;
        text.title = doc;
      } else if (doc.type === 'image') {
        icon.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--accent);"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>';
        text.textContent = doc.name.length > 20 ? doc.name.substring(0, 20) + '...' : doc.name;
        text.title = doc.name;
      }

      const btnDel = document.createElement('button');
      btnDel.style.cssText = 'background:transparent; border:none; cursor:pointer; margin-left:4px; color:var(--text-muted); padding:0; display:flex; align-items:center; transition:color 0.2s;';
      btnDel.innerHTML = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
      btnDel.onmouseover = () => btnDel.style.color = 'var(--red)';
      btnDel.onmouseout = () => btnDel.style.color = 'var(--text-muted)';
      btnDel.onclick = () => {
        attachedDocs.splice(idx, 1);
        renderAttachments();
      };

      item.appendChild(icon);
      item.appendChild(text);
      item.appendChild(btnDel);
      els.attachmentPanel.appendChild(item);
    });
  }

  // Auto-collapse sidebar if screen is narrow (like in Word Taskpane)
  if (window.innerWidth < 450) {
    els.sidebar.classList.add('collapsed');
  }

  els.btnToggleSidebar.addEventListener('click', () => {
    els.sidebar.classList.toggle('collapsed');
  });

  // Close sidebar when clicking outside of it
  document.addEventListener('click', (e) => {
    if (!els.sidebar.classList.contains('collapsed') &&
      !els.sidebar.contains(e.target) &&
      !els.btnToggleSidebar.contains(e.target)) {
      els.sidebar.classList.add('collapsed');
    }
  });

  async function loadSessions() {
    try {
      const res = await ApiClient.chat.getSessions();
      els.sessionList.innerHTML = '';
      if (!res.sessions || res.sessions.length === 0) {
        els.sessionList.innerHTML = '<div style="padding:10px;color:var(--text-muted);font-size:12px;">Belum ada riwayat.</div>';
        return;
      }

      res.sessions.forEach(sess => {
        const div = document.createElement('div');
        div.className = `chat-session-item ${sess.id === currentSessionId ? 'active' : ''}`;

        const contentDiv = document.createElement('div');
        contentDiv.className = 'chat-session-content';

        const titleDiv = document.createElement('div');
        titleDiv.className = 'chat-session-title';
        titleDiv.textContent = sess.title;

        const dateDiv = document.createElement('div');
        dateDiv.className = 'chat-session-date';

        // Format date: "12 Okt 2026, 14:30"
        const d = new Date(sess.updated_at + 'Z');
        const dateStr = d.toLocaleString('id-ID', {
          day: 'numeric', month: 'short', year: 'numeric',
          hour: '2-digit', minute: '2-digit'
        });
        dateDiv.textContent = dateStr;

        contentDiv.appendChild(titleDiv);
        contentDiv.appendChild(dateDiv);
        div.appendChild(contentDiv);

        // Individual edit title button
        const editBtn = document.createElement('button');
        editBtn.className = 'icon-btn text-muted chat-session-edit';
        editBtn.title = 'Ubah Nama Sesi';
        editBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>';
        editBtn.style.marginRight = '4px';
        editBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          showPrompt('Masukkan nama sesi baru:', sess.title, async (newTitle) => {
            if (newTitle && newTitle.trim()) {
              try {
                await ApiClient.chat.updateSession(sess.id, newTitle.trim());
                if (sess.id === currentSessionId) els.title.textContent = newTitle.trim();
                loadSessions();
              } catch (err) {
                showToast('Gagal mengubah nama', 'error');
              }
            }
          });
        });

        // Individual delete button
        const delBtn = document.createElement('button');
        delBtn.className = 'icon-btn text-danger chat-session-delete';
        delBtn.title = 'Hapus Sesi Ini';
        delBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>';
        delBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          try {
            await ApiClient.chat.deleteSession(sess.id);
            if (sess.id === currentSessionId) {
              currentSessionId = null;
              els.title.textContent = 'Obrolan Baru';
              els.messages.innerHTML = '';
            }
            loadSessions();
          } catch (err) {
            console.error(err);
            showToast('Gagal menghapus sesi', 'error');
          }
        });

        const actionDiv = document.createElement('div');
        actionDiv.style.display = 'flex';
        actionDiv.appendChild(editBtn);
        actionDiv.appendChild(delBtn);
        div.appendChild(actionDiv);

        div.addEventListener('click', () => loadSession(sess.id, sess.title));
        els.sessionList.appendChild(div);
      });
    } catch (err) {
      console.error(err);
    }
  }

  // C2.1.1 Searchbar riwayat sesi
  const inputSearch = document.getElementById('chat-session-search');
  if (inputSearch) {
    inputSearch.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase();
      const items = els.sessionList.querySelectorAll('.chat-session-item');
      items.forEach(item => {
        const titleEl = item.querySelector('.chat-session-title');
        if (!titleEl) return;
        if (titleEl.textContent.toLowerCase().includes(q)) item.style.display = 'flex';
        else item.style.display = 'none';
      });
    });
  }

  const btnDeleteAll = document.getElementById('btn-delete-all-chat');
  if (btnDeleteAll) {
    btnDeleteAll.addEventListener('click', () => {
      showConfirm(
        'Hapus Semua Riwayat',
        'Anda yakin ingin menghapus seluruh riwayat obrolan? Tindakan ini tidak dapat dibatalkan.',
        async () => {
          try {
            await ApiClient.chat.deleteSession('all');
            currentSessionId = null;
            els.title.textContent = 'Obrolan Baru';
            els.messages.innerHTML = '';
            loadSessions();
            showToast('Semua riwayat berhasil dihapus', 'success');
          } catch (err) {
            console.error(err);
            showToast('Gagal menghapus riwayat', 'error');
          }
        }
      );
    });
  }

  let lastMessageDateStr = null;

  async function loadSession(id, title) {
    currentSessionId = id;
    els.title.textContent = title;
    els.messages.innerHTML = '';
    lastMessageDateStr = null; // reset for new session
    loadSessions(); // Update active state

    if (window.innerWidth < 768) els.sidebar.classList.add('collapsed');

    try {
      const res = await ApiClient.chat.getMessages(id);
      if (res.messages) {
        res.messages.forEach(msg => {
          appendMessage(msg.role, msg.content, msg.created_at);
        });
      }
      scrollToBottom();
    } catch (err) {
      console.error(err);
    }
  }

  els.btnNew.addEventListener('click', async () => {
    try {
      const res = await ApiClient.chat.createSession('Sesi Obrolan Baru');
      await loadSession(res.session.id, res.session.title);
    } catch (err) {
      showToast('Gagal membuat sesi baru', 'error');
    }
  });

  els.btnDelete.addEventListener('click', async () => {
    if (!currentSessionId) return;
    if (confirm('Hapus riwayat obrolan ini?')) {
      try {
        await ApiClient.chat.deleteSession(currentSessionId);
        currentSessionId = null;
        els.title.textContent = 'Obrolan Baru';
        els.messages.innerHTML = '';
        loadSessions();
      } catch (err) {
        showToast('Gagal menghapus obrolan', 'error');
      }
    }
  });

  const btnExportMd = document.getElementById('btn-export-md');
  const btnExportDoc = document.getElementById('btn-export-doc');

  if (btnExportMd) btnExportMd.addEventListener('click', () => exportSession('md'));
  if (btnExportDoc) btnExportDoc.addEventListener('click', () => exportSession('doc'));

  async function exportSession(type) {
    if (!currentSessionId) {
      showToast('Tidak ada sesi aktif', 'error');
      return;
    }
    try {
      const res = await ApiClient.chat.getMessages(currentSessionId);
      if (!res.messages || res.messages.length === 0) {
        showToast('Sesi kosong', 'info');
        return;
      }

      const title = els.title.textContent || 'Obrolan_AutoBib';

      if (type === 'md') {
        let mdContent = `# ${title}\n\n`;
        res.messages.forEach(m => {
          const role = m.role === 'user' ? '👤 Anda' : '🤖 Copilot';
          mdContent += `### ${role}\n${m.content}\n\n---\n\n`;
        });
        downloadFile(`${title}.md`, mdContent, 'text/markdown');
      } else if (type === 'doc') {
        let htmlContent = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
        <head><meta charset='utf-8'><title>${title}</title></head><body>
        <h1>${title}</h1><hr/>`;

        res.messages.forEach(m => {
          const role = m.role === 'user' ? '<b>Anda</b>' : '<b>Copilot</b>';
          let content = m.content;
          if (m.role === 'ai') {
            try {
              if (content.trim().startsWith('{')) {
                const parsed = JSON.parse(content);
                content = parsed.message || content;
              }
            } catch (e) { }
            if (window.marked) {
              content = window.marked.parse(content);
            } else {
              content = content.replace(/\n/g, '<br/>');
            }
          } else {
            content = content.replace(/\n/g, '<br/>');
          }
          htmlContent += `<p>${role}:</p><div>${content}</div><br/><hr/>`;
        });
        htmlContent += `</body></html>`;
        downloadFile(`${title}.doc`, htmlContent, 'application/msword');
      }
      showToast('Berhasil diekspor', 'success');
    } catch (err) {
      console.error(err);
      showToast('Gagal mengekspor', 'error');
    }
  }

  function downloadFile(filename, content, type) {
    const blob = new Blob([content], { type: type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  }

  function nlToBr(s) {
    s = s == null ? '' : String(s);
    // convert both literal \n and real newline to <br/>
    return s
      .replace(/\r\n/g, '\n')
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/\n/g, '<br/>');
  }

  function appendMessage(role, content, timestampStr) {

    const d = timestampStr ? new Date(timestampStr + 'Z') : new Date();

    const dateOpts = { day: 'numeric', month: 'long', year: 'numeric' };
    const dateStr = d.toLocaleDateString('id-ID', dateOpts);

    if (dateStr !== lastMessageDateStr) {
      const divider = document.createElement('div');
      divider.className = 'chat-date-divider';
      // check if today
      const todayStr = new Date().toLocaleDateString('id-ID', dateOpts);
      const yestD = new Date(); yestD.setDate(yestD.getDate() - 1);
      const yestStr = yestD.toLocaleDateString('id-ID', dateOpts);

      if (dateStr === todayStr) divider.textContent = 'Hari Ini';
      else if (dateStr === yestStr) divider.textContent = 'Kemarin';
      else divider.textContent = dateStr;

      els.messages.appendChild(divider);
      lastMessageDateStr = dateStr;
    }

    const timeStr = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

    const div = document.createElement('div');
    div.className = `chat-message ${role}`;

    const bubbleWrapper = document.createElement('div');
    bubbleWrapper.style.display = 'flex';
    bubbleWrapper.style.flexDirection = 'column';
    if (role === 'user') bubbleWrapper.style.alignItems = 'flex-end';
    else bubbleWrapper.style.alignItems = 'flex-start';

    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble';

    let htmlContent = '';

    if (role === 'ai') {
      try {
        if (content.trim().startsWith('{')) {
          const parsed = JSON.parse(content);
          if (parsed.thought) {
            htmlContent += '<details class="ai-thought"><summary>🤔 Menganalisis masalah...</summary><div class="thought-content">' + parsed.thought.replace(/\n/g, '<br/>') + '</div></details>';
          }
          content = parsed.message || content;
        }
      } catch (e) { }
    }

    if (window.marked && content) {
      let parsed = window.marked.parse(content);
      // C4.1.2 Detect sitasi dalam chat
      const citeRegex = /\(([A-Za-z\s&]+(?:et al\.)?,\s*\d{4}[a-z]?)\)/g;
      parsed = parsed.replace(citeRegex, (match, p1) => {
        return `<button class="btn-inline-cite" data-cite="${p1}" title="Sisipkan Sitasi: ${p1}" style="background:var(--bg-elevated); color:var(--primary); border:1px solid var(--primary); border-radius:12px; padding:2px 8px; font-size:11px; font-weight:600; cursor:pointer; display:inline-flex; align-items:center; gap:4px; margin:0 2px; transition:all 0.2s;">
                 <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                 ${match}
             </button>`;
      });
      htmlContent += parsed;
    } else {
      htmlContent += content
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/\n/g, '<br/>');
    }

    bubble.innerHTML = htmlContent;

    // Attach event listeners for C4.1.2 citation buttons
    const citeBtns = bubble.querySelectorAll('.btn-inline-cite');
    citeBtns.forEach(btn => {
      btn.onmouseover = () => { btn.style.background = 'var(--primary)'; btn.style.color = 'white'; };
      btn.onmouseout = () => { btn.style.background = 'var(--bg-elevated)'; btn.style.color = 'var(--primary)'; };
      btn.addEventListener('click', async () => {
        const citeText = btn.getAttribute('data-cite');
        try {
          await OfficeBridge.insertHtml(`<span>(${citeText})</span>`);
          showToast(`Sitasi (${citeText}) disisipkan!`, 'success');
        } catch (e) {
          showToast('Gagal menyisipkan sitasi', 'error');
        }
      });
    });
    bubbleWrapper.appendChild(bubble);

    const timeDiv = document.createElement('div');
    timeDiv.className = 'chat-bubble-time';
    timeDiv.textContent = timeStr;
    bubbleWrapper.appendChild(timeDiv);

    // If it's an AI message, add action buttons
    if (role === 'ai') {
      const actionsDiv = document.createElement('div');
      actionsDiv.className = 'chat-bubble-actions';
      actionsDiv.innerHTML = `
        <button class="btn btn-sm btn-ghost btn-apply" title="Terapkan teks ini ke dokumen">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
          Terapkan
        </button>
        <button class="btn btn-sm btn-ghost btn-copy" title="Salin teks">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
          Salin
        </button>
        <button class="btn btn-sm btn-ghost btn-regenerate" title="Generate ulang respons">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path><path d="M3 3v5h5"></path><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"></path><path d="M16 21v-5h5"></path></svg>
          Regenerate
        </button>
      `;

      const btnApply = actionsDiv.querySelector('.btn-apply');
      btnApply.addEventListener('click', async () => {
        const currentHtml = bubble.innerHTML;
        if (currentHtml) {
          await OfficeBridge.insertHtml(`<span>${currentHtml}</span>`);
          showToast('Teks berhasil diterapkan!', 'success');
        }
      });

      const btnCopy = actionsDiv.querySelector('.btn-copy');
      btnCopy.addEventListener('click', () => {
        const tempText = bubble.innerText;
        navigator.clipboard.writeText(tempText);
        showToast('Teks disalin ke clipboard', 'success');
      });

      const btnRegen = actionsDiv.querySelector('.btn-regenerate');
      if (btnRegen) {
        btnRegen.addEventListener('click', () => {
          els.input.value = "Tolong perbaiki dan generate ulang respons Anda barusan.";
          sendMessage();
        });
      }

      bubbleWrapper.appendChild(actionsDiv);
    }

    div.appendChild(bubbleWrapper);
    els.messages.appendChild(div);
    return div;
  }

  // Global Undo Handler
  window.undoAIActions = async (btnElement, actionIdsStr) => {
    try {
      btnElement.textContent = "⏳ Undoing...";
      btnElement.disabled = true;
      const ids = actionIdsStr.split(',');
      for (const id of ids) {
        await OfficeBridge.undoAction(id);
      }
      btnElement.textContent = "✅ Undone";
      btnElement.style.borderColor = "var(--success)";
      btnElement.style.color = "var(--success)";
      showToast('Aksi berhasil dibatalkan', 'success');
    } catch (err) {
      console.error(err);
      btnElement.textContent = "❌ Gagal";
      btnElement.disabled = false;
      showToast('Gagal membatalkan aksi: ' + err.message, 'error');
    }
  };

  function scrollToBottom() {
    els.messages.scrollTop = els.messages.scrollHeight;
  }

  // C5.2.1 Scroll to bottom button
  const scrollBtn = document.createElement('button');
  scrollBtn.className = 'btn-scroll-bottom';
  scrollBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>';
  scrollBtn.style.cssText = 'position:absolute; bottom:80px; right:20px; border-radius:50%; width:40px; height:40px; display:none; align-items:center; justify-content:center; background:var(--bg-elevated); border:1px solid var(--border); color:var(--text-primary); cursor:pointer; box-shadow:0 4px 12px rgba(0,0,0,0.2); z-index:50; transition:all 0.2s;';

  scrollBtn.onmouseover = () => { scrollBtn.style.background = 'var(--surface-hover)'; };
  scrollBtn.onmouseout = () => { scrollBtn.style.background = 'var(--bg-elevated)'; };

  scrollBtn.addEventListener('click', () => {
    scrollToBottom();
  });

  // Make sure chat-main is relative
  els.messages.parentElement.style.position = 'relative';
  els.messages.parentElement.appendChild(scrollBtn);

  els.messages.addEventListener('scroll', () => {
    const isAtBottom = els.messages.scrollHeight - els.messages.scrollTop - els.messages.clientHeight < 150;
    if (isAtBottom) {
      scrollBtn.style.display = 'none';
    } else {
      scrollBtn.style.display = 'flex';
    }
  });

  let abortController = null;

  // C1.4.4 Slash Command (/) Menu
  const slashCommands = [
    { cmd: '/sitasi', desc: 'Format teks menjadi sitasi Mendeley' },
    { cmd: '/periksa_sitasi', desc: 'Periksa & validasi sitasi di dokumen' },
    { cmd: '/ringkas', desc: 'Ringkas dokumen / teks blok' },
    { cmd: '/parafrase', desc: 'Parafrase teks terpilih' },
    { cmd: '/grammar', desc: 'Perbaiki tata bahasa' },
    { cmd: '/translate', desc: 'Terjemahkan teks' },
    { cmd: '/litrev', desc: 'Buat tinjauan pustaka' },
    { cmd: '/outline', desc: 'Buat outline/kerangka tulisan' }
  ];

  const slashMenu = document.createElement('div');
  slashMenu.className = 'slash-command-menu';

  slashCommands.forEach((item) => {
    const div = document.createElement('div');
    div.className = 'slash-command-item';
    div.innerHTML = `<div class="slash-command-title">${item.cmd}</div><div class="slash-command-desc">${item.desc}</div>`;
    div.dataset.cmd = item.cmd;
    div.addEventListener('click', () => {
      els.input.value = item.cmd + ' ';
      els.input.style.height = 'auto';
      els.input.style.height = (els.input.scrollHeight) + 'px';
      els.input.focus();
      slashMenu.classList.remove('active');
    });
    slashMenu.appendChild(div);
  });

  els.input.parentElement.style.position = 'relative';
  els.input.parentElement.appendChild(slashMenu);

  let slashSelectedIndex = -1;

  function updateSlashSelection(visibleItems) {
    visibleItems.forEach((item, idx) => {
      if (idx === slashSelectedIndex) {
        item.classList.add('selected');
        item.scrollIntoView({ block: 'nearest' });
      } else {
        item.classList.remove('selected');
      }
    });
  }

  // C1.4.2 Auto-resize textarea & Slash Command trigger
  els.input.addEventListener('input', function () {
    this.style.height = 'auto';
    this.style.height = (this.scrollHeight) + 'px';
    if (this.value === '') {
      this.style.height = '';
    }

    const val = this.value;
    if (val.startsWith('/') && !val.includes(' ')) {
      const filter = val.toLowerCase();
      const items = slashMenu.querySelectorAll('.slash-command-item');
      let visibleCount = 0;
      items.forEach(item => {
        if (item.dataset.cmd.toLowerCase().startsWith(filter)) {
          item.style.display = 'flex';
          visibleCount++;
        } else {
          item.style.display = 'none';
        }
      });

      if (visibleCount > 0) {
        slashMenu.classList.add('active');
        slashSelectedIndex = -1;
        updateSlashSelection(Array.from(slashMenu.querySelectorAll('.slash-command-item')).filter(i => i.style.display !== 'none'));
      } else {
        slashMenu.classList.remove('active');
      }
    } else {
      slashMenu.classList.remove('active');
    }
  });

  els.input.addEventListener('keydown', (e) => {
    if (slashMenu.classList.contains('active')) {
      const visibleItems = Array.from(slashMenu.querySelectorAll('.slash-command-item')).filter(i => i.style.display !== 'none');

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        slashSelectedIndex = (slashSelectedIndex + 1) % visibleItems.length;
        updateSlashSelection(visibleItems);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        slashSelectedIndex = (slashSelectedIndex - 1 + visibleItems.length) % visibleItems.length;
        updateSlashSelection(visibleItems);
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (slashSelectedIndex >= 0 && slashSelectedIndex < visibleItems.length) {
          visibleItems[slashSelectedIndex].click();
        } else if (visibleItems.length > 0) {
          visibleItems[0].click(); // default to first
        }
        return;
      }
      if (e.key === 'Escape') {
        slashMenu.classList.remove('active');
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isGenerating) sendMessage();
    }
  });

  els.btnSend.addEventListener('click', () => {
    if (isGenerating) {
      if (abortController) {
        abortController.abort();
        abortController = null;
      }
      // Immediately stop live stream if active
      if (els.ctxLive && els.ctxLive.checked) {
        OfficeBridge.forceStop(); // Panggil forceStop untuk hentikan loop tool di OfficeBridge
      }
      // Disable button to prevent double click during abort
      els.btnSend.disabled = true;
      return;
    }
    sendMessage();
  });

  async function sendMessage() {
    if (isGenerating) return;
    const text = els.input.value.trim();
    if (!text) return;

    if (els.ctxAgent && els.ctxAgent.checked) {
      els.input.value = '';
      els.input.style.height = '';
      runAgentModePipeline(text);
      return;
    }

    isGenerating = true;

    // Deklarasikan di luar try{} agar bisa diakses di finally{}
    let hasStartedWordStream = false;
    let fullResponse = '';
    let lastMessageLength = 0;
    let finalStreamText = '';

    // Change Send Button to Stop Button immediately
    els.btnSend.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="6" width="12" height="12"></rect></svg>';
    els.btnSend.classList.add('text-danger');

    abortController = new AbortController();
    OfficeBridge.resetForceStop(); // Reset force stop state sebelum mulai request baru

    let docContext = '';
    let selContext = '';

    if (els.ctxFull.checked) {
      docContext = await OfficeBridge.getAllText();
      
      if (!docContext || docContext.trim() === '') {
        showToast('⚠️ Gagal mengekstrak dokumen. Dokumen kosong atau terlalu berat.', 'error');
      } else {
        try {
          const styles = await OfficeBridge.getAllStyles();
          if (styles && styles.length) docContext += "\n\n[AVAILABLE STYLES]\n" + styles.join(", ");
        } catch (e) { }
      }
    }

    if (attachedDocs.length > 0) {
      const stringDocs = attachedDocs.filter(d => typeof d === 'string');
      if (stringDocs.length > 0) {
        docContext += `\n\n[DOKUMEN LAMPIRAN TERKAIT]\n` + stringDocs.map(d => `- ${d}`).join('\n');
      }
      const imgDocs = attachedDocs.filter(d => typeof d !== 'string' && d.type === 'image');
      if (imgDocs.length > 0) {
        docContext += `\n\n[GAMBAR DILAMPIRKAN]\n` + imgDocs.map(d => `- ${d.name}`).join('\n');
        // Todo: Actually pass base64 to backend
      }
    }

    if (els.ctxSel.checked) {
      selContext = await OfficeBridge.getSelectedText();
      if (!selContext || !selContext.trim()) {
        isGenerating = false;
        abortController = null;
        els.btnSend.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>';
        els.btnSend.classList.remove('text-danger');

        appendMessage('ai', '⚠️ Anda mengaktifkan opsi **Teks Blok**, tetapi saya tidak mendeteksi adanya teks yang disorot (di-blok) di dokumen Word Anda. Silakan sorot teks yang ingin Anda bahas terlebih dahulu, atau matikan opsi **Teks Blok**.');
        scrollToBottom();
        return;
      }
    }

    if (!currentSessionId) {
      // Create session first if none exists
      try {
        const titleRes = await ApiClient.ai.generateText({
          mode: 'custom',
          prompt: `Buat judul pendek (maks 4 kata) untuk obrolan yang dimulai dengan: "${text}"`
        });
        const shortTitle = titleRes.text || text.substring(0, 20);
        const res = await ApiClient.chat.createSession(shortTitle);
        currentSessionId = res.session.id;
        els.title.textContent = shortTitle;
        loadSessions();
      } catch (err) {
        const res = await ApiClient.chat.createSession('Sesi Baru');
        currentSessionId = res.session.id;
        els.title.textContent = 'Sesi Baru';
      }
    }

    els.input.value = '';
    els.input.style.height = ''; // Reset height after sending

    // Clear attachments after send
    attachedDocs = [];
    renderAttachments();

    appendMessage('user', text);
    scrollToBottom();

    const aiMessageDiv = appendMessage('ai', '<span class="typing-indicator" style="margin: 4px 0;"><span></span><span></span><span></span></span>');
    const bubble = aiMessageDiv.querySelector('.chat-bubble');
    scrollToBottom();

    try {
      const isLiveEdit = els.ctxLive && els.ctxLive.checked;
      let finalContent = text;
      if (text.startsWith('/sitasi ')) {
        finalContent = "Tolong format teks berikut menjadi sitasi Mendeley yang benar: " + text.substring(8);
      } else if (text.startsWith('/periksa_sitasi')) {
        finalContent = "Tolong periksa semua referensi/sitasi dalam dokumen ini dan validasi format serta kecocokannya.";
      } else if (text.startsWith('/ringkas ')) {
        finalContent = "Tolong ringkas teks berikut dengan padat dan jelas: " + text.substring(9);
      } else if (text.startsWith('/parafrase ')) {
        finalContent = "Tolong parafrase teks berikut agar gaya bahasanya lebih akademis dan formal: " + text.substring(11);
      } else if (text.startsWith('/grammar ')) {
        finalContent = "Tolong perbaiki tata bahasa (grammar/EBI) pada teks berikut tanpa mengubah maknanya: " + text.substring(9);
      } else if (text.startsWith('/translate ')) {
        finalContent = "Tolong terjemahkan teks berikut ke bahasa Indonesia yang akademis dan baku: " + text.substring(11);
      } else if (text.startsWith('/litrev ')) {
        finalContent = "Tolong buatkan tinjauan pustaka (literature review) singkat dari topik/poin berikut: " + text.substring(8);
      } else if (text.startsWith('/outline ')) {
        finalContent = "Tolong buatkan kerangka tulisan (outline) yang terstruktur untuk topik berikut: " + text.substring(9);
      }

      const persona = els.personaSelect ? els.personaSelect.value : 'default';

      // Guidance to reduce Word delete/replace failures (e.g., 0xA7210002)
      // If user asks for bulk removal, steer the model to use delete + short anchors.
      // This is appended only during runtime chat so it doesn’t change other flows.
      const deleteSafetyPrompt =
        `\n\n[INSTRUKSI PENTING]\n` +
        `Jika diminta untuk menghapus konten dalam jumlah besar (termasuk paragraf dan tabel), gunakan:\n` +
        `1) Operasi action: 'delete' sebagai tool utama.\n` +
        `2) Untuk paragraf: target_type: 'paragraph' dan find berupa 5-7 kata pertama dari setiap paragraf (bukan kalimat panjang).\n` +
        `3) Untuk tabel: target_type: 'table' dan find berupa kata unik di dalam tabel (mis. 'Faktor' atau 'Variabel').\n` +
        `4) Jangan gunakan replace dengan string kosong untuk mengosongkan paragraf.\n` +
        `5) Pastikan setiap operasi memiliki action: 'delete' dan target_type sesuai.\n`;

      const safeFinalContent =
        (finalContent.toLowerCase().includes('hapus') ||
          finalContent.toLowerCase().includes('menghapus') ||
          finalContent.toLowerCase().includes('hapus semua') ||
          finalContent.toLowerCase().includes('clear') ||
          finalContent.toLowerCase().includes('remove'))
          ? (finalContent + deleteSafetyPrompt)
          : finalContent;

      let finalMessageStr = '';
      let finalThoughtStr = '';

      await ApiClient.chat.sendMessageStream(currentSessionId, safeFinalContent, docContext, selContext, isLiveEdit, persona, (chunk) => {
        if (typeof chunk === 'object' && chunk.type === 'title_updated') {
          els.title.textContent = chunk.title;
          loadSessions(); // Refresh sidebar list
          return;
        }

        fullResponse += chunk;

        const extractStreamingString = (fullStr, key) => {
          const keyIndex = fullStr.lastIndexOf(`"${key}"`);
          if (keyIndex === -1) return '';
          const colonIndex = fullStr.indexOf(':', keyIndex);
          if (colonIndex === -1) return '';
          const quoteIndex = fullStr.indexOf('"', colonIndex);
          if (quoteIndex === -1) return '';

          let extracted = '';
          let isEscaped = false;
          for (let i = quoteIndex + 1; i < fullStr.length; i++) {
            const char = fullStr[i];
            extracted += char;
            if (isEscaped) {
              isEscaped = false;
            } else if (char === '\\') {
              isEscaped = true;
            } else if (char === '"') {
              // Check if it's an unescaped quote inside the string
              const nextChars = fullStr.substring(i + 1).trim();
              if (nextChars.length === 0 || nextChars.startsWith(',') || nextChars.startsWith('}')) {
                extracted = extracted.slice(0, -1);
                break;
              }
            }
          }
          if (isEscaped) extracted = extracted.slice(0, -1);
          try {
            return JSON.parse('"' + extracted + '"');
          } catch(e) {
            return extracted.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
          }
        };

        const extractedMessage = extractStreamingString(fullResponse, 'message');
        const extractedThought = extractStreamingString(fullResponse, 'thought');
        const extractedStreamText = extractStreamingString(fullResponse, 'stream_to_word');
        
        finalMessageStr = extractedMessage;
        finalThoughtStr = extractedThought;
        finalStreamText = extractedStreamText;

        // Extract tool
        const toolMatch = fullResponse.match(/"tool"\s*:\s*"([^"]+)"/);
        const currentTool = toolMatch ? toolMatch[1] : 'none';

        // Live stream logic for Word (only stream if stream_to_word has content)
        if (extractedStreamText.length > 0 && !hasStartedWordStream) {
          hasStartedWordStream = true;
          if (els.ctxLive && els.ctxLive.checked) {
            const userPrompt = text.toLowerCase();
            const isAppend = userPrompt.includes('tambah') || userPrompt.includes('lanjut') || userPrompt.includes('buat') || userPrompt.includes('di bawah');
            OfficeBridge.startLiveStream(!isAppend);
          }
        }

        if (hasStartedWordStream && els.ctxLive && els.ctxLive.checked) {
          if (extractedStreamText.length > lastMessageLength) {
            const newChunk = extractedStreamText.substring(lastMessageLength);
            OfficeBridge.appendLiveStream(newChunk);
            lastMessageLength = extractedStreamText.length;
          }
        }

        let tempHtml = '';
        if (extractedThought) {
          tempHtml += '<details class="ai-thought" open><summary>🤔 Menganalisis masalah...</summary><div class="thought-content">' + extractedThought.replace(/\n/g, '<br/>') + ' <span class="typing-indicator"><span></span><span></span><span></span></span></div></details>';
        }

        if (window.marked && extractedMessage) {
          tempHtml += window.marked.parse(extractedMessage);
        } else {
          tempHtml += extractedMessage
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/\n/g, '<br/>');
        }

        bubble.innerHTML = tempHtml;
        scrollToBottom();
      }, abortController.signal);

      // Jika live stream ke Word sedang berjalan, hentikan dan tunggu sampai benar-benar selesai
      // SEBELUM parsing JSON dan eksekusi tool apapun — ini mencegah konflik tumpang tindih.
      if (hasStartedWordStream && els.ctxLive && els.ctxLive.checked) {
        await OfficeBridge.stopLiveStream();
        hasStartedWordStream = false;
      }

      // Stream completed. Parse full JSON and execute tools.
      let parsed = null;
      let parseError = "";
      let hasExecutedViewCode = false;
      try {
        let cleanResp = fullResponse.trim();
        const jsonMatch = cleanResp.match(/\{[\s\S]*\}/);
        let jsonToParse = jsonMatch ? jsonMatch[0] : cleanResp;

        function sanitizeJsonString(str) {
          // Escape semua backslash yang tidak diikuti oleh karakter escape yang valid
          return str.replace(/\\(?!["\\/bfnrtu])/g, '\\\\');
        }

        jsonToParse = sanitizeJsonString(jsonToParse);

        const tryParse = (str) => {
          try {
            // Coba parse langsung tanpa modifikasi apa pun
            return JSON.parse(str);
          } catch (e1) {
            try {
              // Jika gagal, gunakan Indestructible Healer
              let safeStr = str.replace(/"(?:\\.|[^"\\])*"|\s+/g, (match) => {
                if (match.startsWith('"')) {
                  return match.replace(/[\u0000-\u001F]/g, (c) => {
                    if (c === '\n') return '\\n';
                    if (c === '\r') return '';
                    if (c === '\t') return '\\t';
                    return '\\u' + ('0000' + c.charCodeAt(0).toString(16)).slice(-4);
                  });
                } else {
                  return " ";
                }
              });
              safeStr = safeStr.replace(/\\+$/, '');
              return JSON.parse(safeStr);
            } catch (e2) {
              parseError = e2.message;
              return null;
            }
          }
        };

        parsed = tryParse(jsonToParse)
          || tryParse(jsonToParse + '}')
          || tryParse(jsonToParse + ']}')
          || tryParse(jsonToParse + '}]}')
          || tryParse(jsonToParse + '"}]}')
          || tryParse(jsonToParse + '"}');

        if (!parsed) {
          console.warn("Failed to parse final JSON entirely. Using streaming fallback.");
          
          let toolFallback = "none";
          let opsFallback = [];
          
          const toolMatch = fullResponse.match(/"tool"\s*:\s*"([^"]+)"/);
          if (toolMatch) toolFallback = toolMatch[1];
          
          const opsMatch = fullResponse.match(/"operations"\s*:\s*(\[[\s\S]*\])/);
          if (opsMatch) {
             try {
                opsFallback = JSON.parse(opsMatch[1].trim());
             } catch(e) {
                try {
                   function repairJSONStrings(str) {
                     let res = '';
                     let inString = false;
                     for(let i=0; i<str.length; i++) {
                       let c = str[i];
                       if (c === '"') {
                         if (i > 0 && str[i-1] === '\\') {
                           res += c;
                         } else {
                           let prev = str.slice(0, i).trim().slice(-1);
                           let next = str.slice(i+1).trim()[0];
                           let isStructural = false;
                           if (!inString) {
                             if (['{','[',':',','].includes(prev) || prev === '') isStructural = true;
                           } else {
                             if (['}',']',':',','].includes(next) || next === undefined) isStructural = true;
                           }
                           
                           if (isStructural) {
                             inString = !inString;
                             res += '"';
                           } else {
                             res += '\\"'; // Escape the unescaped quote
                           }
                         }
                       } else {
                         // escape literal newlines
                         if (inString && c === '\n') res += '\\n';
                         else if (inString && c === '\r') res += '';
                         else if (inString && c === '\t') res += '\\t';
                         else res += c;
                       }
                     }
                     return res;
                   }
                   
                   let repairedOps = repairJSONStrings(opsMatch[1].trim());
                   opsFallback = JSON.parse(repairedOps);
                } catch(e2) {
                   console.warn("Could not salvage operations array with repair tool:", e2);
                }
             }
          }

          parsed = {
            message: finalMessageStr || fullResponse,
            thought: finalThoughtStr || '',
            tool: toolFallback,
            operations: opsFallback
          };
        }
      } catch (e) {
        console.warn("Unexpected error in JSON parsing", e);
      }

      if (parsed) {
        let finalHtml = '';
        if (parsed.thought) {
          finalHtml += '<details class="ai-thought"><summary>🧠 Pemikiran AI (Selesai)</summary><div class="thought-content">' + parsed.thought.replace(/\n/g, '<br/>') + '</div></details>';
        }

        if (window.marked && parsed.message) {
          finalHtml += window.marked.parse(parsed.message);
        } else {
          finalHtml += (parsed.message || '')
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/\n/g, '<br/>');
        }

        const tool = parsed.tool;
        const ops = parsed.operations || [];

        if (tool && tool !== 'none' && ops.length > 0) {
          let toolMsg = '';

          // Handle AI hallucinating 'find' key
          if (Array.isArray(ops)) {
            ops.forEach(op => {
              if (!op.find && (op.text_selection || op.target || op.text)) {
                op.find = op.text_selection || op.target || op.text;
              }
            });
          }

          try {
            if (els.ctxLive && els.ctxLive.checked) {
              let executedCount = { replace: 0, comment: 0, highlight: 0, insert: 0, format: 0, delete: 0, table: 0, table_edit: 0, view_code: 0, manage_skill: 0 };

              let actionIdsForUndo = [];
              
              for (let opIndex = 0; opIndex < ops.length; opIndex++) {
                if (OfficeBridge.getForceStopped()) {
                  console.warn("Eksekusi tool dihentikan secara paksa oleh pengguna.");
                  break;
                }

                const op = ops[opIndex];
                let act = tool === 'table' ? 'table' : tool === 'table_edit' ? 'table_edit' : tool === 'manage_skill' ? 'manage_skill' : tool === 'view_code' ? 'view_code' : (op.action || tool);

                // Buat actionId untuk operasi yang didukung undo
                if (['replace', 'insert'].includes(act)) {
                  op.actionId = OfficeBridge.generateId();
                  actionIdsForUndo.push(op.actionId);
                }

                if (act === 'replace') { await OfficeBridge.searchAndReplaceSelection([op]); executedCount.replace++; }
                else if (act === 'comment') { await OfficeBridge.addCommentSelection([op]); executedCount.comment++; }
                else if (act === 'highlight') { await OfficeBridge.highlightSelection([op]); executedCount.highlight++; }
                else if (act === 'insert') { await OfficeBridge.insertTextAtTarget([op]); executedCount.insert++; }
                else if (act === 'format') { await OfficeBridge.formatSelection([op]); executedCount.format++; }
                else if (act === 'delete') { await OfficeBridge.deleteSelection([op]); executedCount.delete++; }
                else if (act === 'table') { await OfficeBridge.insertTableSelection(op); executedCount.table++; }
                else if (act === 'table_edit') { await OfficeBridge.editTableSelection([op]); executedCount.table_edit++; }
                else if (act === 'manage_skill') {
                  if (op.action === 'delete') {
                    if (op.id) await ApiClient.skills.remove(op.id);
                  } else if (op.action === 'update') {
                    if (op.id) {
                      await ApiClient.skills.update(op.id, {
                          name: op.name,
                          description: op.description || 'Dibuat otomatis oleh AI',
                          prompt_injection: op.prompt_injection,
                          is_active: true
                      });
                    }
                  } else {
                    await ApiClient.skills.add({
                        name: op.name,
                        description: op.description || 'Dibuat otomatis oleh AI',
                        prompt_injection: op.prompt_injection,
                        is_active: true
                    });
                  }
                  if (window.SkillsManager) window.SkillsManager.loadSkills();
                  executedCount.manage_skill++;
                }
                else if (act === 'view_code') {
                  if (hasExecutedViewCode) continue;
                  hasExecutedViewCode = true;

                  // Kumpulkan semua ops view_code (multi-file support)
                  const viewOps = ops.filter(o => (o.action || tool) === 'view_code');
                  const filesToRead = viewOps.map(o => ({
                    path: o.path,
                    startLine: o.start_line || o.startLine || undefined,
                    endLine: o.end_line || o.endLine || undefined,
                    label: o.label || o.path
                  }));

                  try {
                    const res = await fetch('http://localhost:3001/system/view-code-multi', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ files: filesToRead })
                    });
                    const data = await res.json();
                    if (res.ok && data.results) {
                      let reportText = `[SYSTEM AUTO-REPORT] Tool 'view_code' berhasil membaca ${data.results.length} file:\n\n`;
                      let successCount = 0;
                      for (const result of data.results) {
                        if (result.error) {
                          reportText += `### ❌ ${result.path}\nError: ${result.error}\n\n`;
                        } else {
                          successCount++;
                          const MAX_PER_FILE = 8000;
                          let content = result.content;
                          if (content.length > MAX_PER_FILE) {
                            content = content.substring(0, MAX_PER_FILE) + `\n... [DIPOTONG — gunakan startLine/endLine untuk membaca bagian berikutnya] ...`;
                          }
                          reportText += `### 📄 ${result.label || result.path} (${result.lines})\n\`\`\`\n${content}\n\`\`\`\n\n`;
                        }
                      }
                      reportText += `Berdasarkan kode di atas, berikan analisis dan solusi perbaikannya. Jika ada bagian kode yang terpotong, gunakan 'view_code' lagi dengan 'start_line' dan 'end_line' untuk membaca bagian selanjutnya.`;
                      toolMsg += `🔍 Membaca ${successCount}/${data.results.length} file berhasil. `;
                      setTimeout(() => {
                        els.input.value = reportText;
                        if (els.btnSend) els.btnSend.click();
                      }, 800);
                    } else {
                      toolMsg += `❌ Gagal membaca file: ${data.error || 'Unknown error'}. `;
                    }
                  } catch (e) {
                    toolMsg += `❌ Error view_code: ${e.message}. `;
                  }
                }
                
                // Beri jeda 1.2 detik antar eksekusi jika operasi lebih dari satu, agar terlihat natural
                if (ops.length > 1 && opIndex < ops.length - 1) {
                  await new Promise(r => setTimeout(r, 1200));
                }
              }

              // Susun pesan status berdasarkan rekap
              if (executedCount.replace) toolMsg += '✨ Berhasil menerapkan perbaikan. ';
              if (executedCount.comment) toolMsg += '💬 Berhasil menambahkan komentar. ';
              if (executedCount.highlight) toolMsg += '🖍️ Berhasil menandai teks. ';
              if (executedCount.insert) toolMsg += '➕ Berhasil menyisipkan teks. ';
              if (executedCount.format) toolMsg += '🎨 Berhasil mengubah format. ';
              if (executedCount.delete) toolMsg += '🗑️ Berhasil menghapus teks. ';
              if (executedCount.table) toolMsg += '📊 Berhasil membuat tabel. ';
              if (executedCount.table_edit) toolMsg += '📝 Berhasil memodifikasi tabel. ';
              if (executedCount.manage_skill) toolMsg += '🧠 Berhasil membuat rule/skill permanen. ';

              // Tambahkan tombol Undo jika ada operasi yang mendukung
              if (actionIdsForUndo.length > 0) {
                const idsStr = actionIdsForUndo.join(',');
                toolMsg += `<button onclick="window.undoAIActions(this, '${idsStr}')" style="margin-left:8px; background:transparent; border:1px solid currentColor; color:inherit; font-size:10px; padding:2px 6px; border-radius:4px; cursor:pointer;">↩️ Undo</button>`;
              }

            } else {
              toolMsg = '⚠️ Aksi membutuhkan "Live Edit" aktif.';
            }
            if (toolMsg) finalHtml += '<div style="color:var(--primary);font-size:11px;padding:5px;background:var(--surface);border-radius:4px;margin-top:8px;display:flex;align-items:center;justify-content:space-between;">' + toolMsg + '</div>';
          } catch (e) {
            finalHtml += '<div style="color:var(--error);font-size:11px;padding:5px;background:var(--surface);border-radius:4px;margin-top:8px;">⚠️ Gagal mengeksekusi tool: ' + e.message + ' — 🔍 Membaca kode sumber untuk analisis otomatis...</div>';

            // Auto view_code: baca file relevan secara otomatis untuk membantu AI self-healing
            setTimeout(async () => {
              if (!els.input) return;
              try {
                // Deteksi file relevan berdasarkan pesan error
                const errMsg = e.message || '';
                const filesToDiagnose = [
                  { path: 'frontend/assets/js/office-bridge.js', startLine: 1, endLine: 160, label: 'office-bridge (stream & insert)' },
                ];
                // Tambah file tambahan jika error terkait pencarian/replace
                if (errMsg.includes('search') || errMsg.includes('range') || errMsg.includes('find') || errMsg.includes('replace')) {
                  filesToDiagnose.push({ path: 'frontend/assets/js/office-bridge.js', startLine: 161, endLine: 450, label: 'office-bridge (search & replace)' });
                }
                if (errMsg.includes('table')) {
                  filesToDiagnose.push({ path: 'frontend/assets/js/office-bridge.js', startLine: 450, endLine: 700, label: 'office-bridge (table ops)' });
                }

                const res = await fetch('http://localhost:3001/system/view-code-multi', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ files: filesToDiagnose })
                });
                const data = await res.json();
                let report = `[SYSTEM AUTO-DIAGNOSIS] Tool '${tool}' gagal dengan error: "${errMsg}"\n\nBerikut kode sumber file yang relevan untuk analisis:\n\n`;
                if (res.ok && data.results) {
                  for (const r of data.results) {
                    if (!r.error) {
                      let content = r.content;
                      if (content.length > 6000) content = content.substring(0, 6000) + '\n... [DIPOTONG]';
                      report += `### 📄 ${r.label || r.path} (${r.lines})\n\`\`\`javascript\n${content}\n\`\`\`\n\n`;
                    }
                  }
                }
                report += `Berdasarkan kode di atas dan error "${errMsg}", jelaskan penyebab kegagalan dan berikan solusi perbaikan. Jika perlu membaca bagian file lain, gunakan tool 'view_code' dengan 'start_line' dan 'end_line'.`;
                els.input.value = report;
                if (els.btnSend) els.btnSend.click();
              } catch (fetchErr) {
                // Fallback to simple prompt if fetch fails
                els.input.value = `[SYSTEM AUTO-REPORT] Gagal mengeksekusi tool '${tool}'. Error: ${e.message}\nGunakan tool 'view_code' dengan banyak file (multi-path) untuk menganalisis penyebabnya, lalu berikan solusi perbaikan.`;
                if (els.btnSend) els.btnSend.click();
              }
            }, 1500);
          }

        }

        // Handle Auto-Followup for long texts or chained tools
        if (parsed.needs_followup === true && !hasExecutedViewCode) {
          finalHtml += '<div style="color:var(--secondary);font-size:11px;padding:5px;background:var(--surface);border-radius:4px;margin-top:8px;">⏳ Memproses kelanjutan otomatis...</div>';
          setTimeout(() => {
            if (els.input) {
              els.input.value = `[SYSTEM AUTO-REPORT] Lanjutkan proses Anda sebelumnya dengan presisi. Jangan ulangi teks yang sudah Anda tulis.`;
              if (els.btnSend) els.btnSend.click();
            }
          }, 1500);
        }

        // Stop live stream FIRST (flush remaining text to Word) before showing status
        if (els.ctxLive && els.ctxLive.checked && hasStartedWordStream) {
          await OfficeBridge.stopLiveStream();
          const actionId = OfficeBridge.generateId();
          OfficeBridge.addUndoRecord(actionId, 'insert', { inserted_text: finalStreamText });
          
          finalHtml += `<div style="color:var(--accent);font-size:11px;padding:5px 8px;background:rgba(99,102,241,0.08);border:1px solid rgba(99,102,241,0.25);border-radius:4px;margin-top:8px;display:flex;align-items:center;justify-content:space-between;gap:6px;">
            <span>✍️ Teks berhasil ditulis ke dokumen Word.</span>
            <button onclick="window.undoAIActions(this, '${actionId}')" style="background:transparent; border:1px solid currentColor; color:inherit; font-size:10px; padding:2px 6px; border-radius:4px; cursor:pointer;">↩️ Undo</button>
          </div>`;
        }

        bubble.innerHTML = finalHtml;
      } else {
        bubble.innerHTML += `<div style="color:var(--error);font-size:11px;padding:5px;background:var(--surface);border-radius:4px;margin-top:8px;">⚠️ Gagal parsing JSON respons AI.<br/>Reason: ${parseError}</div>`;
        // Auto-Feedback loop dinonaktifkan untuk mencegah infinite loop akibat JSON tidak valid
      }


    } catch (err) {
      if (err.name === 'AbortError' || err.message.includes('aborted')) {
        showToast('Generasi dihentikan', 'info');
      } else {
        bubble.textContent = 'Error: ' + err.message;
        bubble.style.color = 'var(--error)';
      }
    } finally {
      isGenerating = false;
      abortController = null;
      els.btnSend.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>';
      els.btnSend.classList.remove('text-danger');
      els.btnSend.disabled = false;
      els.input.focus();

      if (els.ctxLive && els.ctxLive.checked && hasStartedWordStream) {
        // Use Promise.race to prevent Word.run from hanging the background process forever
        try {
          await Promise.race([
            OfficeBridge.stopLiveStream(),
            new Promise(r => setTimeout(r, 2000))
          ]);
        } catch (e) { }
      }
    }
  }

  // ── JSON Debugger ─────────────────────────────────────────
  (function initJsonDebugger() {
    const btnDebug = document.getElementById('btn-debug-json');
    const modal = document.getElementById('json-debug-modal');
    const btnClose = document.getElementById('btn-close-json-debug');
    const btnCancel = document.getElementById('btn-json-debug-cancel');
    const btnExecute = document.getElementById('btn-json-debug-execute');

    const input = document.getElementById('json-debug-input');
    const errEl = document.getElementById('json-debug-error');
    const dryRunEl = document.getElementById('json-debug-dryrun');
    const historySelect = document.getElementById('json-debug-history');
    const btnHistoryLoad = document.getElementById('btn-json-history-load');

    const previewWrap = document.getElementById('json-debug-preview');
    const previewTool = document.getElementById('json-debug-preview-tool');
    const previewCount = document.getElementById('json-debug-preview-count');

    const HISTORY_KEY = 'autobib_json_debug_history_v1';
    const HISTORY_LIMIT = 5;

    let history = [];

    function safeStringify(obj) {
      return JSON.stringify(obj, null, 2);
    }

    function loadHistory() {
      try {
        const raw = localStorage.getItem(HISTORY_KEY);
        history = raw ? JSON.parse(raw) : [];
      } catch (e) { history = []; }

      if (!historySelect) return;
      historySelect.innerHTML = '<option value="">— pilih payload —</option>';
      history.forEach((h, idx) => {
        const opt = document.createElement('option');
        opt.value = String(idx);
        const tool = h.tool || 'tool=none';
        const count = Array.isArray(h.operations) ? h.operations.length : 0;
        opt.textContent = `${idx === 0 ? '★' : ''} ${tool} (${count})`;
        historySelect.appendChild(opt);
      });

      // default select first loaded item
      if (history.length > 0) {
        historySelect.value = '0';
      }
    }

    function saveHistory(payloadObj) {
      // payloadObj is parsed json (object or array)
      const parsed = normalizePayload(payloadObj);
      if (!parsed) return;

      const entry = {
        tool: parsed.tool || 'none',
        operations: parsed.operations || [],
        raw: parsed.rawString || safeStringify(payloadObj),
        ts: Date.now(),
      };

      history.unshift(entry);
      // dedupe by raw string
      history = history.filter((h, i, arr) => arr.findIndex(x => x.raw === h.raw) === i);
      history = history.slice(0, HISTORY_LIMIT);

      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
      } catch (e) { }

      loadHistory();
    }

    function normalizePayload(payload) {
      // Accept:
      // 1) { tool, operations }
      // 2) { operations: [...] }
      // 3) [ {action:...}, ... ]
      // 4) { action:..., ... } (single op)
      let tool = 'none';
      let operations = [];
      let rawString = null;

      if (typeof payload === 'string') return null;

      if (Array.isArray(payload)) {
        operations = payload;
      } else if (payload && typeof payload === 'object') {
        tool = payload.tool || payload.action || payload.type || 'none';
        if (Array.isArray(payload.operations)) operations = payload.operations;
        else if (Array.isArray(payload.ops)) operations = payload.ops;
        else if (payload.action && (payload.after || payload.before || payload.find || payload.insert || payload.replace || payload.delete || payload.text || payload.location)) {
          operations = [payload];
        }
        rawString = safeStringify(payload);
      }

      if (!operations) operations = [];
      if (!Array.isArray(operations)) operations = [operations];

      // Normalize 'find' key if missing but other anchor fields exist
      operations.forEach(op => {
        if (!op || typeof op !== 'object') return;
        if (!op.find && (op.text_selection || op.location || op.target || op.text)) {
          op.find = op.text_selection || op.location || op.target || op.text;
        }
      });

      return { tool, operations, rawString };
    }

    function showError(message) {
      if (!errEl) return;
      errEl.textContent = message;
      errEl.classList.remove('hidden');
    }

    function hideError() {
      if (!errEl) return;
      errEl.textContent = '';
      errEl.classList.add('hidden');
    }

    function showPreview(tool, opsCount) {
      if (!previewWrap || !previewTool || !previewCount) return;
      previewTool.textContent = tool || 'none';
      previewCount.textContent = String(opsCount ?? 0);
      previewWrap.style.display = 'block';
    }

    function hidePreview() {
      if (!previewWrap) return;
      previewWrap.style.display = 'none';
    }

    function tryParse(raw) {
      // raw should be JSON string
      const trimmed = raw.trim();
      if (!trimmed) return null;

      // Most payloads are JSON objects/arrays. We'll parse strictly but with minor healing.
      try {
        return JSON.parse(trimmed);
      } catch (e1) {
        // attempt healer: extract first {...} or [...] block
        const mObj = trimmed.match(/\{[\s\S]*\}/);
        const mArr = trimmed.match(/\[[\s\S]*\]/);
        const pick = (mObj && (!mArr || mObj.index <= mArr.index)) ? mObj[0] : (mArr ? mArr[0] : trimmed);
        if (!pick || pick === trimmed) throw e1;
        return JSON.parse(pick);
      }
    }

    async function executeOperations(operations, tool) {
      // tool is default, but each op.action may override.
      // Dry-run already handled by caller.
      const toolOr = tool || 'none';

      const isTableLike = (x) => x === 'table' || x === 'table_edit';

      // Support both array-of-ops and single ops
      for (let op of operations) {
        if (!op || typeof op !== 'object') continue;

        const act = toolOr === 'table'
          ? 'table'
          : toolOr === 'table_edit'
            ? 'table_edit'
            : (op.action || toolOr);

        // Fix for Word anchor targeting: for inserts, if payload tries to insert
        // relative to a table (target_type: 'table'), Word can end up targeting
        // the table node instead of the paragraph after/before it.
        // We normalize it to paragraph unless the op explicitly sets a paragraph/table target.
        if (act === 'insert' && op.target_type === 'table') {
          op = { ...op, target_type: 'paragraph' };
        }

        if (act === 'replace') {
          await OfficeBridge.searchAndReplaceSelection([op]);
        } else if (act === 'comment') {
          await OfficeBridge.addCommentSelection([op]);
        } else if (act === 'highlight') {
          await OfficeBridge.highlightSelection([op]);
        } else if (act === 'insert') {
          await OfficeBridge.insertTextAtTarget([op]);
        } else if (act === 'format') {
          await OfficeBridge.formatSelection([op]);
        } else if (act === 'delete') {
          await OfficeBridge.deleteSelection([op]);
        } else if (act === 'table') {
          await OfficeBridge.insertTableSelection(op);
        } else if (act === 'table_edit') {
          await OfficeBridge.editTableSelection([op]);
        } else if (act === 'view_code') {
          throw new Error("Tool 'view_code' tidak didukung di Debugger Manual. Gunakan AI tool biasa atau tambahkan mapping sendiri.");
        }
      }
    }

    async function onExecute() {
      hideError();

      const raw = input ? input.value.trim() : '';
      if (!raw) {
        showError('JSON tidak boleh kosong.');
        return;
      }

      let parsedObj = null;
      try {
        parsedObj = tryParse(raw);
      } catch (e) {
        showError('Error parsing JSON: ' + e.message);
        return;
      }

      const normalized = normalizePayload(parsedObj);
      if (!normalized || !Array.isArray(normalized.operations)) {
        showError('Payload JSON tidak dikenali. Format: {"tool":"...","operations":[...]} atau array operations.');
        return;
      }

      showPreview(normalized.tool, normalized.operations.length);

      if (dryRunEl && dryRunEl.checked) {
        if (normalized.operations.length === 0) {
          showError('Dry-run: operasi kosong.');
        }
        // still save to history
        saveHistory(parsedObj);
        return;
      }

      // Execute
      try {
        if (normalized.operations.length === 0) {
          showError('Tidak ada operations untuk dieksekusi.');
          return;
        }
        await executeOperations(normalized.operations, normalized.tool);
        saveHistory(parsedObj);
        if (modal) modal.classList.add('hidden');
        if (window.showToast) window.showToast('Manual JSON dieksekusi!', 'success');
      } catch (e) {
        showError('Error eksekusi: ' + e.message);
      }
    }

    // Bind UI
    btnDebug && btnDebug.addEventListener('click', () => {
      if (!modal) return;
      modal.classList.remove('hidden');
      hideError();
      hidePreview();
      if (historySelect && historySelect.value === '0') {
        // keep user input
      }
      if (input) input.focus();
    });

    const closeFn = () => { if (modal) modal.classList.add('hidden'); hideError(); };
    btnClose && btnClose.addEventListener('click', closeFn);
    btnCancel && btnCancel.addEventListener('click', closeFn);

    btnExecute && btnExecute.addEventListener('click', onExecute);

    btnHistoryLoad && btnHistoryLoad.addEventListener('click', () => {
      if (!historySelect || !input) return;
      const idx = historySelect.value;
      if (idx === '') return;
      const i = parseInt(idx, 10);
      const entry = history[i];
      if (!entry) return;
      input.value = entry.raw;
      hideError();
      hidePreview();
      input.focus();
    });

    // Auto-update preview (optional) on edit
    if (input) {
      input.addEventListener('input', () => {
        hideError();
        hidePreview();
        const raw = input.value.trim();
        if (!raw) return;
        try {
          const parsed = tryParse(raw);
          const norm = normalizePayload(parsed);
          showPreview(norm.tool, norm.operations.length);
        } catch (e) {
          // ignore preview errors while typing
        }
      });
    }

    loadHistory();
  })();

  loadSessions();
};

