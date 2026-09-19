import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { HackerNewsPlatform } from '../../src/platforms/hackernews.js';

describe('HackerNewsPlatform', () => {
  const platform = new HackerNewsPlatform();

  afterEach(() => {
    vi.unstubAllGlobals();
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
