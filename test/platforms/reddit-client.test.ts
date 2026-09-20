import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  RedditApiError,
  getMe,
  submitSelfPost,
  getPostMetrics,
} from '../../src/platforms/reddit-client.js';
import type { RedditCredentials } from '../../src/config/types.js';

const CREDS: RedditCredentials = {
  clientId: 'id',
  clientSecret: 'secret',
  username: 'devuser',
  password: 'pw',
};

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body, text: async () => JSON.stringify(body) };
}

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

describe('reddit-client', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  describe('token exchange (via getMe)', () => {
    it('throws a RedditApiError with the HTTP status when the token request fails', async () => {
      fetchMock.mockResolvedValue(jsonResponse({}, false, 401));

      await expect(getMe(CREDS)).rejects.toThrow(RedditApiError);
      await expect(getMe(CREDS)).rejects.toThrow(/HTTP 401/);
    });

    it('throws when the token response has no access_token', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'invalid_grant' }));

      await expect(getMe(CREDS)).rejects.toThrow(/invalid_grant/);
    });
  });

  describe('getMe', () => {
    it('returns the username on success', async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ access_token: 'tok' }))
        .mockResolvedValueOnce(jsonResponse({ name: 'devuser' }));

      await expect(getMe(CREDS)).resolves.toEqual({ name: 'devuser' });
    });

    it('throws when /me fails', async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ access_token: 'tok' }))
        .mockResolvedValueOnce(jsonResponse({}, false, 403));

      await expect(getMe(CREDS)).rejects.toThrow(/\/me failed/);
    });
  });

  describe('submitSelfPost', () => {
    const opts = { subreddit: 'webdev', title: 'Title', text: 'Body' };

    it('returns the permalink path from a full URL response', async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ access_token: 'tok' }))
        .mockResolvedValueOnce(
          jsonResponse({ json: { data: { url: 'https://www.reddit.com/r/webdev/comments/abc123/title/' } } })
        );

      await expect(submitSelfPost(CREDS, opts)).resolves.toEqual({
        permalink: '/r/webdev/comments/abc123/title/',
      });
    });

    it('passes through a relative permalink unchanged', async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ access_token: 'tok' }))
        .mockResolvedValueOnce(jsonResponse({ json: { data: { url: '/r/webdev/comments/abc123/title/' } } }));

      await expect(submitSelfPost(CREDS, opts)).resolves.toEqual({
        permalink: '/r/webdev/comments/abc123/title/',
      });
    });

    it('throws with Reddit\'s own error list when the submission is rejected', async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ access_token: 'tok' }))
        .mockResolvedValueOnce(
          jsonResponse({ json: { errors: [['RATELIMIT', 'you are doing that too much']] } })
        );

      await expect(submitSelfPost(CREDS, opts)).rejects.toThrow(/RATELIMIT: you are doing that too much/);
    });

    it('throws when the submission succeeds but returns no URL', async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ access_token: 'tok' }))
        .mockResolvedValueOnce(jsonResponse({ json: { data: {} } }));

      await expect(submitSelfPost(CREDS, opts)).rejects.toThrow(/no post URL/);
    });

    it('throws on an HTTP-level failure', async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ access_token: 'tok' }))
        .mockResolvedValueOnce(jsonResponse({}, false, 500));

      await expect(submitSelfPost(CREDS, opts)).rejects.toThrow(/submit failed/);
    });
  });

  describe('getPostMetrics', () => {
    it('returns score and comment count on success', async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ access_token: 'tok' }))
        .mockResolvedValueOnce(
          jsonResponse({ data: { children: [{ data: { score: 42, num_comments: 7 } }] } })
        );

      await expect(getPostMetrics(CREDS, 'abc123')).resolves.toEqual({ score: 42, numComments: 7 });
    });

    it('returns null on an HTTP-level failure instead of throwing', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ access_token: 'tok' })).mockResolvedValueOnce(
        jsonResponse({}, false, 404)
      );

      await expect(getPostMetrics(CREDS, 'abc123')).resolves.toBeNull();
    });

    it('returns null when the response has no post data', async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ access_token: 'tok' }))
        .mockResolvedValueOnce(jsonResponse({ data: { children: [] } }));

      await expect(getPostMetrics(CREDS, 'abc123')).resolves.toBeNull();
    });

    it('defaults numComments to 0 when absent', async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ access_token: 'tok' }))
        .mockResolvedValueOnce(jsonResponse({ data: { children: [{ data: { score: 3 } }] } }));

      await expect(getPostMetrics(CREDS, 'abc123')).resolves.toEqual({ score: 3, numComments: 0 });
    });
  });
});
