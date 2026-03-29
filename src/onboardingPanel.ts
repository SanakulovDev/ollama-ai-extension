import * as vscode from 'vscode';
import * as cp      from 'child_process';
import { detectSystem, getRecommendedModels, ALL_MODELS } from './systemDetector';
import { OllamaClient } from './ollamaClient';

export class OnboardingPanel {
  public static currentPanel: OnboardingPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _client: OllamaClient;

  public static show(context: vscode.ExtensionContext, client: OllamaClient): void {
    if (OnboardingPanel.currentPanel) {
      OnboardingPanel.currentPanel._panel.reveal();
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'ollamaSetup',
      'Ollama AI — Sozlash',
      vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true }
    );

    OnboardingPanel.currentPanel = new OnboardingPanel(panel, context, client);
  }

  private constructor(
    panel: vscode.WebviewPanel,
    context: vscode.ExtensionContext,
    client: OllamaClient
  ) {
    this._panel  = panel;
    this._client = client;

    this._panel.webview.html = this._buildHtml();
    this._panel.onDidDispose(() => { OnboardingPanel.currentPanel = undefined; }, null, context.subscriptions);

    // Webview'dan kelgan xabarlarni qabul qil
    this._panel.webview.onDidReceiveMessage(async msg => {
      switch (msg.command) {

        case 'checkOllama': {
          const running  = await client.isRunning();
          const models   = running ? await client.listModels() : [];
          this._panel.webview.postMessage({ command: 'ollamaStatus', running, models });
          break;
        }

        case 'getSystemInfo': {
          const sys  = detectSystem();
          const recs = getRecommendedModels(sys);
          this._panel.webview.postMessage({ command: 'systemInfo', sys, models: recs });
          break;
        }

        case 'installModel': {
          const modelId: string = msg.modelId;
          const terminal = vscode.window.createTerminal({ name: `Ollama: ${modelId} yuklanmoqda` });
          terminal.show();
          terminal.sendText(`ollama pull ${modelId}`);
          vscode.window.showInformationMessage(
            `${modelId} yuklanmoqda. Terminal oynasini kuzating.`,
            'Terminalga o\'tish'
          ).then(sel => { if (sel) { terminal.show(); } });
          break;
        }

        case 'saveModel': {
          await vscode.workspace.getConfiguration('ollamaAI').update(
            'model', msg.modelId, vscode.ConfigurationTarget.Global
          );
          vscode.window.showInformationMessage(`Model ${msg.modelId} ga o'rnatildi!`);
          this._panel.dispose();
          vscode.commands.executeCommand('ollamaAI.openChat');
          break;
        }

        case 'openInstallLink': {
          vscode.env.openExternal(vscode.Uri.parse('https://ollama.com/download'));
          break;
        }
      }
    });

    // Birinchi marta yuklanganda avtomatik tekshir
    setTimeout(() => {
      this._panel.webview.postMessage({ command: 'init' });
    }, 500);
  }

  private _buildHtml(): string {
    const models = ALL_MODELS;

    return /* html */`<!DOCTYPE html>
<html lang="uz">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Ollama AI Sozlash</title>
<style>
  :root {
    --bg: var(--vscode-editor-background, #1e1e1e);
    --fg: var(--vscode-editor-foreground, #d4d4d4);
    --border: var(--vscode-panel-border, #444);
    --accent: var(--vscode-button-background, #0078d4);
    --accent-fg: var(--vscode-button-foreground, #fff);
    --card: var(--vscode-sideBar-background, #252526);
    --input: var(--vscode-input-background, #3c3c3c);
    --green: #4ec9b0;
    --amber: #ce9178;
    --red:   #f44747;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: var(--bg); color: var(--fg); font-family: var(--vscode-font-family, 'Segoe UI', sans-serif); font-size: 13px; padding: 24px; max-width: 680px; margin: 0 auto; }
  h1 { font-size: 20px; font-weight: 600; margin-bottom: 4px; }
  h2 { font-size: 15px; font-weight: 600; margin-bottom: 8px; }
  .sub { opacity: .65; margin-bottom: 20px; }
  .progress { display: flex; gap: 8px; margin-bottom: 28px; }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--border); transition: background .3s; }
  .dot.active { background: var(--accent); }
  .dot.done   { background: var(--green); }
  .step { display: none; }
  .step.active { display: block; }
  .box { background: var(--card); border: 1px solid var(--border); border-radius: 6px; padding: 14px 16px; margin-bottom: 12px; }
  .status-ok  { color: var(--green); }
  .status-err { color: var(--amber); }
  .model-card { background: var(--card); border: 1px solid var(--border); border-radius: 6px; padding: 12px 14px; margin-bottom: 8px; cursor: pointer; transition: border-color .15s; }
  .model-card:hover  { border-color: var(--accent); }
  .model-card.sel    { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 10%, var(--card)); }
  .model-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
  .model-name { font-weight: 600; font-size: 14px; }
  .badge { font-size: 11px; padding: 2px 8px; border-radius: 10px; font-weight: 500; }
  .badge-green { background: rgba(78,201,176,.2); color: var(--green); }
  .badge-amber { background: rgba(206,145,120,.2); color: var(--amber); }
  .badge-red   { background: rgba(244,71,71,.15);  color: var(--red);   }
  .specs { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px; }
  .spec  { font-size: 11px; opacity: .7; }
  .spec span { display: block; opacity: 1; font-weight: 600; color: var(--fg); margin-top: 2px; }
  .hw-row { display: flex; justify-content: space-between; margin-bottom: 6px; }
  .hw-bar { height: 4px; background: var(--border); border-radius: 2px; overflow: hidden; margin-bottom: 12px; }
  .hw-fill { height: 100%; border-radius: 2px; }
  .btn { display: inline-block; padding: 8px 20px; border-radius: 4px; font-size: 13px; cursor: pointer; border: none; font-family: inherit; }
  .btn-primary { background: var(--accent); color: var(--accent-fg); }
  .btn-primary:hover { opacity: .88; }
  .btn-secondary { background: var(--input); color: var(--fg); }
  .code { font-family: var(--vscode-editor-font-family, monospace); font-size: 12px; background: rgba(0,0,0,.3); padding: 10px 12px; border-radius: 4px; margin: 8px 0; color: var(--green); }
  .mt { margin-top: 16px; }
  a { color: var(--accent); cursor: pointer; text-decoration: none; }
</style>
</head>
<body>

<div style="margin-bottom: 24px;">
  <h1>Ollama AI Assistant</h1>
  <p class="sub">100% lokal, internet talab qilmaydi. Bir marta sozlang, ishlatavering.</p>
</div>

<div class="progress">
  <div class="dot active" id="d0"></div>
  <div class="dot" id="d1"></div>
  <div class="dot" id="d2"></div>
  <div class="dot" id="d3"></div>
</div>

<!-- Step 1: Ollama check -->
<div class="step active" id="step1">
  <h2>Ollama tekshiruvi</h2>
  <p class="sub">Ollama — modellarni local ishlatish uchun muhim dastur</p>

  <div class="box" id="ollama-status-box">
    <div id="ollama-status-text" style="opacity:.6">Tekshirilmoqda...</div>
  </div>

  <div class="box" id="install-guide" style="display:none">
    <h2 style="margin-bottom:10px">O'rnatish</h2>
    <p style="opacity:.7; margin-bottom:8px">Platformangizni tanlang:</p>
    <div class="code">
      macOS / Linux:<br>
      curl -fsSL https://ollama.com/install.sh | sh<br><br>
      Windows:<br>
      winget install Ollama.Ollama
    </div>
    <a onclick="openLink()">Ollama.com saytiga o'tish →</a>
    <br><br>
    <p style="opacity:.6; font-size:12px">O'rnatgandan so'ng bu tugmani bosing:</p>
  </div>

  <div style="margin-top: 16px; display: flex; gap: 8px;">
    <button class="btn btn-secondary" onclick="checkOllama()">Qayta tekshir</button>
    <button class="btn btn-primary" id="next1" onclick="goStep(2)">Davom etish →</button>
  </div>
</div>

<!-- Step 2: Hardware info -->
<div class="step" id="step2">
  <h2>Qurilma xarakteristikasi</h2>
  <p class="sub">Sizga mos modellarni avtomatik aniqlaymiz</p>

  <div class="box">
    <div class="hw-row">
      <span>Operativ xotira (RAM)</span>
      <strong id="ram-val">—</strong>
    </div>
    <div class="hw-bar"><div class="hw-fill" id="ram-bar" style="width:0%; background:var(--green)"></div></div>

    <div class="hw-row">
      <span>Protsessor (CPU)</span>
      <strong id="cpu-val">—</strong>
    </div>
    <div class="hw-bar"><div class="hw-fill" id="cpu-bar" style="width:0%; background:#4fc1ff"></div></div>

    <div class="hw-row" style="margin-top:4px; font-size:11px; opacity:.6">
      <span id="cpu-model-text">—</span>
      <span id="platform-text">—</span>
    </div>
  </div>

  <div class="box" id="hw-advice" style="background: rgba(78,201,176,.08); border-color: rgba(78,201,176,.3);">
    <span id="hw-advice-text" style="color: var(--green);">Tahlil qilinmoqda...</span>
  </div>

  <button class="btn btn-primary mt" onclick="goStep(3)">Model tanlash →</button>
</div>

<!-- Step 3: Model selection -->
<div class="step" id="step3">
  <h2>LLM modelini tanlang</h2>
  <p class="sub">Qurilmangizga mos modellar yashil belgilangan</p>

  <div id="model-list"></div>

  <div style="margin-top: 16px; display: flex; gap: 8px;">
    <button class="btn btn-secondary" onclick="goStep(2)">← Orqaga</button>
    <button class="btn btn-primary" id="install-btn" onclick="doInstall()">O'rnatish va boshlash</button>
  </div>
</div>

<!-- Step 4: Done -->
<div class="step" id="step4">
  <h2>Hammasi tayyor!</h2>
  <p class="sub">Model yuklanmoqda — siz ishlay olasiz</p>

  <div class="box" style="background: rgba(78,201,176,.08); border-color: rgba(78,201,176,.3);">
    <p style="color: var(--green); margin-bottom: 8px;">Terminal ochildi va model yuklanmoqda.</p>
    <p style="opacity:.7">Yuklanish vaqti: <strong>internetga qarab 5–20 daqiqa</strong></p>
  </div>

  <div class="box">
    <p style="opacity:.7; margin-bottom:8px;">Keyingi qadamlar:</p>
    <p>1. Terminal yuklashni kutadi</p>
    <p>2. Tugatgach, sol paneldagi <strong>Ollama AI</strong> ikonkasini bosing</p>
    <p>3. Chat boshlanadi!</p>
  </div>

  <div class="box">
    <p style="opacity:.7; margin-bottom:6px;">Foydali buyruqlar:</p>
    <div class="code">
      ollama list          ← modellar ro'yxati<br>
      ollama run qwen2.5:3b ← terminalda sinash<br>
      ollama rm model-name  ← o'chirish
    </div>
  </div>

  <button class="btn btn-primary mt" onclick="finishSetup()">Chatni ochish</button>
</div>

<script>
  const vscode = acquireVsCodeApi();
  let step = 1;
  let selectedModel = '${models[0]?.id ?? 'qwen2.5:3b'}';
  let sysInfo = null;

  const MODELS = ${JSON.stringify(models)};

  window.addEventListener('message', e => {
    const msg = e.data;
    if (msg.command === 'init')       { checkOllama(); }
    if (msg.command === 'ollamaStatus') { handleOllamaStatus(msg); }
    if (msg.command === 'systemInfo')   { handleSystemInfo(msg); }
  });

  function checkOllama() {
    document.getElementById('ollama-status-text').textContent = 'Tekshirilmoqda...';
    document.getElementById('ollama-status-text').style.opacity = '.6';
    vscode.postMessage({ command: 'checkOllama' });
  }

  function handleOllamaStatus(msg) {
    const box  = document.getElementById('ollama-status-box');
    const text = document.getElementById('ollama-status-text');
    const guide = document.getElementById('install-guide');
    if (msg.running) {
      text.innerHTML = '<span style="color:var(--green)">✓ Ollama ishlayapti</span>'
        + (msg.models.length ? '<br><span style="opacity:.6; font-size:11px">O\'rnatilgan: ' + msg.models.join(', ') + '</span>' : '');
      text.style.opacity = '1';
      guide.style.display = 'none';
    } else {
      text.innerHTML = '<span style="color:var(--amber)">✗ Ollama topilmadi</span><br><span style="opacity:.6">Quyida o\'rnatish yo\'riqnomasini ko\'ring</span>';
      text.style.opacity = '1';
      guide.style.display = 'block';
    }
  }

  function handleSystemInfo(msg) {
    const { sys, models: recs } = msg;
    sysInfo = sys;
    const ramPct = Math.min(100, Math.round(sys.ramGb / 64 * 100));
    const cpuPct = Math.min(100, Math.round(sys.cpuCores / 32 * 100));
    document.getElementById('ram-val').textContent  = sys.ramGb + ' GB';
    document.getElementById('cpu-val').textContent  = sys.cpuCores + ' yadrolar';
    document.getElementById('ram-bar').style.width  = ramPct + '%';
    document.getElementById('cpu-bar').style.width  = cpuPct + '%';
    document.getElementById('cpu-model-text').textContent = sys.cpuModel.substring(0, 40);
    document.getElementById('platform-text').textContent  = sys.platform + ' / ' + sys.arch;

    const advised = recs.filter(m => m.ramRequired <= sys.ramGb);
    const best    = advised.length ? advised[advised.length - 1] : recs[0];
    document.getElementById('hw-advice-text').textContent =
      sys.ramGb >= 16
        ? sys.ramGb + ' GB RAM bilan 7B–14B modellar qulay ishlaydi'
        : sys.ramGb >= 8
          ? sys.ramGb + ' GB RAM bilan 3B–7B modellar tavsiya etiladi'
          : '4–6 GB RAM uchun 3B modellar optimal';

    buildModelList(recs);
  }

  function buildModelList(models) {
    const list = document.getElementById('model-list');
    list.innerHTML = '';
    models.forEach(m => {
      const badge = m.badge === 'recommended'
        ? '<span class="badge badge-green">Tavsiya</span>'
        : m.badge === 'medium'
          ? '<span class="badge badge-amber">O\'rta</span>'
          : '<span class="badge badge-red">Kuchli PC kerak</span>';
      const speedLabel = { 'very-fast':'Juda tez', fast:'Tez', medium:"O'rtacha", slow:'Sekin' }[m.speed];
      const qualLabel  = { basic:'Oddiy', good:'Yaxshi', great:'A\'lo', excellent:'Mukammal' }[m.quality];
      const div = document.createElement('div');
      div.className = 'model-card' + (m.id === selectedModel ? ' sel' : '');
      div.id = 'card-' + m.id.replace(/[:\.]/g, '-');
      div.innerHTML = \`
        <div class="model-head">
          <span class="model-name">\${m.name}</span>
          \${badge}
        </div>
        <div class="specs">
          <div class="spec">RAM<span>\${m.ramRequired} GB+</span></div>
          <div class="spec">Tezlik<span>\${speedLabel}</span></div>
          <div class="spec">Sifat<span>\${qualLabel}</span></div>
        </div>
        <div style="font-size:11px; opacity:.55; margin-top:6px">\${m.bestFor}</div>
      \`;
      div.onclick = () => selectCard(m.id);
      list.appendChild(div);
    });
  }

  function selectCard(id) {
    selectedModel = id;
    document.querySelectorAll('.model-card').forEach(c => c.classList.remove('sel'));
    const safeId = 'card-' + id.replace(/[:\.]/g, '-');
    const el = document.getElementById(safeId);
    if (el) { el.classList.add('sel'); }
    document.getElementById('install-btn').textContent = id + ' — o\'rnatish va boshlash';
  }

  function doInstall() {
    vscode.postMessage({ command: 'installModel', modelId: selectedModel });
    vscode.postMessage({ command: 'saveModel',    modelId: selectedModel });
    goStep(4);
  }

  function finishSetup() {
    vscode.postMessage({ command: 'saveModel', modelId: selectedModel });
  }

  function openLink() {
    vscode.postMessage({ command: 'openInstallLink' });
  }

  function goStep(n) {
    document.getElementById('step' + step).classList.remove('active');
    step = n;
    document.getElementById('step' + n).classList.add('active');
    for (let i = 0; i < 4; i++) {
      const d = document.getElementById('d' + i);
      d.className = 'dot' + (i + 1 < n ? ' done' : i + 1 === n ? ' active' : '');
    }
    if (n === 2) { vscode.postMessage({ command: 'getSystemInfo' }); }
  }
</script>
</body>
</html>`;
  }
}
