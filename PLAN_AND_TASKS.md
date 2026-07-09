# 📚 AutoBib — Word Add-in: AI Multi-Provider + Mendeley Integration
> **Versi Plan:** 1.2 | Terakhir diupdate: 2026-06-27 | Ditambahkan: Auto-add ke Mendeley library (tanpa upload manual)
**Project Plan & Task List (Full Stack)**

---

## 🎯 Deskripsi Proyek

**AutoBib** adalah Microsoft Word Add-in berbasis Office Web Add-in (HTML/CSS/JS + Node.js Backend) yang memungkinkan pengguna untuk:
- Menghubungkan akun **Mendeley** sebagai sumber referensi
- Menggunakan berbagai **AI Provider** (Gemini, OpenAI, Claude, Groq) menggunakan API Key masing-masing
- Secara otomatis **merangkum, memparafrase, dan menyusun tinjauan pustaka** dari referensi yang dipilih
- Menyisipkan hasil teks beserta **sitasi otomatis** langsung ke dokumen Word
- **[FITUR UTAMA]** Mengkonversi sitasi manual yang ditulis user menjadi **Word Field Code** yang terbaca sebagai sitasi Mendeley asli

---

## ⭐ Fitur Utama: Smart Citation Converter

> Ini adalah fitur inti yang membedakan AutoBib dari tool lainnya.

**Masalah yang diselesaikan:**
Ketika pengguna menulis atau menyalin sitasi dalam format teks biasa (plain text), Mendeley tidak mengenalinya sebagai sitasi yang dapat dikelola. Akibatnya bibliography tidak bisa di-update otomatis oleh Mendeley.

**Solusi AutoBib:**
AI membaca sitasi teks mentah dari user → mencari metadata lengkapnya → menyisipkan Word Field Code XML yang persis seperti yang dibuat Mendeley plugin, sehingga Mendeley **langsung mengenalinya** seolah-olah sitasi itu dimasukkan manual via Mendeley.

### Alur Kerja Smart Citation Converter

> **Pengguna TIDAK perlu upload manual ke Mendeley terlebih dahulu.**
> AutoBib akan otomatis menambahkan paper ke library Mendeley user via API jika belum ada.

```
 USER INPUT (Plain Text)
 ───────────────────────
 "Smith et al., 2020"
 "(Johnson, 2018, p.45)"
 "Doe, J. (2021). Title..."
  Teks bebas format apapun
         │
         ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │                    PROSES BACKEND                               │
  │                                                                 │
  │  Step 1: AI parsing → { author, year, title, journal, doi }    │
  │  Step 2: Cari metadata lengkap (fallback chain)                 │
  │  Step 3: Jika paper belum ada di Mendeley lib user →            │
  │          AUTO POST /documents ke Mendeley API (tambah otomatis) │
  │  Step 4: Dapat Mendeley document_id (UUID asli)                 │
  │  Step 5: Build Word OOXML Field Code dengan UUID tsb            │
  └─────────────────────────────────────────────────────────────────┘
         │
         ▼
  OUTPUT: Word Field Code yang 100% dikenali Mendeley
  { ADDIN Mendeley Citation {"citationItems":[{"id":"UUID-MENDELEY","itemData":{...}}]} }
```

### Dua Skenario User

```
 Skenario A: Paper SUDAH ada di Mendeley
 ─────────────────────────────────────────
 Teks sitasi → Cari di Mendeley lib → Dapat UUID asli
     → Buat field code → ✅ Insert ke Word (Mendeley langsung kenal)

 Skenario B: Paper BELUM ada di Mendeley  ⭐ TIDAK PERLU UPLOAD MANUAL
 ──────────────────────────────────────────────────────────────────────
 Teks sitasi → CrossRef/Semantic Scholar → Dapat metadata
     → POST /documents ke Mendeley API (otomatis tambah ke library)
     → Dapat UUID baru dari Mendeley
     → Buat field code → ✅ Insert ke Word (Mendeley tetap kenal)

 Skenario C: Paper tidak terindeks (buku langka, tesis lokal)
 ─────────────────────────────────────────────────────────────
 Teks sitasi → AI best-effort extraction → Metadata parsial
     → POST /documents ke Mendeley API (dengan data seadanya)
     → ⚠️  Insert ke Word, Mendeley kenal tapi metadata mungkin tidak lengkap
         User bisa edit manual di Mendeley setelahnya
```

### Format Field Code Word yang Dihasilkan

Mendeley menyimpan sitasi di Word sebagai **Content Control** dengan XML seperti berikut:

```xml
<!-- Contoh struktur Word Field Code Mendeley -->
<w:sdt>
  <w:sdtPr>
    <w:tag w:val="MENDELEY_CITATION_1"/>
  </w:sdtPr>
  <w:sdtContent>
    <w:p>
      <w:fldChar w:fldCharType="begin"/>
      <w:instrText>ADDIN Mendeley Citation{&quot;mendeley&quot;:{&quot;formattedCitation&quot;:&quot;(Smith, 2020)&quot;,&quot;plainTextFormattedCitation&quot;:&quot;(Smith, 2020)&quot;,&quot;previouslyFormattedCitation&quot;:&quot;(Smith, 2020)&quot;},&quot;properties&quot;:{&quot;noteIndex&quot;:0},&quot;schema&quot;:&quot;https://github.com/citation-style-language/schema/raw/master/csl-citation.json&quot;,&quot;citationItems&quot;:[{&quot;id&quot;:&quot;ITEM-1&quot;,&quot;itemData&quot;:{...CSL JSON data...},&quot;uris&quot;:[&quot;http://www.mendeley.com/documents/?uuid=xxx&quot;]}]}</w:instrText>
      <w:fldChar w:fldCharType="end"/>
    </w:p>
  </w:sdtContent>
</w:sdt>
```

