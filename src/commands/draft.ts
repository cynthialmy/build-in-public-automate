import { writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { select, confirm, input } from '@inquirer/prompts';
import ora from 'ora';
import chalk from 'chalk';
import { colors, divider } from '../core/branding.js';
import {
  isInitialized,
  readConfig,
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
import { isGitRepo, getContext } from '../ai/git.js';
import { draft as draftPosts } from '../ai/drafter.js';
import { captureScreenshot, describeScreenshotError, type ViewportPreset } from '../capture/screenshot.js';
import { PLATFORM_PRESET } from '../core/platform-presets.js';
import { formatPost, pickAllVariants } from '../core/draft-flow.js';
import { recordVariantChoice, updatePreferences, getPostingHistory } from '../memory/index.js';
import { checkStaleness } from './evolve.js';
import { getCadenceNudge } from '../core/cadence.js';
import { getDraftContext, runSaveDraft } from '../mcp/tools.js';
import type { DraftPost, GitContext, Platform, PlatformPost } from '../config/types.js';

export function showGitSummary(context: GitContext): void {
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

export async function draftCommand(options: {
  platforms?: string;
  provider?: string;
  preview?: boolean;
  focus?: string;
  contextOnly?: boolean;
  apply?: string;
}): Promise<void> {
  // --context-only and --apply are the "draft with your coding agent"
  // path: no LLM key needed. --context-only prints the same context bip
  // would send to a provider, for the calling agent to draft with its own
  // model. --apply saves what that agent drafted, in the same shape the
  // interactive flow below saves. Neither calls bip's own AI provider.
  if (options.contextOnly) {
    if (!(await isGitRepo())) {
      console.error('This directory is not a git repository.');
      process.exit(1);
    }
    const platforms = options.platforms
      ? (options.platforms.split(',').map((p) => p.trim()) as Platform[])
      : undefined;
    const result = await getDraftContext({ platforms, focus: options.focus });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (options.apply) {
    if (!isInitialized()) {
      console.error('bip is not initialized. Run `bip init` first.');
      process.exit(1);
    }
    let payload: { posts: PlatformPost[]; attachments?: string[] };
    try {
      payload = JSON.parse(readFileSync(options.apply, 'utf-8'));
    } catch (err) {
      console.error(`Could not read/parse ${options.apply} as JSON: ${err instanceof Error ? err.message : err}`);
      process.exit(1);
    }
    try {
      const saved = runSaveDraft(payload);
      console.log(`\nDraft saved: ${chalk.green(saved.path)}`);
      console.log(`\nRun ${chalk.cyan('bip post')} to publish.`);
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
    return;
  }

  // --preview intentionally skips `bip init` entirely: it's the fastest way
  // to see what bip would write, with only an LLM key, before setting up
  // .buildpublic/, soul.md, or any social platform credentials.
  const initialized = isInitialized();
  if (!initialized && !options.preview) {
    console.error('bip is not initialized. Run `bip init` first (or try `bip draft --preview`).');
    process.exit(1);
  }

  if (listAvailableProviders().length === 0) {
    const keys = Object.values(PROVIDER_ENV_KEYS).join(', ');
    console.error(`API key not set. Set one of: ${keys}`);
    process.exit(1);
  }

  const aiProvider = await resolveAiProviderForSession({
    cliProvider: options.provider,
  });
  if (!aiProvider) {
    const keys = Object.values(PROVIDER_ENV_KEYS).join(', ');
    console.error(`API key not set. Set one of: ${keys}`);
    process.exit(1);
  }

  if (!(await isGitRepo())) {
    console.error('This directory is not a git repository.');
    process.exit(1);
  }

  const config = initialized ? readConfig() : undefined;

  // Determine which platforms to generate for
  let platforms: Platform[];
  if (options.platforms) {
    platforms = options.platforms.split(',').map((p) => p.trim()) as Platform[];
  } else if (options.preview) {
    // Keep the preview fast and focused — one platform's worth of taste,
    // not the full 4-platform generation a real draft would do.
    platforms = ['x'];
  } else {
    const enabled = Object.entries(config!.platforms)
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
    context = await getContext(20, { baseline: config?.lastPostedSha });
    spinner.stop();
  } catch (err) {
    spinner.fail('Failed to read git context');
    throw err;
  }

  if (options.preview) {
    console.log(
      colors.dim(`  AI provider: ${PROVIDER_NAMES[aiProvider]} (preview — nothing will be saved)`)
    );
    showGitSummary(context);

    const genSpinner = ora(`Generating preview (${PROVIDER_NAMES[aiProvider]})...`).start();
    let variantGroups: PlatformPost[][];
    try {
      variantGroups = await draftPosts(context, platforms, { provider: aiProvider });
      genSpinner.succeed('Preview generated!');
    } catch (err) {
      genSpinner.fail('Failed to generate preview');
      throw err;
    }

    for (const variants of variantGroups) {
      for (const post of variants) {
        console.log('\n' + formatPost(post));
      }
    }

    console.log();
    console.log(
      colors.dim('  This was a preview — nothing was saved. Run `bip init` to set up your project and start saving/publishing drafts.')
    );
    return;
  }

  // Check BUILD_IN_PUBLIC.md staleness
  const staleMessage = checkStaleness(buildPublicMdPath());
  if (staleMessage) {
    console.log(colors.warn(`  ${staleMessage}`));
  }

  const cadenceNudge = getCadenceNudge(config!); // preview (config-less) path already returned above
  if (cadenceNudge) {
    console.log(colors.warn(`  ⚠ ${cadenceNudge}`));
  }

  console.log(
    colors.dim(`  AI provider: ${PROVIDER_NAMES[aiProvider]}`)
  );

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

  // A quick back-and-forth so the draft isn't generic: what should this
  // particular post actually emphasize? Skippable — most runs won't need it.
  const focus = await input({
    message: 'Anything specific this post should focus on? (optional, Enter to skip)',
    default: '',
  });

  const genSpinner = ora(
    `Generating posts (${PROVIDER_NAMES[aiProvider]})...`
  ).start();
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

  // Build a commit summary for memory recording
  const commitSummary = context.commits
    .slice(0, 3)
    .map((c) => c.split(' ').slice(2).join(' '))
    .join('; ')
    .slice(0, 120);

  // Variant picker per platform
  const { accepted, pickResults } = await pickAllVariants(variantGroups);

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
    const url = await input({ message: 'URL to screenshot:' });

    // Crop to whichever platform(s) this draft is actually going to, instead
    // of always taking a generic full-page desktop dump.
    const presetChoices = Array.from(
      new Set(accepted.map((p) => PLATFORM_PRESET[p.platform]))
    ) as ViewportPreset[];
    const preset =
      presetChoices.length > 1
        ? await select<ViewportPreset>({
            message: 'Crop the screenshot for which platform?',
            choices: presetChoices.map((p) => ({ name: p, value: p })),
          })
        : presetChoices[0];

    const ssSpinner = ora('Capturing screenshot...').start();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outPath = join(capturesDir(), `screenshot-${timestamp}.png`);
    try {
      const saved = await captureScreenshot(url, outPath, { preset });
      ssSpinner.succeed(`Screenshot saved: ${saved}`);
      attachments.push(saved);
    } catch (err) {
      ssSpinner.fail(`Screenshot failed: ${describeScreenshotError(err)}`);
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

  // Record variant choices in memory
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

  // Update preferences every 5th draft
  const history = getPostingHistory();
  if (history.length > 0 && history.length % 5 === 0) {
    updatePreferences();
  }

  console.log(`\nDraft saved: ${chalk.green(draftPath)}`);
  console.log(`\nRun ${chalk.cyan('bip post')} to publish.`);
}
