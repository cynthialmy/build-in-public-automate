import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  recordVariantChoice,
  recordPostResult,
  updatePreferences,
  buildMemoryPromptSection,
  getEditDiffs,
  getPostingHistory,
} from '../../src/memory/index.js';
import type { Platform } from '../../src/config/types.js';
import { mkdirSync, rmdirSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const TEST_DIR = join(process.cwd(), '.buildpublic-test');

describe('Memory Module', () => {
  beforeEach(() => {
    // Clean up and create test directory
    if (existsSync(TEST_DIR)) {
      rmdirSync(TEST_DIR, { recursive: true, force: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });

    // Clear any cached history by re-importing
    vi.resetModules();
  });

  afterEach(() => {
    // Clean up after tests
    if (existsSync(TEST_DIR)) {
      rmdirSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  describe('recordVariantChoice', () => {
    it('should record a new variant choice', () => {
      const { writeFileSync } = require('fs');

      recordVariantChoice({
        draftId: 'test-draft-1',
        platform: 'x',
        variantChosen: 1,
        wasEdited: false,
        aiGeneratedText: 'AI generated post',
        userFinalText: 'AI generated post',
        commitSummary: 'feat: add feature',
      });

      const history = getPostingHistory();
      expect(history).toHaveLength(1);
      expect(history[0].draftId).toBe('test-draft-1');
      expect(history[0].platform).toBe('x');
      expect(history[0].variantChosen).toBe(1);
      expect(history[0].wasEdited).toBe(false);
      expect(history[0].postedSuccessfully).toBe(false);
    });

    it('should record edit diff when post was edited', () => {
      recordVariantChoice({
        draftId: 'test-draft-1',
        platform: 'x',
        variantChosen: 1,
        wasEdited: true,
        aiGeneratedText: 'AI generated post with hashtags #tech',
        userFinalText: 'User edited post',
        commitSummary: 'feat: add feature',
      });

      const history = getPostingHistory();
      expect(history[0].editDiff).toBeDefined();
      expect(history[0].editDiff!.aiGenerated).toContain('AI generated post');
      expect(history[0].editDiff!.userFinal).toContain('User edited post');
      expect(history[0].editDiff!.aiGenerated).toContain('#tech');
      expect(history[0].editDiff!.userFinal).not.toContain('#tech');
    });

    it('should truncate edit diff text to 200 characters', () => {
      const longText = 'a'.repeat(300);

      recordVariantChoice({
        draftId: 'test-draft-1',
        platform: 'x',
        variantChosen: 1,
        wasEdited: true,
        aiGeneratedText: longText,
        userFinalText: longText,
        commitSummary: 'feat: add feature',
      });

      const history = getPostingHistory();
      expect(history[0].editDiff!.aiGenerated.length).toBe(200);
      expect(history[0].editDiff!.userFinal.length).toBe(200);
    });

    it('should truncate text preview to 120 characters', () => {
      const longText = 'a'.repeat(200);

      recordVariantChoice({
        draftId: 'test-draft-1',
        platform: 'x',
        variantChosen: 1,
        wasEdited: false,
        aiGeneratedText: longText,
        userFinalText: longText,
        commitSummary: 'feat: add feature',
      });

      const history = getPostingHistory();
      expect(history[0].textPreview.length).toBe(120);
    });

    it('should append to existing history', () => {
      recordVariantChoice({
        draftId: 'test-draft-1',
        platform: 'x',
        variantChosen: 1,
        wasEdited: false,
        aiGeneratedText: 'Post 1',
        userFinalText: 'Post 1',
        commitSummary: 'feat: feature 1',
      });

      recordVariantChoice({
        draftId: 'test-draft-2',
        platform: 'linkedin',
        variantChosen: 2,
        wasEdited: true,
        aiGeneratedText: 'Post 2',
        userFinalText: 'Edited post 2',
        commitSummary: 'fix: bug 2',
      });

      const history = getPostingHistory();
      expect(history).toHaveLength(2);
      expect(history[0].draftId).toBe('test-draft-1');
      expect(history[1].draftId).toBe('test-draft-2');
    });

    it('should maintain FIFO when exceeding MAX_HISTORY', () => {
      // Record 55 entries (MAX_HISTORY is 50)
      for (let i = 0; i < 55; i++) {
        recordVariantChoice({
          draftId: `test-draft-${i}`,
          platform: 'x',
          variantChosen: i % 2 === 0 ? 1 : 2,
          wasEdited: i % 3 === 0,
          aiGeneratedText: `Post ${i}`,
          userFinalText: `Post ${i}`,
          commitSummary: `commit ${i}`,
        });
      }

      const history = getPostingHistory();
      expect(history).toHaveLength(50);
      expect(history[0].draftId).toBe('test-draft-5'); // First 5 removed
      expect(history[49].draftId).toBe('test-draft-54');
    });
  });

  describe('recordPostResult', () => {
    it('should update postedSuccessfully flag', () => {
      recordVariantChoice({
        draftId: 'test-draft-1',
        platform: 'x',
        variantChosen: 1,
        wasEdited: false,
        aiGeneratedText: 'Post',
        userFinalText: 'Post',
        commitSummary: 'feat: feature',
      });

      recordPostResult('test-draft-1', 'x', true);

      const history = getPostingHistory();
      expect(history[0].postedSuccessfully).toBe(true);
    });

    it('should update only matching record', () => {
      recordVariantChoice({
        draftId: 'test-draft-1',
        platform: 'x',
        variantChosen: 1,
        wasEdited: false,
        aiGeneratedText: 'Post',
        userFinalText: 'Post',
        commitSummary: 'feat: feature',
      });

      recordVariantChoice({
        draftId: 'test-draft-2',
        platform: 'x',
        variantChosen: 2,
        wasEdited: false,
        aiGeneratedText: 'Post 2',
        userFinalText: 'Post 2',
        commitSummary: 'fix: bug',
      });

      recordPostResult('test-draft-1', 'x', true);

      const history = getPostingHistory();
      expect(history[0].postedSuccessfully).toBe(true);
      expect(history[1].postedSuccessfully).toBe(false);
    });

    it('should handle different platforms for same draft', () => {
      recordVariantChoice({
        draftId: 'test-draft-1',
        platform: 'x',
        variantChosen: 1,
        wasEdited: false,
        aiGeneratedText: 'Post',
        userFinalText: 'Post',
        commitSummary: 'feat: feature',
      });

      recordVariantChoice({
        draftId: 'test-draft-1',
        platform: 'linkedin',
        variantChosen: 1,
        wasEdited: false,
        aiGeneratedText: 'LinkedIn post',
        userFinalText: 'LinkedIn post',
        commitSummary: 'feat: feature',
      });

      recordPostResult('test-draft-1', 'x', true);

      const history = getPostingHistory();
      const xRecord = history.find((r) => r.draftId === 'test-draft-1' && r.platform === 'x');
      const linkedinRecord = history.find((r) => r.draftId === 'test-draft-1' && r.platform === 'linkedin');
      expect(xRecord!.postedSuccessfully).toBe(true);
      expect(linkedinRecord!.postedSuccessfully).toBe(false);
    });

    it('should not create new record if draftId does not exist', () => {
      const initialLength = getPostingHistory().length;

      recordPostResult('non-existent-draft', 'x', true);

      expect(getPostingHistory().length).toBe(initialLength);
    });
  });

  describe('updatePreferences', () => {
    beforeEach(() => {
      // Create some history
      for (let i = 0; i < 10; i++) {
        recordVariantChoice({
          draftId: `draft-${i}`,
          platform: ['x', 'linkedin', 'reddit', 'hackernews'][i % 4] as Platform,
          variantChosen: i % 2 === 0 ? 1 : 2,
          wasEdited: i % 3 === 0,
          aiGeneratedText: `Post ${i}`,
          userFinalText: i % 3 === 0 ? `Edited ${i}` : `Post ${i}`,
          commitSummary: `commit ${i}`,
        });
      }
    });

    it('should calculate variant preferences per platform', () => {
      updatePreferences();

      const { readFileSync, existsSync } = require('fs');
      const prefsPath = join(TEST_DIR, 'memory', 'preferences.json');
      expect(existsSync(prefsPath)).toBe(true);

      const prefs = JSON.parse(readFileSync(prefsPath, 'utf-8'));
      expect(prefs.variantPreferences).toBeDefined();
      expect(prefs.variantPreferences.x).toBeDefined();
      expect(prefs.variantPreferences.linkedin).toBeDefined();
      expect(prefs.variantPreferences.reddit).toBeDefined();
      expect(prefs.variantPreferences.hackernews).toBeDefined();
    });

    it('should calculate edit rate', () => {
      updatePreferences();

      const { readFileSync } = require('fs');
      const prefs = JSON.parse(readFileSync(join(TEST_DIR, 'memory', 'preferences.json'), 'utf-8'));

      expect(prefs.editRate).toBeGreaterThanOrEqual(0);
      expect(prefs.editRate).toBeLessThanOrEqual(1);
      expect(prefs.editRate).toBeCloseTo(4 / 10, 1); // 4 of 10 were edited (0, 3, 6, 9)
    });

    it('should track recent topics', () => {
      updatePreferences();

      const { readFileSync } = require('fs');
      const prefs = JSON.parse(readFileSync(join(TEST_DIR, 'memory', 'preferences.json'), 'utf-8'));

      expect(prefs.recentTopics).toHaveLength(10);
      expect(prefs.recentTopics[0]).toBe('commit 0');
      expect(prefs.recentTopics[9]).toBe('commit 9');
    });

    it('should detect common edit patterns', () => {
      // Create edits that consistently remove hashtags
      for (let i = 0; i < 6; i++) {
        recordVariantChoice({
          draftId: `hashtag-draft-${i}`,
          platform: 'x',
          variantChosen: 1,
          wasEdited: true,
          aiGeneratedText: `Post ${i} #hashtag`,
          userFinalText: `Post ${i}`,
          commitSummary: `commit ${i}`,
        });
      }

      updatePreferences();

      const { readFileSync } = require('fs');
      const prefs = JSON.parse(readFileSync(join(TEST_DIR, 'memory', 'preferences.json'), 'utf-8'));

      expect(prefs.commonEdits).toContain('removes hashtags');
    });

    it('should detect shortening pattern', () => {
      // Create edits that consistently shorten text
      for (let i = 0; i < 6; i++) {
        recordVariantChoice({
          draftId: `shorten-draft-${i}`,
          platform: 'x',
          variantChosen: 1,
          wasEdited: true,
          aiGeneratedText: 'a'.repeat(200),
          userFinalText: 'a'.repeat(100),
          commitSummary: `commit ${i}`,
        });
      }

      updatePreferences();

      const { readFileSync } = require('fs');
      const prefs = JSON.parse(readFileSync(join(TEST_DIR, 'memory', 'preferences.json'), 'utf-8'));

      expect(prefs.commonEdits).toContain('shortens text');
    });

    it('should detect lengthening pattern', () => {
      // Create edits that consistently lengthen text
      for (let i = 0; i < 6; i++) {
        recordVariantChoice({
          draftId: `lengthen-draft-${i}`,
          platform: 'x',
          variantChosen: 1,
          wasEdited: true,
          aiGeneratedText: 'a'.repeat(100),
          userFinalText: 'a'.repeat(200),
          commitSummary: `commit ${i}`,
        });
      }

      updatePreferences();

      const { readFileSync } = require('fs');
      const prefs = JSON.parse(readFileSync(join(TEST_DIR, 'memory', 'preferences.json'), 'utf-8'));

      expect(prefs.commonEdits).toContain('expands text');
    });

    it('should detect emoji removal pattern', () => {
      // Create edits that consistently remove emojis
      for (let i = 0; i < 6; i++) {
        recordVariantChoice({
          draftId: `emoji-draft-${i}`,
          platform: 'x',
          variantChosen: 1,
          wasEdited: true,
          aiGeneratedText: `Post ${i} 🚀`,
          userFinalText: `Post ${i}`,
          commitSummary: `commit ${i}`,
        });
      }

      updatePreferences();

      const { readFileSync } = require('fs');
      const prefs = JSON.parse(readFileSync(join(TEST_DIR, 'memory', 'preferences.json'), 'utf-8'));

      expect(prefs.commonEdits).toContain('removes emoji');
    });

    it('should return early if no history exists', () => {
      // Clear history
      const { rmSync } = require('fs');
      const historyPath = join(TEST_DIR, 'memory', 'posting-history.json');
      if (existsSync(historyPath)) {
        rmSync(historyPath, { force: true });
      }

      expect(() => updatePreferences()).not.toThrow();

      const prefsPath = join(TEST_DIR, 'memory', 'preferences.json');
      expect(existsSync(prefsPath)).toBe(false);
    });
  });

  describe('buildMemoryPromptSection', () => {
    it('should return empty string if no preferences exist', () => {
      const section = buildMemoryPromptSection();
      expect(section).toBe('');
    });

    it('should build memory prompt with preferences', () => {
      // Create some history
      recordVariantChoice({
        draftId: 'test-draft-1',
        platform: 'x',
        variantChosen: 1,
        wasEdited: false,
        aiGeneratedText: 'Post',
        userFinalText: 'Post',
        commitSummary: 'feat: feature',
      });

      updatePreferences();

      const section = buildMemoryPromptSection();
      expect(section).toContain('Memory (your posting context)');
      expect(section).toContain('1 drafts generated');
      expect(section).toContain('You edit posts');
    });

    it('should include variant preferences for platforms with data', () => {
      for (let i = 0; i < 4; i++) {
        recordVariantChoice({
          draftId: `draft-${i}`,
          platform: 'x',
          variantChosen: i % 2 === 0 ? 1 : 2,
          wasEdited: false,
          aiGeneratedText: 'Post',
          userFinalText: 'Post',
          commitSummary: 'commit',
        });
      }

      updatePreferences();

      const section = buildMemoryPromptSection();
      expect(section).toContain('Variant preferences');
      expect(section).toContain('x:');
    });

    it('should include recent topics', () => {
      for (let i = 0; i < 5; i++) {
        recordVariantChoice({
          draftId: `draft-${i}`,
          platform: 'x',
          variantChosen: 1,
          wasEdited: false,
          aiGeneratedText: 'Post',
          userFinalText: 'Post',
          commitSummary: `Topic ${i}`,
        });
      }

      updatePreferences();

      const section = buildMemoryPromptSection();
      expect(section).toContain('Recent topics already covered');
      expect(section).toContain('Topic 0');
      expect(section).toContain('Topic 4');
    });

    it('should include common edit patterns', () => {
      for (let i = 0; i < 6; i++) {
        recordVariantChoice({
          draftId: `draft-${i}`,
          platform: 'x',
          variantChosen: 1,
          wasEdited: true,
          aiGeneratedText: 'Post #hashtag',
          userFinalText: 'Post',
          commitSummary: 'commit',
        });
      }

      updatePreferences();

      const section = buildMemoryPromptSection();
      expect(section).toContain('Common editing patterns');
      expect(section).toContain('removes hashtags');
    });

    it('should include last 3 text previews to avoid repetition', () => {
      for (let i = 0; i < 3; i++) {
        recordVariantChoice({
          draftId: `draft-${i}`,
          platform: 'x',
          variantChosen: 1,
          wasEdited: false,
          aiGeneratedText: `Preview text ${i}`,
          userFinalText: `Preview text ${i}`,
          commitSummary: 'commit',
        });
      }

      updatePreferences();

      const section = buildMemoryPromptSection();
      expect(section).toContain('Avoid repeating');
      expect(section).toContain('Preview text 0');
      expect(section).toContain('Preview text 2');
    });
  });

  describe('getEditDiffs', () => {
    it('should return empty array if no history', () => {
      const diffs = getEditDiffs();
      expect(diffs).toEqual([]);
    });

    it('should return only records with editDiffs', () => {
      recordVariantChoice({
        draftId: 'draft-1',
        platform: 'x',
        variantChosen: 1,
        wasEdited: true,
        aiGeneratedText: 'AI',
        userFinalText: 'User',
        commitSummary: 'commit',
      });

      recordVariantChoice({
        draftId: 'draft-2',
        platform: 'x',
        variantChosen: 2,
        wasEdited: false,
        aiGeneratedText: 'AI',
        userFinalText: 'User',
        commitSummary: 'commit',
      });

      recordVariantChoice({
        draftId: 'draft-3',
        platform: 'linkedin',
        variantChosen: 1,
        wasEdited: true,
        aiGeneratedText: 'AI',
        userFinalText: 'User',
        commitSummary: 'commit',
      });

      const diffs = getEditDiffs();
      expect(diffs).toHaveLength(2);
    });

    it('should return editDiffs with correct structure', () => {
      recordVariantChoice({
        draftId: 'draft-1',
        platform: 'x',
        variantChosen: 1,
        wasEdited: true,
        aiGeneratedText: 'AI generated #tag',
        userFinalText: 'User edited',
        commitSummary: 'commit',
      });

      const diffs = getEditDiffs();
      expect(diffs[0]).toHaveProperty('aiGenerated');
      expect(diffs[0]).toHaveProperty('userFinal');
      expect(diffs[0].aiGenerated).toContain('#tag');
      expect(diffs[0].userFinal).not.toContain('#tag');
    });
  });

  describe('getPostingHistory', () => {
    it('should return empty array if no history', () => {
      const history = getPostingHistory();
      expect(history).toEqual([]);
    });

    it('should return all records', () => {
      for (let i = 0; i < 5; i++) {
        recordVariantChoice({
          draftId: `draft-${i}`,
          platform: 'x',
          variantChosen: 1,
          wasEdited: false,
          aiGeneratedText: 'Post',
          userFinalText: 'Post',
          commitSummary: 'commit',
        });
      }

      const history = getPostingHistory();
      expect(history).toHaveLength(5);
    });

    it('should maintain chronological order', () => {
      for (let i = 0; i < 3; i++) {
        recordVariantChoice({
          draftId: `draft-${i}`,
          platform: 'x',
          variantChosen: 1,
          wasEdited: false,
          aiGeneratedText: 'Post',
          userFinalText: 'Post',
          commitSummary: 'commit',
        });
      }

      const history = getPostingHistory();
      expect(history[0].draftId).toBe('draft-0');
      expect(history[1].draftId).toBe('draft-1');
      expect(history[2].draftId).toBe('draft-2');
    });
  });
});
