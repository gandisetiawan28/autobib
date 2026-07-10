# 🤖 AutoBib — AI Chat Enhancement Plan
> **Versi:** 1.0 | Dibuat: 2026-06-30 | Status: Draft
> 
> Dokumen ini merinci semua fitur yang **belum ada** namun **seharusnya ada** pada modul AI Chat AutoBib, berdasarkan analisis kode `chat.js` yang saat ini berjalan.

> [!IMPORTANT]
> **📋 Instruksi untuk AI — Wajib Diikuti Setiap Sesi:**
> - Setiap task yang **selesai dikerjakan**: ubah `- [ ]` → `- [x]`.
> - Jika task **baru separuh selesai**, tambahkan catatan langsung di bawah baris task:
>   ```
>   - [ ] CX.X.X — Nama Task
>     > 🔄 IN PROGRESS: [apa yang sudah selesai] | [apa yang belum & kenapa]
>   ```
> - **Jangan tunda** pembaruan — file ini adalah sumber kebenaran tunggal status pengerjaan.

---

## 🔍 Analisis Fitur Yang Sudah Ada

### Chat UI (`chat.js`)
| Fitur | Status |
|-------|--------|
| Kirim pesan & streaming SSE | ✅ Ada |
| Sesi obrolan (buat, hapus, rename) | ✅ Ada |
| Hapus semua riwayat | ✅ Ada |
| Sidebar riwayat sesi | ✅ Ada |
| Divider tanggal per sesi | ✅ Ada |
| Timestamp per pesan | ✅ Ada |
| Context dokumen penuh / teks blok | ✅ Ada |
| Live Edit ke Word (SSE streaming) | ✅ Ada |
| Tombol Salin & Terapkan per pesan AI | ✅ Ada |
| Render Markdown (marked.js) | ✅ Ada |
| Tampilan "thinking" AI (thought block) | ✅ Ada |
| AbortController (hentikan generasi) | ✅ Ada |
| Auto-titling sesi berdasarkan pesan pertama | ✅ Ada |

### Tool Word (`office-bridge.js`) — Inventory Lengkap
| Tool (Function) | Kemampuan | Dipanggil AI via `tool` field? |
|----------------|-----------|-------------------------------|
| `insertText()` | Sisipkan teks plain di posisi cursor | ❌ Belum |
| `insertHtml()` | Sisipkan HTML di posisi cursor (format bold/italic) | ❌ Belum |
| `appendText()` | Tambahkan teks di akhir dokumen | ❌ Belum |
| `startLiveStream()` / `appendLiveStream()` / `stopLiveStream()` | Streaming token-per-token langsung ke Word | ✅ Via mode Live Edit |
| `insertOoxml()` | Sisipkan raw OOXML/Mendeley field di cursor | ❌ Belum |
| `searchAndReplaceSelection()` | Cari teks → ganti dengan teks baru | ✅ Via `tool: replace` |
| `deleteSelection()` | Cari teks → hapus | ✅ Via `tool: delete` |
| `addCommentSelection()` | Cari teks → tambahkan komentar Word | ✅ Via `tool: comment` |
| `insertTextAtTarget()` | Sisipkan teks sebelum/sesudah target tertentu | ✅ Via `tool: insert` |
| `highlightSelection()` | Cari teks → highlight warna | ✅ Via `tool: highlight` |
| `insertTableSelection()` | Sisipkan tabel di posisi cursor/seleksi | ✅ Via `tool: table` |
| `formatSelection()` | Bold/Italic/Sub/Super pada teks tertentu | ✅ Via `tool: format` |
| `getAllText()` | Baca seluruh teks dokumen (HTML→Markdown) | ✅ Dikirim sebagai context |
| `getSelectedText()` | Baca teks yang di-blok user (HTML→Markdown) | ✅ Dikirim sebagai context |
| `scanForCitations()` | Scan dokumen untuk pola sitasi teks | ✅ Dipakai Smart Citation |
| `replaceCitationWithField()` | Ganti teks sitasi → Content Control Mendeley | ✅ Dipakai Smart Citation |
| `extractMendeleyCitations()` | Baca semua sitasi Mendeley dari dokumen | ✅ Dikirim sebagai context |
| `insertBibliography()` | Sisipkan daftar pustaka HTML di cursor | ✅ Dipakai Bibliography |
| `updateBibliography()` | Update atau buat baru bibliography CC | ✅ Dipakai Bibliography |
| `hasBibliography()` | Cek apakah sudah ada bibliography di dokumen | ✅ Dipakai Bibliography |
| `stripCitationFormatting()` | Hapus semua Mendeley CC, pertahankan teks | ✅ Dipakai Reset |
| `debugContentControls()` | Debug: list semua Content Controls | 🔧 Debug only |

