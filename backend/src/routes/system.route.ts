import { Router } from 'express';
import fs from 'fs';
import path from 'path';

const router = Router();

// Proyek root
const ROOT_DIR = path.resolve(__dirname, '../../../');

function safeReadFile(filePath: string, startLine?: number, endLine?: number): { content: string } | { error: string } {
  try {
    // Fix incorrectly parsed escape characters from unescaped Windows paths
    if (typeof filePath === 'string') {
      filePath = filePath.replace(/\u000c/g, '\\f')
                         .replace(/\u0008/g, '\\b')
                         .replace(/\t/g, '\\t')
                         .replace(/\n/g, '\\n')
                         .replace(/\r/g, '\\r');
    }

    const absolutePath = path.resolve(ROOT_DIR, filePath);
    const relative = path.relative(ROOT_DIR, absolutePath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      return { error: 'Access denied: File outside project root' };
    }
    if (!fs.existsSync(absolutePath)) {
      return { error: 'File not found: ' + absolutePath };
    }

    let content = fs.readFileSync(absolutePath, 'utf8');

    // If line range specified, slice only those lines
    if (startLine !== undefined || endLine !== undefined) {
      const lines = content.split('\n');
      const totalLines = lines.length;
      const start = Math.max(0, (startLine ?? 1) - 1);
      const end = Math.min(totalLines, (endLine ?? totalLines));
      content = lines.slice(start, end).join('\n');
      content = `[Lines ${start + 1}-${end} of ${totalLines}]\n` + content;
    }

    return { content };
  } catch (err: any) {
    return { error: err.message };
  }
}

// Endpoint single file (backward-compatible)
router.post('/view-code', (req, res) => {
  const { filePath, startLine, endLine } = req.body;
  if (!filePath) {
    return res.status(400).json({ error: 'filePath is required' });
  }
  const result = safeReadFile(filePath, startLine, endLine);
  if ('error' in result) {
    const status = result.error.includes('not found') ? 404 : result.error.includes('denied') ? 403 : 500;
    return res.status(status).json(result);
  }
  res.json(result);
});

// Endpoint multi-file: membaca banyak file sekaligus, bertahap (dengan range baris opsional)
// Body: { files: [{ path: string, startLine?: number, endLine?: number, label?: string }] }
router.post('/view-code-multi', (req, res) => {
  const { files } = req.body;
  if (!Array.isArray(files) || files.length === 0) {
    return res.status(400).json({ error: '"files" array is required' });
  }
  if (files.length > 10) {
    return res.status(400).json({ error: 'Maximum 10 files per request' });
  }

  const results: Array<{ path: string; label?: string; content?: string; error?: string; lines?: string }> = [];

  for (const file of files) {
    const { path: filePath, startLine, endLine, label } = file;
    if (!filePath) {
      results.push({ path: '', label, error: 'path is required' });
      continue;
    }
    const result = safeReadFile(filePath, startLine, endLine);
    if ('error' in result) {
      results.push({ path: filePath, label, error: result.error });
    } else {
      const lineInfo = (startLine || endLine) ? `L${startLine ?? 1}-${endLine ?? 'end'}` : 'full';
      results.push({ path: filePath, label, content: result.content, lines: lineInfo });
    }
  }

  res.json({ results });
});

export default router;
