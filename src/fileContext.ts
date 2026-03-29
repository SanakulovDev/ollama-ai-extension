import * as vscode from 'vscode';
import * as path   from 'path';
import * as fs     from 'fs';

export interface ContextResult {
  fileName:     string;
  language:     string;
  code:         string;
  cursorLine:   number;
  totalLines:   number;
  relatedFiles: string[];
}

/**
 * Cursor atrofidagi kodni oling.
 * Continue'dan farqi: cheksiz, smart window bilan ishlaydi.
 */
export function getActiveFileContext(contextLines = 150): ContextResult | null {
  const editor = vscode.window.activeTextEditor;
  if (!editor) { return null; }

  const doc        = editor.document;
  const cursor     = editor.selection.active;
  const totalLines = doc.lineCount;

  // Kursor markazga, ikki tarafga teng contextLines
  const half      = Math.floor(contextLines / 2);
  const startLine = Math.max(0, cursor.line - half);
  const endLine   = Math.min(totalLines - 1, cursor.line + half);

  const code = doc.getText(new vscode.Range(startLine, 0, endLine, Number.MAX_SAFE_INTEGER));

  return {
    fileName:   doc.fileName,
    language:   doc.languageId,
    code,
    cursorLine: cursor.line - startLine,  // relative within snippet
    totalLines,
    relatedFiles: findRelatedFiles(doc.fileName),
  };
}

/** Tanlangan matn bilan kontekst */
export function getSelectionContext(): { code: string; language: string } | null {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.selection.isEmpty) { return null; }

  return {
    code:     editor.document.getText(editor.selection),
    language: editor.document.languageId,
  };
}

/**
 * Butun fayl (katta fayllar uchun chunklarga bo'linadi)
 */
export function getFullFileContext(maxChars = 80_000): ContextResult | null {
  const editor = vscode.window.activeTextEditor;
  if (!editor) { return null; }

  const doc  = editor.document;
  let   code = doc.getText();

  // Agar juda katta bo'lsa, cursor atrofidan kesib olamiz
  if (code.length > maxChars) {
    const cursor  = editor.selection.active;
    const offset  = doc.offsetAt(cursor);
    const half    = Math.floor(maxChars / 2);
    const start   = Math.max(0, offset - half);
    const end     = Math.min(code.length, offset + half);
    code = (start > 0 ? '// ... (boshqa kod o\'chirildi) ...\n' : '')
         + code.slice(start, end)
         + (end < code.length ? '\n// ... (keyingi kod o\'chirildi) ...' : '');
  }

  return {
    fileName:   doc.fileName,
    language:   doc.languageId,
    code,
    cursorLine: editor.selection.active.line,
    totalLines: doc.lineCount,
    relatedFiles: findRelatedFiles(doc.fileName),
  };
}

/** Prompt uchun formatlangan kontekst */
export function buildPrompt(userMessage: string, ctx: ContextResult | null): string {
  if (!ctx) { return userMessage; }

  const fileLabel = path.basename(ctx.fileName);
  return `Siz tajribali ${ctx.language} dasturchisisiz. Quyidagi kod kontekstida javob bering.

**Fayl:** ${fileLabel}  
**Til:** ${ctx.language}  
**Jami qatorlar:** ${ctx.totalLines}

\`\`\`${ctx.language}
${ctx.code}
\`\`\`

**Savol:** ${userMessage}

Javobingiz aniq va qisqa bo'lsin. Kod misollar uchun \`\`\` teglari ishlating.`;
}

/** Oddiy qo'shni fayl toppish (import/require tahlilisiz) */
function findRelatedFiles(filePath: string): string[] {
  const dir    = path.dirname(filePath);
  const ext    = path.extname(filePath);
  const base   = path.basename(filePath, ext);

  try {
    return fs.readdirSync(dir)
      .filter(f => f !== path.basename(filePath) && (f.endsWith(ext) || f.startsWith(base)))
      .slice(0, 5)
      .map(f => path.join(dir, f));
  } catch {
    return [];
  }
}