> **Masalah Kritis:** Banyak tool OfficeBridge yang **sudah ada** di `office-bridge.js` tapi **belum bisa dipanggil AI** melalui `tool` field di JSON response. AI hanya tahu 7 tool: `replace`, `delete`, `comment`, `insert`, `highlight`, `table`, `format`.

---

## 🚀 FITUR YANG BELUM ADA (Perlu Ditambahkan)

---

### FASE C1: Pengalaman Chat yang Lebih Kaya

#### C1.1 — Voice Input (Speech-to-Text)

- [ ] **C1.1.1** — Tombol Mikrofon → Tombol mic di sebelah input, aktifkan Web Speech API _(🔴 Tinggi)_
- [ ] **C1.1.2** — Indikator rekaman → Animasi pulse + timer saat mic aktif _(🟡 Sedang)_
- [ ] **C1.1.3** — Transkripsi real-time → Hasil suara langsung muncul di textarea sebelum dikirim _(🟡 Sedang)_
- [ ] **C1.1.4** — Auto-kirim opsional → Toggle: kirim otomatis saat henti bicara, atau manual _(🟢 Rendah)_

**Teknologi:** `window.SpeechRecognition` / `webkitSpeechRecognition` (Browser API, gratis, tidak perlu backend)

---

#### C1.2 — Attachment & Multi-Modal Input

- [ ] **C1.2.1** — Upload gambar ke chat → Drag & drop atau klik upload gambar (PNG/JPG) _(🔴 Tinggi)_
- [ ] **C1.2.2** — Preview thumbnail gambar → Tampilkan preview kecil sebelum dikirim _(🔴 Tinggi)_
- [ ] **C1.2.3** — Kirim gambar ke AI → Encode base64, sertakan ke payload API (Gemini Vision / GPT-4V) _(🔴 Tinggi)_
- [ ] **C1.2.4** — Upload PDF / TXT → Parse teks dari file, sertakan sebagai konteks tambahan _(🟡 Sedang)_
- [ ] **C1.2.5** — Paste gambar dari clipboard → Deteksi paste event dengan gambar, langsung preview _(🟡 Sedang)_

**Use Case:** User bisa foto halaman buku → tanya AI untuk extract sitasi, atau upload PDF paper.

---

#### C1.3 — Pesan Reaksi & Feedback

- [ ] **C1.3.1** — Tombol 👍 / 👎 per pesan AI → Simpan feedback ke DB untuk evaluasi kualitas _(🟡 Sedang)_
- [ ] **C1.3.2** — Regenerate respons → Tombol "Coba Lagi" yang mengirim ulang dengan prompt yang sama _(🔴 Tinggi)_
- [ ] **C1.3.3** — Edit pesan user → User bisa edit pesan yang sudah dikirim & generate ulang _(🟡 Sedang)_
- [ ] **C1.3.4** — Pin pesan penting → Tandai pesan tertentu sebagai pinned, mudah dicari lagi _(🟢 Rendah)_

---

#### C1.4 — Formatting Input yang Lebih Baik

- [ ] **C1.4.1** — Rich text input toolbar → Toolbar mini: Bold, Italic, Code block untuk input pesan _(🟢 Rendah)_
- [x] **C1.4.2** — Auto-resize textarea → Textarea otomatis membesar mengikuti panjang teks input _(🔴 Tinggi)_
- [ ] **C1.4.3** — Shortcut keyboard → `Ctrl+Enter` untuk newline, `/` untuk command cepat _(🟡 Sedang)_
- [x] **C1.4.4** — Slash command `/` → Ketik `/` untuk tampilkan menu: `/sitasi`, `/ringkas`, `/parafrase`, dll _(🔴 Tinggi)_
- [ ] **C1.4.5** — Mention konteks `@` → Ketik `@dokumen`, `@blok`, `@mendeley` untuk inject konteks spesifik _(🟡 Sedang)_

