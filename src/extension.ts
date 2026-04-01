import * as vscode from 'vscode';
import { StatusBarManager } from './statusBar';
import { registerCommands } from './commands';
import { readConfig, onConfigChange, XeptConfig } from './config';
import { ConnectionManager } from './core/ConnectionManager';
import { ensureCdp, restoreSettings, hasCdpFlag, getCdpPortFromArgs, isCdpAvailable, isArgvJsonConfigured } from './launcher';
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
  registerCommands(context, async () => {
    if (!manager) return;
    if (isRunning) {
      const dash = DashboardPanel.getInstance();
      if (dash) dash.addLog('🔧', 'Stopping...');
      // Hard stop: disconnect CDP so injected scripts can't act
      await manager.stop();
      isRunning = false;
      log('Auto-accept stopped (CDP disconnected)');
      if (dash) dash.addLog('⏹️', 'Auto-accept stopped');
    } else {
      // Full restart: reconnect CDP + re-inject scripts
      manager.start();
      isRunning = true;
      log('Auto-accept enabled (CDP reconnecting)');
      const dash = DashboardPanel.getInstance();
      if (dash) dash.addLog('▶️', 'Auto-accept enabled');
    }
    statusBar?.setRunning(isRunning);
    const dash = DashboardPanel.getInstance();
    if (dash) {
      dash.setRunning(isRunning);
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
      restoreSettings(context, log);
    })
  );

  // ── Restart command (for status bar click) ──
  context.subscriptions.push(
    vscode.commands.registerCommand('xept.restart', async () => {
      const { spawn } = require('child_process');
      const cdpArg = `--remote-debugging-port=9222`;
      log(`[Restart] Spawning new IDE with ${cdpArg}`);
      const child = spawn(process.execPath, [cdpArg], { detached: true, stdio: 'ignore' });
      child.unref();
      await new Promise(r => setTimeout(r, 1500));
      await vscode.commands.executeCommand('workbench.action.quit');
    })
  );

  // ── Configure command (clear cooldown and re-prompt) ──
  context.subscriptions.push(
    vscode.commands.registerCommand('xept.configure', async () => {
      // If CDP is already available, just reflect that
      const port = readConfig().cdpPort;
      if (await isCdpAvailable(port)) {
        statusBar?.setHealth('connected');
        lastHealth = 'connected';
        return;
      }
      // If argv.json already has the key or process has CDP flag,
      // CDP is configured but not active — offer restart or wait
      if (isArgvJsonConfigured() || hasCdpFlag()) {
        const choice = await vscode.window.showInformationMessage(
          'Xept: CDP is configured but not yet active. If the IDE just started, wait a few seconds. Otherwise, a restart is required.',
          'Restart Now', 'Wait'
        );
        if (choice === 'Restart Now') {
          vscode.commands.executeCommand('xept.restart');
        }
        return;
      }
      // Not configured — clear cooldown and show the config dialog
      await context.globalState.update('xept.launcherRemindAfter', 0);
      await context.globalState.update('xept.shortcutConfigured', undefined);
      const result = await ensureCdp(context, log, port);
      if (result === 'available') {
        statusBar?.setHealth('connected');
        lastHealth = 'connected';
      } else if (result === 'restart') {
        statusBar?.setHealth('restart');
        lastHealth = 'restart';
      }
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
  lastHealth = 'initializing';
  statusBar.setHealth('initializing');
  log('Xept Auto-Accept activated');

  // ── Health check loop ──
  let hasNotifiedDisconnect = false;
  let initFailCount = 0;

  const healthCheck = async () => {
    if (!isRunning || !statusBar) return;

    // Rule: restart state only transitions to connected
    if (lastHealth === 'restart') {
      const port = readConfig().cdpPort;
      if (await isCdpAvailable(port)) {
        log('[Health] CDP now available after restart config');
        lastHealth = 'connected';
        statusBar.setHealth('connected');
        hasNotifiedDisconnect = false;
        DashboardPanel.getInstance()?.setHealth('connected');
      }
      return;
    }

    const port = readConfig().cdpPort;
    const available = await isCdpAvailable(port);

    if (available) {
      if (lastHealth !== 'connected') {
        log(`[Health] CDP connected on port ${port}`);
        hasNotifiedDisconnect = false;
        initFailCount = 0;
      }
      lastHealth = 'connected';
      statusBar.setHealth('connected');
      const d1 = DashboardPanel.getInstance();
      if (d1) {
        d1.setHealth('connected');
        d1.addLog('\u{1F7E2}', 'CDP connected');
      }
    } else {
      // Try alternate ports
      const altPorts = [9222, 9223, 9224];
      let found = false;
      for (const alt of altPorts) {
        if (alt === port) continue;
        if (await isCdpAvailable(alt)) {
          log(`[Health] CDP found on alternate port ${alt}`);
          lastHealth = 'connected';
          statusBar.setHealth('connected');
          DashboardPanel.getInstance()?.setHealth('connected');
          initFailCount = 0;
          found = true;
          break;
        }
      }

      if (!found) {
        if (lastHealth === 'initializing') {
          // Startup: tolerate 3 failures (~15s) before giving up
          initFailCount++;
          if (initFailCount >= 3) {
            lastHealth = 'disconnected';
            statusBar.setHealth('disconnected');
            DashboardPanel.getInstance()?.setHealth('disconnected');
            log('[Health] CDP not found after startup, marking disconnected');
            // No "connection lost" notification — never was connected
          }
        } else if (lastHealth === 'connected') {
          lastHealth = 'reconnecting';
          statusBar.setHealth('reconnecting');
          const dr = DashboardPanel.getInstance();
          if (dr) {
            dr.setHealth('reconnecting');
            dr.addLog('\u{1F7E1}', 'CDP connection lost, reconnecting...');
          }
          log('[Health] CDP connection lost, attempting reconnect...');
        } else if (lastHealth === 'reconnecting') {
          lastHealth = 'disconnected';
          statusBar.setHealth('disconnected');
          const dd = DashboardPanel.getInstance();
          if (dd) {
            dd.setHealth('disconnected');
            dd.addLog('\u{1F534}', 'CDP disconnected');
          }
          log('[Health] CDP disconnected');

          if (!hasNotifiedDisconnect) {
            hasNotifiedDisconnect = true;
            const choice = await vscode.window.showWarningMessage(
              'Xept: CDP connection lost. Auto-accept is unavailable.',
              'Restart IDE', 'Dismiss'
            );
            if (choice === 'Restart IDE') {
              vscode.commands.executeCommand('xept.restart');
            }
          }
        }
        // If already disconnected, stay (don't spam)
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

  // ── Launcher: async CDP check (non-blocking, delayed for port readiness) ──
  setTimeout(() => {
    ensureCdp(context, log, readConfig().cdpPort).then(result => {
      if (result === 'available') {
        log('CDP confirmed available via launcher');
        statusBar?.setHealth('connected');
      } else if (result === 'restart') {
        log('CDP configured, waiting for restart');
        statusBar?.setHealth('restart');
      } else {
        // CDP not available, health check loop handles disconnected state
        setTimeout(() => {
          ensureCdp(context, log, readConfig().cdpPort).then(ok => {
            if (ok === 'available') {
              log('CDP confirmed available on retry');
              statusBar?.setHealth('connected');
            } else if (ok === 'restart') {
              statusBar?.setHealth('restart');
            }
          });
        }, 25000);
      }
    });
  }, 5000);
}

export async function deactivate(): Promise<void> {
  log('Xept Auto-Accept deactivating...');
  if (cmdInterval) { clearInterval(cmdInterval); cmdInterval = null; }
  if (manager) {
    await manager.stop();
    manager = null;
  }
  isRunning = false;
}
