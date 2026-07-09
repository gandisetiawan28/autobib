const str = `{"thought": "User meminta 1 cerpen baru, bukan kelanjutan dari cerita sebelumnya. Saya akan menuliskan sebuah cerpen pendek yang berdiri sendiri dengan judul baru. Karena ini teks baru yang belum ada di dokumen, saya gunakan stream_to_word untuk menuliskan seluruh cerpen. Tidak perlu menggunakan tool lain. Saya akan membuat cerpen sekitar 5-7 paragraf agar tidak terlalu panjang.","message": "Berikut adalah 1 cerpen baru untuk Anda. Saya tuliskan langsung ke dokumen:\\n\\n","title": "Cerpen Baru","tool": "none","operations": [],"stream_to_word": "**Mawar di Tepi Rel**\\n\\nDi sebuah stasiun kereta api tua yang hampir tidak terpakai, hiduplah seorang penjual bunga tua bernama Mbah Joyo. Setiap pagi, ia duduk di bangku kayu dekat rel, menjajakan mawar merah yang ia tanam sendiri di kebun belakang rumahnya. Kereta-kereta jarang lewat, tetapi Mbah Joyo tetap setia, karena baginya, setiap kereta membawa cerita dan harapan.\\n\\nSuatu hari, seorang gadis muda bernama Sari turun dari kereta yang hanya berhenti sebentar. Ia terlihat lelah dan bingung, seperti orang yang sedang melarikan diri dari sesuatu. Mbah Joyo menawarinya sekuntum mawar tanpa meminta uang. \\"Bunga ini untuk mengingatkanmu bahwa hidup masih indah,\\" katanya dengan senyum yang hangat.\\n\\nSari menerima mawar itu dan duduk di samping Mbah Joyo. Ia bercerita bahwa ia baru saja putus cinta dan meninggalkan kota besar karena tak tahan dengan kenangan. Mbah Joyo mendengarkan dengan sabar, lalu menunjuk ke rel kereta. \\"Lihatlah rel ini, Nak. Ia lurus tapi kadang berkelok. Begitu pula hidup. Yang penting, kita tetap berjalan.\\"\\n\\nSari terenyuh. Ia menatap mawar di tangannya yang masih segar, meski panas matahari mulai menyengat. Sejak hari itu, ia sering datang ke stasiun tua itu, membantu Mbah Joyo merawat kebun mawar. Perlahan, lukanya sembuh, dan ia menemukan ketenangan dalam kesederhanaan.\\n\\nSetahun kemudian, Sari menjadi penjual bunga di stasiun yang sama, menggantikan Mbah Joyo yang sudah tua dan sulit berjalan. Kereta-kereta mulai ramai lagi, dan setiap penumpang yang lewat mendapat sekuntum mawar dan senyuman. Sari belajar bahwa memberi kebahagiaan adalah cara terbaik untuk melupakan kesedihan.\\n\\nSuatu sore, seorang lelaki turun dari kereta dan menatap Sari dengan mata penuh haru. Lelaki itu adalah kekasih lamanya, yang datang untuk meminta maaf. Sari tersenyum dan memberinya mawar, bukan dengan dendam, tetapi dengan ikhlas. Ia berkata, \\"Rel kehidupan kita pernah berpisah, tetapi sekarang bertemu lagi. Mari kita jalani bersama.\\"\\n\\nMereka berpelukan di tepi rel, sementara bunga-bunga mawar di kebun Mbah Joyo mekar lebih indah dari sebelumnya. Stasiun tua itu pun menjadi saksi bisu bahwa cinta sejati tidak pernah benar-benar pergi; ia hanya menunggu waktu untuk mekar kembali."}`;

let jsonToParse = str;
// The chat.js clean step
jsonToParse = jsonToParse.replace(/\\(?!["\\/bfnrtu])/g, "\\\\");

const tryParse = (s) => {
    try { 
       let safeStr = s.replace(/"(?:\\.|[^"\\])*"|\s+/g, (match) => {
           if (match.startsWith('"')) {
               return match.replace(/[\u0000-\u001F]/g, (c) => {
                   if (c === '\n') return '\\n';
                   if (c === '\r') return '';
                   if (c === '\t') return '\\t';
                   return '\\u' + ('0000' + c.charCodeAt(0).toString(16)).slice(-4);
               });
           } else {
               return " ";
           }
       });
       safeStr = safeStr.replace(/\\+$/, '');
       return JSON.parse(safeStr); 
    } catch (e) { return null; }
};

let parsed = tryParse(jsonToParse) 
    || tryParse(jsonToParse + '}')
    || tryParse(jsonToParse + ']}') 
    || tryParse(jsonToParse + '}]}') 
    || tryParse(jsonToParse + '"}]}')
    || tryParse(jsonToParse + '"}')
    || tryParse(jsonToParse + '"}');

console.log(parsed ? "SUCCESS" : "FAIL");
