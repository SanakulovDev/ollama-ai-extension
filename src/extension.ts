import * as vscode from 'vscode';
import { OllamaClient } from './ollamaClient';
import { OnboardingPanel } from './onboardingPanel';
import { ChatViewProvider } from './chatPanel';

export async function activate(context: vscode.ExtensionContext) {

  const config = vscode.workspace.getConfiguration('ollamaAI');
  const host   = config.get<string>('host', 'http://localhost:11434');
  const client = new OllamaClient(host);

  // Sidebar chat provider ro'yxatdan o'tkazish
  const chatProvider = new ChatViewProvider(context, client);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(ChatViewProvider.viewType, chatProvider)
  );

  // Birinchi marta ishga tushganda onboarding ko'rsatish
  const hasSetup = context.globalState.get<boolean>('ollamaAI.setupDone', false);
  if (!hasSetup) {
    // Bir oz kuting, window tayyor bo'lsin
    setTimeout(() => {
      OnboardingPanel.show(context, client);
    }, 1000);
    await context.globalState.update('ollamaAI.setupDone', true);
  } else {
    // Ollama ishlamayotgan bo'lsa ogohlantir
    const running = await client.isRunning();
    if (!running) {
      const action = await vscode.window.showWarningMessage(
        'Ollama AI: Server topilmadi. Ollama ishlaydimi?',
        'Sozlash', 'Yopish'
      );
      if (action === 'Sozlash') {
        OnboardingPanel.show(context, client);
      }
    }
  }

  // Buyruqlar ro'yxatdan o'tkazish
  context.subscriptions.push(

    vscode.commands.registerCommand('ollamaAI.setup', () => {
      OnboardingPanel.show(context, client);
    }),

    vscode.commands.registerCommand('ollamaAI.openChat', () => {
      vscode.commands.executeCommand('workbench.view.extension.ollama-sidebar');
    }),

    vscode.commands.registerCommand('ollamaAI.explainCode', () => {
      vscode.commands.executeCommand('workbench.view.extension.ollama-sidebar');
      chatProvider.sendWithContext('Bu kodni o\'zbek tilida tushuntir:');
    }),

    vscode.commands.registerCommand('ollamaAI.fixCode', () => {
      vscode.commands.executeCommand('workbench.view.extension.ollama-sidebar');
      chatProvider.sendWithContext('Bu koddagi xatolarni tuzat va tushuntir:');
    }),

    vscode.commands.registerCommand('ollamaAI.generateDoc', () => {
      vscode.commands.executeCommand('workbench.view.extension.ollama-sidebar');
      chatProvider.sendWithContext('Bu kod uchun JSDoc/docstring dokumentatsiya yoz:');
    }),
  );

  console.log('Ollama AI Assistant faol!');
}

export function deactivate() {}
