import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { select, confirm, input } from '@inquirer/prompts';
import { ensureDirectories, writeConfig, postsDir } from '../../src/config/settings.js';
import { saveNewDraft } from '../../src/core/drafts.js';
import { captureScreenshot } from '../../src/capture/screenshot.js';
import { getHeadSha } from '../../src/ai/git.js';
import { postCommand } from '../../src/commands/post.js';

vi.mock('@inquirer/prompts', () => ({
  select: vi.fn(),
  confirm: vi.fn(),
  input: vi.fn(),
}));

vi.mock('../../src/ai/git.js', () => ({
  getHeadSha: vi.fn().mockResolvedValue('abc1234'),
}));

vi.mock('../../src/capture/screenshot.js', () => ({
  captureScreenshot: vi.fn().mockResolvedValue('/out/shot.png'),
  describeScreenshotError: (err: unknown) => (err instanceof Error ? err.message : String(err)),
}));

const twitterMock = vi.hoisted(() => ({
  supportsAttachments: false,
  post: vi.fn(),
  postViaBrowser: vi.fn(),
}));
const linkedinMock = vi.hoisted(() => ({
  supportsAttachments: false,
  post: vi.fn(),
  postViaBrowser: vi.fn(),
}));
const redditMock = vi.hoisted(() => ({
  supportsAttachments: false,
  post: vi.fn(),
  postViaBrowser: vi.fn(),
}));
const hackernewsMock = vi.hoisted(() => ({
  supportsAttachments: false,
  post: vi.fn(),
  postViaBrowser: vi.fn(),
}));

vi.mock('../../src/platforms/twitter.js', () => ({ TwitterPlatform: vi.fn(() => twitterMock) }));
vi.mock('../../src/platforms/linkedin.js', () => ({ LinkedInPlatform: vi.fn(() => linkedinMock) }));
vi.mock('../../src/platforms/reddit.js', () => ({ RedditPlatform: vi.fn(() => redditMock) }));
vi.mock('../../src/platforms/hackernews.js', () => ({ HackerNewsPlatform: vi.fn(() => hackernewsMock) }));

function loadSavedDraft(id: string) {
  return JSON.parse(readFileSync(join(postsDir(), `${id}.json`), 'utf-8'));
}

describe('postCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ensureDirectories();
    writeConfig({
      projectName: 'test-project',
      platforms: {},
      postsDir: '.buildpublic-test/posts',
      capturesDir: '.buildpublic-test/captures',
    });
    twitterMock.post.mockResolvedValue({ platform: 'x', success: true, url: 'https://x.com/1' });
    linkedinMock.post.mockResolvedValue({ platform: 'linkedin', success: true });
  });

  it('reports no drafts when none exist', async () => {
    const logSpy = vi.spyOn(console, 'log');
    await postCommand();
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('No unposted drafts'));
    expect(twitterMock.post).not.toHaveBeenCalled();
  });

  it('exits when bip is not initialized', async () => {
    const { rmSync } = await import('fs');
    rmSync('.buildpublic-test', { recursive: true, force: true });
    vi.spyOn(process, 'exit').mockImplementation((code?: number) => {
      throw new Error(`process.exit(${code})`);
    });

    await expect(postCommand()).rejects.toThrow('process.exit(1)');
  });

  it('errors on an unknown platform filter', async () => {
    saveNewDraft([{ platform: 'x', text: 'hello' }]);
    vi.spyOn(process, 'exit').mockImplementation((code?: number) => {
      throw new Error(`process.exit(${code})`);
    });

    await expect(postCommand('bluesky')).rejects.toThrow('process.exit(1)');
  });

  it('dry-run previews without posting or prompting', async () => {
    saveNewDraft([{ platform: 'x', text: 'hello world' }]);

    await postCommand(undefined, { dryRun: true });

    expect(twitterMock.post).not.toHaveBeenCalled();
    expect(select).not.toHaveBeenCalled();
  });

  it('posts via the API when the user chooses "post" and marks the draft posted', async () => {
    const draft = saveNewDraft([{ platform: 'x', text: 'hello world' }]);
    vi.mocked(select).mockResolvedValue('post');

    await postCommand();

    expect(twitterMock.post).toHaveBeenCalledWith({ platform: 'x', text: 'hello world' }, []);
    const saved = loadSavedDraft(draft.id);
    expect(saved.status).toBe('posted');
    expect(saved.postedTo).toEqual(['x']);
    expect(saved.postResults.x.url).toBe('https://x.com/1');
  });

  it('falls back to the browser when the API fails and the user agrees', async () => {
    saveNewDraft([{ platform: 'x', text: 'hello world' }]);
    twitterMock.post.mockResolvedValue({ platform: 'x', success: false, error: 'API down' });
    twitterMock.postViaBrowser.mockResolvedValue({ platform: 'x', success: true });
    vi.mocked(select).mockResolvedValue('post');
    vi.mocked(confirm).mockResolvedValue(true); // "try browser instead?"

    await postCommand();

    expect(twitterMock.postViaBrowser).toHaveBeenCalled();
  });

  it('offers a manual export when both API and browser fail, and the user accepts', async () => {
    const draft = saveNewDraft([{ platform: 'x', text: 'hello world' }]);
    twitterMock.post.mockResolvedValue({ platform: 'x', success: false, error: 'API down' });
    twitterMock.postViaBrowser.mockResolvedValue({ platform: 'x', success: false, error: 'browser failed' });
    vi.mocked(select).mockResolvedValue('post');
    vi.mocked(confirm)
      .mockResolvedValueOnce(true) // "try browser instead?"
      .mockResolvedValueOnce(true) // "save for manual copy-paste instead?"
      .mockResolvedValueOnce(false); // "grab a screenshot to include?"

    await postCommand();

    const saved = loadSavedDraft(draft.id);
    expect(saved.manualExports.x).toContain(draft.id);
    expect(saved.status).toBe('partial');
  });

  it('saves a manual export directly when the user chooses "manual"', async () => {
    const draft = saveNewDraft([{ platform: 'x', text: 'hello world' }]);
    vi.mocked(select).mockResolvedValue('manual');
    vi.mocked(confirm).mockResolvedValue(false); // "grab a screenshot to include?"

    await postCommand();

    expect(twitterMock.post).not.toHaveBeenCalled();
    const saved = loadSavedDraft(draft.id);
    expect(saved.manualExports.x).toContain(draft.id);
  });

  it('skips already-posted platforms in a partially-posted draft', async () => {
    const draft = saveNewDraft([
      { platform: 'x', text: 'hello world' },
      { platform: 'linkedin', text: 'hello linkedin' },
    ]);
    const saved = loadSavedDraft(draft.id);
    saved.postedTo = ['x'];
    const { writeFileSync } = await import('fs');
    writeFileSync(join(postsDir(), `${draft.id}.json`), JSON.stringify(saved), 'utf-8');

    vi.mocked(select).mockResolvedValue('post');

    await postCommand();

    expect(twitterMock.post).not.toHaveBeenCalled();
    expect(linkedinMock.post).toHaveBeenCalled();
  });

  it('records the head SHA and timestamp as the next draft baseline after posting', async () => {
    saveNewDraft([{ platform: 'x', text: 'hello world' }]);
    vi.mocked(select).mockResolvedValue('post');

    await postCommand();

    expect(getHeadSha).toHaveBeenCalled();
  });
});
