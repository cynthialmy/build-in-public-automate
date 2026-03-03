import Anthropic from '@anthropic-ai/sdk';
import type { PostingRecord } from '../config/types.js';

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY environment variable is not set.');
  }
  return new Anthropic({ apiKey });
}

export async function evolveSoul(
  currentSoul: string,
  editDiffs: PostingRecord['editDiff'][],
  history: PostingRecord[]
): Promise<string> {
  const client = getClient();

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

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    system: `You help developers refine their posting voice profile (soul.md).
Analyze their editing patterns and posting history to suggest specific, actionable updates to their soul.md file.
Return the COMPLETE updated soul.md file content (not a diff). Preserve the file structure and HTML comments.
Be specific about what you changed and why in a comment at the top.`,
    messages: [
      {
        role: 'user',
        content: `Current soul.md:
${currentSoul}

Posting statistics:
${statsSection}

Edit diffs (what the user changed from AI-generated to their final version):
${diffsSection}

Analyze the patterns in how this user edits their posts. Update soul.md to better capture their voice.
For each change you make, briefly note why (e.g., "User consistently removes hashtags").
Return the complete updated soul.md file.`,
      },
    ],
  });

  return message.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { type: 'text'; text: string }).text)
    .join('');
}

export async function evolveProjectDoc(
  currentDoc: string,
  gitLog: string,
  packageJson: string | null,
  postingHistory: PostingRecord[]
): Promise<string> {
  const client = getClient();

  const historySection = postingHistory.length > 0
    ? postingHistory
        .slice(-10)
        .map((r) => `- ${r.createdAt.slice(0, 10)}: [${r.platform}] ${r.textPreview}`)
        .join('\n')
    : '(no posting history yet)';

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: `You help developers keep their BUILD_IN_PUBLIC.md file up to date.
Analyze recent git activity, dependencies, and posting history to propose updates.
Return the COMPLETE updated BUILD_IN_PUBLIC.md file content.
Focus on:
- Project Description: deepen based on what's been shipped
- Tech Stack: detect new/removed deps from package.json
- Milestones: check off completed items, suggest new ones based on recent direction
- Only touch Target Audience and Post Style if clearly outdated
Preserve the overall structure. Add a "<!-- Last evolved: YYYY-MM-DD -->" comment at the top.`,
    messages: [
      {
        role: 'user',
        content: `Current BUILD_IN_PUBLIC.md:
${currentDoc}

Recent git log (last 50 commits):
${gitLog}

${packageJson ? `package.json:\n${packageJson}` : '(package.json not found)'}

Recent posting history:
${historySection}

Update BUILD_IN_PUBLIC.md based on this activity. Fill in empty sections where possible.
Check off milestones that appear completed based on git activity.
Return the complete updated file.`,
      },
    ],
  });

  return message.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { type: 'text'; text: string }).text)
    .join('');
}
