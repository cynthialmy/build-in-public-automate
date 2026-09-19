import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RedditPlatform } from '../../src/platforms/reddit.js';
import * as credentials from '../../src/config/credentials.js';
import * as redditClient from '../../src/platforms/reddit-client.js';

vi.mock('../../src/config/credentials.js', () => ({
  getCredentials: vi.fn(),
}));

vi.mock('../../src/platforms/reddit-client.js', () => ({
  submitSelfPost: vi.fn(),
  getPostMetrics: vi.fn(),
}));

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
    vi.mocked(credentials.getCredentials).mockReturnValue(mockCreds as any);
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
