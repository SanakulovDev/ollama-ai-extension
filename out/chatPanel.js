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
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
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
        // Load last active session or create new one
        const activeId = this._sessionManager.getActiveSessionId();
        if (activeId) {
            const session = this._sessionManager.getSession(activeId);
            if (session) {
                this._history = session.messages;
                this._currentSessionId = activeId;
            }
        }
        // If no active session, create new one
        if (!this._currentSessionId) {
            const newSession = this._sessionManager.createSession();
            await this._sessionManager.saveSession(newSession);
            await this._sessionManager.setActiveSessionId(newSession.id);
            this._currentSessionId = newSession.id;
        }
        // Send session list to webview after a short delay to ensure it's ready
        setTimeout(() => {
            this._post({
                command: 'sessionList',
                sessions: this._sessionManager.getAllSessions(),
                activeId: this._currentSessionId
            });
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
                    this._post({ command: 'modelName', model: this._getModel() });
                    break;
                case 'pickFiles':
                    const result = await vscode.window.showOpenDialog({
                        canSelectMany: true,
                        openLabel: 'Select Files',
                        filters: {
                            'Code Files': ['ts', 'js', 'tsx', 'jsx', 'py', 'java', 'c', 'cpp', 'h', 'cs', 'go', 'rs', 'rb', 'php', 'swift', 'kt'],
                            'Text Files': ['txt', 'md', 'json', 'yaml', 'yml', 'xml', 'html', 'css', 'scss'],
                            'All Files': ['*']
                        }
                    });
                    if (result) {
                        const files = result.map(uri => ({
                            path: uri.fsPath,
                            name: uri.fsPath.split('/').pop() || uri.fsPath
                        }));
                        this._post({ command: 'filesSelected', files });
                    }
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
                    this._post({
                        command: 'sessionList',
                        sessions: this._sessionManager.getAllSessions(),
                        activeId: this._currentSessionId
                    });
                    break;
                case 'searchWorkspaceFiles':
                    const query = msg.query || '';
                    const files = await this._searchWorkspaceFiles(query);
                    this._post({ command: 'workspaceFilesResult', files });
                    break;
            }
        });
    }
    /** Open chat with selected code from the editor */
    sendWithContext(prefix) {
        const sel = (0, fileContext_1.getSelectionContext)();
        if (!sel) {
            vscode.window.showWarningMessage('Select code first');
            return;
        }
        const text = `${prefix}\n\`\`\`${sel.language}\n${sel.code}\n\`\`\``;
        this._view?.webview.postMessage({ command: 'injectMessage', text });
        this._handleSend(text);
    }
    async _handleSend(userText, attachedPaths = []) {
        if (!userText.trim()) {
            return;
        }
        const model = this._getModel();
        // Add file context
        const ctx = (0, fileContext_1.getActiveFileContext)(this._getContextLines());
        const extraFiles = attachedPaths.length > 0 ? (0, fileContext_1.buildMultiFileContext)(attachedPaths) : '';
        const prompt = (0, fileContext_1.buildPrompt)(userText, ctx, extraFiles);
        this._history.push({ role: 'user', content: prompt });
        this._post({ command: 'userMsg', text: userText });
        this._post({ command: 'thinking' });
        this._abortController = new AbortController();
        let full = '';
        try {
            await this._client.chatStream(model, this._history, chunk => {
                full += chunk;
                this._post({ command: 'streamChunk', chunk });
            }, this._abortController.signal);
            this._history.push({ role: 'assistant', content: full });
            this._post({ command: 'streamDone' });
            // Auto-save after response
            await this._saveCurrentSession();
        }
        catch (err) {
            if (err?.message?.includes('abort')) {
                this._post({ command: 'streamDone' });
            }
            else {
                this._post({ command: 'error', text: 'Could not connect to Ollama. Is Ollama running?' });
            }
        }
    }
    _post(msg) {
        this._view?.webview.postMessage(msg);
    }
    _getModel() {
        return vscode.workspace.getConfiguration('ollamaAI').get('model', 'qwen2.5:3b');
    }
    _getContextLines() {
        return vscode.workspace.getConfiguration('ollamaAI').get('contextLines', 150);
    }
    async _handleNewSession() {
        // Save current session first
        await this._saveCurrentSession();
        // Create new empty session
        const newSession = this._sessionManager.createSession();
        await this._sessionManager.saveSession(newSession);
        await this._sessionManager.setActiveSessionId(newSession.id);
        // Clear UI and history
        this._history = [];
        this._currentSessionId = newSession.id;
        this._post({ command: 'clearChat' });
        this._post({
            command: 'sessionList',
            sessions: this._sessionManager.getAllSessions(),
            activeId: this._currentSessionId
        });
    }
    async _handleSwitchSession(sessionId) {
        // Save current session
        await this._saveCurrentSession();
        // Load target session
        const session = this._sessionManager.getSession(sessionId);
        if (!session) {
            return;
        }
        this._history = session.messages;
        this._currentSessionId = sessionId;
        await this._sessionManager.setActiveSessionId(sessionId);
        // Reload messages in UI
        this._post({ command: 'loadSession', messages: session.messages });
        this._post({
            command: 'sessionList',
            sessions: this._sessionManager.getAllSessions(),
            activeId: this._currentSessionId
        });
    }
    async _handleDeleteSession(sessionId) {
        const session = this._sessionManager.getSession(sessionId);
        if (!session) {
            return;
        }
        // Confirm deletion
        const choice = await vscode.window.showWarningMessage(`Delete "${session.name}"? This cannot be undone.`, { modal: true }, 'Delete', 'Cancel');
        if (choice !== 'Delete') {
            return;
        }
        await this._sessionManager.deleteSession(sessionId);
        // If deleting active session, create new one
        if (sessionId === this._currentSessionId) {
            await this._handleNewSession();
        }
        else {
            // Just refresh session list
            this._post({
                command: 'sessionList',
                sessions: this._sessionManager.getAllSessions(),
                activeId: this._currentSessionId
            });
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
        // Auto-update name from first message
        if (!session.name || session.name.startsWith('Chat ')) {
            session.name = this._sessionManager.generateSessionName(this._history);
        }
        await this._sessionManager.saveSession(session);
    }
    async _searchWorkspaceFiles(query) {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            return [];
        }
        const pattern = query ? `**/*${query}*` : '**/*';
        const exclude = '{**/node_modules/**,**/out/**,**/dist/**,**/.git/**,**/build/**}';
        try {
            const uris = await vscode.workspace.findFiles(pattern, exclude, 30);
            const codeExtensions = [
                '.ts', '.js', '.tsx', '.jsx', '.py', '.java', '.go', '.rs',
                '.md', '.json', '.yaml', '.yml', '.txt', '.c', '.cpp', '.h',
                '.cs', '.rb', '.php', '.swift', '.kt', '.html', '.css', '.scss'
            ];
            return uris
                .filter(uri => codeExtensions.some(ext => uri.fsPath.endsWith(ext)))
                .map(uri => ({
                path: uri.fsPath,
                name: path.basename(uri.fsPath),
                relativePath: vscode.workspace.asRelativePath(uri)
            }))
                .slice(0, 30);
        }
        catch (err) {
            console.error('Failed to search workspace files:', err);
            return [];
        }
    }
    _buildHtml() {
        return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  :root {
    --bg:     var(--vscode-sideBar-background, #252526);
    --fg:     var(--vscode-foreground, #ccc);
    --border: var(--vscode-panel-border, #444);
    --accent: var(--vscode-button-background, #0078d4);
    --input:  var(--vscode-input-background, #3c3c3c);
    --user-bg:    rgba(0,120,212,.12);
    --bot-bg:     var(--vscode-editor-background, #1e1e1e);
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: var(--bg); color: var(--fg); font-family: var(--vscode-font-family); font-size: 12px; display: flex; flex-direction: column; height: 100vh; overflow: hidden; }
  #header { padding: 8px 10px; border-bottom: 1px solid var(--border); font-size: 11px; display: flex; justify-content: space-between; align-items: center; gap: 8px; }
  .header-left { display: flex; gap: 6px; align-items: center; flex: 1; }
  .header-right { font-size: 10px; opacity: .5; }
  #session-select { flex: 1; max-width: 180px; background: var(--input); color: var(--fg); border: 1px solid var(--border); border-radius: 4px; padding: 4px 8px; font-size: 11px; font-family: inherit; }
  #session-select option { background: var(--input); color: var(--fg); }
  .btn-icon { background: transparent; border: 1px solid var(--border); color: var(--fg); padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 12px; opacity: 0.6; line-height: 1; }
  .btn-icon:hover { opacity: 1; background: rgba(255,255,255,0.05); }
  #msgs { flex: 1; overflow-y: auto; padding: 10px; display: flex; flex-direction: column; gap: 10px; }
  .msg { padding: 8px 10px; border-radius: 6px; line-height: 1.5; white-space: pre-wrap; word-break: break-word; }
  .msg-user { background: var(--user-bg); align-self: flex-end; max-width: 85%; }
  .msg-bot  { background: var(--bot-bg); border: 1px solid var(--border); align-self: flex-start; max-width: 95%; }
  .msg-bot code { font-family: var(--vscode-editor-font-family); background: rgba(255,255,255,.07); padding: 1px 4px; border-radius: 3px; }
  .msg-bot pre  { background: rgba(0,0,0,.35); padding: 8px; border-radius: 4px; overflow-x: auto; margin: 6px 0; }
  .thinking { display: flex; gap: 4px; padding: 10px; }
  .dot { width: 5px; height: 5px; border-radius: 50%; background: var(--accent); opacity: .4; animation: blink 1.2s infinite; }
  .dot:nth-child(2) { animation-delay: .2s; }
  .dot:nth-child(3) { animation-delay: .4s; }
  @keyframes blink { 0%,80%,100%{opacity:.4} 40%{opacity:1} }
  #input-area { border-top: 1px solid var(--border); padding: 8px; display: flex; gap: 6px; }
  textarea { flex: 1; background: var(--input); color: var(--fg); border: 1px solid var(--border); border-radius: 4px; padding: 6px 8px; font-family: inherit; font-size: 12px; resize: none; height: 52px; outline: none; }
  textarea:focus { border-color: var(--accent); }
  .btn { padding: 6px 10px; border-radius: 4px; border: none; cursor: pointer; font-size: 12px; }
  .btn-send { background: var(--accent); color: #fff; }
  .btn-stop { background: rgba(244,71,71,.2); color: #f44747; display: none; }
  .btn-file { background: transparent; color: var(--fg); opacity: .6; padding: 6px 8px; font-size: 14px; }
  .btn-file:hover { opacity: 1; }
  .attached { display: flex; flex-wrap: wrap; gap: 4px; padding: 6px 0; }
  .file-tag { background: rgba(255,255,255,.1); padding: 3px 8px; border-radius: 10px; font-size: 11px; display: flex; align-items: center; gap: 4px; }
  .file-tag .remove { cursor: pointer; opacity: .6; }
  .file-tag .remove:hover { opacity: 1; color: #f44747; }
  .empty { opacity: .4; text-align: center; margin-top: 40px; line-height: 1.7; }

  /* Autocomplete dropdown for @ mentions */
  .autocomplete-dropdown {
    position: absolute;
    background: var(--input);
    border: 1px solid var(--border);
    border-radius: 4px;
    max-height: 200px;
    overflow-y: auto;
    z-index: 1000;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    display: none;
    min-width: 250px;
  }
  .autocomplete-item {
    padding: 8px 12px;
    cursor: pointer;
    font-size: 12px;
    border-bottom: 1px solid rgba(255,255,255,0.05);
  }
  .autocomplete-item:last-child {
    border-bottom: none;
  }
  .autocomplete-item:hover,
  .autocomplete-item.selected {
    background: rgba(255,255,255,0.1);
  }
  .autocomplete-item .file-name {
    color: var(--fg);
    font-weight: 500;
    margin-bottom: 2px;
  }
  .autocomplete-item .file-path {
    color: var(--fg);
    opacity: 0.5;
    font-size: 10px;
  }
  .autocomplete-empty {
    padding: 8px 12px;
    font-size: 11px;
    opacity: 0.5;
    text-align: center;
  }
</style>
</head>
<body>
  <div id="header">
    <div class="header-left">
      <select id="session-select" onchange="switchSession()">
        <!-- Populated dynamically -->
      </select>
      <button class="btn-icon" onclick="newSession()" title="New chat">+</button>
      <button class="btn-icon" onclick="deleteCurrentSession()" title="Delete chat">🗑</button>
    </div>
    <div class="header-right">
      <span id="model-label">qwen2.5:3b</span>
    </div>
  </div>

  <div id="msgs">
    <div class="empty" id="empty-state">
      Write code or ask a question<br>
      <span style="font-size:11px">File context is added automatically</span>
    </div>
  </div>

  <div id="input-area">
    <button class="btn btn-file" onclick="pickFiles()" title="Attach files">📎</button>
    <textarea id="input" placeholder="Question or command..." onkeydown="onKey(event)"></textarea>
    <button class="btn btn-send" id="btn-send" onclick="send()">&#9658;</button>
    <button class="btn btn-stop" id="btn-stop" onclick="stop()">&#9632;</button>
  </div>

  <div id="autocomplete-dropdown" class="autocomplete-dropdown"></div>

<script>
  const vscode = acquireVsCodeApi();
  const msgs   = document.getElementById('msgs');
  const input  = document.getElementById('input');
  let   botDiv = null;
  let   botText = '';
  let   attachedFiles = [];
  let   sessions = [];
  let   activeSessionId = null;
  let   autocompleteFiles = [];
  let   autocompleteVisible = false;
  let   autocompleteSelectedIndex = 0;
  let   currentMentionStart = -1;
  let   currentMentionQuery = '';
  let   searchDebounceTimer = null;

  vscode.postMessage({ command: 'getModel' });
  vscode.postMessage({ command: 'getSessions' });

  window.addEventListener('message', e => {
    const m = e.data;
    if (m.command === 'modelName')     { document.getElementById('model-label').textContent = m.model; }
    if (m.command === 'userMsg')       { addMsg(m.text, 'user'); hideEmpty(); }
    if (m.command === 'thinking')      { showThinking(); setStreaming(true); }
    if (m.command === 'streamChunk')   { appendBot(m.chunk); }
    if (m.command === 'streamDone')    { finalizeBot(); setStreaming(false); }
    if (m.command === 'error')         { addMsg(m.text, 'error'); setStreaming(false); }
    if (m.command === 'injectMessage') { input.value = m.text; }
    if (m.command === 'filesSelected') { attachedFiles.push(...m.files); renderAttached(); }
    if (m.command === 'sessionList') {
      sessions = m.sessions;
      activeSessionId = m.activeId;
      renderSessionList();
    }
    if (m.command === 'clearChat') {
      msgs.innerHTML = '<div class="empty" id="empty-state">Write code or ask a question<br><span style="font-size:11px">File context is added automatically</span></div>';
      botDiv = null; botText = '';
    }
    if (m.command === 'loadSession') {
      msgs.innerHTML = '';
      for (const msg of m.messages) {
        if (msg.role === 'user') {
          const userText = extractUserMessage(msg.content);
          addMsg(userText, 'user');
        } else if (msg.role === 'assistant') {
          addMsg(msg.content, 'bot');
        }
      }
      hideEmpty();
      msgs.scrollTop = msgs.scrollHeight;
    }
    if (m.command === 'workspaceFilesResult') {
      if (m.files && m.files.length > 0) {
        showAutocomplete(m.files);
      } else if (autocompleteVisible) {
        renderAutocomplete();
      }
    }
  });

  function onKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!autocompleteVisible) {
        send();
      }
      return;
    }

    if (autocompleteVisible) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        autocompleteSelectedIndex = Math.min(
          autocompleteSelectedIndex + 1,
          autocompleteFiles.length - 1
        );
        renderAutocomplete();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        autocompleteSelectedIndex = Math.max(autocompleteSelectedIndex - 1, 0);
        renderAutocomplete();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        selectAutocompleteItem(autocompleteSelectedIndex);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        hideAutocomplete();
      }
    }
  }

  input.addEventListener('input', handleTextareaInput);
  document.addEventListener('click', handleOutsideClick);

  function handleTextareaInput(e) {
    const text = input.value;
    const cursorPos = input.selectionStart;
    const beforeCursor = text.substring(0, cursorPos);
    const atMatch = beforeCursor.match(/@([\\w\\-./]*)$/);

    if (atMatch) {
      currentMentionStart = cursorPos - atMatch[0].length;
      currentMentionQuery = atMatch[1];

      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(() => {
        vscode.postMessage({
          command: 'searchWorkspaceFiles',
          query: currentMentionQuery
        });
      }, 300);
    } else {
      hideAutocomplete();
    }
  }

  function handleOutsideClick(e) {
    if (autocompleteVisible &&
        !e.target.closest('#input') &&
        !e.target.closest('#autocomplete-dropdown')) {
      hideAutocomplete();
    }
  }

  function send() {
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    input.style.height = '52px';
    vscode.postMessage({ command: 'send', text, attachedFiles: attachedFiles.map(f => f.path) });
    attachedFiles = [];
    renderAttached();
  }

  function stop() { vscode.postMessage({ command: 'stop' }); }

  function pickFiles() { vscode.postMessage({ command: 'pickFiles' }); }

  function removeFile(index) {
    attachedFiles.splice(index, 1);
    renderAttached();
  }

  function renderAttached() {
    let container = document.getElementById('attached-files');
    if (attachedFiles.length === 0) {
      if (container) container.remove();
      return;
    }
    if (!container) {
      container = document.createElement('div');
      container.id = 'attached-files';
      container.className = 'attached';
      document.getElementById('input-area').prepend(container);
    }
    container.innerHTML = attachedFiles.map((f, i) =>
      \`<div class="file-tag"><span>\${f.name}</span><span class="remove" onclick="removeFile(\${i})">✕</span></div>\`
    ).join('');
  }

  function renderSessionList() {
    const select = document.getElementById('session-select');
    if (!select) return;

    // Sort by lastModifiedAt (newest first)
    const sorted = sessions.sort((a, b) => b.lastModifiedAt - a.lastModifiedAt);

    select.innerHTML = sorted.map(s => {
      const active = s.id === activeSessionId ? '● ' : '';
      const count = s.messageCount > 0 ? \` (\${s.messageCount})\` : '';
      return \`<option value="\${s.id}" \${s.id === activeSessionId ? 'selected' : ''}>
        \${active}\${s.name}\${count}
      </option>\`;
    }).join('');
  }

  function newSession() {
    vscode.postMessage({ command: 'newSession' });
  }

  function switchSession() {
    const select = document.getElementById('session-select');
    const sessionId = select.value;
    if (sessionId && sessionId !== activeSessionId) {
      vscode.postMessage({ command: 'switchSession', sessionId });
    }
  }

  function deleteCurrentSession() {
    if (activeSessionId) {
      vscode.postMessage({ command: 'deleteSession', sessionId: activeSessionId });
    }
  }

  function extractUserMessage(content) {
    // Extract question after "**Question:**" marker
    const match = content.match(/\\*\\*Question:\\*\\*\\s*(.+?)$/s);
    return match ? match[1].trim() : content;
  }

  function showAutocomplete(files) {
    if (!files || files.length === 0) {
      hideAutocomplete();
      return;
    }

    autocompleteFiles = files;
    autocompleteSelectedIndex = 0;
    autocompleteVisible = true;

    const dropdown = document.getElementById('autocomplete-dropdown');
    const rect = input.getBoundingClientRect();

    dropdown.style.display = 'block';
    dropdown.style.top = (rect.bottom + 5) + 'px';
    dropdown.style.left = rect.left + 'px';
    dropdown.style.maxWidth = (rect.width - 50) + 'px';

    renderAutocomplete();
  }

  function renderAutocomplete() {
    const dropdown = document.getElementById('autocomplete-dropdown');

    if (!autocompleteFiles || autocompleteFiles.length === 0) {
      dropdown.innerHTML = '<div class="autocomplete-empty">No files found</div>';
      return;
    }

    dropdown.innerHTML = autocompleteFiles.map((file, i) => \`
      <div class="autocomplete-item \${i === autocompleteSelectedIndex ? 'selected' : ''}"
           onclick="selectAutocompleteItem(\${i})">
        <div class="file-name">\${escapeHtml(file.name)}</div>
        <div class="file-path">\${escapeHtml(file.relativePath)}</div>
      </div>
    \`).join('');
  }

  function selectAutocompleteItem(index) {
    const file = autocompleteFiles[index];
    if (!file) return;

    const text = input.value;
    const beforeMention = text.substring(0, currentMentionStart);
    const afterCursor = text.substring(input.selectionStart);

    const newText = beforeMention + '@' + file.name + ' ' + afterCursor;
    input.value = newText;

    const newCursorPos = currentMentionStart + file.name.length + 2;
    input.setSelectionRange(newCursorPos, newCursorPos);

    if (!attachedFiles.some(f => f.path === file.path)) {
      attachedFiles.push({ path: file.path, name: file.name });
      renderAttached();
    }

    hideAutocomplete();
    input.focus();
  }

  function hideAutocomplete() {
    autocompleteVisible = false;
    autocompleteFiles = [];
    currentMentionStart = -1;
    currentMentionQuery = '';
    document.getElementById('autocomplete-dropdown').style.display = 'none';
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function clearChat() {
    // Now triggers new session instead
    newSession();
  }

  function hideEmpty() {
    const e = document.getElementById('empty-state');
    if (e) e.remove();
  }

  function addMsg(text, type) {
    const div = document.createElement('div');
    div.className = 'msg msg-' + (type === 'user' ? 'user' : 'bot');
    div.textContent = text;
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
    return div;
  }

  function showThinking() {
    botDiv  = document.createElement('div');
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
    botDiv  = null;
    botText = '';
  }

  function setStreaming(on) {
    document.getElementById('btn-send').style.display = on ? 'none'  : '';
    document.getElementById('btn-stop').style.display = on ? 'block' : 'none';
    input.disabled = on;
  }

  function formatMarkdown(text) {
    return text
      .replace(/\`\`\`(\\w*)?\\n?([\\s\\S]*?)\`\`\`/g, '<pre><code>$2</code></pre>')
      .replace(/\`([^\`]+)\`/g, '<code>$1</code>')
      .replace(/\\*\\*(.+?)\\*\\*/g, '<strong>$1</strong>')
      .replace(/\\n/g, '<br>');
  }
</script>
</body>
</html>`;
    }
}
exports.ChatViewProvider = ChatViewProvider;
ChatViewProvider.viewType = 'ollamaAI.chatView';
