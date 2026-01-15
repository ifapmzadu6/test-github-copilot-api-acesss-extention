import * as vscode from 'vscode';
import { CopilotResponsesPanel } from './panel/copilotResponsesPanel.js';

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('copilotResponsesChat.open', () => {
      CopilotResponsesPanel.createOrShow();
    })
  );
}

export function deactivate(): void {}
