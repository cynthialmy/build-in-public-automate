import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { simpleGit } from 'simple-git';
import {
  isInitialized,
  readConfig,
  capturesDir,
  postsDir,
  buildPublicMdPath,
  soulPath,
  ensureDirectories,
} from '../config/settings.js';
import { hasCredentials } from '../config/credentials.js';
import { getCadenceNudge } from '../core/cadence.js';
import { loadAllDrafts, saveNewDraft } from '../core/drafts.js';
import { isGitRepo, getContext } from '../ai/git.js';
import { draft as draftPosts, buildDraftContext } from '../ai/drafter.js';
import {
  buildEvolveDocContext,
  buildEvolveSoulContext,
  stampEvolvedDate,
  type EvolveContext,
} from '../ai/evolver.js';
import { getEditDiffs, getPostingHistory } from '../memory/index.js';
import {
  captureScreenshot,
  describeScreenshotError,
  VIEWPORT_PRESETS,
  type CaptureOptions,
  type ViewportPreset,
} from '../capture/screenshot.js';
import { PROVIDER_ENV_KEYS, listAvailableProviders, type AIProvider } from '../ai/providers.js';
import type { Platform, PlatformPost } from '../config/types.js';

const ALL_PLATFORMS: Platform[] = ['x', 'linkedin', 'reddit', 'hackernews'];

function requireInitialized(): void {
  if (!isInitialized()) {
    throw new Error('bip is not initialized in this project. Run `bip init` first.');
  }
}

/**
 * Picks an AI provider without ever prompting — MCP tool calls have no
 * interactive terminal to prompt against, so ambiguity is an error instead
 * of a `select()` like the CLI's `resolveAiProviderForSession` would do.
 */
export function resolveProviderNonInteractive(cliProvider?: string): AIProvider {
  const available = listAvailableProviders();
  if (available.length === 0) {
    throw new Error(`No AI provider configured. Set one of: ${Object.values(PROVIDER_ENV_KEYS).join(', ')}`);
  }

  if (cliProvider?.trim()) {
    const id = cliProvider.trim().toLowerCase() as AIProvider;
    if (!(id in PROVIDER_ENV_KEYS)) {
      throw new Error(`Unknown AI provider "${cliProvider}". Valid: ${Object.keys(PROVIDER_ENV_KEYS).join(', ')}`);
    }
    if (!available.includes(id)) {
      throw new Error(`Provider "${id}" has no API key set (${PROVIDER_ENV_KEYS[id]}).`);
    }
    return id;
  }

  const forcedEnv = process.env.BIP_AI_PROVIDER?.toLowerCase() as AIProvider | undefined;
  if (forcedEnv && forcedEnv in PROVIDER_ENV_KEYS && available.includes(forcedEnv)) {
    return forcedEnv;
  }

  if (available.length === 1) {
    return available[0]!;
  }

  throw new Error(
    `Multiple AI providers available (${available.join(', ')}) — pass "provider" to pick one.`
  );
}

export interface StatusData {
  projectName: string;
  platforms: Record<Platform, boolean>;
  recentDrafts: { id: string; status: string; platforms: Platform[]; createdAt: string }[];
  cadenceNudge: string | null;
}

export function getStatusData(): StatusData {
  requireInitialized();
  const config = readConfig();

  const platforms = Object.fromEntries(
    ALL_PLATFORMS.map((p) => {
      let has = false;
      try {
        has = hasCredentials(p);
      } catch {
        /* not configured */
      }
      return [p, has];
    })
  ) as Record<Platform, boolean>;

  const recentDrafts = loadAllDrafts()
    .slice(0, 5)
    .map((d) => ({
      id: d.id,
      status: d.status,
      platforms: d.posts.map((p) => p.platform),
      createdAt: d.createdAt,
    }));

  return {
    projectName: config.projectName,
    platforms,
    recentDrafts,
    cadenceNudge: getCadenceNudge(config),
  };
}

export interface HistoryEntry {
  id: string;
  status: string;
  platforms: Platform[];
  preview: string;
  createdAt: string;
}

export function getHistoryData(limit = 10): HistoryEntry[] {
  requireInitialized();
  return loadAllDrafts()
    .slice(0, limit)
    .map((d) => ({
      id: d.id,
      status: d.status,
      platforms: d.posts.map((p) => p.platform),
      preview: (d.posts[0]?.text ?? '').slice(0, 200),
      createdAt: d.createdAt,
    }));
}

export interface ScreenshotToolInput extends CaptureOptions {
  url: string;
}

export async function runCaptureScreenshot(input: ScreenshotToolInput): Promise<string> {
  requireInitialized();
  if (input.preset && !(input.preset in VIEWPORT_PRESETS)) {
    throw new Error(`Unknown preset "${input.preset}". Choose one of: ${Object.keys(VIEWPORT_PRESETS).join(', ')}`);
  }

  ensureDirectories();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outPath = join(capturesDir(), `screenshot-${timestamp}.png`);

  try {
    return await captureScreenshot(input.url, outPath, {
      preset: input.preset as ViewportPreset | undefined,
      selector: input.selector,
      scale: input.scale,
      waitFor: input.waitFor,
      delay: input.delay,
      fullPage: input.fullPage,
    });
  } catch (err) {
    throw new Error(describeScreenshotError(err));
  }
}

export interface DraftPreviewInput {
  platforms?: Platform[];
  provider?: string;
  focus?: string;
}

export interface DraftPreviewResult {
  provider: AIProvider;
  variants: PlatformPost[][];
}

/**
 * Generates draft variants from current git activity without saving or
 * publishing anything — the picking/editing/attaching that `bip draft` does
 * interactively is a CLI-only concern, not something an MCP tool call can do.
 */
