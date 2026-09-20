import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ensureDirectories, writeConfig } from '../../src/config/settings.js';
import * as credentials from '../../src/config/credentials.js';
import * as providers from '../../src/ai/providers.js';
import * as git from '../../src/ai/git.js';
import * as drafter from '../../src/ai/drafter.js';
import { readFileSync } from 'fs';
import {
  getStatusData,
  getHistoryData,
  resolveProviderNonInteractive,
  runCaptureScreenshot,
  runDraftPreview,
  getDraftContext,
  runSaveDraft,
} from '../../src/mcp/tools.js';

vi.mock('../../src/config/credentials.js', () => ({
  hasCredentials: vi.fn(() => false),
}));

vi.mock('../../src/capture/screenshot.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/capture/screenshot.js')>(
    '../../src/capture/screenshot.js'
  );
  return { ...actual, captureScreenshot: vi.fn().mockResolvedValue('/tmp/shot.png') };
});

describe('resolveProviderNonInteractive', () => {
  // vi.clearAllMocks, not restoreAllMocks — restore would strip the
  // captureScreenshot mock's resolved value in a later describe block too,
  // since it has no "original" implementation to restore to.
  beforeEach(() => vi.clearAllMocks());

  it('throws when no provider is configured', () => {
    vi.spyOn(providers, 'listAvailableProviders').mockReturnValue([]);
    expect(() => resolveProviderNonInteractive()).toThrow(/No AI provider configured/);
  });

  it('returns the sole available provider when unambiguous', () => {
    vi.spyOn(providers, 'listAvailableProviders').mockReturnValue(['anthropic']);
    expect(resolveProviderNonInteractive()).toBe('anthropic');
  });

  it('throws instead of prompting when multiple providers are available and none is specified', () => {
    vi.spyOn(providers, 'listAvailableProviders').mockReturnValue(['anthropic', 'glm']);
    expect(() => resolveProviderNonInteractive()).toThrow(/Multiple AI providers available/);
  });

  it('honors an explicit provider argument', () => {
    vi.spyOn(providers, 'listAvailableProviders').mockReturnValue(['anthropic', 'glm']);
    expect(resolveProviderNonInteractive('glm')).toBe('glm');
  });

  it('rejects an unknown provider id', () => {
    vi.spyOn(providers, 'listAvailableProviders').mockReturnValue(['anthropic']);
    expect(() => resolveProviderNonInteractive('not-a-provider')).toThrow(/Unknown AI provider/);
  });

  it('rejects a provider with no API key set', () => {
    vi.spyOn(providers, 'listAvailableProviders').mockReturnValue(['anthropic']);
    expect(() => resolveProviderNonInteractive('glm')).toThrow(/has no API key set/);
  });
});

describe('getStatusData / getHistoryData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ensureDirectories();
    writeConfig({
      projectName: 'test-project',
      platforms: {},
      postsDir: '.buildpublic-test/posts',
      capturesDir: '.buildpublic-test/captures',
    });
  });

  it('reports project status with no drafts', () => {
    vi.mocked(credentials.hasCredentials).mockReturnValue(false);
    const status = getStatusData();
    expect(status.projectName).toBe('test-project');
    expect(status.platforms).toEqual({ x: false, linkedin: false, reddit: false, hackernews: false });
    expect(status.recentDrafts).toEqual([]);
  });

  it('returns an empty history when nothing has been drafted', () => {
    expect(getHistoryData()).toEqual([]);
  });
});

describe('runCaptureScreenshot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ensureDirectories();
    writeConfig({
      projectName: 'test-project',
      platforms: {},
      postsDir: '.buildpublic-test/posts',
      capturesDir: '.buildpublic-test/captures',
    });
  });

  it('rejects an unknown preset before touching the browser', async () => {
    await expect(runCaptureScreenshot({ url: 'https://example.com', preset: 'bogus' as never })).rejects.toThrow(
      /Unknown preset/
    );
  });

  it('delegates to captureScreenshot and returns its path', async () => {
    const path = await runCaptureScreenshot({ url: 'https://example.com', preset: 'og' });
    expect(path).toBe('/tmp/shot.png');
  });
});

