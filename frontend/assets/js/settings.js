/* ═══════════════════════════════════════════════════════════
   settings.js — Settings and API Key Pool UI logic
   ═══════════════════════════════════════════════════════════ */

window.initSettings = async () => {
  let activeProviderTab = 'gemini';

  const els = {
    provider: document.getElementById('setting-provider'),
    rotation: document.getElementById('setting-rotation'),
    format: document.getElementById('setting-citation-format'),
    language: document.getElementById('setting-language'),
    retrySlider: document.getElementById('setting-max-retry'),
    retryVal: document.getElementById('retry-val'),
    debugMode: document.getElementById('setting-debug-mode'),
    localBridgeRow: document.getElementById('local-bridge-row'),
    localBridgeUrl: document.getElementById('setting-local-bridge-url'),
    btnSave: document.getElementById('btn-save-settings'),

    // Key Pool
    keysTabs: document.querySelectorAll('.keys-tab'),
    keysList: document.getElementById('keys-list'),
    btnAddKey: document.getElementById('btn-add-key'),
    addKeyForm: document.getElementById('add-key-form'),
    btnCancelAdd: document.getElementById('btn-cancel-add-key'),
    btnSaveNewKey: document.getElementById('btn-save-new-key'),
    
    btnShowMonitor: document.getElementById('btn-show-monitor'),
    monitorPanel: document.getElementById('monitor-panel'),
  };

  // ── Load General Settings ─────────────────────────────────
  async function loadSettings() {
    try {
      const res = await ApiClient.settings.get();
      const s = res.settings;
      if (s.active_provider) els.provider.value = s.active_provider;
      if (s.rotation_strategy) els.rotation.value = s.rotation_strategy;
      if (s.citation_format) els.format.value = s.citation_format;
      if (s.output_language) els.language.value = s.output_language;
      if (s.max_retry) {
        els.retrySlider.value = s.max_retry;
        els.retryVal.textContent = s.max_retry;
      }
      if (s.local_bridge_url && els.localBridgeUrl) els.localBridgeUrl.value = s.local_bridge_url;
      
      const debugMode = localStorage.getItem('autobib_debug_mode') === 'true';
      if (els.debugMode) els.debugMode.checked = debugMode;

      updateAiBadge();
      if (els.provider.value.startsWith('local_') && els.localBridgeRow) {
        els.localBridgeRow.style.display = 'block';
      }
      loadKeyPool();
    } catch (err) {
      console.error(err);
    }
  }

  function updateAiBadge() {
    const badgeLabel = document.getElementById('badge-label');
    const provs = { 
      gemini: 'Gemini', openai: 'OpenAI', claude: 'Claude', groq: 'Groq',
      local_gemini: 'Bridge: Gemini', local_chatgpt: 'Bridge: ChatGPT', 
      local_claude: 'Bridge: Claude', local_deepseek: 'Bridge: DeepSeek',
      local_grok: 'Bridge: Grok', local_meta: 'Bridge: Meta', local_qwen: 'Bridge: Qwen'
    };
    badgeLabel.textContent = provs[els.provider.value] || 'AI';
  }

  els.provider.addEventListener('change', () => {
    updateAiBadge();
    if (els.provider.value.startsWith('local_') && els.localBridgeRow) {
      els.localBridgeRow.style.display = 'block';
    } else if (els.localBridgeRow) {
      els.localBridgeRow.style.display = 'none';
    }
  });

  els.retrySlider.addEventListener('input', (e) => {
    els.retryVal.textContent = e.target.value;
  });

  els.btnSave.addEventListener('click', async () => {
    const body = {
      active_provider: els.provider.value,
      rotation_strategy: els.rotation.value,
      citation_format: els.format.value,
      output_language: els.language.value,
      max_retry: parseInt(els.retrySlider.value, 10),
      local_bridge_url: els.localBridgeUrl ? els.localBridgeUrl.value.trim() : '',
    };
    try {
      if (els.debugMode) localStorage.setItem('autobib_debug_mode', els.debugMode.checked);
      await ApiClient.settings.save(body);
      showToast('Pengaturan disimpan', 'success');
      updateAiBadge();
    } catch (err) {
      showToast('Gagal menyimpan pengaturan', 'error');
    }
  });

  // ── Key Pool UI ───────────────────────────────────────────
  els.keysTabs.forEach(t => t.addEventListener('click', () => {
    els.keysTabs.forEach(b => b.classList.remove('active'));
    t.classList.add('active');
    activeProviderTab = t.dataset.provider;
    loadKeyPool();
  }));

  els.btnAddKey.addEventListener('click', () => {
    els.addKeyForm.classList.remove('hidden');
    document.getElementById('new-key-provider').value = activeProviderTab;
  });

  els.btnCancelAdd.addEventListener('click', () => {
    els.addKeyForm.classList.add('hidden');
    document.getElementById('new-key-name').value = '';
    document.getElementById('new-key-value').value = '';
  });

  els.btnSaveNewKey.addEventListener('click', async () => {
    const name = document.getElementById('new-key-name').value.trim();
    const val = document.getElementById('new-key-value').value.trim();
    const prov = document.getElementById('new-key-provider').value;
    
    if (!name || !val) return showToast('Nama dan Value wajib diisi', 'warning');
    
    try {
      els.btnSaveNewKey.disabled = true;
      await ApiClient.keyPool.add({ provider: prov, key_name: name, key_value: val });
      showToast('Key berhasil ditambahkan', 'success');
      els.btnCancelAdd.click();
      if (prov === activeProviderTab) loadKeyPool();
    } catch (err) {
      showToast('Gagal menambah key', 'error');
    } finally {
      els.btnSaveNewKey.disabled = false;
    }
  });

  async function loadKeyPool() {
    els.keysList.innerHTML = '<div class="loading-spinner"></div>';
    try {
      const res = await ApiClient.keyPool.list(activeProviderTab);
      renderKeys(res.keys);
    } catch (err) {
      els.keysList.innerHTML = '<div class="empty-keys">Gagal memuat key</div>';
    }
  }

  function renderKeys(keys) {
    if (!keys || keys.length === 0) {
      els.keysList.innerHTML = '<div class="empty-keys">Belum ada key. Klik "+ Tambah Key".</div>';
      return;
    }

    els.keysList.innerHTML = '';
    keys.forEach(k => {
      const div = document.createElement('div');
      div.className = 'key-card';
      
      const statusMap = {
        'active': { label: 'Aktif', cls: 'active' },
        'rate_limited': { label: 'Limit', cls: 'rate_limited' },
        'invalid': { label: 'Invalid', cls: 'invalid' },
        'disabled': { label: 'Nonaktif', cls: 'disabled' },
      };
      const st = statusMap[k.status] || { label: k.status, cls: 'disabled' };

      div.innerHTML = `
        <div class="key-card-drag">⋮⋮</div>
        <div class="key-card-body">
          <div class="key-card-name">${k.key_name}</div>
          <div class="key-card-priority">Pri: ${k.priority}</div>
        </div>
        <div class="key-status ${st.cls}">${st.label}</div>
        <div class="key-card-actions">
          <button class="btn btn-ghost btn-sm" onclick="testKey('${k.id}')">Test</button>
          <button class="btn btn-ghost btn-sm" onclick="deleteKey('${k.id}')" style="color:var(--red)">✕</button>
        </div>
      `;
      els.keysList.appendChild(div);
    });
  }

  window.testKey = async (id) => {
    try {
      const res = await ApiClient.keyPool.test(id, activeProviderTab);
      if (res.valid) showToast('Key valid dan aktif', 'success');
      else showToast('Key invalid/limit: ' + res.error, 'error');
      loadKeyPool(); // refresh status
    } catch (err) {
      showToast('Error testing key', 'error');
    }
  };

  window.deleteKey = async (id) => {
    if (!confirm('Hapus key ini?')) return;
    try {
      await ApiClient.keyPool.remove(id);
      showToast('Key dihapus', 'success');
      loadKeyPool();
    } catch (err) {
      showToast('Gagal menghapus', 'error');
    }
  };

  // Monitor toggle
  els.btnShowMonitor.addEventListener('click', async () => {
    els.monitorPanel.classList.toggle('hidden');
    if (!els.monitorPanel.classList.contains('hidden')) {
      els.monitorPanel.innerHTML = '<div style="padding:10px;text-align:center">Loading...</div>';
      try {
        const res = await ApiClient.keyPool.monitor(activeProviderTab);
        let html = `
          <div class="monitor-row header">
            <div>Nama</div>
            <div>Reqs</div>
            <div>Sukses</div>
            <div>Error</div>
          </div>
        `;
        res.monitor.forEach(m => {
          html += `
            <div class="monitor-row">
              <div class="monitor-name">${m.key_name}</div>
              <div class="monitor-stat">${m.total_requests}</div>
              <div class="monitor-stat" style="color:var(--green)">${m.success_rate}%</div>
              <div class="monitor-stat">${m.last_error_code || '-'}</div>
            </div>
          `;
        });
        if (res.monitor.length === 0) html = '<div style="padding:10px;text-align:center">Tidak ada data</div>';
        els.monitorPanel.innerHTML = html;
      } catch (err) {
        els.monitorPanel.innerHTML = '<div style="padding:10px;text-align:center">Error</div>';
      }
    }
  });

  loadSettings();
};
