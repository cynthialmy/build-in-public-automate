/**
 * AI Provider Types and Configuration
 * 
 * Supports multiple AI API providers with a unified interface
 */

export type AIProvider = 
  | 'anthropic'
  | 'openai'
  | 'google'
  | 'cohere'
  | 'deepseek'
  | 'qwen'
  | 'glm';

export interface AIProviderConfig {
  apiKey: string;
  baseURL?: string;
  model?: string;
  maxTokens?: number;
}

export const PROVIDER_NAMES: Record<AIProvider, string> = {
  anthropic: 'Anthropic (Claude)',
  openai: 'OpenAI (GPT)',
  google: 'Google (Gemini)',
  cohere: 'Cohere',
  deepseek: 'DeepSeek',
  qwen: 'Qwen (Alibaba)',
  glm: 'GLM (Zhipu AI)',
};

export const PROVIDER_ENV_KEYS: Record<AIProvider, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  google: 'GOOGLE_API_KEY',
  cohere: 'COHERE_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
  qwen: 'QWEN_API_KEY',
  glm: 'GLM_API_KEY',
};

export const PROVIDER_DEFAULT_MODELS: Record<AIProvider, string> = {
  anthropic: 'claude-sonnet-4-6',
  openai: 'gpt-4o',
  google: 'gemini-2.0-flash',
  cohere: 'command-r-plus-08-2024',
  deepseek: 'deepseek-chat',
  qwen: 'qwen2.5-72b-chat',
  glm: 'glm-4-plus',
};

export const PROVIDER_MAX_TOKENS: Record<AIProvider, number> = {
  anthropic: 4096,
  openai: 4096,
  google: 8192,
  cohere: 4096,
  deepseek: 8192,
  qwen: 8192,
  glm: 4096,
};

/** Optional: force provider when multiple API keys exist (e.g. BIP_AI_PROVIDER=glm). */
export function detectProvider(): AIProvider | null {
  const forced = process.env.BIP_AI_PROVIDER?.toLowerCase() as AIProvider | undefined;
  if (
    forced &&
    forced in PROVIDER_ENV_KEYS &&
    process.env[PROVIDER_ENV_KEYS[forced as AIProvider]]
  ) {
    return forced as AIProvider;
  }

  const keys = Object.entries(PROVIDER_ENV_KEYS);
  for (const [provider, envKey] of keys) {
    if (process.env[envKey]) {
      return provider as AIProvider;
    }
  }
  return null;
}

export function getProviderConfigFor(provider: AIProvider): AIProviderConfig | null {
  const envKey = PROVIDER_ENV_KEYS[provider];
  const apiKey = process.env[envKey];
  if (!apiKey) {
    return null;
  }

  return {
    apiKey,
    model: PROVIDER_DEFAULT_MODELS[provider],
    maxTokens: PROVIDER_MAX_TOKENS[provider],
  };
}

export function getProviderConfig(): AIProviderConfig | null {
  const provider = detectProvider();
  if (!provider) {
    return null;
  }
  return getProviderConfigFor(provider);
}

export function listAvailableProviders(): AIProvider[] {
  const available: AIProvider[] = [];
  for (const [provider, envKey] of Object.entries(PROVIDER_ENV_KEYS)) {
    if (process.env[envKey]) {
      available.push(provider as AIProvider);
    }
  }
  return available;
}

export function getActiveProvider(): AIProvider | null {
  return detectProvider();
}

export function listAvailableProviderNames(): string[] {
  return listAvailableProviders().map((p) => PROVIDER_NAMES[p]);
}
