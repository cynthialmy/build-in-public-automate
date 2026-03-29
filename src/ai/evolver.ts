/**
 * Multi-provider AI Soul / doc evolution (HTTP client shared with drafter)
 */

import type { PostingRecord } from '../config/types.js';
import {
  getProviderConfigFor,
  type AIProvider,
  PROVIDER_NAMES,
  detectProvider,
} from './providers.js';
import { createSimpleAIClient, extractTextFromAiResponse } from './drafter.js';

export async function evolveSoul(
  currentSoul: string,
  editDiffs: PostingRecord['editDiff'][],
  history: PostingRecord[],
  options?: { provider?: AIProvider }
): Promise<string> {
  const provider = options?.provider ?? detectProvider();
  if (!provider) {
    throw new Error('No AI provider configured. Set one of: ' + Object.values(PROVIDER_NAMES).join(', '));
  }
  if (!getProviderConfigFor(provider)) {
    throw new Error(`No API key for ${PROVIDER_NAMES[provider]}`);
  }

  const client = createSimpleAIClient(provider);

  const diffsSection =
    editDiffs.length > 0
      ? editDiffs
          .map(
            (d, i) =>
              `Edit ${i + 1}:\n  AI wrote: "${d!.aiGenerated}"\n  User changed to: "${d!.userFinal}"`
          )
          .join('\n')
      : '(no edits recorded yet)';

  const statsSection = [
    `Total drafts: ${history.length}`,
    `Edited: ${history.filter((r) => r.wasEdited).length}`,
    `Variant 1 picks: ${history.filter((r) => r.variantChosen === 1).length}`,
    `Variant 2 picks: ${history.filter((r) => r.variantChosen === 2).length}`,
  ].join('\n');

  const userContent = [
    'Current soul.md content:',
    currentSoul,
    '',
    'Recent posting history (last 10 drafts):',
    history
      .slice(-10)
      .map(
        (r) =>
          `- Draft ${r.draftId}: ${r.commitSummary} (${r.platform}, v${r.variantChosen}, ${r.postedSuccessfully ? '✓' : '✗'})`
      )
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
  ].join('\n');

  const messages = [
    {
      role: 'system',
      content:
        'You are an editor helping refine a developer\'s soul.md (posting voice). Output only the full markdown file.',
    },
    { role: 'user', content: userContent },
  ];

  const message = await client.generate(messages);
  return extractTextFromAiResponse(message);
}

export async function evolveProjectDoc(
  currentDoc: string,
  gitLog: string,
  packageJson: string | null,
  history: PostingRecord[],
  options?: { provider?: AIProvider }
): Promise<string> {
  const provider = options?.provider ?? detectProvider();
  if (!provider) {
    throw new Error('No AI provider configured. Set one of: ' + Object.values(PROVIDER_NAMES).join(', '));
  }
  if (!getProviderConfigFor(provider)) {
    throw new Error(`No API key for ${PROVIDER_NAMES[provider]}`);
  }

  const client = createSimpleAIClient(provider);

  const userContent = [
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
      .map(
        (r) =>
          `- Draft ${r.draftId}: ${r.commitSummary} (${r.platform}, v${r.variantChosen}, ${r.postedSuccessfully ? '✓' : '✗'})`
      )
      .join('\n'),
    '',
    'Analyze the project and suggest evolution of BUILD_IN_PUBLIC.md. Focus on:',
    '- Project Description: deepen based on what\'s been shipped',
    '- Tech Stack: detect new/removed deps from package.json',
    '- Milestones: check off completed items, suggest new ones based on recent direction',
    '- Only touch Target Audience and Post Style if clearly outdated.',
    'Preserve the overall structure. Add a "<!-- Last evolved: YYYY-MM-DD -->" comment at the top.',
    'Return the complete updated file.',
  ].join('\n');

  const messages = [
    {
      role: 'system',
      content:
        'You are an editor helping refine a developer\'s BUILD_IN_PUBLIC.md. Output only the full markdown file.',
    },
    { role: 'user', content: userContent },
  ];

  const message = await client.generate(messages);
  return extractTextFromAiResponse(message);
}
