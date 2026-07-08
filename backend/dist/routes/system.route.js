"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const router = (0, express_1.Router)();
// Endpoint untuk membaca isi file project
router.post('/view-code', (req, res) => {
    let { filePath } = req.body;
    if (!filePath) {
        return res.status(400).json({ error: 'filePath is required' });
    }
    try {
        // Fix incorrectly parsed escape characters from unescaped Windows paths
        if (typeof filePath === 'string') {
            filePath = filePath.replace(/\u000c/g, '\\f')
                .replace(/\u0008/g, '\\b')
                .replace(/\t/g, '\\t')
                .replace(/\n/g, '\\n')
                .replace(/\r/g, '\\r');
        }
        // Proyek root adalah d:/1. MY CODE/AUTOBIB
        const rootDir = path_1.default.resolve(__dirname, '../../../');
        const absolutePath = path_1.default.resolve(rootDir, filePath);
        // Mencegah directory traversal attack & handle Windows path case-insensitivity
        const relative = path_1.default.relative(rootDir, absolutePath);
        if (relative.startsWith('..') || path_1.default.isAbsolute(relative)) {
            return res.status(403).json({ error: 'Access denied: File outside project root' });
        }
        if (!fs_1.default.existsSync(absolutePath)) {
            return res.status(404).json({ error: 'File not found: ' + absolutePath });
        }
        const content = fs_1.default.readFileSync(absolutePath, 'utf8');
        res.json({ content });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
exports.default = router;
//# sourceMappingURL=system.route.js.map