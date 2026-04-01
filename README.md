# Ollama AI Assistant

Local-first AI assistant for VS Code powered by [Ollama](https://ollama.com). Your prompts and code stay on your machine, the extension talks to a local Ollama server, and no cloud API keys are required.

## Why this project

- Runs fully on local hardware after model download
- Adds code-aware chat directly inside the VS Code sidebar
- Supports `Code`, `Chat`, `Plan`, and `Editor` modes
- Pulls in current editor context automatically
- Lets you attach files or mention workspace files with `@path/to/file`
- Streams responses token by token
- Can apply AI-generated file updates back into your workspace
- Recommends models based on detected RAM

## Requirements

- VS Code `1.85+`
- [Ollama](https://ollama.com/download) installed and running locally
- At least one Ollama model pulled, for example `qwen2.5:3b`

## Quick Start

1. Install Ollama and start it on your machine.
2. Pull a model:

```bash
ollama pull qwen2.5:3b
```

3. Install the extension from a VSIX:

```bash
code --install-extension ollama-ai-assistant-1.0.0.vsix
```

You can also use `Extensions: Install from VSIX...` from the Command Palette.

4. Restart VS Code if needed.
5. Run `Ollama: Open Setup Wizard`.
6. Select your model, then open the `Ollama AI` sidebar view.

## What You Get

### Chat With Code Context

The extension automatically includes the active file and cursor region in `Code` mode, so you can ask focused questions without manually pasting code every time.

### Multiple Work Modes

- `Code`: explain, debug, refactor, and generate code
- `Chat`: general discussion and Q&A
- `Plan`: architecture, implementation plans, and trade-offs
- `Editor`: documentation, wording, and text refinement

### File Attachments And Mentions

- Attach files from anywhere on disk
- Mention workspace files with `@src/file.ts`
- Search workspace files from the chat composer

### Session History

Chats are stored in VS Code global state, so you can switch between previous conversations without losing context.

### Apply Generated File Changes

When the assistant returns fenced blocks in the `file:relative/path.ext` format, the UI can write those changes directly into your workspace after validating the target paths.

## Commands

| Command | Description |
| --- | --- |
| `Ollama: Open Chat` | Opens the sidebar chat view |
| `Ollama: Open Setup Wizard` | Opens the first-run setup flow |
| `Ollama: Explain Code` | Sends the current selection for explanation |
| `Ollama: Fix Code` | Sends the current selection for debugging/fixing help |
| `Ollama: Write Documentation` | Generates docs for the current selection |

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `ollamaAI.host` | `http://localhost:11434` | Ollama server URL |
| `ollamaAI.model` | `qwen2.5:3b` | Active model |
| `ollamaAI.contextLines` | `150` | Number of lines around the cursor |
| `ollamaAI.temperature` | `0.3` | Sampling temperature |
| `ollamaAI.streamResponse` | `true` | Stream tokens as they arrive |

## Recommended Models

| Model | RAM | Best For |
| --- | --- | --- |
| `qwen2.5:3b` | 4 GB | Fast everyday coding help |
| `llama3.2:3b` | 4 GB | General chat and lightweight tasks |
| `deepseek-coder:6.7b` | 8 GB | Code-heavy work |
| `mistral:7b` | 10 GB | Balanced writing and analysis |
| `qwen2.5:14b` | 16 GB | More complex coding and planning |
| `llama3.1:70b` | 48 GB | Highest quality on powerful hardware |

## Development

Install dependencies and compile the extension:

```bash
npm install
npm run compile
```

Useful scripts:

```bash
npm run watch
npm run package
```

`npm run package` expects `vsce` to be available in your environment.

## Project Status

- `npm run compile` is currently working
- `npm test` is not configured yet
- `npm run lint` is not configured yet
- Runtime dependencies are intentionally kept at zero

## Troubleshooting

### Ollama Is Not Detected

- Confirm Ollama is running locally
- Check `ollama list` in a terminal
- Verify `ollamaAI.host` if your server is not using the default port

### No Models Appear In The Dropdown

- Pull a model first, for example `ollama pull qwen2.5:3b`
- Re-open the setup wizard or refresh the model list in the chat UI

## License

MIT
