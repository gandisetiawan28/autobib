/* ═══════════════════════════════════════════════════════════
   pdf-viewer.js — PDF Viewer Modal for Mendeley Documents
   ═══════════════════════════════════════════════════════════ */

window.PdfViewer = (() => {
  // ── State ──────────────────────────────────────────────────
  let _modal = null;
  let _currentDocId = null;
  let _currentFileId = null;
  let _pdfCache = new Map(); // docId → { has_pdf, file }

  // ── DOM Builder ────────────────────────────────────────────
  function _buildModal() {
    if (document.getElementById('pdf-viewer-modal')) return;

    const modal = document.createElement('div');
    modal.id = 'pdf-viewer-modal';
    modal.className = 'pdf-viewer-overlay hidden';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', 'PDF Viewer');

    modal.innerHTML = `
      <div class="pdf-viewer-container" id="pdf-viewer-container">
        <!-- Header -->
        <div class="pdf-viewer-header" id="pdf-viewer-header">
          <div class="pdf-viewer-title-wrap">
            <svg class="pdf-viewer-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="9" y1="13" x2="15" y2="13"/>
              <line x1="9" y1="17" x2="15" y2="17"/>
            </svg>
            <span class="pdf-viewer-title" id="pdf-viewer-title">Memuat PDF...</span>
          </div>
          <div class="pdf-viewer-actions">
            <button class="pdf-viewer-btn" id="pdf-viewer-open-external" title="Buka di tab baru">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                <polyline points="15 3 21 3 21 9"/>
                <line x1="10" y1="14" x2="21" y2="3"/>
              </svg>
              <span>Buka Tab</span>
            </button>
            <button class="pdf-viewer-btn" id="pdf-viewer-download" title="Unduh PDF">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              <span>Unduh</span>
            </button>
            <button class="pdf-viewer-close-btn" id="pdf-viewer-close" title="Tutup" aria-label="Tutup PDF viewer">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        </div>

        <!-- Body -->
        <div class="pdf-viewer-body" id="pdf-viewer-body">
          <!-- Loading State -->
          <div class="pdf-viewer-loading" id="pdf-viewer-loading">
            <div class="pdf-loading-spinner">
              <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
                <circle cx="20" cy="20" r="16" stroke="var(--border)" stroke-width="3"/>
                <path d="M20 4 A16 16 0 0 1 36 20" stroke="var(--accent)" stroke-width="3" stroke-linecap="round"/>
              </svg>
            </div>
            <p class="pdf-loading-text">Memuat dokumen PDF...</p>
            <p class="pdf-loading-sub" id="pdf-loading-sub">Menghubungi Mendeley API</p>
          </div>

          <!-- Error State -->
          <div class="pdf-viewer-error hidden" id="pdf-viewer-error">
            <div class="pdf-error-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
            </div>
            <h3 class="pdf-error-title">PDF Tidak Tersedia</h3>
            <p class="pdf-error-msg" id="pdf-error-msg">Dokumen ini tidak memiliki file PDF terlampir di Mendeley.</p>
            <button class="btn btn-ghost btn-sm" id="pdf-error-close">Tutup</button>
          </div>

          <!-- PDF iframe -->
          <iframe
            id="pdf-viewer-iframe"
            class="pdf-viewer-iframe hidden"
            title="PDF Viewer"
            allowfullscreen
          ></iframe>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    _modal = modal;
    _bindEvents();
  }

  function _bindEvents() {
    // Tutup via tombol close
    document.getElementById('pdf-viewer-close').addEventListener('click', close);
    document.getElementById('pdf-error-close').addEventListener('click', close);

    // Tutup via klik backdrop
    _modal.addEventListener('click', (e) => {
      if (e.target === _modal) close();
    });

    // Tutup via Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !_modal.classList.contains('hidden')) close();
    });

    // Buka di tab baru
    document.getElementById('pdf-viewer-open-external').addEventListener('click', () => {
      if (_currentFileId) {
        const url = ApiClient.mendeley.pdfContentUrl(_currentFileId, _modal.querySelector('#pdf-viewer-title').textContent);
        window.open(url, '_blank');
      }
    });

    // Download
    document.getElementById('pdf-viewer-download').addEventListener('click', () => {
      if (_currentFileId) {
        const title = _modal.querySelector('#pdf-viewer-title').textContent || 'document';
        const url = ApiClient.mendeley.pdfContentUrl(_currentFileId, title + '.pdf');
        const a = document.createElement('a');
        a.href = url;
        a.download = title + '.pdf';
        a.click();
      }
    });
  }

  // ── Show loading state ──────────────────────────────────────
  function _showLoading(msg = 'Menghubungi Mendeley API') {
    document.getElementById('pdf-viewer-loading').classList.remove('hidden');
    document.getElementById('pdf-viewer-error').classList.add('hidden');
    document.getElementById('pdf-viewer-iframe').classList.add('hidden');
    document.getElementById('pdf-loading-sub').textContent = msg;
  }

  // ── Show error state ────────────────────────────────────────
  function _showError(msg) {
    document.getElementById('pdf-viewer-loading').classList.add('hidden');
    document.getElementById('pdf-viewer-error').classList.remove('hidden');
    document.getElementById('pdf-viewer-iframe').classList.add('hidden');
    document.getElementById('pdf-error-msg').textContent = msg;
  }

  // ── Show PDF ────────────────────────────────────────────────
  function _showPdf(url) {
    const iframe = document.getElementById('pdf-viewer-iframe');
    document.getElementById('pdf-viewer-loading').classList.add('hidden');
    document.getElementById('pdf-viewer-error').classList.add('hidden');
    iframe.classList.remove('hidden');
    iframe.src = url;
  }

  // ── Public: Open viewer for a document ─────────────────────
  async function open(ref) {
    if (!_modal) _buildModal();

    _currentDocId = ref.id;
    _currentFileId = null;

    // Set title
    const titleEl = document.getElementById('pdf-viewer-title');
    titleEl.textContent = ref.title || 'Dokumen Mendeley';

    // Tampilkan modal
    _modal.classList.remove('hidden');
    requestAnimationFrame(() => _modal.classList.add('visible'));
    _showLoading('Memeriksa file PDF di Mendeley...');

    // Disable buka & download button sampai file ditemukan
    document.getElementById('pdf-viewer-open-external').disabled = true;
    document.getElementById('pdf-viewer-download').disabled = true;

    try {
      // Cek cache dulu
      let pdfInfo = _pdfCache.get(ref.id);
      if (!pdfInfo) {
        _showLoading('Menghubungi Mendeley API...');
        pdfInfo = await ApiClient.mendeley.pdfInfo(ref.id);
        _pdfCache.set(ref.id, pdfInfo);
      }

      if (!pdfInfo.has_pdf || !pdfInfo.file) {
        _showError('Dokumen ini tidak memiliki file PDF yang terlampir di Mendeley. Upload file PDF terlebih dahulu melalui tombol "Upload PDF".');
        return;
      }

      _currentFileId = pdfInfo.file.id;
      const fileName = pdfInfo.file.file_name || ref.title + '.pdf';
      titleEl.textContent = ref.title || fileName;

      // Enable action buttons
      document.getElementById('pdf-viewer-open-external').disabled = false;
      document.getElementById('pdf-viewer-download').disabled = false;

      _showLoading(`Memuat PDF (${_formatBytes(pdfInfo.file.size)})...`);

      // Build URL
      const pdfUrl = ApiClient.mendeley.pdfContentUrl(_currentFileId, fileName);
      _showPdf(pdfUrl);

    } catch (err) {
      console.error('[PdfViewer] Error:', err);
      _showError(err.message || 'Gagal memuat PDF. Periksa koneksi Mendeley Anda.');
    }
  }

  // ── Public: Close viewer ────────────────────────────────────
  function close() {
    if (!_modal) return;
    _modal.classList.remove('visible');
    setTimeout(() => {
      _modal.classList.add('hidden');
      // Clear iframe src agar tidak stream di background
      const iframe = document.getElementById('pdf-viewer-iframe');
      if (iframe) iframe.src = 'about:blank';
      _currentDocId = null;
      _currentFileId = null;
    }, 300);
  }

  // ── Public: Invalidate cache for a doc ─────────────────────
  function invalidateCache(docId) {
    _pdfCache.delete(docId);
  }

  // ── Helper ──────────────────────────────────────────────────
  function _formatBytes(bytes) {
    if (!bytes) return 'PDF';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  // Auto-build on load
  _buildModal();

  return { open, close, invalidateCache };
})();