### Sumber Pencarian Metadata (Fallback Chain)

```
Teks Sitasi User
      │
      ▼
┌─────────────────┐     Ketemu    ┌────────────────────┐
│ 1. Mendeley API │ ─────────────▶│ Ambil CSL JSON     │
│   (Library user)│               │ dari Mendeley       │
└─────────────────┘               └────────────────────┘
      │ Tidak ketemu
      ▼
┌─────────────────┐     Ketemu    ┌────────────────────┐
│ 2. CrossRef API │ ─────────────▶│ Ambil DOI + meta   │
│   (DOI lookup)  │               │ konversi ke CSL     │
└─────────────────┘               └────────────────────┘
      │ Tidak ketemu
      ▼
┌─────────────────┐     Ketemu    ┌────────────────────┐
│ 3. Semantic     │ ─────────────▶│ Ambil metadata     │
│   Scholar API   │               │ dari paper DB       │
└─────────────────┘               └────────────────────┘
      │ Tidak ketemu
      ▼
┌─────────────────┐
│ 4. AI Parsing   │ ──────────────▶ Ekstrak info manual
│  (Best-effort)  │                 (tanpa DOI, manual)
└─────────────────┘
```

---

## 🏗️ Arsitektur Sistem

```
┌────────────────────────────────────────────────────────────┐
│               Microsoft Word (Desktop/Web)                 │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              Task Pane (Add-in UI)                   │  │
│  │  HTML + CSS + Vanilla JS + Office.js                 │  │
│  └────────────────────┬─────────────────────────────────┘  │
└───────────────────────┼────────────────────────────────────┘
                        │ HTTPS (REST / SSE)
                        ▼
          ┌─────────────────────────┐
          │   Backend API (Node.js) │
          │   Express.js + TypeScript│
          └──────┬────────┬─────────┘
                 │        │
        ┌────────┘        └──────────┐
        ▼                            ▼
┌───────────────┐          ┌──────────────────────┐
│  Mendeley API │          │   AI Providers APIs   │
│  (OAuth 2.0)  │          │  - OpenAI (GPT-4o)   │
└───────────────┘          │  - Google Gemini      │
                           │  - Anthropic Claude   │
                           │  - Groq (Llama 3.1)  │
                           └──────────────────────┘
```

---

## 📦 Tech Stack

| Layer       | Teknologi                                                      |
|-------------|----------------------------------------------------------------|
| Frontend    | HTML5, CSS3 (Vanilla), JavaScript (ES6+), Office.js (Word API) |
| Backend     | Node.js, Express.js, TypeScript                                |
| Auth        | OAuth 2.0 (Mendeley), JWT (session user)                       |
| Database    | SQLite (lokal, simpan API Keys & settings terenkripsi)         |
| AI Provider | OpenAI SDK, Google GenAI SDK, Anthropic SDK, Axios (Groq)      |
| Metadata    | CrossRef API (free), Semantic Scholar API (free), Mendeley API  |
| Dev Tools   | Yeoman Generator (Office Add-in), Nodemon, ESLint, Prettier    |
| Packaging   | Manifest XML (Office Add-in), npm, ts-node                     |

---

## 📁 Struktur Folder Proyek

```
autobib/
├── manifest.xml                    # Office Add-in manifest
├── package.json
├── tsconfig.json
│
├── frontend/                       # Task Pane UI
│   ├── index.html
│   ├── assets/
│   │   ├── css/
│   │   │   ├── main.css
│   │   │   ├── components.css
│   │   │   └── themes.css
│   │   ├── js/
│   │   │   ├── app.js              # Entry point
│   │   │   ├── office-bridge.js    # Office.js Word API wrapper
│   │   │   ├── api-client.js       # HTTP client ke backend
│   │   │   ├── mendeley.js         # Mendeley OAuth UI handler
│   │   │   ├── ai-selector.js      # AI provider UI handler
│   │   │   └── settings.js         # Settings panel logic
│   │   └── icons/
│
├── backend/                        # Node.js API Server
│   ├── src/
│   │   ├── server.ts               # Express app entry
│   │   ├── routes/
│   │   │   ├── auth.route.ts       # Mendeley OAuth routes
│   │   │   ├── mendeley.route.ts   # Mendeley API proxy
│   │   │   ├── ai.route.ts         # AI processing routes
│   │   │   └── settings.route.ts   # User settings routes
│   │   ├── services/
│   │   │   ├── mendeley.service.ts
│   │   │   ├── ai/
│   │   │   │   ├── ai-factory.ts   # Factory: routing ke AI yang dipilih
│   │   │   │   ├── openai.service.ts
│   │   │   │   ├── gemini.service.ts
│   │   │   │   ├── claude.service.ts
│   │   │   │   └── groq.service.ts
│   │   │   └── citation.service.ts
│   │   ├── middleware/
│   │   │   ├── auth.middleware.ts
│   │   │   └── error.middleware.ts
│   │   ├── models/
│   │   │   ├── user.model.ts
│   │   │   └── history.model.ts
│   │   └── utils/
│   │       ├── crypto.ts              # Enkripsi API Keys (AES-256)
│   │       ├── prompt-builder.ts      # Susun prompt AI berdasarkan mode
│   │       └── mendeley-field.ts      # Builder Word Field Code XML Mendeley
│   ├── services/
│   │   ├── citation-parser.service.ts # AI parse teks sitasi → structured data
│   │   ├── metadata-resolver.service.ts # Resolve metadata via CrossRef/Semantic
│   │   └── smart-citation.service.ts  # Orkestrasi: parse → resolve → build field
│   └── database/
│       └── schema.sql
│
└── docs/
    └── PLAN_AND_TASKS.md
```

