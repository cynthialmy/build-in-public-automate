import { writeFileSync } from 'fs';
import { join } from 'path';
import { confirm, input } from '@inquirer/prompts';
import ora from 'ora';
import chalk from 'chalk';
import { colors } from '../core/branding.js';
import {
  isInitialized,
  readConfig,
  updateConfig,
  postsDir,
  capturesDir,
  buildPublicMdPath,
} from '../config/settings.js';
import {
  PROVIDER_ENV_KEYS,
  PROVIDER_NAMES,
  listAvailableProviders,
} from '../ai/providers.js';
import { resolveAiProviderForSession } from '../ai/provider-choice.js';
import { isGitRepo, getContext, getHeadSha } from '../ai/git.js';
import { draft as draftPosts } from '../ai/drafter.js';
import { captureScreenshot, describeScreenshotError, type ViewportPreset } from '../capture/screenshot.js';
import { PLATFORM_PRESET } from '../core/platform-presets.js';
import { pickAllVariants } from '../core/draft-flow.js';
import { recordVariantChoice, updatePreferences, getPostingHistory, recordPostResult } from '../memory/index.js';
import { checkStaleness } from './evolve.js';
import { getCadenceNudge } from '../core/cadence.js';
import { hasCredentials } from '../config/credentials.js';
import { saveManualExport } from './manual-export.js';
import { attemptPost, PLATFORMS } from './post.js';
import { showGitSummary } from './draft.js';
import type { DraftPost, GitContext, Platform, PlatformPost } from '../config/types.js';

const PLATFORM_LABELS: Record<Platform, string> = {
  x: 'X (Twitter)',
  linkedin: 'LinkedIn',
  reddit: 'Reddit',
  hackernews: 'HackerNews',
};

/** Collects (and offers to remember) the URL bip ship screenshots by default. */
async function resolvePreviewUrl(config: ReturnType<typeof readConfig>): Promise<string | undefined> {
  if (config.previewUrl) return config.previewUrl;

  const url = await input({
    message: 'URL to screenshot for these posts? (Enter to skip screenshots)',
  });
  if (!url.trim()) return undefined;

  const remember = await confirm({
    message: 'Save this URL so future `bip ship` runs don\'t ask again?',
    default: true,
  });
  if (remember) {
    updateConfig({ previewUrl: url.trim() });
  }
  return url.trim();
}

