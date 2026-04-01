import * as vscode from 'vscode';

export function registerCommands(
  context: vscode.ExtensionContext,
  toggleCallback: () => void
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('xept.toggle', toggleCallback)
  );
}
