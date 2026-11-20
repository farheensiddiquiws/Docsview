import sanitizeHtml from 'sanitize-html';
import { marked } from 'marked';
import mammoth from 'mammoth';
import path from 'node:path';

/** The only markup the editor understands; everything else is stripped server-side. */
const SANITIZE_OPTIONS = {
  allowedTags: ['p', 'br', 'h1', 'h2', 'h3', 'strong', 'b', 'em', 'i', 'u', 's', 'ul', 'ol', 'li',
    'blockquote', 'code', 'pre', 'hr', 'a'],
  allowedAttributes: { a: ['href'] },
  allowedSchemes: ['http', 'https', 'mailto'],
  transformTags: { h4: 'h3', h5: 'h3', h6: 'h3' },
};

export function sanitizeContent(html) {
  return sanitizeHtml(html, SANITIZE_OPTIONS);
}

const escapeHtml = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const SUPPORTED_EXTENSIONS = ['.txt', '.md', '.docx'];
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

export class UnsupportedFileError extends Error {}

/** Convert an uploaded file into { title, content } (sanitized HTML). */
export async function fileToDocument(originalName, buffer) {
  const ext = path.extname(originalName).toLowerCase();
  const title = path.basename(originalName, path.extname(originalName)).trim().slice(0, 200) || 'Imported document';
  let html;
  if (ext === '.txt') {
    html = buffer.toString('utf8').replace(/\r\n/g, '\n').split(/\n{2,}/)
      .map((para) => `<p>${escapeHtml(para).replace(/\n/g, '<br>')}</p>`).join('');
  } else if (ext === '.md') {
    html = await marked.parse(buffer.toString('utf8'));
  } else if (ext === '.docx') {
    try {
      html = (await mammoth.convertToHtml({ buffer })).value;
    } catch {
      throw new UnsupportedFileError('That .docx file could not be read. Is it a valid Word document?');
    }
  } else {
    throw new UnsupportedFileError(`Unsupported file type "${ext || 'none'}". Supported: ${SUPPORTED_EXTENSIONS.join(', ')}`);
  }
  return { title, content: sanitizeContent(html) };
}
