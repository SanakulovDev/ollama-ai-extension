# Ollama AI Assistant

100% lokal, internet talab qilmaydi — VS Code / Cursor uchun AI assistant.

## Xususiyatlar

- Birinchi ishga tushganda **onboarding wizard** — Ollama va LLM o'rnatishga yo'naltiradi
- **Qurilma tahlili** — RAM, CPU asosida mos modellarni tavsiya qiladi
- **Cheksiz fayl konteksti** — Continue'dan farqli, fayl hajmiga cheklov yo'q
- **Smart context window** — kursor atrofidagi kodni avtomatik yuboradi
- **Streaming javob** — tokenlar real-vaqtda ko'rinadi
- **Oflayn** — hech qanday ma'lumot tashqariga chiqmaydi

## O'rnatish

```bash
git clone https://github.com/your-name/ollama-ai-assistant
cd ollama-ai-assistant
npm install
```

VS Code'da: `F5` → Extension Development Host

## Yig'ish (package)

```bash
npm install -g @vscode/vsce
vsce package
# ollama-ai-assistant-1.0.0.vsix fayl yaratiladi
```

O'rnatish:
```
code --install-extension ollama-ai-assistant-1.0.0.vsix
```

## Tavsiya etilgan modellar

| Model | RAM | Tezlik | Mos |
|-------|-----|--------|-----|
| Qwen 2.5 3B  | 4 GB  | Juda tez | Kod, chat |
| Llama 3.2 3B | 4 GB  | Tez | Umumiy |
| DeepSeek Coder 6.7B | 8 GB | O'rtacha | Faqat kod |
| Mistral 7B  | 10 GB | O'rtacha | Ko'p maqsad |
| Qwen 2.5 14B | 16 GB | O'rtacha | Murakkab vazifalar |
| Llama 3.1 70B | 48 GB | Sekin | Eng murakkab |

## Sozlamalar

```json
{
  "ollamaAI.host": "http://localhost:11434",
  "ollamaAI.model": "qwen2.5:3b",
  "ollamaAI.contextLines": 150,
  "ollamaAI.temperature": 0.3,
  "ollamaAI.streamResponse": true
}
```

## Litsenziya

MIT — barchaga ochiq
