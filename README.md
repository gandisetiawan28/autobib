# 📚 AutoBib - Asisten Penulisan & Sitasi Cerdas untuk Microsoft Word

[![Tonton Video Tutorial Lengkap di YouTube](https://img.shields.io/badge/YouTube-Tonton_Tutorial-red?style=for-the-badge&logo=youtube)](https://youtube.com/your-tutorial-link-here)

**AutoBib** adalah sebuah *Add-in* (aplikasi tambahan) super cerdas untuk Microsoft Word yang dirancang khusus untuk mempermudah Anda dalam menulis karya ilmiah, skripsi, tesis, maupun jurnal. Dengan kekuatan AI (Artificial Intelligence) dan sinkronisasi langsung ke **Mendeley**, AutoBib akan membantu Anda merapikan kutipan, mencari referensi, dan berdiskusi seputar dokumen Anda—tanpa perlu berpindah aplikasi!

---

## 🌟 Fitur Unggulan

AutoBib memiliki berbagai fitur canggih yang bekerja di belakang layar namun sangat mudah digunakan:

1. **🤖 Asisten AI Terintegrasi (Chat UI)**
   Berdiskusi langsung dengan AI di dalam Microsoft Word. AI bisa membantu merangkum paragraf, memperbaiki tata bahasa, atau mencarikan referensi yang sesuai dengan konteks tulisan Anda.
2. **🔗 Sinkronisasi Langsung ke Mendeley**
   Tidak perlu buka tutup aplikasi Mendeley. AutoBib menarik data pustaka dari akun Mendeley Anda secara otomatis dan memasukkannya ke dalam Word dengan format yang benar.
3. **🪄 Smart Citation (Kutipan Pintar)**
   AI akan membaca kalimat Anda dan merekomendasikan kutipan yang paling relevan dari pustaka Mendeley Anda. Sekali klik, kutipan otomatis masuk ke dokumen.
4. **🔄 Pembaruan Otomatis (Auto-Update)**
   Sistem AutoBib selalu terbarui! Ketika ada fitur baru, aplikasi akan mengunduh dan memperbarui dirinya sendiri secara otomatis di latar belakang.
5. **🎛️ Control Panel Sederhana**
   Aplikasi hadir dengan antarmuka (UI) Control Panel yang elegan untuk mengatur koneksi Mendeley dan menjalankan server mesin (*engine*) dengan satu kali klik.

---

## 📋 Tabel Ringkasan Fitur

| Kategori | Nama Fitur | Kegunaan Utama |
| :--- | :--- | :--- |
| **Sitasi & Referensi** | *Mendeley Sync* | Menarik dan mengelola daftar pustaka langsung dari cloud Mendeley. |
| **Sitasi & Referensi** | *Smart Cite* | AI menganalisis kalimat dan memasukkan kutipan otomatis (misal: format APA, IEEE). |
| **AI & Asisten** | *Multi-Provider AI* | Mendukung berbagai "otak" AI (OpenAI, Gemini, Anthropic) untuk hasil terbaik. |
| **AI & Asisten** | *Context Aware Chat* | AI membaca paragraf yang sedang Anda tulis dan memberikan masukan relevan. |
| **Sistem & Perawatan** | *Auto-Updater* | Memperbarui versi aplikasi secara otomatis tanpa repot instal ulang. |
| **Sistem & Perawatan** | *One-Click Setup* | Menginstal Add-in ke Microsoft Word secara otomatis. |

---

## 🚀 Panduan Instalasi & Persiapan (Untuk Pengguna Awam)

Ikuti langkah-langkah mudah ini untuk mulai menggunakan AutoBib:

### Langkah 1: Instalasi Aplikasi
1. Unduh file **`AutoBib-Server-Setup.exe`** dari halaman rilis.
2. Klik dua kali (*double-click*) file tersebut untuk menginstal. Aplikasi akan terinstal dan terbuka otomatis.

### Langkah 2: Mengatur Koneksi Mendeley
Agar AutoBib bisa mengambil data pustaka Anda, ia membutuhkan "kunci rahasia" dari akun Mendeley Anda.
1. Buka situs [Mendeley Developer Portal](https://dev.mendeley.com).
2. Login menggunakan akun Mendeley Anda, lalu buat aplikasi baru.
3. **SANGAT PENTING**: Pada bagian **Redirect URL**, masukkan teks ini *persis* tanpa spasi tambahan:
   `http://localhost:3001/auth/mendeley/callback`
4. Setelah aplikasi dibuat, Anda akan mendapatkan **Client ID** (angka) dan **Client Secret** (huruf acak).
5. Buka **AutoBib Control Panel** yang baru saja Anda instal.
6. Masukkan **Client ID** dan **Client Secret** tersebut ke kolom yang disediakan, lalu klik **Save Settings**.

### Langkah 3: Menjalankan Mesin & Menyambungkan ke Word
1. Di AutoBib Control Panel, klik tombol **"Install & Setup Dependencies"**. (Tunggu hingga muncul notifikasi sukses).
2. Setelah itu, klik **"Start Engine"**.
3. Buka **Microsoft Word** Anda.
4. Pergi ke tab **Insert** > **Get Add-ins** > pilih tab **Shared Folder**, lalu klik **AutoBib**. (Atau bisa juga melalui tab **Developer** di Word).
5. Layar asisten AutoBib akan muncul di samping kanan Word. Anda siap menulis!

> 💡 **Tips:** Setiap kali Anda selesai mengubah *settings* di Control Panel, sistem akan otomatis merestart dirinya sendiri agar perubahan langsung aktif!

---

## 📖 Cara Menggunakan AutoBib di Microsoft Word

1. **Memulai Percakapan:** Ketik pertanyaan di kolom chat sebelah kanan (Misal: *"Tolong perbaiki tata bahasa paragraf pertama"*).
2. **Memasukkan Kutipan Mendeley:** Klik tombol "Login Mendeley" di dalam panel chat Word. Setelah berhasil masuk, Anda bisa meminta AI: *"Tolong beri kutipan untuk kalimat ini"*, dan AI akan memunculkan kotak referensi dari perpustakaan Mendeley Anda.
3. **Menyisipkan Tabel/Teks:** Jika AI memberikan tabel data atau teks revisi, Anda akan melihat tombol **"Insert into Word"** di bawah pesan AI. Klik tombol tersebut untuk memasukkannya ke dokumen secara ajaib!

---

## 🆘 Bantuan & Kontak

Jika Anda mengalami masalah (misal: error *"Client authentication failed"* saat login Mendeley), pastikan:
- **Client Secret** yang Anda masukkan di Control Panel sudah benar dan tidak ada spasi tersembunyi.
- **Redirect URL** di portal Mendeley sudah diatur dengan port `3001`.

Butuh bantuan langsung? Jangan ragu untuk menghubungi tim teknis kami melalui tombol di pojok kanan bawah pada layar Control Panel Anda:
- 🟢 **WhatsApp Support**
- 📸 **Instagram Official**
- ✈️ **Telegram Community**

---
*Dibuat dengan ❤️ untuk mempermudah penelitian Anda.*
