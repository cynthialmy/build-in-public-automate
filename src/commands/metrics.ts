import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import ora from 'ora';
import chalk from 'chalk';
import { colors, divider } from '../core/branding.js';
import { isInitialized, postsDir } from '../config/settings.js';
import type { DraftPost, Platform } from '../config/types.js';
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

function loadPostedDrafts(): DraftPost[] {
  const dir = postsDir();
  try {
    return readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf-8')) as DraftPost)
      .filter((d) => d.postResults && Object.keys(d.postResults).length > 0)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } catch {
    return [];
  }
}

function formatMetric(label: string, value: number | undefined): string {
  return value === undefined ? '' : `${value} ${label}`;
}

export async function metricsCommand(options: { limit?: string } = {}): Promise<void> {
  if (!isInitialized()) {
    console.error('bip is not initialized. Run `bip init` first.');
    process.exit(1);
  }

  const limit = options.limit ? parseInt(options.limit, 10) : 10;
  const drafts = loadPostedDrafts().slice(0, limit);

  console.log();
  divider('bip metrics');
  console.log();

  if (drafts.length === 0) {
    console.log(colors.dim('  No posted drafts with tracked results yet. Run `bip post` to publish one.'));
    console.log();
    return;
  }

  const spinner = ora('Fetching engagement...').start();
  let fetched = 0;
  let unsupported = 0;

  for (const draft of drafts) {
    const results = draft.postResults!;
    for (const [platform, result] of Object.entries(results) as [Platform, { url: string; postedAt: string }][]) {
      const platformImpl = PLATFORMS[platform];
      spinner.text = `Fetching engagement... (${draft.id} / ${platform})`;

      if (!platformImpl.getMetrics) {
        unsupported++;
        continue;
      }

      const metrics = await platformImpl.getMetrics(result.url).catch(() => null);
      spinner.stop();

      console.log(chalk.bold.cyan(`── ${draft.id} · ${platform.toUpperCase()} ──`));
      console.log(colors.dim(`  ${result.url}`));

      if (!metrics) {
        console.log(colors.dim('  Could not fetch metrics (post may be deleted, or credentials changed).'));
      } else {
        fetched++;
        const parts = [
          formatMetric('likes', metrics.likes),
          formatMetric('comments', metrics.comments),
          formatMetric('shares', metrics.shares),
          formatMetric('impressions', metrics.impressions),
        ].filter(Boolean);
        console.log(`  ${parts.join('  ·  ') || '(no data)'}`);
      }
      console.log();
      spinner.start();
    }
  }

  spinner.stop();

  if (unsupported > 0) {
    console.log(
      colors.dim(
        `  ${unsupported} post(s) skipped — metrics aren't supported for that platform yet (LinkedIn's personal-share analytics need partner API access bip doesn't have).`
      )
    );
    console.log();
  }

  if (fetched === 0 && unsupported === 0) {
    console.log(colors.dim('  No metrics could be fetched.'));
    console.log();
  }
}