---

## 🗂️ FASE & TASK LIST

---

### FASE 0: Setup & Boilerplate
> **Target:** Proyek bisa dijalankan secara lokal (development mode)

| No | Task | Detail | Status |
|----|------|---------|--------|
| 0.1 | Inisialisasi proyek | `npm init`, setup folder struktur | ⬜ |
| 0.2 | Setup Office Add-in manifest | Buat `manifest.xml` dengan konfigurasi Task Pane | ⬜ |
| 0.3 | Setup Backend (Node + TypeScript) | Inisialisasi Express, tsconfig, nodemon | ⬜ |
| 0.4 | Setup Database SQLite | Buat schema: `users`, `api_key_pools`, `key_usage_log`, `history` | ⬜ |
| 0.5 | Setup HTTPS lokal (dev) | Gunakan `office-addin-dev-certs` untuk SSL lokal | ⬜ |
| 0.6 | Uji coba Task Pane di Word | Sideload add-in, pastikan panel muncul di Word | ⬜ |

---

### FASE 1: Frontend — UI Task Pane
> **Target:** Antarmuka lengkap dengan navigasi multi-tab dan tampilan modern

#### 1.1 — Layout & Design System

| No | Task | Detail | Status |
|----|------|---------|--------|
| 1.1.1 | Buat `index.html` | Struktur dasar Task Pane (Nav + Content Area) | ⬜ |
| 1.1.2 | Design System CSS | Variabel warna, font (Inter), spacing, shadow | ⬜ |
| 1.1.3 | Dark/Light Mode | Toggle tema, simpan preferensi ke localStorage | ⬜ |
| 1.1.4 | Navigasi Tab | Tab: `Referensi`, `AI Generate`, `Sitasi`, `Pengaturan` | ⬜ |
| 1.1.5 | Komponen Card | Card untuk daftar referensi Mendeley | ⬜ |
| 1.1.6 | Komponen Button | Primary, secondary, icon button dengan hover/active effect | ⬜ |
| 1.1.7 | Komponen Input | Text input, dropdown, toggle switch | ⬜ |
| 1.1.8 | Komponen Toast | Success, error, loading notification (auto-dismiss) | ⬜ |
| 1.1.9 | Loading Skeleton | Skeleton screen saat data sedang dimuat | ⬜ |

#### 1.2 — Halaman: Pengaturan (Settings)

| No | Task | Detail | Status |
|----|------|---------|--------|
| 1.2.1 | Form input API Key dengan Nama | Input: Nama Key (label), Value Key, per provider | ⬜ |
| 1.2.2 | Tambah Multiple Key per Provider | Tombol "+" untuk tambah key baru — max 10 key per provider | ⬜ |
| 1.2.3 | Daftar Key per Provider (Card List) | Tampilkan nama key, status (aktif/limit/error), urutan rotasi | ⬜ |
| 1.2.4 | Toggle show/hide API Key value | Ikon mata per baris key | ⬜ |
| 1.2.5 | Drag & Drop urutan rotasi | User bisa atur urutan prioritas key | ⬜ |
| 1.2.6 | Tombol "Test" per Key | Test individual key, tampilkan: valid/limit/invalid | ⬜ |
| 1.2.7 | Tombol hapus per Key | Hapus satu key dari pool | ⬜ |
| 1.2.8 | Badge status per Key | Hijau=Aktif, Kuning=Mendekati limit, Merah=Limit habis | ⬜ |
| 1.2.9 | Dropdown Pilih Provider Aktif | Pilih provider utama (key akan di-rotate otomatis) | ⬜ |
| 1.2.10 | Toggle: Mode Rotation | Pilih strategi: Round-Robin / Failover / Least-Used | ⬜ |
| 1.2.11 | Pengaturan Format Sitasi | Pilih: APA, MLA, Chicago, IEEE | ⬜ |
| 1.2.12 | Pengaturan Bahasa Output | Indonesia / English | ⬜ |
| 1.2.13 | Simpan Pengaturan | POST ke backend, tampilkan toast konfirmasi | ⬜ |

#### 1.3 — Halaman: Referensi (Mendeley)

| No | Task | Detail | Status |
|----|------|---------|--------|
| 1.3.1 | Tombol "Login Mendeley" | Buka popup OAuth Mendeley, handle callback | ⬜ |
| 1.3.2 | Status koneksi Mendeley | Tampilkan nama akun + badge "Terhubung" | ⬜ |
| 1.3.3 | Search bar referensi | Input pencarian dengan debounce | ⬜ |
| 1.3.4 | Daftar Referensi (Card List) | Tampilkan judul, penulis, tahun, nama jurnal | ⬜ |
| 1.3.5 | Checkbox multi-select referensi | Pilih banyak referensi, tampilkan counter | ⬜ |
| 1.3.6 | Filter berdasarkan Folder/Tag | Dropdown filter berdasarkan grup Mendeley | ⬜ |
| 1.3.7 | Preview Abstrak | Klik kartu → tampilkan abstrak di drawer bawah | ⬜ |
| 1.3.8 | Tombol "Tambahkan ke Antrian" | Pindahkan referensi ke antrian AI Generate | ⬜ |

#### 1.4 — Halaman: AI Generate

