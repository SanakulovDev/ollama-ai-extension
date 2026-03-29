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
exports.ALL_MODELS = void 0;
exports.detectSystem = detectSystem;
exports.getRecommendedModels = getRecommendedModels;
const os = __importStar(require("os"));
exports.ALL_MODELS = [
    {
        id: 'qwen2.5:3b',
        name: 'Qwen 2.5 3B',
        ramRequired: 4,
        vramRequired: 0,
        speed: 'very-fast',
        quality: 'good',
        bestFor: 'Code writing, chat, fast responses',
        badge: 'recommended',
        pullCmd: 'ollama pull qwen2.5:3b'
    },
    {
        id: 'llama3.2:3b',
        name: 'Llama 3.2 3B',
        ramRequired: 4,
        vramRequired: 0,
        speed: 'fast',
        quality: 'good',
        bestFor: 'General tasks, English language',
        badge: 'recommended',
        pullCmd: 'ollama pull llama3.2:3b'
    },
    {
        id: 'deepseek-coder:6.7b',
        name: 'DeepSeek Coder 6.7B',
        ramRequired: 8,
        vramRequired: 0,
        speed: 'medium',
        quality: 'great',
        bestFor: 'Code only — debug, refactor',
        badge: 'medium',
        pullCmd: 'ollama pull deepseek-coder:6.7b'
    },
    {
        id: 'mistral:7b',
        name: 'Mistral 7B',
        ramRequired: 10,
        vramRequired: 0,
        speed: 'medium',
        quality: 'great',
        bestFor: 'Writing, analysis, multi-purpose',
        badge: 'medium',
        pullCmd: 'ollama pull mistral:7b'
    },
    {
        id: 'qwen2.5:14b',
        name: 'Qwen 2.5 14B',
        ramRequired: 16,
        vramRequired: 0,
        speed: 'medium',
        quality: 'excellent',
        bestFor: 'Complex code, architecture',
        badge: 'medium',
        pullCmd: 'ollama pull qwen2.5:14b'
    },
    {
        id: 'llama3.1:70b',
        name: 'Llama 3.1 70B',
        ramRequired: 48,
        vramRequired: 40,
        speed: 'slow',
        quality: 'excellent',
        bestFor: 'Most complex tasks',
        badge: 'powerful-pc',
        pullCmd: 'ollama pull llama3.1:70b'
    },
];
function detectSystem() {
    const totalRamBytes = os.totalmem();
    const ramGb = Math.round(totalRamBytes / (1024 ** 3));
    const cpuCores = os.cpus().length;
    const cpuModel = os.cpus()[0]?.model ?? 'Unknown';
    const platform = os.platform(); // win32 | darwin | linux
    const arch = os.arch();
    return {
        ramGb,
        cpuCores,
        cpuModel,
        platform,
        arch,
        hasGpu: false, // GPU detection requires native addon — future feature
        vramGb: 0,
    };
}
function getRecommendedModels(sys) {
    return exports.ALL_MODELS.map(m => ({
        ...m,
        badge: m.ramRequired <= sys.ramGb
            ? (m.ramRequired <= 6 ? 'recommended' : 'medium')
            : 'powerful-pc'
    }));
}
