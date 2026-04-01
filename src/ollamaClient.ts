import * as https from 'https';
import * as http  from 'http';

export interface OllamaMessage {
  role:    'user' | 'assistant' | 'system';
  content: string;
}

export interface OllamaStreamChunk {
  model:    string;
  response: string;
  done:     boolean;
}

export interface OllamaRequestOptions {
  temperature?: number;
}

export class OllamaClient {
  private host: string;

  constructor(host = 'http://localhost:11434') {
    this.host = host.replace(/\/$/, '');
  }

  /** Check if Ollama is running */
  async isRunning(): Promise<boolean> {
    try {
      const res = await this.fetchJson('/api/tags', 'GET');
      return Array.isArray(res?.models);
    } catch {
      return false;
    }
  }

  /** List of installed models */
  async listModels(): Promise<string[]> {
    try {
      const res = await this.fetchJson('/api/tags', 'GET');
      return (res?.models ?? []).map((m: {name:string}) => m.name);
    } catch {
      return [];
    }
  }

  /** Check if model is installed */
  async isModelInstalled(modelId: string): Promise<boolean> {
    const models = await this.listModels();
    return models.some(m => m.startsWith(modelId.split(':')[0]));
  }

  /**
   * Streaming generate — sends each token to onChunk
   * Stream ends when Promise resolves
   */
  async generateStream(
    model:   string,
    prompt:  string,
    onChunk: (text: string) => void,
    signal?: AbortSignal,
    options: OllamaRequestOptions = {}
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const body = JSON.stringify({
        model,
        prompt,
        stream: true,
        options: { temperature: options.temperature ?? 0.3 }
      });

      const url  = new URL(this.host + '/api/generate');
      const lib  = url.protocol === 'https:' ? https : http;

      const req = lib.request(
        { hostname: url.hostname, port: url.port || (url.protocol === 'https:' ? 443 : 80),
          path: url.pathname, method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
        },
        res => {
          let buf = '';
          res.on('data', chunk => {
            buf += chunk.toString();
            const lines = buf.split('\n');
            buf = lines.pop() ?? '';
            for (const line of lines) {
              if (!line.trim()) { continue; }
              try {
                const json: OllamaStreamChunk = JSON.parse(line);
                if (json.response) { onChunk(json.response); }
                if (json.done)     { resolve(); }
              } catch { /* ignore malformed */ }
            }
          });
          res.on('end',   resolve);
          res.on('error', reject);
        }
      );

      req.on('error', reject);

      if (signal) {
        signal.addEventListener('abort', () => {
          req.destroy();
          resolve();
        });
      }

      req.write(body);
      req.end();
    });
  }

  /** Chat with history */
  async chatStream(
    model:    string,
    messages: OllamaMessage[],
    onChunk:  (text: string) => void,
    signal?:  AbortSignal,
    options:  OllamaRequestOptions = {}
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const body = JSON.stringify({
        model,
        messages,
        stream: true,
        options: { temperature: options.temperature ?? 0.3 }
      });
      const url  = new URL(this.host + '/api/chat');
      const lib  = url.protocol === 'https:' ? https : http;

      const req = lib.request(
        { hostname: url.hostname, port: url.port || (url.protocol === 'https:' ? 443 : 80),
          path: url.pathname, method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
        },
        res => {
          let buf = '';
          res.on('data', chunk => {
            buf += chunk.toString();
            const lines = buf.split('\n');
            buf = lines.pop() ?? '';
            for (const line of lines) {
              if (!line.trim()) { continue; }
              try {
                const json = JSON.parse(line);
                if (json.message?.content) { onChunk(json.message.content); }
                if (json.done)             { resolve(); }
              } catch { /* ignore */ }
            }
          });
          res.on('end',   resolve);
          res.on('error', reject);
        }
      );

      req.on('error', reject);
      if (signal) { signal.addEventListener('abort', () => { req.destroy(); resolve(); }); }
      req.write(body);
      req.end();
    });
  }

  /** Delete an installed model */
  async deleteModel(modelId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const url  = new URL(this.host + '/api/delete');
      const lib  = url.protocol === 'https:' ? https : http;
      const data = JSON.stringify({ name: modelId });

      const req = lib.request(
        { hostname: url.hostname, port: url.port || (url.protocol === 'https:' ? 443 : 80),
          path: url.pathname, method: 'DELETE',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
        },
        res => {
          res.on('data', () => {});
          res.on('end',  resolve);
          res.on('error', reject);
        }
      );
      req.on('error', reject);
      req.write(data);
      req.end();
    });
  }

  private fetchJson(path: string, method: 'GET' | 'POST', body?: object): Promise<any> {
    return new Promise((resolve, reject) => {
      const url  = new URL(this.host + path);
      const lib  = url.protocol === 'https:' ? https : http;
      const data = body ? JSON.stringify(body) : undefined;

      const req = lib.request(
        { hostname: url.hostname, port: url.port || (url.protocol === 'https:' ? 443 : 80),
          path: url.pathname, method,
          headers: { 'Content-Type': 'application/json', ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}) }
        },
        res => {
          let buf = '';
          res.on('data', c => { buf += c; });
          res.on('end',  () => { try { resolve(JSON.parse(buf)); } catch { resolve(null); } });
          res.on('error', reject);
        }
      );
      req.on('error', reject);
      if (data) { req.write(data); }
      req.end();
    });
  }
}
