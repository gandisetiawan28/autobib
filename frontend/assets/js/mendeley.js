/* ═══════════════════════════════════════════════════════════
   mendeley.js — Mendeley integration and references list UI
   ═══════════════════════════════════════════════════════════ */

window.initMendeley = async () => {
  const els = {
    statusDisc: document.getElementById('status-disconnected'),
    statusConn: document.getElementById('status-connected'),
    name: document.getElementById('mendeley-name'),
    avatar: document.getElementById('mendeley-avatar'),
    btnConnect: document.getElementById('btn-connect-mendeley'),
    btnDisconnect: document.getElementById('btn-disconnect-mendeley'),
    
    searchBar: document.getElementById('refs-search-bar'),
    searchBar: document.getElementById('refs-search-bar'),
    searchInput: document.getElementById('refs-search'),
    groupFilter: document.getElementById('refs-group-filter'),
    sortFilter: document.getElementById('refs-sort-filter'),
    listWrap: document.getElementById('refs-list'),
    cardsCont: document.getElementById('refs-cards'),
    skeleton: document.getElementById('refs-skeleton'),
    count: document.getElementById('refs-count'),
    cbSelectAllRefs: document.getElementById('cb-select-all-refs'),
    btnAddQueue: document.getElementById('btn-add-to-queue'),
    
    drawer: document.getElementById('abstract-drawer'),
    drawerText: document.getElementById('abstract-text'),
    btnCloseDrawer: document.getElementById('btn-close-drawer'),
    btnFixMetadata: document.getElementById('btn-fix-metadata'),
    logPopup: document.getElementById('log-popup'),
    logBody: document.getElementById('log-popup-body'),
    btnMinimizeLog: document.getElementById('btn-minimize-log'),
    btnCloseLog: document.getElementById('btn-close-log'),
  };

  els.btnMinimizeLog.addEventListener('click', () => els.logPopup.classList.toggle('minimized'));
  els.btnCloseLog.addEventListener('click', () => els.logPopup.classList.add('hidden'));

  function writeLog(text, type = '') {
    const p = document.createElement('div');
    p.className = `log-line ${type}`;
    p.textContent = `> ${text}`;
    els.logBody.appendChild(p);
    els.logBody.scrollTop = els.logBody.scrollHeight;
  }

  let references = [];
  let selectedIds = new Set();
  let searchTimeout = null;

  async function checkStatus() {
    try {
      const res = await ApiClient.mendeley.status();
      if (res.connected) {
        els.statusDisc.classList.add('hidden');
        els.statusConn.classList.remove('hidden');
        els.searchBar.classList.remove('hidden');
        els.listWrap.classList.remove('hidden');
        
        const nm = res.profile.name || 'User';
        els.name.textContent = nm;
        els.avatar.textContent = nm.charAt(0).toUpperCase();
        
        loadFilters();
        loadReferences();
      } else {
        els.statusDisc.classList.remove('hidden');
        els.statusConn.classList.add('hidden');
        els.searchBar.classList.add('hidden');
        els.listWrap.classList.add('hidden');
      }
    } catch (err) {
      console.error(err);
    }
  }

  els.btnConnect.addEventListener('click', () => {
    const url = 'http://localhost:3001/auth/mendeley';
    
    els.btnConnect.textContent = 'Menunggu otentikasi...';
    els.btnConnect.disabled = true;
    showToast('Silakan login di browser yang terbuka...', 'info');

    // Open in the default system browser — NOT inside Word
    if (window.Office && window.Office.context && window.Office.context.ui && window.Office.context.ui.openBrowserWindow) {
      window.Office.context.ui.openBrowserWindow(url);
    } else {
      window.open(url, '_blank');
    }

    // Poll backend every 3 seconds for up to 3 minutes
    let attempts = 0;
    const pollInterval = setInterval(async () => {
      try {
        attempts++;
        const res = await ApiClient.mendeley.status();
        if (res.connected) {
          clearInterval(pollInterval);
          showToast('Berhasil login Mendeley!', 'success');
          els.btnConnect.textContent = 'Hubungkan Mendeley';
          els.btnConnect.disabled = false;
          checkStatus();
        }
        if (attempts > 60) {
          clearInterval(pollInterval);
          showToast('Waktu login habis. Silakan coba lagi.', 'warning');
          els.btnConnect.textContent = 'Hubungkan Mendeley';
          els.btnConnect.disabled = false;
        }
      } catch (e) {}
    }, 3000);
  });

  // Fallback for browser (non-Office) testing
  window.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'MENDELEY_AUTH_SUCCESS') {
      showToast('Berhasil login Mendeley', 'success');
      checkStatus();
    }
  });

  els.btnDisconnect.addEventListener('click', async () => {
    try {
      await ApiClient.mendeley.disconnect();
      checkStatus();
    } catch (err) {
      showToast('Gagal memutus koneksi', 'error');
    }
  });

  let allReferencesCache = [];
  let currentFolderDocs = null; // null means no folder filter, Array means filter by these IDs

  async function loadFilters() {
    try {
      const [foldersRes, groupsRes] = await Promise.all([
        ApiClient.mendeley.folders(),
        ApiClient.mendeley.groups()
      ]);
      
      els.groupFilter.innerHTML = '<option value="">Semua folder & grup</option>';
      
      if (foldersRes.folders?.length) {
        const optgroup = document.createElement('optgroup');
        optgroup.label = 'Personal Folders';
        
        // Remove duplicates just in case Mendeley API returns them
        const uniqueFolders = [];
        const seenFolderNames = new Set();
        foldersRes.folders.forEach(f => {
          if (!seenFolderNames.has(f.name)) {
            seenFolderNames.add(f.name);
            uniqueFolders.push(f);
          }
        });
        
        uniqueFolders.forEach(f => {
          const opt = document.createElement('option');
          opt.value = `folder_${f.id}`;
          opt.textContent = f.name;
          optgroup.appendChild(opt);
        });
        els.groupFilter.appendChild(optgroup);
      }
      
      if (groupsRes.groups?.length) {
        const optgroup = document.createElement('optgroup');
        optgroup.label = 'Shared Groups';
        
        const uniqueGroups = [];
        const seenGroupNames = new Set();
        groupsRes.groups.forEach(g => {
          if (!seenGroupNames.has(g.name)) {
            seenGroupNames.add(g.name);
            uniqueGroups.push(g);
          }
        });
        
        uniqueGroups.forEach(g => {
          const opt = document.createElement('option');
          opt.value = `group_${g.id}`;
          opt.textContent = g.name;
          optgroup.appendChild(opt);
        });
        els.groupFilter.appendChild(optgroup);
      }
    } catch(err) { console.error('Failed to load filters', err); }
  }

  els.groupFilter.addEventListener('change', async (e) => {
    const val = e.target.value;
    els.skeleton.classList.remove('hidden');
    els.cardsCont.innerHTML = '';
    
    try {
      if (!val) {
        currentFolderDocs = null;
        if (allReferencesCache.length === 0) {
          const res = await ApiClient.mendeley.documents({ limit: 500 });
          allReferencesCache = res.documents || [];
        }
      } else if (val.startsWith('folder_')) {
        const folderId = val.replace('folder_', '');
        const res = await ApiClient.mendeley.folderDocs(folderId);
        currentFolderDocs = res.document_ids || [];
        if (allReferencesCache.length === 0) {
          const allRes = await ApiClient.mendeley.documents({ limit: 500 });
          allReferencesCache = allRes.documents || [];
        }
      } else if (val.startsWith('group_')) {
        const groupId = val.replace('group_', '');
        const res = await ApiClient.mendeley.documents({ group_id: groupId, limit: 500 });
        // We temporarily replace the cache with group documents so search works within the group
        allReferencesCache = res.documents || [];
        currentFolderDocs = null;
      }
      loadReferences(els.searchInput.value.trim());
    } catch (err) {
      els.count.textContent = 'Gagal memuat folder/grup';
      els.skeleton.classList.add('hidden');
    }
  });

  async function loadReferences(query = '') {
    els.skeleton.classList.remove('hidden');
    if (!query) els.cardsCont.innerHTML = '';

    try {
      if (allReferencesCache.length === 0 && !els.groupFilter.value.startsWith('group_')) {
        const res = await ApiClient.mendeley.documents({ limit: 500 });
        allReferencesCache = res.documents || [];
      }
      
      let filtered = allReferencesCache;
      
      // Apply folder filter if active
      if (currentFolderDocs !== null) {
        filtered = filtered.filter(r => currentFolderDocs.includes(r.id));
      }
      
      // Apply text search if active
      if (query) {
        const q = query.toLowerCase();
        filtered = filtered.filter(r => 
          (r.title || '').toLowerCase().includes(q) ||
          (r.authors || []).some(a => (a.last_name || '').toLowerCase().includes(q) || (a.first_name || '').toLowerCase().includes(q)) ||
          String(r.year || '').includes(q)
        );
      }
      
      // Apply Sort
      const sortVal = els.sortFilter ? els.sortFilter.value : 'newest';
      filtered.sort((a, b) => {
        if (sortVal === 'newest') return new Date(b.created || 0) - new Date(a.created || 0);
        if (sortVal === 'oldest') return new Date(a.created || 0) - new Date(b.created || 0);
        if (sortVal === 'year_desc') return (b.year || 0) - (a.year || 0);
        if (sortVal === 'year_asc') return (a.year || 0) - (b.year || 0);
        if (sortVal === 'title_asc') return (a.title || '').localeCompare(b.title || '');
        if (sortVal === 'title_desc') return (b.title || '').localeCompare(a.title || '');
        return 0;
      });
      
      references = [...filtered];
      
      els.count.textContent = `${references.length} referensi`;
      renderReferences();
    } catch (err) {
      els.count.textContent = 'Gagal memuat referensi';
    } finally {
      els.skeleton.classList.add('hidden');
    }
  }

  els.sortFilter?.addEventListener('change', () => {
    loadReferences(els.searchInput.value.trim());
  });

  els.searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      loadReferences(e.target.value.trim());
    }, 500);
  });

  if (els.cbSelectAllRefs) {
    els.cbSelectAllRefs.addEventListener('change', (e) => {
      if (e.target.checked) {
        references.forEach(ref => selectedIds.add(ref.id));
      } else {
        references.forEach(ref => selectedIds.delete(ref.id));
      }
      renderReferences();
      updateQueueBtn();
    });
  }

  els.btnFixMetadata.addEventListener('click', async () => {
    if (selectedIds.size === 0) {
      showToast('Centang setidaknya satu referensi terlebih dahulu!', 'warning');
      return;
    }

    const targets = references.filter(r => selectedIds.has(r.id));
    const originalText = els.btnFixMetadata.textContent;
    els.btnFixMetadata.textContent = 'AI Memperbaiki...';
    els.btnFixMetadata.disabled = true;
    
    // Open log popup if debug mode is ON
    els.logBody.innerHTML = '';
    const isDebug = localStorage.getItem('autobib_debug_mode') === 'true';
    if (isDebug) {
      els.logPopup.classList.remove('hidden', 'minimized');
    }
    
    writeLog(`Memulai perbaikan AI untuk ${targets.length} dokumen...`, 'info');
    
    let updatedCount = 0;
    try {
      // Process in smaller batches of 20 to prevent AI output truncation
      const batchSize = 20;
      for (let i = 0; i < targets.length; i += batchSize) {
        const batch = targets.slice(i, i + batchSize).map(ref => ({
          id: ref.id,
          title: ref.title,
          authors: ref.authors,
          year: ref.year,
          type: ref.type,
          source: ref.source || ref.publisher,
          volume: ref.volume,
          issue: ref.issue,
          pages: ref.pages,
          identifiers: ref.identifiers,
          abstract: ref.abstract ? (ref.abstract.substring(0, 300) + '...') : undefined
        }));

        writeLog(`Mengirim batch ${Math.floor(i / batchSize) + 1} (${batch.length} dokumen) ke AI...`, 'info');
        const res = await ApiClient.ai.fixMetadata(batch);
        
        if (res && res.fixed && Array.isArray(res.fixed)) {
          for (const fixedDoc of res.fixed) {
            const originalDoc = references.find(r => r.id === fixedDoc.id);
            if (!originalDoc) continue;

            let needsUpdate = false;
            const patchData = {};

            for (const key of Object.keys(fixedDoc)) {
              if (key === 'id') continue;
              // Deep compare using JSON.stringify
              if (JSON.stringify(fixedDoc[key]) !== JSON.stringify(originalDoc[key])) {
                patchData[key] = fixedDoc[key];
                needsUpdate = true;
              }
            }

            if (needsUpdate) {
              writeLog(`Memperbarui: "${fixedDoc.title || originalDoc.title}"...`, 'warning');
              await ApiClient.mendeley.updateDoc(fixedDoc.id, patchData);
              
              // LIVE UPDATE DOM & CACHE!
              for (const key of Object.keys(patchData)) {
                originalDoc[key] = patchData[key];
              }

              // Update cache so subsequent searches see the new data
              const cacheDoc = allReferencesCache.find(r => r.id === originalDoc.id);
              if (cacheDoc) {
                for (const key of Object.keys(patchData)) {
                  cacheDoc[key] = patchData[key];
                }
              }

              // Update DOM directly without flicker
              const cardNode = els.cardsCont.querySelector(`.ref-card[data-id="${originalDoc.id}"]`);
              if (cardNode) {
                const authorsFull = (originalDoc.authors || []).map(a => {
                  const last = a.last_name || '';
                  const first = a.first_name || '';
                  const initials = first.split(/[\s-]+/).filter(Boolean).map(n => n.charAt(0).toUpperCase() + '.').join(' ');
                  if (last && initials) return `${last}, ${initials}`;
                  return last || initials || 'Unknown';
                }).join('; ') || 'Unknown Authors';
                
                const titleNode = cardNode.querySelector('.ref-card-title');
                const authorNode = cardNode.querySelector('.ref-card-authors-hover');
                const typeNode = cardNode.querySelector('.type-tag');
                
                if (titleNode) {
                  titleNode.textContent = originalDoc.title || 'Untitled';
                  titleNode.title = originalDoc.title || 'Untitled';
                }
                if (authorNode) {
                  authorNode.textContent = authorsFull;
                  authorNode.title = authorsFull;
                }
                if (typeNode && originalDoc.type) {
                  const typeStr = originalDoc.type.replace(/_/g, ' ');
                  typeNode.textContent = typeStr.charAt(0).toUpperCase() + typeStr.slice(1);
                }
                
                // Add a brief flash animation class to show it was updated
                cardNode.style.transition = 'background-color 0.5s ease';
                cardNode.style.backgroundColor = 'rgba(16, 185, 129, 0.2)'; // Tailwind Emerald 500 w/ opacity
                setTimeout(() => {
                  cardNode.style.backgroundColor = '';
                }, 1000);
              }

              writeLog(`Berhasil diperbarui!`, 'success');
              updatedCount++;
            }
          }
        }
      }

      if (updatedCount > 0) {
        writeLog(`Selesai! ${updatedCount} dokumen berhasil diperbarui.`, 'success');
        showToast(`AI berhasil memperbaiki ${updatedCount} metadata dokumen!`, 'success');
        // We do NOT call loadReferences() here to prevent flicker! 
        // The DOM is already live-updated.
      } else {
        writeLog(`Selesai! Tidak ada dokumen yang perlu diperbaiki (semua sudah rapi).`, 'success');
        showToast('AI menyatakan semua metadata sudah terlihat rapi.', 'info');
      }
    } catch (err) {
      console.error(err);
      writeLog(`Error: ${err.message || 'Gagal terhubung ke API'}`, 'error');
      showToast('Gagal memperbaiki metadata', 'error');
    } finally {
      els.btnFixMetadata.textContent = originalText;
      els.btnFixMetadata.disabled = false;
    }
  });

  function renderReferences() {
    els.cardsCont.innerHTML = '';
    
    let allSelected = references.length > 0;
    
    references.forEach(ref => {
      if (!selectedIds.has(ref.id)) allSelected = false;
      
      const authorsFull = (ref.authors || []).map(a => {
        const last = a.last_name || '';
        const first = a.first_name || '';
        const initials = first.split(/[\s-]+/).filter(Boolean).map(n => n.charAt(0).toUpperCase() + '.').join(' ');
        if (last && initials) return `${last}, ${initials}`;
        return last || initials || 'Unknown';
      }).join('; ') || 'Unknown Authors';
      const year = ref.year || 'n.d.';
      const title = ref.title || 'Untitled';
      
      // Get reference type
      const typeStr = (ref.type || 'document').replace(/_/g, ' ');
      const typeFmt = typeStr.charAt(0).toUpperCase() + typeStr.slice(1);
      
      // Get publisher / source
      const source = ref.source || ref.publisher || 'Unknown Source';
      
      // Get date added
      const dateObj = new Date(ref.created || Date.now());
      const dateAdded = dateObj.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
      
      const card = document.createElement('div');
      card.className = `ref-card ${selectedIds.has(ref.id) ? 'selected' : ''}`;
      card.dataset.id = ref.id;
      
      card.innerHTML = `
        <div class="ref-card-check">${selectedIds.has(ref.id) ? '✓' : ''}</div>
        <div class="ref-card-body">
          <div class="ref-card-title" title="${title}">${title}</div>
          <div class="ref-card-authors-hover" title="${authorsFull}">${authorsFull}</div>
          <div class="ref-card-meta-row">
            <span class="ref-tag type-tag">${typeFmt}</span>
            <span class="ref-source" title="${source}">${source} (${year})</span>
          </div>
          <div class="ref-card-date">Ditambahkan: ${dateAdded}</div>
        </div>
      `;

      // Single click selects, double click shows abstract
      card.addEventListener('click', () => {
        if (selectedIds.has(ref.id)) {
          selectedIds.delete(ref.id);
          card.classList.remove('selected');
          card.querySelector('.ref-card-check').textContent = '';
        } else {
          selectedIds.add(ref.id);
          card.classList.add('selected');
          card.querySelector('.ref-card-check').textContent = '✓';
        }
        updateQueueBtn();
      });

      card.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showAbstract(ref);
      });

      els.cardsCont.appendChild(card);
    });
    
    if (els.cbSelectAllRefs) {
        els.cbSelectAllRefs.checked = allSelected;
    }
  }

  async function showAbstract(ref) {
    els.drawerText.textContent = 'Memuat abstrak...';
    els.drawer.classList.remove('hidden');
    try {
      const detail = await ApiClient.mendeley.document(ref.id);
      els.drawerText.textContent = detail.document.abstract || 'Abstrak tidak tersedia untuk dokumen ini.';
    } catch {
      els.drawerText.textContent = 'Gagal memuat abstrak.';
    }
  }

  els.btnCloseDrawer.addEventListener('click', () => els.drawer.classList.add('hidden'));

  function updateQueueBtn() {
    const ct = selectedIds.size;
    const floatingBar = document.getElementById('refs-floating-bar');
    const selectedCountText = document.getElementById('floating-selected-count');
    const btnEditManual = document.getElementById('btn-edit-manual');
    
    if (floatingBar && selectedCountText) {
        if (ct > 0) {
            floatingBar.classList.add('visible');
            selectedCountText.textContent = ct;
            
            // Show edit button only if exactly 1 item is selected
            if (btnEditManual) {
              if (ct === 1) {
                btnEditManual.classList.remove('hidden');
              } else {
                btnEditManual.classList.add('hidden');
              }
            }
        } else {
            floatingBar.classList.remove('visible');
        }
    }
  }

  els.btnAddQueue.addEventListener('click', () => {
    if (selectedIds.size === 0) return;
    const selectedRefs = references.filter(r => selectedIds.has(r.id));
    if (window.addToQueue) window.addToQueue(selectedRefs);
    showToast(`${selectedRefs.length} referensi masuk antrian`, 'success');
    
    // Clear selection
    selectedIds.clear();
    renderReferences();
    updateQueueBtn();
    
    // Switch to Generate tab
    document.getElementById('tab-btn-generate').click();
  });

  // ── Delete Logic ────────────────────────────────────────────────
  const btnDeleteRefs = document.getElementById('btn-delete-refs');
  const deleteModal = document.getElementById('delete-confirm-modal');
  const btnCancelDelete = document.getElementById('btn-cancel-delete');
  const btnConfirmDelete = document.getElementById('btn-confirm-delete');

  if (btnDeleteRefs && deleteModal) {
    btnDeleteRefs.addEventListener('click', () => {
      if (selectedIds.size === 0) return;
      document.getElementById('delete-confirm-text').textContent = 
        `Anda yakin ingin menghapus ${selectedIds.size} referensi terpilih dari pustaka Mendeley? Tindakan ini tidak dapat dibatalkan.`;
      deleteModal.classList.remove('hidden');
    });
  }

  if (btnCancelDelete) {
    btnCancelDelete.addEventListener('click', () => {
      deleteModal.classList.add('hidden');
    });
  }

  if (btnConfirmDelete) {
    btnConfirmDelete.addEventListener('click', async () => {
      if (selectedIds.size === 0) return;
      
      btnConfirmDelete.disabled = true;
      btnConfirmDelete.textContent = 'Menghapus...';
      
      try {
        let deletedCount = 0;
        for (const id of selectedIds) {
          try {
            await ApiClient.mendeley.deleteDoc(id);
            deletedCount++;
            // Remove from cache instantly
            allReferencesCache = allReferencesCache.filter(r => r.id !== id);
          } catch (e) {
            console.error(`Failed to delete ${id}`, e);
          }
        }
        
        if (deletedCount > 0) {
          showToast(`${deletedCount} referensi berhasil dihapus`, 'success');
          selectedIds.clear();
          // Render instantly from modified cache
          loadFilters();
          loadReferences();
        } else {
          showToast('Gagal menghapus referensi', 'error');
        }
      } catch (err) {
        showToast('Terjadi kesalahan saat menghapus', 'error');
      } finally {
        btnConfirmDelete.disabled = false;
        btnConfirmDelete.textContent = 'Ya, Hapus';
        deleteModal.classList.add('hidden');
      }
    });
  }

  // ── Citation Insertion Logic ──────────────────────────────────────
  const btnInsertCitation = document.getElementById('btn-insert-citation');
  const citationInsertModal = document.getElementById('citation-insert-modal');
  const btnCloseCitationModal = document.getElementById('btn-close-citation-modal');
  const citeFormatSelect = document.getElementById('cite-format-select');
  const btnInsertInline = document.getElementById('btn-insert-inline');
  const btnInsertBiblio = document.getElementById('btn-insert-biblio');
  const previewInline = document.getElementById('cite-preview-inline');
  const previewBiblio = document.getElementById('cite-preview-biblio');
  let currentFormattedCitations = [];

  function mapToCslItem(ref) {
    return {
      title: ref.title,
      author: (ref.authors || []).map(a => ({ family: a.last_name, given: a.first_name })),
      issued: ref.year ? { 'date-parts': [[ref.year]] } : undefined,
      'container-title': ref.source || ref.publisher,
      volume: ref.volume,
      issue: ref.issue,
      page: ref.pages,
      DOI: ref.identifiers?.doi
    };
  }

  async function generateCitationPreviews() {
    if (selectedIds.size === 0) return;
    const selectedRefs = references.filter(r => selectedIds.has(r.id));
    const docs = selectedRefs.map(mapToCslItem);
    const format = citeFormatSelect.value;
    const customFormat = document.getElementById('cite-inline-custom')?.value || 'standard';
    
    previewInline.innerHTML = 'Memuat...';
    previewBiblio.innerHTML = 'Memuat...';
    btnInsertInline.disabled = true;
    btnInsertBiblio.disabled = true;

    try {
      const res = await ApiClient.citation.format(docs, format);
      currentFormattedCitations = res.formatted;
      
      let inlineHTML = currentFormattedCitations.map(c => c.inline).join('; ');
      
      // Merge multiple citations: (A, 2020); (B, 2021) -> (A, 2020; B, 2021)
      inlineHTML = inlineHTML.replace(/\);\s*\(/g, '; ');
      // Merge IEEE brackets: [1]; [2] -> [1, 2]
      inlineHTML = inlineHTML.replace(/\];\s*\[/g, ', ');
      
      // Apply custom inline formatting
      if (customFormat === 'suppress_author') {
        // e.g. (Indraini et al., 2026; Fadillah & Halisah, 2026) -> (2026; 2026)
        inlineHTML = inlineHTML.replace(/([^,(0-9]+?),\s*(\d{4}[a-z]?)/g, '$2');
      } else if (customFormat === 'author_only') {
        // e.g. (Indraini et al., 2026; Fadillah & Halisah, 2026) -> Indraini et al.; Fadillah & Halisah
        inlineHTML = inlineHTML.replace(/([^,(0-9]+?),\s*(\d{4}[a-z]?)/g, '$1');
        // Remove surrounding brackets if author_only
        inlineHTML = inlineHTML.replace(/^\((.*)\)$/, '$1');
      }

      const biblioHTML = currentFormattedCitations.map(c => c.citation).join('\n');
      
      previewInline.innerHTML = `<span>${inlineHTML}</span>`;
      previewBiblio.innerHTML = biblioHTML;
      
      btnInsertInline.disabled = false;
      btnInsertBiblio.disabled = false;
    } catch (err) {
      previewInline.innerHTML = '<span style="color:red">Gagal memuat format sitasi</span>';
      previewBiblio.innerHTML = '<span style="color:red">Gagal memuat format sitasi</span>';
    }
  }

  if (btnInsertCitation && citationInsertModal) {
    btnInsertCitation.addEventListener('click', () => {
      if (selectedIds.size === 0) return;
      citationInsertModal.classList.remove('hidden');
      generateCitationPreviews();
    });
  }
  
  if (btnCloseCitationModal) {
    btnCloseCitationModal.addEventListener('click', () => {
      citationInsertModal.classList.add('hidden');
    });
  }

  if (citeFormatSelect) {
    citeFormatSelect.addEventListener('change', generateCitationPreviews);
  }
  
  const citeInlineCustom = document.getElementById('cite-inline-custom');
  if (citeInlineCustom) {
    citeInlineCustom.addEventListener('change', generateCitationPreviews);
  }

  if (btnInsertInline) {
    btnInsertInline.addEventListener('click', async () => {
      btnInsertInline.disabled = true;
      btnInsertInline.textContent = 'Menyisipkan...';
      try {
        const customFormat = document.getElementById('cite-inline-custom')?.value || 'standard';
        const selectedRefs = references.filter(r => selectedIds.has(r.id));
        const items = selectedRefs.map(ref => ({
          mendeley_uuid: ref.id,
          csl_json: mapToCslItem(ref),
          suppress_author: customFormat === 'suppress_author',
          author_only: customFormat === 'author_only'
        }));
        
        // Regenerate inline text specifically for the payload
        let inlineHTML = currentFormattedCitations.map(c => c.inline).join('; ');
        
        // Merge multiple citations
        inlineHTML = inlineHTML.replace(/\);\s*\(/g, '; ');
        inlineHTML = inlineHTML.replace(/\];\s*\[/g, ', ');
        
        if (customFormat === 'suppress_author') {
          inlineHTML = inlineHTML.replace(/([^,(0-9]+?),\s*(\d{4}[a-z]?)/g, '$2');
        } else if (customFormat === 'author_only') {
          inlineHTML = inlineHTML.replace(/([^,(0-9]+?),\s*(\d{4}[a-z]?)/g, '$1');
          inlineHTML = inlineHTML.replace(/^\((.*)\)$/, '$1');
        }
        
        const res = await ApiClient.smartCitation.buildField({
          items,
          formatted_citation: inlineHTML
        });
        
        if (window.OfficeBridge && window.OfficeBridge.insertOoxml) {
          await window.OfficeBridge.insertOoxml(res.ooxml);
          showToast('Sitasi Mendeley berhasil disisipkan', 'success');
          citationInsertModal.classList.add('hidden');
          // Trigger bibliography update instantly
          window.dispatchEvent(new CustomEvent('autobib:citation_inserted'));
        } else {
          showToast('OfficeBridge tidak tersedia', 'error');
        }
      } catch (err) {
        console.error(err);
        showToast('Gagal menyisipkan sitasi Mendeley', 'error');
      } finally {
        btnInsertInline.disabled = false;
        btnInsertInline.textContent = 'Sisipkan';
      }
    });
  }

  if (btnInsertBiblio) {
    btnInsertBiblio.addEventListener('click', async () => {
      const biblioHTML = currentFormattedCitations.map(c => c.citation).join('\n');
      if (window.OfficeBridge) {
        await window.OfficeBridge.insertHtml(`<div>${biblioHTML}</div>`);
        showToast('Daftar pustaka disisipkan', 'success');
        citationInsertModal.classList.add('hidden');
      } else {
        showToast('OfficeBridge tidak tersedia', 'error');
      }
    });
  }

  // ── Manual Edit Logic ───────────────────────────────────────────
  const btnEditManual = document.getElementById('btn-edit-manual');
  const editModal = document.getElementById('edit-modal');
  const btnCancelEdit = document.getElementById('btn-cancel-edit');
  const btnSaveEdit = document.getElementById('btn-save-edit');
  let currentEditingRefId = null;

  if (btnEditManual) {
    btnEditManual.addEventListener('click', async () => {
      if (selectedIds.size !== 1) return;
      const refId = Array.from(selectedIds)[0];
      const ref = references.find(r => r.id === refId);
      if (!ref) return;

      currentEditingRefId = ref.id;
      
      // Populate fields
      document.getElementById('edit-title').value = ref.title || '';
      const authorsStr = (ref.authors || []).map(a => `${a.last_name || ''}, ${a.first_name || ''}`.trim()).join('\n');
      document.getElementById('edit-authors').value = authorsStr;
      
      const typeStr = ref.type === 'article-journal' ? 'journal' : (ref.type || 'generic');
      const typeSelect = document.getElementById('edit-type');
      if (Array.from(typeSelect.options).some(o => o.value === typeStr)) {
        typeSelect.value = typeStr;
      } else {
        typeSelect.value = 'generic';
      }
      
      document.getElementById('edit-year').value = ref.year || '';
      document.getElementById('edit-source').value = ref.source || ref.publisher || '';
      document.getElementById('edit-abstract').value = ref.abstract || '';
      
      // If abstract is empty, try to fetch full document details
      if (!ref.abstract) {
        try {
          const detail = await ApiClient.mendeley.document(ref.id);
          if (detail.document.abstract) {
            document.getElementById('edit-abstract').value = detail.document.abstract;
          }
        } catch (e) {}
      }

      editModal.classList.remove('hidden');
    });
  }

  if (btnCancelEdit) {
    btnCancelEdit.addEventListener('click', () => {
      editModal.classList.add('hidden');
      currentEditingRefId = null;
    });
  }

  if (btnSaveEdit) {
    btnSaveEdit.addEventListener('click', async () => {
      if (!currentEditingRefId) return;
      
      btnSaveEdit.disabled = true;
      btnSaveEdit.textContent = 'Menyimpan...';
      
      try {
        const title = document.getElementById('edit-title').value.trim();
        const type = document.getElementById('edit-type').value;
        const year = parseInt(document.getElementById('edit-year').value) || null;
        const source = document.getElementById('edit-source').value.trim();
        const abstract = document.getElementById('edit-abstract').value.trim();
        
        // Parse authors textarea
        const authorsText = document.getElementById('edit-authors').value;
        const authors = authorsText.split('\n').map(line => {
          const parts = line.split(',');
          if (parts.length === 1 && parts[0].trim()) {
            return { last_name: parts[0].trim(), first_name: '' };
          } else if (parts.length >= 2) {
            return { last_name: parts[0].trim(), first_name: parts.slice(1).join(',').trim() };
          }
          return null;
        }).filter(Boolean);
        
        const patchData = {
          title,
          type,
          year,
          source,
          abstract,
          authors
        };
        
        await ApiClient.mendeley.updateDoc(currentEditingRefId, patchData);
        showToast('Metadata berhasil diperbarui', 'success');
        
        // Update local cache
        const idx = allReferencesCache.findIndex(r => r.id === currentEditingRefId);
        if (idx > -1) {
          allReferencesCache[idx] = { ...allReferencesCache[idx], ...patchData };
        }
        
        editModal.classList.add('hidden');
        loadReferences(els.searchInput.value.trim()); // re-render
      } catch (err) {
        showToast('Gagal menyimpan metadata', 'error');
        console.error(err);
      } finally {
        btnSaveEdit.disabled = false;
        btnSaveEdit.textContent = 'Simpan';
      }
    });
  }

  // ── Upload / Add Logic ──────────────────────────────────────────
  const btnOpenUpload = document.getElementById('btn-open-upload');
  const uploadModal = document.getElementById('upload-modal');
  const btnCancelUpload = document.getElementById('btn-cancel-upload');
  const btnSubmitUpload = document.getElementById('btn-submit-upload');
  const uploadTargetSelect = document.getElementById('upload-target-select');
  const uploadDropzone = document.getElementById('upload-dropzone');
  const uploadFileInput = document.getElementById('upload-file-input');
  const uploadFileName = document.getElementById('upload-file-name');
  const uploadLinkInput = document.getElementById('upload-link-input');
  
  const tabUploadPdf = document.getElementById('tab-upload-pdf');
  const tabUploadLink = document.getElementById('tab-upload-link');
  const viewUploadPdf = document.getElementById('view-upload-pdf');
  const viewUploadLink = document.getElementById('view-upload-link');

  let selectedFile = null;
  let activeUploadMode = 'pdf';

  if (tabUploadPdf && tabUploadLink) {
    tabUploadPdf.addEventListener('click', () => {
      activeUploadMode = 'pdf';
      tabUploadPdf.style.background = 'var(--bg-elevated)';
      tabUploadPdf.style.opacity = '1';
      tabUploadPdf.style.boxShadow = '0 1px 2px rgba(0,0,0,0.2)';
      tabUploadLink.style.background = 'transparent';
      tabUploadLink.style.opacity = '0.6';
      tabUploadLink.style.boxShadow = 'none';
      viewUploadPdf.classList.remove('hidden');
      viewUploadLink.classList.add('hidden');
      btnSubmitUpload.disabled = !selectedFile;
    });

    tabUploadLink.addEventListener('click', () => {
      activeUploadMode = 'link';
      tabUploadLink.style.background = 'var(--bg-elevated)';
      tabUploadLink.style.opacity = '1';
      tabUploadLink.style.boxShadow = '0 1px 2px rgba(0,0,0,0.2)';
      tabUploadPdf.style.background = 'transparent';
      tabUploadPdf.style.opacity = '0.6';
      tabUploadPdf.style.boxShadow = 'none';
      viewUploadLink.classList.remove('hidden');
      viewUploadPdf.classList.add('hidden');
      btnSubmitUpload.disabled = !uploadLinkInput.value.trim();
    });
  }

  if (uploadLinkInput) {
    uploadLinkInput.addEventListener('input', () => {
      if (activeUploadMode === 'link') {
        btnSubmitUpload.disabled = !uploadLinkInput.value.trim();
      }
    });
  }

  if (btnOpenUpload) {
    btnOpenUpload.addEventListener('click', () => {
      uploadTargetSelect.innerHTML = els.groupFilter.innerHTML;
      const firstOpt = uploadTargetSelect.querySelector('option[value=""]');
      if (firstOpt) firstOpt.textContent = 'Umum (Semua Dokumen)';
      uploadTargetSelect.value = els.groupFilter.value;
      uploadModal.classList.remove('hidden');
    });
  }

  function resetUpload() {
    selectedFile = null;
    uploadFileName.textContent = 'Pilih atau seret file PDF ke sini';
    uploadFileName.style.color = 'var(--text-secondary)';
    uploadFileInput.value = '';
    if (uploadLinkInput) uploadLinkInput.value = '';
    btnSubmitUpload.disabled = true;
    uploadModal.classList.add('hidden');
    btnSubmitUpload.textContent = 'Tambah';
  }

  if (btnCancelUpload) {
    btnCancelUpload.addEventListener('click', resetUpload);
  }

  function handleFileSelection(file) {
    if (!file) return;
    if (file.type !== 'application/pdf') {
      showToast('Hanya file PDF yang didukung', 'error');
      return;
    }
    selectedFile = file;
    uploadFileName.textContent = file.name;
    uploadFileName.style.color = 'var(--text-primary)';
    if (activeUploadMode === 'pdf') btnSubmitUpload.disabled = false;
  }

  if (uploadDropzone) {
    uploadDropzone.addEventListener('click', () => uploadFileInput.click());
    
    uploadDropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      uploadDropzone.style.background = 'var(--bg-elevated)';
    });
    
    uploadDropzone.addEventListener('dragleave', () => {
      uploadDropzone.style.background = 'var(--bg-surface)';
    });
    
    uploadDropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadDropzone.style.background = 'var(--bg-surface)';
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleFileSelection(e.dataTransfer.files[0]);
      }
    });
  }

  if (uploadFileInput) {
    uploadFileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        handleFileSelection(e.target.files[0]);
      }
    });
  }

  if (btnSubmitUpload) {
    btnSubmitUpload.addEventListener('click', async () => {
      btnSubmitUpload.disabled = true;
      btnSubmitUpload.textContent = 'Menyimpan...';
      
      try {
        if (activeUploadMode === 'pdf') {
          if (!selectedFile) return;
          await ApiClient.mendeley.upload(selectedFile, uploadTargetSelect.value);
          showToast('File PDF berhasil diunggah', 'success');
        } else {
          const url = uploadLinkInput.value.trim();
          if (!url) return;
          await ApiClient.mendeley.addLink(url, uploadTargetSelect.value);
          showToast('Artikel web berhasil ditambahkan', 'success');
        }
        
        resetUpload();
        // Refresh the list
        allReferencesCache = []; 
        loadFilters(); 
        loadReferences();
      } catch (err) {
        showToast('Gagal menambahkan dokumen', 'error');
        btnSubmitUpload.disabled = false;
        btnSubmitUpload.textContent = 'Tambah';
      }
    });
  }

  checkStatus();
};
