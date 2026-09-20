import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { select, confirm, editor, input } from '@inquirer/prompts';
import { ensureDirectories, writeConfig, postsDir } from '../../src/config/settings.js';
import * as git from '../../src/ai/git.js';
import * as drafter from '../../src/ai/drafter.js';
import * as providers from '../../src/ai/providers.js';
import * as providerChoice from '../../src/ai/provider-choice.js';
import { captureScreenshot } from '../../src/capture/screenshot.js';
import { draftCommand } from '../../src/commands/draft.js';

vi.mock('@inquirer/prompts', () => ({
  select: vi.fn(),
  confirm: vi.fn(),
  editor: vi.fn(),
  input: vi.fn(),
}));

vi.mock('../../src/capture/screenshot.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/capture/screenshot.js')>(
    '../../src/capture/screenshot.js'
  );
  return { ...actual, captureScreenshot: vi.fn().mockResolvedValue('/out/shot.png') };
});

function exitError(code?: number) {
  return new Error(`process.exit(${code})`);
}

function savedDrafts() {
  return readdirSync(postsDir())
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(join(postsDir(), f), 'utf-8')));
}

const mockGitContext = {
  branch: 'main',
  commits: ['abc1234 2026-01-01 feat: add thing'],
  changedFiles: ['a.ts'],
  diff: '',
  linesAdded: 1,
  linesRemoved: 0,
  commitsByType: {},
};

