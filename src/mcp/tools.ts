import { join } from 'path';
import { isInitialized, readConfig, capturesDir, ensureDirectories } from '../config/settings.js';
import { hasCredentials } from '../config/credentials.js';
import { getCadenceNudge } from '../core/cadence.js';
import { loadAllDrafts } from '../core/drafts.js';
import { isGitRepo, getContext } from '../ai/git.js';
import { draft as draftPosts } from '../ai/drafter.js';
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
