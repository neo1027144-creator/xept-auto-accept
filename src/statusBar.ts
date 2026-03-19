import * as vscode from 'vscode';

export type HealthState = 'connected' | 'disconnected' | 'reconnecting';

export class StatusBarManager {
  private item: vscode.StatusBarItem;
  private dashItem: vscode.StatusBarItem;
  private _clickCount = 0;
  private _health: HealthState = 'disconnected';
  private _isRunning = false;

  constructor() {
    // Dashboard button (lower priority = further left)
    this.dashItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      1001
    );
    this.dashItem.text = '$(dashboard) Xept Hub';
    this.dashItem.tooltip = 'Open Xept Dashboard';
    this.dashItem.command = 'xept.openDashboard';
    this.dashItem.show();

    // Main toggle button
    this.item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      1000
    );
    this.item.command = 'xept.toggle';
    this.item.show();
    this.render();
  }

  /** Set real CDP connection health */
  setHealth(state: HealthState): void {
    if (this._health === state) return;
    this._health = state;
    this.render();
  }

  /** Set user toggle (ON/OFF) */
  setRunning(running: boolean): void {
    this._isRunning = running;
    this.render();
  }

  addClicks(count: number): void {
    this._clickCount += count;
    this.render();
  }

  getClickCount(): number {
    return this._clickCount;
  }

  private render(): void {
    if (!this._isRunning) {
      this.item.text = '$(circle-slash) Xept: OFF';
      this.item.tooltip = 'Xept paused | Click to enable';
      this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
      return;
    }

    switch (this._health) {
      case 'connected': {
        const stats = this._clickCount > 0 ? ` (${this._clickCount})` : '';
        this.item.text = `$(check) Xept: ON${stats}`;
        this.item.tooltip = `Xept running | Click to pause`;
        this.item.backgroundColor = undefined;
        break;
      }
      case 'reconnecting':
        this.item.text = '$(sync~spin) Xept: Reconnecting...';
        this.item.tooltip = 'CDP disconnected, attempting to reconnect...';
        this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        break;
      case 'disconnected':
        this.item.text = '$(warning) Xept: Disconnected';
        this.item.tooltip = 'CDP not connected | Restart IDE or check launch flags';
        this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
        break;
    }
  }

  /** Backward compat */
  update(isRunning: boolean, _sessionCount: number, _label?: string): void {
    this._isRunning = isRunning;
    this.render();
  }

  dispose(): void {
    this.item.dispose();
    this.dashItem.dispose();
  }
}
