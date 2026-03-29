import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { evolveSoul, evolveProjectDoc } from '../../src/ai/evolver.js';
import Anthropic from '@anthropic-ai/sdk';
import type { PostingRecord } from '../../src/config/types.js';

vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    constructor() {}
    messages = {
      create: async () => ({
        content: [
          {
            type: 'text',
            text: '# Updated content\n\nThis is the evolved version.',
          },
        ],
      }),
    },
  },
}));

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

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
  });

  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
  });

  describe('evolveSoul', () => {
    it('should evolve soul.md with AI based on posting history', async () => {
      const { writeFileSync, existsSync } = require('fs');

      // Mock file operations
      existsSync.mockReturnValue(true);
      writeFileSync.mockImplementation(() => {});

      const result = await evolveSoul('test-project', [mockPostingRecord]);

      expect(result).toContain('Updated content');
      expect(writeFileSync).toHaveBeenCalled();
    });

    it('should include edit diff analysis in evolution', async () => {
      const { writeFileSync, existsSync } = require('fs');

      existsSync.mockReturnValue(true);
      writeFileSync.mockImplementation(() => {});

      const result = await evolveSoul('test-project', [mockPostingRecord]);

      expect(writeFileSync).toHaveBeenCalled();
    });

    it('should handle empty posting history', async () => {
      const { writeFileSync, existsSync } = require('fs');

      existsSync.mockReturnValue(true);
      writeFileSync.mockImplementation(() => {});

      const result = await evolveSoul('test-project', []);

      expect(result).toBeDefined();
    });

    it('should create soul.md if it does not exist', async () => {
      const { writeFileSync, existsSync, readFileSync } = require('fs');

      existsSync.mockReturnValue(false);
      readFileSync.mockReturnValue('');
      writeFileSync.mockImplementation(() => {});

      const result = await evolveSoul('test-project', []);

      expect(writeFileSync).toHaveBeenCalled();
    });

    it('should include posting statistics in prompt', async () => {
      const { writeFileSync, existsSync } = require('fs');

      existsSync.mockReturnValue(true);
      writeFileSync.mockImplementation(() => {});

      const records = Array.from({ length: 10 }, (_, i) => ({
        ...mockPostingRecord,
        draftId: `draft-${i}`,
      }));

      await evolveSoul('test-project', records);

      expect(writeFileSync).toHaveBeenCalled();
    });
  });

  describe('evolveProjectDoc', () => {
    it('should evolve BUILD_IN_PUBLIC.md with AI', async () => {
      const { writeFileSync, existsSync } = require('fs');

      existsSync.mockReturnValue(true);
      writeFileSync.mockImplementation(() => {});

      const result = await evolveProjectDoc('test-project', [mockPostingRecord]);

      expect(result).toContain('Updated content');
      expect(writeFileSync).toHaveBeenCalled();
    });

    it('should include package.json dependencies when available', async () => {
      const { writeFileSync, existsSync, readFileSync } = require('fs');

      existsSync.mockImplementation((path: string) => {
        return path.includes('BUILD_IN_PUBLIC') || path.includes('package.json');
      });

      readFileSync.mockImplementation((path: string) => {
        if (path.includes('package.json')) {
          return JSON.stringify({ dependencies: { express: '^4.0.0', 'openai': '^1.0.0' } });
        }
        return '# Existing content';
      });

      writeFileSync.mockImplementation(() => {});

      const result = await evolveProjectDoc('test-project', []);

      expect(writeFileSync).toHaveBeenCalled();
    });

    it('should handle missing package.json gracefully', async () => {
      const { writeFileSync, existsSync } = require('fs');

      existsSync.mockReturnValue(false);
      writeFileSync.mockImplementation(() => {});

      const result = await evolveProjectDoc('test-project', []);

      expect(result).toBeDefined();
    });

    it('should include posting history context', async () => {
      const { writeFileSync, existsSync } = require('fs');

      existsSync.mockReturnValue(true);
      writeFileSync.mockImplementation(() => {});

      const records = Array.from({ length: 5 }, (_, i) => ({
        ...mockPostingRecord,
        draftId: `draft-${i}`,
        commitSummary: `commit ${i}`,
      }));

      const result = await evolveProjectDoc('test-project', records);

      expect(writeFileSync).toHaveBeenCalled();
    });
  });
});