| No | Task | Detail | Status |
|----|------|---------|--------|
| 1.4.1 | Panel antrian referensi | Daftar referensi terpilih, bisa hapus per item | ⬜ |
| 1.4.2 | Dropdown mode generate | Ringkasan, Parafrase, Tinjauan Pustaka, Custom | ⬜ |
| 1.4.3 | Custom prompt textarea | Input instruksi tambahan (muncul jika mode Custom) | ⬜ |
| 1.4.4 | Badge AI Provider + Key aktif | Tampilkan: provider + nama key yang sedang dipakai | ⬜ |
| 1.4.4b | Indikator rotasi real-time | Notifikasi kecil saat AutoBib pindah ke key berikutnya | ⬜ |
| 1.4.5 | Tombol "Generate" | Kirim request, tampilkan loading spinner | ⬜ |
| 1.4.6 | Streaming output (SSE) | Tampilkan hasil AI real-time (token per token) | ⬜ |
| 1.4.7 | Preview hasil generate | Area teks scrollable yang bisa diedit sebelum insert | ⬜ |
| 1.4.8 | Tombol "Insert ke Word" | Sisipkan teks ke posisi cursor via Office.js | ⬜ |
| 1.4.9 | Tombol "Copy to Clipboard" | Salin seluruh teks hasil | ⬜ |
| 1.4.10 | Tombol "Regenerate" | Kirim ulang request dengan parameter sama | ⬜ |

#### 1.5 — Halaman: Sitasi

| No | Task | Detail | Status |
|----|------|---------|--------|
| 1.5.1 | Daftar sitasi otomatis | Generate dari metadata Mendeley referensi terpilih | ⬜ |
| 1.5.2 | Pilih format sitasi | Real-time update tampilan saat format diubah | ⬜ |
| 1.5.3 | Tombol "Insert Daftar Pustaka" | Sisipkan ke akhir dokumen Word | ⬜ |
| 1.5.4 | Tombol "Insert Sitasi Inline" | Sisipkan format singkat, contoh: (Smith, 2020) | ⬜ |

---

### FASE 2: Backend — API Server
> **Target:** Server berjalan, semua endpoint tersedia dan teruji

#### 2.1 — Setup & Infrastruktur

| No | Task | Detail | Status |
|----|------|---------|--------|
| 2.1.1 | Setup Express + TypeScript | Konfigurasi dasar server, routing, middleware | ⬜ |
| 2.1.2 | Setup CORS | Izinkan request dari origin Task Pane (localhost) | ⬜ |
| 2.1.3 | Setup SQLite (better-sqlite3) | Koneksi DB, eksekusi schema.sql saat startup | ⬜ |
| 2.1.4 | Setup JWT Auth middleware | Validasi token di semua route yang butuh auth | ⬜ |
| 2.1.5 | Setup enkripsi API Keys | AES-256-GCM, enkripsi sebelum simpan ke DB | ⬜ |
| 2.1.6 | Error handler global | Tangkap semua error, kembalikan JSON standar | ⬜ |
| 2.1.7 | Logger (Morgan + Winston) | Log semua request dan error ke file | ⬜ |

#### 2.2 — Auth & Settings Routes

| No | Task | Detail | Status |
|----|------|---------|--------|
| 2.2.1 | `GET /auth/mendeley` | Redirect ke halaman otorisasi OAuth Mendeley | ⬜ |
| 2.2.2 | `GET /auth/mendeley/callback` | Tangkap auth code, tukar dengan access + refresh token | ⬜ |
| 2.2.3 | `POST /settings/api-keys` | Enkripsi dan simpan API keys ke DB | ⬜ |
| 2.2.4 | `GET /settings` | Return settings user (API key tidak di-expose) | ⬜ |
| 2.2.5 | `POST /settings/test-key` | Test key ke provider, return status valid/invalid | ⬜ |

#### 2.3 — Mendeley Service Routes

| No | Task | Detail | Status |
|----|------|---------|--------|
| 2.3.1 | `GET /mendeley/documents` | Ambil daftar dokumen (dengan pagination) | ⬜ |
| 2.3.2 | `GET /mendeley/documents/search` | Cari dokumen berdasarkan query | ⬜ |
| 2.3.3 | `GET /mendeley/documents/:id` | Detail dokumen beserta abstrak | ⬜ |
| 2.3.4 | `GET /mendeley/groups` | Daftar grup/folder Mendeley user | ⬜ |
| 2.3.5 | Auto Refresh Token | Deteksi expired, auto-refresh sebelum request | ⬜ |

#### 2.4 — AI Service Routes

| No | Task | Detail | Status |
|----|------|---------|--------|
| 2.4.1 | `ai-factory.ts` | Factory pattern: return service berdasarkan provider | ⬜ |
| 2.4.2 | `openai.service.ts` | Chat Completions API (GPT-4o, stream support) | ⬜ |
| 2.4.3 | `gemini.service.ts` | Google Gemini generateContentStream | ⬜ |
| 2.4.4 | `claude.service.ts` | Anthropic Messages API dengan streaming | ⬜ |
| 2.4.5 | `groq.service.ts` | Groq API (Llama 3.1 70b) - OpenAI-compatible | ⬜ |
| 2.4.6 | `POST /ai/generate` | Endpoint utama: terima refs + mode + provider | ⬜ |
| 2.4.7 | Streaming via SSE | Server-Sent Events, pipe AI stream ke response | ⬜ |
| 2.4.8 | `prompt-builder.ts` | Sistem prompt sesuai mode (ringkasan/parafrase/litrev) | ⬜ |
| 2.4.9 | Token limit handler | Chunking abstrak panjang agar tidak melebihi batas | ⬜ |
| 2.4.10 | Integrasikan Key Pool Manager | Panggil Key Pool sebelum request, dapatkan key aktif | ⬜ |

#### 2.5 — Citation Service

