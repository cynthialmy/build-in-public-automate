import { select, confirm } from '@inquirer/prompts';
import {
  type AIProvider,
  PROVIDER_ENV_KEYS,
  PROVIDER_NAMES,
  listAvailableProviders,
} from './providers.js';
import { readConfig, updateConfig } from '../config/settings.js';

export type ResolveAiProviderOptions = {
  /** Non-interactive: e.g. `--provider glm` */
  cliProvider?: string;
};

/**
 * Pick which AI provider to use for this run when multiple API keys exist.
 * Honors `BIP_AI_PROVIDER`, then `--provider`, then saved `config.aiProvider`, then prompts.
 */
export async function resolveAiProviderForSession(
  options: ResolveAiProviderOptions = {}
): Promise<AIProvider | null> {
  const available = listAvailableProviders().sort((a, b) =>
    PROVIDER_NAMES[a].localeCompare(PROVIDER_NAMES[b])
  );
  if (available.length === 0) {
    return null;
  }

  if (options.cliProvider?.trim()) {
    const raw = options.cliProvider.trim().toLowerCase();
    if (!(raw in PROVIDER_ENV_KEYS)) {
      console.error(
        `Unknown AI provider "${options.cliProvider}". Valid: ${Object.keys(PROVIDER_ENV_KEYS).join(', ')}`
      );
      process.exit(1);
    }
    const id = raw as AIProvider;
    if (!available.includes(id)) {
      console.error(
        `Provider "${id}" has no API key in the environment (${PROVIDER_ENV_KEYS[id]}).`
      );
      process.exit(1);
    }
    return id;
  }

  const forcedEnv = process.env.BIP_AI_PROVIDER?.toLowerCase() as AIProvider | undefined;
  if (
    forcedEnv &&
    forcedEnv in PROVIDER_ENV_KEYS &&
    available.includes(forcedEnv)
  ) {
    return forcedEnv;
  }

  if (available.length === 1) {
    return available[0]!;
  }

  return promptAiProviderChoice(available);
}

async function promptAiProviderChoice(
  available: AIProvider[]
): Promise<AIProvider> {
  const config = readConfig();
  const saved =
    config.aiProvider && available.includes(config.aiProvider as AIProvider)
      ? (config.aiProvider as AIProvider)
      : undefined;

  console.log();
  const choice = await select<AIProvider>({
    message: saved
      ? `当前项目默认使用「${PROVIDER_NAMES[saved]}」。请选择本次要使用的 AI 提供方：`
      : '检测到多个 AI API key，请选择本次要使用的提供方：',
    choices: available.map((p) => ({
      name:
        p === saved
          ? `${PROVIDER_NAMES[p]}（当前默认）`
          : PROVIDER_NAMES[p],
      value: p,
    })),
    default: saved ?? available[0],
  });

  const shouldSave = await confirm({
    message: '将本次选择保存为此项目的默认？',
    default: true,
  });

  if (shouldSave) {
    updateConfig({ aiProvider: choice });
  }

  return choice;
}