export async function shipCommand(options: {
  platforms?: string;
  provider?: string;
  focus?: string;
}): Promise<void> {
  if (!isInitialized()) {
    console.error('bip is not initialized. Run `bip init` first.');
    process.exit(1);
  }

  if (listAvailableProviders().length === 0) {
    const keys = Object.values(PROVIDER_ENV_KEYS).join(', ');
    console.error(`API key not set. Set one of: ${keys}`);
    process.exit(1);
  }

  const aiProvider = await resolveAiProviderForSession({ cliProvider: options.provider });
  if (!aiProvider) {
    const keys = Object.values(PROVIDER_ENV_KEYS).join(', ');
    console.error(`API key not set. Set one of: ${keys}`);
    process.exit(1);
  }

  if (!(await isGitRepo())) {
    console.error('This directory is not a git repository.');
    process.exit(1);
  }

  const config = readConfig();

  let platforms: Platform[];
  if (options.platforms) {
    platforms = options.platforms.split(',').map((p) => p.trim()) as Platform[];
  } else {
    const enabled = Object.entries(config.platforms)
      .filter(([, v]) => v?.enabled)
      .map(([k]) => k as Platform);
    platforms = enabled.length > 0 ? enabled : (['x', 'linkedin', 'reddit', 'hackernews'] as Platform[]);
  }

  const spinner = ora('Analyzing your changes...').start();
  let context: GitContext;
  try {
    context = await getContext(20, { baseline: config.lastPostedSha });
    spinner.stop();
  } catch (err) {
    spinner.fail('Failed to read git context');
    throw err;
  }

  const staleMessage = checkStaleness(buildPublicMdPath());
  if (staleMessage) {
    console.log(colors.warn(`  ${staleMessage}`));
  }
  const cadenceNudge = getCadenceNudge(config);
  if (cadenceNudge) {
    console.log(colors.warn(`  ⚠ ${cadenceNudge}`));
  }
  console.log(colors.dim(`  AI provider: ${PROVIDER_NAMES[aiProvider]}`));

  showGitSummary(context);
  const proceed = await confirm({
    message: 'Generate posts from this activity?',
    default: true,
  });
  if (!proceed) {
    console.log('Aborted.');
    return;
  }

  const focus = await input({
    message: 'Anything specific this post should focus on? (optional, Enter to skip)',
    default: '',
  });

  const genSpinner = ora(`Generating posts (${PROVIDER_NAMES[aiProvider]})...`).start();
  let variantGroups: PlatformPost[][];
  try {
    variantGroups = await draftPosts(context, platforms, {
      provider: aiProvider,
      focus: focus.trim() || undefined,
    });
    genSpinner.succeed('Posts generated!');
  } catch (err) {
    genSpinner.fail('Failed to generate posts');
    throw err;
  }

  const commitSummary = context.commits
    .slice(0, 3)
    .map((c) => c.split(' ').slice(2).join(' '))
    .join('; ')
    .slice(0, 120);

  const { accepted, pickResults } = await pickAllVariants(variantGroups);
  if (accepted.length === 0) {
    console.log('Nothing accepted, nothing to ship.');
    return;
  }

  // Screenshots: one per distinct platform preset among accepted posts,
  // using a saved (or just-collected) URL — never re-prompted per platform.
  const screenshotsByPreset = new Map<ViewportPreset, string>();
  const previewUrl = await resolvePreviewUrl(config);
  if (previewUrl) {
    const presets = Array.from(new Set(accepted.map((p) => PLATFORM_PRESET[p.platform])));
    for (const preset of presets) {
      const ssSpinner = ora(`Capturing ${preset} screenshot...`).start();
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const outPath = join(capturesDir(), `screenshot-${preset}-${timestamp}.png`);
      try {
        const saved = await captureScreenshot(previewUrl, outPath, { preset });
        ssSpinner.succeed(`${preset} screenshot saved`);
        screenshotsByPreset.set(preset, saved);
      } catch (err) {
        ssSpinner.fail(`${preset} screenshot failed: ${describeScreenshotError(err)}`);
      }
    }
  }

  // Save the draft in the same shape `bip draft` produces, so `bip post`
  // and `bip history` work identically on it afterward.
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const draftId = `draft-${timestamp}`;
  const allAttachments = Array.from(screenshotsByPreset.values());
  const draft: DraftPost = {
    id: draftId,
    createdAt: new Date().toISOString(),
    status: 'draft',
    postedTo: [],
    posts: accepted,
    attachments: allAttachments,
  };

  // Package: every accepted post gets a manual-export folder by default,
  // whether or not it also gets auto-posted below — the whole point is a
  // ready-to-grab bundle that exists regardless of what happens next.
  for (const post of accepted) {
    const shot = screenshotsByPreset.get(PLATFORM_PRESET[post.platform]);
    const dir = saveManualExport(draftId, post, shot ? [shot] : []);
    draft.manualExports = { ...draft.manualExports, [post.platform]: dir };
  }

  writeFileSync(join(postsDir(), `${draftId}.json`), JSON.stringify(draft, null, 2), 'utf-8');

  for (const result of pickResults) {
    recordVariantChoice({
      draftId,
      platform: result.post.platform,
      variantChosen: result.variantChosen,
      wasEdited: result.wasEdited,
      aiGeneratedText: result.aiOriginalText,
      userFinalText: result.post.text,
      commitSummary,
    });
  }
  const history = getPostingHistory();
  if (history.length > 0 && history.length % 5 === 0) {
    updatePreferences();
  }

  console.log();
  console.log(colors.success('Package ready: ') + chalk.green(join(postsDir(), draftId)));
  for (const post of accepted) {
    const hasShot = screenshotsByPreset.has(PLATFORM_PRESET[post.platform]);
    console.log(
      `  ${PLATFORM_LABELS[post.platform].padEnd(14)} — text${hasShot ? ' + screenshot' : ''} ready`
    );
  }

  // Per-platform auto-post, only where credentials exist, only with agreement.
  for (const post of accepted) {
    if (!hasCredentials(post.platform)) continue;
    const attachments = draft.attachments ?? [];
    const wantPost = await confirm({
      message: `Post to ${PLATFORM_LABELS[post.platform]} now?`,
      default: false,
    });
    if (!wantPost) continue;

    const result = await attemptPost(post, attachments, PLATFORMS[post.platform]);
    if (result.success) {
      draft.postedTo.push(post.platform);
      recordPostResult(draftId, post.platform, true);
      if (result.url) {
        draft.postResults = {
          ...draft.postResults,
          [post.platform]: { url: result.url, postedAt: new Date().toISOString() },
        };
      }
    } else {
      recordPostResult(draftId, post.platform, false);
    }
  }

  const allPosted = draft.posts.every((p) => draft.postedTo.includes(p.platform));
  draft.status = draft.postedTo.length === 0 ? 'draft' : allPosted ? 'posted' : 'partial';
  writeFileSync(join(postsDir(), `${draftId}.json`), JSON.stringify(draft, null, 2), 'utf-8');

  if (draft.postedTo.length > 0) {
    const headSha = await getHeadSha();
    updateConfig({
      ...(headSha ? { lastPostedSha: headSha } : {}),
      lastPostedAt: new Date().toISOString(),
    });
  }

  console.log();
  if (draft.postedTo.length > 0) {
    console.log(colors.success(`Posted automatically to: ${draft.postedTo.join(', ')}`));
  }
  const remaining = accepted.filter((p) => !draft.postedTo.includes(p.platform));
  if (remaining.length > 0) {
    console.log(
      colors.dim(`Ready for manual copy-paste: ${remaining.map((p) => p.platform).join(', ')}`)
    );
  }
  console.log(colors.dim(`Folder: ${join(postsDir(), draftId)}`));
}
