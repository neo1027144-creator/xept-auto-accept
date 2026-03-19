import * as vscode from 'vscode';
import * as path from 'path';
import { readConfig, XeptConfig } from '../config';
import { DashboardState, IncomingMessage, LogEntry } from './messages';
import { HealthState } from '../statusBar';

export class DashboardPanel {
  public static readonly viewType = 'xept.dashboard';
  private static instance: DashboardPanel | undefined;

  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];

  // State refs (set externally)
  private _isRunning = false;
  private _clickCount = 0;
  private _health: HealthState = 'disconnected';
  private _logs: LogEntry[] = [];

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this._panel = panel;
    this._extensionUri = extensionUri;

    this._panel.webview.html = this._getHtml();

    this._panel.webview.onDidReceiveMessage(
      (msg: IncomingMessage) => this._handleMessage(msg),
      null,
      this._disposables
    );

    this._panel.onDidDispose(() => this._dispose(), null, this._disposables);

    // Sync config changes from external sources (Settings UI, settings.json)
    this._disposables.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('xept')) {
          this.postStateUpdate();
        }
      })
    );
  }

  /** Create or focus the Dashboard panel */
  static createOrShow(extensionUri: vscode.Uri): DashboardPanel {
    if (DashboardPanel.instance) {
      DashboardPanel.instance._panel.reveal(vscode.ViewColumn.One);
      return DashboardPanel.instance;
    }

    const panel = vscode.window.createWebviewPanel(
      DashboardPanel.viewType,
      'Xept Dashboard',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [extensionUri],
      }
    );

    DashboardPanel.instance = new DashboardPanel(panel, extensionUri);
    return DashboardPanel.instance;
  }

  static getInstance(): DashboardPanel | undefined {
    return DashboardPanel.instance;
  }

  // ── External state setters ───────────────────────

  setRunning(running: boolean): void {
    this._isRunning = running;
    this.postStateUpdate();
  }

  setHealth(health: HealthState): void {
    this._health = health;
    this.postStateUpdate();
  }

  /** Set absolute click count (for init sync with StatusBar) */
  setClickCount(count: number): void {
    this._clickCount = count;
    this.postStateUpdate();
  }

  /** Add incremental clicks (from telemetry) */
  addClicks(count: number): void {
    this._clickCount += count;
    this.postStateUpdate();
  }

  addLog(icon: string, text: string): void {
    const now = new Date();
    const time = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
    this._logs.unshift({ time, icon, text });
    if (this._logs.length > 50) this._logs.length = 50;
    this.postStateUpdate();
  }

  // ── State push ───────────────────────────────────

  postStateUpdate(): void {
    const state: DashboardState = {
      isRunning: this._isRunning,
      clickCount: this._clickCount,
      health: this._health,
      config: readConfig(),
      logs: this._logs,
    };
    this._panel.webview.postMessage({ type: 'stateUpdate', payload: state });
  }

  // ── Message handler ──────────────────────────────

  private async _handleMessage(msg: IncomingMessage): Promise<void> {
    const cfg = vscode.workspace.getConfiguration('xept');

    switch (msg.type) {
      case 'ready':
        this.postStateUpdate();
        break;

      case 'toggleConfig':
        await cfg.update(msg.key, msg.value, vscode.ConfigurationTarget.Global);
        break;

      case 'updateConfig':
        await cfg.update(msg.key, msg.value, vscode.ConfigurationTarget.Global);
        break;

      case 'addListItem': {
        const current = cfg.get<string[]>(msg.key, []);
        if (!current.includes(msg.value)) {
          await cfg.update(msg.key, [...current, msg.value], vscode.ConfigurationTarget.Global);
        }
        break;
      }

      case 'removeListItem': {
        const current = cfg.get<string[]>(msg.key, []);
        const updated = current.filter((_, i) => i !== msg.index);
        await cfg.update(msg.key, updated, vscode.ConfigurationTarget.Global);
        break;
      }
    }
  }

  // ── HTML builder ─────────────────────────────────

  private _getHtml(): string {
    const webview = this._panel.webview;
    const distUri = vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview');

    const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(distUri, 'dashboard.css'));
    const jsUri = webview.asWebviewUri(vscode.Uri.joinPath(distUri, 'dashboard.js'));
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src ${webview.cspSource} 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${cssUri}">
  <title>Xept Dashboard</title>
</head>
<body>
  <div class="dashboard">
    <!-- Status Section -->
    <section class="section status-section" id="status-section">
      <div class="status-row">
        <span class="status-indicator" id="status-dot"></span>
        <span class="status-text" id="status-text">Loading...</span>
      </div>
      <div class="status-stats">
        <div class="stat"><span class="stat-label">Clicks</span><span class="stat-value" id="click-count">0</span></div>
        <div class="stat"><span class="stat-label">CDP</span><span class="stat-value" id="cdp-status">—</span></div>
      </div>
    </section>

    <!-- Toggle Section -->
    <section class="section">
      <h2 class="section-title">Automation</h2>
      <div class="toggle-group">
        <label class="toggle-item"><span>Auto-accept file edits</span><input type="checkbox" id="toggle-autoAcceptFileEdits"><span class="slider"></span></label>
        <label class="toggle-item"><span>Auto-run terminal commands</span><input type="checkbox" id="toggle-autoRun"><span class="slider"></span></label>
        <label class="toggle-item"><span>Auto-allow permissions</span><input type="checkbox" id="toggle-autoAllow"><span class="slider"></span></label>
        <label class="toggle-item"><span>Auto-retry on errors</span><input type="checkbox" id="toggle-autoRetryEnabled"><span class="slider"></span></label>
      </div>
    </section>

    <!-- Safety Section -->
    <section class="section">
      <h2 class="section-title">Safety Filters</h2>
      <div class="list-editor">
        <h3 class="list-label">Blocked Commands</h3>
        <div class="tag-list" id="blocked-list"></div>
        <div class="add-row"><input type="text" id="blocked-input" placeholder="e.g. rm -rf"><button id="blocked-add">+ Add</button></div>
      </div>
      <div class="list-editor">
        <h3 class="list-label">Allowed Commands</h3>
        <div class="tag-list" id="allowed-list"></div>
        <div class="add-row"><input type="text" id="allowed-input" placeholder="e.g. npm test"><button id="allowed-add">+ Add</button></div>
      </div>
    </section>

    <!-- Advanced Section -->
    <section class="section collapsible" id="advanced-section">
      <h2 class="section-title clickable" id="advanced-toggle">Advanced Settings <span class="chevron">▼</span></h2>
      <div class="section-body" id="advanced-body">
        <div class="field"><label>Accept review delay</label><div class="slider-row"><input type="range" id="delay-slider" min="0" max="10000" step="500"><span id="delay-value">2s</span></div></div>
        <div class="list-editor">
          <h3 class="list-label">Custom button texts</h3>
          <div class="tag-list" id="custom-list"></div>
          <div class="add-row"><input type="text" id="custom-input" placeholder="e.g. Confirmar"><button id="custom-add">+ Add</button></div>
        </div>
      </div>
    </section>

    <!-- Logs Section -->
    <section class="section">
      <h2 class="section-title">Activity Log</h2>
      <div class="log-list" id="log-list"><div class="log-empty">No activity yet</div></div>
    </section>
  </div>

  <script nonce="${nonce}" src="${jsUri}"></script>
</body>
</html>`;
  }

  private _dispose(): void {
    DashboardPanel.instance = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      const d = this._disposables.pop();
      if (d) d.dispose();
    }
  }
}

function getNonce(): string {
  let text = '';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}
