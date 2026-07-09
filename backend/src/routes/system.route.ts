import { Router } from 'express';
import fs from 'fs';
import path from 'path';

const router = Router();

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
    const rootDir = path.resolve(__dirname, '../../../'); 
    const absolutePath = path.resolve(rootDir, filePath);
    
    // Mencegah directory traversal attack & handle Windows path case-insensitivity
    const relative = path.relative(rootDir, absolutePath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      return res.status(403).json({ error: 'Access denied: File outside project root' });
    }

    if (!fs.existsSync(absolutePath)) {
      return res.status(404).json({ error: 'File not found: ' + absolutePath });
    }

    const content = fs.readFileSync(absolutePath, 'utf8');
    res.json({ content });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
