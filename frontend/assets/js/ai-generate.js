/* ═══════════════════════════════════════════════════════════
   ai-generate.js — AI Streaming and Insert to Word UI
   ═══════════════════════════════════════════════════════════ */

window.initAiGenerate = () => {
  const els = {
    queueList: document.getElementById('queue-list'),
    queueCount: document.getElementById('queue-count'),
    modeSelect: document.getElementById('generate-mode'),
    customRow: document.getElementById('custom-prompt-row'),
    customPrompt: document.getElementById('custom-prompt'),
    btnGenerate: document.getElementById('btn-generate'),
    
    outputPanel: document.getElementById('generate-output'),
    outputText: document.getElementById('output-text'),
    loadingPanel: document.getElementById('generate-loading'),
    rotationNotice: document.getElementById('key-rotation-notice'),
    rotationMsg: document.getElementById('rotation-msg'),
    
    btnCopy: document.getElementById('btn-copy'),
    btnRegenerate: document.getElementById('btn-regenerate'),
    btnInsert: document.getElementById('btn-insert-word'),
  };

  let queue = [];
  let generatedCitation = null; // holds OOXML string for citation if generated

  // ── Queue Management ──────────────────────────────────────
  window.addToQueue = async (refs) => {
    // avoid duplicates
    refs.forEach(r => {
      if (!queue.find(q => q.id === r.id)) queue.push(r);
    });
    renderQueue();
    
    // Auto-fetch abstracts if missing
    for (let i = 0; i < queue.length; i++) {
      if (!queue[i].abstract) {
        try {
          const detail = await ApiClient.mendeley.document(queue[i].id);
          queue[i].abstract = detail.document.abstract || 'No abstract available.';
        } catch {
          queue[i].abstract = 'No abstract available.';
        }
      }
    }
  };

  function renderQueue() {
    els.queueCount.textContent = queue.length;
    if (queue.length === 0) {
      els.queueList.innerHTML = '<div class="empty-queue">Belum ada referensi. Pilih dari tab Referensi.</div>';
      els.btnGenerate.disabled = true;
      return;
    }

    els.btnGenerate.disabled = false;
    els.queueList.innerHTML = '';
    queue.forEach(ref => {
      const div = document.createElement('div');
      div.className = 'queue-item';
      
      const title = ref.title || 'Untitled';
      const author = ref.authors?.[0]?.last_name || 'Unknown';
      const year = ref.year || 'n.d.';
      
      div.innerHTML = `
        <div class="queue-item-title" title="${title}">${author} (${year}) - ${title}</div>
        <button class="queue-remove" title="Hapus">✕</button>
      `;
      
      div.querySelector('.queue-remove').addEventListener('click', () => {
        queue = queue.filter(r => r.id !== ref.id);
        renderQueue();
      });
      
      els.queueList.appendChild(div);
    });
  }

  els.modeSelect.addEventListener('change', (e) => {
    if (e.target.value === 'custom') {
      els.customRow.classList.remove('hidden');
    } else {
      els.customRow.classList.add('hidden');
    }
  });

  // ── AI Generation (SSE) ───────────────────────────────────
  async function doGenerate() {
    if (queue.length === 0) return;
    
    els.btnGenerate.disabled = true;
    els.outputPanel.classList.add('hidden');
    els.loadingPanel.classList.remove('hidden');
    els.rotationNotice.classList.add('hidden');
    els.outputText.innerHTML = '';
    generatedCitation = null;

    const req = {
      abstracts: queue.map(r => r.abstract).filter(Boolean),
      mode: els.modeSelect.value,
      custom_prompt: els.modeSelect.value === 'custom' ? els.customPrompt.value : '',
    };

    try {
      await ApiClient.generateStream(req, {
        onChunk: (text) => {
          els.loadingPanel.classList.add('hidden');
          els.outputPanel.classList.remove('hidden');
          // replace newlines with <br> and append
          els.outputText.innerHTML += text.replace(/\\n/g, '<br>');
          els.outputText.scrollTop = els.outputText.scrollHeight;
        },
        onKeyRotated: (info) => {
          els.rotationNotice.classList.remove('hidden');
          els.rotationMsg.textContent = `Auto-rotate: dari "${info.from}" ke "${info.to}" (Limit habis)`;
        },
        onDone: () => {
          els.btnGenerate.disabled = false;
          generateCitationField(); // prepare Word field code silently
        },
        onError: (err) => {
          showToast(`Error: ${err.message}`, 'error');
          els.loadingPanel.classList.add('hidden');
          els.btnGenerate.disabled = false;
        }
      });
    } catch (err) {
      showToast('Gagal menghubungi AI', 'error');
      els.loadingPanel.classList.add('hidden');
      els.btnGenerate.disabled = false;
    }
  }

  els.btnGenerate.addEventListener('click', doGenerate);
  els.btnRegenerate.addEventListener('click', doGenerate);

  els.btnCopy.addEventListener('click', () => {
    navigator.clipboard.writeText(els.outputText.innerText);
    showToast('Teks disalin', 'success');
  });

  // ── Word Field Integration ────────────────────────────────
  async function generateCitationField() {
    if (queue.length === 0) return;
    try {
      // First convert Mendeley raw format to format expected by Citation service
      const res = await ApiClient.citation.format(queue.map(q => ({
        title: q.title,
        author: (q.authors || []).map(a => ({ family: a.last_name, given: a.first_name })),
        issued: { 'date-parts': [[q.year]] }
      })), 'apa');
      
      // Then ask smart-citation to build OOXML (simulating grouped citation)
      const fieldRes = await ApiClient.smartCitation.buildField({
        csl_json: res.formatted[0], // simplified for now, usually needs grouped itemData
        formatted_citation: res.formatted.map(f => f.inline).join('; ')
      });
      generatedCitation = fieldRes.ooxml;
    } catch (err) {
      console.warn('Failed to build OOXML field', err);
    }
  }

  els.btnInsert.addEventListener('click', async () => {
    if (!OfficeBridge.isOfficeReady()) return showToast('Office.js tidak aktif', 'error');
    
    // Insert text first
    await OfficeBridge.insertText(els.outputText.innerText + ' ');
    
    // Then insert citation field if generated
    if (generatedCitation) {
      await OfficeBridge.insertOoxml(generatedCitation);
      showToast('Teks dan sitasi dimasukkan', 'success');
    } else {
      showToast('Teks dimasukkan', 'success');
    }
  });
};
