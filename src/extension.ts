import * as vscode from 'vscode';
import { StatusBarManager } from './statusBar';
import { registerCommands } from './commands';
import { readConfig, onConfigChange, XeptConfig } from './config';
import { ConnectionManager } from './core/ConnectionManager';
import { ensureCdp, restoreShortcuts, hasCdpFlag, getCdpPortFromArgs, isCdpAvailable } from './launcher';
import { DashboardPanel } from './panel/DashboardPanel';

// ── Layer 1: VS Code internal commands (fast, stable, DOM-independent) ──
const ACCEPT_COMMANDS = [
  'antigravity.agent.acceptAgentStep',
  'antigravity.terminalCommand.accept',
  'antigravity.command.accept',
  'antigravity.acceptCompletion',
  'antigravity.prioritized.agentAcceptAllInFile',
  'antigravity.prioritized.agentAcceptFocusedHunk',
  'antigravity.prioritized.supercompleteAccept',
  'antigravity.prioritized.terminalSuggestion.accept',
];

let manager: ConnectionManager | null = null;
let statusBar: StatusBarManager | null = null;
let isRunning = false;
let cmdInterval: ReturnType<typeof setInterval> | null = null;
let lastHealth: 'connected' | 'disconnected' | 'reconnecting' = 'disconnected';

function log(msg: string): void {
  console.log(`[Xept] ${msg}`);
}