---

### FASE C2: Manajemen Sesi & Riwayat

#### C2.1 — Pencarian & Filter Riwayat

- [ ] **C2.1.1** — Searchbar riwayat sesi → Cari sesi berdasarkan judul atau isi pesan _(🔴 Tinggi)_
- [ ] **C2.1.2** — Filter berdasarkan tanggal → Filter: Hari ini / Minggu ini / Bulan ini _(🟡 Sedang)_
- [ ] **C2.1.3** — Urutkan sesi → Sort: Terbaru / Terlama / Paling banyak pesan _(🟡 Sedang)_
- [ ] **C2.1.4** — Highlight keyword di riwayat → Tandai keyword pencarian di daftar sesi _(🟢 Rendah)_

#### C4.2 — Manajemen Sesi (Sidebar)

- [x] **C4.2.1** — List semua sesi → Menampilkan riwayat chat sebelumnya _(🟡 Sedang)_
- [x] **C4.2.2** — Hapus / ganti nama sesi → Tombol rename & delete per sesi chat _(🟡 Sedang)_
- [ ] **C4.2.3** — Pencarian riwayat chat → Search bar lokal untuk mencari obrolan lama (berbasis Fuse.js) _(🟢 Rendah)_
- [ ] **C4.2.4** — Sticky / Pin Session → Fitur pin sesi penting agar selalu di atas _(🟢 Rendah)_

---

#### C2.2 — Ekspor & Berbagi Sesi

- [ ] **C2.2.1** — Ekspor sesi ke TXT / MD → Download seluruh percakapan sebagai file teks/markdown _(🔴 Tinggi)_
- [ ] **C2.2.2** — Ekspor sesi ke PDF → Generate PDF dari transcript percakapan _(🟡 Sedang)_
- [ ] **C2.2.3** — Ekspor sesi ke Word → Insert seluruh transcript ke dokumen Word aktif _(🟡 Sedang)_
- [ ] **C2.2.4** — Salin seluruh sesi → Copy semua pesan dalam satu klik _(🟡 Sedang)_
- [ ] **C2.2.5** — Bookmark sesi favorit → Tandai sesi penting agar mudah ditemukan kembali _(🟢 Rendah)_

---

#### C2.3 — Branching Percakapan

- [ ] **C2.3.1** — Fork dari pesan tertentu → Buat sesi baru yang dimulai dari titik tengah percakapan _(🟡 Sedang)_
- [ ] **C2.3.2** — Tampilkan "percabangan" sesi → UI tree untuk sesi yang di-fork _(🟢 Rendah)_

---

### FASE C3: Konteks & Memori AI

#### C3.1 — Memori Persisten Antar Sesi

- [ ] **C3.1.1** — Panel "Memori AI" → Simpan fakta penting tentang user: nama, institusi, topik riset _(🔴 Tinggi)_
- [ ] **C3.1.2** — Edit / hapus memori → User bisa kelola apa yang diingat AI _(🔴 Tinggi)_
- [ ] **C3.1.3** — Inject memori ke system prompt → Sertakan memori saat setiap percakapan baru dimulai _(🔴 Tinggi)_
- [ ] **C3.1.4** — Auto-extract memori dari chat → AI otomatis detect fakta penting dan minta izin untuk disimpan _(🟡 Sedang)_
- [ ] **C3.1.5** — Toggle on/off memori → User bisa matikan fitur memori jika tidak diinginkan _(🟡 Sedang)_

**Implementasi:** Tabel `ai_memories` baru di SQLite: `{id, user_id, key, value, created_at}`

---

#### C3.2 — Konteks Dokumen yang Lebih Cerdas

