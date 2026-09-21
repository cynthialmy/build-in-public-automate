import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'fs';
import { join } from 'path';
import { select, confirm, input } from '@inquirer/prompts';
import { ensureDirectories, writeConfig, readConfig, postsDir, capturesDir } from '../../src/config/settings.js';
import * as git from '../../src/ai/git.js';
import * as drafter from '../../src/ai/drafter.js';
import * as providers from '../../src/ai/providers.js';
import * as providerChoice from '../../src/ai/provider-choice.js';
import { captureScreenshot } from '../../src/capture/screenshot.js';
import { shipCommand } from '../../src/commands/ship.js';

vi.mock('@inquirer/prompts', () => ({
  select: vi.fn(),
  confirm: vi.fn(),
  editor: vi.fn(),
  input: vi.fn(),
}));

vi.mock('../../src/capture/screenshot.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/capture/screenshot.js')>(
    '../../src/capture/screenshot.js'
  );
  return { ...actual, captureScreenshot: vi.fn().mockResolvedValue('/out/shot.png') };
});

const twitterMock = vi.hoisted(() => ({
  supportsAttachments: false,
  post: vi.fn(),
  postViaBrowser: vi.fn(),
}));
vi.mock('../../src/platforms/twitter.js', () => ({ TwitterPlatform: vi.fn(() => twitterMock) }));
vi.mock('../../src/platforms/linkedin.js', () => ({ LinkedInPlatform: vi.fn(() => ({ post: vi.fn(), postViaBrowser: vi.fn() })) }));
vi.mock('../../src/platforms/reddit.js', () => ({ RedditPlatform: vi.fn(() => ({ post: vi.fn(), postViaBrowser: vi.fn() })) }));
vi.mock('../../src/platforms/hackernews.js', () => ({ HackerNewsPlatform: vi.fn(() => ({ post: vi.fn(), postViaBrowser: vi.fn() })) }));

const mockGitContext = {
  branch: 'main',
  commits: ['abc1234 2026-01-01 feat: add thing'],
  changedFiles: ['a.ts'],
  diff: '',
  linesAdded: 1,
  linesRemoved: 0,
  commitsByType: {},
};

function savedDrafts() {
  return readdirSync(postsDir())
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(join(postsDir(), f), 'utf-8')));
}

