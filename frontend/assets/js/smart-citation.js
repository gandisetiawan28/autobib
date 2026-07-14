/* ═══════════════════════════════════════════════════════════
   smart-citation.js — Smart Citation Parser & Resolver UI
   ═══════════════════════════════════════════════════════════ */

window.initSmartCitation = () => {
  const els = {
    tabs: document.querySelectorAll('.smart-tab'),
    panels: document.querySelectorAll('.smart-panel'),
    inputMode: document.getElementById('smart-citation-input'),
    btnParse: document.getElementById('btn-parse-citations'),
    btnScan: document.getElementById('btn-scan-doc'),
    
    resultsWrap: document.getElementById('smart-results'),
    resultsList: document.getElementById('smart-results-list'),
    resultsCount: document.getElementById('smart-results-count'),
    btnConvertAll: document.getElementById('btn-convert-all'),
    btnConvertAll: document.getElementById('btn-convert-all'),
    log: document.getElementById('convert-log'),
    processLog: document.getElementById('process-log'),
    
    loading: document.getElementById('smart-loading')
  };

  let citations = []; // Array of { originalText, parsedData, resolvedData, ooxml }

  // ── Tab Switching ─────────────────────────────────────────
  els.tabs.forEach(t => t.addEventListener('click', () => {
    els.tabs.forEach(x => x.classList.remove('active'));
    els.panels.forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    document.getElementById(`smart-panel-${t.dataset.smart}`).classList.add('active');
  }));

  // ── Phase 1: Parse & Resolve ──────────────────────────────
  function logProcess(msg) {
    if (!els.processLog) return;
    const div = document.createElement('div');
    div.textContent = `> ${msg}`;
    els.processLog.appendChild(div);
    els.processLog.scrollTop = els.processLog.scrollHeight;
  }

  async function processCitationTexts(texts) {
    if (texts.length === 0) return showToast('Tidak ada teks untuk diproses', 'warning');
    
    els.processLog.innerHTML = '';
    logProcess(`Memproses ${texts.length} sitasi yang ditemukan...`);
    
    els.loading.classList.remove('hidden');
    const loadText = els.loading.querySelector('.loading-text');
    if (loadText) loadText.textContent = 'Mencari metadata referensi...';
    
    els.resultsWrap.classList.add('hidden');
    citations = texts.map(t => {
      if (typeof t === 'string') return { originalText: t };
      return {
        originalText: t.originalText !== undefined ? t.originalText : (t.text || ''),
        glued: t.glued,
        items: t.items
      };
    });
    
    try {
      // 1. Fast Local Parsing via Regex (Bypasses AI if successful)
      const parsedPayload = citations.map(c => {
        // If it was already parsed by the 1-stage AI, just use it!
        if (c.items && c.items.length > 0) {
          return { raw_text: c.originalText, items: c.items, alreadyParsed: true };
        }
        
        let author = null, year = null;
        // Strip out brackets and search for Author, Year
        const rawText = c.originalText.replace(/[()]/g, '');
        const mYear = rawText.match(/(\d{4})/);
        const mAuthor = rawText.match(/([A-Z][A-Za-z-]+(?:\s+(?:et\s+al\.|&|dan|and)\s+[A-Z][A-Za-z-]+)*)/);
        const isComplex = /\b(?:dalam|dikutip|in)\b/i.test(c.originalText);
        
        if (mYear && mAuthor && !isComplex) {
          author = mAuthor[1].replace(/\s+(et al\.?|dkk\.?)/gi, '');
          year = mYear[1];
        }
        
        return {
          raw_text: c.originalText,
          items: author && year ? [{ author, year }] : [],
          alreadyParsed: false
        };
      });

      const successfulLocal = parsedPayload.filter(p => p.items.length > 0);
      logProcess(`Berhasil memecah ${successfulLocal.length} sitasi secara instan (Lokal).`);

      // Find which ones failed regex parsing and need AI (now bypassed because AI did it all)
      const needsAIParsing = parsedPayload.filter(p => p.items.length === 0 && !p.alreadyParsed);
      if (needsAIParsing.length > 0) {
        // Deduplicate to save AI tokens and improve accuracy
        const uniqueTexts = [...new Set(needsAIParsing.map(p => p.raw_text))];
        logProcess(`Mengirim ${uniqueTexts.length} sitasi unik kompleks ke AI untuk dibedah...`);
        if (loadText) loadText.textContent = `Meminta bantuan AI untuk memecah ${uniqueTexts.length} sitasi rumit...`;
        const aiRes = await ApiClient.smartCitation.parse(uniqueTexts);
        
        // Merge AI results back into parsedPayload
        if (aiRes.parsed && Array.isArray(aiRes.parsed)) {
          aiRes.parsed.forEach(aiItem => {
            const targets = parsedPayload.filter(p => p.raw_text === aiItem.raw_text);
            targets.forEach(target => target.items = aiItem.items);
          });
        }
        logProcess(`AI berhasil memecah ${aiRes.parsed?.length || 0} sitasi kompleks.`);
      }
      
      parsedPayload.forEach((p, i) => citations[i].parsedData = p);

      if (loadText) loadText.textContent = 'Mencari metadata jurnal (Semantic Scholar/Mendeley)...';
      logProcess(`Mencocokkan ${parsedPayload.length} sitasi ke database jurnal (Mendeley/Semantic Scholar)...`);
      
      // 2. Metadata Resolver (Batched for live logging)
      const batchSize = 15;
      for (let i = 0; i < parsedPayload.length; i += batchSize) {
        const batch = parsedPayload.slice(i, i + batchSize);
        const start = i + 1;
        const end = Math.min(i + batchSize, parsedPayload.length);
        logProcess(`... Memeriksa sitasi ${start} - ${end} dari ${parsedPayload.length}`);
        
        const resolveRes = await ApiClient.smartCitation.resolve(batch);
        
        // Log individual results
        resolveRes.resolved.forEach((r, j) => {
          citations[i + j].resolvedData = r;
          const status = r.items && r.items[0] ? r.items[0].status : 'unknown';
          const source = r.items && r.items[0] ? r.items[0].source : 'unknown';
          const title = (r.items && r.items[0] && r.items[0].csl_json && r.items[0].csl_json.title) || batch[j].raw_text;
          const shortTitle = title.length > 40 ? title.substring(0, 40) + '...' : title;
          
          let logIcon = '⏳';
          if (status === 'found') logIcon = '✅';
          else if (status === 'partial') logIcon = '⚠️';
          
          logProcess(`  ${logIcon} ${shortTitle} [${source}]`);
        });
      }
      
      // 3. Build OOXML for each
      for (let i = 0; i < citations.length; i++) {
        const item = citations[i];
        if (item.resolvedData && item.resolvedData.items && item.resolvedData.items.length > 0) {
          const fieldRes = await ApiClient.smartCitation.buildField({
            items: item.resolvedData.items,
            formatted_citation: item.originalText
          });
          item.ooxml = fieldRes.ooxml;
          item.inline = fieldRes.inline;
          item.base64Data = fieldRes.base64Data;
        }
      }
      
      renderResults();
    } catch (err) {
      showToast('Gagal memproses sitasi: ' + err.message, 'error');
    } finally {
      els.loading.classList.add('hidden');
    }
  }

  els.btnParse.addEventListener('click', () => {
    const raw = els.inputMode.value.split('\n').map(t => t.trim()).filter(Boolean);
    processCitationTexts(raw);
  });

  els.btnScan.addEventListener('click', async () => {
    if (!OfficeBridge.isOfficeReady()) return showToast('Harus dijalankan di dalam Word', 'warning');
    
    els.loading.classList.remove('hidden');
    if (els.processLog) els.processLog.innerHTML = '';
    const loadText = els.loading.querySelector('.loading-text');
    if (loadText) loadText.textContent = 'Memindai dokumen dengan AI (1 Tahap)...';
    logProcess('Menarik seluruh teks dokumen...');
    
    try {
      const fullText = await OfficeBridge.getAllText();
      if (!fullText || fullText.trim() === '') {
        els.loading.classList.add('hidden');
        return showToast('Dokumen kosong', 'warning');
      }

      logProcess('Mengirim seluruh teks ke AI untuk diekstrak dan dibedah sekaligus...');
      const extractRes = await ApiClient.smartCitation.extractFull(fullText);
      const found = extractRes.citations || []; // This is now an array of { raw_text, items }
      
      logProcess(`Selesai memindai. AI menemukan dan membedah ${found.length} sitasi.`);
      if (found.length === 0) {
        els.loading.classList.add('hidden');
        return showToast('Tidak ditemukan sitasi di dokumen', 'info');
      }
      
      // Since it's already parsed, map it to the structure processCitationTexts expects
      const formattedCitations = found.map(f => ({
        originalText: f.raw_text,
        items: f.items || []
      }));
      
      processCitationTexts(formattedCitations);
    } catch (err) {
      els.loading.classList.add('hidden');
      showToast('Gagal memindai: ' + err.message, 'error');
      console.error(err);
    }
  });

  // ── Render Results ────────────────────────────────────────
  function renderResults() {
    els.resultsWrap.classList.remove('hidden');
    els.resultsCount.textContent = `${citations.length} sitasi diproses`;
    els.resultsList.innerHTML = '';
    
    citations.forEach(cit => {
      const div = document.createElement('div');
      div.className = 'smart-item';
      
      const items = cit.resolvedData?.items || [];
      const firstItem = items[0] || {};
      const st = firstItem.status || 'not_found';
      const source = firstItem.source || 'unknown';
      const csl = firstItem.csl_json || {};
      
      let badgeCls = 'loading';
      let badgeTxt = 'Gagal';
      if (st === 'found') { badgeCls = 'found'; badgeTxt = 'Lengkap'; }
      else if (st === 'partial') { badgeCls = 'partial'; badgeTxt = 'Parsial'; }
      
      let title = csl.title || firstItem.title || 'Unknown Title';
      if (items.length > 1) title = `[${items.length} Sitasi] ` + title;
      
      const author = csl.author?.[0]?.family || firstItem.author || 'Unknown';
      
      div.innerHTML = `
        <div class="smart-item-header">
          <span class="smart-item-title" title="${cit.originalText}">${cit.originalText}</span>
          <span class="status-badge ${badgeCls}">${badgeTxt}</span>
        </div>
        <div class="smart-item-meta">${author} (${csl.issued?.['date-parts']?.[0]?.[0] || 'n.d.'}) — ${title}</div>
        <div class="smart-item-source">Sumber metadata: ${source.toUpperCase()}</div>
      `;
      els.resultsList.appendChild(div);
    });
    
    els.btnConvertAll.disabled = !citations.some(c => c.ooxml);
  }

  // ── Phase 2: Convert to OOXML in Word ─────────────────────
  els.btnConvertAll.addEventListener('click', async () => {
    if (!OfficeBridge.isOfficeReady()) return showToast('Hanya berfungsi di dalam Word', 'error');
    
    els.btnConvertAll.disabled = true;
    els.log.classList.remove('hidden');
    els.log.innerHTML = '';
    
    let success = 0, fail = 0;
    
    for (const cit of citations) {
      if (!cit.ooxml) { fail++; continue; }
      
      try {
        const replaced = await OfficeBridge.replaceCitationWithField(cit.originalText, cit.base64Data, cit.inline, cit.glued);
        if (replaced) {
          success++;
          els.log.innerHTML += `<div>✅ Diganti: ${cit.originalText} → ${cit.inline}</div>`;
        } else {
          fail++;
          els.log.innerHTML += `<div>⚠️ Teks tidak ditemukan: ${cit.originalText}</div>`;
        }
      } catch (err) {
        fail++;
        els.log.innerHTML += `<div>❌ Error mengganti: ${cit.originalText}</div>`;
      }
    }
    
    showToast(`Selesai: ${success} berhasil, ${fail} gagal`, success > 0 ? 'success' : 'warning');
    els.btnConvertAll.disabled = false;
  });

  // ── DEBUG MENDELEY CITE ──────────────────────────────────
  const btnDebug = document.createElement('button');
  btnDebug.className = 'btn';
  btnDebug.textContent = 'Debug Mendeley Cite';
  btnDebug.style.marginTop = '10px';
  els.resultsWrap.appendChild(btnDebug);
  
  btnDebug.addEventListener('click', async () => {
    await Word.run(async (ctx) => {
      const body = ctx.document.body;
      const ooxml = body.getOoxml();
      await ctx.sync();
      
      const xml = ooxml.value;
      const match = xml.match(/<w:sdt>.*?<\/w:sdt>/s);
      if (match) {
        els.log.classList.remove('hidden');
        els.log.innerHTML = `<div style="text-align:left; word-break:break-all; font-size:10px; font-family:monospace;">${match[0].replace(/</g, '&lt;')}</div>`;
      } else {
        els.log.innerHTML = 'Tidak ada SDT ditemukan';
      }
    });
  });

  // ── Insert Bibliography ────────────────────────────────────
  const btnBib = document.createElement('button');
  btnBib.className = 'btn btn-primary';
  btnBib.textContent = 'Insert Bibliography (AutoBib)';
  btnBib.style.marginTop = '10px';
  btnBib.style.width = '100%';
  els.resultsWrap.appendChild(btnBib);

  btnBib.addEventListener('click', async () => {
    if (!OfficeBridge.isOfficeReady()) return showToast('Hanya berfungsi di dalam Word', 'error');
    btnBib.disabled = true;
    btnBib.textContent = 'Memindai dokumen...';
    try {
      // 1. Extract all citation data natively from Word
      const uniqueItems = await OfficeBridge.extractMendeleyCitations();
      if (!uniqueItems || uniqueItems.length === 0) {
        showToast('Tidak ada sitasi Mendeley yang ditemukan di dokumen.', 'warning');
        return;
      }
      
      btnBib.textContent = 'Menyusun Daftar Pustaka...';
      // 2. Send to backend to format as APA HTML
      const res = await ApiClient.citation.format(uniqueItems, 'apa');
      if (res && res.formatted) {
        const html = res.formatted.map(f => f.citation).join('\n');
        // 3. Insert into Word
        await OfficeBridge.insertBibliography(html);
        showToast(`Daftar pustaka (${uniqueItems.length} sumber) berhasil dimasukkan!`, 'success');
      }
    } catch (err) {
      console.error(err);
      showToast('Gagal membuat daftar pustaka: ' + err.message, 'error');
    } finally {
      btnBib.disabled = false;
      btnBib.textContent = 'Insert Bibliography (AutoBib)';
    }
  });
};
