/* ═══════════════════════════════════════════════════════════
   app.js — Main app initialization and UI core
   ═══════════════════════════════════════════════════════════ */

// ── UI Utilities ─────────────────────────────────────────────
window.showToast = (msg, type = 'info') => {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = msg;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(15px) scale(0.95)';
    toast.style.filter = 'blur(6px)';
    setTimeout(() => toast.remove(), 400);
  }, 3000);
};

window.showConfirm = (title, message, onConfirm) => {
  const overlay = document.createElement('div');
  overlay.className = 'confirm-overlay';
  
  const popup = document.createElement('div');
  popup.className = 'confirm-popup';
  
  popup.innerHTML = `
    <div class="confirm-header">
      <h4>${title}</h4>
    </div>
    <div class="confirm-body">
      <p>${message}</p>
    </div>
    <div class="confirm-actions">
      <button class="btn btn-outline" id="confirm-cancel">Batal</button>
      <button class="btn btn-primary" id="confirm-ok" style="background:var(--red);border-color:var(--red);color:white;">Hapus</button>
    </div>
  `;
  
  overlay.appendChild(popup);
  document.body.appendChild(overlay);
  
  // Trigger animation
  setTimeout(() => overlay.classList.add('active'), 10);

  const close = () => {
    overlay.classList.remove('active');
    setTimeout(() => overlay.remove(), 400);
  };

  popup.querySelector('#confirm-cancel').onclick = close;
  popup.querySelector('#confirm-ok').onclick = () => {
    close();
    if(onConfirm) onConfirm();
  };
};

window.showPrompt = (title, defaultValue, onSubmit) => {
  const overlay = document.createElement('div');
  overlay.className = 'confirm-overlay'; // reuse overlay style
  
  const popup = document.createElement('div');
  popup.className = 'confirm-popup';
  
  popup.innerHTML = `
    <div class="confirm-header">
      <h4>${title}</h4>
    </div>
    <div class="confirm-body" style="padding-bottom: 8px;">
      <input type="text" id="prompt-input" class="search-input" value="${defaultValue || ''}" style="width: 100%; box-sizing: border-box;" autocomplete="off" />
    </div>
    <div class="confirm-actions">
      <button class="btn btn-outline" id="prompt-cancel">Batal</button>
      <button class="btn btn-primary" id="prompt-ok">Simpan</button>
    </div>
  `;
  
  overlay.appendChild(popup);
  document.body.appendChild(overlay);
  
  const input = popup.querySelector('#prompt-input');
  
  setTimeout(() => {
    overlay.classList.add('active');
    input.focus();
    input.select();
  }, 10);

  const close = () => {
    overlay.classList.remove('active');
    setTimeout(() => overlay.remove(), 400);
  };

  popup.querySelector('#prompt-cancel').onclick = close;
  
  const submit = () => {
    const val = input.value;
    close();
    if(onSubmit) onSubmit(val);
  };
  
  popup.querySelector('#prompt-ok').onclick = submit;
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submit();
    if (e.key === 'Escape') close();
  });
};

// ── Tab Management ─────────────────────────────────────────
function setupTabs() {
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabPanels = document.querySelectorAll('.tab-panel');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-selected', 'false');
      });
      tabPanels.forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');
      
      const tabId = btn.getAttribute('data-tab');
      document.getElementById(`tab-${tabId}`).classList.add('active');
    });
  });
}

// ── Theme Management ────────────────────────────────────────
function setupTheme() {
  const btn = document.getElementById('theme-toggle');
  const html = document.documentElement;
  
  const saved = localStorage.getItem('autobib_theme') || 'dark';
  html.setAttribute('data-theme', saved);

  btn.addEventListener('click', () => {
    const curr = html.getAttribute('data-theme');
    const next = curr === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', next);
    localStorage.setItem('autobib_theme', next);
  });
}

// ── Nav Toggle ─────────────────────────────────────────────
function setupNavToggle() {
  const btn = document.getElementById('nav-toggle');
  const nav = document.getElementById('tab-nav');
  if (!btn || !nav) return;
  
  // Optional: Restore saved state
  const isCollapsed = localStorage.getItem('autobib_nav_collapsed') === 'true';
  if (isCollapsed) nav.classList.add('collapsed');

  btn.addEventListener('click', () => {
    nav.classList.toggle('collapsed');
    localStorage.setItem('autobib_nav_collapsed', nav.classList.contains('collapsed'));
  });
}

// ── Init ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  setupTabs();
  setupTheme();
  setupNavToggle();
  
  // Init Office.js
  OfficeBridge.init((isReady) => {
    if (isReady) {
      console.log('Office.js ready in Word');
    } else {
      console.log('Running in browser mode');
    }
  });

  // Init Modules
  if (window.initSettings) initSettings();
  if (window.initMendeley) initMendeley();
  if (window.initAiGenerate) initAiGenerate();
  if (window.initSmartCitation) initSmartCitation();
  if (window.initBibliography) initBibliography();
  if (window.initChat) initChat();

  // C4.3.5 Status koneksi backend
  async function checkBackendConnection() {
    const badgeDot = document.querySelector('.badge-dot');
    if (!badgeDot) return;
    try {
      // Ping the settings endpoint as a lightweight health check
      const start = Date.now();
      const res = await fetch('http://localhost:3001/settings', { method: 'GET', cache: 'no-cache' });
      if (res.ok) {
        const ms = Date.now() - start;
        badgeDot.style.backgroundColor = '#10b981'; // green
        badgeDot.title = `Backend Online (${ms}ms)`;
      } else {
        badgeDot.style.backgroundColor = '#f59e0b'; // yellow (connected but error)
        badgeDot.title = `Backend Error (${res.status})`;
      }
    } catch (err) {
      badgeDot.style.backgroundColor = '#ef4444'; // red
      badgeDot.title = 'Backend Offline / Error Koneksi';
    }
  }
  
  checkBackendConnection();
  setInterval(checkBackendConnection, 10000); // Check every 10 seconds
});
