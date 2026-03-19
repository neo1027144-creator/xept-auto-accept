import * as vscode from 'vscode';

export interface XeptConfig {
  cdpPort: number;
  blockedCommands: string[];
  allowedCommands: string[];
  customButtonTexts: string[];
  autoRun: boolean;
  autoAcceptFileEdits: boolean;
  autoAllow: boolean;
  autoRetryEnabled: boolean;
  acceptDelay: number;
}

const SECTION = 'xept';

export function readConfig(): XeptConfig {
  const cfg = vscode.workspace.getConfiguration(SECTION);
  return {
    cdpPort: cfg.get<number>('cdpPort', 9222),
    blockedCommands: cfg.get<string[]>('blockedCommands', []),
    allowedCommands: cfg.get<string[]>('allowedCommands', []),
    customButtonTexts: cfg.get<string[]>('customButtonTexts', []),
    autoRun: cfg.get<boolean>('autoRun', true),
    autoAcceptFileEdits: cfg.get<boolean>('autoAcceptFileEdits', true),
    autoAllow: cfg.get<boolean>('autoAllow', true),
    autoRetryEnabled: cfg.get<boolean>('autoRetryEnabled', true),
    acceptDelay: cfg.get<number>('acceptDelay', 2000),
  };
}

export function onConfigChange(
  callback: (config: XeptConfig) => void
): vscode.Disposable {
  return vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration(SECTION)) {
      callback(readConfig());
    }
  });
}
