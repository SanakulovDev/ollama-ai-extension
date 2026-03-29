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
exports.OllamaClient = void 0;
const https = __importStar(require("https"));
const http = __importStar(require("http"));
class OllamaClient {
    constructor(host = 'http://localhost:11434') {
        this.host = host.replace(/\/$/, '');
    }
    /** Check if Ollama is running */
    async isRunning() {
        try {
            const res = await this.fetchJson('/api/tags', 'GET');
            return Array.isArray(res?.models);
        }
        catch {
            return false;
        }
    }
    /** List of installed models */
    async listModels() {
        try {
            const res = await this.fetchJson('/api/tags', 'GET');
            return (res?.models ?? []).map((m) => m.name);
        }
        catch {
            return [];
        }
    }
    /** Check if model is installed */
    async isModelInstalled(modelId) {
        const models = await this.listModels();
        return models.some(m => m.startsWith(modelId.split(':')[0]));
    }
    /**
     * Streaming generate — sends each token to onChunk
     * Stream ends when Promise resolves
     */
    async generateStream(model, prompt, onChunk, signal, options = {}) {
        return new Promise((resolve, reject) => {
            const body = JSON.stringify({
                model,
                prompt,
                stream: true,
                options: { temperature: options.temperature ?? 0.3 }
            });
            const url = new URL(this.host + '/api/generate');
            const lib = url.protocol === 'https:' ? https : http;
            const req = lib.request({ hostname: url.hostname, port: url.port || (url.protocol === 'https:' ? 443 : 80),
                path: url.pathname, method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
            }, res => {
                let buf = '';
                res.on('data', chunk => {
                    buf += chunk.toString();
                    const lines = buf.split('\n');
                    buf = lines.pop() ?? '';
                    for (const line of lines) {
                        if (!line.trim()) {
                            continue;
                        }
                        try {
                            const json = JSON.parse(line);
                            if (json.response) {
                                onChunk(json.response);
                            }
                            if (json.done) {
                                resolve();
                            }
                        }
                        catch { /* ignore malformed */ }
                    }
                });
                res.on('end', resolve);
                res.on('error', reject);
            });
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
    async chatStream(model, messages, onChunk, signal, options = {}) {
        return new Promise((resolve, reject) => {
            const body = JSON.stringify({
                model,
                messages,
                stream: true,
                options: { temperature: options.temperature ?? 0.3 }
            });
            const url = new URL(this.host + '/api/chat');
            const lib = url.protocol === 'https:' ? https : http;
            const req = lib.request({ hostname: url.hostname, port: url.port || (url.protocol === 'https:' ? 443 : 80),
                path: url.pathname, method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
            }, res => {
                let buf = '';
                res.on('data', chunk => {
                    buf += chunk.toString();
                    const lines = buf.split('\n');
                    buf = lines.pop() ?? '';
                    for (const line of lines) {
                        if (!line.trim()) {
                            continue;
                        }
                        try {
                            const json = JSON.parse(line);
                            if (json.message?.content) {
                                onChunk(json.message.content);
                            }
                            if (json.done) {
                                resolve();
                            }
                        }
                        catch { /* ignore */ }
                    }
                });
                res.on('end', resolve);
                res.on('error', reject);
            });
            req.on('error', reject);
            if (signal) {
                signal.addEventListener('abort', () => { req.destroy(); resolve(); });
            }
            req.write(body);
            req.end();
        });
    }
    fetchJson(path, method, body) {
        return new Promise((resolve, reject) => {
            const url = new URL(this.host + path);
            const lib = url.protocol === 'https:' ? https : http;
            const data = body ? JSON.stringify(body) : undefined;
            const req = lib.request({ hostname: url.hostname, port: url.port || (url.protocol === 'https:' ? 443 : 80),
                path: url.pathname, method,
                headers: { 'Content-Type': 'application/json', ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}) }
            }, res => {
                let buf = '';
                res.on('data', c => { buf += c; });
                res.on('end', () => { try {
                    resolve(JSON.parse(buf));
                }
                catch {
                    resolve(null);
                } });
                res.on('error', reject);
            });
            req.on('error', reject);
            if (data) {
                req.write(data);
            }
            req.end();
        });
    }
}
exports.OllamaClient = OllamaClient;
