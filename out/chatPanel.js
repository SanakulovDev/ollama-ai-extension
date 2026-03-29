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
    }
    async resolveWebviewView(webviewView) {
        this._view = webviewView;
        webviewView.webview.options = { enableScripts: true };
        webviewView.webview.html = this._buildHtml();
        await this._ensureActiveSession();
        setTimeout(() => {
            void this._postSessionState();
            void this._postModelState();
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
            }
        });
    }
    sendWithContext(prefix) {
        const selection = (0, fileContext_1.getSelectionContext)();
        if (!selection) {
            vscode.window.showWarningMessage('Avval kodni belgilang');
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
                return;
            }
        }
        const newSession = this._sessionManager.createSession();
        await this._sessionManager.saveSession(newSession);
        await this._sessionManager.setActiveSessionId(newSession.id);
        this._currentSessionId = newSession.id;
        this._history = [];
    }
    async _handleSend(userText, attachedPaths = []) {
        if (!userText.trim()) {
            return;
        }
        const prompt = (0, fileContext_1.buildPrompt)(userText, (0, fileContext_1.getActiveFileContext)(this._getContextLines()), attachedPaths.length > 0 ? (0, fileContext_1.buildMultiFileContext)(this._dedupePaths(attachedPaths)) : '');
        this._history.push({ role: 'user', content: prompt });
        this._post({ command: 'userMsg', text: userText });
        this._post({ command: 'thinking' });
        this._abortController = new AbortController();
        let fullResponse = '';
        try {
            await this._client.chatStream(this._getModel(), this._history, chunk => {
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
        await this._sessionManager.setActiveSessionId(sessionId);
        this._post({ command: 'loadSession', messages: session.messages });
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
        if (!session.name || session.name.startsWith('Chat ') || session.name.startsWith('Suhbat ')) {
            session.name = this._sessionManager.generateSessionName(this._history);
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
                return rel.includes(normalizedQuery) || name.includes(normalizedQuery);
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
        return 5;
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
    background: rgba(0, 0, 0, 0.32);
    padding: 10px;
    border-radius: 10px;
    overflow-x: auto;
    margin: 8px 0;
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

  .composer-footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  .grow {
    flex: 1;
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
      <div id="attached-files"></div>
      <div class="composer-top">
        <select id="model-select" class="input grow" onchange="setModel(this.value)"></select>
        <button class="btn btn-secondary btn-icon" onclick="refreshModels()" title="Refresh models">↻</button>
        <div class="composer-actions">
          <button class="btn btn-secondary btn-icon" onclick="openMentionPicker()" title="Mention a workspace file">@</button>
          <button class="btn btn-secondary btn-icon" onclick="pickFiles()" title="Attach files">+</button>
        </div>
      </div>

      <div class="status-row">
        <span class="status-dot" id="model-status-dot"></span>
        <span id="model-status-text">Checking Ollama...</span>
      </div>

      <div id="autocomplete-dropdown"></div>

      <textarea id="input" placeholder="Ask about the codebase or mention files with @..." onkeydown="onKey(event)"></textarea>

      <div class="composer-footer">
        <button class="btn btn-danger" id="btn-stop" onclick="stop()" style="display:none">Stop</button>
        <button class="btn btn-primary" id="btn-send" onclick="send()">Send</button>
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
  });

  function renderModels(models, selectedModel, isRunning, configuredModelUnavailable) {
    const installedModels = Array.from(new Set((models || []).filter(Boolean)));
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

  function addMsg(text, type) {
    const div = document.createElement('div');
    const kind = type === 'user' ? 'user' : type === 'error' ? 'error' : 'bot';
    div.className = 'msg msg-' + kind;

    if (kind === 'bot') {
      div.innerHTML = formatMarkdown(text);
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

  function formatMarkdown(text) {
    const safe = escapeHtml(text);
    return safe
      .replace(/\\\`\\\`\\\`(\\w+)?\\n?([\\s\\S]*?)\\\`\\\`\\\`/g, '<pre><code>$2</code></pre>')
      .replace(/\\\`([^\\\`]+)\\\`/g, '<code>$1</code>')
      .replace(/\\*\\*(.+?)\\*\\*/g, '<strong>$1</strong>')
      .replace(/\\n/g, '<br>');
  }

  autoResizeInput();
</script>
</body>
</html>`;
    }
}
exports.ChatViewProvider = ChatViewProvider;
ChatViewProvider.viewType = 'ollamaAI.chatView';
