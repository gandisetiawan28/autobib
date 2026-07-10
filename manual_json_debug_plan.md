# Rencana Implementasi: Fitur Debugging JSON Manual

Fitur ini akan memungkinkan Anda memasukkan *payload* JSON (seperti operasi `multi`, `insert`, atau `table`) secara manual langsung ke dalam antarmuka Word (Taskpane) dan mengeksekusinya. Ini akan sangat mempercepat proses *debugging* algoritma `office-bridge.js` tanpa harus bergantung pada *output* AI.

## 1. Modifikasi UI (`frontend/index.html`)

Kita akan menambahkan sebuah tombol tersembunyi/kecil (misalnya ikon "Bug" atau "Code") di bagian header chat, dan sebuah Modal khusus untuk input JSON.

```html
<!-- Tombol Pemicu Modal (Bisa diletakkan di dekat tombol Settings) -->
<button id="btn-debug-json" class="icon-button" title="Debug JSON Operations" aria-label="Debug JSON">
  <svg>...</svg> <!-- Ikon Bug atau Code -->
</button>

<!-- Modal Debug JSON -->
<div id="json-debug-modal" class="modal hidden">
  <div class="modal-content">
    <div class="modal-header">
      <h3>Execute Manual JSON</h3>
      <button class="close-modal">&times;</button>
    </div>
    <div class="modal-body">
      <p class="text-secondary text-sm mb-4">Paste your AI tool JSON payload here to execute it directly.</p>
      <textarea id="json-debug-input" class="code-editor-textarea" placeholder='[\n  {\n    "action": "insert",\n    "after": "..."\n  }\n]'></textarea>
      <div id="json-debug-error" class="error-message hidden"></div>
    </div>
    <div class="modal-footer">
      <button id="btn-cancel-debug" class="btn btn-secondary">Cancel</button>
      <button id="btn-execute-debug" class="btn btn-primary">Execute Operations</button>
    </div>
  </div>
</div>
```

## 2. Penyesuaian Styling (`frontend/assets/css/components.css`)

Kita akan menambahkan gaya untuk `textarea` agar terlihat seperti *code editor* dan memastikannya selaras dengan *theme* gelap/terang bawaan (mewarisi variabel warna yang sudah ada).

```css
/* Debugger Modal Styles */
.code-editor-textarea {
  width: 100%;
  height: 250px;
  background-color: var(--bg-surface-elevated, #1e1e1e);
  color: var(--text-primary, #d4d4d4);
  font-family: 'Consolas', 'Courier New', monospace;
  font-size: 13px;
  padding: 12px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  resize: vertical;
  white-space: pre;
  overflow-wrap: normal;
  overflow-x: auto;
}

.code-editor-textarea:focus {
  outline: none;
  border-color: var(--primary-color);
  box-shadow: 0 0 0 2px rgba(var(--primary-color-rgb), 0.2);
}

.error-message {
  color: var(--danger-color, #ef4444);
  font-size: 12px;
  margin-top: 8px;
}
```

## 3. Implementasi Logika JavaScript (`frontend/assets/js/chat.js`)

Kita akan menambahkan *event listener* untuk membuka modal dan mengeksekusi JSON yang di-*paste*. Logika ini akan membaca array `operations` dan langsung mengirimkannya ke `OfficeBridge`.

```javascript
// --- JSON DEBUGGER LOGIC ---
const debugModal = document.getElementById('json-debug-modal');
const debugInput = document.getElementById('json-debug-input');
const debugError = document.getElementById('json-debug-error');
const btnDebug = document.getElementById('btn-debug-json');
const btnExecuteDebug = document.getElementById('btn-execute-debug');

// Buka Modal
btnDebug?.addEventListener('click', () => {
    debugModal.classList.remove('hidden');
    debugInput.value = '';
    debugError.classList.add('hidden');
    debugInput.focus();
});

// Tutup Modal
document.querySelectorAll('#json-debug-modal .close-modal, #btn-cancel-debug').forEach(btn => {
    btn.addEventListener('click', () => {
        debugModal.classList.add('hidden');
    });
});

// Eksekusi JSON
btnExecuteDebug?.addEventListener('click', async () => {
    try {
        debugError.classList.add('hidden');
        const rawJson = debugInput.value.trim();
        if (!rawJson) throw new Error("JSON tidak boleh kosong.");

        // Parse JSON (bisa berupa object tunggal atau array)
        let payload = JSON.parse(rawJson);
        let operations = Array.isArray(payload) ? payload : (payload.operations || [payload]);

        // Nonaktifkan tombol selama proses
        btnExecuteDebug.disabled = true;
        btnExecuteDebug.textContent = 'Executing...';

        // Loop dan eksekusi seperti fungsi multi-tool
        for (const op of operations) {
            console.log("Executing manual op:", op);
            if (op.action === 'insert' || !op.action) {
                // Asumsi jika tidak ada action, itu insert/replace standar
                await OfficeBridge.insertTextAtTarget([op]);
            } else if (op.action === 'table') {
                await OfficeBridge.insertTableSelection(op);
            } else if (op.action === 'replace' || op.action === 'delete') {
                await OfficeBridge.insertTextAtTarget([op]); // insertTextAtTarget juga menghandle replace/delete
            } else if (op.action === 'format') {
                await OfficeBridge.formatTextAtTarget(op);
            }
        }

        // Jika berhasil, tutup modal
        debugModal.classList.add('hidden');
        alert("Manual JSON berhasil dieksekusi!");

    } catch (err) {
        debugError.textContent = "Error: " + err.message;
        debugError.classList.remove('hidden');
    } finally {
        btnExecuteDebug.disabled = false;
        btnExecuteDebug.textContent = 'Execute Operations';
    }
});
```

## Langkah Selanjutnya
Jika Anda menyetujui rencana ini, saya akan mulai menulis kode tersebut ke dalam file `frontend/index.html`, `frontend/assets/css/components.css`, dan `frontend/assets/js/chat.js`.

### Fitur tambahan yang akan saya tambahkan
Selain modal eksekusi JSON manual, akan ditambahkan juga:
1) **Riwayat JSON terakhir (Last 5 payload)**: otomatis menyimpan payload yang berhasil dieksekusi (di `localStorage`) dan memberikan dropdown untuk memilih serta mengedit ulang.
2) **Validasi & Preview ringkas**: sebelum eksekusi, sistem memvalidasi JSON; jika valid, UI menampilkan ringkasan `tool` + jumlah `operations`.
3) **Mode Dry-Run (opsional)**: checkbox “Dry-run (tanpa eksekusi Word)” untuk hanya memvalidasi dan menampilkan ringkasan aksi.

Apakah ada batasan khusus (misalnya jumlah riwayat selain 5)?
