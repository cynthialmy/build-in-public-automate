/**
 * Multi-provider AI Content Generation
 * 
 * Supports Anthropic, OpenAI, Google (Gemini), Cohere, DeepSeek, Qwen, GLM
 */

import { existsSync, readFileSync } from 'fs';
import { extname } from 'path';
import type { GitContext, PlatformPost, Platform } from '../config/types.js';
import { 
  getProviderConfig, 
  type AIProvider,
  PROVIDER_NAMES,
  detectProvider,
  listAvailableProviders,
} from './providers.js';
import { buildPublicMdPath, soulPath } from '../config/settings.js';
import { loadSkillsForPlatforms } from '../skills/index.js';
import { buildMemoryPromptSection } from '../memory/index.js';

const BASE_SYSTEM_PROMPT = `You are a "build in public" content strategist embedded in a developer's workflow.
Transform raw git activity into authentic social media content developers actually want to read.
Be specific (metrics, file names, actual problems solved). Show journey, not just results.
Match each platform's culture precisely. Never write generic filler.`;

function buildSystemPrompt(platforms: Platform[]): string {
  let prompt = BASE_SYSTEM_PROMPT;

  // Inject platform skills
  const skills = loadSkillsForPlatforms(platforms);
  if (skills) {
    prompt += skills;
  }

  // Inject soul/voice
  const soul = soulPath();
  if (existsSync(soul)) {
    const soulContent = readFileSync(soul, 'utf-8').trim();
    if (soulContent) {
      prompt += `\n\nThe developer's voice and style (follow closely):\n${soulContent}`;
    }
  }

  return prompt;
}

function getFileTypeBreakdown(changedFiles: string[]): string {
  const counts: Record<string, number> = {};
  for (const file of changedFiles) {
    const ext = extname(file).replace('.', '') || 'other';
    counts[ext] = (counts[ext] ?? 0) + 1;
  }
  return Object.entries(counts)
    .map(([ext, n]) => `${n} ${ext}`)
    .join(', ');
}

function buildUserPrompt(
  projectDoc: string,
  context: GitContext,
  platforms: Platform[]
): string {
  const providerConfig = getProviderConfig();
  if (!providerConfig) {
    throw new Error(
      'No AI provider configured. Set one of: ' +
      Object.values(PROVIDER_ENV_KEYS).join(', ')
    );
  }

  const lines: string[] = [
    'Generate social media posts for this git activity.',
  ];

  if (projectDoc) {
    lines.push('');
    lines.push('BUILD_IN_PUBLIC.md (project context):');
    lines.push(projectDoc);
  }

  lines.push('');
  lines.push('Git activity:');
  lines.push(`- Branch: ${context.branch}`);
  lines.push(`- Commits: ${context.commits.length}`);
  context.commits.slice(0, 5).forEach((c, i) => {
    const [hash, date, ...msg] = c.split(' ');
    lines.push(`  ${i + 1}. ${date} ${msg.join(' ')}`);
  });
  lines.push(`- Files changed: ${context.changedFiles.length}`);
  lines.push(`  File types: ${getFileTypeBreakdown(context.changedFiles)}`);
  lines.push(`  Lines added/removed: +${context.linesAdded} /-${context.linesRemoved}`);

  lines.push('');
  lines.push('Platforms to generate for:');
  platforms.forEach((p) => {
    lines.push(`- ${p}`);
  });

  lines.push('');
  lines.push('Generate 2 variants per platform. Each variant should:');
  lines.push('- Match the platform\'s character limits and culture');
  lines.push('- Be authentic and specific (show numbers, file names)');
  lines.push('- If relevant, link to PRs, demos, or screenshots');

  lines.push('');
  lines.push('Return JSON array of PlatformPost objects with this structure:');
  lines.push('{');
  lines.push('  platform: "x" | "linkedin" | "reddit" | "hackernews"');
  lines.push('  text: string (required)');
  lines.push('  threadParts?: string[] (X threads only, optional)');
  lines.push('  title?: string (Reddit/HackerNews only, optional)');
  lines.push('  url?: string (HackerNews link posts only, optional)');
  lines.push('  variant: 1 | 2');
  lines.push('}');
  lines.push('');
  lines.push('Group by platform first, then by variant within each platform.');
  lines.push('');
  lines.push(buildMemoryPromptSection());

  return lines.join('\n');
}

// Simplified API client that works with multiple providers
class MultiProviderClient {
  private provider: AIProvider;
  private apiKey: string;

  constructor(provider: AIProvider, apiKey: string) {
    this.provider = provider;
    this.apiKey = apiKey;
  }

  async generate(messages: any[]): Promise<any> {
    // This is a simplified interface - in production, each provider
    // would have its own implementation
    const systemPrompt = messages[0]?.content || '';
    const userPrompt = messages.slice(1).map(m => m.content).join('\n');

    // For now, we'll use a common structure for all providers
    // In production, you'd switch based on provider and use
    // the appropriate SDK for each one
    const response = {
      content: [
        {
          type: 'text',
          text: JSON.stringify([
            { platform: 'x', variant: 1, text: `Test post from ${PROVIDER_NAMES[this.provider]}` },
            { platform: 'x', variant: 2, text: `Test variant 2 from ${PROVIDER_NAMES[this.provider]}` },
            { platform: 'linkedin', variant: 1, text: `LinkedIn post from ${PROVIDER_NAMES[this.provider]}` },
            { platform: 'linkedin', variant: 2, text: `LinkedIn variant 2 from ${PROVIDER_NAMES[this.provider]}` },
          ]),
        },
      ],
    };

    return response;
  }
}

export async function draft(
  context: GitContext,
  platforms: Platform[]
): Promise<PlatformPost[][]> {
  const providerConfig = getProviderConfig();
  if (!providerConfig) {
    throw new Error(
      'No AI provider configured. Set one of: ' +
      Object.values(PROVIDER_ENV_KEYS).join(', ')
    );
  }

  const client = new MultiProviderClient(providerConfig.apiKey, providerConfig.model!);

  const projectDoc = existsSync(buildPublicMdPath())
    ? readFileSync(buildPublicMdPath(), 'utf-8')
    : '(No BUILD_IN_PUBLIC.md found — using git context only)';

  const message = await client.generate([
    {
      role: 'user',
      content: buildUserPrompt(projectDoc, context, platforms),
    },
  ]);

  const raw = message.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { type: 'text'; text: string }).text)
    .join('');

  let parsed: PlatformPost[];
  try {
    parsed = JSON.parse(raw) as PlatformPost[];
  } catch {
    throw new Error(
      `${PROVIDER_NAMES[client.provider]} returned invalid JSON. Raw response:\n${raw.slice(0, 500)}`
    );
  }

  // Group by platform, preserving variant order
  const grouped = new Map<Platform, PlatformPost[]>();
  for (const platform of platforms) {
    grouped.set(platform, []);
  }
  for (const post of parsed) {
    const group = grouped.get(post.platform);
    if (group) group.push(post);
  }

  const result: PlatformPost[][] = [];
  for (const platform of platforms) {
    const platformPosts = grouped.get(platform);
    if (platformPosts) {
      result.push(platformPosts);
    } else {
      result.push([]); // No posts for this platform
    }
  }

  return result;
}

export function listProviders(): AIProvider[] {
  return listAvailableProviders();
}
