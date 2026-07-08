"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultRegistry = exports.ToolRegistry = void 0;
class ToolRegistry {
    constructor() {
        this.tools = new Map();
    }
    registerTool(tool) {
        this.tools.set(tool.name, tool);
    }
    getToolsInstruction() {
        if (this.tools.size === 0)
            return '';
        let instruction = `CRITICAL INSTRUCTION: You have several tools you can use by specifying the "tool" field (must be one of: replace, comment, highlight, insert, table, table_edit, format, delete, multi, view_code) and filling the "operations" array.
WARNING: For 'find', 'before', and 'after' fields, you MUST copy EXACT verbatim text from the document. The system uses exact string matching. DO NOT use descriptive locations like "Halaman Judul". DO NOT copy Headings, Titles, or Table Captions, because Word might accidentally find them in the Table of Contents first! Always copy a unique sentence from the BODY paragraphs. IF YOU ABSOLUTELY MUST USE A HEADING AS AN ANCHOR, YOU MUST USE THE "target_style" PROPERTY (e.g. "target_style": "Heading 2;SUB-BAB 1") TO AVOID THE TABLE OF CONTENTS!
CRITICAL: The document text provided to you contains annotations like '[STYLE: Heading 1]'. These annotations are just for your information. DO NOT include the '[STYLE: ...]' tags in your 'find', 'before', or 'after' operations! Only copy the real text.
EXTREME ACCURACY REQUIRED: You MUST COPY AND PASTE the text exactly as it appears in the document. Do not guess, do not paraphrase, and DO NOT add hallucinated characters like backslashes (\\) or extra spaces. If the text has a typo, you must copy the typo exactly in the 'find' field.
NEW CAPABILITY: You CAN now select text that spans across multiple paragraphs or bullet points! Our engine uses a "Bookend Search" (checking the first 40 and last 40 characters). If you want to replace a huge multi-paragraph block, just make sure the beginning and the end of your 'find' text are 100% exact.
NEW FEATURE: 
- To apply to the ENTIRE PARAGRAPH, add '"target_type": "paragraph"' and put the first 5-10 words in "find".
- CRITICAL NEW LINE RULE: If you are inserting a NEW paragraph (not just adding a word inside a sentence), you ABSOLUTELY MUST add '"new_line": true' to your operation (e.g. {"action": "insert", "new_line": true}) OR use '"target_type": "paragraph"'. If you don't, your text will merge inline and destroy the document's formatting!
- To apply to an ENTIRE SENTENCE, omit target_type and put the FULL SENTENCE (up to 30 words) in "find".
- To apply to specific words, put only those words in "find".
- OPTIONAL: If the word you are searching for appears multiple times and you want to target a specific one (e.g. the 2nd occurrence), you can add '"match_index": 2'.
- NEW TARGETING FEATURE: You can now force the search engine to ONLY match text that has a specific Word Style! This is incredibly useful for skipping the Table of Contents or finding specific Headings. Just add '"target_style": "Exact Style Name From Context"' to your operation. Example: {"find": "Latar Belakang", "target_style": "Heading 2;SUB-BAB 1"}.
- STYLE APPLICATION: When you create NEW text (like a new Chapter, Sub-Chapter, or normal paragraph) using tools, YOU MUST ASSIGN THE CORRECT STYLE from the [AVAILABLE STYLES] list by setting the "style" property. Deduce which style to use (e.g., Chapter vs Paragraph) by looking at how the styles are used in the document structure.
- DELETING PARAGRAPHS / BLANK LINES: If you want to delete a line, a sentence, or a whole block of text WITHOUT leaving behind an empty blank space/newline, you ABSOLUTELY MUST add "target_type": "paragraph" to your delete operation!
- CRITICAL SCIENTIFIC WRITING RULE: In Indonesian academic writing, all foreign/English words and species names (e.g., machine learning, Pseudomonas aeruginosa) MUST be italicized. You MUST use markdown *italic* directly inside your 'replace' or 'insert' strings for EVERY foreign word! Example: "menggunakan algoritme *machine learning*."
- PARAGRAPH FORMATTING: Never write a massive block of text. Split long text into logical paragraphs. Use exactly ONE newline (\n) or TWO (\n\n) to separate paragraphs. Our system will automatically format them into proper scientific paragraphs in Word.
`;
        let index = 1;
        for (const [name, tool] of this.tools) {
            instruction += `\n${index}. **${name}**: ${tool.description}\n`;
            tool.examples.forEach(ex => {
                instruction += `   ${ex}\n`;
            });
            index++;
        }
        instruction += `\nIf you are generating brand NEW text (like rewriting a paragraph or adding a new section), DO NOT use the \`replace\` tool! Just output the text directly in the "stream_to_word" field. DO NOT use markdown like **bold** or *italic* in the "stream_to_word" field yet (use the insert tool if you need markdown).`;
        return instruction;
    }
}
exports.ToolRegistry = ToolRegistry;
exports.defaultRegistry = new ToolRegistry();
exports.defaultRegistry.registerTool({
    name: 'replace',
    description: 'ONLY FOR TYPOS OR MINOR WORD CHANGES (1-5 words). DO NOT rewrite whole paragraphs. CRITICAL: NEVER use this tool to edit or delete rows/columns inside a TABLE! To modify a table, you must generate a brand new table using the "table" tool.',
    examples: [
        'operations: [ {"find": "exact wrong word in text", "replace": "correct word"} ]',
        'CRITICAL CONTEXT RULE: When fixing grammar or typos, you MUST preserve the original semantic meaning and context.',
        'To replace ALL occurrences of the same typo in the document: operations: [ {"find": "typo", "replace": "correct", "replace_all": true} ]',
        'To rewrite a whole paragraph: operations: [ {"find": "first 5-10 words of the paragraph", "replace": "teks baru dengan kata asing seperti *machine learning* dicetak miring!", "target_type": "paragraph"} ]',
        'To apply a specific Word style (e.g. from [AVAILABLE STYLES]), add the "style" property: operations: [ {"find": "...", "replace": "...", "style": "Heading 2,SUB-BAB 1"} ]'
    ]
});
exports.defaultRegistry.registerTool({
    name: 'comment',
    description: 'Reviews, critiques, gives feedback.',
    examples: [
        'operations: [ {"find": "Copy the ENTIRE sentence here exactly as it appears", "comment": "Consider rewriting this."} ]',
        'To comment on a whole paragraph: operations: [ {"find": "first 5-10 words of the paragraph", "comment": "This paragraph is weak.", "target_type": "paragraph"} ]'
    ]
});
exports.defaultRegistry.registerTool({
    name: 'highlight',
    description: 'Marks important parts or errors.',
    examples: [
        'operations: [ {"find": "Copy the ENTIRE sentence to highlight here", "color": "Yellow"} ]',
        'To highlight a whole paragraph: operations: [ {"find": "first 5-10 words", "color": "Yellow", "target_type": "paragraph"} ]'
    ]
});
exports.defaultRegistry.registerTool({
    name: 'insert',
    description: 'Places new text before/after targets, or at the start/end of the document.',
    examples: [
        'operations: [ {"after": "exact 5-10 words of the target sentence", "insert": "Teks sisipan inline."} ]',
        'CRITICAL: To insert a BRAND NEW PARAGRAPH after a heading, you MUST use target_type! operations: [ {"after": "Latar Belakang", "target_type": "paragraph", "insert": "Paragraf baru...", "style": "Normal1"} ]',
        'If you are not using target_type but still want to FORCE the insertion onto a NEW LINE, add "new_line": true: operations: [ {"after": "...", "insert": "...", "new_line": true} ]',
        'To apply a specific Word style (e.g. from [AVAILABLE STYLES]), add the "style" property: operations: [ {"after": "...", "insert": "...", "style": "Heading 2;SUB-BAB 1"} ]',
        'To insert at the very beginning of the document: operations: [ {"location": "start", "insert": "Teks sisipan."} ]',
        'To insert at the very end of the document: operations: [ {"location": "end", "insert": "Teks sisipan."} ]'
    ]
});
exports.defaultRegistry.registerTool({
    name: 'table',
    description: 'Creates or replaces tables. By default, it places the table at the very end of the document unless you specify a target location.',
    examples: [
        'To place a table after a specific sentence: operations: [ { "after": "exact 5-10 words...", "headers": ["Col1", "Col2"], "data": [ ["Val1", "Val2"] ] } ]',
        'To apply a specific table style, add the "style" property. To apply a paragraph style to texts inside cells, add the "cell_style" property: operations: [ { "after": "...", "style": "Grid Table 1 Light", "cell_style": "TABLE", "headers": [...], "data": [...] } ]',
        'To replace the current user selection: operations: [ { "action": "replace_selection", "headers": ["Col1"], "data": [["Val1"]] } ]'
    ]
});
exports.defaultRegistry.registerTool({
    name: 'table_edit',
    description: 'Modifies an existing table in-place (adds/deletes rows or columns, merges/splits cells). You MUST specify "table_index" (e.g. 0 for the first table) in each operation. CRITICAL RULE: If you add a "Total" row, you MUST also add a "merge_cells" operation immediately after to merge the empty descriptive columns!',
    examples: [
        'operations: [ { "action": "delete_column", "index": 4, "table_index": 0 } ]',
        'operations: [ { "action": "delete_row", "index": 2 } ]',
        'operations: [ { "action": "add_row", "index": 2, "data": ["Col1", "Col2"] } ]',
        'operations: [ { "action": "add_column", "index": 1, "data": ["Row1", "Row2"] } ]',
        'operations: [ { "action": "merge_cells", "start_row": 0, "start_column": 0, "end_row": 0, "end_column": 2, "table_index": 0 } ]',
        'operations: [ { "action": "split_cell", "row_index": 1, "column_index": 1, "row_count": 1, "column_count": 2, "table_index": 0 } ]',
        'To add a Total row and merge the first two cells: operations: [ { "action": "add_row", "index": "end", "data": ["Total", "", "1000", "500"] }, { "action": "merge_cells", "start_row": "end", "start_column": 0, "end_row": "end", "end_column": 1, "table_index": 0 } ]'
    ]
});
exports.defaultRegistry.registerTool({
    name: 'format',
    description: 'Applies rich formatting directly. Valid apply: "subscript", "superscript", "bold", "italic", "unbold", "unitalic".',
    examples: [
        'To format an entire word: operations: [ {"find": "exact word to format", "apply": "bold"} ]',
        'To format ONLY a specific character/part within a word (e.g. the 2 in O2): operations: [ {"find": "O2", "target": "2", "apply": "subscript"} ]'
    ]
});
exports.defaultRegistry.registerTool({
    name: 'delete',
    description: 'Removes specific text entirely from the document.',
    examples: [
        'operations: [ {"find": "exact sentence or word to delete"} ]',
        'CRITICAL WARNING: To delete an entire line or paragraph, you MUST add `"target_type": "paragraph"`. If you forget this, empty blank lines (paragraph breaks) will be left behind in the document! Example: operations: [ {"find": "first 5-10 words of the paragraph", "target_type": "paragraph"} ]'
    ]
});
exports.defaultRegistry.registerTool({
    name: 'multi',
    description: 'Combines multiple different tools in one go. You MUST specify the "action" key in each operation object.',
    examples: [
        'operations: [\n      { "action": "replace", "find": "word", "replace": "new word" },\n      { "action": "comment", "find": "sentence", "comment": "Feedback" }\n   ]',
        'SEQUENTIAL CHAINING RULE: If inserting multiple paragraphs/tables sequentially, DO NOT use the same anchor! Use text from the newly inserted item as the anchor for the next one. CRITICAL FOR TABLES: You cannot use target_type with tables. To place a table AFTER a new paragraph, set the table\'s "after" value to the ENTIRE EXACT TEXT of that paragraph (copy-paste it). To place a new paragraph AFTER a table, set its "after" value to a unique phrase inside the table and add "target_type": "table" (e.g., Op 1 inserts P1. Op 2 inserts T1 after full text of P1. Op 3 inserts P2 after unique text in T1 with target_type: "table").'
    ]
});
exports.defaultRegistry.registerTool({
    name: 'view_code',
    description: 'Membaca isi file source code dari direktori project. Gunakan ini jika Anda diminta untuk menganalisis error internal atau memberikan saran perbaikan pada basis kode AutoBib. PENTING: Jika Anda menggunakan tool ini, Anda WAJIB mengatur "needs_followup": true agar sistem dapat membalas dengan isi file tersebut! CRITICAL INSTRUCTION: Jika pengguna tidak menyebutkan path file, JANGAN PERNAH bertanya! Gunakan pedoman ini untuk menebak: 1) Jika masalah pada modifikasi Word (Tabel, Insert, Replace, Format) -> periksa "frontend/assets/js/office-bridge.js". 2) Jika masalah pada chat UI, auto-scroll, eksekusi tool di web -> periksa "frontend/assets/js/chat.js". 3) Jika masalah pada sistem prompt, identitas AI, atau alur logika -> periksa "backend/src/routes/chat.route.ts" atau "backend/src/utils/tool-registry.ts". 4) Jika masalah parsing kutipan/Mendeley -> periksa "backend/src/services/citation.service.ts".',
    examples: [
        'operations: [ {"path": "frontend/assets/js/chat.js"} ]',
        'operations: [ {"path": "backend/src/server.ts"} ]'
    ]
});
//# sourceMappingURL=tool-registry.js.map