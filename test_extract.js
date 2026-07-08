const fullStr = `{"thought": "User meminta 10 cerpen untuk ketiga kalinya. Saya akan memberikan 10 cerpen baru dengan tema yang fresh, tetap singkat (3-4 paragraf) dan berbeda dari dua batch sebelumnya. Saya akan mengirimkan semua teks melalui stream_to_word tanpa menggunakan tool lain.", "message": "Berikut adalah 10 cerpen ketiga yang berbeda dari sebelumnya. Saya tuliskan langsung ke dokumen Anda:\\n\\n", "title": "10 Cerpen Ketiga", "tool": "none", "operations": [], "stream_to_word": "**Cerpen 1: Kunci Berbisik**\\n\\nSeorang tukang kunci tua memiliki gantungan kunci yang bisa berbicara. Setiap kunci memiliki cerita tentang pintu yang ia buka. Suatu hari, seorang gadis datang ingin membuka peti mati neneknya. Kunci itu berbisik bahwa peti itu berisi surat-surat cinta yang belum sempat dibaca. Gadis itu pun menemukan sejarah keluarganya dan belajar bahwa cinta tak pernah mati.\\n\\n**Cerpen 2: Sapu Terbang**\\n\\nSapu tua di gudang sekolah ternyata bisa terbang, tetapi hanya pada saat gerhana bulan. Seorang petugas kebersihan bernama Pak Udin mencobanya dan melayang ke langit. Dari atas, ia melihat semua sampah yang berserakan di kota. Ia pun tergerak untuk mengajak warga membersihkan lingkungan. Gerhana berlalu, tetapi semangat kebersihan tetap menyala.\\n\\n**Cerpen 3: Botol Pesan**\\n\\nDi pantai, seorang anak menemukan botol berisi pesan dari 50 tahun lalu. Pengirimnya adalah kakeknya sendiri yang masih muda saat itu. Pesan itu berisi janji untuk menikahi neneknya. Anak itu menyampaikan pesan itu kepada neneknya yang sudah tua, dan mereka menangis haru. Kenangan itu mengingatkan mereka bahwa janji sejati selalu bertahan.\\n\\n**Cerpen 4: Meja Goyang**\\n\\nSebuah meja kayu di kantor desa selalu goyang jika ada yang berbohong. Para pejabat pun takut duduk di dekatnya. Suatu hari, seorang pemuda jujur duduk di sana dan meja itu diam. Ia pun diangkat menjadi kepala desa karena dianggap paling tulus. Meja itu menjadi simbol kejujuran bagi seluruh warga.\\n\\n**Cerpen 5: Gitar Senja**\\n\\nGitar tua yang tergantung di kafe pinggir jalan hanya bisa mengeluarkan melodi indah saat matahari terbenam. Seorang pemusik jalanan mencobanya dan menghasilkan lagu yang menyentuh hati semua pengunjung. Ia menjadi terkenal, tetapi ia tetap kembali ke kafe itu setiap senja, karena di sanalah magis itu terjadi.\\n\\n**Cerpen 6: Cangkir Kenangan**\\n\\nDi rak pecah belah, ada cangkir yang jika diisi teh panas, akan memperlihatkan bayangan orang-orang yang pernah minum darinya. Seorang perempuan pembeli melihat bayangan almarhum suaminya. Ia tersenyum dan menyesap tehnya, merasakan kehangatan yang tak lekang oleh waktu. Cangkir itu mengajarkannya bahwa cinta abadi tidak membutuhkan fisik.\\n\\n**Cerpen 7: Pensil Jalanan**\\n\\nSeorang seniman jalanan menemukan pensil yang bisa menggambar benda menjadi nyata selama 24 jam. Ia menggambar roti untuk yang lapar, pakaian untuk yang telanjang. Namun setelah 24 jam, benda itu menghilang. Ia sadar bahwa memberi yang sementara lebih baik daripada tidak memberi sama sekali. Ia terus menggambar setiap hari, menjadi pahlawan tanpa tanda jasa.\\n\\n**Cerpen 8: Jam Dinding**\\n\\nJam dinding di ruang tamu sebuah keluarga selalu berdetak mundur saat terjadi pertengkaran. Suatu hari, kedua orang tua bertengkar hebat, dan jam itu berdetak sangat cepat hingga waktu terasa berbalik. Mereka melihat masa lalu yang indah dan akhirnya berdamai. Jam itu mengingatkan mereka bahwa waktu adalah hadiah, dan setiap detik berharga.\\n\\n**Cerpen 9: Karpet Awan**\\n\\nKarpet bulu di kamar seorang gadis kecil bisa berubah menjadi awan dan membawanya terbang. Ia sering berkeliling dunia dalam tidurnya. Suatu malam, ia terbang ke desa terpencil dan melihat anak-anak di sana tidak punya sekolah. Ia terinspirasi untuk menggalang dana. Karpet itu tidak lagi diperlukan, karena impiannya sudah menjadi nyata.\\n\\n**Cerpen 10: Lampion Harapan**\\n\\nDi pasar malam, ada lampion yang jika dinyalakan, asapnya membentuk tulisan doa. Seorang pemuda yang patah hati menyalakan lampion dan asapnya membentuk kata \\"Lepaskan\\". Ia pun melepas rasa sakit dan memulai hidup baru. Lampion itu mengajarkan bahwa harapan adalah tentang melepas, bukan berpegang pada beban."}`;

const extractStreamingString = (fullStr, key) => {
    const keyIndex = fullStr.lastIndexOf(`"${key}"`);
    if (keyIndex === -1) return '';
    const colonIndex = fullStr.indexOf(':', keyIndex);
    if (colonIndex === -1) return '';
    const quoteIndex = fullStr.indexOf('"', colonIndex);
    if (quoteIndex === -1) return '';
    
    let extracted = '';
    let isEscaped = false;
    for (let i = quoteIndex + 1; i < fullStr.length; i++) {
        const char = fullStr[i];
        if (isEscaped) {
            extracted += '\\' + char;
            isEscaped = false;
        } else if (char === '\\') {
            isEscaped = true;
        } else if (char === '"') {
            break;
        } else {
            extracted += char;
        }
    }
    return extracted.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
};

console.log(extractStreamingString(fullStr, 'stream_to_word').length);
