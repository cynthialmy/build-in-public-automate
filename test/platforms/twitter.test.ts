import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TwitterApi } from 'twitter-api-v2';
import { getCredentials } from '../../src/config/credentials.js';
import { TwitterPlatform } from '../../src/platforms/twitter.js';

vi.mock('../../src/config/credentials.js', () => ({
  getCredentials: vi.fn(),
}));

const XCREDS = { appKey: 'k', appSecret: 's', accessToken: 't', accessSecret: 'ts' };

const tweetMock = vi.fn();
const meMock = vi.fn();
const uploadMediaMock = vi.fn();
const singleTweetMock = vi.fn();

vi.mock('twitter-api-v2', () => ({
  TwitterApi: vi.fn().mockImplementation(() => ({
    v1: { uploadMedia: uploadMediaMock },
    v2: { tweet: tweetMock, me: meMock, singleTweet: singleTweetMock },
  })),
}));

describe('TwitterPlatform', () => {
  const platform = new TwitterPlatform();

  beforeEach(() => {
    vi.clearAllMocks();
    tweetMock.mockResolvedValue({ data: { id: 'tweet-1' } });
    meMock.mockResolvedValue({ data: { username: 'devuser' } });
  });

  describe('hasApiCredentials', () => {
    it('is false with no credentials', () => {
      vi.mocked(getCredentials).mockReturnValue(undefined);
      expect(platform.hasApiCredentials()).toBe(false);
    });

    it('is false when any required field is missing', () => {
      vi.mocked(getCredentials).mockReturnValue({ ...XCREDS, appSecret: '' });
      expect(platform.hasApiCredentials()).toBe(false);
    });

    it('is true with a full credential set', () => {
      vi.mocked(getCredentials).mockReturnValue(XCREDS);
      expect(platform.hasApiCredentials()).toBe(true);
    });
  });

  describe('postViaApi', () => {
    beforeEach(() => {
      vi.mocked(getCredentials).mockReturnValue(XCREDS);
    });

    it('posts a single tweet and builds the status URL from the username', async () => {
      const result = await platform.postViaApi({ platform: 'x', text: 'hello world' });

      expect(TwitterApi).toHaveBeenCalledWith({
        appKey: 'k',
        appSecret: 's',
        accessToken: 't',
        accessSecret: 'ts',
      });
      expect(tweetMock).toHaveBeenCalledWith({ text: 'hello world' });
      expect(result).toEqual({ platform: 'x', success: true, url: 'https://x.com/devuser/status/tweet-1' });
    });

    it('posts each thread part as a reply to the previous tweet', async () => {
      tweetMock.mockResolvedValueOnce({ data: { id: 'tweet-1' } }).mockResolvedValueOnce({ data: { id: 'tweet-2' } });

      await platform.postViaApi({ platform: 'x', text: 'unused', threadParts: ['part one', 'part two'] });

      expect(tweetMock).toHaveBeenNthCalledWith(1, { text: 'part one' });
      expect(tweetMock).toHaveBeenNthCalledWith(2, {
        text: 'part two',
        reply: { in_reply_to_tweet_id: 'tweet-1' },
      });
    });

    it('uploads up to 4 attachments and attaches them to only the first tweet', async () => {
      uploadMediaMock.mockImplementation(async (path: string) => `media-${path}`);

      await platform.postViaApi({ platform: 'x', text: 'hello' }, ['a.png', 'b.png', 'c.png', 'd.png', 'e.png']);

      expect(uploadMediaMock).toHaveBeenCalledTimes(4);
      expect(tweetMock).toHaveBeenCalledWith({
        text: 'hello',
        media: { media_ids: ['media-a.png', 'media-b.png', 'media-c.png', 'media-d.png'] },
      });
    });

    it('returns a failure result instead of throwing when the API call fails', async () => {
      tweetMock.mockRejectedValue(new Error('rate limited'));

      const result = await platform.postViaApi({ platform: 'x', text: 'hello' });

      expect(result).toEqual({ platform: 'x', success: false, error: 'rate limited' });
    });
  });

  describe('post', () => {
    it('uses the API when credentials are configured', async () => {
      vi.mocked(getCredentials).mockReturnValue(XCREDS);
      const apiSpy = vi.spyOn(platform, 'postViaApi').mockResolvedValue({ platform: 'x', success: true });
      const browserSpy = vi.spyOn(platform, 'postViaBrowser').mockResolvedValue({ platform: 'x', success: true });

      await platform.post({ platform: 'x', text: 'hi' });

      expect(apiSpy).toHaveBeenCalled();
      expect(browserSpy).not.toHaveBeenCalled();
    });

    it('falls back to the browser when no API credentials are configured', async () => {
      vi.mocked(getCredentials).mockReturnValue(undefined);
      const apiSpy = vi.spyOn(platform, 'postViaApi');
      const browserSpy = vi.spyOn(platform, 'postViaBrowser').mockResolvedValue({ platform: 'x', success: true });

      await platform.post({ platform: 'x', text: 'hi' });

      expect(browserSpy).toHaveBeenCalled();
      expect(apiSpy).not.toHaveBeenCalled();
    });
  });

  describe('getMetrics', () => {
    it('returns null when the URL has no tweet id', async () => {
      expect(await platform.getMetrics('https://x.com/devuser')).toBeNull();
    });

    it('returns null without credentials, even for a valid URL', async () => {
      vi.mocked(getCredentials).mockReturnValue(undefined);
      expect(await platform.getMetrics('https://x.com/devuser/status/123')).toBeNull();
    });

    it('maps public_metrics into PostMetrics', async () => {
      vi.mocked(getCredentials).mockReturnValue(XCREDS);
      singleTweetMock.mockResolvedValue({
        data: {
          public_metrics: {
            like_count: 5,
            reply_count: 2,
            retweet_count: 1,
            quote_count: 1,
            impression_count: 100,
          },
        },
      });

      const metrics = await platform.getMetrics('https://x.com/devuser/status/123');

      expect(metrics).toMatchObject({ likes: 5, comments: 2, shares: 2, impressions: 100 });
    });

    it('returns null when the API call throws', async () => {
      vi.mocked(getCredentials).mockReturnValue(XCREDS);
      singleTweetMock.mockRejectedValue(new Error('not found'));

      expect(await platform.getMetrics('https://x.com/devuser/status/123')).toBeNull();
    });
  });
});
