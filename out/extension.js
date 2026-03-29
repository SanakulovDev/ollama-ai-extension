"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const ollamaClient_1 = require("./ollamaClient");
const onboardingPanel_1 = require("./onboardingPanel");
const chatPanel_1 = require("./chatPanel");
const sessionManager_1 = require("./sessionManager");
async function activate(context) {
    const config = vscode.workspace.getConfiguration('ollamaAI');
    const host = config.get('host', 'http://localhost:11434');
    const client = new ollamaClient_1.OllamaClient(host);
    // Create session manager
    const sessionManager = new sessionManager_1.SessionManager(context);
    // Register sidebar chat provider
    const chatProvider = new chatPanel_1.ChatViewProvider(context, client, sessionManager);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider(chatPanel_1.ChatViewProvider.viewType, chatProvider));
    // Show onboarding on first launch
    const hasSetup = context.globalState.get('ollamaAI.setupDone', false);
    if (!hasSetup) {
        // Wait a moment for the window to be ready
        setTimeout(() => {
            onboardingPanel_1.OnboardingPanel.show(context, client);
        }, 1000);
        await context.globalState.update('ollamaAI.setupDone', true);
    }
    else {
        // Warn if Ollama is not running
        const running = await client.isRunning();
        if (!running) {
            const action = await vscode.window.showWarningMessage('Ollama server not found. Is Ollama running?', 'Setup', 'Close');
            if (action === 'Setup') {
                onboardingPanel_1.OnboardingPanel.show(context, client);
            }
        }
    }
    // Register commands
    context.subscriptions.push(vscode.commands.registerCommand('ollamaAI.setup', () => {
        onboardingPanel_1.OnboardingPanel.show(context, client);
    }), vscode.commands.registerCommand('ollamaAI.openChat', () => {
        vscode.commands.executeCommand('workbench.view.extension.ollama-sidebar');
    }), vscode.commands.registerCommand('ollamaAI.explainCode', () => {
        vscode.commands.executeCommand('workbench.view.extension.ollama-sidebar');
        chatProvider.sendWithContext('Explain this code:');
    }), vscode.commands.registerCommand('ollamaAI.fixCode', () => {
        vscode.commands.executeCommand('workbench.view.extension.ollama-sidebar');
        chatProvider.sendWithContext('Fix the errors in this code and explain:');
    }), vscode.commands.registerCommand('ollamaAI.generateDoc', () => {
        vscode.commands.executeCommand('workbench.view.extension.ollama-sidebar');
        chatProvider.sendWithContext('Write JSDoc/docstring documentation for this code:');
    }));
    console.log('Ollama AI Assistant activated!');
}
function deactivate() { }
