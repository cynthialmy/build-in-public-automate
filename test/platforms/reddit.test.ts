import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ensureDirectories, writeConfig } from '../../src/config/settings.js';
import * as credentials from '../../src/config/credentials.js';
import * as redditClient from '../../src/platforms/reddit-client.js';

vi.mock('../../src/config/credentials.js', () => ({
  getCredentials: vi.fn(),
}));

vi.mock('../../src/platforms/reddit-client.js', () => ({
  submitSelfPost: vi.fn(),
  getPostMetrics: vi.fn(),
}));

const gotoMock = vi.fn().mockResolvedValue(undefined);
const fillMock = vi.fn().mockResolvedValue(undefined);
const clickMock = vi.fn().mockResolvedValue(undefined);
const waitForURLMock = vi.fn().mockResolvedValue(undefined);
const waitForTimeoutMock = vi.fn().mockResolvedValue(undefined);
const closeMock = vi.fn().mockResolvedValue(undefined);

const page = {
  goto: gotoMock,
  fill: fillMock,
  click: clickMock,
  waitForURL: waitForURLMock,
  waitForTimeout: waitForTimeoutMock,
};

const newPageMock = vi.fn().mockResolvedValue(page);
const newContextMock = vi.fn().mockResolvedValue({ newPage: newPageMock });
const launchMock = vi.fn().mockResolvedValue({ newContext: newContextMock, close: closeMock });

vi.mock('playwright', () => ({
  chromium: { launch: launchMock },
}));

const { RedditPlatform } = await import('../../src/platforms/reddit.js');

const mockCreds = {
  clientId: 'id',
  clientSecret: 'secret',
  username: 'user',
  password: 'pass',
};