- [ ] **C3.2.1** — Context dari referensi Mendeley → Toggle: sertakan metadata referensi yang dipilih sebagai konteks _(🔴 Tinggi)_
- [ ] **C3.2.2** — Context dari sitasi di dokumen → AI bisa baca daftar sitasi yang sudah ada di dokumen _(🔴 Tinggi)_
- [ ] **C3.2.3** — Context hanya heading/struktur → Kirim hanya judul-judul bab (bukan teks penuh) untuk efisiensi token _(🟡 Sedang)_
- [ ] **C3.2.4** — Indikator token usage → Tampilkan estimasi berapa token yang akan dipakai sebelum kirim _(🟡 Sedang)_
- [ ] **C3.2.5** — Smart context chunking → Otomatis potong konteks jika terlalu panjang, prioritaskan yang relevan _(🔴 Tinggi)_

---

#### C6.1 — Manajemen Persona & Prompt

- [x] **C6.1.1** — Persona selector → Dropdown di chat header untuk mengganti persona (General Assistant, Academic Reviewer, Proofreader) _(🔴 Tinggi)_
- [ ] **C6.1.2** — Custom Instructions (Global) → UI panel untuk mengatur instruksi default AI per akun _(🟡 Sedang)_
- [ ] **C3.3.3** — Template prompt sering dipakai → Simpan prompt favorit, akses cepat via toolbar _(🟡 Sedang)_
- [ ] **C3.3.4** — Ganti persona per sesi → Tiap sesi bisa punya persona berbeda _(🟢 Rendah)_

---

### FASE C4: Fitur Khusus AutoBib (Domain-Specific)

#### C4.1 — AI Citation Assistant

- [ ] **C4.1.1** — Perintah `/sitasi [teks]` → Ketik `/sitasi Smith, 2020` → AI langsung convert jadi Mendeley field _(🔴 Tinggi)_
- [ ] **C4.1.2** — Detect sitasi dalam chat → AI deteksi jika user menyebut referensi, tawarkan untuk convert _(🔴 Tinggi)_
- [ ] **C4.1.3** — Cari referensi via chat → "Carikan paper tentang deep learning 2023" → tampil hasil dari CrossRef _(🟡 Sedang)_
- [ ] **C4.1.4** — Insert referensi dari hasil chat → Tombol "Tambah ke Mendeley" untuk paper yang disarankan AI _(🟡 Sedang)_
- [ ] **C4.1.5** — Periksa sitasi di dokumen → "Periksa semua sitasi dokumenku" → AI validasi format dan kelengkapan _(🔴 Tinggi)_

---

#### C4.2 — Writing Assistant Commands

- [ ] **C4.2.1** — `/ringkas` → Ringkas dokumen / teks blok _(🔴 Tinggi)_
- [ ] **C4.2.2** — `/parafrase` → Parafrase teks terpilih _(🔴 Tinggi)_
- [ ] **C4.2.3** — `/grammar` → Periksa dan koreksi tata bahasa _(🔴 Tinggi)_
- [ ] **C4.2.4** — `/translate [bahasa]` → Terjemahkan teks ke bahasa lain _(🟡 Sedang)_
- [ ] **C4.2.5** — `/litrev` → Buat tinjauan pustaka dari referensi Mendeley yang dipilih _(🔴 Tinggi)_
- [ ] **C4.2.6** — `/outline` → Buat outline/kerangka tulisan _(🟡 Sedang)_
- [ ] **C4.2.7** — `/tone [formal/informal]` → Ubah nada tulisan _(🟡 Sedang)_
- [ ] **C4.2.8** — `/expand` → Kembangkan teks terpilih menjadi lebih panjang _(🟡 Sedang)_
- [ ] **C4.2.9** — `/shorten` → Persingkat teks terpilih _(🟡 Sedang)_

---

#### C4.3 — Notifikasi & Status AI

