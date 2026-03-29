import * as os from 'os';

export interface SystemInfo {
  ramGb:     number;
  cpuCores:  number;
  cpuModel:  string;
  platform:  string;
  arch:      string;
  hasGpu:    boolean;
  vramGb:    number;
}

export interface ModelRecommendation {
  id:          string;
  name:        string;
  ramRequired: number;
  vramRequired:number;
  speed:       'very-fast' | 'fast' | 'medium' | 'slow';
  quality:     'basic' | 'good' | 'great' | 'excellent';
  bestFor:     string;
  badge:       'recommended' | 'medium' | 'powerful-pc';
  pullCmd:     string;
}

export const ALL_MODELS: ModelRecommendation[] = [
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

export function detectSystem(): SystemInfo {
  const totalRamBytes = os.totalmem();
  const ramGb         = Math.round(totalRamBytes / (1024 ** 3));
  const cpuCores      = os.cpus().length;
  const cpuModel      = os.cpus()[0]?.model ?? 'Unknown';
  const platform      = os.platform(); // win32 | darwin | linux
  const arch          = os.arch();

  return {
    ramGb,
    cpuCores,
    cpuModel,
    platform,
    arch,
    hasGpu:  false,  // GPU detection requires native addon — future feature
    vramGb:  0,
  };
}

export function getRecommendedModels(sys: SystemInfo): ModelRecommendation[] {
  return ALL_MODELS.map(m => ({
    ...m,
    badge: m.ramRequired <= sys.ramGb
      ? (m.ramRequired <= 6 ? 'recommended' : 'medium')
      : 'powerful-pc'
  })) as ModelRecommendation[];
}
