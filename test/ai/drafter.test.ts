import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { draft, extractTextFromAiResponse } from '../../src/ai/drafter.js';
import type { GitContext, Platform, PlatformPost } from '../../src/config/types.js';

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

const { existsSync, readFileSync } = vi.mocked(await import('fs'));

function anthropicResponse(posts: PlatformPost[]) {
  return {
    ok: true,
    json: async () => ({
      content: [{ type: 'text', text: JSON.stringify(posts) }],
    }),
    text: async () => '',
  };
}

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

  const defaultPosts: PlatformPost[] = [
    { platform: 'x', variant: 1, text: 'Test post' },
    { platform: 'x', variant: 2, text: 'Test post variant 2' },
    { platform: 'linkedin', variant: 1, text: 'LinkedIn post' },
    { platform: 'linkedin', variant: 2, text: 'LinkedIn post variant 2' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    existsSync.mockReturnValue(false);
    process.env.ANTHROPIC_API_KEY = 'test-api-key';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(anthropicResponse(defaultPosts)));
  });

  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
    vi.unstubAllGlobals();
  });

  describe('draft', () => {
    it('calls the configured provider API and returns results', async () => {
      const result = await draft(mockGitContext, platforms);
      expect(result).toBeDefined();
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('sends requests to the Anthropic endpoint when ANTHROPIC_API_KEY is set', async () => {
      await draft(mockGitContext, platforms);
      const [url] = (global.fetch as any).mock.calls[0];
      expect(url).toBe('https://api.anthropic.com/v1/messages');
    });

    it('reads BUILD_IN_PUBLIC.md if it exists', async () => {
      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue('# Project\n\nDescription');

      await draft(mockGitContext, platforms);

      expect(readFileSync).toHaveBeenCalled();
    });

    it('does not throw if BUILD_IN_PUBLIC.md does not exist', async () => {
      existsSync.mockReturnValue(false);
      await expect(draft(mockGitContext, platforms)).resolves.toBeDefined();
    });

    it('groups results into one array per requested platform, preserving order', async () => {
      const result = await draft(mockGitContext, platforms);

      expect(result).toHaveLength(platforms.length);
      expect(result[0].every((p) => p.platform === 'x')).toBe(true);
      expect(result[1].every((p) => p.platform === 'linkedin')).toBe(true);
    });

    it('returns 2 variants for a platform when the provider returns 2', async () => {
      const result = await draft(mockGitContext, platforms);

      const xPosts = result.find((group) => group[0]?.platform === 'x') ?? [];
      expect(xPosts).toHaveLength(2);
    });

    it('returns an empty group for a requested platform with no posts back', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          anthropicResponse([{ platform: 'x', variant: 1, text: 'Only X' }])
        )
      );

      const result = await draft(mockGitContext, platforms);

      const linkedinPosts = result.find((_, i) => platforms[i] === 'linkedin');
      expect(linkedinPosts).toEqual([]);
    });

    it('handles an empty platforms array', async () => {
      const result = await draft(mockGitContext, []);
      expect(result).toEqual([]);
    });

    it('throws a descriptive error when the response is not parseable JSON', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({ content: [{ type: 'text', text: 'not json' }] }),
          text: async () => '',
        })
      );

      await expect(draft(mockGitContext, platforms)).rejects.toThrow(
        'Could not parse response as PlatformPost array'
      );
    });

    it('correctly parses a response containing threadParts (nested array)', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          anthropicResponse([
            {
              platform: 'x',
              variant: 1,
              text: 'Thread!',
              threadParts: ['first tweet', 'second tweet'],
            },
          ])
        )
      );

      const result = await draft(mockGitContext, ['x']);
      expect(result[0][0].threadParts).toEqual(['first tweet', 'second tweet']);
    });

    it('throws when no AI provider is configured', async () => {
      delete process.env.ANTHROPIC_API_KEY;
      await expect(draft(mockGitContext, platforms)).rejects.toThrow(
        'No AI provider configured'
      );
    });

    it('propagates an HTTP error from the provider', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 500,
          text: async () => 'internal error',
          json: async () => ({}),
        })
      );

      await expect(draft(mockGitContext, platforms)).rejects.toThrow(/500/);
    });
  });

  describe('extractTextFromAiResponse', () => {
    it('extracts text from an Anthropic-style response', () => {
      const text = extractTextFromAiResponse({ content: [{ text: 'hello' }] });
      expect(text).toBe('hello');
    });

    it('extracts text from an OpenAI-style response', () => {
      const text = extractTextFromAiResponse({
        choices: [{ message: { content: 'hi there' } }],
      });
      expect(text).toBe('hi there');
    });

    it('extracts text from a Gemini-style response', () => {
      const text = extractTextFromAiResponse({
        candidates: [{ content: { parts: [{ text: 'gemini says hi' }] } }],
      });
      expect(text).toBe('gemini says hi');
    });

    it('returns an empty string for an unrecognized shape', () => {
      expect(extractTextFromAiResponse({})).toBe('');
    });
  });
});
