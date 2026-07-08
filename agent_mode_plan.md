# Implementation Plan: Agent Mode

## Ikhtisar Fitur
Agent Mode adalah fitur lanjutan yang memungkinkan AI memecah instruksi kompleks menjadi alur kerja multi-langkah yang terstruktur. Alur ini terdiri dari 4 fase:
1. **Prompt Enhancement**: Merapikan instruksi mentah (raw prompt) dari user menjadi instruksi matang yang sangat jelas.
2. **Planning**: Membuat rancangan (plan) eksekusi strategis berdasarkan instruksi matang.
3. **Task Generation**: Mengubah rencana menjadi daftar tugas (tasks) yang terdefinisi dan siap dieksekusi.
4. **Execution**: Mengeksekusi tugas-tugas tersebut menggunakan ekosistem alat (tools) yang ada.

Karena setiap langkah memerlukan *request* tersendiri, *frontend* akan bertindak sebagai orkestrator yang mengirimkan permintaan secara berurutan, sambil memberikan umpan balik visual (*loading/progress*) kepada pengguna.

---

## 1. Perubahan Frontend (UI & UX)
- **Komponen Toggle**: Menambahkan tombol *toggle/switch* "Agent Mode" di area *chat input* atau *header* obrolan. Tombol ini akan beradaptasi dengan *theme* aplikasi yang ada (menggunakan *styling* CSS yang sudah ada seperti di `components.css` atau `main.css`).
- **State Management**: Menyimpan status Agent Mode (`isAgentModeOn`) di memori klien (atau localStorage).
- **Progress UI**: Saat Agent Mode berjalan, menampilkan UI khusus di *chat log* (misal: "⚙️ Step 1: Enhancing prompt...", "⚙️ Step 2: Planning...").
- **Orkestrasi Request**: Modifikasi fungsi `sendMessage` di `chat.js`. Jika `isAgentModeOn` bernilai `true`, ia tidak akan menembak ke `/chat/sessions/:id/message` secara biasa, melainkan menjalankan fungsi orkestrasi `runAgentModePipeline(prompt)`.

## 2. Perubahan Backend (API & Prompts)
Kita perlu membuat *endpoint* baru atau menangani parameter khusus (seperti `phase`) di rute obrolan yang sudah ada. Pendekatan terbaik adalah membuat *router/controller* khusus untuk fase-fase agen ini guna menjaga kebersihan kode.
- **Phase 1 (Prompt Enhancement)**: 
  - **System Prompt**: "You are an expert Prompt Engineer. Rewrite the user's raw input into a highly detailed, structured, and unambiguous prompt suitable for an autonomous Word AI."
- **Phase 2 (Planning)**: 
  - **System Prompt**: "Based on the enhanced prompt, write a logical step-by-step execution plan. Do not execute it yet."
- **Phase 3 (Task Generation)**: 
  - **System Prompt**: "Based on the plan, generate a strictly formatted JSON array of actionable tasks."
- **Phase 4 (Execution)**: 
  - Menggunakan *loop* eksekusi yang sudah ada (dengan `needs_followup` atau *request* berantai dari frontend), AI mengeksekusi tugas satu per satu menggunakan *tool-registry* yang ada.

---

## Daftar Tugas (Tasks)

### Task 1: UI Toggle & Frontend Setup
- [ ] Buat elemen HTML *toggle* "Agent Mode" di `index.html` (di dekat kotak input *chat*).
- [ ] Tambahkan *styling* CSS yang *theme-aware* (mendukung mode terang/gelap).
- [ ] Hubungkan *event listener* di `chat.js` untuk melacak status nyala/mati dari *toggle* tersebut.

### Task 2: Backend Architecture untuk Agen
- [ ] Buat *endpoint* baru di `chat.route.ts` (misal: `POST /chat/agent-phase`).
- [ ] Rancang *system prompt* yang terpisah untuk Fase 1 (Enhancement), Fase 2 (Planning), dan Fase 3 (Task Generation). Fase ini disetel agar AI merespons HANYA dengan JSON terstruktur.
- [ ] Buat skema JSON yang diwajibkan untuk setiap balasan (misal: `{"enhanced_prompt": "..."}`, `{"plan_steps": [...]}`).

### Task 3: Frontend Pipeline Orchestration
- [ ] Buat fungsi asinkron `runAgentModePipeline(userText)` di `chat.js`.
- [ ] Implementasikan alur berurutan:
  - Kirim API Fase 1 -> Tampilkan Hasi (Prompt Matang).
  - Kirim API Fase 2 -> Tampilkan Hasil (Plan).
  - Kirim API Fase 3 -> Tampilkan Hasil (Daftar Task).
- [ ] Buat elemen UI pesan *loading* yang dinamis untuk menunjukkan transisi antar fase.

### Task 4: Eksekusi Tugas (Execution Phase)
- [ ] Buat fungsi pengeksekusi `executeAgentTasks(tasks)` di frontend.
- [ ] Implementasikan pengiriman satu tugas (*task*) pada satu waktu ke *endpoint* eksekusi standar (`/chat/sessions/:id/message`).
- [ ] Pantau status keberhasilan, lalu lanjut ke tugas berikutnya di dalam daftar.
- [ ] **UI Task Update**: Setiap kali sebuah task selesai dieksekusi, perbarui UI pada chat log untuk mengubah status task tersebut menjadi selesai (misal: memberikan tanda centang `[x]` atau ikon *check* di sebelah daftar task).
- [ ] Pastikan bahwa alat (tools) seperti `replace`, `insert`, dan `table_edit` dapat berjalan normal dipandu oleh status penyelesaian agen.

### Task 5: Error Handling & Self-Healing (Otonom)
- [ ] Jika eksekusi suatu *task* gagal (misal: elemen tidak ditemukan atau *syntax error*), jangan langsung menghentikan agen.
- [ ] Tangkap pesan *error* tersebut dan kirimkan kembali ke AI dengan instruksi untuk melakukan perbaikan otomatis (*Self-Healing*).
- [ ] Beri AI kemampuan/akses ke tool `view_code` secara otonom saat fase ini agar ia bisa menganalisis masalah pada dokumen/kode dan merekomendasikan perbaikan sebelum melanjutkan *task* berikutnya.