| No | Task | Detail | Status |
|----|------|---------|--------|
| 2.5.1 | `citation.service.ts` | Konversi metadata Mendeley ke APA, MLA, Chicago, IEEE | ⬜ |
| 2.5.2 | `POST /citation/format` | Terima array dokumen + format, return sitasi string | ⬜ |
| 2.5.3 | Inline citation generator | Generate format singkat: (Penulis, Tahun) | ⬜ |

---

### FASE 3: Office.js Integration (Word API)
> **Target:** Hasil AI dan sitasi dapat disisipkan langsung ke dokumen Word

| No | Task | Detail | Status |
|----|------|---------|--------|
| 3.1 | Setup `office-bridge.js` | Wrapper `Office.context.document` untuk semua interaksi | ⬜ |
| 3.2 | Insert teks di posisi cursor | `context.document.getSelection().insertText()` | ⬜ |
| 3.3 | Insert di akhir dokumen | Append paragraf baru ke akhir body dokumen | ⬜ |
| 3.4 | Format teks sisipan | Bold/Italic untuk elemen tertentu (nama jurnal, dll) | ⬜ |
| 3.5 | Insert daftar pustaka | Paragraf dengan indentasi hanging yang benar | ⬜ |
| 3.6 | Undo support | Pastikan semua insert bisa di-Ctrl+Z oleh user | ⬜ |
| 3.7 | Insert Word Content Control | Buat `sdt` Content Control untuk field Mendeley | ⬜ |
| 3.8 | Insert OOXML Field Code | Sisipkan raw OOXML via `insertOoxml()` untuk Mendeley field | ⬜ |
| 3.9 | Scan dokumen untuk sitasi teks | Baca paragraf Word, temukan pola sitasi (regex) | ⬜ |
| 3.10 | Replace teks sitasi → Field Code | Ganti plain text sitasi dengan Word Field Code Mendeley | ⬜ |

---

### FASE 7: Smart Citation Converter (Fitur Utama)
> **Target:** User bisa konversi sitasi teks manual menjadi sitasi Mendeley yang valid di Word

#### 7.1 — Frontend: UI Smart Citation

| No | Task | Detail | Status |
|----|------|---------|--------|
| 7.1.1 | Tab baru "Smart Citation" | Tambahkan tab di navigasi Task Pane | ⬜ |
| 7.1.2 | Input area teks sitasi | Textarea besar untuk paste sitasi mentah user | ⬜ |
| 7.1.3 | Mode input | Toggle: Satu sitasi / Banyak sitasi sekaligus (batch) | ⬜ |
| 7.1.4 | Tombol "Scan Dokumen" | Pindai seluruh dokumen Word untuk temukan pola sitasi | ⬜ |
| 7.1.5 | Daftar sitasi hasil scan | Tampilkan semua sitasi yang ditemukan di dokumen | ⬜ |
| 7.1.6 | Preview metadata hasil resolve | Tampilkan: Judul, Penulis, Tahun, DOI yang ditemukan | ⬜ |
| 7.1.7 | Konfirmasi sebelum convert | Checklist: user bisa pilih mana yang dikonversi | ⬜ |
| 7.1.8 | Status per sitasi | Badge: Ketemu di Mendeley / CrossRef / Tidak ketemu | ⬜ |
| 7.1.9 | Tombol "Convert Semua" | Konversi semua sitasi terpilih sekaligus | ⬜ |
| 7.1.10 | Log hasil konversi | Tampilkan berapa sitasi berhasil / gagal dikonversi | ⬜ |

#### 7.2 — Backend: Citation Parser Service

| No | Task | Detail | Status |
|----|------|---------|--------|
| 7.2.1 | `citation-parser.service.ts` | Gunakan AI untuk parsing teks sitasi → structured JSON | ⬜ |
| 7.2.2 | Prompt engineering parser | Prompt AI untuk ekstrak: penulis, tahun, judul, jurnal, DOI | ⬜ |
| 7.2.3 | Regex fallback parser | Pattern matching untuk format APA/MLA/Chicago/IEEE | ⬜ |
| 7.2.4 | Batch parsing | Terima array teks sitasi, return array structured data | ⬜ |
| 7.2.5 | `POST /smart-citation/parse` | Endpoint: terima teks → return structured citation data | ⬜ |

#### 7.3 — Backend: Metadata Resolver Service

| No | Task | Detail | Status |
|----|------|---------|--------|
| 7.3.1 | `metadata-resolver.service.ts` | Orkestrasi pencarian metadata multi-sumber | ⬜ |
| 7.3.2 | Resolver: Mendeley Library | Cari di library Mendeley user via API terlebih dahulu | ⬜ |
| 7.3.3 | Resolver: CrossRef API | Cari via DOI atau judul di CrossRef (free, no key needed) | ⬜ |
| 7.3.4 | Resolver: Semantic Scholar | Fallback ke Semantic Scholar API jika CrossRef gagal | ⬜ |
| 7.3.5 | Resolver: AI Extraction | Last resort: AI ekstrak info dari teks sitasi mentah | ⬜ |
| 7.3.6 | Konversi ke CSL JSON | Normalkan semua metadata ke format CSL JSON standar | ⬜ |
| 7.3.7 | `POST /smart-citation/resolve` | Endpoint: terima parsed citation → return CSL JSON + sumber | ⬜ |
| 7.3.8 | Cache hasil resolusi | Cache di SQLite agar tidak re-query untuk DOI yang sama | ⬜ |

#### 7.3b — Backend: Auto-Add ke Mendeley Library (Tanpa Upload Manual)
> **Ini memungkinkan fitur bekerja meski paper belum ada di library Mendeley user**

