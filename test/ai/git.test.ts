import { describe, it, expect, beforeEach, vi } from 'vitest';
import { simpleGit } from 'simple-git';
import { isGitRepo, getContext, getHeadSha } from '../../src/ai/git.js';

vi.mock('simple-git', () => ({
  simpleGit: vi.fn(),
}));

const simpleGitMock = vi.mocked(simpleGit);

type MockGit = {
  status: ReturnType<typeof vi.fn>;
  log: ReturnType<typeof vi.fn>;
  diff: ReturnType<typeof vi.fn>;
  raw: ReturnType<typeof vi.fn>;
  revparse: ReturnType<typeof vi.fn>;
};

/** A mock `simple-git` instance with a clean working tree and no baseline by default. */
function makeMockGit(overrides: Partial<MockGit> = {}): MockGit {
  return {
    status: vi.fn().mockResolvedValue({
      current: 'main',
      modified: [],
      created: [],
      deleted: [],
      renamed: [],
      staged: [],
    }),
    log: vi.fn().mockResolvedValue({ all: [] }),
    diff: vi.fn().mockResolvedValue(''),
    raw: vi.fn().mockRejectedValue(new Error('unknown revision')), // no baseline resolves by default
    revparse: vi.fn().mockResolvedValue('abc1234\n'),
    ...overrides,
  };
}

