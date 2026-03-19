/**
 * Xept Launcher — CDP shortcut auto-configurator.
 *
 * Checks if Antigravity was launched with --remote-debugging-port.
 * If not, offers to modify existing .lnk shortcuts (Windows) to add it.
 * Backs up original arguments to globalState for safe restoration.
 */
import * as vscode from 'vscode';
import { execSync } from 'child_process';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import * as http from 'http';
import * as net from 'net';

const CDP_PORT = 9222;
const CDP_FLAG = `--remote-debugging-port=${CDP_PORT}`;
const STATE_KEY_BACKUP = 'xept.shortcutBackups';
const STATE_KEY_DISMISSED = 'xept.launcherDismissed';

export function hasCdpFlag(): boolean {
  return /--remote-debugging-port=\d+/.test(process.argv.join(' '));
}

export function getCdpPortFromArgs(): number | null {
  const m = process.argv.join(' ').match(/--remote-debugging-port=(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

/** Check if a port is free (not in use) */
function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => { server.close(() => resolve(true)); });
    server.listen(port, '127.0.0.1');
  });
}

/** Find first free port starting from preferred */
export async function findFreePort(preferred: number = CDP_PORT): Promise<number> {
  for (let p = preferred; p < preferred + 20; p++) {
    if (await isPortFree(p)) return p;
  }
  return preferred; // fallback
}

/** Actually probe the CDP port via HTTP — more reliable than argv check */
export function isCdpAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/json/version`, { timeout: 2000 }, (res) => {
      resolve(res.statusCode === 200);
      res.resume();
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

function getIdeName(): string {
  const appName = vscode.env.appName || '';
  if (appName.toLowerCase().includes('cursor')) return 'Cursor';
  if (appName.toLowerCase().includes('antigravity')) return 'Antigravity';
  return 'Code';
}

/**
 * Main entry: check CDP flag, prompt user if missing.
 */
export async function ensureCdp(
  context: vscode.ExtensionContext,
  log: (msg: string) => void,
  configuredPort: number = CDP_PORT
): Promise<boolean> {
  // First: try actual port probe (most reliable)
  const portsToTry = [configuredPort, 9222, 9000, 9229];
  for (const port of [...new Set(portsToTry)]) {
    const available = await isCdpAvailable(port);
    if (available) {
      log(`[Launcher] CDP available on port ${port}`);
      return true;
    }
  }

  // Fallback: check process.argv
  if (hasCdpFlag()) {
    log('[Launcher] CDP flag in argv but port not responding yet');
    return true;
  }

  // Check if user previously dismissed
  const dismissed = context.globalState.get<boolean>(STATE_KEY_DISMISSED);
  if (dismissed) {
    log('[Launcher] User previously dismissed launcher prompt');
    return false;
  }

  const ideName = getIdeName();

  if (os.platform() !== 'win32') {
    // Non-Windows: show manual instructions for now
    const choice = await vscode.window.showWarningMessage(
      `Xept requires a CDP port to work. Please launch ${ideName} with:\n${ideName.toLowerCase()} --remote-debugging-port=${CDP_PORT}`,
      'Got it', 'Don\'t remind me'
    );
    if (choice === 'Don\'t remind me') {
      await context.globalState.update(STATE_KEY_DISMISSED, true);
    }
    return false;
  }

  // Windows: offer auto-modification
  const choice = await vscode.window.showInformationMessage(
    `Xept needs to modify your ${ideName} shortcuts to enable auto-accept.\n` +
    `This will add "${CDP_FLAG}" to your desktop/start menu/taskbar shortcuts.\n` +
    `You need to restart ${ideName} after modification.`,
    { modal: true },
    'Auto Configure',
    'Manual Setup',
    'Remind Me Later'
  );

  if (choice === 'Auto Configure') {
    return await modifyWindowsShortcuts(context, log);
  } else if (choice === 'Manual Setup') {
    vscode.env.openExternal(
      vscode.Uri.parse('https://github.com/xept/auto-accept#setup')
    );
  } else if (choice === 'Remind Me Later') {
    // Do nothing, will prompt next time
  }
  return false;
}

/**
 * Restore command: undo shortcut modifications.
 */
export async function restoreShortcuts(
  context: vscode.ExtensionContext,
  log: (msg: string) => void
): Promise<void> {
  const backups = context.globalState.get<Record<string, string>>(STATE_KEY_BACKUP);
  if (!backups || Object.keys(backups).length === 0) {
    vscode.window.showInformationMessage('Xept: No shortcut backups found.');
    return;
  }

  const entries = Object.entries(backups);
  const restoreScript = buildRestoreScript(entries);
  try {
    const result = runPowerShell(restoreScript);
    log(`[Launcher] Restore output:\n${result}`);
    await context.globalState.update(STATE_KEY_BACKUP, undefined);
    const ideName = getIdeName();
    vscode.window.showInformationMessage(
      `✅ Restored ${entries.length} shortcut(s). Restart ${ideName} to apply.`
    );
  } catch (e: any) {
    log(`[Launcher] Restore error: ${e.message}`);
    vscode.window.showErrorMessage('Restore failed. Please check your shortcuts manually.');
  }
}

// ─── Windows shortcut modification ───

async function modifyWindowsShortcuts(
  context: vscode.ExtensionContext,
  log: (msg: string) => void
): Promise<boolean> {
  const ideName = getIdeName();
  log(`[Launcher] Starting Windows shortcut modification for ${ideName}...`);

  // Find a free port (auto-detect if default is occupied)
  const port = await findFreePort(CDP_PORT);
  if (port !== CDP_PORT) {
    log(`[Launcher] Port ${CDP_PORT} occupied, using ${port} instead`);
  }

  const script = buildModifyScript(ideName, port);

  try {
    const result = runPowerShell(script);
    log(`[Launcher] PowerShell output:\n${result}`);

    if (result.includes('RESULT: MODIFIED')) {
      // Parse and save backups
      const backupMap = parseBackups(result);
      if (Object.keys(backupMap).length > 0) {
        await context.globalState.update(STATE_KEY_BACKUP, backupMap);
        log(`[Launcher] Backed up ${Object.keys(backupMap).length} shortcuts`);
      }

      const count = (result.match(/MODIFIED_ITEM:/g) || []).length;
      await vscode.window.showInformationMessage(
        `✅ Modified ${count} shortcut(s).\nPlease close and restart ${ideName} for Xept to work.`,
        { modal: true },
        'Got it'
      );
      return true;
    }

    if (result.includes('RESULT: READY')) {
      log('[Launcher] Shortcuts already configured');
      vscode.window.showInformationMessage(
        `Shortcuts already configured. Restart ${ideName} for Xept to take effect.`
      );
      return true;
    }

    // NOT_FOUND
    vscode.window.showWarningMessage(
      `No ${ideName} shortcuts found. Please manually add ${CDP_FLAG} to your launch command.`,
      'View Help'
    ).then(sel => {
      if (sel === 'View Help') {
        vscode.env.openExternal(
          vscode.Uri.parse('https://github.com/xept/auto-accept#setup')
        );
      }
    });
    return false;
  } catch (e: any) {
    log(`[Launcher] PowerShell error: ${e.message}`);
    vscode.window.showErrorMessage(
      `Auto-configure failed: ${e.message}. Please manually add ${CDP_FLAG} to your launch command.`
    );
    return false;
  }
}

function buildModifyScript(ideName: string, port: number): string {
  return `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = "Continue"