| No | Task | Detail | Status |
|----|------|---------|--------|
| 7.3b.1 | Cek dokumen di Mendeley lib | `GET /documents?title=...` cek apakah paper sudah ada | ⬜ |
| 7.3b.2 | `POST /documents` ke Mendeley API | Kirim metadata CSL JSON → Mendeley buat entri baru di library | ⬜ |
| 7.3b.3 | Mapping CSL JSON → Mendeley format | Konversi field CSL ke format body request Mendeley API | ⬜ |
| 7.3b.4 | Simpan Mendeley document_id | Cache UUID yang diterima dari Mendeley ke SQLite | ⬜ |
| 7.3b.5 | Handle Skenario A (sudah ada) | Return UUID dari Mendeley lib yang sudah ada | ⬜ |
| 7.3b.6 | Handle Skenario B (belum ada) | Auto POST, return UUID baru dari response Mendeley | ⬜ |
| 7.3b.7 | Handle Skenario C (tidak terindeks) | POST metadata parsial dari AI, flag sebagai `incomplete` | ⬜ |
| 7.3b.8 | Notifikasi ke frontend | Return status: `found_in_mendeley` / `added_to_mendeley` / `partial` | ⬜ |

#### 7.4 — Backend: Mendeley Field Builder

| No | Task | Detail | Status |
|----|------|---------|--------|
| 7.4.1 | `mendeley-field.ts` | Builder untuk generate Word Field Code XML Mendeley | ⬜ |
| 7.4.2 | Generate UUID untuk citation | Buat unique ID per sitasi (format Mendeley) | ⬜ |
| 7.4.3 | Build `ADDIN Mendeley Citation` string | Serialisasi CSL JSON ke dalam format instrText Word | ⬜ |
| 7.4.4 | Build OOXML Content Control | Bungkus field dalam `<w:sdt>` dengan tag Mendeley | ⬜ |
| 7.4.5 | Support inline + footnote citation | Generate field untuk dua mode penempatan | ⬜ |
| 7.4.6 | `POST /smart-citation/build-field` | Endpoint: terima CSL JSON → return OOXML string | ⬜ |
| 7.4.7 | Embed Mendeley document_id di field | Gunakan UUID asli dari Mendeley API agar 100% dikenali | ⬜ |
| 7.4.8 | Embed Mendeley document URI | Sertakan `http://www.mendeley.com/documents/?uuid=...` di field | ⬜ |

#### 7.5 — Integration: Scan & Replace di Word

| No | Task | Detail | Status |
|----|------|---------|--------|
| 7.5.1 | Scan seluruh paragraf dokumen | Baca semua teks via `body.paragraphs` Office.js | ⬜ |
| 7.5.2 | Regex detection pola sitasi | Deteksi (Author, Year), Author et al., dan format lain | ⬜ |
| 7.5.3 | Highlight sitasi yang ditemukan | Tandai teks sitasi di Word dengan warna highlight | ⬜ |
| 7.5.4 | Replace teks → OOXML Field | Hapus teks lama, sisipkan OOXML Mendeley field | ⬜ |
| 7.5.5 | Batch replace seluruh dokumen | Proses semua sitasi dalam satu run tanpa lag | ⬜ |
| 7.5.6 | Rollback / Undo support | Simpan snapshot sebelum konversi, izinkan undo | ⬜ |

---

### FASE 4: Keamanan & Manajemen API Key
> **Target:** API Key tersimpan aman, tidak bocor ke frontend

| No | Task | Detail | Status |
|----|------|---------|--------|
| 4.1 | Enkripsi API Key di DB | AES-256-GCM sebelum simpan ke SQLite | ⬜ |
| 4.2 | API Key tidak di-expose | Backend hanya return `valid`/`invalid`, bukan key asli | ⬜ |
| 4.3 | Session management | JWT dengan expiry, implementasi auto-refresh | ⬜ |
| 4.4 | HTTPS enforcement | Tolak semua koneksi HTTP, arahkan ke HTTPS | ⬜ |
| 4.5 | Rate limiting backend | Batasi request AI endpoint (mis. 20 req/menit per user) | ⬜ |

---

### FASE 8: API Key Pool Manager (Multi-Key + Rotation + Retry)
> **Target:** Sistem dapat mengelola banyak API key per provider, rotate otomatis saat limit habis, dan retry saat high demand

#### 8.1 — Database Schema: Key Pool

| No | Task | Detail | Status |
|----|------|---------|--------|
| 8.1.1 | Tabel `api_key_pools` | Kolom: id, provider, key_name, key_value (encrypted), priority, status, created_at | ⬜ |
| 8.1.2 | Tabel `key_usage_log` | Kolom: key_id, timestamp, success, error_code (429/503/401) | ⬜ |
| 8.1.3 | Tabel `key_cooldown` | Kolom: key_id, cooldown_until (timestamp reset limit) | ⬜ |

#### 8.2 — Frontend: UI Multi-Key Management

| No | Task | Detail | Status |
|----|------|---------|--------|
| 8.2.1 | Komponen `KeyCard` | Card per key: nama, status badge, urutan, tombol test/hapus | ⬜ |
| 8.2.2 | Input nama key (label) | Field "Nama Key" misal: "Key Kampus", "Key Pribadi", "Key Backup" | ⬜ |
| 8.2.3 | Tambah key baru per provider | Tombol "+" expand form tambah key baru | ⬜ |
| 8.2.4 | Drag & Drop urutan prioritas | Atur urutan key sesuai prioritas rotasi | ⬜ |
| 8.2.5 | Badge status real-time | Hijau=Aktif, Kuning=Mendekati limit, Merah=Rate Limited, Abu=Cooldown | ⬜ |
| 8.2.6 | Panel "Key Pool Monitor" | Tabel ringkas: nama key, total request, last error, cooldown timer | ⬜ |
| 8.2.7 | Dropdown strategi rotasi | Round-Robin / Failover / Least-Used | ⬜ |
| 8.2.8 | Setting retry config | Input: max retry count (default 3), retry delay (default 1s) | ⬜ |
| 8.2.9 | Reset cooldown manual | Tombol untuk paksa aktifkan key yang sedang cooldown | ⬜ |
| 8.2.10 | Notifikasi rotasi | Toast: "Key 'Backup' digunakan karena 'Key Utama' rate limited" | ⬜ |

