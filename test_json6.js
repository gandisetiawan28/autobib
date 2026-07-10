const json = `{
  "thought": "User meminta cerpen 10 paragraf. Saya akan membuat cerita fiksi pendek dalam bahasa Indonesia dengan 10 paragraf yang jelas. Saya akan mengirimkan teks tersebut melalui stream_to_word agar langsung ditulis ke dokumen Word. Karena ini adalah teks baru, tidak perlu menggunakan tool lain.",
  "message": "Berikut adalah cerpen 10 paragraf yang Anda minta:\n\n",
  "title": "Cerpen 10 Paragraf",
  "tool": "none",
  "operations": [],
  "stream_to_word": "**Malam di Perpustakaan Lama**\n\nDi sebuah kota kecil yang jarang dilalui angin, berdiri sebuah perpustakaan tua dengan dinding bata yang ditumbuhi lumut. Namanya Perpustakaan Purnama, dan hanya beberapa orang yang masih ingat bahwa di dalamnya tersimpan lebih dari sekadar buku-buku usang. Bagi Raka, seorang mahasiswa yang sedang mencari topik skripsi, tempat itu adalah misteri yang ingin dipecahkan.\n\nRaka datang setiap Jumat malam, saat lampu-lampu kota mulai meredup dan suasana menjadi hening. Ia selalu duduk di sudut paling belakang, dekat jendela dengan kaca buram, di mana debu-debu menari dalam cahaya remang. Pada malam itu, hujan turun dengan deras, membuat suara rintiknya menjadi melodi pengantar bagi petualangan yang tak terduga.\n\nSaat jari-jarinya menyusuri deretan buku tua, sebuah jilid tanpa judul jatuh dari rak atas. Sampulnya berwarna biru tua dengan ukiran emas yang hampir pudar. Raka membukanya dengan hati-hati, dan alih-alih tulisan, ia melihat lembaran-lembaran kosong—kecuali satu kalimat di halaman pertama: \"Tulislah yang kau rindukan, dan pintu akan terbuka.\"\n\nDengan rasa penasaran yang membara, Raka mengambil pulpen dari sakunya dan menuliskan nama neneknya yang telah tiada. Begitu titik terakhir ia buat, seluruh ruangan bergetar pelan. Buku-buku di sekelilingnya terbuka dengan sendirinya, dan dari antara halaman-halamannya muncul cahaya keemasan yang membentuk wajah lembut neneknya.\n\n\"Cucuku,\" suara itu menggema seperti bisikan angin. \"Kau telah menemukan buku kenangan. Di sinilah semua cerita yang pernah hilang bersemayam.\" Raka terpaku, matanya berkaca-kaca. Ia menanyakan banyak hal yang selama ini terpendam, dan neneknya menjawab dengan senyum yang menyejukkan.\n\nSetelah percakapan panjang yang terasa seperti sekejap, cahaya itu perlahan memudar. Namun, neneknya berpesan, \"Gunakan buku ini untuk menulis kisah-kisah yang terlupakan, agar dunia tidak kehilangan warisannya.\" Raka mengangguk, dan saat hujan reda, ia sadar bahwa malam itu telah mengubah segalanya.\n\nSejak saat itu, Raka tidak lagi datang untuk mencari topik skripsi. Ia datang untuk menulis. Setiap Jumat malam, ia menuliskan cerita-cerita dari orang-orang yang ditemuinya, dari pengamen di jembatan hingga penjaga warung kopi. Buku itu menjadi jembatan antara masa lalu dan masa kini.\n\nTeman-temannya heran melihat perubahan pada Raka. Ia lebih bersemangat, lebih peka, dan tulisannya mengalir seperti sungai yang jernih. Skripsinya tentang folklor lokal menjadi karya yang paling diapresiasi, dan banyak yang bertanya apa rahasianya. Raka hanya tersenyum dan menunjuk ke arah perpustakaan tua di ujung kota.\n\nKini, setiap orang yang berkunjung ke Perpustakaan Purnama dapat merasakan keajaiban yang sama. Buku biru tua itu masih tersimpan di sudut rahasia, menunggu tangan-tangan yang rindu untuk menuliskan kenangan. Raka percaya bahwa cerita tidak pernah mati—ia hanya tidur di antara lembaran, menunggu waktu untuk bangkit kembali.\n\nMalam itu, hujan kembali turun, dan Raka tersenyum saat mendengar rintiknya. Ia tahu, di dalam buku itu, ada ribuan cerita yang belum terungkap, dan ia adalah salah satu penjaganya. Perjalanan barunya baru saja dimulai, dan ia berjanji akan terus menulis, sampai setiap kenangan menemukan tempatnya di dunia ini."
}`;

let jsonToParse = json.replace(/\\(?!["\\/bfnrtu])/g, "\\\\");

const tryParse = (str) => {
    try { 
       let safeStr = str.replace(/"(?:\\.|[^"\\])*"|\s+/g, (match) => {
           if (match.startsWith('"')) {
               return match.replace(/\n/g, "\\n").replace(/\r/g, "");
           } else {
               return " ";
           }
       });
       safeStr = safeStr.replace(/\\+$/, '');
       return JSON.parse(safeStr); 
    } catch (e) { return e.message; }
};

console.log(tryParse(jsonToParse));
