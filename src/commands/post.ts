import { readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { select, confirm, input } from '@inquirer/prompts';
import chalk from 'chalk';
import ora from 'ora';
import { colors } from '../core/branding.js';
import { isInitialized, postsDir, capturesDir, updateConfig } from '../config/settings.js';
import { recordPostResult } from '../memory/index.js';
import { getHeadSha } from '../ai/git.js';
import { captureScreenshot, describeScreenshotError } from '../capture/screenshot.js';
import { PLATFORM_PRESET } from '../core/platform-presets.js';
import { saveManualExport } from './manual-export.js';
import type { DraftPost, Platform, PlatformPost, PostResult } from '../config/types.js';
import { TwitterPlatform } from '../platforms/twitter.js';
import { LinkedInPlatform } from '../platforms/linkedin.js';
import { RedditPlatform } from '../platforms/reddit.js';
import { HackerNewsPlatform } from '../platforms/hackernews.js';
import type { IPlatform } from '../platforms/base.js';

export const PLATFORMS: Record<Platform, IPlatform> = {
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

/** Offers to capture a screenshot on the spot, for a manual export that has none yet. */
async function maybeCaptureScreenshot(platform: Platform): Promise<string[]> {
  const wantScreenshot = await confirm({
    message: 'Grab a screenshot to include? (opens a URL and saves a PNG)',
    default: false,
  });
  if (!wantScreenshot) return [];

  const url = await input({ message: 'URL to screenshot:' });
  const spinner = ora('Capturing screenshot...').start();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outPath = join(capturesDir(), `screenshot-${timestamp}.png`);
  try {
    const saved = await captureScreenshot(url, outPath, { preset: PLATFORM_PRESET[platform] });
    spinner.succeed(`Screenshot saved: ${saved}`);
    return [saved];
  } catch (err) {
    spinner.fail(`Screenshot failed: ${describeScreenshotError(err)}`);
    return [];
  }
}

/**
 * Tries the platform API first; on failure, asks whether to fall back to
 * browser automation. Owns the spinner and final success/failure message,
 * so callers just act on the returned `PostResult`. Shared by `bip post`
 * and `bip ship`'s auto-post step.
 */
export async function attemptPost(
  post: PlatformPost,
  attachments: string[],
  platformImpl: IPlatform
): Promise<PostResult> {
  const spinner = ora(`Posting to ${post.platform}...`).start();

  let result = await platformImpl.post(post, attachments);

  if (!result.success) {
    spinner.warn(`API posting failed: ${result.error}`);
    const tryBrowser = await confirm({
      message: 'Try browser automation instead?',
      default: true,
    });
    if (tryBrowser) {
      spinner.start('Opening browser...');
      result = await platformImpl.postViaBrowser(post, attachments);
    }
  }

  if (result.success) {
    spinner.succeed(
      `Posted to ${post.platform}${result.url ? ': ' + chalk.underline(result.url) : ''}`
    );
  } else {
    spinner.fail(`Failed to post to ${post.platform}: ${result.error}`);
  }

  return result;
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

    const platformImpl = PLATFORMS[post.platform];
    const attachments = draft.attachments ?? [];
    if (attachments.length > 0 && !platformImpl.supportsAttachments) {
      console.log(
        colors.warn(
          `  ⚠ ${attachments.length} attachment(s) on this draft won't be uploaded — ${post.platform} posting doesn't support attachments yet.`
        )
      );
    }

    const action = await select<'post' | 'manual' | 'skip'>({
      message: `What do you want to do with the ${post.platform} post?`,
      choices: [
        { name: 'Post now', value: 'post' },
        {
          name: 'Save for manual copy-paste (no account/API access needed)',
          value: 'manual',
        },
        { name: 'Skip', value: 'skip' },
      ],
    });

    if (action === 'skip') continue;

    if (action === 'manual') {
      const extra = await maybeCaptureScreenshot(post.platform);
      const dir = saveManualExport(draft.id, post, [...attachments, ...extra]);
      draft.manualExports = { ...draft.manualExports, [post.platform]: dir };
      console.log(
        colors.success(`  ✓ Saved to ${dir}`) +
        colors.dim(' — open post.txt, copy it in, and post it yourself.')
      );
      continue;
    }

    const result = await attemptPost(post, attachments, platformImpl);

    if (result.success) {
      draft.postedTo.push(post.platform);
      recordPostResult(draft.id, post.platform, true);
      if (result.url) {
        draft.postResults = {
          ...draft.postResults,
          [post.platform]: { url: result.url, postedAt: new Date().toISOString() },
        };
      }
    } else {
      recordPostResult(draft.id, post.platform, false);

      // Neither the API nor the browser worked — offer the manual path
      // instead of just leaving the person with nothing to show for it.
      const fallbackToManual = await confirm({
        message: 'Save this post for manual copy-paste instead?',
        default: true,
      });
      if (fallbackToManual) {
        const extra = await maybeCaptureScreenshot(post.platform);
        const dir = saveManualExport(draft.id, post, [...attachments, ...extra]);
        draft.manualExports = { ...draft.manualExports, [post.platform]: dir };
        console.log(
          colors.success(`  ✓ Saved to ${dir}`) +
          colors.dim(' — open post.txt, copy it in, and post it yourself.')
        );
      }
    }
  }

  // Update draft status
  const allPosted = draft.posts.every((p) => draft.postedTo.includes(p.platform));
  draft.status = allPosted ? 'posted' : 'partial';
  saveDraft(draft);

  // Record the diff baseline for the next `bip draft`, so future drafts
  // describe work done since this post instead of an arbitrary commit window.
  // Also timestamp it — this is what the cadence nudge (`bip status`) reads.
  if (draft.postedTo.length > 0) {
    const headSha = await getHeadSha();
    updateConfig({
      ...(headSha ? { lastPostedSha: headSha } : {}),
      lastPostedAt: new Date().toISOString(),
    });
  }
}
