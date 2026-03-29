import * as vscode from 'vscode';
import { OllamaClient, OllamaMessage } from './ollamaClient';
import { getActiveFileContext, getSelectionContext, buildPrompt } from './fileContext';

export class ChatViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'ollamaAI.chatView';

  private _view?: vscode.WebviewView;
  private _history: OllamaMessage[] = [];
  private _abortController?: AbortController;

  constructor(
    private readonly _context: vscode.ExtensionContext,
    private readonly _client: OllamaClient
  ) {}

  resolveWebviewView(webviewView: vscode.WebviewView) {
    this._view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html   = this._buildHtml();

    webviewView.webview.onDidReceiveMessage(async msg => {
      switch (msg.command) {
        case 'send':    await this._handleSend(msg.text); break;
        case 'stop':    this._abortController?.abort(); break;
        case 'clear':   this._history = []; break;
        case 'getModel':
          this._post({ command: 'modelName', model: this._getModel() });
          break;
      }
    });
  }

  /** Editor'dagi tanlangan kod bilan chat ochish */
  public sendWithContext(prefix: string) {
    const sel = getSelectionContext();
    if (!sel) { vscode.window.showWarningMessage('Avval kodni tanlang'); return; }
    const text = `${prefix}\n\`\`\`${sel.language}\n${sel.code}\n\`\`\``;
    this._view?.webview.postMessage({ command: 'injectMessage', text });
    this._handleSend(text);
  }

  private async _handleSend(userText: string) {
    if (!userText.trim()) { return; }

    const model = this._getModel();

    // Fayl kontekstini qo'shish
    const ctx   = getActiveFileContext(this._getContextLines());
    const prompt = buildPrompt(userText, ctx);

    this._history.push({ role: 'user', content: prompt });
    this._post({ command: 'userMsg', text: userText });
    this._post({ command: 'thinking' });

    this._abortController = new AbortController();
    let full = '';

    try {
      await this._client.chatStream(
        model,
        this._history,
        chunk => {
          full += chunk;
          this._post({ command: 'streamChunk', chunk });
        },
        this._abortController.signal
      );
      this._history.push({ role: 'assistant', content: full });
      this._post({ command: 'streamDone' });
    } catch (err: any) {
      if (err?.message?.includes('abort')) {
        this._post({ command: 'streamDone' });
      } else {
        this._post({ command: 'error', text: 'Ollama bilan ulanib bo\'lmadi. Ollama ishlaydimi?' });
      }
    }
  }

  private _post(msg: object) {
    this._view?.webview.postMessage(msg);
  }

  private _getModel(): string {
    return vscode.workspace.getConfiguration('ollamaAI').get<string>('model', 'qwen2.5:3b');
  }

  private _getContextLines(): number {
    return vscode.workspace.getConfiguration('ollamaAI').get<number>('contextLines', 150);
  }

  private _buildHtml(): string {
    return /* html */`<!DOCTYPE html>
<html lang="uz">
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
  #header { padding: 8px 10px; border-bottom: 1px solid var(--border); font-size: 11px; opacity: .6; display: flex; justify-content: space-between; }
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
  .empty { opacity: .4; text-align: center; margin-top: 40px; line-height: 1.7; }
</style>
</head>
<body>
  <div id="header">
    <span id="model-label">qwen2.5:3b</span>
    <span onclick="clearChat()" style="cursor:pointer; opacity:.5; font-size:10px">tozalash</span>
  </div>

  <div id="msgs">
    <div class="empty" id="empty-state">
      Kod yozing yoki savol bering<br>
      <span style="font-size:11px">Fayl konteksti avtomatik qo'shiladi</span>
    </div>
  </div>

  <div id="input-area">
    <textarea id="input" placeholder="Savol yoki buyruq..." onkeydown="onKey(event)"></textarea>
    <button class="btn btn-send" id="btn-send" onclick="send()">&#9658;</button>
    <button class="btn btn-stop" id="btn-stop" onclick="stop()">&#9632;</button>
  </div>

<script>
  const vscode = acquireVsCodeApi();
  const msgs   = document.getElementById('msgs');
  const input  = document.getElementById('input');
  let   botDiv = null;
  let   botText = '';

  vscode.postMessage({ command: 'getModel' });

  window.addEventListener('message', e => {
    const m = e.data;
    if (m.command === 'modelName')     { document.getElementById('model-label').textContent = m.model; }
    if (m.command === 'userMsg')       { addMsg(m.text, 'user'); hideEmpty(); }
    if (m.command === 'thinking')      { showThinking(); setStreaming(true); }
    if (m.command === 'streamChunk')   { appendBot(m.chunk); }
    if (m.command === 'streamDone')    { finalizeBot(); setStreaming(false); }
    if (m.command === 'error')         { addMsg(m.text, 'error'); setStreaming(false); }
    if (m.command === 'injectMessage') { input.value = m.text; }
  });

  function onKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  }

  function send() {
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    input.style.height = '52px';
    vscode.postMessage({ command: 'send', text });
  }

  function stop() { vscode.postMessage({ command: 'stop' }); }

  function clearChat() {
    msgs.innerHTML = '<div class="empty" id="empty-state">Kod yozing yoki savol bering<br><span style="font-size:11px">Fayl konteksti avtomatik qo\\'shiladi</span></div>';
    botDiv = null; botText = '';
    vscode.postMessage({ command: 'clear' });
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
