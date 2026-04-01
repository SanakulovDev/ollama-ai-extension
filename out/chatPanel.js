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
exports.ChatViewProvider = void 0;
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
const fileContext_1 = require("./fileContext");
class ChatViewProvider {
    constructor(_context, _client, _sessionManager) {
        this._context = _context;
        this._client = _client;
        this._sessionManager = _sessionManager;
        this._history = [];
        this._currentSessionId = null;
        this._skill = 'code';
    }
    async resolveWebviewView(webviewView) {
        this._view = webviewView;
        webviewView.webview.options = { enableScripts: true };
        webviewView.webview.html = this._buildHtml();
        await this._ensureActiveSession();
        setTimeout(() => {
            void this._postSessionState();
            void this._postModelState();
            this._post({ command: 'restoreSkill', skill: this._skill });
        }, 100);
        webviewView.webview.onDidReceiveMessage(async (msg) => {
            switch (msg.command) {
                case 'send':
                    await this._handleSend(msg.text, msg.attachedFiles ?? []);
                    break;
                case 'stop':
                    this._abortController?.abort();
                    break;
                case 'clear':
                    this._history = [];
                    break;
                case 'getModel':
                case 'getModels':
                case 'refreshModels':
                    await this._postModelState();
                    break;
                case 'setModel':
                    await this._handleSetModel(msg.model);
                    break;
                case 'pickFiles':
                    await this._handlePickFiles();
                    break;
                case 'deleteModel':
                    await this._handleDeleteModel(msg.modelId);
                    break;
                case 'pullModel':
                    this._handlePullModel(msg.modelId);
                    break;
                case 'newSession':
                    await this._handleNewSession();
                    break;
                case 'switchSession':
                    await this._handleSwitchSession(msg.sessionId);
                    break;
                case 'deleteSession':
                    await this._handleDeleteSession(msg.sessionId);
                    break;
                case 'getSessions':
                    await this._postSessionState();
                    break;
                case 'searchWorkspaceFiles':
                    this._post({
                        command: 'workspaceFilesResult',
                        files: await this._searchWorkspaceFiles(msg.query || '')
                    });
                    break;
                case 'applyAssistantEdits':
                    await this._handleApplyAssistantEdits(msg.text);
                    break;
                case 'setSkill':
                    if (['code', 'chat', 'plan', 'editor'].includes(msg.skill)) {
                        this._skill = msg.skill;
                    }
                    break;
            }
        });
    }
    sendWithContext(prefix) {
        const selection = (0, fileContext_1.getSelectionContext)();
        if (!selection) {
            vscode.window.showWarningMessage('Select some code first.');
            return;
        }
        const text = `${prefix}\n\`\`\`${selection.language}\n${selection.code}\n\`\`\``;
        this._post({ command: 'injectMessage', text });
        void this._handleSend(text);
    }
    async _ensureActiveSession() {
        const activeId = this._sessionManager.getActiveSessionId();
        if (activeId) {
            const session = this._sessionManager.getSession(activeId);
            if (session) {
                this._history = session.messages;
                this._currentSessionId = activeId;
                this._skill = session.skill ?? 'code';
                return;
            }
        }
        const newSession = this._sessionManager.createSession();
        await this._sessionManager.saveSession(newSession);
        await this._sessionManager.setActiveSessionId(newSession.id);
        this._currentSessionId = newSession.id;
        this._history = [];
        this._skill = 'code';
    }
    _getSystemMessage() {
        switch (this._skill) {
            case 'chat':
                return 'You are a helpful and knowledgeable AI assistant. Answer questions clearly and conversationally. Be concise but thorough.';
            case 'plan':
                return 'You are a software architect and technical lead. Help plan features, system design, and project structure. Use numbered steps, consider trade-offs, and give clear recommendations.';
            case 'editor':
                return 'You are an expert technical writer and editor. Help write, improve, and refine documentation, commit messages, comments, and any written content. Focus on clarity, conciseness, and quality.';
            default:
                return '';
        }
    }
    async _handleSend(userText, attachedPaths = []) {
        if (!userText.trim()) {
            return;
        }
        let prompt;
        if (this._skill === 'code') {
            const explicitExtra = attachedPaths.length > 0
                ? (0, fileContext_1.buildMultiFileContext)(this._dedupePaths(attachedPaths))
                : '';
            const openTabsExtra = !explicitExtra ? (0, fileContext_1.getOpenEditorsContext)() : '';
            prompt = (0, fileContext_1.buildPrompt)(userText, (0, fileContext_1.getActiveFileContext)(this._getContextLines()), explicitExtra || openTabsExtra);
        }
        else {
            const extra = attachedPaths.length > 0
                ? (0, fileContext_1.buildMultiFileContext)(this._dedupePaths(attachedPaths))
                : '';
            prompt = extra ? `${userText}\n\n**Attached files:**\n${extra}` : userText;
        }
        this._history.push({ role: 'user', content: prompt });
        this._post({ command: 'userMsg', text: userText });
        this._post({ command: 'thinking' });
        this._abortController = new AbortController();
        let fullResponse = '';
        const systemMsg = this._getSystemMessage();
        const apiMessages = systemMsg
            ? [{ role: 'system', content: systemMsg }, ...this._history]
            : [...this._history];
        try {
            await this._client.chatStream(this._getModel(), apiMessages, chunk => {
                fullResponse += chunk;
                this._post({ command: 'streamChunk', chunk });
            }, this._abortController.signal, { temperature: this._getTemperature() });
            this._history.push({ role: 'assistant', content: fullResponse });
            this._post({ command: 'streamDone' });
            await this._saveCurrentSession();
        }
        catch (err) {
            if (err?.message?.includes('abort')) {
                this._post({ command: 'streamDone' });
                return;
            }
            this._post({ command: 'error', text: 'Could not connect to Ollama. Is Ollama running?' });
        }
    }
    async _handleSetModel(model) {
        if (!model) {
            return;
        }
        await vscode.workspace.getConfiguration('ollamaAI').update('model', model, vscode.ConfigurationTarget.Global);
        await this._postModelState();
    }
    async _handlePickFiles() {
        const result = await vscode.window.showOpenDialog({
            canSelectMany: true,
            openLabel: 'Select Files',
            filters: {
                'Code Files': ['ts', 'js', 'tsx', 'jsx', 'py', 'java', 'c', 'cpp', 'h', 'cs', 'go', 'rs', 'rb', 'php', 'swift', 'kt'],
                'Text Files': ['txt', 'md', 'json', 'yaml', 'yml', 'xml', 'html', 'css', 'scss'],
                'All Files': ['*']
            }
        });
        if (!result) {
            return;
        }
        const files = result.map(uri => ({
            path: uri.fsPath,
            name: path.basename(uri.fsPath),
            relativePath: this._toRelativePath(uri)
        }));
        this._post({ command: 'filesSelected', files });
    }
    async _handleNewSession() {
        await this._saveCurrentSession();
        const newSession = this._sessionManager.createSession();
        await this._sessionManager.saveSession(newSession);
        await this._sessionManager.setActiveSessionId(newSession.id);
        this._history = [];
        this._currentSessionId = newSession.id;
        this._post({ command: 'clearChat' });
        await this._postSessionState();
    }
    async _handleSwitchSession(sessionId) {
        if (!sessionId) {
            return;
        }
        await this._saveCurrentSession();
        const session = this._sessionManager.getSession(sessionId);
        if (!session) {
            return;
        }
        this._history = session.messages;
        this._currentSessionId = sessionId;
        this._skill = session.skill ?? 'code';
        await this._sessionManager.setActiveSessionId(sessionId);
        this._post({ command: 'loadSession', messages: session.messages });
        this._post({ command: 'restoreSkill', skill: this._skill });
        await this._postSessionState();
    }
    async _handleDeleteSession(sessionId) {
        if (!sessionId) {
            return;
        }
        const session = this._sessionManager.getSession(sessionId);
        if (!session) {
            return;
        }
        const choice = await vscode.window.showWarningMessage(`Delete "${session.name}"? This cannot be undone.`, { modal: true }, 'Delete', 'Cancel');
        if (choice !== 'Delete') {
            return;
        }
        await this._sessionManager.deleteSession(sessionId);
        if (sessionId === this._currentSessionId) {
            await this._handleNewSession();
            return;
        }
        await this._postSessionState();
    }
    async _handleApplyAssistantEdits(responseText) {
        if (!responseText?.trim()) {
            vscode.window.showWarningMessage('No file changes were found to apply.');
            return;
        }
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            vscode.window.showWarningMessage('Open a workspace folder before applying file changes.');
            return;
        }
        const edits = this._extractAssistantFileEdits(responseText);
        if (!edits.length) {
            vscode.window.showWarningMessage('No file changes were found to apply.');
            return;
        }
        const invalidPaths = [];
        const resolvedEdits = edits
            .map(edit => {
            const normalizedPath = this._normalizeAssistantRelativePath(edit.relativePath);
            if (!normalizedPath) {
                invalidPaths.push(edit.relativePath);
                return null;
            }
            const absolutePath = path.resolve(workspaceFolder.uri.fsPath, normalizedPath);
            const relativeToRoot = path.relative(workspaceFolder.uri.fsPath, absolutePath);
            if (relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot)) {
                invalidPaths.push(edit.relativePath);
                return null;
            }
            return {
                relativePath: relativeToRoot.split(path.sep).join('/'),
                uri: vscode.Uri.file(absolutePath),
                content: edit.content
            };
        })
            .filter((edit) => !!edit);
        if (!resolvedEdits.length) {
            vscode.window.showErrorMessage('Generated file paths were invalid. No changes were applied.');
            return;
        }
        if (invalidPaths.length) {
            vscode.window.showErrorMessage(`Some generated paths were invalid: ${invalidPaths.join(', ')}`);
            return;
        }
        const dirtyFiles = vscode.workspace.textDocuments
            .filter(doc => doc.isDirty && resolvedEdits.some(edit => edit.uri.fsPath === doc.uri.fsPath))
            .map(doc => vscode.workspace.asRelativePath(doc.uri, false));
        if (dirtyFiles.length) {
            vscode.window.showWarningMessage(`Save your current changes before applying AI edits to: ${dirtyFiles.join(', ')}`);
            return;
        }
        try {
            for (const edit of resolvedEdits) {
                await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.dirname(edit.uri.fsPath)));
                await vscode.workspace.fs.writeFile(edit.uri, Buffer.from(edit.content, 'utf8'));
            }
            const firstDocument = await vscode.workspace.openTextDocument(resolvedEdits[0].uri);
            await vscode.window.showTextDocument(firstDocument, { preview: false });
            const summary = resolvedEdits
                .slice(0, 3)
                .map(edit => edit.relativePath)
                .join(', ');
            const suffix = resolvedEdits.length > 3 ? ', ...' : '';
            const countLabel = resolvedEdits.length === 1 ? 'file' : 'files';
            vscode.window.showInformationMessage(`Applied changes to ${resolvedEdits.length} ${countLabel}: ${summary}${suffix}`);
        }
        catch (err) {
            console.error('Failed to apply assistant edits:', err);
            vscode.window.showErrorMessage('Could not apply the generated file changes.');
        }
    }
    async _saveCurrentSession() {
        if (!this._currentSessionId) {
            return;
        }
        const session = this._sessionManager.getSession(this._currentSessionId);
        if (!session) {
            return;
        }
        session.messages = this._history;
        session.lastModifiedAt = Date.now();
        session.skill = this._skill;
        if (!session.name || session.name.startsWith('Chat ') || session.name.startsWith('Suhbat ')) {
            const baseName = this._sessionManager.generateSessionName(this._history);
            const prefix = this._skill !== 'code' ? `[${this._skill[0].toUpperCase()}${this._skill.slice(1)}] ` : '';
            session.name = prefix + baseName;
        }
        await this._sessionManager.saveSession(session);
    }
    async _postSessionState() {
        this._post({
            command: 'sessionList',
            sessions: this._sessionManager.getAllSessions(),
            activeId: this._currentSessionId
        });
    }
    async _postModelState() {
        const selectedModel = this._getModel();
        const [running, installedModels] = await Promise.all([
            this._client.isRunning(),
            this._client.listModels()
        ]);
        this._post({
            command: 'modelsList',
            models: installedModels,
            selectedModel,
            running,
            configuredModelUnavailable: !!selectedModel && !installedModels.includes(selectedModel)
        });
    }
    async _searchWorkspaceFiles(query) {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            return [];
        }
        const exclude = '{**/node_modules/**,**/out/**,**/dist/**,**/.git/**,**/build/**}';
        const normalizedQuery = query.trim().toLowerCase();
        try {
            const limit = normalizedQuery ? 400 : 80;
            const uris = await vscode.workspace.findFiles('**/*', exclude, limit);
            const files = uris
                .filter(uri => this._isContextFriendlyFile(uri.fsPath))
                .map(uri => ({
                path: uri.fsPath,
                name: path.basename(uri.fsPath),
                relativePath: this._toRelativePath(uri)
            }));
            if (!normalizedQuery) {
                return files
                    .sort((a, b) => a.relativePath.localeCompare(b.relativePath))
                    .slice(0, 30);
            }
            return files
                .filter(file => {
                const rel = file.relativePath.toLowerCase();
                const name = file.name.toLowerCase();
                return rel.includes(normalizedQuery)
                    || name.includes(normalizedQuery)
                    || this._fuzzyMatch(normalizedQuery, name)
                    || this._fuzzyMatch(normalizedQuery, rel);
            })
                .sort((left, right) => {
                const score = this._scoreWorkspaceFileMatch(normalizedQuery, left) - this._scoreWorkspaceFileMatch(normalizedQuery, right);
                return score !== 0 ? score : left.relativePath.localeCompare(right.relativePath);
            })
                .slice(0, 30);
        }
        catch (err) {
            console.error('Failed to search workspace files:', err);
            return [];
        }
    }
    _scoreWorkspaceFileMatch(query, file) {
        const name = file.name.toLowerCase();
        const rel = file.relativePath.toLowerCase();
        if (name === query || rel === query) {
            return 0;
        }
        if (name.startsWith(query)) {
            return 1;
        }
        if (rel.startsWith(query)) {
            return 2;
        }
        if (name.includes(query)) {
            return 3;
        }
        if (rel.includes(query)) {
            return 4;
        }
        // Fuzzy: all query chars appear in order in the name
        if (this._fuzzyMatch(query, name)) {
            return 5;
        }
        if (this._fuzzyMatch(query, rel)) {
            return 6;
        }
        return 7;
    }
    _fuzzyMatch(query, target) {
        let qi = 0;
        for (let i = 0; i < target.length && qi < query.length; i++) {
            if (target[i] === query[qi]) {
                qi++;
            }
        }
        return qi === query.length;
    }
    _toRelativePath(uri) {
        const relative = vscode.workspace.asRelativePath(uri, false);
        return relative && relative !== uri.fsPath ? relative : path.basename(uri.fsPath);
    }
    _isContextFriendlyFile(filePath) {
        const codeExtensions = [
            '.ts', '.js', '.tsx', '.jsx', '.py', '.java', '.go', '.rs',
            '.md', '.json', '.yaml', '.yml', '.txt', '.c', '.cpp', '.h',
            '.cs', '.rb', '.php', '.swift', '.kt', '.html', '.css', '.scss'
        ];
        return codeExtensions.some(ext => filePath.endsWith(ext));
    }
    _dedupePaths(paths) {
        return [...new Set(paths.filter(Boolean))];
    }
    _extractAssistantFileEdits(responseText) {
        const edits = new Map();
        const regex = /```file:([^\r\n`]+)\r?\n([\s\S]*?)```/g;
        let match;
        while ((match = regex.exec(responseText)) !== null) {
            const relativePath = match[1].trim();
            if (!relativePath) {
                continue;
            }
            edits.set(relativePath, {
                relativePath,
                content: match[2].replace(/\r\n/g, '\n')
            });
        }
        return [...edits.values()];
    }
    _normalizeAssistantRelativePath(relativePath) {
        const normalized = relativePath
            .trim()
            .replace(/^['"]+|['"]+$/g, '')
            .replace(/\\/g, '/')
            .replace(/^\.\//, '');
        return normalized || null;
    }
    async _handleDeleteModel(modelId) {
        if (!modelId) {
            return;
        }
        const choice = await vscode.window.showWarningMessage(`Delete model "${modelId}"? This will remove it from Ollama.`, { modal: true }, 'Delete', 'Cancel');
        if (choice !== 'Delete') {
            return;
        }
        try {
            await this._client.deleteModel(modelId);
            vscode.window.showInformationMessage(`Model ${modelId} deleted.`);
            await this._postModelState();
        }
        catch {
            vscode.window.showErrorMessage(`Failed to delete model ${modelId}.`);
        }
    }
    _handlePullModel(modelId) {
        const id = modelId?.trim();
        if (!id) {
            return;
        }
        const terminal = vscode.window.createTerminal({ name: `Ollama: pull ${id}` });
        terminal.show();
        terminal.sendText(`ollama pull ${id}`);
    }
    _post(message) {
        this._view?.webview.postMessage(message);
    }
    _getModel() {
        return vscode.workspace.getConfiguration('ollamaAI').get('model', 'qwen2.5:3b');
    }
    _getContextLines() {
        return vscode.workspace.getConfiguration('ollamaAI').get('contextLines', 150);
    }
    _getTemperature() {
        return vscode.workspace.getConfiguration('ollamaAI').get('temperature', 0.3);
    }
    _buildHtml() {
        return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  :root {
    --bg: var(--vscode-sideBar-background, #1f2329);
    --panel: var(--vscode-editor-background, #1e1e1e);
    --panel-strong: var(--vscode-input-background, #252526);
    --fg: var(--vscode-foreground, #d4d4d4);
    --muted: color-mix(in srgb, var(--fg) 55%, transparent);
    --border: var(--vscode-panel-border, #3c3c3c);
    --accent: var(--vscode-button-background, #0078d4);
    --accent-soft: color-mix(in srgb, var(--accent) 16%, transparent);
    --accent-fg: var(--vscode-button-foreground, #ffffff);
    --input: var(--vscode-input-background, #252526);
    --input-border: var(--vscode-input-border, var(--border));
    --user-bg: color-mix(in srgb, var(--accent) 18%, transparent);
    --bot-bg: var(--panel-strong);
    --success: #4ade80;
    --warning: #f59e0b;
    --danger: #f87171;
  }

  * {
    box-sizing: border-box;
  }

  body {
    margin: 0;
    min-height: 100vh;
    background: var(--bg);
    color: var(--fg);
    font-family: var(--vscode-font-family);
    font-size: 12px;
    overflow: hidden;
  }

  #app {
    height: 100vh;
    display: grid;
    grid-template-rows: auto 1fr auto;
    gap: 8px;
    padding: 8px;
  }

  .panel {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 10px;
  }

  .status-dot {
    width: 7px;
    height: 7px;
    border-radius: 999px;
    background: var(--warning);
    box-shadow: 0 0 0 4px rgba(245, 158, 11, 0.12);
  }

  .status-dot.online {
    background: var(--success);
    box-shadow: 0 0 0 4px rgba(74, 222, 128, 0.12);
  }

  #topbar {
    padding: 10px;
  }

  .control-row {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .status-row {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--muted);
    font-size: 11px;
  }

  select,
  textarea,
  button {
    font: inherit;
  }

  .input,
  textarea {
    width: 100%;
    background: var(--input);
    color: var(--fg);
    border: 1px solid var(--input-border);
    border-radius: 10px;
    outline: none;
  }

  .input {
    padding: 8px 10px;
  }

  .input:focus,
  textarea:focus {
    border-color: var(--accent);
  }

  .btn {
    border: 1px solid transparent;
    border-radius: 8px;
    padding: 8px 10px;
    cursor: pointer;
    transition: background 0.15s ease, border-color 0.15s ease;
  }

  .btn-primary {
    background: var(--accent);
    color: var(--accent-fg);
  }

  .btn-secondary {
    background: rgba(255, 255, 255, 0.04);
    border-color: rgba(255, 255, 255, 0.08);
    color: var(--fg);
  }

  .btn-danger {
    background: rgba(248, 113, 113, 0.12);
    border-color: rgba(248, 113, 113, 0.18);
    color: var(--danger);
  }

  .btn-icon {
    width: 36px;
    height: 36px;
    padding: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  #msgs {
    position: relative;
    overflow-y: auto;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .empty {
    margin: auto 0;
    text-align: center;
    color: var(--muted);
    line-height: 1.7;
    padding: 18px 12px;
    border: 1px dashed rgba(255, 255, 255, 0.08);
    border-radius: 14px;
    background: rgba(255, 255, 255, 0.02);
  }

  .msg {
    padding: 10px 12px;
    border-radius: 10px;
    line-height: 1.55;
    word-break: break-word;
  }

  .msg-user {
    align-self: flex-end;
    max-width: 88%;
    background: linear-gradient(135deg, rgba(14, 116, 144, 0.24), rgba(14, 116, 144, 0.12));
    border: 1px solid rgba(14, 116, 144, 0.28);
    white-space: pre-wrap;
  }

  .msg-bot {
    align-self: flex-start;
    max-width: 96%;
    background: var(--bot-bg);
    border: 1px solid rgba(255, 255, 255, 0.06);
  }

  .msg-error {
    align-self: stretch;
    background: rgba(248, 113, 113, 0.12);
    border: 1px solid rgba(248, 113, 113, 0.22);
    color: #fecaca;
    white-space: pre-wrap;
  }

  .msg-bot code {
    font-family: var(--vscode-editor-font-family);
    background: rgba(255, 255, 255, 0.08);
    padding: 2px 5px;
    border-radius: 6px;
  }

  .msg-bot pre {
    position: relative;
    background: rgba(0, 0, 0, 0.32);
    padding: 10px;
    border-radius: 10px;
    overflow-x: auto;
    margin: 8px 0;
  }

  .pre-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 4px 10px;
    margin-bottom: -2px;
    background: rgba(255,255,255,0.04);
    border-radius: 10px 10px 0 0;
    font-size: 10px;
    color: var(--muted);
  }

  .copy-btn {
    border: none;
    background: transparent;
    color: var(--muted);
    cursor: pointer;
    font-size: 11px;
    padding: 2px 6px;
    border-radius: 4px;
  }

  .copy-btn:hover { background: rgba(255,255,255,0.08); color: var(--fg); }
  .copy-btn.copied { color: var(--success); }

  .msg-bot ul, .msg-bot ol {
    padding-left: 20px;
    margin: 6px 0;
  }

  .msg-bot li { margin: 3px 0; }

  .msg-bot h1, .msg-bot h2, .msg-bot h3 {
    font-weight: 600;
    margin: 10px 0 4px;
    line-height: 1.3;
  }

  .msg-bot h1 { font-size: 15px; }
  .msg-bot h2 { font-size: 13px; }
  .msg-bot h3 { font-size: 12px; }

  .msg-bot hr {
    border: none;
    border-top: 1px solid rgba(255,255,255,0.1);
    margin: 10px 0;
  }

  .code-file-label {
    display: inline-flex;
    align-items: center;
    margin-top: 8px;
    padding: 4px 8px;
    border-radius: 999px;
    background: var(--accent-soft);
    color: var(--fg);
    font-size: 11px;
  }

  .bot-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
  }

  .bot-action-summary {
    flex: 1;
    min-width: 0;
    color: var(--muted);
    font-size: 11px;
  }

  .bot-action-button {
    white-space: nowrap;
  }

  .thinking {
    display: flex;
    gap: 5px;
    padding: 4px 0;
  }

  .dot {
    width: 6px;
    height: 6px;
    border-radius: 999px;
    background: var(--accent);
    opacity: 0.4;
    animation: blink 1.2s infinite;
  }

  .dot:nth-child(2) {
    animation-delay: 0.2s;
  }

  .dot:nth-child(3) {
    animation-delay: 0.4s;
  }

  @keyframes blink {
    0%, 80%, 100% {
      opacity: 0.35;
      transform: translateY(0);
    }
    40% {
      opacity: 1;
      transform: translateY(-2px);
    }
  }

  #composer {
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  #attached-files {
    display: none;
    flex-wrap: wrap;
    gap: 6px;
  }

  .file-tag {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    max-width: 100%;
    padding: 6px 8px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.08);
  }

  .file-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--fg);
  }

  .file-remove {
    border: none;
    background: transparent;
    color: var(--muted);
    cursor: pointer;
    padding: 0;
  }

  .file-remove:hover {
    color: var(--danger);
  }

  .composer-top {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .composer-actions {
    display: flex;
    gap: 6px;
  }

  #autocomplete-dropdown {
    display: none;
    flex-direction: column;
    max-height: 180px;
    overflow-y: auto;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 12px;
    background: var(--panel-strong);
  }

  .autocomplete-item {
    padding: 9px 10px;
    cursor: pointer;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  }

  .autocomplete-item:last-child {
    border-bottom: none;
  }

  .autocomplete-item:hover,
  .autocomplete-item.selected {
    background: rgba(255, 255, 255, 0.06);
  }

  .autocomplete-name {
    font-weight: 600;
    margin-bottom: 2px;
  }

  .autocomplete-path {
    font-size: 10px;
    color: var(--muted);
  }

  .autocomplete-empty {
    padding: 10px;
    text-align: center;
    color: var(--muted);
  }

  textarea {
    resize: none;
    min-height: 76px;
    max-height: 180px;
    padding: 10px 12px;
    line-height: 1.5;
  }

  .composer-input-row {
    display: flex;
    gap: 8px;
  }

  .composer-input-row textarea {
    width: auto;
    flex: 1;
  }

  .composer-submit {
    width: 92px;
    display: flex;
  }

  .composer-submit .btn {
    width: 100%;
    min-height: 76px;
  }

  .grow {
    flex: 1;
  }

  #model-manager {
    display: none;
    flex-direction: column;
    gap: 6px;
    padding: 10px;
    border-top: 1px solid var(--border);
  }

  #model-manager.open { display: flex; }

  .model-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 8px;
    border-radius: 8px;
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.06);
  }

  .model-row-name { flex: 1; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .model-pull-row { display: flex; gap: 6px; }
  .model-pull-row input {
    flex: 1;
    background: var(--input);
    color: var(--fg);
    border: 1px solid var(--input-border);
    border-radius: 8px;
    padding: 6px 10px;
    font: inherit;
    font-size: 12px;
    outline: none;
  }
  .model-pull-row input:focus { border-color: var(--accent); }

  #skill-tabs {
    display: flex;
    gap: 2px;
    padding: 8px 10px 0;
  }

  .skill-tab {
    flex: 1;
    padding: 5px 4px;
    border: 1px solid transparent;
    border-radius: 6px;
    background: transparent;
    color: var(--muted);
    cursor: pointer;
    font-size: 11px;
    font-weight: 500;
    transition: color 0.15s, background 0.15s, border-color 0.15s;
  }

  .skill-tab:hover {
    color: var(--fg);
    background: rgba(255, 255, 255, 0.05);
  }

  .skill-tab.active {
    color: var(--accent-fg);
    background: var(--accent);
    border-color: transparent;
  }
</style>
</head>
<body>
  <div id="app">
    <section id="topbar" class="panel">
      <div class="control-row">
        <select id="session-select" class="input grow" onchange="switchSession(this.value)"></select>
        <button class="btn btn-secondary btn-icon" onclick="newSession()" title="New chat">+</button>
        <button class="btn btn-secondary btn-icon" onclick="deleteCurrentSession()" title="Delete chat">✕</button>
      </div>
    </section>

    <section id="msgs" class="panel">
      <div class="empty" id="empty-state">
        Ask a question or mention a file with <code>@src/file.ts</code>.<br>
        The current file context is added automatically.
      </div>
    </section>

    <section id="composer" class="panel">
      <div id="skill-tabs">
        <button class="skill-tab active" data-skill="code" onclick="setSkill('code')">Code</button>
        <button class="skill-tab" data-skill="chat" onclick="setSkill('chat')">Chat</button>
        <button class="skill-tab" data-skill="plan" onclick="setSkill('plan')">Plan</button>
        <button class="skill-tab" data-skill="editor" onclick="setSkill('editor')">Editor</button>
      </div>
      <div id="attached-files"></div>
      <div class="composer-top">
        <select id="model-select" class="input grow" onchange="setModel(this.value)"></select>
        <button class="btn btn-secondary btn-icon" onclick="refreshModels()" title="Refresh models">↻</button>
        <button class="btn btn-secondary btn-icon" onclick="toggleModelManager()" title="Manage models" id="btn-manage">⋮</button>
        <div class="composer-actions">
          <button class="btn btn-secondary btn-icon" onclick="openMentionPicker()" title="Mention a workspace file">@</button>
          <button class="btn btn-secondary btn-icon" onclick="pickFiles()" title="Attach files">+</button>
        </div>
      </div>

      <div id="model-manager">
        <div id="model-manager-list"></div>
        <div class="model-pull-row">
          <input id="pull-input" placeholder="Model name, e.g. llama3.2:3b" />
          <button class="btn btn-secondary" onclick="pullModel()">Pull</button>
        </div>
      </div>

      <div class="status-row">
        <span class="status-dot" id="model-status-dot"></span>
        <span id="model-status-text">Checking Ollama...</span>
      </div>

      <div id="autocomplete-dropdown"></div>

      <div class="composer-input-row">
        <textarea id="input" placeholder="Ask about the codebase or mention files with @..." onkeydown="onKey(event)"></textarea>
        <div class="composer-submit">
          <button class="btn btn-danger" id="btn-stop" onclick="stop()" style="display:none">Stop</button>
          <button class="btn btn-primary" id="btn-send" onclick="send()">Send</button>
        </div>
      </div>
    </section>
  </div>

<script>
  const vscode = acquireVsCodeApi();
  const msgs = document.getElementById('msgs');
  const input = document.getElementById('input');
  const attachedFilesEl = document.getElementById('attached-files');
  const autocompleteEl = document.getElementById('autocomplete-dropdown');
  const modelSelectEl = document.getElementById('model-select');
  const sessionSelectEl = document.getElementById('session-select');

  let botDiv = null;
  let botText = '';
  let attachedFiles = [];
  let sessions = [];
  let activeSessionId = null;
  let autocompleteFiles = [];
  let autocompleteVisible = false;
  let autocompleteSelectedIndex = 0;
  let currentMentionStart = -1;
  let currentMentionQuery = '';
  let searchDebounceTimer = null;

  vscode.postMessage({ command: 'getModels' });
  vscode.postMessage({ command: 'getSessions' });

  input.addEventListener('input', () => {
    autoResizeInput();
    handleTextareaInput();
  });
  document.addEventListener('click', handleOutsideClick);

  window.addEventListener('message', event => {
    const message = event.data;

    if (message.command === 'modelsList') {
      renderModels(
        message.models || [],
        message.selectedModel,
        !!message.running,
        !!message.configuredModelUnavailable
      );
    }

    if (message.command === 'userMsg') {
      addMsg(message.text, 'user');
      hideEmpty();
    }

    if (message.command === 'thinking') {
      showThinking();
      setStreaming(true);
    }

    if (message.command === 'streamChunk') {
      appendBot(message.chunk);
    }

    if (message.command === 'streamDone') {
      finalizeBot();
      setStreaming(false);
    }

    if (message.command === 'error') {
      addMsg(message.text, 'error');
      setStreaming(false);
    }

    if (message.command === 'injectMessage') {
      input.value = message.text;
      autoResizeInput();
    }

    if (message.command === 'filesSelected') {
      mergeAttachedFiles(message.files || []);
    }

    if (message.command === 'sessionList') {
      sessions = message.sessions || [];
      activeSessionId = message.activeId || null;
      renderSessionList();
    }

    if (message.command === 'clearChat') {
      botDiv = null;
      botText = '';
      msgs.innerHTML = '';
      renderEmptyState();
    }

    if (message.command === 'loadSession') {
      botDiv = null;
      botText = '';
      msgs.innerHTML = '';
      const messages = message.messages || [];
      if (!messages.length) {
        renderEmptyState();
        return;
      }

      messages.forEach(msg => {
        if (msg.role === 'user') {
          addMsg(extractUserMessage(msg.content), 'user');
          return;
        }

        if (msg.role === 'assistant') {
          addMsg(msg.content, 'bot');
        }
      });

      hideEmpty();
      msgs.scrollTop = msgs.scrollHeight;
    }

    if (message.command === 'workspaceFilesResult') {
      showAutocomplete(message.files || []);
    }

    if (message.command === 'restoreSkill') {
      setSkill(message.skill || 'code');
    }
  });

  function renderModels(models, selectedModel, isRunning, configuredModelUnavailable) {
    const installedModels = Array.from(new Set((models || []).filter(Boolean)));
    _installedModels = installedModels.slice();
    renderModelManager();
    const renderableModels = [...installedModels];

    if (configuredModelUnavailable && selectedModel) {
      renderableModels.unshift(selectedModel);
    }

    modelSelectEl.innerHTML = renderableModels.map(model => {
      const unavailableSuffix = configuredModelUnavailable && model === selectedModel ? ' (configured)' : '';
      return \`<option value="\${escapeHtml(model)}">\${escapeHtml(model + unavailableSuffix)}</option>\`;
    }).join('');

    if (!renderableModels.length) {
      modelSelectEl.innerHTML = '<option value="">No installed models</option>';
      modelSelectEl.disabled = true;
    } else {
      modelSelectEl.disabled = false;
      modelSelectEl.value = selectedModel || renderableModels[0];
    }

    const statusDot = document.getElementById('model-status-dot');
    const statusText = document.getElementById('model-status-text');

    statusDot.classList.toggle('online', isRunning);
    if (isRunning) {
      const countLabel = installedModels.length === 1 ? '1 model ready' : installedModels.length + ' models ready';
      statusText.textContent = countLabel;
      if (!installedModels.length) {
        statusText.textContent = 'Ollama running, no models yet';
      }
    } else {
      statusText.textContent = 'Ollama unavailable';
    }
  }

  function setModel(model) {
    if (!model) {
      return;
    }
    vscode.postMessage({ command: 'setModel', model });
  }

  function refreshModels() {
    vscode.postMessage({ command: 'refreshModels' });
  }

  let _installedModels = [];

  function toggleModelManager() {
    const mgr = document.getElementById('model-manager');
    mgr.classList.toggle('open');
  }

  function renderModelManager() {
    const list = document.getElementById('model-manager-list');
    if (!list) { return; }
    if (!_installedModels.length) {
      list.innerHTML = '<div style="font-size:11px;opacity:.5;padding:2px 0">No models installed</div>';
      return;
    }
    list.innerHTML = _installedModels.map(function(m) {
      return '<div class="model-row">'
        + '<span class="model-row-name">' + escapeHtml(m) + '</span>'
        + '<button class="btn btn-secondary" style="font-size:11px;padding:4px 8px" onclick="deleteModel(\'' + escapeHtml(m) + '\')">Delete</button>'
        + '</div>';
    }).join('');
  }

  function deleteModel(modelId) {
    vscode.postMessage({ command: 'deleteModel', modelId });
  }

  function pullModel() {
    const input = document.getElementById('pull-input');
    const id = (input.value || '').trim();
    if (!id) { return; }
    vscode.postMessage({ command: 'pullModel', modelId: id });
    input.value = '';
    document.getElementById('model-manager').classList.remove('open');
  }

  function renderSessionList() {
    const sorted = [...sessions].sort((a, b) => b.lastModifiedAt - a.lastModifiedAt);

    if (!sorted.length) {
      sessionSelectEl.innerHTML = '<option value="">No chats yet</option>';
      sessionSelectEl.disabled = true;
      return;
    }

    sessionSelectEl.disabled = false;
    sessionSelectEl.innerHTML = sorted.map(session => {
      const suffix = session.messageCount > 0 ? ' (' + session.messageCount + ')' : '';
      return \`<option value="\${session.id}" \${session.id === activeSessionId ? 'selected' : ''}>\${escapeHtml(session.name || 'New chat')}\${suffix}</option>\`;
    }).join('');
  }

  function formatSessionDate(timestamp) {
    try {
      return new Date(timestamp).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return 'Recent';
    }
  }

  function newSession() {
    vscode.postMessage({ command: 'newSession' });
  }

  function switchSession(sessionId) {
    if (!sessionId || sessionId === activeSessionId) {
      return;
    }
    vscode.postMessage({ command: 'switchSession', sessionId });
  }

  function deleteCurrentSession() {
    if (!activeSessionId) {
      return;
    }
    vscode.postMessage({ command: 'deleteSession', sessionId: activeSessionId });
  }

  function onKey(event) {
    if (autocompleteVisible) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        autocompleteSelectedIndex = Math.min(autocompleteSelectedIndex + 1, autocompleteFiles.length - 1);
        renderAutocomplete();
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        autocompleteSelectedIndex = Math.max(autocompleteSelectedIndex - 1, 0);
        renderAutocomplete();
        return;
      }

      if (event.key === 'Enter') {
        event.preventDefault();
        selectAutocompleteItem(autocompleteSelectedIndex);
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        hideAutocomplete();
        return;
      }
    }

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      send();
    }
  }

  function autoResizeInput() {
    input.style.height = '0px';
    input.style.height = Math.min(input.scrollHeight, 180) + 'px';
  }

  function handleTextareaInput() {
    const text = input.value;
    const cursorPos = input.selectionStart || 0;
    const beforeCursor = text.slice(0, cursorPos);
    const match = beforeCursor.match(/@([^\\s@]*)$/);

    if (!match) {
      hideAutocomplete();
      return;
    }

    currentMentionStart = cursorPos - match[0].length;
    currentMentionQuery = match[1];

    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
      vscode.postMessage({ command: 'searchWorkspaceFiles', query: currentMentionQuery });
    }, 120);
  }

  function openMentionPicker() {
    input.focus();

    const start = input.selectionStart || 0;
    const end = input.selectionEnd || start;
    const text = input.value;

    if (start === end) {
      input.value = text.slice(0, start) + '@' + text.slice(end);
      input.setSelectionRange(start + 1, start + 1);
    }

    autoResizeInput();
    currentMentionStart = (input.selectionStart || 1) - 1;
    currentMentionQuery = '';
    vscode.postMessage({ command: 'searchWorkspaceFiles', query: '' });
  }

  function handleOutsideClick(event) {
    if (!autocompleteVisible) {
      return;
    }

    if (!event.target.closest('#autocomplete-dropdown') && event.target !== input) {
      hideAutocomplete();
    }
  }

  function showAutocomplete(files) {
    autocompleteFiles = files || [];
    autocompleteSelectedIndex = 0;
    autocompleteVisible = true;
    autocompleteEl.style.display = 'flex';
    renderAutocomplete();
  }

  function renderAutocomplete() {
    if (!autocompleteVisible) {
      autocompleteEl.style.display = 'none';
      autocompleteEl.innerHTML = '';
      return;
    }

    if (!autocompleteFiles.length) {
      autocompleteEl.innerHTML = '<div class="autocomplete-empty">No matching files</div>';
      return;
    }

    autocompleteEl.innerHTML = autocompleteFiles.map((file, index) => \`
      <div class="autocomplete-item \${index === autocompleteSelectedIndex ? 'selected' : ''}" onclick="selectAutocompleteItem(\${index})">
        <div class="autocomplete-name">\${escapeHtml(file.name)}</div>
        <div class="autocomplete-path">\${escapeHtml(file.relativePath)}</div>
      </div>
    \`).join('');
  }

  function selectAutocompleteItem(index) {
    const file = autocompleteFiles[index];
    if (!file) {
      return;
    }

    const cursorPos = input.selectionStart || 0;
    const beforeMention = input.value.slice(0, currentMentionStart);
    const afterMention = input.value.slice(cursorPos);
    const mention = '@' + file.relativePath + ' ';

    input.value = beforeMention + mention + afterMention;
    const nextCursor = beforeMention.length + mention.length;
    input.setSelectionRange(nextCursor, nextCursor);

    mergeAttachedFiles([file]);
    hideAutocomplete();
    autoResizeInput();
    input.focus();
  }

  function hideAutocomplete() {
    autocompleteVisible = false;
    autocompleteFiles = [];
    currentMentionStart = -1;
    currentMentionQuery = '';
    autocompleteEl.style.display = 'none';
    autocompleteEl.innerHTML = '';
  }

  function mergeAttachedFiles(files) {
    (files || []).forEach(file => {
      if (!attachedFiles.some(existing => existing.path === file.path)) {
        attachedFiles.push(file);
      }
    });
    renderAttached();
  }

  function removeFile(index) {
    attachedFiles.splice(index, 1);
    renderAttached();
  }

  function renderAttached() {
    if (!attachedFiles.length) {
      attachedFilesEl.style.display = 'none';
      attachedFilesEl.innerHTML = '';
      return;
    }

    attachedFilesEl.style.display = 'flex';
    attachedFilesEl.innerHTML = attachedFiles.map((file, index) => \`
      <div class="file-tag">
        <span class="file-label" title="\${escapeHtml(file.relativePath || file.name)}">\${escapeHtml(file.relativePath || file.name)}</span>
        <button class="file-remove" onclick="removeFile(\${index})" title="Remove file">✕</button>
      </div>
    \`).join('');
  }

  function send() {
    const text = input.value.trim();
    if (!text) {
      return;
    }

    vscode.postMessage({
      command: 'send',
      text,
      attachedFiles: attachedFiles.map(file => file.path)
    });

    input.value = '';
    attachedFiles = [];
    renderAttached();
    hideAutocomplete();
    autoResizeInput();
  }

  function stop() {
    vscode.postMessage({ command: 'stop' });
  }

  const SKILL_PLACEHOLDERS = {
    code:   'Ask about the codebase or mention files with @...',
    chat:   'Ask anything — questions, explanations, ideas...',
    plan:   'Describe a feature or system you want to plan...',
    editor: 'Paste text or describe what to write or edit...',
  };

  const SKILL_EMPTY = {
    code:   'Ask a question or mention a file with <code>@src/file.ts</code>.<br>The current file context is added automatically.',
    chat:   'Start a conversation. Ask questions, get explanations, or brainstorm ideas.',
    plan:   'Describe what you want to build or plan. The assistant will help structure the approach.',
    editor: 'Paste text to improve or describe what you need written.',
  };

  function setSkill(skill) {
    vscode.postMessage({ command: 'setSkill', skill });
    document.querySelectorAll('.skill-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.skill === skill);
    });
    input.placeholder = SKILL_PLACEHOLDERS[skill] || SKILL_PLACEHOLDERS.code;
    const emptyEl = document.getElementById('empty-state');
    if (emptyEl) {
      emptyEl.innerHTML = SKILL_EMPTY[skill] || SKILL_EMPTY.code;
    }
  }

  function pickFiles() {
    vscode.postMessage({ command: 'pickFiles' });
  }

  function renderEmptyState() {
    if (document.getElementById('empty-state')) {
      return;
    }

    const div = document.createElement('div');
    div.id = 'empty-state';
    div.className = 'empty';
    div.innerHTML = 'Ask a question or mention a file with <code>@src/file.ts</code>.<br>The current file context is added automatically.';
    msgs.appendChild(div);
  }

  function hideEmpty() {
    const empty = document.getElementById('empty-state');
    if (empty) {
      empty.remove();
    }
  }

  function extractFileEdits(text) {
    const edits = [];
    const regex = /\\\`\\\`\\\`file:([^\\r\\n\\\`]+)\\r?\\n([\\s\\S]*?)\\\`\\\`\\\`/g;
    let match;

    while ((match = regex.exec(text)) !== null) {
      edits.push({
        relativePath: match[1].trim(),
        content: match[2]
      });
    }

    return edits;
  }

  function enhanceAssistantMessage(div, text) {
    div._assistantText = text;

    const existingActions = div.querySelector('.bot-actions');
    if (existingActions) {
      existingActions.remove();
    }

    const edits = extractFileEdits(text);
    if (!edits.length) {
      return;
    }

    const summary = edits.length === 1
      ? 'Ready to apply changes to ' + edits[0].relativePath
      : 'Ready to apply changes to ' + edits.slice(0, 2).map(edit => edit.relativePath).join(', ')
        + (edits.length > 2 ? ' +' + (edits.length - 2) + ' more' : '');

    const actions = document.createElement('div');
    actions.className = 'bot-actions';

    const summaryEl = document.createElement('div');
    summaryEl.className = 'bot-action-summary';
    summaryEl.textContent = summary;

    const applyButton = document.createElement('button');
    applyButton.className = 'btn btn-secondary bot-action-button';
    applyButton.textContent = edits.length === 1 ? 'Apply file change' : 'Apply file changes';
    applyButton.addEventListener('click', () => {
      vscode.postMessage({ command: 'applyAssistantEdits', text: div._assistantText || text });
    });

    actions.appendChild(summaryEl);
    actions.appendChild(applyButton);
    div.appendChild(actions);
  }

  function addMsg(text, type) {
    const div = document.createElement('div');
    const kind = type === 'user' ? 'user' : type === 'error' ? 'error' : 'bot';
    div.className = 'msg msg-' + kind;

    if (kind === 'bot') {
      div.innerHTML = formatMarkdown(text);
      enhanceAssistantMessage(div, text);
    } else {
      div.textContent = text;
    }

    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
    return div;
  }

  function showThinking() {
    hideEmpty();
    botDiv = document.createElement('div');
    botDiv.className = 'msg msg-bot';
    botDiv.innerHTML = '<div class="thinking"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>';
    botText = '';
    msgs.appendChild(botDiv);
    msgs.scrollTop = msgs.scrollHeight;
  }

  function appendBot(chunk) {
    botText += chunk;
    if (botDiv) {
      botDiv.innerHTML = formatMarkdown(botText);
      msgs.scrollTop = msgs.scrollHeight;
    }
  }

  function finalizeBot() {
    if (botDiv) {
      botDiv.innerHTML = formatMarkdown(botText);
      enhanceAssistantMessage(botDiv, botText);
    }

    botDiv = null;
    botText = '';
  }

  function setStreaming(isStreaming) {
    document.getElementById('btn-send').style.display = isStreaming ? 'none' : 'inline-flex';
    document.getElementById('btn-stop').style.display = isStreaming ? 'inline-flex' : 'none';
    input.disabled = isStreaming;
  }

  function extractUserMessage(content) {
    const match = content.match(/\\*\\*(?:Question|Savol):\\*\\*\\s*(.+?)$/s);
    return match ? match[1].trim() : content;
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  let _copyIdCounter = 0;

  function formatMarkdown(text) {
    const codeBlocks = [];
    // Extract code blocks before escaping
    let processed = text.replace(/\`\`\`([^\n\`]*)\n?([\s\S]*?)\`\`\`/g, function(_, info, code) {
      const lang = String(info || '').trim();
      const isFile = lang.startsWith('file:');
      const label = isFile ? lang.slice(5).trim() : lang;
      const id = 'cb' + (++_copyIdCounter);
      const header = '<div class="pre-header"><span>' + escapeHtml(label) + '</span>'
        + '<button class="copy-btn" id="' + id + '" onclick="copyCode(\\'' + id + '\\')">Copy</button></div>';
      const fileTag = isFile ? '<div class="code-file-label">' + escapeHtml(label) + '</div>' : '';
      const block = fileTag + header + '<pre><code>' + escapeHtml(code) + '</code></pre>';
      codeBlocks.push(block);
      return '\x00CODE' + (codeBlocks.length - 1) + '\x00';
    });

    processed = escapeHtml(processed);

    // Inline code
    processed = processed.replace(/\`([^\`]+)\`/g, '<code>$1</code>');

    // Headings
    processed = processed.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    processed = processed.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    processed = processed.replace(/^# (.+)$/gm, '<h1>$1</h1>');

    // Bold / italic
    processed = processed.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    processed = processed.replace(/\*(.+?)\*/g, '<em>$1</em>');

    // HR
    processed = processed.replace(/^---$/gm, '<hr>');

    // Unordered lists
    processed = processed.replace(/((?:^[-*] .+(?:\n|$))+)/gm, function(match) {
      const items = match.trim().split('\n').map(function(l) { return '<li>' + l.replace(/^[-*] /, '') + '</li>'; }).join('');
      return '<ul>' + items + '</ul>';
    });

    // Ordered lists
    processed = processed.replace(/((?:^\d+\. .+(?:\n|$))+)/gm, function(match) {
      const items = match.trim().split('\n').map(function(l) { return '<li>' + l.replace(/^\d+\. /, '') + '</li>'; }).join('');
      return '<ol>' + items + '</ol>';
    });

    processed = processed.replace(/\n/g, '<br>');

    // Re-insert code blocks
    processed = processed.replace(/\x00CODE(\d+)\x00/g, function(_, i) { return codeBlocks[+i]; });

    return processed;
  }

  function copyCode(id) {
    const btn = document.getElementById(id);
    if (!btn) { return; }
    const pre = btn.closest && btn.closest('.pre-header') && btn.closest('.pre-header').nextElementSibling;
    const code = pre && pre.querySelector('code');
    if (!code) { return; }
    navigator.clipboard.writeText(code.textContent || '').then(function() {
      btn.textContent = 'Copied!';
      btn.classList.add('copied');
      setTimeout(function() { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 1800);
    });
  }

  autoResizeInput();
</script>
</body>
</html>`;
    }
}
exports.ChatViewProvider = ChatViewProvider;
ChatViewProvider.viewType = 'ollamaAI.chatView';