- [x] **C4.3.1** — Indikator provider & model aktif → Badge kecil di header chat: "Gemini 2.5 flash • Key Kampus" _(🔴 Tinggi)_
- [ ] **C4.3.2** — Token usage per pesan → Tampilkan estimasi token yang dipakai setiap respons AI _(🟡 Sedang)_
- [ ] **C4.3.3** — Estimasi biaya API per sesi → Hitung perkiraan biaya berdasarkan token × harga provider _(🟢 Rendah)_
- [ ] **C4.3.4** — Notifikasi key rotated → Toast: "Berpindah ke Key Backup karena Key Utama rate limited" _(🟡 Sedang)_
- [x] **C4.3.5** — Status koneksi backend → Indikator dot hijau/merah: backend online/offline _(🔴 Tinggi)_

---

### FASE C5: UI / UX Improvements

#### C5.1 — Tampilan Pesan

- [ ] **C5.1.1** — Avatar per pesan → Ikon user dan ikon AI yang berbeda di setiap bubble _(🟡 Sedang)_
- [x] **C5.1.2** — Syntax highlighting kode → Gunakan Prism.js / highlight.js untuk blok kode di respons _(🔴 Tinggi)_
- [x] **C5.1.3** — Tombol salin per blok kode → "Copy Code" button yang muncul saat hover blok kode _(🔴 Tinggi)_
- [ ] **C5.1.4** — Render tabel dengan styling → Tabel Markdown dirender dengan CSS yang lebih cantik _(🟡 Sedang)_
- [ ] **C5.1.5** — LaTeX / Math rendering → Render formula matematika dengan KaTeX (berguna untuk paper sains) _(🟢 Rendah)_
- [ ] **C5.1.6** — Animasi bubble masuk → Smooth fade-in untuk pesan baru _(🟡 Sedang)_

---

#### C5.2 — Navigasi & Aksesibilitas

- [x] **C5.2.1** — Scroll to bottom button → Tombol "↓" muncul jika user scroll ke atas, klik langsung ke bawah _(🔴 Tinggi)_
- [ ] **C5.2.2** — Jump to latest message → Shortcut `End` atau tombol untuk langsung ke pesan terbaru _(🟡 Sedang)_
- [ ] **C5.2.3** — Infinite scroll riwayat → Muat pesan lama secara lazy saat scroll ke atas _(🟡 Sedang)_
- [ ] **C5.2.4** — Keyboard navigation → Navigasi antar sesi dengan arrow key _(🟢 Rendah)_
- [ ] **C5.2.5** — Empty state illustration → Ilustrasi menarik saat belum ada pesan / sesi baru _(🟡 Sedang)_

---

#### C5.3 — Mode & Tema

- [ ] **C5.3.1** — Mode "Fokus" (fullscreen) → Sembunyikan sidebar, perluas area chat ke seluruh panel _(🟡 Sedang)_
- [ ] **C5.3.2** — Ukuran font adjustable → Slider untuk ubah ukuran teks chat _(🟢 Rendah)_
- [ ] **C5.3.3** — Compact mode → Mode padat untuk tampilkan lebih banyak pesan di layar _(🟢 Rendah)_

---

### FASE C7: Tool Enhancements (Word API Tools)
> Fase ini khusus membahas penambahan tool-tool yang **OfficeBridge sudah dukung** namun **belum bisa dipanggil AI**, serta tool baru yang perlu ditambahkan ke `office-bridge.js`.

#### C7.1 — Ekspos Tool Yang Sudah Ada ke AI
> Tool-tool ini sudah ada di `office-bridge.js` tapi sistem prompt AI **belum tahu cara memanggilnya**.

- [ ] **C7.1.1** — `tool: insert_ooxml` → Panggil `insertOoxml()` → sisipkan Mendeley field di cursor _(🔴 Tinggi)_
- [ ] **C7.1.2** — `tool: insert_at_cursor` → Panggil `insertText()` / `insertHtml()` di posisi cursor (bukan cari-ganti) _(🔴 Tinggi)_
- [ ] **C7.1.3** — `tool: append_to_doc` → Panggil `appendText()` → tambahkan konten di akhir dokumen _(🔴 Tinggi)_
- [ ] **C7.1.4** — `tool: strip_citations` → Panggil `stripCitationFormatting()` → reset semua sitasi Mendeley jadi teks _(🟡 Sedang)_
- [ ] **C7.1.5** — `tool: read_citations` → Panggil `extractMendeleyCitations()` → AI bisa baca daftar sitasi aktif _(🔴 Tinggi)_
- [ ] **C7.1.6** — `tool: insert_bibliography` → Panggil `insertBibliography()` / `updateBibliography()` langsung dari chat _(🟡 Sedang)_
- [ ] **C7.1.7** — `tool: scan_citations` → Panggil `scanForCitations()` → temukan sitasi teks mentah dalam dokumen _(🟡 Sedang)_

