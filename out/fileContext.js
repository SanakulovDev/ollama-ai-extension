"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.getActiveFileContext = getActiveFileContext;
exports.getSelectionContext = getSelectionContext;
exports.getFullFileContext = getFullFileContext;
exports.buildPrompt = buildPrompt;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
/**
 * Get code around the cursor.
 * Unlike Continue: works with unlimited, smart window.
 */
function getActiveFileContext(contextLines = 150) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        return null;
    }
    const doc = editor.document;
    const cursor = editor.selection.active;
    const totalLines = doc.lineCount;
    // Center on cursor, equal contextLines on both sides
    const half = Math.floor(contextLines / 2);
    const startLine = Math.max(0, cursor.line - half);
    const endLine = Math.min(totalLines - 1, cursor.line + half);
    const code = doc.getText(new vscode.Range(startLine, 0, endLine, Number.MAX_SAFE_INTEGER));
    return {
        fileName: doc.fileName,
        language: doc.languageId,
        code,
        cursorLine: cursor.line - startLine, // relative within snippet
        totalLines,
        relatedFiles: findRelatedFiles(doc.fileName),
    };
}
/** Context with selected text */
function getSelectionContext() {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.selection.isEmpty) {
        return null;
    }
    return {
        code: editor.document.getText(editor.selection),
        language: editor.document.languageId,
    };
}
/**
 * Full file (chunked for large files)
 */
function getFullFileContext(maxChars = 80000) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        return null;
    }
    const doc = editor.document;
    let code = doc.getText();
    // If too large, cut around cursor
    if (code.length > maxChars) {
        const cursor = editor.selection.active;
        const offset = doc.offsetAt(cursor);
        const half = Math.floor(maxChars / 2);
        const start = Math.max(0, offset - half);
        const end = Math.min(code.length, offset + half);
        code = (start > 0 ? '// ... (preceding code omitted) ...\n' : '')
            + code.slice(start, end)
            + (end < code.length ? '\n// ... (following code omitted) ...' : '');
    }
    return {
        fileName: doc.fileName,
        language: doc.languageId,
        code,
        cursorLine: editor.selection.active.line,
        totalLines: doc.lineCount,
        relatedFiles: findRelatedFiles(doc.fileName),
    };
}
/** Formatted context for prompt */
function buildPrompt(userMessage, ctx) {
    if (!ctx) {
        return userMessage;
    }
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
function findRelatedFiles(filePath) {
    const dir = path.dirname(filePath);
    const ext = path.extname(filePath);
    const base = path.basename(filePath, ext);
    try {
        return fs.readdirSync(dir)
            .filter(f => f !== path.basename(filePath) && (f.endsWith(ext) || f.startsWith(base)))
            .slice(0, 5)
            .map(f => path.join(dir, f));
    }
    catch {
        return [];
    }
}
