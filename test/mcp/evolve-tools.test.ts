import { describe, it, expect, vi, beforeEach } from 'vitest';
import { existsSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { simpleGit } from 'simple-git';
import { ensureDirectories, writeConfig } from '../../src/config/settings.js';
import * as memory from '../../src/memory/index.js';

const TEST_DIR = join(process.cwd(), '.buildpublic-test');
const MD_PATH = join(TEST_DIR, 'BUILD_IN_PUBLIC.md');
const SOUL_PATH = join(TEST_DIR, 'soul.md');

vi.mock('simple-git', () => ({ simpleGit: vi.fn() }));

vi.mock('../../src/config/settings.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/config/settings.js')>(
    '../../src/config/settings.js'
  );
  return {
    ...actual,
    buildPublicMdPath: () => MD_PATH,
    soulPath: () => SOUL_PATH,
  };
});

const {
  getEvolveDocContext,
  applyEvolvedDoc,
  getSoulEvolveContext,
  applyEvolvedSoul,
} = await import('../../src/mcp/tools.js');

const simpleGitMock = vi.mocked(simpleGit);

describe('evolve/soul agent-native context and apply', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ensureDirectories();
    writeConfig({
      projectName: 'test-project',
      platforms: {},
      postsDir: '.buildpublic-test/posts',
      capturesDir: '.buildpublic-test/captures',
    });
    simpleGitMock.mockReturnValue({
      log: vi.fn().mockResolvedValue({
        all: [{ hash: 'abc1234567', date: '2026-01-01T00:00:00Z', message: 'feat: add thing' }],
      }),
    } as never);
  });

  describe('getEvolveDocContext', () => {
    it('rejects when BUILD_IN_PUBLIC.md is missing', async () => {
      if (existsSync(MD_PATH)) rmSync(MD_PATH);
      await expect(getEvolveDocContext()).rejects.toThrow(/No BUILD_IN_PUBLIC.md found/);
    });

    it('builds a system/user prompt without calling any AI provider', async () => {
      writeFileSync(MD_PATH, '# Build In Public\n\nSome context here.', 'utf-8');
      vi.spyOn(memory, 'getPostingHistory').mockReturnValue([]);

      const result = await getEvolveDocContext();

      expect(result.systemPrompt).toContain('BUILD_IN_PUBLIC.md');
      expect(result.userPrompt).toContain('Some context here.');
      expect(result.userPrompt).toContain('feat: add thing');
    });
  });

  describe('applyEvolvedDoc', () => {
    it('rejects empty content', () => {
      expect(() => applyEvolvedDoc('   ')).toThrow(/non-empty/);
    });

    it('writes the content and stamps today\'s date', () => {
      const today = new Date().toISOString().slice(0, 10);
      const result = applyEvolvedDoc('<!-- Last evolved: 2020-01-01 -->\n\n# Doc\n');

      expect(result.path).toBe(MD_PATH);
      expect(readFileSync(MD_PATH, 'utf-8')).toContain(`<!-- Last evolved: ${today} -->`);
    });
  });

  describe('getSoulEvolveContext', () => {
    it('rejects when soul.md is missing', () => {
      if (existsSync(SOUL_PATH)) rmSync(SOUL_PATH);
      expect(() => getSoulEvolveContext()).toThrow(/No soul.md found/);
    });

    it('rejects when there is not enough posting history', () => {
      writeFileSync(SOUL_PATH, '# Voice\n', 'utf-8');
      vi.spyOn(memory, 'getEditDiffs').mockReturnValue([]);
      vi.spyOn(memory, 'getPostingHistory').mockReturnValue([]);

      expect(() => getSoulEvolveContext()).toThrow(/Not enough posting history/);
    });

    it('builds a system/user prompt when there is enough history', () => {
      writeFileSync(SOUL_PATH, '# Voice\n\nCasual and direct.', 'utf-8');
      vi.spyOn(memory, 'getEditDiffs').mockReturnValue([]);
      vi.spyOn(memory, 'getPostingHistory').mockReturnValue([
        { draftId: 'd1', createdAt: '', platform: 'x', variantChosen: 1, wasEdited: false, textPreview: '', commitSummary: 'shipped x', postedSuccessfully: true },
        { draftId: 'd2', createdAt: '', platform: 'x', variantChosen: 1, wasEdited: false, textPreview: '', commitSummary: 'shipped y', postedSuccessfully: true },
        { draftId: 'd3', createdAt: '', platform: 'x', variantChosen: 2, wasEdited: true, textPreview: '', commitSummary: 'shipped z', postedSuccessfully: true },
      ]);

      const result = getSoulEvolveContext();

      expect(result.systemPrompt).toContain('soul.md');
      expect(result.userPrompt).toContain('Casual and direct.');
    });
  });

  describe('applyEvolvedSoul', () => {
    it('rejects empty content', () => {
      expect(() => applyEvolvedSoul('')).toThrow(/non-empty/);
    });

    it('writes the content and stamps today\'s date', () => {
      const today = new Date().toISOString().slice(0, 10);
      const result = applyEvolvedSoul('<!-- Last evolved: 2020-01-01 -->\n\n# Voice\n');

      expect(result.path).toBe(SOUL_PATH);
      expect(readFileSync(SOUL_PATH, 'utf-8')).toContain(`<!-- Last evolved: ${today} -->`);
    });
  });
});
