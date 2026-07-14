/**
 * pdf-extractor.ts
 * Utility untuk mengekstrak teks dari file PDF menggunakan pdf-parse.
 * Digunakan untuk fitur "ekstrak semua citasi dari PDF" sebelum di-upload ke Mendeley.
 */

// @ts-ignore — pdf-parse adalah modul CommonJS
const pdfParse = require('pdf-parse');
import { logger } from './logger';

export interface PdfExtractResult {
  text: string;
  numPages: number;
  info: {
    title?: string;
    author?: string;
    subject?: string;
    keywords?: string;
    creator?: string;
    producer?: string;
  };
  metadata: Record<string, any>;
}

/**
 * Ekstrak teks dan metadata dari buffer PDF.
 *
 * @param buffer - Buffer file PDF
 * @returns PdfExtractResult berisi teks dan metadata
 */
export async function extractTextFromPdf(buffer: Buffer): Promise<PdfExtractResult> {
  try {
    const data = await pdfParse(buffer, {
      // Max halaman yang di-parse (hindari PDF sangat besar)
      max: 100,
    });

    return {
      text: data.text,
      numPages: data.numpages,
      info: {
        title: data.info?.Title ?? undefined,
        author: data.info?.Author ?? undefined,
        subject: data.info?.Subject ?? undefined,
        keywords: data.info?.Keywords ?? undefined,
        creator: data.info?.Creator ?? undefined,
        producer: data.info?.Producer ?? undefined,
      },
      metadata: data.metadata ?? {},
    };
  } catch (err: any) {
    logger.error('[pdf-extractor] Failed to parse PDF:', err.message);
    throw new Error('Gagal membaca file PDF. Pastikan file tidak terenkripsi atau rusak.');
  }
}

/**
 * Ekstrak metadata bibliografi dari info PDF.
 * Berguna untuk auto-fill form Mendeley saat upload.
 *
 * @param info - PDF info object dari pdfParse
 * @returns Partial CSL JSON
 */
export function inferCslFromPdfInfo(info: PdfExtractResult['info']): Record<string, any> {
  const csl: Record<string, any> = { type: 'article-journal' };

  if (info.title) csl.title = info.title;

  if (info.author) {
    // Coba parse "Lastname, Firstname" atau "Firstname Lastname"
    const authStr = info.author;
    const authors = authStr.split(/[;,&]/).map((a) => {
      const parts = a.trim().split(/\s+/);
      if (parts.length === 1) return { family: parts[0], given: '' };
      const last = parts.pop()!;
      return { family: last, given: parts.join(' ') };
    });
    csl.author = authors;
  }

  if (info.subject) csl['container-title'] = info.subject;
  if (info.keywords) csl.keyword = info.keywords;

  return csl;
}
