import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

vi.mock('../../src/config/credentials.js', () => ({
  getCredentials: vi.fn(),
}));

const gotoMock = vi.fn().mockResolvedValue(undefined);
const fillMock = vi.fn().mockResolvedValue(undefined);
const clickMock = vi.fn().mockResolvedValue(undefined);
const waitForURLMock = vi.fn().mockResolvedValue(undefined);
const waitForTimeoutMock = vi.fn().mockResolvedValue(undefined);
const countMock = vi.fn().mockResolvedValue(0);
const urlMock = vi.fn().mockReturnValue('https://news.ycombinator.com/item?id=555');
const storageStateMock = vi.fn().mockResolvedValue({ cookies: [] });
const closeMock = vi.fn().mockResolvedValue(undefined);

const page = {
  goto: gotoMock,
  fill: fillMock,
  click: clickMock,
  locator: vi.fn(() => ({ count: countMock })),
  waitForURL: waitForURLMock,
  waitForTimeout: waitForTimeoutMock,
  url: urlMock,
};

const newPageMock = vi.fn().mockResolvedValue(page);
const context = { newPage: newPageMock, storageState: storageStateMock };
const newContextMock = vi.fn().mockResolvedValue(context);
const launchMock = vi.fn().mockResolvedValue({ newContext: newContextMock, close: closeMock });

vi.mock('playwright', () => ({
  chromium: { launch: launchMock },
}));

const { HackerNewsPlatform } = await import('../../src/platforms/hackernews.js');
const { getCredentials } = vi.mocked(await import('../../src/config/credentials.js'));
const { existsSync } = vi.mocked(await import('fs'));

const HN_CREDS = { username: 'devuser', password: 'hunter2' };

describe('HackerNewsPlatform', () => {
  const platform = new HackerNewsPlatform();

  beforeEach(() => {
    vi.clearAllMocks();
    existsSync.mockReturnValue(false);
    countMock.mockResolvedValue(0);
    urlMock.mockReturnValue('https://news.ycombinator.com/item?id=555');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('hasApiCredentials', () => {
    it('is always false — HN has no submit API', () => {
      expect(platform.hasApiCredentials()).toBe(false);
    });
  });

  describe('postViaApi', () => {
    it('always returns a failure explaining there is no submit API', async () => {
      const result = await platform.postViaApi({ platform: 'hackernews', text: 'hi' });
      expect(result).toEqual({
        platform: 'hackernews',
        success: false,
        error: 'HackerNews does not have an official submit API. Use postViaBrowser.',
      });
    });
  });

  describe('postViaBrowser', () => {
    it('fails without launching a browser when credentials are missing', async () => {
      vi.mocked(getCredentials).mockReturnValue(undefined);

      const result = await platform.postViaBrowser({ platform: 'hackernews', text: 'hi' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('bip auth hackernews');
      expect(launchMock).not.toHaveBeenCalled();
    });

    it('logs in, submits a text post, and returns the resulting item URL', async () => {
      vi.mocked(getCredentials).mockReturnValue(HN_CREDS);
      countMock.mockResolvedValue(0); // not already logged in

      const result = await platform.postViaBrowser({
        platform: 'hackernews',
        text: 'body text',
        title: 'My Title',
      });

      expect(fillMock).toHaveBeenCalledWith('input[name="acct"]', 'devuser');
      expect(fillMock).toHaveBeenCalledWith('input[name="pw"]', 'hunter2');
      expect(fillMock).toHaveBeenCalledWith('input[name="title"]', 'My Title');
      expect(fillMock).toHaveBeenCalledWith('textarea[name="text"]', 'body text');
      expect(result).toEqual({
        platform: 'hackernews',
        success: true,
        url: 'https://news.ycombinator.com/item?id=555',
      });
      expect(closeMock).toHaveBeenCalled();
    });

    it('fills the url field instead of text when the post has a url', async () => {
      vi.mocked(getCredentials).mockReturnValue(HN_CREDS);
      countMock.mockResolvedValue(0);

      await platform.postViaBrowser({ platform: 'hackernews', text: 'ignored', url: 'https://example.com' });

      expect(fillMock).toHaveBeenCalledWith('input[name="url"]', 'https://example.com');
      expect(fillMock).not.toHaveBeenCalledWith('textarea[name="text"]', expect.anything());
    });

    it('skips the login flow when a saved session is already logged in', async () => {
      vi.mocked(getCredentials).mockReturnValue(HN_CREDS);
      existsSync.mockReturnValue(true);
      countMock.mockResolvedValue(1); // already logged in

      await platform.postViaBrowser({ platform: 'hackernews', text: 'hi' });

      expect(waitForURLMock).not.toHaveBeenCalled();
      expect(fillMock).not.toHaveBeenCalledWith('input[name="acct"]', expect.anything());
    });

    it('returns undefined url when the resulting page is not an item page', async () => {
      vi.mocked(getCredentials).mockReturnValue(HN_CREDS);
      urlMock.mockReturnValue('https://news.ycombinator.com/submit');

      const result = await platform.postViaBrowser({ platform: 'hackernews', text: 'hi' });

      expect(result).toEqual({ platform: 'hackernews', success: true, url: undefined });
    });

    it('returns a failure result and still closes the browser when a page action throws', async () => {
      vi.mocked(getCredentials).mockReturnValue(HN_CREDS);
      gotoMock.mockRejectedValueOnce(new Error('navigation timeout'));

      const result = await platform.postViaBrowser({ platform: 'hackernews', text: 'hi' });

      expect(result).toEqual({ platform: 'hackernews', success: false, error: 'navigation timeout' });
      expect(closeMock).toHaveBeenCalled();
    });
  });

  describe('post', () => {
    it('delegates to postViaBrowser', async () => {
      const spy = vi.spyOn(platform, 'postViaBrowser').mockResolvedValue({
        platform: 'hackernews',
        success: true,
      });

      await platform.post({ platform: 'hackernews', text: 'hi' });

      expect(spy).toHaveBeenCalled();
    });
  });

  describe('getMetrics', () => {
    it('fetches score and comment count from the public Firebase item API', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({ id: 123, score: 42, descendants: 7 }),
        })
      );

      const metrics = await platform.getMetrics('https://news.ycombinator.com/item?id=123');

      expect(global.fetch).toHaveBeenCalledWith(
        'https://hacker-news.firebaseio.com/v0/item/123.json'
      );
      expect(metrics).toEqual({
        likes: 42,
        comments: 7,
        fetchedAt: expect.any(String),
      });
    });

    it('returns null when the URL has no item id', async () => {
      const metrics = await platform.getMetrics('https://news.ycombinator.com/newest');
      expect(metrics).toBeNull();
    });

    it('returns null when the item has no score (deleted/dead item)', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({ ok: true, json: async () => null })
      );

      const metrics = await platform.getMetrics('https://news.ycombinator.com/item?id=999');
      expect(metrics).toBeNull();
    });

    it('returns null on a non-ok response instead of throwing', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));

      const metrics = await platform.getMetrics('https://news.ycombinator.com/item?id=999');
      expect(metrics).toBeNull();
    });

    it('returns null if fetch itself throws', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

      const metrics = await platform.getMetrics('https://news.ycombinator.com/item?id=999');
      expect(metrics).toBeNull();
    });
  });
});
