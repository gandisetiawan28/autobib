/* ═══════════════════════════════════════════════════════════
   office-bridge.js — Office.js Word API wrapper
   ═══════════════════════════════════════════════════════════ */

const OfficeBridge = (() => {
  let _isReady = false;

  function isOfficeReady() { return _isReady; }

  function init(callback) {
    if (typeof Office === 'undefined') {
      console.warn('Office.js not available — running in browser preview mode');
      _isReady = false;
      if (callback) callback(false);
      return;
    }
    Office.onReady((info) => {
      _isReady = info.host === Office.HostType.Word;
      if (callback) callback(_isReady);
    });
  }

  /**
   * Insert plain text at cursor position.
   */
  async function insertText(text) {
    if (!_isReady) return showToast('Office.js tidak tersedia', 'error');
    await Word.run(async (ctx) => {
      const sel = ctx.document.getSelection();
      sel.insertText(text, Word.InsertLocation.replace);
      await ctx.sync();
    });
  }

  /**
   * Insert HTML at cursor position (supports formatting like bold/italic).
   */
  async function insertHtml(html) {
    if (!_isReady) return showToast('Office.js tidak tersedia', 'error');
    await Word.run(async (ctx) => {
      const sel = ctx.document.getSelection();
      sel.insertHtml(html, Word.InsertLocation.replace);
      await ctx.sync();
    });
  }

  /**
   * Insert text at end of document.
   */
  async function appendText(text) {
    if (!_isReady) return showToast('Office.js tidak tersedia', 'error');
    await Word.run(async (ctx) => {
      const body = ctx.document.body;
      body.insertParagraph(text, Word.InsertLocation.end);
      await ctx.sync();
    });
  }

  // ── Live Streaming Logic ──
  let streamRange = null;
  let streamQueue = "";
  let isStreaming = false;
  let hasClearedSelection = false;
  let shouldReplaceStream = true;
  // ===== SISTEM UNDO =====
  let undoStack = {};
  
  // Fungsi untuk membalikkan aksi (Undo)
  async function undoAction(actionId) {
    const action = undoStack[actionId];
    if (!action) throw new Error("Aksi tidak ditemukan di riwayat Undo.");
    
    if (action.type === 'replace') {
      // Reversal: Cari teks yang 'baru' (yang disisipkan AI), lalu timpa kembali dengan teks 'lama' (asli)
      await searchAndReplaceSelection([{
        find: action.replaced_with,
        replace: action.original_text,
        actionId: null // Jangan catat undo ini sebagai operasi yang bisa di-undo lagi
      }], true); // true = run silently/synchronously without typing effect
    } else if (action.type === 'insert') {
      // Reversal: Cari teks yang baru saja diketik AI, lalu hapus
      await searchAndReplaceSelection([{
        find: action.inserted_text,
        replace: "",
        actionId: null
      }], true);
    } else {
      throw new Error(`Undo untuk tipe aksi '${action.type}' belum didukung.`);
    }
  }

  // Generate ID unik
  function generateId() {
    return Math.random().toString(36).substr(2, 9);
  }

  function addUndoRecord(actionId, type, data) {
    undoStack[actionId] = { type, ...data };
  }
  // =======================

  let isTypingLoopRunning = false;

  async function startLiveStream(replace = false) {
    streamQueue = "";
    isStreaming = true;
    hasClearedSelection = false;
    shouldReplaceStream = replace;
    streamRange = null;
    startTypingLoop();
  }

  async function appendLiveStream(chunk) {
    if (!isStreaming) return;
    streamQueue += chunk;
  }

  async function startTypingLoop() {
    if (isTypingLoopRunning) return;
    isTypingLoopRunning = true;
    
    while (isStreaming || streamQueue.length > 0) {
      if (streamQueue.length === 0) {
        await new Promise(r => setTimeout(r, 50));
        continue;
      }
      
      // Adaptive batching: Jika antrean menumpuk karena kecepatan AI, ambil lebih banyak huruf sekaligus
      let charsToTake = 1;
      if (streamQueue.length > 20) charsToTake = 3;
      if (streamQueue.length > 50) charsToTake = 8;
      if (streamQueue.length > 150) charsToTake = streamQueue.length; 
      
      const textToInsert = streamQueue.substring(0, charsToTake);
      streamQueue = streamQueue.substring(charsToTake);
      
      try {
        if (!hasClearedSelection || !streamRange) {
            await Word.run(async (ctx) => {
              const sel = ctx.document.getSelection();
              if (shouldReplaceStream) {
                sel.insertText("", Word.InsertLocation.replace);
                streamRange = sel.insertText(textToInsert, Word.InsertLocation.end);
              } else {
                streamRange = sel.insertText(textToInsert, Word.InsertLocation.after);
              }
              streamRange.track();
              streamRange.select('End'); // Auto-scroll to end
              hasClearedSelection = true;
              await ctx.sync();
            });
        } else {
            await Word.run(streamRange, async (ctx) => {
               streamRange.insertText(textToInsert, Word.InsertLocation.end);
               streamRange.select('End'); // Auto-scroll to end
               await ctx.sync();
            });
        }
        
        // Adaptive Delay: Mensimulasikan jeda pengetikan manusia
        const lastChar = textToInsert.slice(-1);
        let delay = 20; // Default: cepat
        if (['.', '?', '!'].includes(lastChar)) delay = 300; // Jeda di akhir kalimat
        else if ([',', ';', ':'].includes(lastChar)) delay = 150; // Jeda di tengah kalimat
        else if (lastChar === '\n') delay = 400; // Jeda saat paragraf baru
        
        if (delay > 0) await new Promise(r => setTimeout(r, delay));
        
      } catch (err) {
        console.error("Stream sync error:", err);
        streamQueue = textToInsert + streamQueue; // Restore queue
        hasClearedSelection = false;
        streamRange = null;
        shouldReplaceStream = false; 
        await new Promise(r => setTimeout(r, 500));
      }
    }
    isTypingLoopRunning = false;
  }

  async function stopLiveStream() {
    isStreaming = false; 

    // Tunggu sampai loop mengetik selesai memproses sisa antrean
    let retries = 0;
    while (isTypingLoopRunning && retries < 100) { 
      await new Promise(r => setTimeout(r, 50));
      retries++;
    }

    if (streamRange) {
      try {
        await Word.run(async (ctx) => {
          streamRange.untrack();
          await ctx.sync();
        });
      } catch (err) {
        console.error("Error finalizing stream", err);
      }
      streamRange = null;
    }
  }

  /**
   * Insert OOXML (Mendeley field code) at cursor.
   */
  async function insertOoxml(ooxml) {
    if (!_isReady) return showToast('Office.js tidak tersedia', 'error');
    await Word.run(async (ctx) => {
      const sel = ctx.document.getSelection();
      sel.insertOoxml(ooxml, Word.InsertLocation.replace);
      await ctx.sync();
    });
  }

  /**
   * Scan all paragraphs for citation patterns.
   * Returns array of { text, paragraphIndex, matchIndex, pattern }
   */
  async function scanForCitations() {
    if (!_isReady) return [];

    // 1. Author Pattern: Capitalized words optionally followed by "dan", "and", "&", "," and optionally "et al."
    const authorPattern = `(?:(?:[A-Z][A-Za-z.-]*)\\s*(?:,\\s*|&\\s*|and\\s+|dan\\s+)?)+(?:\\s+et\\s+al\\.?)?`;
    
    // 2. Single Citation Pattern: Optional author outside, followed by parentheses containing a 4-digit year.
    // Examples: "Author (2020)", "(Author, 2020)", "Author (dalam B, 2020)"
    const singleCitation = `(?:${authorPattern}\\s*)?\\([^()]*\\b\\d{4}\\b[^()]*\\)`;
    
    // 3. Connector Pattern: " dalam ", " dikutip oleh ", " in "
    const connector = `(?:\\s+(?:dalam|dikutip oleh|in)\\s+)`;
    
    // 4. Combined Regex: Matches one citation, optionally followed by nested citations
    const combinedCitationRegex = new RegExp(`${singleCitation}(?:${connector}${singleCitation})*`, 'g');

    const patterns = [ combinedCitationRegex ];

    const found = [];

    await Word.run(async (ctx) => {
      const body = ctx.document.body;
      body.load('text');
      await ctx.sync();

      const text = body.text;

      for (const pattern of patterns) {
        let match;
        pattern.lastIndex = 0;
        while ((match = pattern.exec(text)) !== null) {
          let matchedText = match[0];
          let mIndex = match.index;
          
          // Strip out common Indonesian sentence-starters
          const falsePrefixes = /^(?:Menurut|Berdasarkan|Dalam|Pada|Hal|Namun|Maka|Jadi|Sehingga|Sebagai|Penelitian|Studi|Hasil|Konsep|Teori|Pendekatan|Metode|Analisis|Secara|Bahwa|Untuk|Dengan|Dari|Ke|Di|Ini|Itu)\s*/i;
          let prefixMatch;
          let isGlued = false;
          while ((prefixMatch = matchedText.match(falsePrefixes)) !== null) {
             if (!/\s$/.test(prefixMatch[0])) isGlued = true;
             matchedText = matchedText.substring(prefixMatch[0].length);
             mIndex += prefixMatch[0].length;
          }

          if (!found.find(f => f.text === matchedText && f.matchIndex === mIndex)) {
            found.push({ text: matchedText, matchIndex: mIndex, glued: isGlued });
          }
        }
      }
    });

    // Filter out matches that are subsets of other matches
    const filteredFound = found.filter(f1 => {
      return !found.some(f2 => 
        f1 !== f2 && 
        f1.matchIndex >= f2.matchIndex && 
        (f1.matchIndex + f1.text.length) <= (f2.matchIndex + f2.text.length)
      );
    });

    return filteredFound;
  }

  /**
   * Search for a citation pattern and replace it with a native Mendeley Content Control
   */
  async function replaceCitationWithField(citationText, base64Data, inlineText, glued = false) {
    if (!_isReady) return false;
    let replaced = false;
    await Word.run(async (ctx) => {
      // Search exact text without wildcards (avoids crashing on special chars)
      const searchText = citationText.trim();
      let results = ctx.document.body.search(searchText, { matchCase: false, matchWholeWord: false });
      results.load('items');
      await ctx.sync();
      
      // FALLBACK: If AI hallucinated outer brackets, try removing them and searching again
      if (results.items.length === 0) {
        const noBrackets = searchText.replace(/^[\[(]|[\])]$/g, '').trim();
        if (noBrackets.length > 5 && noBrackets !== searchText) {
          results = ctx.document.body.search(noBrackets, { matchCase: false, matchWholeWord: false });
          results.load('items');
          await ctx.sync();
        }
      }
      
      if (results.items.length > 0) {
        for (let i = 0; i < results.items.length; i++) {
          const range = results.items[i];
          if (glued) {
            range.insertText(' ', Word.InsertLocation.before);
          }
          const cc = range.insertContentControl();
          
          // Note: Mendeley handles identical base64Data (including same citationID) 
          // gracefully for identical citations.
          cc.tag = "MENDELEY_CITATION_v3_" + base64Data;
          cc.appearance = Word.ContentControlAppearance.boundingBox;
          cc.insertText(inlineText, Word.InsertLocation.replace);
        }
        replaced = true;
      }
      await ctx.sync();
    });
    return replaced;
  }

  /**
   * Helper function to bypass Word's 255 char search limit.
   * If search text is > 250 chars, it searches for the first 250 chars and the last 100 chars,
   * then expands the range between them.
   */
  async function findTargetRange(ctx, searchTarget, rep) {
    // Backward-compatible anchor resolution:
    // - find-single => anchor text tunggal
    // - find-start + find-end => anchor range via bookend search + expandTo
    // - find (legacy) => fallback
    const legacyRaw = (rep.find || '');
    const singleRaw = rep['find-single'] ?? '';
    const startRaw = rep['find-start'] ?? '';
    const endRaw = rep['find-end'] ?? '';

    // Decide mode & normalize anchor text
    const mode = (startRaw && endRaw) ? 'range' : (singleRaw ? 'single' : (legacyRaw ? 'legacy' : 'none'));
    if (mode === 'none') return null;

    const normalizeAnchor = (text) => {
      const raw = (text || '');
      let searchText = raw.trim();
      if (!searchText) return '';
      // Normalize: NBSP + zero-width + BOM + whitespace collapse
      searchText = searchText
        .replace(/[\u00A0\u200B\u200C\u200D\uFEFF]/g, ' ')
        .replace(/[\n\r\\\*]+/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim();

      return searchText;
    };

    const rawForBookend = mode === 'legacy' ? legacyRaw : (mode === 'single' ? singleRaw : `${startRaw}\n${endRaw}`);
    let searchText = mode === 'single' ? normalizeAnchor(singleRaw) : (mode === 'legacy' ? normalizeAnchor(legacyRaw) : '');

    if (mode !== 'range' && !searchText) return null;
    if (mode !== 'range' && rep.target_type === 'table') {
        // Direct table search
        const allTables = searchTarget.tables;
        allTables.load('items');
        await ctx.sync();
        for (const tbl of allTables.items) {
            const range = tbl.getRange();
            const results = range.search(searchText, { matchCase: false, ignoreSpace: true, ignorePunct: true });
            results.load('items');
            await ctx.sync();
            if (results.items.length > 0) {
                return tbl.getRange();
            }
        }
    }

    // Normalize: NBSP + zero-width + BOM + whitespace collapse
    searchText = searchText
      .replace(/[\u00A0\u200B\u200C\u200D\uFEFF]/g, ' ')
      .replace(/[\n\r\\\*]+/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();

    let targetRange = null;
    let mIndex = (rep.match_index && typeof rep.match_index === 'number') ? (rep.match_index - 1) : 0;
    if (mIndex < 0) mIndex = 0;

    // Range mode: resolve start/end anchors separately, then expandTo between them
    if (mode === 'range') {
      let startText = normalizeAnchor(startRaw);
      let endText = normalizeAnchor(endRaw);
      if (!startText || !endText) return null;

      const isTocOrHyperlinkStyle = (styleName) => {
        const s = (styleName || '').toLowerCase();
        return s.includes('toc') || s.includes('daftar isi') || s.includes('table of contents') || s.includes('hyperlink');
      };

      const filterByStyle = (items) => {
        return items.filter(item => {
          const s = (item.style || '').toLowerCase();

          if (rep.target_style) {
            const tStyle = rep.target_style.toLowerCase();
            const sParts = s.split(/[,;]/).map(x => x.trim());
            const tParts = tStyle.split(/[,;]/).map(x => x.trim());
            const isMatch = s === tStyle || s.includes(tStyle) || (s !== '' && tStyle.includes(s)) || sParts.some(p => p !== '' && tParts.includes(p));
            return isMatch && !isTocOrHyperlinkStyle(s);
          }

          return !isTocOrHyperlinkStyle(s);
        });
      };

      const doSearch = async (text) => {
        const searchTextLocal = text.length > 250 ? text.substring(0, 250) : text;
        const results = searchTarget.search(searchTextLocal, { matchCase: false, ignoreSpace: true, ignorePunct: true });
        results.load('items/style');
        await ctx.sync();
        return filterByStyle(results.items);
      };

      const validA = await doSearch(startText);
      const validB = await doSearch(endText);

      if (validA.length > mIndex && validB.length > mIndex) {
        targetRange = validA[mIndex].expandTo(validB[mIndex]);
      } else {
        // Fallback bookend: if exact range anchors don't hit, try first/last chunks from provided start/end
        const rawA = startRaw || '';
        const rawB = endRaw || '';
        let chunkA = rawA.trim().substring(0, Math.min(250, rawA.trim().length));
        let chunkB = rawB.trim().substring(0, Math.min(250, rawB.trim().length));

        chunkA = chunkA.replace(/[\n\r\\\*]+/g, ' ').replace(/\s{2,}/g, ' ');
        chunkB = chunkB.replace(/[\n\r\\\*]+/g, ' ').replace(/\s{2,}/g, ' ');

        if (chunkA && chunkB) {
          const [fbA, fbB] = await Promise.all([doSearch(chunkA), doSearch(chunkB)]);
          if (fbA.length > mIndex && fbB.length > mIndex) {
            targetRange = fbA[mIndex].expandTo(fbB[mIndex]);
          }
        }
      }

      if (!targetRange) return null;

      if (rep.target_type === 'paragraph') {
        targetRange = targetRange.paragraphs.getFirst().getRange();
      } else if (rep.target_type === 'table') {
        let parentTable = targetRange.parentTableOrNullObject;
        parentTable.load('isNullObject');
        await ctx.sync();

        if (!parentTable.isNullObject) {
          targetRange = parentTable.getRange();
        } else {
          let tables = targetRange.tables;
          tables.load('items');
          await ctx.sync();
          if (tables.items.length > 0) {
            targetRange = tables.items[0].getRange();
          }
        }
      }
      return targetRange;
    }

    // Non-range: keep legacy behavior using one anchor
    if (searchText.length > 250) searchText = searchText.substring(0, 250);

    const isTocOrHyperlinkStyle = (styleName) => {
      const s = (styleName || '').toLowerCase();
      return s.includes('toc') || s.includes('daftar isi') || s.includes('table of contents') || s.includes('hyperlink');
    };

    const filterByStyle = (items) => {
      return items.filter(item => {
        const s = (item.style || '').toLowerCase();

        if (rep.target_style) {
          const tStyle = rep.target_style.toLowerCase();
          const sParts = s.split(/[,;]/).map(x => x.trim());
          const tParts = tStyle.split(/[,;]/).map(x => x.trim());
          const isMatch = s === tStyle || s.includes(tStyle) || (s !== '' && tStyle.includes(s)) || sParts.some(p => p !== '' && tParts.includes(p));
          return isMatch && !isTocOrHyperlinkStyle(s);
        }

        return !isTocOrHyperlinkStyle(s);
      });
    };

    const doSearch = async (text) => {
      const results = searchTarget.search(text, { matchCase: false, ignoreSpace: true, ignorePunct: true });
      results.load('items/style');
      await ctx.sync();
      return filterByStyle(results.items);
    };

    // 1) Exact-ish search
    const validItems = await doSearch(searchText);
    if (validItems.length > mIndex) {
      targetRange = validItems[mIndex];
    } else {
      // 2) Short-anchor fallback (5–7 words)
      const parts = searchText.split(/\s+/).filter(Boolean);
      const anchorLen = Math.min(7, Math.max(5, parts.length));
      if (parts.length >= 5 && anchorLen <= parts.length) {
        const shortAnchor = parts.slice(0, anchorLen).join(' ');
        if (shortAnchor && shortAnchor !== searchText) {
          const shortValid = await doSearch(shortAnchor);
          if (shortValid.length > mIndex) targetRange = shortValid[mIndex];
        }
      }

      // 3) Bookend fallback
      if (!targetRange) {
        const lines = rawForBookend.split(/[\n\r]+/).filter(l => l.trim().length > 0);
        let chunkA = '';
        let chunkB = '';

        if (lines.length > 1) {
          chunkA = lines[0].trim().substring(0, 250);
          chunkB = lines[lines.length - 1].trim().substring(0, 250);
        } else {
          let chunkLen = Math.min(40, Math.floor(rawForBookend.length / 3));
          if (chunkLen > 10) {
            chunkA = rawForBookend.substring(0, chunkLen).trim();
            chunkB = rawForBookend.substring(rawForBookend.length - chunkLen).trim();
          }
        }

        if (chunkA && chunkB) {
          chunkA = chunkA.replace(/[\n\r\\\*]+/g, ' ').replace(/\s{2,}/g, ' ');
          chunkB = chunkB.replace(/[\n\r\\\*]+/g, ' ').replace(/\s{2,}/g, ' ');

          const [validA, validB] = await Promise.all([doSearch(chunkA), doSearch(chunkB)]);
          if (validA.length > mIndex && validB.length > mIndex) {
            targetRange = validA[mIndex].expandTo(validB[mIndex]);
          }
        }
      }
    }

    if (!targetRange) return null;

    if (rep.target_type === 'paragraph') {
      targetRange = targetRange.paragraphs.getFirst().getRange();
    } else if (rep.target_type === 'table') {
      // Jika AI menargetkan teks di dalam tabel, tapi ingin keluar dari tabel itu
      // kita perlu mengambil tabel induk yang benar-benar menaungi anchor.
      let parentTable = targetRange.parentTableOrNullObject;
      parentTable.load('isNullObject');
      await ctx.sync();

      if (!parentTable.isNullObject) {
        targetRange = parentTable.getRange();
      } else {
        // Fallback untuk kompatibilitas Word/Office.js versi tertentu
        let tables = targetRange.tables;
        tables.load('items');
        await ctx.sync();
        if (tables.items.length > 0) {
          targetRange = tables.items[0].getRange();
        }
      }
    }
    return targetRange;
  }

  /**
   * Helper to insert text with basic markdown support (*italic*, **bold**) and optional styling
   */
  function insertMarkdown(range, text, location, styleName, forceParagraphBlock = false) {
      if (!text) return;

      // Hanya masuk jalur HTML jika benar-benar ada markdown/newline.
      // forceParagraphBlock hanya mempengaruhi struktur paragraf, bukan jenis API.
      const hasMarkdown =
        text.includes('*') ||
        text.includes('\n') ||
        text.includes('_');

      if (hasMarkdown) {
          let html = text.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
          html = html.replace(/\*(.*?)\*/g, '<i>$1</i>');
          html = html.replace(/_(.*?)_/g, '<i>$1</i>');
          
          let paragraphs = html.split(/\n+/).map(p => p.trim()).filter(p => p);
          let currentRange = range;
          
          for (let i = 0; i < paragraphs.length; i++) {
              let pText = paragraphs[i];
              let spanHtml = `<span style="font-weight:normal; font-style:normal;">${pText}</span>`;
              let parRange;
              
              if (forceParagraphBlock || i > 0) {
                  // Gunakan API native Word untuk membuat blok paragraf baru.
                  // Tetap insertHtml di sini karena memang ada markdown/newline.
                  let loc = (i === 0) ? location : Word.InsertLocation.after;
                  let newPar = currentRange.insertParagraph("", loc);
                  parRange = newPar.getRange();
                  parRange.insertHtml(spanHtml, Word.InsertLocation.start);
                  currentRange = parRange;
              } else {
                  currentRange = currentRange.insertHtml(spanHtml, location);
                  parRange = currentRange;
              }
              
              if (styleName) {
                  try {
                      if (parRange.paragraphs) {
                          parRange.paragraphs.getFirst().style = styleName;
                      } else {
                          parRange.style = styleName;
                      }
                  } catch (e) {
                      console.warn("Gagal menerapkan style paragraf:", e);
                  }
              }
          }
      } else {
          // Teks plain: hindari insertHtml agar Word tidak menambahkan spasi tak terlihat.
          if (forceParagraphBlock) {
              const newPar = range.insertParagraph(text, location);
              if (styleName) {
                  try {
                      newPar.paragraphs.getFirst().style = styleName;
                  } catch (e) {
                      try { newPar.style = styleName; } catch (_) {}
                      console.warn("Gagal menerapkan style paragraf:", e);
                  }
              }
          } else {
              // Reset font properties to combat bold inheritance
              const newRange = range.insertText(text, location);
              newRange.font.bold = false;
              newRange.font.italic = false;
              if (styleName) {
                  try {
                      if (newRange.paragraphs) {
                          newRange.paragraphs.getFirst().style = styleName;
                      } else {
                          newRange.style = styleName;
                      }
                  } catch (e) {
                      console.warn("Gagal menerapkan style teks:", e);
                  }
              }
          }
      }
  }

  /**
   * Search and replace specific texts in the current selection
   */
  async function searchAndReplaceSelection(replacements, silentUndo = false) {
    if (!_isReady || !replacements || !replacements.length) return;
    console.log('[OfficeBridge] searchAndReplaceSelection start', { count: replacements.length });

    try {
      await Word.run(async (ctx) => {
        const searchTarget = ctx.document.body;
        let successCount = 0;
        let lastFailedText = "";

        for (const rep of replacements) {
          if (!rep.find || rep.replace === undefined) continue;

          if (rep.replace_all) {
            const searchText = ((rep['find-single'] ?? rep.find) || '').trim().replace(/\n/g, ' ');
            const results = searchTarget.search(searchText, {
              matchCase: false,
              ignoreSpace: true,
              ignorePunct: true
            });
            results.load('items');
            await ctx.sync();

            if (results.items.length > 0) {
              // Jika silentUndo aktif, replace sekaligus tanpa animasi
              if (silentUndo) {
                for (let i = 0; i < results.items.length; i++) {
                  insertMarkdown(results.items[i], rep.replace, Word.InsertLocation.replace, rep.style);
                }
                await ctx.sync();
              } else {
                for (let i = 0; i < results.items.length; i++) {
                  results.items[i].select(); // Auto-scroll
                  results.items[i].insertText("", Word.InsertLocation.replace);
                  await ctx.sync();
                  // Panggil stream efek ngetik (harus lepas dari Word.run sementara)
                  startLiveStream(false);
                  appendLiveStream(rep.replace);
                  await stopLiveStream();
                }
              }
              successCount++;
            } else {
              lastFailedText = rep.find;
            }
          } else {
            const targetRange = await findTargetRange(ctx, searchTarget, rep);
            if (targetRange) {
              if (silentUndo) {
                insertMarkdown(targetRange, rep.replace, Word.InsertLocation.replace, rep.style);
                await ctx.sync();
              } else {
                targetRange.select();
                targetRange.insertText("", Word.InsertLocation.replace); // Hapus dulu
                await ctx.sync();
                // Stream ngetik live
                startLiveStream(false);
                appendLiveStream(rep.replace);
                await stopLiveStream();
              }
              
              // Simpan state untuk Undo
              if (rep.actionId !== null) {
                const id = rep.actionId || generateId();
                undoStack[id] = {
                  type: 'replace',
                  original_text: rep.find,
                  replaced_with: rep.replace
                };
              }
              
              successCount++;
            } else {
              lastFailedText = rep.find;
            }
          }
        }

        if (successCount === 0 && lastFailedText) {
          throw new Error(
            `Target teks tidak ditemukan: "${lastFailedText}". JANGAN gunakan operasi replace/delete untuk memodifikasi struktur TABEL. Jika Anda ingin mengedit isi tabel, gunakan tool 'table' untuk membuat ulang seluruh tabel tersebut.`
          );
        }

        await ctx.sync();
      });
    } catch (err) {
      console.error('[OfficeBridge] searchAndReplaceSelection failed:', err);
      throw new Error(`searchAndReplaceSelection failed: ${err?.message || err}`);
    }
  }

  /**
   * Search and delete specific texts
   */
  async function deleteSelection(deletions) {
    if (!_isReady || !deletions || !deletions.length) return;
    await Word.run(async (ctx) => {
      const searchTarget = ctx.document.body;
      for (const rep of deletions) {
        const hasAnchor =
          (rep.find && String(rep.find).trim().length > 0) ||
          (rep['find-single'] && String(rep['find-single']).trim().length > 0) ||
          (rep['find-start'] && String(rep['find-start']).trim().length > 0) ||
          (rep['find-end'] && String(rep['find-end']).trim().length > 0);

        if (!hasAnchor) continue;

        const targetRange = await findTargetRange(ctx, searchTarget, rep);
        if (targetRange) {
           if (rep.target_type === 'paragraph') {
               const p = targetRange.paragraphs.getFirst();
               p.delete();
           } else if (rep.target_type === 'table') {
               targetRange.delete();
           } else {
               targetRange.insertText('', Word.InsertLocation.replace);
           }
        }
      }
      await ctx.sync();
    });
  }

  /**
   * Search and comment on specific texts
   */
  async function addCommentSelection(comments) {
    if (!_isReady || !comments || !comments.length) return;
    await Word.run(async (ctx) => {
      const searchTarget = ctx.document.body;
      for (const rep of comments) {
        const hasAnchor =
          (rep.find && String(rep.find).trim().length > 0) ||
          (rep['find-single'] && String(rep['find-single']).trim().length > 0) ||
          (rep['find-start'] && String(rep['find-start']).trim().length > 0) ||
          (rep['find-end'] && String(rep['find-end']).trim().length > 0);

        if (!hasAnchor || !rep.comment) continue;

        const targetRange = await findTargetRange(ctx, searchTarget, rep);
        if (targetRange) {
           targetRange.insertComment(rep.comment);
        }
      }
      await ctx.sync();
    });
  }

  /**
   * Insert new text before or after a specific target text
   */
  async function insertTextAtTarget(insertions) {
    if (!_isReady || !insertions || !insertions.length) return;
    await Word.run(async (ctx) => {
      // Use the whole body to search so it finds text anywhere in the document
      const body = ctx.document.body;
      let successCount = 0;
      let lastFailedText = "";
      
      for (const req of insertions) {
        if (!req.insert) continue;
        
        // Fitur baru: Insert di awal atau akhir dokumen tanpa anchor text
        if (req.location === 'start' || req.target === 'start') {
           insertMarkdown(body, req.insert.trim() + "\n", Word.InsertLocation.start, req.style);
           successCount++;
           continue;
        }
        if (req.location === 'end' || req.target === 'end') {
           insertMarkdown(body, "\n" + req.insert.trim(), Word.InsertLocation.end, req.style);
           successCount++;
           continue;
        }
        
        // Resolve target text/range anchors (legacy + new fields)
        // - if req.after/before provided => treat as before/after anchor (legacy behavior)
        // - if req has find-single => pass it through
        // - if req has find-start/find-end => pass them through
        // - fallback to legacy req.find
        let mockRep = {
          match_index: req.match_index,
          target_style: req.target_style
        };
        // Tambahkan target_type ke mockRep agar findTargetRange bisa menggunakannya
        if (req.target_type) {
          mockRep.target_type = req.target_type;
        }

        // Keep behavior for after/before (insert tool already uses after/before directly)
        if (req.after || req.before) {
          let targetText = req.after || req.before;
          if (!targetText) continue;
          mockRep.find = targetText.replace(/\|/g, '');
        } else if (req['find-single'] || req.find || req['find-start']) {
          if (req['find-single']) mockRep['find-single'] = String(req['find-single']).replace(/\|/g, '');
          if (req['find-start']) mockRep['find-start'] = String(req['find-start']).replace(/\|/g, '');
          if (req['find-end']) mockRep['find-end'] = String(req['find-end']).replace(/\|/g, '');
          if (!mockRep['find-single'] && !mockRep['find-start'] && !mockRep['find-end'] && req.find) {
            mockRep.find = String(req.find).replace(/\|/g, '');
          }
        } else {
          let targetText = req.find;
          if (!targetText) continue;
          mockRep.find = targetText.replace(/\|/g, '');
        }
        
        const targetRange = await findTargetRange(ctx, body, mockRep);
        
        if (targetRange) {
          // Normalisasi: jika input berniat membuat paragraf baru (new_line/forceParagraphBlock),
          // jangan biarkan interpretasi "table" menarget sel/area tabel.


          let forceBlock = req.target_type === 'paragraph' || req.new_line === true || req.target_type === 'table';
          if (req.after) {
            insertMarkdown(targetRange, req.insert.trim(), Word.InsertLocation.after, req.style, forceBlock);
          } else if (req.before || req.find) {
            insertMarkdown(targetRange, req.insert.trim(), Word.InsertLocation.before, req.style, forceBlock);
          }
          successCount++;
        } else {
          lastFailedText = req.find.substring(0, 50);
        }
      }
      
      if (successCount === 0 && lastFailedText) {
         throw new Error(`Target teks tidak ditemukan di dokumen: "${lastFailedText}". Pastikan teks benar-benar ada di dokumen Word (jangan menyertakan format markdown seperti '|').`);
      }
      
      await ctx.sync();
    });
  }

  /**
   * Search and highlight specific texts
   */
  async function highlightSelection(highlights) {
    if (!_isReady || !highlights || !highlights.length) return;
    await Word.run(async (ctx) => {
      const searchTarget = ctx.document.body;
      for (const rep of highlights) {
        const hasAnchor =
          (rep.find && String(rep.find).trim().length > 0) ||
          (rep['find-single'] && String(rep['find-single']).trim().length > 0) ||
          (rep['find-start'] && String(rep['find-start']).trim().length > 0) ||
          (rep['find-end'] && String(rep['find-end']).trim().length > 0);

        if (!hasAnchor || !rep.color) continue;

        const targetRange = await findTargetRange(ctx, searchTarget, rep);
        if (targetRange) {
           targetRange.font.highlightColor = rep.color;
        }
      }
      await ctx.sync();
    });
  }

  /**
   * Insert or Replace with Table (Using insertHtml for Maximum Stability)
   */
  async function insertTableSelection(tableCommand) {
    if (!_isReady || !tableCommand) return;
    
    let tableData = null;
    let expectedCols = 0;

    // Cari array data
    if (Array.isArray(tableCommand)) {
        tableData = tableCommand;
    } else if (typeof tableCommand === 'object') {
        for (const key of ['data', 'content', 'table', 'rows', 'values']) {
            if (Array.isArray(tableCommand[key])) {
                tableData = tableCommand[key];
                break;
            }
        }
        if (tableCommand.cols) expectedCols = parseInt(tableCommand.cols, 10);
    }
    
    if (!tableData || !Array.isArray(tableData) || !tableData.length) return;
    
    // Gabungkan headers ke dalam tableData jika ada
    let hasHeader = false;
    if (tableCommand.headers && Array.isArray(tableCommand.headers)) {
        tableData = [tableCommand.headers, ...tableData];
        hasHeader = true;
    }
    
    // Pecah array 1D menjadi 2D
    if (!Array.isArray(tableData[0]) && expectedCols > 0) {
        const chunked = [];
        for (let i = 0; i < tableData.length; i += expectedCols) {
            chunked.push(tableData.slice(i, i + expectedCols));
        }
        tableData = chunked;
    }
    
    // Bangun HTML String
    let htmlTable = '<table style="width:100%; border-collapse:collapse; border:1px solid #000;">';
    
    // Padding baris yang kurang panjang agar rapi secara visual
    const maxCols = Math.max(...tableData.map(row => Array.isArray(row) ? row.length : 1));
    
    tableData.forEach((row, rowIndex) => {
        htmlTable += '<tr>';
        const cells = Array.isArray(row) ? row : [row];
        for (let c = 0; c < maxCols; c++) {
            const cellText = c < cells.length ? String(cells[c] || "") : "";
            const isHead = hasHeader && rowIndex === 0;
            const tag = isHead ? 'th' : 'td';
            const bg = isHead ? 'background-color:#f0f0f0; font-weight:bold;' : '';
            htmlTable += `<${tag} style="border:1px solid #000; padding:8px; text-align:left; ${bg}">${cellText.replace(/\n/g, '<br/>')}</${tag}>`;
        }
        htmlTable += '</tr>';
    });
    
    htmlTable += '</table><p style="margin: 12px 0;">&nbsp;</p>'; // Tambah spasi paragraf di akhir agar tabel tidak menempel
    
    await Word.run(async (ctx) => {
      let newRange;
      if (tableCommand.action === 'replace_selection') {
        const sel = ctx.document.getSelection();
        newRange = sel.insertHtml(htmlTable, Word.InsertLocation.replace);
      } else {
        const body = ctx.document.body;
        
        let targetText = tableCommand.after || tableCommand.before || tableCommand.find;
        if (targetText) {
            const mockRep = {
               find: targetText.replace(/\|/g, ''),
               match_index: tableCommand.match_index,
               target_style: tableCommand.target_style
            };
            const targetRange = await findTargetRange(ctx, body, mockRep);
            
            if (targetRange) {
                const parentTable = targetRange.parentTableOrNullObject;
                parentTable.load('isNullObject');
                await ctx.sync();
                
                let insertTarget;
                if (!parentTable.isNullObject) {
                    insertTarget = parentTable.getRange();
                } else {
                    insertTarget = targetRange.paragraphs.getFirst().getRange();
                }

                if (tableCommand.after) {
                    newRange = insertTarget.insertHtml(htmlTable, Word.InsertLocation.after);
                } else {
                    newRange = insertTarget.insertHtml(htmlTable, Word.InsertLocation.before);
                }
            } else {
                newRange = body.insertHtml(htmlTable, Word.InsertLocation.end); // fallback
            }
        } else if (tableCommand.location === 'start') {
            newRange = body.insertHtml(htmlTable, Word.InsertLocation.start);
        } else {
            newRange = body.insertHtml(htmlTable, Word.InsertLocation.end);
        }
      }
      
      if (newRange) {
          const tables = newRange.tables;
          tables.load('items');
          await ctx.sync();
          if (tables.items.length > 0) {
              try {
                  const tbl = tables.items[0];
                  
                  // AutoFit ke konten agar lebar kolom proporsional dan lebih rapi
                  tbl.autoFitContents();
                  
                  if (tableCommand.style) {
                      tbl.style = tableCommand.style;
                  } else {
                      // Fallback style rapi jika AI tidak memberikan
                      tbl.style = "Grid Table 1 Light";
                  }
                  
                  if (tableCommand.cell_style) {
                      // Gunakan getRange().paragraphs untuk memastikan semua paragraf di dalam sel
                      const rows = tbl.rows;
                      rows.load('items');
                      await ctx.sync();
                      for (const row of rows.items) {
                          const cells = row.cells;
                          cells.load('items');
                          await ctx.sync();
                          for (const cell of cells.items) {
                              const paras = cell.getRange().paragraphs;
                              paras.load('items/style');
                              await ctx.sync();
                              for (const p of paras.items) {
                                  p.style = tableCommand.cell_style;
                              }
                          }
                      }
                      await ctx.sync(); // Sync setelah semua style diterapkan
                  }
                  
                  await ctx.sync();
              } catch(e) {
                  console.warn("Gagal menerapkan format tabel lanjutan: ", e);
              }
          }
      }
    });
  }

  /**
   * Edit existing table (Add/Delete rows or columns)
   */
  async function editTableSelection(edits) {
    if (!_isReady || !edits || !edits.length) return;
    await Word.run(async (ctx) => {
      let table;
      const tableIndex = edits[0].table_index;
      
      if (tableIndex !== undefined) {
          const allTables = ctx.document.body.tables;
          allTables.load('items');
          await ctx.sync();
          const idx = parseInt(tableIndex, 10);
          if (allTables.items.length > idx && idx >= 0) {
              table = allTables.items[idx];
          } else {
              throw new Error(`Tabel dengan indeks ${idx} tidak ditemukan. Dokumen hanya memiliki ${allTables.items.length} tabel.`);
          }
      } else {
          const sel = ctx.document.getSelection();
          const tables = sel.tables;
          tables.load('items');
          await ctx.sync();
          
          if (tables.items.length === 0) {
            throw new Error("Kursor tidak berada di dalam tabel manapun. Tambahkan 'table_index' (misal: 0 untuk tabel pertama) pada JSON Anda untuk mengedit tanpa kursor.");
          }
          table = tables.items[0];
      }
      
      for (const edit of edits) {
        if (edit.action === 'delete_column') {
            const index = parseInt(edit.index, 10);
            if (!isNaN(index)) {
                const cols = table.columns;
                cols.load('items');
                await ctx.sync();
                if (index < cols.items.length) cols.items[index].delete();
            }
        } else if (edit.action === 'delete_row') {
            const index = parseInt(edit.index, 10);
            if (!isNaN(index)) {
                const rows = table.rows;
                rows.load('items');
                await ctx.sync();
                if (index < rows.items.length) rows.items[index].delete();
            }
        } else if (edit.action === 'add_row') {
            const values = Array.isArray(edit.data) ? [edit.data.map(c => String(c))] : undefined;
            if (edit.index === 'start') {
                table.addRows(Word.InsertLocation.start, 1, values);
            } else if (edit.index === 'end') {
                table.addRows(Word.InsertLocation.end, 1, values);
            } else {
                const idx = parseInt(edit.index, 10);
                if (!isNaN(idx)) {
                    const rows = table.rows;
                    rows.load('items');
                    await ctx.sync();
                    if (idx < rows.items.length) {
                        rows.items[idx].insertRows(Word.InsertLocation.before, 1, values);
                    } else {
                        table.addRows(Word.InsertLocation.end, 1, values);
                    }
                }
            }
            await ctx.sync();
        } else if (edit.action === 'add_column') {
            let colData;
            if (Array.isArray(edit.data)) colData = edit.data.map(c => [String(c)]);
            if (edit.index === 'start') {
                table.addColumns(Word.InsertLocation.start, 1, colData);
            } else if (edit.index === 'end') {
                table.addColumns(Word.InsertLocation.end, 1, colData);
            } else {
                const idx = parseInt(edit.index, 10);
                if (!isNaN(idx)) {
                    const cols = table.columns;
                    cols.load('items');
                    await ctx.sync();
                    if (idx < cols.items.length) {
                        cols.items[idx].insertColumns(Word.InsertLocation.before, 1, colData);
                    } else {
                        table.addColumns(Word.InsertLocation.end, 1, colData);
                    }
                }
            }
        } else if (edit.action === 'edit_cell') {
            const r = parseInt(edit.row_index, 10);
            const c = parseInt(edit.column_index, 10);
            if (!isNaN(r) && !isNaN(c)) {
                table.getCell(r, c).value = String(edit.value);
            }
        } else if (edit.action === 'merge_cells') {
            let r1 = edit.start_row;
            let r2 = edit.end_row;
            if (r1 === 'end' || r2 === 'end') {
                const rows = table.rows;
                rows.load('items');
                await ctx.sync();
                if (r1 === 'end') r1 = rows.items.length - 1;
                if (r2 === 'end') r2 = rows.items.length - 1;
            }
            r1 = parseInt(r1, 10);
            r2 = parseInt(r2, 10);
            const c1 = parseInt(edit.start_column, 10);
            const c2 = parseInt(edit.end_column, 10);
            if (!isNaN(r1) && !isNaN(c1) && !isNaN(r2) && !isNaN(c2)) {
                const firstCell = table.getCell(r1, c1);
                const lastCell = table.getCell(r2, c2);
                firstCell.merge(lastCell); // Using TableCell.merge API (WordApi 1.3)
            }
        } else if (edit.action === 'split_cell') {
            const r = parseInt(edit.row_index, 10);
            const c = parseInt(edit.column_index, 10);
            const rows = parseInt(edit.row_count, 10) || 1;
            const cols = parseInt(edit.column_count, 10) || 2;
            if (!isNaN(r) && !isNaN(c)) {
                const cell = table.getCell(r, c);
                cell.split(rows, cols); // Using TableCell.split API (WordApi 1.4)
            }
        } else if (edit.action === 'delete_table') {
            table.delete();
        } else if (edit.action === 'apply_cell_style') {
            const styleName = edit.style;
            if (!styleName) continue;
            // Ambil semua paragraf dalam tabel
            const range = table.getRange();
            const paragraphs = range.paragraphs;
            paragraphs.load('items');
            await ctx.sync();
            for (const p of paragraphs.items) {
                p.style = styleName;
            }
            await ctx.sync();
        }
      }
      await ctx.sync();
    });
  }

  /**
   * Search and format specific texts
   */
  async function formatSelection(formats) {
    if (!_isReady || !formats || !formats.length) return;
    await Word.run(async (ctx) => {
      const searchTarget = ctx.document.body;
      for (const rep of formats) {
        const hasAnchor =
          (rep.find && String(rep.find).trim().length > 0) ||
          (rep['find-single'] && String(rep['find-single']).trim().length > 0) ||
          (rep['find-start'] && String(rep['find-start']).trim().length > 0) ||
          (rep['find-end'] && String(rep['find-end']).trim().length > 0);

        if (!hasAnchor || !rep.apply) continue;

        let targetRange = await findTargetRange(ctx, searchTarget, rep);
        if (targetRange) {
           if (rep.target) {
              const subSearch = targetRange.search(rep.target, { matchCase: true, matchWholeWord: false });
              subSearch.load('items');
              await ctx.sync();
              if (subSearch.items.length > 0) {
                 targetRange = subSearch.items[0];
              }
           }
           
           const font = targetRange.font;
           if (rep.apply === 'subscript') font.subscript = true;
           if (rep.apply === 'superscript') font.superscript = true;
           if (rep.apply === 'bold') font.bold = true;
           if (rep.apply === 'italic') font.italic = true;
           if (rep.apply === 'unsubscript') font.subscript = false;
           if (rep.apply === 'unsuperscript') font.superscript = false;
           if (rep.apply === 'unbold') font.bold = false;
           if (rep.apply === 'unitalic') font.italic = false;
        }
      }
      await ctx.sync();
    });
  }

  function htmlToMarkdown(htmlString) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlString, 'text/html');
    
    function traverse(node) {
      if (node.nodeType === 3) {
          // Collapse source code newlines and multiple spaces into a single space
          return node.textContent.replace(/[\r\n]+/g, ' ').replace(/\s{2,}/g, ' ');
      }
      
      let res = '';
      for (const child of node.childNodes) {
          // Skip Word comments to prevent inline text pollution
          if (child.nodeType === 1) {
              const cls = (child.className || '').toString().toLowerCase();
              const id = (child.id || '').toString().toLowerCase();
              const nameAttr = (child.getAttribute && child.getAttribute('name') ? child.getAttribute('name').toLowerCase() : '');
              const styleAttr = (child.getAttribute && child.getAttribute('style') ? child.getAttribute('style').toLowerCase() : '');
              
              if (cls.includes('comment') || 
                  id.includes('com_') || id.includes('msoanchor') ||
                  nameAttr.includes('msoanchor') || nameAttr.includes('msocom') ||
                  styleAttr.includes('mso-element:comment')) {
                  continue;
              }
          }
          res += traverse(child);
      }
      
      const tag = node.nodeName.toLowerCase();
      // Detect Word's inline styles or native tags
      const isBold = tag === 'b' || tag === 'strong' || (node.style && (node.style.fontWeight === 'bold' || parseInt(node.style.fontWeight) >= 700));
      const isItalic = tag === 'i' || tag === 'em' || (node.style && node.style.fontStyle === 'italic');
      const isUnderline = tag === 'u' || (node.style && node.style.textDecoration && node.style.textDecoration.includes('underline'));
      const isStrike = tag === 's' || tag === 'strike' || tag === 'del' || (node.style && node.style.textDecoration && node.style.textDecoration.includes('line-through'));
      const isSup = tag === 'sup' || (node.style && node.style.verticalAlign === 'super');
      const isSub = tag === 'sub' || (node.style && node.style.verticalAlign === 'sub');
      
      // Formatting wrappers
      if (res.trim().length > 0) {
        if (isBold) res = `**${res}**`;
        if (isItalic) res = `_${res}_`;
        if (isUnderline) res = `<u>${res}</u>`;
        if (isStrike) res = `~~${res}~~`;
        if (isSup) res = `<sup>${res}</sup>`;
        if (isSub) res = `<sub>${res}</sub>`;
      }
      
      // Headings
      if (tag.match(/^h[1-6]$/)) {
        const level = parseInt(tag[1]);
        res = `\n${'#'.repeat(level)} ${res.trim()}\n`;
      }
      
      // Blocks
      if (tag === 'p') {
          if (!res.endsWith('\n')) res += '\n';
      }
      if (tag === 'br') res += '\n';
      
      // Lists
      if (tag === 'li') {
          res = `- ${res.trim()}\n`;
      }
      
      // Tables (Markdown format)
      if (tag === 'tr') res += ' |\n';
      if (tag === 'td' || tag === 'th') res = `| ${res.replace(/\n/g, ' ').trim()} `;
      
      return res;
    }
    
    return traverse(doc.body).replace(/\n{3,}/g, '\n\n').trim();
  }

  /**
   * Get all text from the document body, including paragraph styles.
   */
  async function getAllText() {
    if (!_isReady) return "";
    let text = "";
    try {
      await Word.run(async (ctx) => {
        const paragraphs = ctx.document.body.paragraphs;
        paragraphs.load('text, style');
        const tables = ctx.document.body.tables;
        tables.load('values');
        await ctx.sync();
        
        let lines = [];
        paragraphs.items.forEach(p => {
            let t = p.text.replace(/[\r\n]+$/, '');
            if (t.trim() === '') {
                lines.push('');
            } else {
                if (p.style && p.style !== 'Normal') {
                    lines.push(`[STYLE: ${p.style}]\n${t}`);
                } else {
                    lines.push(t);
                }
            }
        });
        
        // Reconstruct Tables into Markdown
        tables.items.forEach(table => {
            const cellsInfo = [];
            table.values.forEach(row => {
                row.forEach(cellText => {
                    let cText = cellText.replace(/[\r\n]+$/, '');
                    let cLines = cText.split(/[\r\n]+/).map(x => x.trim()).filter(x => x);
                    if (cLines.length === 0) cLines = [""]; // Empty cell occupies 1 paragraph minimally
                    cellsInfo.push(cLines);
                });
            });
            
            // Search for this sequence of cells in the lines array
            for (let i = 0; i < lines.length; i++) {
                let match = true;
                let pIndex = i;
                for (let j = 0; j < cellsInfo.length; j++) {
                    let cLines = cellsInfo[j];
                    for (let k = 0; k < cLines.length; k++) {
                        if (pIndex >= lines.length) { match = false; break; }
                        let lineText = lines[pIndex].replace(/^\[STYLE: .*?\][\r\n]+/, '');
                        let cleanLine = lineText.replace(/[\u0000-\u001F\u007F-\u009F\u200B]/g, "").trim();
                        let cleanCellLine = cLines[k].replace(/[\u0000-\u001F\u007F-\u009F\u200B]/g, "").trim();
                        if (cleanLine !== cleanCellLine) {
                            match = false;
                            break;
                        }
                        pIndex++;
                    }
                    if (!match) break;
                }
                
                if (match && cellsInfo.length > 0) {
                    // Convert table to Markdown string
                    let mdTable = "";
                    table.values.forEach((row, rIdx) => {
                        let rowStr = "| " + row.map(c => c.replace(/[\r\n]+$/, '').replace(/[\r\n]+/g, '<br>').replace(/\|/g, '\\|')).join(" | ") + " |";
                        mdTable += rowStr + "\n";
                        if (rIdx === 0) {
                            mdTable += "|" + row.map(() => "---").join("|") + "|\n";
                        }
                    });
                    
                    // Replace the matched lines with the Markdown table
                    lines.splice(i, pIndex - i, mdTable.trim());
                    break; // Move to next table
                }
            }
        });
        
        text = lines.join('\n');
      });
    } catch (err) {
      console.warn("Error getting all text:", err);
    }
    return text;
  }

  /**
   * Get all unique styles used in the document.
   */
  async function getAllStyles() {
    if (!_isReady) return [];
    let styles = new Set();
    try {
      await Word.run(async (ctx) => {
        const docStyles = ctx.document.getStyles();
        docStyles.load('items/nameLocal, items/builtIn');
        
        const paragraphs = ctx.document.body.paragraphs;
        paragraphs.load('style');
        
        await ctx.sync();
        
        let usedStyles = new Set();
        paragraphs.items.forEach(p => {
          if (p.style) usedStyles.add(p.style);
        });

        docStyles.items.forEach(s => {
          if (s.nameLocal) {
              const name = s.nameLocal;
              const upper = name.toUpperCase();
              
              // Skip obvious Microsoft Word garbage
              if (upper !== 'TABLE' && (
                  name.includes('Grid Table') || 
                  name.includes('List Table') || 
                  name.includes('Colorful') || 
                  name.includes('Plain Table') || 
                  name.startsWith('HTML ')
              )) {
                  return; 
              }
              
              // Include the style IF it is a custom user style (!s.builtIn), 
              // OR if it's actively used in the document,
              // OR if it's a crucial structural style like Normal, Heading, TOC.
              if (!s.builtIn || usedStyles.has(name) || name === 'Normal' || name.startsWith('Heading ') || name.startsWith('TOC ')) {
                  styles.add(name);
              }
          }
        });
      });
    } catch (err) {
      console.warn("Error getting styles via getStyles, falling back to paragraph parsing:", err);
      // Fallback for older Word API versions
      try {
          await Word.run(async (ctx) => {
            const paragraphs = ctx.document.body.paragraphs;
            paragraphs.load('style');
            await ctx.sync();
            paragraphs.items.forEach(p => {
              if (p.style) styles.add(p.style);
            });
          });
      } catch(e) {}
    }
    return Array.from(styles);
  }

  /**
   * Get currently selected text, including paragraph styles.
   */
  async function getSelectedText() {
    if (!_isReady) return "";
    let text = "";
    try {
      await Word.run(async (ctx) => {
        const sel = ctx.document.getSelection();
        const paragraphs = sel.paragraphs;
        paragraphs.load('text, style');
        await ctx.sync();
        
        let lines = [];
        paragraphs.items.forEach(p => {
            let t = p.text.replace(/[\r\n]+$/, '');
            if (t.trim() === '') {
                lines.push('');
            } else {
                if (p.style && p.style !== 'Normal') {
                    lines.push(`[STYLE: ${p.style}]\n${t}`);
                } else {
                    lines.push(t);
                }
            }
        });
        text = lines.join('\n');
      });
    } catch (err) {
      console.warn("No selection or error getting selection:", err);
    }
    return text;
  }

  /**
   * Scan document for Mendeley citations (both AutoBib and native Mendeley Cite)
   * and extract their CSL JSON data
   */
  async function extractMendeleyCitations() {
    if (!_isReady) return [];
    let items = [];
    await Word.run(async (ctx) => {
      const controls = ctx.document.contentControls;
      // Load tag AND the xml body for each control
      controls.load('items/tag,items/text');
      await ctx.sync();
      
      for (const cc of controls.items) {
        const tag = cc.tag || '';
        const ccText = (cc.text || '').trim();
        
        // Ignore bibliography controls or leftover empty "ghost" controls
        if (tag.includes('BIBLIOGRAPHY') || tag.includes('bibliography')) continue;
        if (ccText.length === 0) continue;
        
        // ── Format 1: AutoBib (base64 JSON in tag) ────────────
        if (tag.startsWith('MENDELEY_CITATION_v3_') && tag.length > 22) {
          try {
            const b64 = tag.replace('MENDELEY_CITATION_v3_', '');
            const decoded = decodeURIComponent(escape(atob(b64)));
            const data = JSON.parse(decoded);
            
            // Legacy AutoBib format: Array of items
            if (Array.isArray(data)) {
              data.forEach(d => {
                if (d.csl_json) items.push(d.csl_json);
                else if (d.itemData) items.push(d.itemData);
              });
            } 
            // Native Mendeley format: Object with citationItems
            else if (data && data.citationItems && Array.isArray(data.citationItems)) {
              data.citationItems.forEach((ci) => {
                if (ci.itemData) items.push(ci.itemData);
                else if (ci.csl_json) items.push(ci.csl_json);
              });
            }
          } catch (e) { console.error('AutoBib tag parse error', e); }
        }
        
        // ── Format 2: Native Mendeley Cite (JSON stored in text/XML body) ─
        // Native Mendeley Cite stores a JSON field code in the content control
        // The text body often starts with CSL JSON wrapped in a Mendeley XML field
        else if (tag.startsWith('MENDELEY_CITATION') || tag.includes('mendeley')) {
          try {
            cc.load('text');
            await ctx.sync();
            // The text is usually the inline citation like (Author, Year)
            // We need to get the OOXML to read the hidden JSON payload
            const ooxmlRange = cc.getOoxml();
            await ctx.sync();
            const xml = ooxmlRange.value;
            // Mendeley stores the JSON in a w:fldChar instrText element
            const instrMatch = xml.match(/<w:instrText[^>]*>(.*?)<\/w:instrText>/s);
            if (instrMatch) {
              const instr = instrMatch[1];
              const jsonStart = instr.indexOf('{');
              if (jsonStart !== -1) {
                const jsonStr = instr.substring(jsonStart);
                const citData = JSON.parse(jsonStr);
                if (citData.citationItems) {
                  citData.citationItems.forEach((ci) => {
                    if (ci.itemData) items.push(ci.itemData);
                  });
                }
              }
            }
          } catch (e) { console.error('Native Mendeley parse error', e); }
        }
      }
    });
    
    // Deduplicate by id or title
    const unique = [];
    const seen = new Set();
    for (const item of items) {
      const key = item.id || item.DOI || item.title;
      if (key && !seen.has(key)) {
        seen.add(key);
        unique.push(item);
      }
    }
    
    // Sort alphabetically by first author
    unique.sort((a, b) => {
      const nameA = a.author?.[0]?.family || a.author?.[0]?.literal || 'Z';
      const nameB = b.author?.[0]?.family || b.author?.[0]?.literal || 'Z';
      return nameA.localeCompare(nameB);
    });
    
    return unique;
  }

  /**
   * Insert a Mendeley-compatible Bibliography Content Control at cursor
   */
  async function insertBibliography(htmlContent) {
    if (!_isReady) return false;
    await Word.run(async (ctx) => {
      const sel = ctx.document.getSelection();
      const cc = sel.insertContentControl();
      cc.tag = 'MENDELEY_BIBLIOGRAPHY_v3_';
      cc.title = 'Mendeley Bibliography';
      cc.appearance = Word.ContentControlAppearance.boundingBox;
      cc.insertHtml(htmlContent, Word.InsertLocation.replace);
      await ctx.sync();
      
      const ccRange = cc.getRange();
      const pars = ccRange.paragraphs;
      pars.load('items');
      await ctx.sync();
      pars.items.forEach(p => {
        p.leftIndent = 36;
        p.firstLineIndent = -36;
      });
      await ctx.sync();
    });
    return true;
  }

  /**
   * DEBUG: List all Content Controls in document with their tags and text.
   * Use this to diagnose what Mendeley Cite actually stores.
   */
  async function debugContentControls() {
    if (!_isReady) return [];
    const result = [];
    await Word.run(async (ctx) => {
      const controls = ctx.document.contentControls;
      controls.load('items/tag,items/text,items/title,items/appearance');
      await ctx.sync();
      for (const cc of controls.items) {
        result.push({
          tag:        cc.tag         || '(empty)',
          title:      cc.title       || '(empty)',
          text:       (cc.text || '').substring(0, 80),
          appearance: cc.appearance  || '(unknown)'
        });
      }
    });
    return result;
  }

  /**
   * Remove all Mendeley/AutoBib citation formatting but KEEP the text.
   * Handles: (1) Content Controls (AutoBib + newer Mendeley Cite),
   *          (2) ADDIN MENDELEY field codes (older Mendeley Cite).
   */
  async function stripCitationFormatting() {
    if (!_isReady) return { stripped: 0, log: 'Not ready' };
    let stripped = 0;
    let debugLog = [];
    const log = (msg) => { console.log('[DEBUG STRIP]', msg); debugLog.push(msg); };

    log('Starting stripCitationFormatting');

    await Word.run(async (ctx) => {
      // ── PASS 1: Remove Content Controls (new Mendeley Cite & AutoBib) ─
      const controls = ctx.document.contentControls;
      controls.load('items/cannotDelete,items/cannotEdit');
      await ctx.sync();

      log(`Found ${controls.items.length} total content controls in document.`);

      const toStrip = [];
      for (let i = 0; i < controls.items.length; i++) {
        const cc = controls.items[i];
        try {
          const xmlObj = cc.getOoxml();
          await ctx.sync();
          if (xmlObj.value.includes('MENDELEY')) {
            log(`Found MENDELEY in control #${i}. Queuing for deletion.`);
            toStrip.push(cc);
          }
        } catch (e) {
          log(`Error reading OOXML for control #${i}: ${e.message}`);
        }
      }

      log(`Unlocking ${toStrip.length} Mendeley controls...`);
      for (const cc of toStrip) {
        if (cc.cannotDelete) cc.cannotDelete = false;
        if (cc.cannotEdit)   cc.cannotEdit   = false;
      }
      await ctx.sync();
      log('Unlocking synced.');

      log('Attempting to delete controls...');
      for (const cc of toStrip) {
        try {
          cc.delete(true); // true = keep content text
          stripped++;
        } catch (e) {
          log(`Failed to delete control: ${e.message}`);
          console.warn('Could not delete Content Control:', e);
        }
      }
      await ctx.sync();
      log(`Deleted ${stripped} controls via Office.js API.`);
    });

    // ── PASS 2: Remove ADDIN MENDELEY field codes via OOXML ─
    // Older Mendeley Cite versions use Word field codes, not Content Controls.
    let fieldCodesStripped = false;
    await Word.run(async (ctx) => {
      const ooxmlLoad = ctx.document.body.getOoxml();
      await ctx.sync();

      const original = ooxmlLoad.value;

      // State-machine replace: keep only the text between fldChar(separate) and fldChar(end)
      // for any field containing "MENDELEY" in its instrText.
      const cleaned = stripMendeleyFields(original);

      if (cleaned !== original) {
        ctx.document.body.insertOoxml(cleaned, Word.InsertLocation.replace);
        await ctx.sync();
        fieldCodesStripped = true;
        stripped++;
        log('Deleted controls via OOXML string manipulation.');
      } else {
        log('OOXML manipulation did not find any remaining Mendeley controls.');
      }
    });

    log(`Finished stripCitationFormatting. Total stripped: ${stripped}`);
    return { stripped, debugLog };
  }

  /**
   * Pure-JS OOXML field-code remover for Mendeley ADDIN fields.
   * Strips <w:fldChar begin> ... <w:instrText>ADDIN MENDELEY</w:instrText> ... <w:fldChar end>
   * while preserving the text between the 'separate' and 'end' markers.
   */
  function stripMendeleyFields(xml) {
    let result = xml;

    // ── 1. STRIP Mendeley Content Controls (<w:sdt>) via OOXML ──
    // Find <w:sdt> blocks containing MENDELEY and extract just their <w:sdtContent>
    let safetySDT = 0;
    let searchStart = 0;
    while(safetySDT++ < 500) {
        let sdtIdx = result.indexOf('<w:sdt>', searchStart);
        if (sdtIdx === -1) sdtIdx = result.indexOf('<w:sdt ', searchStart);
        if (sdtIdx === -1) break;

        // Find the matching </w:sdt> by counting nesting
        let endSdtIdx = -1;
        let nestCount = 0;
        let pos = sdtIdx;
        while (pos < result.length) {
            let nextOpen = result.indexOf('<w:sdt>', pos + 1);
            if (nextOpen === -1) nextOpen = result.indexOf('<w:sdt ', pos + 1);
            let nextClose = result.indexOf('</w:sdt>', pos + 1);

            if (nextClose === -1) break; // malformed xml

            if (nextOpen !== -1 && nextOpen < nextClose) {
                nestCount++;
                pos = nextOpen;
            } else {
                if (nestCount === 0) {
                    endSdtIdx = nextClose;
                    break;
                }
                nestCount--;
                pos = nextClose;
            }
        }

        if (endSdtIdx === -1) {
            searchStart = sdtIdx + 1;
            continue;
        }
        endSdtIdx += 8; // include </w:sdt>

        let sdtStr = result.substring(sdtIdx, endSdtIdx);
        
        if (sdtStr.includes('MENDELEY')) {
            // Find sdtContent
            let contentStart = sdtStr.indexOf('<w:sdtContent>');
            if (contentStart === -1) {
                contentStart = sdtStr.indexOf('<w:sdtContent ');
                if (contentStart !== -1) contentStart = sdtStr.indexOf('>', contentStart) + 1;
            } else {
                contentStart += 14; 
            }
            
            let contentEnd = sdtStr.lastIndexOf('</w:sdtContent>');
            
            if (contentStart !== -1 && contentEnd !== -1 && contentStart < contentEnd) {
                let inner = sdtStr.substring(contentStart, contentEnd);
                result = result.substring(0, sdtIdx) + inner + result.substring(endSdtIdx);
                // searchStart remains the same since the string shrank
                continue;
            }
        }
        
        searchStart = sdtIdx + 1;
    }

    // ── 2. STRIP Mendeley ADDIN Field Codes ──
    // Field structure: <w:fldChar w:fldCharType="begin"/> --> instrText --> <w:fldChar w:fldCharType="separate"/> --> RESULT TEXT --> <w:fldChar w:fldCharType="end"/>
    const BEGIN_RE   = /<w:fldChar[^>]+w:fldCharType=["']begin["'][^>]*\/>/gi;
    const END_TAG    = /<w:fldChar[^>]+w:fldCharType=["']end["'][^>]*\/>/i;
    const SEP_TAG    = /<w:fldChar[^>]+w:fldCharType=["']separate["'][^>]*\/>/i;
    const MENDELEY_I = /ADDIN\s+MENDELEY/i;

    let safety = 0;
    while (safety++ < 200) {
      const beginMatch = BEGIN_RE.exec(result);
      if (!beginMatch) break;

      const beforeBegin = result.slice(0, beginMatch.index);
      const afterBegin  = result.slice(beginMatch.index + beginMatch[0].length);

      const endMatch = END_TAG.exec(afterBegin);
      if (!endMatch) break;

      const fieldBody = afterBegin.slice(0, endMatch.index);
      const afterEnd  = afterBegin.slice(endMatch.index + endMatch[0].match(END_TAG)[0].length);

      if (!MENDELEY_I.test(fieldBody)) {
        BEGIN_RE.lastIndex = beginMatch.index + beginMatch[0].length;
        continue;
      }

      const sepMatch = SEP_TAG.exec(fieldBody);
      const resultText = sepMatch ? fieldBody.slice(sepMatch.index + sepMatch[0].match(SEP_TAG)[0].length) : '';

      result = beforeBegin + resultText + afterEnd;
      BEGIN_RE.lastIndex = 0; 
    }

    return result;
  }

  /**
   * Check if the document already contains a Mendeley Bibliography Content Control
   */
  async function hasBibliography() {
    if (!_isReady) return false;
    let exists = false;
    await Word.run(async (ctx) => {
      const controls = ctx.document.contentControls;
      controls.load('items/tag,items/title');
      await ctx.sync();
      exists = controls.items.some(cc => 
        (cc.tag || '').includes('MENDELEY_BIBLIOGRAPHY') || 
        (cc.title || '').includes('Mendeley')
      );
    });
    return exists;
  }

  /**
   * Update existing bibliography Content Control if it exists, or insert new
   */
  async function updateBibliography(htmlContent) {
    if (!_isReady) return false;
    let updated = false;
    await Word.run(async (ctx) => {
      const controls = ctx.document.contentControls;
      controls.load('items/tag,items/title');
      await ctx.sync();
      
      // Find the existing bibliography control (handle long Base64 tags & titles)
      const bibControl = controls.items.find(cc => 
        (cc.tag || '').includes('MENDELEY_BIBLIOGRAPHY') || 
        (cc.title || '').includes('Mendeley')
      );

      if (bibControl) {
        if (!htmlContent || htmlContent.trim() === '') {
          bibControl.clear();
          await ctx.sync();
          updated = true;
        } else {
          // Get font from the first paragraph to avoid 'null' due to mixed formatting
          const pars = bibControl.paragraphs;
          pars.load('items');
          await ctx.sync();
          
          let fontName, fontSize, fontColor;
          if (pars.items.length > 0) {
            const firstParFont = pars.items[0].font;
            firstParFont.load('name,size,color');
            await ctx.sync();
            fontName = firstParFont.name;
            fontSize = firstParFont.size;
            fontColor = firstParFont.color;
          }

          bibControl.insertHtml(htmlContent, Word.InsertLocation.replace);
          await ctx.sync();
          
          // Reapply font to the ENTIRE updated range
          const newRange = bibControl.getRange();
          if (fontName) newRange.font.name = fontName;
          if (fontSize) newRange.font.size = fontSize;
          if (fontColor) newRange.font.color = fontColor;
          
          const newPars = newRange.paragraphs;
          newPars.load('items');
          await ctx.sync();
          newPars.items.forEach(p => {
            p.leftIndent = 36;
            p.firstLineIndent = -36;
          });
          updated = true;
        }
      } else {
        // Fallback: insert at end of document, NOT replacing the whole body!
        const body = ctx.document.body;
        // Insert a new paragraph at the end, then wrap THAT paragraph in a CC
        const newParagraph = body.insertParagraph('', Word.InsertLocation.end);
        const cc = newParagraph.insertContentControl();
        cc.tag = 'MENDELEY_BIBLIOGRAPHY_v3_';
        cc.title = 'Mendeley Bibliography';
        cc.appearance = Word.ContentControlAppearance.boundingBox;
        cc.insertHtml(htmlContent, Word.InsertLocation.replace);
        await ctx.sync();
        
        const ccRange = cc.getRange();
        const pars = ccRange.paragraphs;
        pars.load('items');
        await ctx.sync();
        pars.items.forEach(p => {
          p.leftIndent = 36;
          p.firstLineIndent = -36;
        });
        updated = true;
      }
      await ctx.sync();
    });
    return updated;
  }

  return { 
    init, isOfficeReady, insertText, insertHtml, appendText, 
    insertOoxml, scanForCitations, replaceCitationWithField, 
    getAllText, getSelectedText, getAllStyles,
    startLiveStream, stopLiveStream, appendLiveStream,
    searchAndReplaceSelection, addCommentSelection, highlightSelection, insertTableSelection, editTableSelection, formatSelection, deleteSelection,
    insertTextAtTarget, extractMendeleyCitations, insertBibliography, updateBibliography, hasBibliography, stripCitationFormatting,
    debugContentControls, undoAction, addUndoRecord, findTargetRange, generateId
  };
})();

window.OfficeBridge = OfficeBridge;
