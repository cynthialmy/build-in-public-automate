import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ensureDirectories, writeConfig } from '../../src/config/settings.js';
import { saveNewDraft } from '../../src/core/drafts.js';
import { metricsCommand } from '../../src/commands/metrics.js';

const twitterMock = vi.hoisted(() => ({ getMetrics: vi.fn() }));
const linkedinMock = vi.hoisted(() => ({})); // no getMetrics — LinkedIn isn't supported yet
const redditMock = vi.hoisted(() => ({ getMetrics: vi.fn() }));
const hackernewsMock = vi.hoisted(() => ({ getMetrics: vi.fn() }));

vi.mock('../../src/platforms/twitter.js', () => ({ TwitterPlatform: vi.fn(() => twitterMock) }));
vi.mock('../../src/platforms/linkedin.js', () => ({ LinkedInPlatform: vi.fn(() => linkedinMock) }));
vi.mock('../../src/platforms/reddit.js', () => ({ RedditPlatform: vi.fn(() => redditMock) }));
vi.mock('../../src/platforms/hackernews.js', () => ({ HackerNewsPlatform: vi.fn(() => hackernewsMock) }));

function markPosted(draftId: string, platform: 'x' | 'linkedin', url: string) {
  return {
    id: draftId,
    postResults: { [platform]: { url, postedAt: new Date().toISOString() } },
  };
}

describe('metricsCommand', () => {
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

  it('exits when bip is not initialized', async () => {
    const { rmSync } = await import('fs');
    rmSync('.buildpublic-test', { recursive: true, force: true });
    vi.spyOn(process, 'exit').mockImplementation((code?: number) => {
      throw new Error(`process.exit(${code})`);
    });

    await expect(metricsCommand()).rejects.toThrow('process.exit(1)');
  });

  it('reports nothing to show when no draft has postResults', async () => {
    saveNewDraft([{ platform: 'x', text: 'hello' }]); // never posted, no postResults
    const logSpy = vi.spyOn(console, 'log');

    await metricsCommand();

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('No posted drafts with tracked results yet'));
    expect(twitterMock.getMetrics).not.toHaveBeenCalled();
  });

  it('fetches and prints metrics for a platform that supports it', async () => {
    const draft = saveNewDraft([{ platform: 'x', text: 'hello' }]);
    const { writeFileSync } = await import('fs');
    const { join } = await import('path');
    const { postsDir } = await import('../../src/config/settings.js');
    writeFileSync(
      join(postsDir(), `${draft.id}.json`),
      JSON.stringify({ ...draft, ...markPosted(draft.id, 'x', 'https://x.com/1') }),
      'utf-8'
    );
    twitterMock.getMetrics.mockResolvedValue({ likes: 5, comments: 2, fetchedAt: new Date().toISOString() });
    const logSpy = vi.spyOn(console, 'log');

    await metricsCommand();

    expect(twitterMock.getMetrics).toHaveBeenCalledWith('https://x.com/1');
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('5 likes'));
  });

  it('reports unfetchable metrics without throwing when getMetrics resolves null', async () => {
    const draft = saveNewDraft([{ platform: 'x', text: 'hello' }]);
    const { writeFileSync } = await import('fs');
    const { join } = await import('path');
    const { postsDir } = await import('../../src/config/settings.js');
    writeFileSync(
      join(postsDir(), `${draft.id}.json`),
      JSON.stringify({ ...draft, ...markPosted(draft.id, 'x', 'https://x.com/1') }),
      'utf-8'
    );
    twitterMock.getMetrics.mockResolvedValue(null);
    const logSpy = vi.spyOn(console, 'log');

    await metricsCommand();

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Could not fetch metrics'));
  });

  it('counts a platform with no getMetrics as unsupported instead of erroring', async () => {
    const draft = saveNewDraft([{ platform: 'linkedin', text: 'hello' }]);
    const { writeFileSync } = await import('fs');
    const { join } = await import('path');
    const { postsDir } = await import('../../src/config/settings.js');
    writeFileSync(
      join(postsDir(), `${draft.id}.json`),
      JSON.stringify({ ...draft, ...markPosted(draft.id, 'linkedin', 'https://linkedin.com/1') }),
      'utf-8'
    );
    const logSpy = vi.spyOn(console, 'log');

    await metricsCommand();

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('skipped'));
  });
});
