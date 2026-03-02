import { writeFileSync } from 'fs';
import { join } from 'path';
import { select, confirm, editor } from '@inquirer/prompts';
import ora from 'ora';
import chalk from 'chalk';
import { colors, divider } from '../core/branding.js';
import { isInitialized, readConfig, postsDir, capturesDir } from '../config/settings.js';
import { isGitRepo, getContext } from '../ai/git.js';
import { draft as draftPosts } from '../ai/drafter.js';
import { captureScreenshot } from '../capture/screenshot.js';
import type { DraftPost, GitContext, Platform, PlatformPost } from '../config/types.js';

const PLATFORM_LABELS: Record<Platform, string> = {
  x: 'X (Twitter)',
  linkedin: 'LinkedIn',
  reddit: 'Reddit',
  hackernews: 'HackerNews',
};

function formatPost(post: PlatformPost): string {
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

function showGitSummary(context: GitContext): void {
  console.log();
  divider('git summary');
  const topCommits = context.commits
    .slice(0, 3)
    .map((c) => c.split(' ').slice(2).join(' '))
    .join(', ');

  console.log(
    `  Branch: ${colors.bold(context.branch)}  |  ${context.commits.length} commits  |  ` +
    `${colors.success('+' + context.linesAdded)} ${colors.error('-' + context.linesRemoved)} lines  |  ` +
    `${context.changedFiles.length} files changed`
  );

  if (topCommits) {
    console.log(`  Top commits: ${colors.dim(topCommits)}`);
  }
  console.log();
}

async function pickVariant(variants: PlatformPost[]): Promise<PlatformPost | null> {
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
    const current = toEdit.title
      ? `TITLE: ${toEdit.title}\n\n${toEdit.text}`
      : toEdit.text;

    const edited = await editor({
      message: 'Edit your post (save and close to continue):',
      default: current,
    });

    if (toEdit.title && edited.startsWith('TITLE:')) {
      const [titleLine, ...rest] = edited.split('\n');
      return {
        ...toEdit,
        title: titleLine.replace('TITLE:', '').trim(),
        text: rest.join('\n').trim(),
      };
    }
    return { ...toEdit, text: edited.trim() };
  }

  const picked = variants[parseInt(choice, 10) - 1];
  return picked ?? null;
}

export async function draftCommand(options: { platforms?: string }): Promise<void> {
  if (!isInitialized()) {
    console.error('bip is not initialized. Run `bip init` first.');
    process.exit(1);
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY environment variable is not set.');
    process.exit(1);
  }

  if (!(await isGitRepo())) {
    console.error('This directory is not a git repository.');
    process.exit(1);
  }

  const config = readConfig();

  // Determine which platforms to generate for
  let platforms: Platform[];
  if (options.platforms) {
    platforms = options.platforms.split(',').map((p) => p.trim()) as Platform[];
  } else {
    const enabled = Object.entries(config.platforms)
      .filter(([, v]) => v?.enabled)
      .map(([k]) => k as Platform);

    platforms =
      enabled.length > 0
        ? enabled
        : (['x', 'linkedin', 'reddit', 'hackernews'] as Platform[]);
  }

  const spinner = ora('Analyzing your changes...').start();
  let context: GitContext;
  try {
    context = await getContext();
    spinner.stop();
  } catch (err) {
    spinner.fail('Failed to read git context');
    throw err;
  }

  // Show git summary and confirm
  showGitSummary(context);
  const proceed = await confirm({
    message: 'Generate posts from this activity?',
    default: true,
  });
  if (!proceed) {
    console.log('Aborted.');
    return;
  }

  const genSpinner = ora('Generating posts with Claude...').start();
  let variantGroups: PlatformPost[][];
  try {
    variantGroups = await draftPosts(context, platforms);
    genSpinner.succeed('Posts generated!');
  } catch (err) {
    genSpinner.fail('Failed to generate posts');
    throw err;
  }

  // Variant picker per platform
  const accepted: PlatformPost[] = [];
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
      if (action === 'accept') accepted.push(variants[0]);
    } else {
      const picked = await pickVariant(variants);
      if (picked) accepted.push(picked);
    }
    console.log();
  }

  if (accepted.length === 0) {
    console.log('No posts accepted. Nothing saved.');
    return;
  }

  // Optional screenshot
  const attachments: string[] = [];
  const wantScreenshot = await confirm({
    message: 'Attach a screenshot to this draft?',
    default: false,
  });

  if (wantScreenshot) {
    const { input } = await import('@inquirer/prompts');
    const url = await input({ message: 'URL to screenshot:' });
    const ssSpinner = ora('Capturing screenshot...').start();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outPath = join(capturesDir(), `screenshot-${timestamp}.png`);
    try {
      const saved = await captureScreenshot(url, outPath);
      ssSpinner.succeed(`Screenshot saved: ${saved}`);
      attachments.push(saved);
    } catch (err) {
      ssSpinner.fail('Screenshot failed');
      console.error(err);
    }
  }

  // Save draft
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const draftId = `draft-${timestamp}`;
  const draftPost: DraftPost = {
    id: draftId,
    createdAt: new Date().toISOString(),
    status: 'draft',
    postedTo: [],
    posts: accepted,
    attachments,
  };

  const draftPath = join(postsDir(), `${draftId}.json`);
  writeFileSync(draftPath, JSON.stringify(draftPost, null, 2), 'utf-8');

  console.log(`\nDraft saved: ${chalk.green(draftPath)}`);
  console.log(`\nRun ${chalk.cyan('bip post')} to publish.`);
}
