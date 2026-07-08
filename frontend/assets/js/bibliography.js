/* ═══════════════════════════════════════════════════════════
   bibliography.js — Daftar Pustaka Tab Logic
   Auto-detects Mendeley citations, supports Live & Manual update
   ═══════════════════════════════════════════════════════════ */

window.initBibliography = () => {
  const els = {
    liveToggle:   document.getElementById('bib-live-toggle'),
    formatSelect: document.getElementById('bib-format-select'),
    btnScan:      document.getElementById('btn-scan-bib'),
    btnInsert:    document.getElementById('btn-insert-bib'),
    btnUpdate:    document.getElementById('btn-update-bib'),
    btnStrip:     document.getElementById('btn-strip-bib'),
    preview:      document.getElementById('bib-preview'),
    previewList:  document.getElementById('bib-preview-list'),
    count:        document.getElementById('bib-count'),
    liveBadge:    document.getElementById('bib-live-badge'),
    loading:      document.getElementById('bib-loading'),
    statusDot:    document.getElementById('bib-status-dot'),
    statusText:   document.getElementById('bib-status-text'),
  };

  let _cachedItems = [];
  let _liveInterval = null;
  let _bibInserted  = false; // Whether bibliography block exists in doc

  // ── Status Helpers ──────────────────────────────────────────
  function setStatus(text, type = 'idle') {
    els.statusText.textContent = text;
    els.statusDot.className = `bib-status-dot bib-status-${type}`;
  }

  // ── Core: Scan + Render Preview ─────────────────────────────
  async function scanAndRender() {
    if (!OfficeBridge.isOfficeReady()) {
      setStatus('Harus dijalankan di dalam Word', 'error');
      return;
    }
    els.loading.classList.remove('hidden');
    els.preview.classList.add('hidden');
    setStatus('Memindai dokumen...', 'scanning');

    try {
      // ── Step 1: Try reading native Mendeley / AutoBib Content Controls ──
      let items = await OfficeBridge.extractMendeleyCitations();
      
      _bibInserted = await OfficeBridge.hasBibliography();

      // ── Step 2: Fallback — scan plain text only if no Mendeley fields & no bibliography exist ──
      if (items.length === 0 && !_bibInserted) {
        setStatus('Mencari sitasi teks biasa...', 'scanning');
        const textCitations = await OfficeBridge.scanForCitations();

        if (textCitations.length === 0) {
          setStatus('Tidak ada sitasi ditemukan di dokumen', 'error');
          els.loading.classList.add('hidden');
          els.btnInsert.classList.add('hidden');
          els.btnUpdate.classList.add('hidden');
          return;
        }

        // Extract author names from citation text using regex (no AI needed)
        const authorYearRegex = /([A-Z][A-Za-z-]+(?:\s+(?:et\s+al\.|&|dan|and)\s+[A-Z][A-Za-z-]+)*)[,\s]+(?:dalam\s+)?([A-Z][A-Za-z-]+[^)]*)?(?:,\s*)?(\d{4})/;
        const searchTerms = new Set();
        textCitations.forEach(c => {
          const text = typeof c === 'string' ? c : c.text;
          // Strip connectors like "dalam X" to get the actual cited source
          const lastSource = text.split(/\s+(?:dalam|dikutip oleh|in)\s+/).pop();
          const m = lastSource.match(/(\d{4})/);
          const authorMatch = lastSource.match(/([A-Z][A-Za-z-]+)/);
          if (authorMatch) searchTerms.add(authorMatch[1] + (m ? ' ' + m[1] : ''));
        });

        setStatus(`Mencari ${searchTerms.size} referensi di Mendeley...`, 'scanning');

        // Search Mendeley directly for each unique author
        for (const term of searchTerms) {
          try {
            const res = await ApiClient.mendeley.search(term);
            if (res && res.documents && res.documents.length > 0) {
              // Pick the best match (first result usually most relevant)
              const doc = res.documents[0];
              // Convert Mendeley doc to CSL JSON-like structure
              const csl = {
                id: doc.id,
                title: doc.title,
                author: (doc.authors || []).map(a => ({ family: a.last_name, given: a.first_name })),
                issued: { 'date-parts': [[doc.year]] },
                'container-title': doc.source,
                volume: doc.volume,
                issue: doc.issue,
                page: doc.pages,
                DOI: doc.identifiers?.doi,
                publisher: doc.publisher,
                type: doc.type,
              };
              items.push(csl);
            }
          } catch (e) { console.warn('Mendeley search failed for:', term, e); }
        }

        // Deduplicate by id or title
        const seen = new Set();
        items = items.filter(it => {
          const key = it.id || it.DOI || it.title;
          if (!key || seen.has(key)) return false;
          seen.add(key); return true;
        });

        // Sort A-Z by first author
        items.sort((a, b) => {
          const na = a.author?.[0]?.family || a.author?.[0]?.literal || 'Z';
          const nb = b.author?.[0]?.family || b.author?.[0]?.literal || 'Z';
          return na.localeCompare(nb);
        });
      }

      _cachedItems = items;
      if (items.length === 0) {
        setStatus('Tidak ada sitasi di dokumen', 'success');
        els.loading.classList.add('hidden');
        els.btnInsert.classList.toggle('hidden', _bibInserted);
        els.btnUpdate.classList.toggle('hidden', !_bibInserted);
        if (_bibInserted) await buildAndInject('update'); // clear the bibliography
        return;
      }

      renderPreview(items);
      setStatus(`${items.length} sumber ditemukan`, 'success');
      els.btnInsert.classList.toggle('hidden', _bibInserted);
      els.btnUpdate.classList.toggle('hidden', !_bibInserted);
    } catch (err) {
      setStatus('Gagal memindai: ' + err.message, 'error');
      console.error(err);
    } finally {
      els.loading.classList.add('hidden');
    }
  }

  function renderPreview(items) {
    els.previewList.innerHTML = '';
    items.forEach((item, idx) => {
      const author  = item.author?.[0]?.family || item.author?.[0]?.literal || 'Unknown';
      const year    = item.issued?.['date-parts']?.[0]?.[0] ?? 'n.d.';
      const title   = item.title || 'Untitled';
      const journal = item['container-title'] || item.publisher || '';
      const div = document.createElement('div');
      div.className = 'bib-preview-item';
      div.innerHTML = `
        <span class="bib-num">${idx + 1}.</span>
        <div class="bib-item-body">
          <div class="bib-item-author">${author} (${year})</div>
          <div class="bib-item-title">${title}</div>
          ${journal ? `<div class="bib-item-journal">${journal}</div>` : ''}
        </div>`;
      els.previewList.appendChild(div);
    });
    els.count.textContent = `${items.length} referensi`;
    els.preview.classList.remove('hidden');
  }

  // ── Core: Build HTML from backend & Insert/Update ───────────
  async function buildAndInject(mode = 'insert') {
    if (_cachedItems.length === 0) {
      if (mode === 'update') {
        await OfficeBridge.updateBibliography(''); // Clear the bibliography
        return;
      }
      showToast('Pindai dulu dokumen sebelum insert', 'warning');
      return;
    }
    const format = els.formatSelect.value;
    try {
      setStatus('Menyusun daftar pustaka...', 'scanning');
      const res = await ApiClient.citation.format(_cachedItems, format);
      const html = res.formatted.map(f => f.citation).join('\n');

      if (mode === 'insert') {
        await OfficeBridge.insertBibliography(html);
        _bibInserted = true;
        els.btnInsert.classList.add('hidden');
        els.btnUpdate.classList.remove('hidden');
        showToast(`Daftar pustaka (${_cachedItems.length} sumber) berhasil dimasukkan!`, 'success');
      } else {
        await OfficeBridge.updateBibliography(html);
        showToast(`Daftar pustaka diperbarui (${_cachedItems.length} sumber)`, 'success');
      }
      setStatus(`${_cachedItems.length} referensi — ${format.toUpperCase()}`, 'success');
    } catch (err) {
      showToast('Gagal: ' + err.message, 'error');
      setStatus('Gagal menyusun daftar pustaka', 'error');
    }
  }

  // ── Live Update ─────────────────────────────────────────────
  function startLive() {
    if (_liveInterval) return;
    els.liveBadge.classList.remove('hidden');
    _liveInterval = setInterval(doLiveUpdate, 8000); // Poll every 8 seconds
    showToast('Live Update aktif — daftar pustaka akan diperbarui otomatis', 'info');
  }

  function stopLive() {
    if (_liveInterval) clearInterval(_liveInterval);
    _liveInterval = null;
    els.liveBadge.classList.add('hidden');
  }
  
  async function doLiveUpdate() {
    if (!_liveInterval) return;
    const items = await OfficeBridge.extractMendeleyCitations();
    // Only rebuild if citation count changed
    if (items.length !== _cachedItems.length) {
      _cachedItems = items;
      renderPreview(items);
      if (_bibInserted) await buildAndInject('update');
    }
  }

  window.addEventListener('autobib:citation_inserted', () => {
    if (_liveInterval) doLiveUpdate();
  });

  // ── Event Listeners ─────────────────────────────────────────
  els.btnScan.addEventListener('click', scanAndRender);

  els.btnInsert.addEventListener('click', async () => {
    await scanAndRender();
    if (_cachedItems.length > 0) await buildAndInject('insert');
  });

  els.btnUpdate.addEventListener('click', async () => {
    await scanAndRender();
    if (_cachedItems.length > 0) await buildAndInject('update');
  });

  els.liveToggle.addEventListener('change', () => {
    if (els.liveToggle.checked) startLive();
    else stopLive();
  });

  // Re-scan when format changes and preview is visible
  els.formatSelect.addEventListener('change', () => {
    if (_cachedItems.length > 0 && _bibInserted) buildAndInject('update');
  });

  // Strip citation formatting — keeps text, removes Content Control boxes
  els.btnStrip.addEventListener('click', async () => {
    if (!OfficeBridge.isOfficeReady()) return showToast('Hanya berfungsi di dalam Word', 'error');
    // window.confirm is not supported in Office Addins, so we proceed directly
    els.btnStrip.disabled = true;
    els.btnStrip.textContent = 'Menghapus format...';
    try {
      const result = await OfficeBridge.stripCitationFormatting();
      
      // Print debug logs to console
      if (result.debugLog) {
        console.group('AutoBib: Strip Formatting Debug Logs');
        result.debugLog.forEach(msg => console.log(msg));
        console.groupEnd();
      }

      _bibInserted = false;
      _cachedItems = [];
      els.btnInsert.classList.remove('hidden');
      els.btnUpdate.classList.add('hidden');
      els.preview.classList.add('hidden');
      
      if (result.stripped > 0) {
        showToast(`${result.stripped} kotak sitasi berhasil dihapus. Cek console (F12) untuk detail.`, 'success');
        setStatus('Format dihapus — teks tetap ada', 'success');
      } else {
        showToast(`Gagal/Tidak ditemukan. Cek console log (F12) untuk info debug.`, 'error');
        setStatus('Gagal menghapus format', 'error');
      }
    } catch (err) {
      showToast('Gagal: ' + err.message, 'error');
    } finally {
      els.btnStrip.disabled = false;
      els.btnStrip.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg> Hapus Format Sitasi (Simpan Teks)`;
    }
  });
};
