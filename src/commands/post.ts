import { readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { select, confirm } from '@inquirer/prompts';
import chalk from 'chalk';
import ora from 'ora';
import { colors } from '../core/branding.js';
import { isInitialized, postsDir } from '../config/settings.js';
import type { DraftPost, Platform, PlatformPost } from '../config/types.js';
import { TwitterPlatform } from '../platforms/twitter.js';
import { LinkedInPlatform } from '../platforms/linkedin.js';
import { RedditPlatform } from '../platforms/reddit.js';
import { HackerNewsPlatform } from '../platforms/hackernews.js';
import type { IPlatform } from '../platforms/base.js';

const PLATFORMS: Record<Platform, IPlatform> = {
  x: new TwitterPlatform(),
  linkedin: new LinkedInPlatform(),
  reddit: new RedditPlatform(),
  hackernews: new HackerNewsPlatform(),
};

const X_CHAR_LIMIT = 280;
const LINKEDIN_WORD_LIMIT = 700;

function charCount(post: PlatformPost): string {
  if (post.platform === 'x') {
    const total = post.threadParts?.length
      ? post.threadParts.reduce((s, p) => s + p.length, 0)
      : post.text.length;
    const limit = X_CHAR_LIMIT;
    const warn = total > limit * 0.95;
    const label = post.threadParts?.length
      ? `${total} chars across ${post.threadParts.length} tweets`
      : `${total}/${limit} chars`;
    return warn ? colors.warn(`⚠ ${label}`) : colors.dim(label);
  }
  if (post.platform === 'linkedin') {
    const words = post.text.split(/\s+/).length;
    return colors.dim(`${words} words`);
  }
  return '';
}

function loadDrafts(): DraftPost[] {
  const dir = postsDir();
  try {
    return readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf-8')) as DraftPost)
      .filter((d) => d.status !== 'posted')
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
  } catch {
    return [];
  }
}

function saveDraft(draft: DraftPost): void {
  const path = join(postsDir(), `${draft.id}.json`);
  writeFileSync(path, JSON.stringify(draft, null, 2), 'utf-8');
}

function previewPost(post: PlatformPost, isDryRun = false): void {
  const count = charCount(post);
  const countSuffix = count ? `  ${count}` : '';
  console.log(chalk.bold.cyan(`\n── ${post.platform.toUpperCase()} ──`) + countSuffix);

  if (isDryRun) {
    console.log(colors.dim('  [dry run — not posting]'));
  }

  if (post.title) console.log(chalk.bold(`Title: ${post.title}`));
  if (post.threadParts?.length) {
    post.threadParts.forEach((p, i) =>
      console.log(chalk.yellow(`[${i + 1}] `) + p)
    );
  } else {
    console.log(post.text);
  }
}

export async function postCommand(platform?: string, options: { dryRun?: boolean } = {}): Promise<void> {
  if (!isInitialized()) {
    console.error('bip is not initialized. Run `bip init` first.');
    process.exit(1);
  }

  const drafts = loadDrafts();
  if (drafts.length === 0) {
    console.log('No unposted drafts found. Run `bip draft` to create one.');
    return;
  }

  // Select draft
  let draft: DraftPost;
  if (drafts.length === 1) {
    draft = drafts[0];
    console.log(`Using draft: ${chalk.green(draft.id)}`);
  } else {
    const chosen = await select<string>({
      message: 'Select a draft to post:',
      choices: drafts.map((d) => ({
        name: `${d.id} (${d.posts.map((p) => p.platform).join(', ')})`,
        value: d.id,
      })),
    });
    draft = drafts.find((d) => d.id === chosen)!;
  }

  // Filter posts to the specified platform(s)
  let postsToPublish = draft.posts;
  if (platform) {
    postsToPublish = draft.posts.filter((p) => p.platform === platform);
    if (postsToPublish.length === 0) {
      console.error(`No post for platform "${platform}" in this draft.`);
      process.exit(1);
    }
  }

  if (options.dryRun) {
    console.log(colors.warn('\n  Dry run — no posts will be published.\n'));
    for (const post of postsToPublish) {
      previewPost(post, true);
    }
    console.log();
    return;
  }

  // Post each platform
  for (const post of postsToPublish) {
    if (draft.postedTo.includes(post.platform)) {
      console.log(
        chalk.dim(`Skipping ${post.platform} (already posted)`)
      );
      continue;
    }

    previewPost(post);
    const ok = await confirm({
      message: `Post to ${post.platform}?`,
      default: true,
    });
    if (!ok) continue;

    const platformImpl = PLATFORMS[post.platform];
    const spinner = ora(`Posting to ${post.platform}...`).start();

    let result = await platformImpl.post(post);

    if (!result.success) {
      spinner.warn(`API posting failed: ${result.error}`);
      const tryBrowser = await confirm({
        message: 'Try browser automation instead?',
        default: true,
      });
      if (tryBrowser) {
        spinner.start('Opening browser...');
        result = await platformImpl.postViaBrowser(post);
      }
    }

    if (result.success) {
      spinner.succeed(
        `Posted to ${post.platform}${result.url ? ': ' + chalk.underline(result.url) : ''}`
      );
      draft.postedTo.push(post.platform);
    } else {
      spinner.fail(`Failed to post to ${post.platform}: ${result.error}`);
    }
  }

  // Update draft status
  const allPosted = draft.posts.every((p) => draft.postedTo.includes(p.platform));
  draft.status = allPosted ? 'posted' : 'partial';
  saveDraft(draft);
}