$WshShell = New-Object -ComObject WScript.Shell

$TargetFolders = @(
  [Environment]::GetFolderPath("Desktop"),
  [Environment]::GetFolderPath("Programs"),
  [Environment]::GetFolderPath("CommonPrograms"),
  [Environment]::GetFolderPath("StartMenu"),
  [System.IO.Path]::Combine($env:APPDATA, "Microsoft", "Internet Explorer", "Quick Launch", "User Pinned", "TaskBar"),
  [System.IO.Path]::Combine($env:USERPROFILE, "Desktop")
)

$TargetExeName = "${ideName}.exe"
$PortFlag = "--remote-debugging-port=${port}"
$modifiedList = @()
$readyList = @()

foreach ($folder in $TargetFolders) {
  if (-not (Test-Path $folder)) { continue }
  $files = Get-ChildItem -Path $folder -Filter "*.lnk" -Recurse -ErrorAction SilentlyContinue
  foreach ($file in $files) {
    try {
      $shortcut = $WshShell.CreateShortcut($file.FullName)
      if ($shortcut.TargetPath -notlike "*$TargetExeName") { continue }

      $args = $shortcut.Arguments
      if ($args -like "*--remote-debugging-port=${port}*") {
        $readyList += "$($file.FullName)|$args"
        continue
      }

      # Backup original args
      Write-Output "BACKUP: $($file.FullName)|$args"

      # Remove existing port flag if different port
      if ($args -match "--remote-debugging-port=\\d+") {
        $shortcut.Arguments = $args -replace "--remote-debugging-port=\\d+", $PortFlag
      } else {
        $shortcut.Arguments = "$PortFlag $args".Trim()
      }

      $shortcut.Save()
      $modifiedList += $file.FullName
      Write-Output "MODIFIED_ITEM: $($file.Name)"
    } catch {}
  }
}

if ($modifiedList.Count -gt 0) {
  Write-Output "RESULT: MODIFIED"
} elseif ($readyList.Count -gt 0) {
  Write-Output "RESULT: READY"
} else {
  Write-Output "RESULT: NOT_FOUND"
}
`;
}

function buildRestoreScript(entries: [string, string][]): string {
  const lines = [
    '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
    '$WshShell = New-Object -ComObject WScript.Shell',
  ];
  for (const [filePath, originalArgs] of entries) {
    const safe = filePath.replace(/'/g, "''");
    const safeArgs = originalArgs.replace(/'/g, "''");
    lines.push(`try {`);
    lines.push(`  $s = $WshShell.CreateShortcut('${safe}')`);
    lines.push(`  $s.Arguments = '${safeArgs}'`);
    lines.push(`  $s.Save()`);
    lines.push(`  Write-Output "RESTORED: ${path.basename(filePath)}"`);
    lines.push(`} catch { Write-Output "FAILED: ${path.basename(filePath)}" }`);
  }
  return lines.join('\n');
}

function parseBackups(output: string): Record<string, string> {
  const map: Record<string, string> = {};
  for (const line of output.split('\n')) {
    if (line.startsWith('BACKUP: ')) {
      const rest = line.substring(8).trim();
      const idx = rest.indexOf('|');
      if (idx > 0) {
        map[rest.substring(0, idx)] = rest.substring(idx + 1);
      }
    }
  }
  return map;
}

function runPowerShell(script: string): string {
  const tmpFile = path.join(os.tmpdir(), `xept_launcher_${Date.now()}.ps1`);
  try {
    fs.writeFileSync(tmpFile, script, 'utf8');
    return execSync(
      `powershell -ExecutionPolicy Bypass -File "${tmpFile}"`,
      { encoding: 'utf8', timeout: 15000 }
    );
  } finally {
    try { fs.unlinkSync(tmpFile); } catch {}
  }
}
