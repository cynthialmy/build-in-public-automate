import { password, select } from '@inquirer/prompts';
import { colors } from '../core/branding.js';
import { upsertEnvKey } from '../config/env-file.js';
import {
  type AIProvider,
  PROVIDER_ENV_KEYS,
  PROVIDER_NAMES,
} from '../ai/providers.js';

/** Where to get an API key (docs / consoles). */
const PROVIDER_SETUP_URLS: Record<AIProvider, string> = {
  anthropic: 'https://console.anthropic.com/settings/keys',
  openai: 'https://platform.openai.com/api-keys',
  google: 'https://aistudio.google.com/apikey',
  cohere: 'https://dashboard.cohere.com/api-keys',
  deepseek: 'https://platform.deepseek.com/',
  qwen: 'https://help.aliyun.com/zh/dashscope/',
  glm: 'https://open.bigmodel.cn/usercenter/proj-mgmt/apikeys',
};

const ALL_AI_PROVIDERS = Object.keys(PROVIDER_ENV_KEYS) as AIProvider[];

export type AuthAiOptions = {
  list?: boolean;
  /** Provider id, e.g. `glm` (from `bip auth ai glm`) */
  provider?: string;
};

function maskKey(value: string): string {
  if (!value) return '(empty)';
  if (value.length <= 6) return '******';
  return `${value.slice(0, 3)}…${value.slice(-4)}`;
}

function listAiStatus(): void {
  console.log('\nAI / LLM API keys (environment):\n');
  for (const p of ALL_AI_PROVIDERS) {
    const envKey = PROVIDER_ENV_KEYS[p];
    const v = process.env[envKey];
    const mark = v
      ? `${colors.success('✓ set')} ${colors.dim(`(${maskKey(v)})`)}`
      : colors.error('✗ not set');
    console.log(`  ${PROVIDER_NAMES[p].padEnd(22)} ${envKey.padEnd(22)} ${mark}`);
  }
  console.log(colors.dim('\n  Keys are read from the environment (e.g. `.env` in the project root).'));
  console.log(colors.dim('  Run `bip auth ai` to save a key into `.env`.\n'));
}

function parseProviderArg(raw: string | undefined): AIProvider | null {
  if (!raw?.trim()) return null;
  const id = raw.trim().toLowerCase();
  if (id in PROVIDER_ENV_KEYS) {
    return id as AIProvider;
  }
  console.error(
    `Unknown AI provider "${raw}". Valid: ${ALL_AI_PROVIDERS.join(', ')}`
  );
  process.exit(1);
}

export async function authAiCommand(options: AuthAiOptions = {}): Promise<void> {
  if (options.list) {
    listAiStatus();
    return;
  }

  let provider = parseProviderArg(options.provider);

  if (!provider) {
    provider = await select<AIProvider>({
      message: 'Which AI provider do you want to configure?',
      choices: ALL_AI_PROVIDERS.map((p) => ({
        name: `${PROVIDER_NAMES[p]}  (${PROVIDER_ENV_KEYS[p]})`,
        value: p,
      })),
    });
  }

  const envKey = PROVIDER_ENV_KEYS[provider];
  const docUrl = PROVIDER_SETUP_URLS[provider];

  console.log(`\n${PROVIDER_NAMES[provider]}`);
  console.log(colors.dim(`Environment variable: ${envKey}`));
  console.log(colors.dim(`Get a key: ${docUrl}\n`));

  const current = process.env[envKey];
  if (current) {
    console.log(colors.dim(`Current value: ${maskKey(current)} (will be replaced)\n`));
  }

  const apiKey = await password({
    message: `Paste ${envKey}:`,
    mask: '*',
  });

  if (!apiKey?.trim()) {
    console.error(colors.error('Empty key — aborted.'));
    process.exit(1);
  }

  const cwd = process.cwd();
  upsertEnvKey(cwd, envKey, apiKey.trim());
  process.env[envKey] = apiKey.trim();

  console.log(
    `\n${colors.success('✓')} Saved ${envKey} to ${colors.bold('.env')} in this project.`
  );
  console.log(
    colors.dim('  Run `bip draft` in the same directory so `.env` is loaded.')
  );
}
