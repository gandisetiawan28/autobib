const fs = require('fs');
let fullResponse = fs.readFileSync('test_input.json', 'utf8');
let cleanResp = fullResponse.trim();
const jsonMatch = cleanResp.match(/\{[\s\S]*\}/);
let jsonToParse = jsonMatch ? jsonMatch[0] : cleanResp;
jsonToParse = jsonToParse.replace(/\\(?!["\\/bfnrtu])/g, "\\\\");

const tryParse = (str) => {
    try { 
       let safeStr = str.replace(/"(?:\\.|[^"\\])*"/g, (m) => m.replace(/\n/g, "\\n").replace(/\r/g, ""));
       return JSON.parse(safeStr); 
    } catch (e) { return e.message; }
};
console.log(tryParse(jsonToParse));