describe('shipCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ensureDirectories();
    writeConfig({
      projectName: 'test-project',
      platforms: { x: { enabled: true } },
      postsDir: '.buildpublic-test/posts',
      capturesDir: '.buildpublic-test/captures',
    });
    vi.spyOn(git, 'isGitRepo').mockResolvedValue(true);
    vi.spyOn(git, 'getContext').mockResolvedValue(mockGitContext);
    vi.spyOn(git, 'getHeadSha').mockResolvedValue('abc1234');
    vi.spyOn(providers, 'listAvailableProviders').mockReturnValue(['anthropic']);
    vi.spyOn(providerChoice, 'resolveAiProviderForSession').mockResolvedValue('anthropic');
    vi.mocked(confirm).mockResolvedValue(true);
    vi.mocked(input).mockResolvedValue('');
    twitterMock.post.mockResolvedValue({ platform: 'x', success: true, url: 'https://x.com/1' });

    // captureScreenshot's mock resolves to a path saveManualExport (real fs)
    // then copies from, so it needs to actually exist on disk.
    const fakeShot = join(capturesDir(), 'shot.png');
    writeFileSync(fakeShot, 'fake-png-bytes');
    vi.mocked(captureScreenshot).mockResolvedValue(fakeShot);
  });

  it('exits when bip is not initialized', async () => {
    const { rmSync } = await import('fs');
    rmSync('.buildpublic-test', { recursive: true, force: true });
    vi.spyOn(process, 'exit').mockImplementation((code?: number) => {
      throw new Error(`process.exit(${code})`);
    });

    await expect(shipCommand({})).rejects.toThrow('process.exit(1)');
  });

  it('does nothing when nothing is accepted', async () => {
    vi.spyOn(drafter, 'draft').mockResolvedValue([[{ platform: 'x', text: 'only variant', variant: 1 }]]);
    vi.mocked(select).mockResolvedValue('skip');
    const logSpy = vi.spyOn(console, 'log');

    await shipCommand({});

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Nothing accepted'));
    expect(savedDrafts()).toHaveLength(0);
  });

  it('packages an accepted post into a manual-export folder without a screenshot URL', async () => {
    vi.spyOn(drafter, 'draft').mockResolvedValue([[{ platform: 'x', text: 'only variant', variant: 1 }]]);
    vi.mocked(select).mockResolvedValue('accept');
    // proceed=true, screenshot URL input stays '' (no capture, no "remember" prompt reached)

    await shipCommand({});

    const drafts = savedDrafts();
    expect(drafts).toHaveLength(1);
    expect(drafts[0].status).toBe('draft');
    expect(drafts[0].manualExports.x).toBeDefined();
    expect(existsSync(join(drafts[0].manualExports.x, 'post.txt'))).toBe(true);
    expect(captureScreenshot).not.toHaveBeenCalled();
  });

  it('uses a saved previewUrl without prompting, and screenshots automatically', async () => {
    writeConfig({
      projectName: 'test-project',
      platforms: { x: { enabled: true } },
      postsDir: '.buildpublic-test/posts',
      capturesDir: '.buildpublic-test/captures',
      previewUrl: 'https://example.com',
    });
    vi.spyOn(drafter, 'draft').mockResolvedValue([[{ platform: 'x', text: 'only variant', variant: 1 }]]);
    vi.mocked(select).mockResolvedValue('accept');

    await shipCommand({});

    expect(captureScreenshot).toHaveBeenCalledWith(
      'https://example.com',
      expect.any(String),
      expect.objectContaining({ preset: 'x' })
    );
    // Only the focus-text input should have been asked — no "URL to screenshot" prompt.
    expect(input).toHaveBeenCalledTimes(1);
  });

  it('saves a freshly entered screenshot URL to config when the user agrees', async () => {
    vi.spyOn(drafter, 'draft').mockResolvedValue([[{ platform: 'x', text: 'only variant', variant: 1 }]]);
    vi.mocked(select).mockResolvedValue('accept');
    vi.mocked(input)
      .mockResolvedValueOnce('') // focus
      .mockResolvedValueOnce('https://fresh.example.com'); // screenshot URL
    vi.mocked(confirm).mockResolvedValue(true); // proceed + "save this URL?"

    await shipCommand({});

    expect(readConfig().previewUrl).toBe('https://fresh.example.com');
  });

  it('does not prompt to auto-post when no credentials are configured', async () => {
    vi.spyOn(drafter, 'draft').mockResolvedValue([[{ platform: 'x', text: 'only variant', variant: 1 }]]);
    vi.mocked(select).mockResolvedValue('accept');

    await shipCommand({});

    expect(twitterMock.post).not.toHaveBeenCalled();
    const drafts = savedDrafts();
    expect(drafts[0].postedTo).toEqual([]);
  });

  it('auto-posts when credentials exist and the user agrees', async () => {
    writeConfig({
      projectName: 'test-project',
      platforms: { x: { enabled: true, credentials: { appKey: 'k', appSecret: 's', accessToken: 't', accessSecret: 'a' } } },
      postsDir: '.buildpublic-test/posts',
      capturesDir: '.buildpublic-test/captures',
    });
    vi.spyOn(drafter, 'draft').mockResolvedValue([[{ platform: 'x', text: 'only variant', variant: 1 }]]);
    vi.mocked(select).mockResolvedValue('accept');
    // proceed=true, "post to X now?"=true (confirm defaults to true throughout this test)

    await shipCommand({});

    expect(twitterMock.post).toHaveBeenCalled();
    const drafts = savedDrafts();
    expect(drafts[0].postedTo).toEqual(['x']);
    expect(drafts[0].status).toBe('posted');
    expect(git.getHeadSha).toHaveBeenCalled();
  });

  it('leaves the post for manual pickup when the user declines to auto-post', async () => {
    writeConfig({
      projectName: 'test-project',
      platforms: { x: { enabled: true, credentials: { appKey: 'k', appSecret: 's', accessToken: 't', accessSecret: 'a' } } },
      postsDir: '.buildpublic-test/posts',
      capturesDir: '.buildpublic-test/captures',
    });
    vi.spyOn(drafter, 'draft').mockResolvedValue([[{ platform: 'x', text: 'only variant', variant: 1 }]]);
    vi.mocked(select).mockResolvedValue('accept');
    vi.mocked(confirm)
      .mockResolvedValueOnce(true) // proceed
      .mockResolvedValueOnce(false); // "post to X now?" -> no

    await shipCommand({});

    expect(twitterMock.post).not.toHaveBeenCalled();
    const drafts = savedDrafts();
    expect(drafts[0].postedTo).toEqual([]);
    expect(drafts[0].manualExports.x).toBeDefined();
  });
});
