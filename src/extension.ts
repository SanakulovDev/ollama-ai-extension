import * as vscode from 'vscode';
import { OllamaClient } from './ollamaClient';
import { OnboardingPanel } from './onboardingPanel';
import { ChatViewProvider } from './chatPanel';

export async function activate(context: vscode.ExtensionContext) {

  const config = vscode.workspace.getConfiguration('ollamaAI');
  const host   = config.get<string>('host', 'http://localhost:11434');
  const client = new OllamaClient(host);

  // Register sidebar chat provider
  const chatProvider = new ChatViewProvider(context, client);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(ChatViewProvider.viewType, chatProvider)
  );

  // Show onboarding on first launch
  const hasSetup = context.globalState.get<boolean>('ollamaAI.setupDone', false);
  if (!hasSetup) {
    // Wait a moment for the window to be ready
    setTimeout(() => {
      OnboardingPanel.show(context, client);
    }, 1000);
    await context.globalState.update('ollamaAI.setupDone', true);
  } else {
    // Warn if Ollama is not running
    const running = await client.isRunning();
    if (!running) {
      const action = await vscode.window.showWarningMessage(
        'Ollama AI: Server not found. Is Ollama running?',
        'Setup', 'Close'
      );
      if (action === 'Setup') {
        OnboardingPanel.show(context, client);
      }
    }
  }

  // Register commands
  context.subscriptions.push(

    vscode.commands.registerCommand('ollamaAI.setup', () => {
      OnboardingPanel.show(context, client);
    }),

    vscode.commands.registerCommand('ollamaAI.openChat', () => {
      vscode.commands.executeCommand('workbench.view.extension.ollama-sidebar');
    }),

    vscode.commands.registerCommand('ollamaAI.explainCode', () => {
      vscode.commands.executeCommand('workbench.view.extension.ollama-sidebar');
      chatProvider.sendWithContext('Explain this code:');
    }),

    vscode.commands.registerCommand('ollamaAI.fixCode', () => {
      vscode.commands.executeCommand('workbench.view.extension.ollama-sidebar');
      chatProvider.sendWithContext('Fix the errors in this code and explain:');
    }),

    vscode.commands.registerCommand('ollamaAI.generateDoc', () => {
      vscode.commands.executeCommand('workbench.view.extension.ollama-sidebar');
      chatProvider.sendWithContext('Write JSDoc/docstring documentation for this code:');
    }),
  );

  console.log('Ollama AI Assistant activated!');
}

export function deactivate() {}
