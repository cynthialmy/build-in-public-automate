import Anthropic from '@anthropic-ai/sdk';
import { existsSync, readFileSync } from 'fs';
import { extname } from 'path';
import type { GitContext, PlatformPost, Platform } from '../config/types.js';
import { buildPublicMdPath, soulPath } from '../config/settings.js';
import { loadSkillsForPlatforms } from '../skills/index.js';
import { buildMemoryPromptSection } from '../memory/index.js';

const BASE_SYSTEM_PROMPT = `You are a "build in public" content strategist embedded in a developer's workflow.
Transform raw git activity into authentic social media content developers actually want to read.
Be specific (metrics, file names, actual problems solved). Show the journey, not just results.
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
  const fileBreakdown = getFileTypeBreakdown(context.changedFiles);
  const commitTypesSummary = Object.entries(context.commitsByType)
    .map(([type, msgs]) => `${type}(${msgs.length}): ${msgs.slice(0, 2).join('; ')}`)
    .join('\n');

  const memorySection = buildMemoryPromptSection();

  return `Project context from BUILD_IN_PUBLIC.md:
${projectDoc}
${memorySection}

Recent git activity:
Branch: ${context.branch}  |  ${context.commits.length} commits  |  +${context.linesAdded} -${context.linesRemoved} lines  |  ${context.changedFiles.length} files changed
File types: ${fileBreakdown || '(none)'}

Commits by type:
${commitTypesSummary || context.commits.slice(0, 10).join('\n')}

Changed files:
${context.changedFiles.join('\n') || '(none)'}

Diff summary:
${context.diff || '(no diff available)'}

Generate posts for platforms: ${platforms.join(', ')}

For EACH platform, generate EXACTLY 2 variants (variant 1 and variant 2) with different angles/hooks.

Return a JSON array of objects. Each object must have:
- platform: one of ${platforms.map((p) => `"${p}"`).join(', ')}
- variant: 1 or 2
- text: the post body
- threadParts: (X only) array of strings if the content needs a thread
- title: (Reddit and HackerNews only) the post title
- url: (HackerNews only, optional) link URL for link posts

Return ${platforms.length * 2} objects total (2 per platform). Return ONLY valid JSON, no markdown fences, no explanation.`;
}

export async function draft(
  context: GitContext,
  platforms: Platform[]
): Promise<PlatformPost[][]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY environment variable is not set.');
  }

  const client = new Anthropic({ apiKey });

  const projectDoc = existsSync(buildPublicMdPath())
    ? readFileSync(buildPublicMdPath(), 'utf-8')
    : '(No BUILD_IN_PUBLIC.md found — using git context only)';

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: buildSystemPrompt(platforms),
    messages: [
      {
        role: 'user',
        content: buildUserPrompt(projectDoc, context, platforms),
      },
    ],
  });

  const raw = message.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { type: 'text'; text: string }).text)
    .join('');

  let parsed: PlatformPost[];
  try {
    parsed = JSON.parse(raw) as PlatformPost[];
  } catch {
    throw new Error(
      `Claude returned invalid JSON. Raw response:\n${raw.slice(0, 500)}`
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

  // Return as array of [variant1, variant2] pairs per platform
  return Array.from(grouped.values()).filter((g) => g.length > 0);
}
