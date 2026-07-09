const fs = require('fs');
const json = fs.readFileSync('test_input.json', 'utf8');

let str = json.replace(/\\(?!["\\/bfnrtu])/g, "\\\\");
let safeStr = str.replace(/"(?:\\.|[^"\\])*"/g, (m) => m.replace(/\n/g, "\\n").replace(/\r/g, ""));

try {
  JSON.parse(safeStr);
  console.log("SUCCESS!");
} catch (e) {
  console.error("FAIL:", e.message);
}