describe('draftCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ensureDirectories();
    writeConfig({
      projectName: 'test-project',
      platforms: { x: { enabled: true } },
      postsDir: '.buildpublic-test/posts',
      capturesDir: '.buildpublic-test/captures',
    });
    vi.spyOn(git, 'isGitRepo').mockResolvedValue(true);
    vi.spyOn(git, 'getContext').mockResolvedValue(mockGitContext);
    vi.spyOn(providers, 'listAvailableProviders').mockReturnValue(['anthropic']);
    vi.spyOn(providerChoice, 'resolveAiProviderForSession').mockResolvedValue('anthropic');
    vi.mocked(confirm).mockResolvedValue(true);
    vi.mocked(input).mockResolvedValue('');
  });

  describe('--context-only', () => {
    it('exits when not inside a git repo', async () => {
      vi.spyOn(git, 'isGitRepo').mockResolvedValue(false);
      vi.spyOn(process, 'exit').mockImplementation((code?: number) => {
        throw exitError(code);
      });

      await expect(draftCommand({ contextOnly: true })).rejects.toThrow('process.exit(1)');
    });

    it('prints the draft context without calling any AI provider', async () => {
      const draftFn = vi.spyOn(drafter, 'draft');
      const logSpy = vi.spyOn(console, 'log');

      await draftCommand({ contextOnly: true, platforms: 'x' });

      expect(draftFn).not.toHaveBeenCalled();
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('systemPrompt'));
    });
  });

  describe('--apply', () => {
    it('exits when bip is not initialized', async () => {
      const { rmSync } = await import('fs');
      rmSync('.buildpublic-test', { recursive: true, force: true });
      vi.spyOn(process, 'exit').mockImplementation((code?: number) => {
        throw exitError(code);
      });

      await expect(draftCommand({ apply: '/tmp/nonexistent.json' })).rejects.toThrow('process.exit(1)');
    });

    it('exits when the file is not valid JSON', async () => {
      const { writeFileSync } = await import('fs');
      const badFile = join(process.cwd(), '.buildpublic-test', 'bad.json');
      writeFileSync(badFile, 'not json', 'utf-8');
      vi.spyOn(process, 'exit').mockImplementation((code?: number) => {
        throw exitError(code);
      });

      await expect(draftCommand({ apply: badFile })).rejects.toThrow('process.exit(1)');
    });

    it('saves the posts from a valid file as a real draft', async () => {
      const { writeFileSync } = await import('fs');
      const goodFile = join(process.cwd(), '.buildpublic-test', 'variants.json');
      writeFileSync(goodFile, JSON.stringify({ posts: [{ platform: 'x', text: 'hello from agent' }] }), 'utf-8');

      await draftCommand({ apply: goodFile });

      const drafts = savedDrafts();
      expect(drafts).toHaveLength(1);
      expect(drafts[0].posts).toEqual([{ platform: 'x', text: 'hello from agent' }]);
    });
  });

  it('exits when bip is not initialized and --preview is not set', async () => {
    const { rmSync } = await import('fs');
    rmSync('.buildpublic-test', { recursive: true, force: true });
    vi.spyOn(process, 'exit').mockImplementation((code?: number) => {
      throw exitError(code);
    });

    await expect(draftCommand({})).rejects.toThrow('process.exit(1)');
  });

  it('exits when no AI provider is configured', async () => {
    vi.spyOn(providers, 'listAvailableProviders').mockReturnValue([]);
    vi.spyOn(process, 'exit').mockImplementation((code?: number) => {
      throw exitError(code);
    });

    await expect(draftCommand({})).rejects.toThrow('process.exit(1)');
  });

  it('exits when not inside a git repo', async () => {
    vi.spyOn(git, 'isGitRepo').mockResolvedValue(false);
    vi.spyOn(process, 'exit').mockImplementation((code?: number) => {
      throw exitError(code);
    });

    await expect(draftCommand({})).rejects.toThrow('process.exit(1)');
  });

  describe('--preview', () => {
    it('prints generated posts without saving a draft, even without bip init', async () => {
      const { rmSync } = await import('fs');
      rmSync('.buildpublic-test', { recursive: true, force: true });
      ensureDirectories(); // recreate the bare .buildpublic-test dir postsDir() reads from
      vi.spyOn(drafter, 'draft').mockResolvedValue([[{ platform: 'x', text: 'preview post', variant: 1 }]]);
      const logSpy = vi.spyOn(console, 'log');

      await draftCommand({ preview: true });

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('preview post'));
      expect(savedDrafts()).toHaveLength(0);
    });
  });

  it('aborts without generating when the user declines to proceed', async () => {
    vi.mocked(confirm).mockResolvedValueOnce(false);
    const draftFn = vi.spyOn(drafter, 'draft');

    await draftCommand({});

    expect(draftFn).not.toHaveBeenCalled();
  });

  it('saves a single-variant post the user accepts', async () => {
    vi.spyOn(drafter, 'draft').mockResolvedValue([[{ platform: 'x', text: 'only variant', variant: 1 }]]);
    vi.mocked(confirm).mockResolvedValueOnce(true) // proceed
      .mockResolvedValueOnce(false); // attach screenshot? no
    vi.mocked(select).mockResolvedValue('accept');

    await draftCommand({});

    const drafts = savedDrafts();
    expect(drafts).toHaveLength(1);
    expect(drafts[0].posts).toEqual([{ platform: 'x', text: 'only variant', variant: 1 }]);
  });

  it('discards everything when the user skips every platform', async () => {
    vi.spyOn(drafter, 'draft').mockResolvedValue([[{ platform: 'x', text: 'only variant', variant: 1 }]]);
    vi.mocked(select).mockResolvedValue('skip');
    const logSpy = vi.spyOn(console, 'log');

    await draftCommand({});

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('No posts accepted'));
    expect(savedDrafts()).toHaveLength(0);
  });

  it('picks a specific variant out of two and saves it', async () => {
    vi.spyOn(drafter, 'draft').mockResolvedValue([
      [
        { platform: 'x', text: 'variant one', variant: 1 },
        { platform: 'x', text: 'variant two', variant: 2 },
      ],
    ]);
    vi.mocked(select).mockResolvedValueOnce('2'); // pick variant 2
    vi.mocked(confirm).mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    await draftCommand({});

    const drafts = savedDrafts();
    expect(drafts[0].posts[0].text).toBe('variant two');
  });

  it('lets the user edit a variant before saving', async () => {
    vi.spyOn(drafter, 'draft').mockResolvedValue([
      [
        { platform: 'x', text: 'variant one', variant: 1 },
        { platform: 'x', text: 'variant two', variant: 2 },
      ],
    ]);
    vi.mocked(select).mockResolvedValueOnce('e1'); // edit variant 1
    vi.mocked(editor).mockResolvedValue('hand-edited text');
    vi.mocked(confirm).mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    await draftCommand({});

    const drafts = savedDrafts();
    expect(drafts[0].posts[0].text).toBe('hand-edited text');
  });

  it('attaches a screenshot cropped to the accepted platform', async () => {
    vi.spyOn(drafter, 'draft').mockResolvedValue([[{ platform: 'x', text: 'only variant', variant: 1 }]]);
    vi.mocked(select).mockResolvedValue('accept');
    vi.mocked(confirm)
      .mockResolvedValueOnce(true) // proceed
      .mockResolvedValueOnce(true); // attach screenshot? yes
    vi.mocked(input).mockResolvedValue('https://example.com');

    await draftCommand({});

    expect(captureScreenshot).toHaveBeenCalledWith(
      'https://example.com',
      expect.any(String),
      expect.objectContaining({ preset: 'x' })
    );
    const drafts = savedDrafts();
    expect(drafts[0].attachments).toEqual(['/out/shot.png']);
  });
});
