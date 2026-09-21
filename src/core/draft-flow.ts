import { select, editor } from '@inquirer/prompts';
import chalk from 'chalk';
import { colors, divider } from './branding.js';
import type { PlatformPost, Platform } from '../config/types.js';

const PLATFORM_LABELS: Record<Platform, string> = {
  x: 'X (Twitter)',
  linkedin: 'LinkedIn',
  reddit: 'Reddit',
  hackernews: 'HackerNews',
};

export function formatPost(post: PlatformPost): string {
  const lines: string[] = [
    chalk.bold.cyan(`── ${PLATFORM_LABELS[post.platform]} ──`),
  ];

  if (post.title) {
    lines.push(chalk.bold(`Title: ${post.title}`));
  }

  if (post.threadParts?.length) {
    post.threadParts.forEach((part, i) => {
      lines.push(chalk.yellow(`[${i + 1}/${post.threadParts!.length}] `) + part);
    });
  } else {
    lines.push(post.text);
  }

  if (post.url) {
    lines.push(chalk.dim(`URL: ${post.url}`));
  }

  return lines.join('\n');
}

export interface PickResult {
  post: PlatformPost;
  variantChosen: 1 | 2;
  wasEdited: boolean;
  aiOriginalText: string;
}

export async function pickVariant(variants: PlatformPost[]): Promise<PickResult | null> {
  const platform = variants[0]?.platform;
  if (!platform) return null;

  divider(PLATFORM_LABELS[platform]);
  console.log();

  variants.forEach((v, i) => {
    const label = colors.accent.bold(`  [${i + 1}]`);
    const preview = v.threadParts?.length
      ? v.threadParts[0]
      : v.text;
    console.log(`${label} ${preview.slice(0, 120)}${preview.length > 120 ? '...' : ''}`);
  });

  console.log();

  const choice = await select<string>({
    message: `Which variant? (or skip)`,
    choices: [
      ...variants.map((_, i) => ({ name: `Variant ${i + 1}`, value: String(i + 1) })),
      { name: 'Edit variant 1', value: 'e1' },
      { name: 'Edit variant 2', value: 'e2' },
      { name: 'Skip this platform', value: 's' },
    ],
  });

  if (choice === 's') return null;

  if (choice.startsWith('e')) {
    const idx = parseInt(choice[1], 10) - 1;
    const toEdit = variants[idx];
    const aiOriginal = toEdit.text;
    const current = toEdit.title
      ? `TITLE: ${toEdit.title}\n\n${toEdit.text}`
      : toEdit.text;

    const edited = await editor({
      message: 'Edit your post (save and close to continue):',
      default: current,
    });

    let editedPost: PlatformPost;
    if (toEdit.title && edited.startsWith('TITLE:')) {
      const [titleLine, ...rest] = edited.split('\n');
      editedPost = {
        ...toEdit,
        title: titleLine.replace('TITLE:', '').trim(),
        text: rest.join('\n').trim(),
      };
    } else {
      editedPost = { ...toEdit, text: edited.trim() };
    }

    return {
      post: editedPost,
      variantChosen: (idx + 1) as 1 | 2,
      wasEdited: true,
      aiOriginalText: aiOriginal,
    };
  }

  const idx = parseInt(choice, 10) - 1;
  const picked = variants[idx];
  if (!picked) return null;
  return {
    post: picked,
    variantChosen: (idx + 1) as 1 | 2,
    wasEdited: false,
    aiOriginalText: picked.text,
  };
}

/**
 * Runs the per-platform accept/edit/skip picker across every platform's
 * variant group, in order. Shared by `bip draft` and `bip ship` so both
 * commands present the exact same review UX.
 */
export async function pickAllVariants(
  variantGroups: PlatformPost[][]
): Promise<{ accepted: PlatformPost[]; pickResults: PickResult[] }> {
  const accepted: PlatformPost[] = [];
  const pickResults: PickResult[] = [];

  for (const variants of variantGroups) {
    if (variants.length === 0) continue;
    if (variants.length === 1) {
      // Only one variant returned — fall back to simple accept/skip
      console.log('\n' + formatPost(variants[0]) + '\n');
      const action = await select({
        message: 'Accept this post?',
        choices: [
          { name: 'Accept', value: 'accept' },
          { name: 'Skip', value: 'skip' },
        ],
      });
      if (action === 'accept') {
        accepted.push(variants[0]);
        pickResults.push({
          post: variants[0],
          variantChosen: 1,
          wasEdited: false,
          aiOriginalText: variants[0].text,
        });
      }
    } else {
      const result = await pickVariant(variants);
      if (result) {
        accepted.push(result.post);
        pickResults.push(result);
      }
    }
    console.log();
  }

  return { accepted, pickResults };
}