describe('runDraftPreview', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects when not inside a git repo', async () => {
    vi.spyOn(git, 'isGitRepo').mockResolvedValue(false);
    await expect(runDraftPreview()).rejects.toThrow(/not a git repository/);
  });

  it('generates variants without saving anything', async () => {
    vi.spyOn(git, 'isGitRepo').mockResolvedValue(true);
    vi.spyOn(providers, 'listAvailableProviders').mockReturnValue(['anthropic']);
    vi.spyOn(git, 'getContext').mockResolvedValue({
      branch: 'main',
      commits: [],
      changedFiles: [],
      diff: '',
      linesAdded: 0,
      linesRemoved: 0,
      commitsByType: {},
    });
    const variants = [[{ platform: 'x' as const, text: 'hello' }]];
    vi.spyOn(drafter, 'draft').mockResolvedValue(variants);

    const result = await runDraftPreview({ platforms: ['x'] });
    expect(result.provider).toBe('anthropic');
    expect(result.variants).toBe(variants);
  });
});

describe('getDraftContext', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects when not inside a git repo', async () => {
    vi.spyOn(git, 'isGitRepo').mockResolvedValue(false);
    await expect(getDraftContext()).rejects.toThrow(/not a git repository/);
  });

  it('builds a system/user prompt without calling any AI provider', async () => {
    vi.spyOn(git, 'isGitRepo').mockResolvedValue(true);
    vi.spyOn(git, 'getContext').mockResolvedValue({
      branch: 'main',
      commits: ['abc123 2026-01-01 feat: add thing'],
      changedFiles: ['a.ts'],
      diff: '',
      linesAdded: 1,
      linesRemoved: 0,
      commitsByType: {},
    });
    const draftSpy = vi.spyOn(drafter, 'draft');

    const result = await getDraftContext({ platforms: ['x'], focus: 'the new capture presets' });

    expect(result.platforms).toEqual(['x']);
    expect(result.systemPrompt).toContain('build in public');
    expect(result.userPrompt).toContain('the new capture presets');
    expect(draftSpy).not.toHaveBeenCalled();
  });

  it('defaults to all platforms when none are given', async () => {
    vi.spyOn(git, 'isGitRepo').mockResolvedValue(true);
    vi.spyOn(git, 'getContext').mockResolvedValue({
      branch: 'main',
      commits: [],
      changedFiles: [],
      diff: '',
      linesAdded: 0,
      linesRemoved: 0,
      commitsByType: {},
    });
    const result = await getDraftContext();
    expect(result.platforms).toEqual(['x', 'linkedin', 'reddit', 'hackernews']);
  });
});

describe('runSaveDraft', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ensureDirectories();
    writeConfig({
      projectName: 'test-project',
      platforms: {},
      postsDir: '.buildpublic-test/posts',
      capturesDir: '.buildpublic-test/captures',
    });
  });

  it('rejects an empty posts array', () => {
    expect(() => runSaveDraft({ posts: [] })).toThrow(/non-empty array/);
  });

  it('rejects an unknown platform', () => {
    expect(() =>
      runSaveDraft({ posts: [{ platform: 'bluesky' as never, text: 'hi' }] })
    ).toThrow(/Unknown platform/);
  });

  it('rejects a post with no text', () => {
    expect(() => runSaveDraft({ posts: [{ platform: 'x', text: '  ' }] })).toThrow(/missing text/);
  });

  it('saves agent-authored posts as a real draft on disk', () => {
    const result = runSaveDraft({
      posts: [{ platform: 'x', text: 'shipped the new capture presets today' }],
      attachments: ['/tmp/shot.png'],
    });

    expect(result.id).toMatch(/^draft-/);
    const saved = JSON.parse(readFileSync(result.path, 'utf-8'));
    expect(saved.status).toBe('draft');
    expect(saved.postedTo).toEqual([]);
    expect(saved.posts).toEqual([{ platform: 'x', text: 'shipped the new capture presets today' }]);
    expect(saved.attachments).toEqual(['/tmp/shot.png']);
  });
});
