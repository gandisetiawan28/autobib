const fs = require('fs');
const str = fs.readFileSync('test_json6.js', 'utf8').match(/const json = `([\s\S]*?)`;/)[1];

let safeStr = str.replace(/"(?:\\.|[^"\\])*"|\s+/g, (match) => {
    if (match.startsWith('"')) return match.replace(/\n/g, "\\n").replace(/\r/g, "");
    else return " ";
});
safeStr = safeStr.replace(/\\+$/, '');
console.log(safeStr.substring(1450, 1550));