describe('AI Git', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('isGitRepo', () => {
    it('returns true when git.status() succeeds', async () => {
      simpleGitMock.mockReturnValue(makeMockGit() as any);
      expect(await isGitRepo()).toBe(true);
    });

    it('returns false when git.status() throws', async () => {
      simpleGitMock.mockReturnValue({
        status: vi.fn().mockRejectedValue(new Error('not a repo')),
      } as any);
      expect(await isGitRepo()).toBe(false);
    });

    it('uses process.cwd() as the working directory', async () => {
      simpleGitMock.mockReturnValue(makeMockGit() as any);
      await isGitRepo();
      expect(simpleGitMock).toHaveBeenCalledWith(process.cwd());
    });
  });

  describe('getContext', () => {
    it('returns branch, commits, and an empty diff for an empty repo', async () => {
      simpleGitMock.mockReturnValue(makeMockGit() as any);

      const result = await getContext();

      expect(result.branch).toBe('main');
      expect(result.commits).toHaveLength(0);
      expect(result.changedFiles).toHaveLength(0);
      expect(result.diff).toBe('');
    });

    it('respects a custom depth parameter passed to git.log', async () => {
      const log = vi.fn().mockResolvedValue({
        all: Array.from({ length: 5 }, (_, i) => ({
          hash: `hash${i}`,
          message: `commit ${i}`,
          date: '2026-01-01',
        })),
      });
      simpleGitMock.mockReturnValue(makeMockGit({ log }) as any);

      const result = await getContext(5);

      expect(log).toHaveBeenCalledWith({ maxCount: 5 });
      expect(result.commits).toHaveLength(5);
    });

    it('includes the working-tree diff (git diff HEAD)', async () => {
      const diff = vi.fn().mockResolvedValue('+ new code\n- old code');
      simpleGitMock.mockReturnValue(makeMockGit({ diff }) as any);

      const result = await getContext();

      expect(result.diff).toContain('+ new code');
      expect(diff).toHaveBeenCalledWith(['HEAD']);
    });

    it('falls back to git.diff() with no args if git.diff(["HEAD"]) fails', async () => {
      const diff = vi
        .fn()
        .mockRejectedValueOnce(new Error('HEAD failed'))
        .mockResolvedValue('fallback diff');
      simpleGitMock.mockReturnValue(makeMockGit({ diff }) as any);

      const result = await getContext();

      expect(result.diff).toBe('fallback diff');
    });

    it('diffs against config.lastPostedSha when it still resolves', async () => {
      const raw = vi.fn().mockResolvedValue(''); // rev-parse --verify succeeds
      const diff = vi.fn().mockImplementation((args: string[]) => {
        if (args[0] === '--name-only') return Promise.resolve('src/a.ts\nsrc/b.ts');
        if (args[0] === 'baseline123..HEAD') return Promise.resolve('+ committed change');
        return Promise.resolve(''); // working tree diff
      });
      simpleGitMock.mockReturnValue(makeMockGit({ raw, diff }) as any);

      const result = await getContext(20, { baseline: 'baseline123' });

      expect(raw).toHaveBeenCalledWith(['rev-parse', '--verify', '--quiet', 'baseline123^{commit}']);
      expect(result.diff).toContain('+ committed change');
      expect(result.changedFiles).toEqual(['src/a.ts', 'src/b.ts']);
    });

    it('falls back to the oldest commit in the log window when no baseline is given', async () => {
      const log = vi.fn().mockResolvedValue({
        all: [
          { hash: 'newest', message: 'feat: b', date: '2026-01-02' },
          { hash: 'oldest', message: 'feat: a', date: '2026-01-01' },
        ],
      });
      const diff = vi.fn().mockImplementation((args: string[]) => {
        if (args[0] === '--name-only') return Promise.resolve('src/a.ts');
        if (args[0] === 'oldest..HEAD') return Promise.resolve('+ range diff');
        return Promise.resolve('');
      });
      simpleGitMock.mockReturnValue(makeMockGit({ log, diff }) as any);

      const result = await getContext();

      expect(result.diff).toContain('+ range diff');
    });

    it('collects and dedupes changed files from working tree status', async () => {
      const status = vi.fn().mockResolvedValue({
        current: 'main',
        modified: ['a.ts', 'a.ts'],
        created: ['b.ts'],
        deleted: [],
        renamed: [{ from: 'old.ts', to: 'new.ts' }],
        staged: ['b.ts'],
      });
      simpleGitMock.mockReturnValue(makeMockGit({ status }) as any);

      const result = await getContext();

      expect(result.changedFiles).toEqual(['a.ts', 'b.ts', 'old.ts → new.ts']);
    });

    it('counts added/removed lines, ignoring +++/--- file headers', async () => {
      const diff = vi
        .fn()
        .mockResolvedValue('+++ new\n--- old\n+ real add\n- real remove\n+ another add');
      simpleGitMock.mockReturnValue(makeMockGit({ diff }) as any);

      const result = await getContext();

      expect(result.linesAdded).toBe(2);
      expect(result.linesRemoved).toBe(1);
    });

    it('truncates the diff when it exceeds the max length', async () => {
      const longDiff = '+line\n'.repeat(5000);
      const diff = vi.fn().mockResolvedValue(longDiff);
      simpleGitMock.mockReturnValue(makeMockGit({ diff }) as any);

      const result = await getContext();

      expect(result.diff.length).toBeLessThan(longDiff.length);
      expect(result.diff).toContain('[diff truncated]');
    });

    it('groups commits by conventional-commit type', async () => {
      const log = vi.fn().mockResolvedValue({
        all: [
          { hash: '1', message: 'feat: add feature', date: '2026-01-01' },
          { hash: '2', message: 'fix: fix bug', date: '2026-01-01' },
          { hash: '3', message: 'docs: update readme', date: '2026-01-01' },
          { hash: '4', message: 'random: uncategorized', date: '2026-01-01' },
        ],
      });
      simpleGitMock.mockReturnValue(makeMockGit({ log }) as any);

      const result = await getContext();

      expect(result.commitsByType.feat).toHaveLength(1);
      expect(result.commitsByType.fix).toHaveLength(1);
      expect(result.commitsByType.docs).toHaveLength(1);
      expect(result.commitsByType.other).toHaveLength(1);
    });
  });

  describe('getHeadSha', () => {
    it('returns the trimmed HEAD sha', async () => {
      simpleGitMock.mockReturnValue(makeMockGit() as any);
      expect(await getHeadSha()).toBe('abc1234');
    });

    it('returns null if rev-parse fails', async () => {
      simpleGitMock.mockReturnValue({
        revparse: vi.fn().mockRejectedValue(new Error('no commits yet')),
      } as any);
      expect(await getHeadSha()).toBeNull();
    });
  });
});
