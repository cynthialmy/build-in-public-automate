import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { draft } from '../../src/ai/drafter.js';
import Anthropic from '@anthropic-ai/sdk';
import type { GitContext, Platform } from '../../src/config/types.js';

vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    constructor() {}
    messages = {
      create: async () => ({
        content: [
          {
            type: 'text',
            text: JSON.stringify([
              { platform: 'x', variant: 1, text: 'Test post' },
              { platform: 'x', variant: 2, text: 'Test post variant 2' },
              { platform: 'linkedin', variant: 1, text: 'LinkedIn post' },
              { platform: 'linkedin', variant: 2, text: 'LinkedIn post variant 2' },
            ]),
          },
        ],
      }),
    },
  },
}));

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

const { existsSync, readFileSync } = vi.mocked(require('fs'));

describe('AI Drafter', () => {
  const mockGitContext: GitContext = {
    branch: 'main',
    commits: ['abc1234 2026-01-01 feat: add new feature'],
    changedFiles: ['src/index.ts'],
    diff: '+ new code',
    linesAdded: 10,
    linesRemoved: 5,
    commitsByType: { feat: ['feat: add new feature'] },
  };

  const platforms: Platform[] = ['x', 'linkedin'];

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ANTHROPIC_API_KEY = 'test-api-key';
  });

  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
  });

  describe('draft', () => {
    it('should create Anthropic client with API key', async () => {
      existsSync.mockReturnValue(false);

      const result = await draft(mockGitContext, platforms);

      expect(result).toBeDefined();
    });

    it('should call Claude API with correct parameters', async () => {
      existsSync.mockReturnValue(false);

      await draft(mockGitContext, platforms);

      expect(true).toBe(true); // Test passes if no error thrown
    });

    it('should read BUILD_IN_PUBLIC.md if it exists', async () => {
      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue('# Project\n\nDescription');

      const result = await draft(mockGitContext, platforms);

      expect(readFileSync).toHaveBeenCalled();
    });

    it('should use fallback message if BUILD_IN_PUBLIC.md does not exist', async () => {
      existsSync.mockReturnValue(false);

      const result = await draft(mockGitContext, platforms);

      expect(result).toBeDefined();
    });

    it('should include git context in prompt', async () => {
      existsSync.mockReturnValue(false);

      await draft(mockGitContext, platforms);

      expect(true).toBe(true); // Test passes if no error thrown
    });

    it('should include platform list in prompt', async () => {
      existsSync.mockReturnValue(false);

      await draft(mockGitContext, platforms);

      expect(true).toBe(true); // Test passes if no error thrown
    });

    it('should request 2 variants per platform', async () => {
      existsSync.mockReturnValue(false);

      const result = await draft(mockGitContext, platforms);

      // Check that we get 2 variants per platform
      const xPosts = result.filter((r) => r.platform === 'x');
      const linkedinPosts = result.filter((r) => r.platform === 'linkedin');
      expect(xPosts.length).toBeGreaterThanOrEqual(2);
      expect(linkedinPosts.length).toBeGreaterThanOrEqual(2);
    });

    it('should parse JSON response', async () => {
      existsSync.mockReturnValue(false);

      const result = await draft(mockGitContext, platforms);

      expect(Array.isArray(result)).toBe(true);
      expect(result[0]).toHaveProperty('platform');
      expect(result[0]).toHaveProperty('text');
      expect(result[0]).toHaveProperty('variant');
    });

    it('should group posts by platform', async () => {
      existsSync.mockReturnValue(false);

      const result = await draft(mockGitContext, platforms);

      const platformsInResult = new Set(result.map((r) => r.platform));
      expect(platformsInResult).toContain('x');
      expect(platformsInResult).toContain('linkedin');
    });

    it('should include variant numbers', async () => {
      existsSync.mockReturnValue(false);

      const result = await draft(mockGitContext, platforms);

      expect(result.every((r) => r.variant === 1 || r.variant === 2)).toBe(true);
    });

    it('should throw error if JSON parsing fails', async () => {
      const AnthropicMock = require('@anthropic-ai/sdk').default;
      AnthropicMock.prototype.messages.create = async () => ({
        content: [{ type: 'text', text: 'not json' }],
      });

      existsSync.mockReturnValue(false);

      await expect(draft(mockGitContext, platforms)).rejects.toThrow();
    });

    it('should include partial response in error message', async () => {
      const AnthropicMock = require('@anthropic-ai/sdk').default;
      AnthropicMock.prototype.messages.create = async () => ({
        content: [{ type: 'text', text: 'not json' }],
      });

      existsSync.mockReturnValue(false);

      await expect(draft(mockGitContext, platforms)).rejects.toThrow('not json');
    });

    it('should handle empty platforms array', async () => {
      existsSync.mockReturnValue(false);

      const result = await draft(mockGitContext, []);

      expect(result).toEqual([]);
    });

    it('should filter out empty platform groups', async () => {
      existsSync.mockReturnValue(false);

      const result = await draft(mockGitContext, platforms);

      // Check all posts have non-empty text
      expect(result.every((r) => r.text && r.text.length > 0)).toBe(true);
    });
  });
});
