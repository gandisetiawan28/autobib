const str = '{"stream_to_word": "Rina adalah\n\nSuatu sore"}'; // Appended quote!
const safeStr = str.replace(/"(?:\\.|[^"\\])*"/g, (m) => m.replace(/\n/g, "\\n").replace(/\r/g, ""));
console.log('safeStr contains literal newline?', safeStr.includes('\n'));