#### 8.3 — Backend: `key-pool.service.ts`

| No | Task | Detail | Status |
|----|------|---------|--------|
| 8.3.1 | Buat `key-pool.service.ts` | Service utama manajemen pool key per provider | ⬜ |
| 8.3.2 | `addKey(provider, name, value)` | Enkripsi key, simpan ke DB dengan priority | ⬜ |
| 8.3.3 | `getActiveKey(provider)` | Return key terbaik berdasarkan strategi yang dipilih | ⬜ |
| 8.3.4 | `markKeyLimited(keyId, retryAfter)` | Set key ke status `rate_limited`, simpan cooldown timer | ⬜ |
| 8.3.5 | `markKeyError(keyId, errorCode)` | Set key ke status `error` jika 401 (invalid) | ⬜ |
| 8.3.6 | `markKeySuccess(keyId)` | Reset error counter, konfirmasi key masih valid | ⬜ |
| 8.3.7 | Auto-expire cooldown | Cek `cooldown_until` sebelum eksklusi key dari pool | ⬜ |
| 8.3.8 | Log usage ke DB | Catat setiap request: key yang dipakai, success/fail, error code | ⬜ |

#### 8.4 — Backend: Strategi Rotasi

| No | Task | Detail | Status |
|----|------|---------|--------|
| 8.4.1 | Strategi **Round-Robin** | Putar key secara bergilir setiap request | ⬜ |
| 8.4.2 | Strategi **Failover** | Pakai key #1 terus, pindah ke #2 hanya jika #1 error/limit | ⬜ |
| 8.4.3 | Strategi **Least-Used** | Selalu pakai key dengan jumlah request terkecil dalam 1 jam | ⬜ |
| 8.4.4 | Skip key yang cooldown | Jangan pakai key yang masih dalam masa cooldown | ⬜ |
| 8.4.5 | Fallback jika semua key limit | Return error khusus: `ALL_KEYS_EXHAUSTED` ke frontend | ⬜ |
| 8.4.6 | `GET /api-keys/pool-status` | Endpoint: return status semua key (tanpa expose value) | ⬜ |

#### 8.5 — Backend: Retry Logic (High Demand)

| No | Task | Detail | Status |
|----|------|---------|--------|
| 8.5.1 | Buat `retry-handler.ts` | Wrapper eksekusi AI request dengan retry logic | ⬜ |
| 8.5.2 | Deteksi error 429 (Rate Limit) | Tangkap HTTP 429 → trigger rotasi ke key berikutnya | ⬜ |
| 8.5.3 | Deteksi error 503 (High Demand) | Tangkap HTTP 503 → retry dengan delay exponential backoff | ⬜ |
| 8.5.4 | Deteksi error 401 (Invalid Key) | Tangkap HTTP 401 → mark key sebagai invalid, skip permanen | ⬜ |
| 8.5.5 | Exponential Backoff | Retry delay: 1s → 2s → 4s → 8s (max 3 retry) | ⬜ |
| 8.5.6 | Jitter pada retry delay | Tambah random jitter (0–500ms) agar tidak thundering herd | ⬜ |
| 8.5.7 | Baca `Retry-After` header | Jika ada header `Retry-After` dari API, pakai nilai tsb | ⬜ |
| 8.5.8 | Auto-rotate key saat 429 | Langsung ganti ke key berikutnya tanpa tunggu retry delay | ⬜ |
| 8.5.9 | Max retry config | Bisa diset dari settings (default 3, max 5) | ⬜ |
| 8.5.10 | Kirim event ke frontend | SSE event `key_rotated` agar UI update badge real-time | ⬜ |

#### 8.6 — Backend: API Endpoints Manajemen Key Pool

| No | Task | Detail | Status |
|----|------|---------|--------|
| 8.6.1 | `GET /settings/key-pool/:provider` | Daftar semua key untuk provider (tanpa expose value) | ⬜ |
| 8.6.2 | `POST /settings/key-pool` | Tambah key baru: `{provider, name, value, priority}` | ⬜ |
| 8.6.3 | `PUT /settings/key-pool/:id` | Update nama / priority / value key | ⬜ |
| 8.6.4 | `DELETE /settings/key-pool/:id` | Hapus key dari pool | ⬜ |
| 8.6.5 | `POST /settings/key-pool/:id/test` | Test key individual, return status + quota info | ⬜ |
| 8.6.6 | `POST /settings/key-pool/:id/reset` | Reset cooldown key secara manual | ⬜ |
| 8.6.7 | `GET /settings/key-pool/monitor` | Dashboard data: semua key + usage stats + last error | ⬜ |
| 8.6.8 | `PUT /settings/key-pool/reorder` | Update priority (urutan rotasi) semua key sekaligus | ⬜ |

---

### FASE 5: Testing
> **Target:** Semua fitur utama terverifikasi sebelum packaging

