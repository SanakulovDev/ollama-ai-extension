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
 * Get code around the cursor.
 * Unlike Continue: works with unlimited, smart window.
 */
export function getActiveFileContext(contextLines = 150): ContextResult | null {
  const editor = vscode.window.activeTextEditor;
  if (!editor) { return null; }

  const doc        = editor.document;
  const cursor     = editor.selection.active;
  const totalLines = doc.lineCount;

  // Center on cursor, equal contextLines on both sides
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

/** Context with selected text */
export function getSelectionContext(): { code: string; language: string } | null {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.selection.isEmpty) { return null; }

  return {
    code:     editor.document.getText(editor.selection),
    language: editor.document.languageId,
  };
}

/**
 * Full file (chunked for large files)
 */
export function getFullFileContext(maxChars = 80_000): ContextResult | null {
  const editor = vscode.window.activeTextEditor;
  if (!editor) { return null; }

  const doc  = editor.document;
  let   code = doc.getText();

  // If too large, cut around cursor
  if (code.length > maxChars) {
    const cursor  = editor.selection.active;
    const offset  = doc.offsetAt(cursor);
    const half    = Math.floor(maxChars / 2);
    const start   = Math.max(0, offset - half);
    const end     = Math.min(code.length, offset + half);
    code = (start > 0 ? '// ... (preceding code omitted) ...\n' : '')
         + code.slice(start, end)
         + (end < code.length ? '\n// ... (following code omitted) ...' : '');
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

/** Formatted context for prompt */
export function buildPrompt(userMessage: string, ctx: ContextResult | null): string {
  if (!ctx) { return userMessage; }

  const fileLabel = path.basename(ctx.fileName);
  return `You are an experienced ${ctx.language} developer. Answer in the context of the following code.

**File:** ${fileLabel}
**Language:** ${ctx.language}
**Total lines:** ${ctx.totalLines}

\`\`\`${ctx.language}
${ctx.code}
\`\`\`

**Question:** ${userMessage}

Keep your answer clear and concise. Use \`\`\` tags for code examples.`;
}

/** Simple neighboring file finder (without import/require analysis) */
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