export async function runDraftPreview(input: DraftPreviewInput = {}): Promise<DraftPreviewResult> {
  if (!(await isGitRepo())) {
    throw new Error('This directory is not a git repository.');
  }

  const provider = resolveProviderNonInteractive(input.provider);
  const config = isInitialized() ? readConfig() : undefined;
  const platforms = input.platforms?.length ? input.platforms : ALL_PLATFORMS;

  const context = await getContext(20, { baseline: config?.lastPostedSha });
  const variants = await draftPosts(context, platforms, {
    provider,
    focus: input.focus?.trim() || undefined,
  });

  return { provider, variants };
}

export interface DraftContextInput {
  platforms?: Platform[];
  focus?: string;
}

export interface DraftContextResult {
  platforms: Platform[];
  systemPrompt: string;
  userPrompt: string;
}

/**
 * Assembles the git activity, project context, voice, and platform strategy
 * bip would normally send to its own LLM provider, without calling one.
 * Meant for a coding agent that is already running (Claude Code, Cursor,
 * Copilot) to draft the post itself with the model it already has, instead
 * of bip needing its own separate API key and cost.
 */
export async function getDraftContext(input: DraftContextInput = {}): Promise<DraftContextResult> {
  if (!(await isGitRepo())) {
    throw new Error('This directory is not a git repository.');
  }

  const config = isInitialized() ? readConfig() : undefined;
  const platforms = input.platforms?.length ? input.platforms : ALL_PLATFORMS;

  const context = await getContext(20, { baseline: config?.lastPostedSha });
  const { systemPrompt, userPrompt } = buildDraftContext(context, platforms, {
    focus: input.focus?.trim() || undefined,
  });

  return { platforms, systemPrompt, userPrompt };
}

export interface SaveDraftInput {
  posts: PlatformPost[];
  attachments?: string[];
}

export interface SaveDraftResult {
  id: string;
  path: string;
}

/**
 * Saves agent-authored posts as a real draft, in the same shape `bip draft`
 * produces interactively. Does not publish anything: `bip post` (or the
 * platform post/manual/skip flow inside it) is still required to actually
 * publish, same boundary as the rest of the MCP surface.
 */
export function runSaveDraft(input: SaveDraftInput): SaveDraftResult {
  requireInitialized();

  if (!Array.isArray(input.posts) || input.posts.length === 0) {
    throw new Error('posts must be a non-empty array of platform posts.');
  }
  for (const post of input.posts) {
    if (!ALL_PLATFORMS.includes(post.platform)) {
      throw new Error(`Unknown platform "${post.platform}". Valid: ${ALL_PLATFORMS.join(', ')}`);
    }
    if (!post.text?.trim()) {
      throw new Error(`Post for platform "${post.platform}" is missing text.`);
    }
  }

  ensureDirectories();
  const savedDraft = saveNewDraft(input.posts, input.attachments ?? []);
  return { id: savedDraft.id, path: join(postsDir(), `${savedDraft.id}.json`) };
}

/**
 * Assembles the same context `bip evolve` would send to an LLM provider,
 * without calling one. Lets a coding agent evolve BUILD_IN_PUBLIC.md itself.
 */
export async function getEvolveDocContext(): Promise<EvolveContext> {
  requireInitialized();
  const mdPath = buildPublicMdPath();
  if (!existsSync(mdPath)) {
    throw new Error('No BUILD_IN_PUBLIC.md found. Run `bip init` to create one.');
  }

  let gitLog: string;
  try {
    const log = await simpleGit(process.cwd()).log({ maxCount: 50 });
    gitLog = log.all.map((c) => `${c.hash.slice(0, 7)} ${c.date.slice(0, 10)} ${c.message}`).join('\n');
  } catch {
    gitLog = '(could not read git log)';
  }

  const pkgPath = join(process.cwd(), 'package.json');
  const packageJson = existsSync(pkgPath) ? readFileSync(pkgPath, 'utf-8') : null;
  const currentDoc = readFileSync(mdPath, 'utf-8');

  return buildEvolveDocContext(currentDoc, gitLog, packageJson, getPostingHistory());
}

/** Saves an agent-evolved BUILD_IN_PUBLIC.md, stamping today's "Last evolved" date. */
export function applyEvolvedDoc(content: string): { path: string } {
  requireInitialized();
  if (!content?.trim()) {
    throw new Error('content must be a non-empty BUILD_IN_PUBLIC.md body.');
  }
  const mdPath = buildPublicMdPath();
  writeFileSync(mdPath, stampEvolvedDate(content), 'utf-8');
  return { path: mdPath };
}

/**
 * Assembles the same context `bip soul evolve` would send to an LLM
 * provider, without calling one. Lets a coding agent evolve soul.md itself.
 */
export function getSoulEvolveContext(): EvolveContext {
  requireInitialized();
  const path = soulPath();
  if (!existsSync(path)) {
    throw new Error('No soul.md found. Run `bip soul` first to create one.');
  }

  const editDiffs = getEditDiffs();
  const history = getPostingHistory();
  if (editDiffs.length === 0 && history.length < 3) {
    throw new Error(
      'Not enough posting history to suggest soul evolution. Generate a few more drafts with bip draft and edit some posts first.'
    );
  }

  const currentSoul = readFileSync(path, 'utf-8');
  return buildEvolveSoulContext(currentSoul, editDiffs, history);
}

/** Saves an agent-evolved soul.md, stamping today's "Last evolved" date. */
export function applyEvolvedSoul(content: string): { path: string } {
  requireInitialized();
  if (!content?.trim()) {
    throw new Error('content must be a non-empty soul.md body.');
  }
  const path = soulPath();
  writeFileSync(path, stampEvolvedDate(content), 'utf-8');
  return { path };
}