| No | Task | Detail | Status |
|----|------|---------|--------|
| 5.1 | Unit test AI services | Jest: test semua provider dengan mock API response | ⬜ |
| 5.2 | Unit test citation service | Jest: validasi output APA, MLA, Chicago, IEEE | ⬜ |
| 5.3 | Integration test Mendeley | Test OAuth flow dan document fetch end-to-end | ⬜ |
| 5.4 | E2E test Word integration | Manual: pilih ref → generate → insert ke Word | ⬜ |
| 5.5 | Error scenario testing | API key salah, token expired, AI timeout, no internet | ⬜ |
| 5.6 | Test Smart Citation Skenario A | Paper sudah di Mendeley → field code dengan UUID asli | ⬜ |
| 5.7 | Test Smart Citation Skenario B | Paper belum di Mendeley → auto-add berhasil, UUID valid | ⬜ |
| 5.8 | Test Smart Citation Skenario C | Paper tidak terindeks → partial metadata, flag tampil | ⬜ |
| 5.9 | Test Key Rotation (429) | Simulasi 429 → key otomatis berganti, request berhasil | ⬜ |
| 5.10 | Test Retry Logic (503) | Simulasi 503 → exponential backoff, berhasil setelah retry | ⬜ |
| 5.11 | Test All Keys Exhausted | Semua key limit → error `ALL_KEYS_EXHAUSTED` tampil di UI | ⬜ |
| 5.12 | Test strategi Round-Robin | Verifikasi key berganti bergilir setiap request | ⬜ |
| 5.13 | Test strategi Failover | Verifikasi key #1 dipakai terus sampai error baru pindah | ⬜ |

---

### FASE 6: Packaging & Deployment
> **Target:** Add-in siap didistribusikan ke pengguna lain

| No | Task | Detail | Status |
|----|------|---------|--------|
| 6.1 | Build frontend | Minify CSS + JS, optimasi aset | ⬜ |
| 6.2 | Build backend | Compile TypeScript ke JavaScript di `/dist` | ⬜ |
| 6.3 | Setup PM2 | Jalankan backend sebagai background service | ⬜ |
| 6.4 | Deploy backend (opsional) | Railway / Render / VPS untuk versi cloud | ⬜ |
| 6.5 | Finalisasi `manifest.xml` | URL production, ikon, metadata, permission scope | ⬜ |
| 6.6 | Dokumentasi instalasi | Panduan sideload lokal & publish ke AppSource | ⬜ |

---

## 📊 Timeline Estimasi

| Minggu | Fase | Cakupan |
|--------|------|---------|
| Minggu 1 | Fase 0 + 1.1 | Setup proyek, Design System, UI dasar |
| Minggu 2 | Fase 1.2 + 8.2 | Settings + UI Multi-Key Management |
| Minggu 3 | Fase 1.3–1.5 | UI Mendeley, AI Generate, Sitasi |
| Minggu 4 | Fase 2.1–2.3 | Backend setup, Auth, Mendeley API |
| Minggu 5 | Fase 2.4 + 8.3–8.5 | AI Services + Key Pool + Retry Logic |
| Minggu 6 | Fase 2.5 + 8.6 | Citation Service + API Endpoints Key Pool |
| Minggu 7 | Fase 3 | Office.js Word Integration + Field Code |
| Minggu 8 | Fase 7.1–7.3 | Smart Citation UI + Parser + Resolver |
| Minggu 9 | Fase 7.4–7.5 | Field Builder + Scan & Replace Word |
| Minggu 10 | Fase 4 + 5 | Keamanan + Testing (termasuk rotation test) |
| Minggu 11 | Fase 6 | Packaging & Deployment |

---

## 🔑 API yang Dibutuhkan

| Provider | URL Pendaftaran | Auth | Catatan |
|----------|-----------------|------|---------|
| **Mendeley API** | https://dev.mendeley.com | OAuth 2.0 | Buat app, dapatkan Client ID & Secret |
| **CrossRef API** | https://api.crossref.org | Tidak perlu (free) | Lookup DOI & metadata jurnal |
| **Semantic Scholar** | https://api.semanticscholar.org | API Key opsional | Fallback pencarian paper |
| **OpenAI** | https://platform.openai.com/api-keys | API Key | Berbayar, ada free trial |
| **Google Gemini** | https://aistudio.google.com/app/apikey | API Key | Ada free tier yang cukup besar |
| **Anthropic Claude** | https://console.anthropic.com | API Key | Berbayar, ada free trial |
| **Groq (Llama)** | https://console.groq.com | API Key | Free tier rate limit cukup tinggi |

---

## 📝 Catatan Penting

> [!IMPORTANT]
> Backend WAJIB berjalan di **HTTPS** — Office Add-in memblokir semua HTTP request (mixed content policy).

> [!TIP]
> Untuk dev lokal, gunakan **`office-addin-dev-certs`** — generate SSL sertifikat yang otomatis dipercaya Office.

> [!WARNING]
> **Client Secret Mendeley** dan semua **API Key AI** WAJIB disimpan di backend. Jangan pernah kirimkan ke frontend/Task Pane.

> [!NOTE]
> Fitur **streaming AI** memerlukan **Server-Sent Events (SSE)** di backend dan `EventSource` API di frontend agar output muncul real-time seperti ChatGPT.

> [!CAUTION]
> Struktur Word Field Code Mendeley (`ADDIN Mendeley Citation`) dapat berubah antar versi Mendeley Desktop. Selalu uji dengan versi Mendeley terbaru setelah build.

> [!TIP]
> **CrossRef API** bisa diakses tanpa API key untuk volume rendah. Untuk production, daftarkan email ke `polite pool` CrossRef agar mendapat rate limit lebih tinggi: tambahkan header `User-Agent: AutoBib/1.0 (mailto:email@kamu.com)`.