export function activate(context: vscode.ExtensionContext): void {
  log('Xept Auto-Accept activating...');

  const config = readConfig();
  statusBar = new StatusBarManager();
  context.subscriptions.push({ dispose: () => statusBar?.dispose() });

  manager = new ConnectionManager({
    log,
    getPort: () => readConfig().cdpPort,
    getConfig: () => readConfig(),
  });

  manager.onStatusChange = () => {
    statusBar?.update(isRunning, manager?.getSessionCount() ?? 0);
  };

  manager.onClickTelemetry = (count: number) => {
    statusBar?.addClicks(count);
    statusBar?.update(isRunning, manager?.getSessionCount() ?? 0);
    // Sync to Dashboard if open
    const dash = DashboardPanel.getInstance();
    if (dash) {
      dash.addClicks(count);
      dash.addLog('✅', `Auto-clicked ${count} button(s)`);
    }
  };

  // Toggle command
  registerCommands(context, () => {
    if (!manager) return;
    if (isRunning) {
      // Hard stop: disconnect CDP so injected scripts can't act
      manager.stop();
      isRunning = false;
      log('Auto-accept stopped (CDP disconnected)');
    } else {
      // Full restart: reconnect CDP + re-inject scripts
      manager.start();
      isRunning = true;
      log('Auto-accept enabled (CDP reconnecting)');
    }
    statusBar?.setRunning(isRunning);
    const dash = DashboardPanel.getInstance();
    if (dash) {
      dash.setRunning(isRunning);
      dash.addLog(isRunning ? '▶️' : '⏹️', isRunning ? 'Auto-accept enabled' : 'Auto-accept stopped');
    }
  });

  // Config change listener
  context.subscriptions.push(
    onConfigChange((newConfig: XeptConfig) => {
      log('Config changed, updating filters...');
      if (manager) {
        manager.setCommandFilters(
          newConfig.blockedCommands,
          newConfig.allowedCommands
        );
        manager.pushFilterUpdate(
          newConfig.blockedCommands,
          newConfig.allowedCommands
        );
      }
    })
  );

  // ── Restore shortcuts command ──
  context.subscriptions.push(
    vscode.commands.registerCommand('xept.restoreShortcuts', () => {
      restoreShortcuts(context, log);
    })
  );

  // ── Dashboard command ──
  context.subscriptions.push(
    vscode.commands.registerCommand('xept.openDashboard', () => {
      const dash = DashboardPanel.createOrShow(context.extensionUri);
      dash.setRunning(isRunning);
      dash.setHealth(lastHealth);
      if (statusBar) dash.setClickCount(statusBar.getClickCount());
    })
  );

  // ── Status bar QuickPick menu ──
  context.subscriptions.push(
    vscode.commands.registerCommand('xept.statusBarMenu', async () => {
      const toggleLabel = isRunning ? '$(circle-slash) Turn OFF' : '$(check) Turn ON';
      const pick = await vscode.window.showQuickPick(
        [
          { label: toggleLabel, id: 'toggle' },
          { label: '$(dashboard) Open Dashboard', id: 'dashboard' },
        ],
        { placeHolder: 'Xept Auto-Accept' }
      );
      if (!pick) return;
      if (pick.id === 'toggle') {
        vscode.commands.executeCommand('xept.toggle');
      } else if (pick.id === 'dashboard') {
        vscode.commands.executeCommand('xept.openDashboard');
      }
    })
  );

  // Auto-start (will scan for ports)
  isRunning = true;
  manager.start();
  statusBar.setRunning(true);
  log('Xept Auto-Accept activated');

  // ── Health check loop: probe CDP every 10s ──
  let hasNotifiedDisconnect = false;

  const healthCheck = async () => {
    if (!isRunning || !statusBar) return;

    const port = readConfig().cdpPort;
    const available = await isCdpAvailable(port);

    if (available) {
      if (lastHealth !== 'connected') {
        log(`[Health] CDP connected on port ${port}`);
        hasNotifiedDisconnect = false;
      }
      lastHealth = 'connected';
      statusBar.setHealth('connected');
      const d1 = DashboardPanel.getInstance();
      if (d1) {
        d1.setHealth('connected');
        d1.addLog('🟢', 'CDP connected');
      }
    } else {
      // Try a few alternate ports before declaring disconnected
      const altPorts = [9222, 9223, 9224];
      let found = false;
      for (const alt of altPorts) {
        if (alt === port) continue;
        if (await isCdpAvailable(alt)) {
          log(`[Health] CDP found on alternate port ${alt}`);
          lastHealth = 'connected';
          statusBar.setHealth('connected');
          DashboardPanel.getInstance()?.setHealth('connected');
          found = true;
          break;
        }
      }

      if (!found) {
        if (lastHealth === 'connected') {
          // Just lost connection → show reconnecting
          lastHealth = 'reconnecting';
          statusBar.setHealth('reconnecting');
          const dr = DashboardPanel.getInstance();
          if (dr) {
            dr.setHealth('reconnecting');
            dr.addLog('🟡', 'CDP connection lost, reconnecting...');
          }
          log('[Health] CDP connection lost, attempting reconnect...');
        } else if (lastHealth === 'reconnecting') {
          // Still can't connect → mark disconnected
          lastHealth = 'disconnected';
          statusBar.setHealth('disconnected');
          const dd = DashboardPanel.getInstance();
          if (dd) {
            dd.setHealth('disconnected');
            dd.addLog('🔴', 'CDP disconnected');
          }
          log('[Health] CDP disconnected');

          if (!hasNotifiedDisconnect) {
            hasNotifiedDisconnect = true;
            const choice = await vscode.window.showWarningMessage(
              'Xept: CDP connection lost. Auto-accept is unavailable.',
              'Restart IDE', 'Dismiss'
            );
            if (choice === 'Restart IDE') {
              vscode.commands.executeCommand('workbench.action.reloadWindow');
            }
          }
        }
        // If already disconnected, stay disconnected (don't spam notifications)
      }
    }
  };

  // Run first health check after 3s (give CDP time to start)
  setTimeout(healthCheck, 3000);
  const healthInterval = setInterval(healthCheck, 5000);
  context.subscriptions.push({ dispose: () => clearInterval(healthInterval) });

  // ── Layer 1: VS Code command executor (parallel to CDP Layer 2) ──
  // DISABLED: These commands don't exist in current Antigravity builds
  // and cause "command not found" notifications. Keeping code for future use.
  // const cmdTick = async () => {
  //   if (!isRunning) return;
  //   for (const cmd of ACCEPT_COMMANDS) {
  //     try { await vscode.commands.executeCommand(cmd); } catch {}
  //   }
  // };
  // cmdInterval = setInterval(cmdTick, 800);

  // ── Launcher: async CDP check (non-blocking) ──
  ensureCdp(context, log, readConfig().cdpPort).then(available => {
    if (available) {
      log('CDP confirmed available via launcher');
      statusBar?.setHealth('connected');
    }
  });
}

export function deactivate(): void {
  log('Xept Auto-Accept deactivating...');
  if (cmdInterval) { clearInterval(cmdInterval); cmdInterval = null; }
  if (manager) {
    manager.stop();
    manager = null;
  }
  isRunning = false;
}
