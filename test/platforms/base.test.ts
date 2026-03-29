import { describe, it, expect } from 'vitest';
import { makeError } from '../../src/platforms/base.js';
import type { PostResult } from '../../src/config/types.js';

describe('Platform Base', () => {
  describe('makeError', () => {
    it('should create error result from Error object', () => {
      const error = new Error('Failed to post to Twitter');
      const result = makeError('x', error);

      expect(result).toEqual({
        platform: 'x',
        success: false,
        error: 'Failed to post to Twitter',
      });
    });

    it('should create error result from string', () => {
      const error = 'Invalid credentials';
      const result = makeError('linkedin', error);

      expect(result).toEqual({
        platform: 'linkedin',
        success: false,
        error: 'Invalid credentials',
      });
    });

    it('should create error result from object', () => {
      const error = { message: 'Network error' };
      const result = makeError('reddit', error);

      // Object.toString() is used for objects, which returns "[object Object]"
      expect(result).toEqual({
        platform: 'reddit',
        success: false,
        error: '[object Object]',
      });
    });

    it('should create error result from number', () => {
      const error = 404;
      const result = makeError('hackernews', error);

      expect(result).toEqual({
        platform: 'hackernews',
        success: false,
        error: '404',
      });
    });

    it('should handle null error', () => {
      const error = null;
      const result = makeError('x', error);

      expect(result).toEqual({
        platform: 'x',
        success: false,
        error: 'null',
      });
    });

    it('should handle undefined error', () => {
      const error = undefined;
      const result = makeError('linkedin', error);

      expect(result).toEqual({
        platform: 'linkedin',
        success: false,
        error: 'undefined',
      });
    });

    it('should set correct platform in result', () => {
      const platforms: Array<PostResult['platform']> = ['x', 'linkedin', 'reddit', 'hackernews'];

      for (const platform of platforms) {
        const result = makeError(platform, new Error('test'));
        expect(result.platform).toBe(platform);
      }
    });

    it('should always set success to false', () => {
      const result1 = makeError('x', new Error('error 1'));
      const result2 = makeError('linkedin', new Error('error 2'));
      const result3 = makeError('reddit', 'string error');

      expect(result1.success).toBe(false);
      expect(result2.success).toBe(false);
      expect(result3.success).toBe(false);
    });

    it('should extract message from Error subclass', () => {
      class CustomError extends Error {
        constructor() {
          super('Custom error message');
          this.name = 'CustomError';
        }
      }

      const error = new CustomError();
      const result = makeError('x', error);

      expect(result.error).toBe('Custom error message');
    });

    it('should preserve error message with special characters', () => {
      const error = new Error('Error: API rate limit exceeded (429). Please retry after 60s.');
      const result = makeError('linkedin', error);

      expect(result.error).toContain('API rate limit exceeded');
      expect(result.error).toContain('429');
      expect(result.error).toContain('60s');
      expect(result.error).toContain('Please retry after');
    });

    it('should convert object with toString() to string', () => {
      const error = {
        name: 'ApiError',
        message: 'API failed',
        code: 500,
        toString: function () {
          return `ApiError: ${this.message} (code: ${this.code})`;
        },
      };
      const result = makeError('reddit', error);

      expect(result.error).toBe('ApiError: API failed (code: 500)');
    });
  });

  describe('IPlatform interface', () => {
    it('should define required interface structure', () => {
      // This test documents the expected interface structure
      // Actual implementations would be in platform-specific files

      const platform = {
        name: 'test-platform',
        hasApiCredentials: function (): boolean {
          return true;
        },
        postViaApi: async function (): Promise<PostResult> {
          return { platform: 'x', success: true, url: 'https://example.com' };
        },
        postViaBrowser: async function (): Promise<PostResult> {
          return { platform: 'x', success: true, url: 'https://example.com' };
        },
        post: async function (): Promise<PostResult> {
          return { platform: 'x', success: true, url: 'https://example.com' };
        },
      };

      expect(platform.name).toBe('test-platform');
      expect(typeof platform.hasApiCredentials).toBe('function');
      expect(typeof platform.postViaApi).toBe('function');
      expect(typeof platform.postViaBrowser).toBe('function');
      expect(typeof platform.post).toBe('function');
    });
  });
});