**Implementasi:** Update system prompt backend + dispatcher di `chat.js` untuk route ke fungsi-fungsi ini.

---

#### C7.2 — Tool Baru yang Perlu Ditambahkan ke OfficeBridge
> Fungsi-fungsi ini **belum ada** di `office-bridge.js` dan perlu dibuat dari awal.

- [ ] **C7.2.1** — `getDocumentStructure()` → Baca judul-judul heading (H1–H6) beserta level & urutannya → kirim sebagai context AI _(🔴 Tinggi)_
- [ ] **C7.2.2** — `getWordCount()` → Hitung jumlah kata, paragraf, kalimat di dokumen → AI bisa jawab "berapa kata dok ini?" _(🔴 Tinggi)_
- [ ] **C7.2.3** — `getCursorContext()` → Baca paragraf tempat cursor berada saat ini → context hyperlokal untuk AI _(🔴 Tinggi)_
- [ ] **C7.2.4** — `insertHeading(text, level)` → Sisipkan paragraf dengan style Heading 1/2/3 secara langsung _(🟡 Sedang)_
- [ ] **C7.2.5** — `setPageMargins(top, bottom, left, right)` → Ubah margin halaman via AI command _(🟢 Rendah)_
- [ ] **C7.2.6** — `formatParagraph(find, style)` → Ubah style paragraf tertentu (Normal/Heading/Quote) _(🟡 Sedang)_
- [ ] **C7.2.7** — `findAndBookmark(text, name)` → Tambahkan Bookmark di teks tertentu → AI bisa referensi lokasi _(🟢 Rendah)_
- [ ] **C7.2.8** — `getDocumentMetadata()` → Baca title, author, word count dari document properties _(🟡 Sedang)_
- [ ] **C7.2.9** — `insertFootnote(anchorText, noteText)` → Sisipkan catatan kaki di teks tertentu _(🟡 Sedang)_
- [ ] **C7.2.10** — `insertPageBreak()` → Sisipkan page break di posisi cursor _(🟡 Sedang)_
- [ ] **C7.2.11** — `changeFont(find, fontName, size, color)` → Ubah font/ukuran/warna teks tertentu _(🟡 Sedang)_
- [ ] **C7.2.12** — `createHyperlink(find, url)` → Ubah teks tertentu menjadi hyperlink _(🟡 Sedang)_
- [ ] **C7.2.13** — `moveTextToSection(find, targetHeading)` → Pindahkan paragraf ke bawah heading tertentu _(🟢 Rendah)_
- [ ] **C7.2.14** — `undoLastAction()` → Trigger Ctrl+Z via Office API (jika tersedia) _(🟢 Rendah)_

---

#### C7.3 — Perbaikan Dispatcher Tool di chat.js
> Saat ini dispatcher di `chat.js` hanya handle 7 tool. Perlu direfaktor menjadi sistem yang lebih extensible.

- [ ] **C7.3.1** — Refaktor dispatcher ke Map/Registry → Ganti `if (opsByAction.replace)` dengan `ToolRegistry.execute(action, ops)` _(🔴 Tinggi)_
- [ ] **C7.3.2** — Tool: konfirmasi sebelum eksekusi → Untuk tool destruktif (delete, strip_citations), tampilkan dialog konfirmasi _(🔴 Tinggi)_
- [ ] **C7.3.3** — Tool: undo stack → Sebelum eksekusi tool, simpan snapshot teks sebagai undo point _(🟡 Sedang)_
- [ ] **C7.3.4** — Tool: progress indicator → Untuk batch operations besar, tampilkan progress bar kecil _(🟡 Sedang)_
- [ ] **C7.3.5** — Validasi tool payload → Cek `find`, `replace`, dll tidak kosong sebelum dipanggil _(🔴 Tinggi)_
- [ ] **C7.3.6** — Tool result feedback → Setelah eksekusi, AI menerima "tool_result" (berhasil/gagal + detail) _(🔴 Tinggi)_
- [ ] **C7.3.7** — Multi-step tool chain → AI bisa jalankan sequence tool: read_citations → generate → insert_bibliography _(🟡 Sedang)_

