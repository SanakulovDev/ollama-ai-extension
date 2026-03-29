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
export function buildPrompt(userMessage: string, ctx: ContextResult | null, extraFiles: string = ''): string {
  const editInstructions = `If the user asks you to create or update project files, include one or more blocks in this exact format:

\`\`\`file:relative/path/to/file.ext
full file contents here
\`\`\`

Use workspace-relative paths, include the complete final contents for each file, and do not use diff syntax. After the file block(s), add a short explanation.`;

  if (!ctx && !extraFiles) {
    return `${userMessage}\n\n${editInstructions}`;
  }

  const contextIntro = ctx
    ? `You are an experienced ${ctx.language} developer. Answer in the context of the following code. Unless the user asks otherwise, respond in English.`
    : `You are an experienced developer. Unless the user asks otherwise, respond in English.`;

  let prompt = `${contextIntro}
`;

  if (ctx) {
    const fileLabel = vscode.workspace.asRelativePath(ctx.fileName, false) || path.basename(ctx.fileName);
    prompt += `
**File:** ${fileLabel}
**Language:** ${ctx.language}
**Total lines:** ${ctx.totalLines}

\`\`\`${ctx.language}
${ctx.code}
\`\`\`
`;
  }

  if (extraFiles) {
    prompt += `\n**Additional files:**\n${extraFiles}\n`;
  }

  prompt += `**Question:** ${userMessage}

Keep your answer clear and concise. Use \`\`\` tags for code examples.

${editInstructions}`;

  return prompt;
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

/** Build context from multiple files */
export function buildMultiFileContext(filePaths: string[]): string {
  const blocks: string[] = [];

  for (const filePath of filePaths) {
    try {
      let content = fs.readFileSync(filePath, 'utf-8');

      // Trim files larger than 60k chars
      if (content.length > 60_000) {
        const first = content.slice(0, 30_000);
        const last = content.slice(-30_000);
        content = first + '\n\n// ... (middle section truncated) ...\n\n' + last;
      }

      const fileName = vscode.workspace.asRelativePath(filePath, false) || path.basename(filePath);
      const ext = path.extname(filePath).slice(1);
      blocks.push(`**${fileName}**\n\`\`\`${ext}\n${content}\n\`\`\``);
    } catch (err) {
      const fileName = vscode.workspace.asRelativePath(filePath, false) || path.basename(filePath);
      blocks.push(`**${fileName}**\n_(Could not read file)_`);
    }
  }

  return blocks.join('\n\n');
}
