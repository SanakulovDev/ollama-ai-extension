# Ollama AI Assistant

100% local, no internet required — AI assistant for VS Code / Cursor.

## Features

- **Onboarding wizard** on first launch — guides you through Ollama and LLM installation
- **Hardware analysis** — recommends suitable models based on RAM and CPU
- **Installed model switcher** — pick any locally available Ollama model directly from the chat UI
- **Workspace file mentions** — use `@path/to/file.ts` or the mention picker to add project files into context
- **Session list UI** — recent chats are visible as a dedicated list instead of a plain dropdown
- **Unlimited file context** — unlike Continue, no file size limits
- **Smart context window** — automatically sends code around the cursor
- **Streaming response** — tokens appear in real-time
- **Offline** — no data ever leaves your machine

## Installation

```bash
git clone https://github.com/your-name/ollama-ai-assistant
cd ollama-ai-assistant
npm install
```

In VS Code: `F5` → Extension Development Host

## Packaging

```bash
npm install -g @vscode/vsce
vsce package
# Creates ollama-ai-assistant-1.0.0.vsix file
```

Install:
```
code --install-extension ollama-ai-assistant-1.0.0.vsix
```

## Recommended Models

| Model | RAM | Speed | Best For |
|-------|-----|-------|----------|
| Qwen 2.5 3B  | 4 GB  | Very Fast | Code, chat |
| Llama 3.2 3B | 4 GB  | Fast | General |
| DeepSeek Coder 6.7B | 8 GB | Medium | Code only |
| Mistral 7B  | 10 GB | Medium | Multi-purpose |
| Qwen 2.5 14B | 16 GB | Medium | Complex tasks |
| Llama 3.1 70B | 48 GB | Slow | Most complex |

## Settings

```json
{
  "ollamaAI.host": "http://localhost:11434",
  "ollamaAI.model": "qwen2.5:3b",
  "ollamaAI.contextLines": 150,
  "ollamaAI.temperature": 0.3,
  "ollamaAI.streamResponse": true
}
```

## License

MIT — open for everyone