---

#### C7.4 — Tool Kategori Baru: Analisis Dokumen
> Tool-tool yang memungkinkan AI menganalisis dokumen dan memberikan laporan.

- [ ] **C7.4.1** — `tool: analyze_structure` → AI baca heading → laporkan struktur bab, keseimbangan konten _(🟡 Sedang)_
- [ ] **C7.4.2** — `tool: find_plagiarism_risk` → AI baca teks → deteksi bagian tanpa sitasi yang berpotensi masalah _(🟡 Sedang)_
- [ ] **C7.4.3** — `tool: check_citation_consistency` → Periksa konsistensi format sitasi di seluruh dokumen _(🔴 Tinggi)_
- [ ] **C7.4.4** — `tool: suggest_references` → AI analisis topik paragraf → sarankan referensi dari Mendeley library _(🟡 Sedang)_
- [ ] **C7.4.5** — `tool: generate_abstract` → AI baca seluruh dokumen → generate abstrak otomatis _(🟡 Sedang)_
- [ ] **C7.4.6** — `tool: generate_outline` → AI baca konten → generate/perbaiki outline/daftar isi _(🟡 Sedang)_

---

### FASE C6: Keamanan & Privasi

- [ ] **C6.1** — Mode "Tanpa Riwayat" → Sesi tidak tersimpan ke DB (seperti incognito) _(🟡 Sedang)_
- [ ] **C6.2** — Auto-delete riwayat lama → Setting: hapus otomatis sesi lebih dari 30/60/90 hari _(🟡 Sedang)_
- [ ] **C6.3** — Enkripsi isi pesan di DB → Enkripsi kolom `content` di tabel messages (opsional) _(🟢 Rendah)_
- [ ] **C6.4** — Lock chat dengan PIN → Proteksi akses chat dengan PIN / password _(🟢 Rendah)_

---

## 📊 Ringkasan Prioritas

| Prioritas | Jumlah Fitur | Keterangan |
|-----------|-------------|------------|
| 🔴 Tinggi | ~28 fitur | Harus ada di versi selanjutnya |
| 🟡 Sedang | ~27 fitur | Ditambahkan setelah fitur tinggi selesai |
| 🟢 Rendah | ~14 fitur | Nice-to-have, dikerjakan jika ada waktu |

---

## 🗓️ Timeline Implementasi

```
Sprint 1 (Minggu 1–2): Fondasi UX
─────────────────────────────────
- [x] C1.4.2  Auto-resize textarea
- [x] C1.4.4  Slash command (/) menu
- [x] C5.1.2  Syntax highlighting kode
- [x] C5.1.3  Tombol salin per blok kode
- [x] C5.2.1  Scroll to bottom button
- [x] C4.3.5  Status koneksi backend
- [x] C4.3.1  Indikator provider & model aktif

Sprint 2 (Minggu 3–4): Konteks & Memori
─────────────────────────────────────────
- [ ] C3.1.1  Panel "Memori AI"
- [ ] C3.1.2  Edit / hapus memori
- [ ] C3.1.3  Inject memori ke system prompt
- [ ] C3.2.1  Konteks dari referensi Mendeley
- [x] C6.1.1  Persona selector (C3.3.1)
- [x] C4.2.1  List semua sesi
- [x] C4.2.2  Hapus / ganti nama sesi

Sprint 3 (Minggu 5–6): Citation Superpower
───────────────────────────────────────────
- [x] C4.1.1  Perintah /sitasi
- [x] C4.1.2  Detect sitasi dalam chat
- [x] C4.1.5  Periksa sitasi di dokumen
- [x] C4.2.1-2 Slash commands /ringkas, /parafrase
- [x] C4.2.3   Slash command /grammar

Sprint 4 (Minggu 7–8): Input & Attachment
──────────────────────────────────────────
- [x] C1.1.1  Tombol Voice Input
- [x] C1.2.1  Upload gambar
- [x] C1.2.3  Kirim gambar ke AI (vision)
- [x] C1.3.2  Tombol Regenerate
- [x] C2.1.1  Searchbar riwayat sesi

Sprint 5 (Minggu 9–10): Ekspor & Polish
─────────────────────────────────────────
- [x] C2.2.1  Ekspor sesi ke TXT/MD
- [x] C2.2.3  Ekspor sesi ke Word
- [x] C5.2.5  Empty state illustration
- [x] C5.1.6  Animasi bubble masuk
- [x] Semua fitur prioritas 🟡 Sedang yang tersisa
```

