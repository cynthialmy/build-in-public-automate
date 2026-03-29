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
  lines.push('- Match platform\'s character limits and culture');
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
  lines.push(buildMemoryPromptSection());

  return lines.join('\n');
}

/**
 * Simplified HTTP client that works with any provider
 */
class SimpleAIClient {
  private provider: AIProvider;
  private apiKey: string;
  private baseURL?: string;
  private model?: string;
  private maxTokens?: number;

  constructor(provider: AIProvider, apiKey: string, config?: { baseURL?: string; model?: string; maxTokens?: number }) {
    this.provider = provider;
    this.apiKey = apiKey;
    this.baseURL = config?.baseURL;
    this.model = config?.model;
    this.maxTokens = config?.maxTokens;
  }

  async generate(messages: any[]): Promise<{ content: any }> {
    // Provider-specific API endpoints
    const endpoints: Record<AIProvider, { url: string; headers: Record<string, string> }> = {
      anthropic: {
        url: 'https://api.anthropic.com/v1/messages',
        headers: {
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
      },
      openai: {
        url: 'https://api.openai.com/v1/chat/completions',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
      },
      google: {
        url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent',
        headers: {
          'x-goog-api-key': this.apiKey,
          'Content-Type': 'application/json',
        },
      },
      cohere: {
        url: 'https://api.cohere.ai/v1/chat',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
      },
      deepseek: {
        url: 'https://api.deepseek.com/chat/completions',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
      },
      qwen: {
        url: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
      },
      glm: {
        url: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
      },
    };

    const endpoint = endpoints[this.provider];
    if (!endpoint) {
      throw new Error(`Provider ${this.provider} not yet implemented`);
    }

    const body = this.buildRequestBody(messages);
    const response = await fetch(endpoint.url, {
      method: 'POST',
      headers: endpoint.headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`${PROVIDER_NAMES[this.provider]} API error: ${response.status} - ${errorText}`);
    }

    return await response.json();
  }

  private buildRequestBody(messages: any[]): any {
    // Build request body based on provider
    switch (this.provider) {
      case 'anthropic':
        return {
          model: this.model || 'claude-sonnet-4-6',
          max_tokens: this.maxTokens || 4096,
          system: messages[0]?.content || '',
          messages: messages.slice(1).map(m => ({
            role: m.role,
            content: m.content,
          })),
        };

      case 'openai':
        return {
          model: this.model || 'gpt-4o',
          max_tokens: this.maxTokens || 4096,
          messages: messages.slice(1).map(m => ({
            role: m.role,
            content: m.content,
          })),
        };

      case 'google':
        return {
          contents: [{
            parts: [{
              text: messages.slice(1).map(m => m.content).join('\n'),
            }],
          }],
        };

      case 'cohere':
        return {
          model: this.model || 'command-r-plus-08-2024',
          message: messages.slice(1).map(m => m.content).join('\n'),
        };

      case 'deepseek':
      case 'qwen':
      case 'glm':
        return {
          model: this.model || (this.provider === 'glm' ? 'glm-4-plus' : 'deepseek-chat'),
          messages: messages.slice(1).map(m => ({
            role: m.role,
            content: m.content,
          })),
        };

      default:
        throw new Error(`Provider ${this.provider} request body not yet implemented`);
    }
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
      Object.values(PROVIDER_NAMES).join(', ') + '.\n\n' +
      'Examples:\n' +
      Object.entries({
        anthropic: 'export ANTHROPIC_API_KEY=sk-ant-...',
        openai: 'export OPENAI_API_KEY=sk-...',
        google: 'export GOOGLE_API_KEY=your-gemini-key',
        cohere: 'export COHERE_API_KEY=your-key',
        deepseek: 'export DEEPSEEK_API_KEY=your-key',
        qwen: 'export QWEN_API_KEY=your-key',
        glm: 'export GLM_API_KEY=your-key',
      }).map(([k, v]) => `  ${k}=${v}`).join('\n')
    );
  }

  const client = new SimpleAIClient(
    providerConfig.apiKey,
    providerConfig
  );

  const projectDoc = existsSync(buildPublicMdPath())
    ? readFileSync(buildPublicMdPath(), 'utf-8')
    : '(No BUILD_IN_PUBLIC.md found — using git context only)';

  const message = await client.generate([
    {
      role: 'user',
      content: buildUserPrompt(projectDoc, context, platforms),
    },
  ]);

  // Parse response based on provider
  let parsed: PlatformPost[];
  try {
    parsed = this.parseResponse(message, providerConfig.model);
  } catch (err) {
    throw new Error(
      `${PROVIDER_NAMES[providerConfig.apiKey]} returned invalid response. Error: ${err}`
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

function parseResponse(response: any, model?: string): PlatformPost[] {
  const content = response.content || response.choices?.[0]?.message?.content || '';
  
  // Extract JSON from different response formats
  let jsonString = content;
  
  // Try to find JSON array in the content
  const jsonMatch = content.match(/\[[\s\S]*?\]/);
  if (jsonMatch) {
    jsonString = jsonMatch[0];
  }

  let parsed: PlatformPost[];
  try {
    parsed = JSON.parse(jsonString) as PlatformPost[];
  } catch {
    // If direct JSON parsing fails, try alternative formats
    throw new Error(`Could not parse response as PlatformPost array`);
  }
  
  return parsed;
}

export function listProviders(): AIProvider[] {
  const { listAvailableProviders } = require('./providers.js');
  return listAvailableProviders();
}

export function getActiveProvider(): AIProvider | null {
  return detectProvider();
}

export function listAvailableProviderNames(): string[] {
  const { listAvailableProviders } = require('./providers.js');
  const providers = listAvailableProviders();
  return providers.map(p => PROVIDER_NAMES[p]);
}
