const str = '{"stream_to_word": "nama: \\"Arjuna\\"."}';
const safeStr = str.replace(/"(?:\\.|[^"\\])*"/g, (m) => { 
  console.log('Matched:', m); 
  return m; 
});
console.log('Result:', safeStr === str);
