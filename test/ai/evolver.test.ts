import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { evolveSoul, evolveProjectDoc } from '../../src/ai/evolver.js';
import type { PostingRecord } from '../../src/config/types.js';

function textResponse(text: string) {
  return {
    ok: true,
    json: async () => ({ content: [{ type: 'text', text }] }),
    text: async () => '',
  };
}

describe('AI Evolver', () => {
  const mockPostingRecord: PostingRecord = {
    draftId: 'test-draft-1',
    createdAt: '2026-01-01T00:00:00Z',
    platform: 'x',
    variantChosen: 1,
    wasEdited: true,
    textPreview: 'Just shipped a new feature',
    commitSummary: 'feat: add new feature',
    postedSuccessfully: true,
    editDiff: {
      aiGenerated: 'Just shipped a new feature! Check it out 🚀',
      userFinal: 'Just shipped a new feature',
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ANTHROPIC_API_KEY = 'test-api-key';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(textResponse('# Updated content\n\nThis is the evolved version.'))
    );
  });

  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
    vi.unstubAllGlobals();
  });

  describe('evolveSoul', () => {
    it('returns the AI-evolved soul.md content', async () => {
      const result = await evolveSoul('current soul content', [mockPostingRecord.editDiff!], [
        mockPostingRecord,
      ]);

      expect(result).toContain('Updated content');
    });

    it('handles empty posting history and edit diffs', async () => {
      const result = await evolveSoul('current soul content', [], []);
      expect(result).toBeDefined();
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('includes edit diffs and stats in the prompt sent to the provider', async () => {
      await evolveSoul('current soul content', [mockPostingRecord.editDiff!], [mockPostingRecord]);

      const [, requestInit] = (global.fetch as any).mock.calls[0];
      const body = JSON.parse(requestInit.body);
      const userMessage = body.messages.find((m: any) => m.role === 'user').content;

      expect(userMessage).toContain('Just shipped a new feature! Check it out');
      expect(userMessage).toContain('Total drafts: 1');
    });

    it('throws when no AI provider is configured', async () => {
      delete process.env.ANTHROPIC_API_KEY;
      await expect(evolveSoul('soul', [], [])).rejects.toThrow('No AI provider configured');
    });
  });

  describe('evolveProjectDoc', () => {
    it('returns the AI-evolved BUILD_IN_PUBLIC.md content', async () => {
      const result = await evolveProjectDoc(
        '# Build In Public',
        'abc1234 feat: add feature',
        JSON.stringify({ dependencies: { express: '^4.0.0' } }),
        [mockPostingRecord]
      );

      expect(result).toContain('Updated content');
    });

    it('handles a missing package.json gracefully', async () => {
      const result = await evolveProjectDoc('# Build In Public', 'abc1234 feat: x', null, []);
      expect(result).toBeDefined();
    });

    it('includes the git log and posting history in the prompt', async () => {
      await evolveProjectDoc(
        '# Build In Public',
        'abc1234 feat: add feature',
        null,
        [mockPostingRecord]
      );

      const [, requestInit] = (global.fetch as any).mock.calls[0];
      const body = JSON.parse(requestInit.body);
      const userMessage = body.messages.find((m: any) => m.role === 'user').content;

      expect(userMessage).toContain('abc1234 feat: add feature');
      expect(userMessage).toContain('feat: add new feature');
    });

    it('throws when no AI provider is configured', async () => {
      delete process.env.ANTHROPIC_API_KEY;
      await expect(evolveProjectDoc('doc', 'log', null, [])).rejects.toThrow(
        'No AI provider configured'
      );
    });
  });
});