describe('RedditPlatform', () => {
  const platform = new RedditPlatform();

  beforeEach(() => {
    vi.clearAllMocks();
    ensureDirectories();
    vi.mocked(credentials.getCredentials).mockReturnValue(mockCreds as any);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function withSubreddit(subreddit?: string) {
    writeConfig({
      projectName: 'test-project',
      platforms: subreddit ? { reddit: { defaultSubreddit: subreddit } as any } : {},
      postsDir: '.buildpublic-test/posts',
      capturesDir: '.buildpublic-test/captures',
    });
  }

  describe('hasApiCredentials', () => {
    it('is false when no credentials are stored', () => {
      vi.mocked(credentials.getCredentials).mockReturnValue(undefined);
      expect(platform.hasApiCredentials()).toBe(false);
    });

    it('is false when a required field is missing', () => {
      vi.mocked(credentials.getCredentials).mockReturnValue({ ...mockCreds, password: '' } as any);
      expect(platform.hasApiCredentials()).toBe(false);
    });

    it('is true with a full credential set', () => {
      expect(platform.hasApiCredentials()).toBe(true);
    });
  });

  describe('postViaApi', () => {
    it('fails when no default subreddit is configured', async () => {
      withSubreddit(undefined);

      const result = await platform.postViaApi({ platform: 'reddit', text: 'hi' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('No default subreddit configured');
      expect(redditClient.submitSelfPost).not.toHaveBeenCalled();
    });

    it('submits a self post and builds the permalink URL', async () => {
      withSubreddit('programming');
      vi.mocked(redditClient.submitSelfPost).mockResolvedValue({
        permalink: '/r/programming/comments/abc123/my_post/',
      } as any);

      const result = await platform.postViaApi({
        platform: 'reddit',
        text: 'body text',
        title: 'My Post',
      });

      expect(redditClient.submitSelfPost).toHaveBeenCalledWith(mockCreds, {
        subreddit: 'programming',
        title: 'My Post',
        text: 'body text',
      });
      expect(result).toEqual({
        platform: 'reddit',
        success: true,
        url: 'https://reddit.com/r/programming/comments/abc123/my_post/',
      });
    });

    it('falls back to a truncated title when the post has none', async () => {
      withSubreddit('programming');
      vi.mocked(redditClient.submitSelfPost).mockResolvedValue({ permalink: '/r/x/comments/1/y/' } as any);

      await platform.postViaApi({ platform: 'reddit', text: 'a'.repeat(100) });

      expect(redditClient.submitSelfPost).toHaveBeenCalledWith(
        mockCreds,
        expect.objectContaining({ title: 'a'.repeat(80) })
      );
    });

    it('returns a failure result when the API call throws', async () => {
      withSubreddit('programming');
      vi.mocked(redditClient.submitSelfPost).mockRejectedValue(new Error('rate limited'));

      const result = await platform.postViaApi({ platform: 'reddit', text: 'hi' });

      expect(result).toEqual({ platform: 'reddit', success: false, error: 'rate limited' });
    });
  });

  describe('postViaBrowser', () => {
    it('fails without launching a browser when credentials are missing', async () => {
      vi.mocked(credentials.getCredentials).mockReturnValue(undefined);
      withSubreddit('programming');

      const result = await platform.postViaBrowser({ platform: 'reddit', text: 'hi' });

      expect(result).toEqual({ platform: 'reddit', success: false, error: 'No credentials configured' });
      expect(launchMock).not.toHaveBeenCalled();
    });

    it('fails without launching a browser when no default subreddit is configured', async () => {
      withSubreddit(undefined);

      const result = await platform.postViaBrowser({ platform: 'reddit', text: 'hi' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('No default subreddit configured');
      expect(launchMock).not.toHaveBeenCalled();
    });

    it('logs in, submits a self post, and reports success', async () => {
      withSubreddit('programming');

      const result = await platform.postViaBrowser({
        platform: 'reddit',
        text: 'body text',
        title: 'My Post',
      });

      expect(fillMock).toHaveBeenCalledWith('#loginUsername', 'user');
      expect(fillMock).toHaveBeenCalledWith('#loginPassword', 'pass');
      expect(gotoMock).toHaveBeenCalledWith('https://www.reddit.com/r/programming/submit');
      expect(fillMock).toHaveBeenCalledWith('[placeholder="Title"]', 'My Post');
      expect(result).toEqual({ platform: 'reddit', success: true });
      expect(closeMock).toHaveBeenCalled();
    });

    it('returns a failure result and still closes the browser when a page action throws', async () => {
      withSubreddit('programming');
      gotoMock.mockRejectedValueOnce(new Error('navigation timeout'));

      const result = await platform.postViaBrowser({ platform: 'reddit', text: 'hi' });

      expect(result).toEqual({ platform: 'reddit', success: false, error: 'navigation timeout' });
      expect(closeMock).toHaveBeenCalled();
    });
  });

  describe('post', () => {
    it('uses the API when credentials are configured', async () => {
      const apiSpy = vi.spyOn(platform, 'postViaApi').mockResolvedValue({ platform: 'reddit', success: true });
      const browserSpy = vi.spyOn(platform, 'postViaBrowser').mockResolvedValue({ platform: 'reddit', success: true });

      await platform.post({ platform: 'reddit', text: 'hi' });

      expect(apiSpy).toHaveBeenCalled();
      expect(browserSpy).not.toHaveBeenCalled();
    });

    it('falls back to the browser when no API credentials are configured', async () => {
      vi.mocked(credentials.getCredentials).mockReturnValue(undefined);
      const apiSpy = vi.spyOn(platform, 'postViaApi');
      const browserSpy = vi.spyOn(platform, 'postViaBrowser').mockResolvedValue({ platform: 'reddit', success: true });

      await platform.post({ platform: 'reddit', text: 'hi' });

      expect(browserSpy).toHaveBeenCalled();
      expect(apiSpy).not.toHaveBeenCalled();
    });
  });

  describe('getMetrics', () => {
    it('extracts the base36 post id from a permalink and returns score/comments', async () => {
      vi.mocked(redditClient.getPostMetrics).mockResolvedValue({ score: 15, numComments: 3 });

      const metrics = await platform.getMetrics(
        'https://reddit.com/r/programming/comments/abc123/my_post_title/'
      );

      expect(redditClient.getPostMetrics).toHaveBeenCalledWith(mockCreds, 'abc123');
      expect(metrics).toEqual({ likes: 15, comments: 3, fetchedAt: expect.any(String) });
    });

    it('returns null when the URL has no /comments/<id>/ segment', async () => {
      const metrics = await platform.getMetrics('https://reddit.com/r/programming/');
      expect(metrics).toBeNull();
      expect(redditClient.getPostMetrics).not.toHaveBeenCalled();
    });

    it('returns null when credentials are not configured', async () => {
      vi.mocked(credentials.getCredentials).mockReturnValue(undefined);

      const metrics = await platform.getMetrics(
        'https://reddit.com/r/programming/comments/abc123/my_post_title/'
      );

      expect(metrics).toBeNull();
    });

    it('returns null if the underlying API call fails', async () => {
      vi.mocked(redditClient.getPostMetrics).mockRejectedValue(new Error('boom'));

      const metrics = await platform.getMetrics(
        'https://reddit.com/r/programming/comments/abc123/my_post_title/'
      );

      expect(metrics).toBeNull();
    });
  });
});
