import { writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { select, confirm, editor, input } from '@inquirer/prompts';
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
import { recordVariantChoice, updatePreferences, getPostingHistory } from '../memory/index.js';
import { checkStaleness } from './evolve.js';
import { getCadenceNudge } from '../core/cadence.js';
import { getDraftContext, runSaveDraft } from '../mcp/tools.js';
import type { DraftPost, GitContext, Platform, PlatformPost } from '../config/types.js';

const PLATFORM_LABELS: Record<Platform, string> = {
  x: 'X (Twitter)',
  linkedin: 'LinkedIn',
  reddit: 'Reddit',
  hackernews: 'HackerNews',
};

/** Which capture preset matches each platform's card/preview dimensions. */
const PLATFORM_PRESET: Record<Platform, ViewportPreset> = {
  x: 'x',
  linkedin: 'linkedin',
  reddit: 'reddit',
  hackernews: 'hn',
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

interface PickResult {
  post: PlatformPost;
  variantChosen: 1 | 2;
  wasEdited: boolean;
  aiOriginalText: string;
}

async function pickVariant(variants: PlatformPost[]): Promise<PickResult | null> {
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
