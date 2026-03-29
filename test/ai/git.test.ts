import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { isGitRepo, getContext } from '../../src/ai/git.js';

// Mock simple-git module
vi.mock('simple-git', () => {
  const mockSimpleGit = vi.fn();
  return {
    default: mockSimpleGit,
  };
});

describe('AI Git', () => {
  let simpleGitMock: any;

  beforeEach(() => {
    vi.clearAllMocks();
    simpleGitMock = require('simple-git').default;
  });

  describe('isGitRepo', () => {
    it('should return true when in a git repository', async () => {
      simpleGitMock.mockReturnValue({
        checkIsRepo: () => Promise.resolve(true),
      });

      const result = await isGitRepo();

      expect(result).toBe(true);
    });

    it('should return false when not in a git repository', async () => {
      simpleGitMock.mockReturnValue({
        checkIsRepo: () => Promise.resolve(false),
      });

      const result = await isGitRepo();

      expect(result).toBe(false);
    });

    it('should use process.cwd() as working directory', async () => {
      simpleGitMock.mockReturnValue({
        checkIsRepo: () => Promise.resolve(true),
      });

      await isGitRepo();

      expect(simpleGitMock).toHaveBeenCalledWith(process.cwd());
    });
  });

  describe('getContext', () => {
    it('should get git context with default depth', async () => {
      const mockGit = {
        log: vi.fn().mockResolvedValue({
          all: [
            { hash: 'abc1234', message: 'feat: add new feature', date: '2026-01-01' },
          ],
        }),
        diff: vi.fn().mockResolvedValue('+ new code\n- old code'),
        diffSummary: vi.fn().mockResolvedValue({
          files: ['src/index.ts'],
        }),
      };
      simpleGitMock.mockReturnValue(mockGit);

      const result = await getContext();

      expect(result.branch).toBeDefined();
      expect(result.commits).toHaveLength(1);
      expect(result.diff).toContain('+ new code');
    });

    it('should respect custom depth parameter', async () => {
      const mockGit = {
        log: vi.fn().mockResolvedValue({
          all: Array.from({ length: 5 }, (_, i) => ({
            hash: `hash${i}`,
            message: `commit ${i}`,
            date: '2026-01-01',
          })),
        }),
        diff: vi.fn().mockResolvedValue('diff'),
        diffSummary: vi.fn().mockResolvedValue({ files: [] }),
      };
      simpleGitMock.mockReturnValue(mockGit);

      const result = await getContext(5);

      expect(result.commits).toHaveLength(5);
    });

    it('should collect all changed files including renamed ones', async () => {
      const mockGit = {
        log: vi.fn().mockResolvedValue({ all: [] }),
        diff: vi.fn().mockResolvedValue('diff'),
        diffSummary: vi.fn().mockResolvedValue({
          files: ['src/index.ts', 'src/utils.ts'],
        }),
      };
      simpleGitMock.mockReturnValue(mockGit);

      const result = await getContext();

      expect(result.changedFiles).toEqual(['src/index.ts', 'src/utils.ts']);
    });

    it('should deduplicate changed files', async () => {
      const mockGit = {
        log: vi.fn().mockResolvedValue({ all: [] }),
        diff: vi.fn().mockResolvedValue('diff'),
        diffSummary: vi.fn().mockResolvedValue({
          files: ['src/index.ts', 'src/index.ts', 'src/utils.ts'],
        }),
      };
      simpleGitMock.mockReturnValue(mockGit);

      const result = await getContext();

      expect([...new Set(result.changedFiles)]).toEqual(result.changedFiles);
    });

    it('should count lines added and removed from diff', async () => {
      const mockGit = {
        log: vi.fn().mockResolvedValue({ all: [] }),
        diff: vi.fn().mockResolvedValue('+ line 1\n+ line 2\n- line 3\n- line 4\n+ line 5'),
        diffSummary: vi.fn().mockResolvedValue({ files: [] }),
      };
      simpleGitMock.mockReturnValue(mockGit);

      const result = await getContext();

      expect(result.linesAdded).toBe(3);
      expect(result.linesRemoved).toBe(2);
    });

    it('should not count diff markers (+ +++, - ---)', async () => {
      const mockGit = {
        log: vi.fn().mockResolvedValue({ all: [] }),
        diff: vi.fn().mockResolvedValue('+++ new\n--- old\n+ real add\n- real remove'),
        diffSummary: vi.fn().mockResolvedValue({ files: [] }),
      };
      simpleGitMock.mockReturnValue(mockGit);

      const result = await getContext();

      expect(result.linesAdded).toBe(1);
      expect(result.linesRemoved).toBe(1);
    });

    it('should truncate diff when it exceeds limit', async () => {
      const longDiff = '+ '.repeat(5000) + '- '.repeat(5000);
      const mockGit = {
        log: vi.fn().mockResolvedValue({ all: [] }),
        diff: vi.fn().mockResolvedValue(longDiff),
        diffSummary: vi.fn().mockResolvedValue({ files: [] }),
      };
      simpleGitMock.mockReturnValue(mockGit);

      const result = await getContext();

      expect(result.diff.length).toBeLessThan(longDiff.length);
    });

    it('should group commits by type', async () => {
      const mockGit = {
        log: vi.fn().mockResolvedValue({
          all: [
            { hash: '1', message: 'feat: add feature', date: '2026-01-01' },
            { hash: '2', message: 'fix: fix bug', date: '2026-01-01' },
            { hash: '3', message: 'docs: update readme', date: '2026-01-01' },
          ],
        }),
        diff: vi.fn().mockResolvedValue('diff'),
        diffSummary: vi.fn().mockResolvedValue({ files: [] }),
      };
      simpleGitMock.mockReturnValue(mockGit);

      const result = await getContext();

      expect(result.commitsByType.feat).toHaveLength(1);
      expect(result.commitsByType.fix).toHaveLength(1);
      expect(result.commitsByType.docs).toHaveLength(1);
    });

    it('should group commits with scope as type', async () => {
      const mockGit = {
        log: vi.fn().mockResolvedValue({
          all: [
            { hash: '1', message: 'auth: implement login', date: '2026-01-01' },
            { hash: '2', message: 'ui: add button', date: '2026-01-01' },
          ],
        }),
        diff: vi.fn().mockResolvedValue('diff'),
        diffSummary: vi.fn().mockResolvedValue({ files: [] }),
      };
      simpleGitMock.mockReturnValue(mockGit);

      const result = await getContext();

      expect(result.commitsByType.auth).toHaveLength(1);
      expect(result.commitsByType.ui).toHaveLength(1);
    });

    it('should group breaking changes', async () => {
      const mockGit = {
        log: vi.fn().mockResolvedValue({
          all: [
            { hash: '1', message: 'feat!: breaking change', date: '2026-01-01' },
          ],
        }),
        diff: vi.fn().mockResolvedValue('diff'),
        diffSummary: vi.fn().mockResolvedValue({ files: [] }),
      };
      simpleGitMock.mockReturnValue(mockGit);

      const result = await getContext();

      expect(result.commitsByType.feat).toHaveLength(1);
    });

    it('should group unknown commit types as "other"', async () => {
      const mockGit = {
        log: vi.fn().mockResolvedValue({
          all: [
            { hash: '1', message: 'random: random commit', date: '2026-01-01' },
          ],
        }),
        diff: vi.fn().mockResolvedValue('diff'),
        diffSummary: vi.fn().mockResolvedValue({ files: [] }),
      };
      simpleGitMock.mockReturnValue(mockGit);

      const result = await getContext();

      expect(result.commitsByType.other).toHaveLength(1);
    });

    it('should handle empty repository', async () => {
      const mockGit = {
        log: vi.fn().mockResolvedValue({ all: [] }),
        diff: vi.fn().mockResolvedValue(''),
        diffSummary: vi.fn().mockResolvedValue({ files: [] }),
      };
      simpleGitMock.mockReturnValue(mockGit);

      const result = await getContext();

      expect(result.commits).toHaveLength(0);
      expect(result.changedFiles).toHaveLength(0);
    });

    it('should fall back to git.diff() if git.diff(["HEAD"]) fails', async () => {
      const mockGit = {
        log: vi.fn().mockResolvedValue({ all: [] }),
        diff: vi.fn()
          .mockRejectedValueOnce(new Error('HEAD failed'))
          .mockResolvedValue('fallback diff'),
        diffSummary: vi.fn().mockResolvedValue({ files: [] }),
      };
      simpleGitMock.mockReturnValue(mockGit);

      const result = await getContext();

      expect(result.diff).toBe('fallback diff');
    });
  });
});
