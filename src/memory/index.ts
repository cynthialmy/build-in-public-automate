import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { memoryDir } from '../config/settings.js';
import type { Platform, PostingRecord, PostingPreferences } from '../config/types.js';

const MAX_HISTORY = 50;

function historyPath(): string {
  return join(memoryDir(), 'posting-history.json');
}

function preferencesPath(): string {
  return join(memoryDir(), 'preferences.json');
}

function readHistory(): PostingRecord[] {
  const path = historyPath();
  if (!existsSync(path)) return [];
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as PostingRecord[];
  } catch {
    return [];
  }
}

function writeHistory(records: PostingRecord[]): void {
  writeFileSync(historyPath(), JSON.stringify(records, null, 2), 'utf-8');
}

function readPreferences(): PostingPreferences | null {
  const path = preferencesPath();
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as PostingPreferences;
  } catch {
    return null;
  }
}

export function recordVariantChoice(opts: {
  draftId: string;
  platform: Platform;
  variantChosen: 1 | 2;
  wasEdited: boolean;
  aiGeneratedText: string;
  userFinalText: string;
  commitSummary: string;
}): void {
  const history = readHistory();

  const record: PostingRecord = {
    draftId: opts.draftId,
    createdAt: new Date().toISOString(),
    platform: opts.platform,
    variantChosen: opts.variantChosen,
    wasEdited: opts.wasEdited,
    textPreview: opts.userFinalText.slice(0, 120),
    commitSummary: opts.commitSummary,
    postedSuccessfully: false, // updated later by recordPostResult
  };

  if (opts.wasEdited) {
    record.editDiff = {
      aiGenerated: opts.aiGeneratedText.slice(0, 200),
      userFinal: opts.userFinalText.slice(0, 200),
    };
  }

  history.push(record);

  // FIFO: keep only last MAX_HISTORY records
  if (history.length > MAX_HISTORY) {
    history.splice(0, history.length - MAX_HISTORY);
  }

  writeHistory(history);
}

export function recordPostResult(draftId: string, platform: Platform, success: boolean): void {
  const history = readHistory();
  let updated = false;

  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].draftId === draftId && history[i].platform === platform) {
      history[i].postedSuccessfully = success;
      updated = true;
      break;
    }
  }

  if (updated) {
    writeHistory(history);
  }
}

export function updatePreferences(): void {
  const history = readHistory();
  if (history.length === 0) return;

  const allPlatforms: Platform[] = ['x', 'linkedin', 'reddit', 'hackernews'];
  const variantPreferences = {} as Record<Platform, { variant1: number; variant2: number }>;

  for (const p of allPlatforms) {
    const platformRecords = history.filter((r) => r.platform === p);
    variantPreferences[p] = {
      variant1: platformRecords.filter((r) => r.variantChosen === 1).length,
      variant2: platformRecords.filter((r) => r.variantChosen === 2).length,
    };
  }

  const editedCount = history.filter((r) => r.wasEdited).length;
  const editRate = history.length > 0 ? editedCount / history.length : 0;

  // Extract recent topics from commit summaries
  const recentTopics = history
    .slice(-10)
    .map((r) => r.commitSummary)
    .filter(Boolean);

  // Detect common edit patterns from editDiffs
  const commonEdits = detectCommonEdits(history);

  const prefs: PostingPreferences = {
    totalDrafts: history.length,
    variantPreferences,
    editRate: Math.round(editRate * 100) / 100,
    recentTopics,
    commonEdits,
    lastUpdated: new Date().toISOString(),
  };

  writeFileSync(preferencesPath(), JSON.stringify(prefs, null, 2), 'utf-8');
}

function detectCommonEdits(history: PostingRecord[]): string[] {
  const edits = history.filter((r) => r.editDiff);
  if (edits.length < 2) return [];

  const patterns: string[] = [];

  // Check if user consistently shortens text
  const shortenCount = edits.filter(
    (r) => r.editDiff!.userFinal.length < r.editDiff!.aiGenerated.length * 0.8
  ).length;
  if (shortenCount > edits.length * 0.5) {
    patterns.push('shortens text');
  }

  // Check if user consistently lengthens text
  const lengthenCount = edits.filter(
    (r) => r.editDiff!.userFinal.length > r.editDiff!.aiGenerated.length * 1.2
  ).length;
  if (lengthenCount > edits.length * 0.5) {
    patterns.push('expands text');
  }

  // Check for hashtag removal
  const hashtagRemoval = edits.filter(
    (r) => r.editDiff!.aiGenerated.includes('#') && !r.editDiff!.userFinal.includes('#')
  ).length;
  if (hashtagRemoval > edits.length * 0.5) {
    patterns.push('removes hashtags');
  }

  // Check for emoji removal
  const emojiPattern = /[\u{1F600}-\u{1F9FF}]/u;
  const emojiRemoval = edits.filter(
    (r) => emojiPattern.test(r.editDiff!.aiGenerated) && !emojiPattern.test(r.editDiff!.userFinal)
  ).length;
  if (emojiRemoval > edits.length * 0.5) {
    patterns.push('removes emoji');
  }

  return patterns;
}

export function buildMemoryPromptSection(): string {
  const prefs = readPreferences();
  if (!prefs || prefs.totalDrafts === 0) return '';

  const lines: string[] = ['Memory (your posting context):'];
  lines.push(`- ${prefs.totalDrafts} drafts generated for this project`);

  // Variant preferences for platforms that have data
  const vpEntries = Object.entries(prefs.variantPreferences)
    .filter(([, v]) => v.variant1 + v.variant2 > 0)
    .map(([p, v]) => {
      const total = v.variant1 + v.variant2;
      const pct1 = Math.round((v.variant1 / total) * 100);
      const pct2 = 100 - pct1;
      return `${p}: v1 ${pct1}%/v2 ${pct2}%`;
    });
  if (vpEntries.length > 0) {
    lines.push(`- Variant preferences: ${vpEntries.join(', ')}`);
  }

  lines.push(`- You edit posts ${Math.round(prefs.editRate * 100)}% of the time`);

  if (prefs.commonEdits.length > 0) {
    lines.push(`- Common editing patterns: ${prefs.commonEdits.join(', ')}`);
  }

  if (prefs.recentTopics.length > 0) {
    const topics = prefs.recentTopics.slice(-5);
    lines.push(`- Recent topics already covered: ${topics.join('; ')}`);
  }

  // Include last 3 text previews to avoid repetition
  const history = readHistory();
  const recentPreviews = history.slice(-3).map((r) => r.textPreview);
  if (recentPreviews.length > 0) {
    lines.push(`- Avoid repeating: ${recentPreviews.join(' | ')}`);
  }

  return '\n\n' + lines.join('\n');
}

export function getEditDiffs(): PostingRecord['editDiff'][] {
  const history = readHistory();
  return history
    .filter((r) => r.editDiff)
    .map((r) => r.editDiff!);
}

export function getPostingHistory(): PostingRecord[] {
  return readHistory();
}
