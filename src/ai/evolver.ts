/**
 * Multi-provider AI Soul Evolution
 * 
 * Supports Anthropic, OpenAI, Google (Gemini), Cohere, DeepSeek, Qwen, GLM
 */

import Anthropic from '@anthropic-ai/sdk';
import type { PostingRecord } from '../config/types.js';
import { 
  getProviderConfig,
  type AIProvider,
  PROVIDER_NAMES,
  detectProvider,
} from './providers.js';

function getClient(provider: AIProvider): SimpleAIClient {
  const config = getProviderConfig();
  if (!config) {
    throw new Error(`No API provider configured for ${PROVIDER_NAMES[provider]}`);
  }

  switch (provider) {
    case 'anthropic':
      return new AnthropicAIClient(config.apiKey, config);

    default:
      throw new Error(`Provider ${PROVIDER_NAMES[provider]} not yet implemented`);
  }
}

interface SimpleAIClient {
  generate(messages: any[]): Promise<{ content: any }>;
}

class AnthropicAIClient implements SimpleAIClient {
  private apiKey: string;
  private model?: string;

  constructor(apiKey: string, config?: { model?: string }) {
    this.apiKey = apiKey;
    this.model = config?.model;
  }

  async generate(messages: any[]): Promise<{ content: any }> {
    const client = new Anthropic({ apiKey: this.apiKey });

    const message = await client.messages.create({
      model: this.model || 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: messages[0]?.content || '',
      messages: messages.slice(1).map(m => ({
        role: m.role,
        content: m.content,
      })),
    });

    return message;
  }
}

export async function evolveSoul(
  currentSoul: string,
  editDiffs: PostingRecord['editDiff'][],
  history: PostingRecord[]
): Promise<string> {
  const providerConfig = getProviderConfig();
  if (!providerConfig) {
    throw new Error('No AI provider configured. Set one of: ' + Object.values(PROVIDER_NAMES).join(', '));
  }

  const client = getClient(detectProvider()!);

  const diffsSection = editDiffs.length > 0
    ? editDiffs
        .map((d, i) => `Edit ${i + 1}:\n  AI wrote: "${d!.aiGenerated}"\n  User changed to: "${d!.userFinal}"`)
        .join('\n')
    : '(no edits recorded yet)';

  const statsSection = [
    `Total drafts: ${history.length}`,
    `Edited: ${history.filter((r) => r.wasEdited).length}`,
    `Variant 1 picks: ${history.filter((r) => r.variantChosen === 1).length}`,
    `Variant 2 picks: ${history.filter((r) => r.variantChosen === 2).length}`,
  ].join('\n');

  const messages: any[] = [
    {
      role: 'user',
      content: [
        'Current soul.md content:',
        currentSoul,
        '',
        'Recent posting history (last 10 drafts):',
        history
          .slice(-10)
          .map(r => `- Draft ${r.draftId}: ${r.commitSummary} (${r.platform}, v${r.variantChosen}, ${r.postedSuccessfully ? '✓' : '✗'})`)
          .join('\n'),
        '',
        'Edit differences (last 10):',
        diffsSection,
        '',
        'Statistics:',
        statsSection,
        '',
        'Analyze the posting patterns and evolve the soul.md. Focus on:',
        '- Project Description: deepen based on what\'s been shipped',
        '- Tone: refine based on actual posts (check edit diffs)',
        '- Recurring themes: what topics keep appearing?',
        '- Voice consistency: is the style consistent with recent edits?',
        '- Only touch sections that clearly need updating.',
        'Preserve the overall structure. Add a "<!-- Last evolved: YYYY-MM-DD -->" comment at the top.',
        'Return the complete evolved file.',
      ].join('\n'),
    },
  ];

  const message = await client.generate(messages);

  const content = message.content;

  return content;
}

export async function evolveProjectDoc(
  currentDoc: string,
  gitLog: string,
  packageJson: string | null,
  history: PostingRecord[]
): Promise<string> {
  const providerConfig = getProviderConfig();
  if (!providerConfig) {
    throw new Error('No AI provider configured. Set one of: ' + Object.values(PROVIDER_NAMES).join(', '));
  }

  const client = getClient(detectProvider()!);

  const messages: any[] = [
    {
      role: 'user',
      content: [
        'Current BUILD_IN_PUBLIC.md:',
        currentDoc,
        '',
        'Recent git log (last 50 commits):',
        gitLog,
        '',
        packageJson ? `package.json:\n${packageJson}` : '(package.json not found)',
        '',
        'Recent posting history (last 10 drafts):',
        history
          .slice(-10)
          .map(r => `- Draft ${r.draftId}: ${r.commitSummary} (${r.platform}, v${r.variantChosen}, ${r.postedSuccessfully ? '✓' : '✗'})`)
          .join('\n'),
        '',
        'Analyze the project and suggest evolution of BUILD_IN_PUBLIC.md. Focus on:',
        '- Project Description: deepen based on what\'s been shipped',
        '- Tech Stack: detect new/removed deps from package.json',
        '- Milestones: check off completed items, suggest new ones based on recent direction',
        '- Only touch Target Audience and Post Style if clearly outdated.',
        'Preserve the overall structure. Add a "<!-- Last evolved: YYYY-MM-DD -->" comment at the top.',
        'Return the complete updated file.',
      ].join('\n'),
    },
  ];

  const message = await client.generate(messages);

  return message.content;
}
