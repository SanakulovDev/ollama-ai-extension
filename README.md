# Ollama AI Assistant

**Your AI. Your machine. No cloud. No keys. No nonsense.**

An AI coding assistant that runs entirely on your own hardware — no internet connection required, no data ever leaves your machine. Powered by [Ollama](https://ollama.com).

---

## Install

**Step 1** — Get [Ollama](https://ollama.com/download) running on your machine.

**Step 2** — Install the extension:

```bash
code --install-extension ollama-ai-assistant-1.0.0.vsix
```

Or in VS Code: `Ctrl+Shift+P` → **Extensions: Install from VSIX...**

**Step 3** — Restart VS Code.

**Step 4** — Open the sidebar, follow the setup wizard, pick a model. Done.

---

## What it does

- Chats about your code with full file context — cursor position, open file, attached files
- **Code / Chat / Plan / Editor** skill modes — each with a different AI personality
- `@mention` any file in your workspace to pull it into context
- Streams responses token by token, just like the big cloud tools
- Recommends models based on your actual RAM — no guessing
- Zero dependencies. Zero cloud. Zero subscriptions.

---

## Models

Pick based on your RAM:

| Model | RAM | Best For |
|---|---|---|
| Qwen 2.5 3B | 4 GB | Fast everyday use |
| Llama 3.2 3B | 4 GB | General chat |
| DeepSeek Coder 6.7B | 8 GB | Code heavy work |
| Mistral 7B | 10 GB | Balanced |
| Qwen 2.5 14B | 16 GB | Complex tasks |
| Llama 3.1 70B | 48 GB | Maximum quality |

---

## License

MIT