---

## 🗃️ Perubahan Database yang Dibutuhkan

```sql
-- Tabel baru untuk Memori AI persisten
CREATE TABLE ai_memories (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     TEXT    NOT NULL,
    key         TEXT    NOT NULL,        -- "nama_user", "institusi", "topik_riset"
    value       TEXT    NOT NULL,
    created_at  TEXT    DEFAULT (datetime('now')),
    updated_at  TEXT    DEFAULT (datetime('now'))
);

-- Tabel baru untuk Prompt Template
CREATE TABLE prompt_templates (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     TEXT    NOT NULL,
    name        TEXT    NOT NULL,        -- "Parafrase Akademik", "Reviewer Jurnal"
    content     TEXT    NOT NULL,
    created_at  TEXT    DEFAULT (datetime('now'))
);

-- Kolom baru di tabel sessions
ALTER TABLE chat_sessions ADD COLUMN persona TEXT DEFAULT 'academic';
ALTER TABLE chat_sessions ADD COLUMN is_incognito INTEGER DEFAULT 0;
ALTER TABLE chat_sessions ADD COLUMN is_bookmarked INTEGER DEFAULT 0;

-- Kolom baru di tabel messages
ALTER TABLE chat_messages ADD COLUMN feedback INTEGER DEFAULT NULL; -- 1=like, -1=dislike
ALTER TABLE chat_messages ADD COLUMN token_count INTEGER DEFAULT 0;
ALTER TABLE chat_messages ADD COLUMN is_pinned INTEGER DEFAULT 0;
ALTER TABLE chat_messages ADD COLUMN attachment_url TEXT DEFAULT NULL;
```

---

## 🔌 Dependensi Baru yang Diperlukan

| Library | Fungsi | CDN |
|---------|--------|-----|
| **Prism.js** | Syntax highlighting kode | `cdnjs.cloudflare.com/prism` |
| **KaTeX** | Render formula LaTeX | `cdn.jsdelivr.net/katex` |
| **jsPDF** | Ekspor chat ke PDF | `cdnjs.cloudflare.com/jspdf` |
| **Fuse.js** | Pencarian fuzzy riwayat sesi | `cdn.jsdelivr.net/fuse.js` |
| **Web Speech API** | Voice input (built-in browser) | Tidak perlu CDN |

---

> [!IMPORTANT]
> Fitur **C3.1 (Memori AI)** dan **C3.3 (System Prompt Kustom)** adalah prioritas tertinggi karena langsung meningkatkan kualitas respons AI secara signifikan tanpa memerlukan dependensi eksternal baru.

> [!TIP]
> Mulai dari **Slash Commands (`/`)** di Sprint 1 karena relatif mudah diimplementasi dan langsung memberikan wow factor kepada user.

> [!NOTE]
> Fitur **Upload Gambar** (C1.2) memerlukan pemilihan provider AI yang support vision. Pastikan backend `ai-factory.ts` sudah menangani routing ke model vision yang tepat (GPT-4V / Gemini 2.5 flash).

> [!WARNING]
> Fitur **Voice Input** (C1.1) menggunakan `SpeechRecognition` API yang hanya tersedia di browser berbasis Chromium. Di Office Web Add-in pastikan add-in berjalan di konteks browser yang mendukung.
