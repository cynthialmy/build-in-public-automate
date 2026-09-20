import { describe, it, expect, vi, beforeEach } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { input, select, editor, confirm } from '@inquirer/prompts';
import { ensureDirectories, writeConfig, soulPath } from '../../src/config/settings.js';
import * as providers from '../../src/ai/providers.js';
import * as providerChoice from '../../src/ai/provider-choice.js';
import * as evolver from '../../src/ai/evolver.js';
import * as memory from '../../src/memory/index.js';
import { soulCommand, soulEvolveCommand } from '../../src/commands/soul.js';

vi.mock('@inquirer/prompts', () => ({
  input: vi.fn(),
  select: vi.fn(),
  editor: vi.fn(),
  confirm: vi.fn(),
}));

function exitError(code?: number) {
  return new Error(`process.exit(${code})`);
}

describe('soulCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ensureDirectories();
    writeConfig({
      projectName: 'test-project',
      platforms: {},
      postsDir: '.buildpublic-test/posts',
      capturesDir: '.buildpublic-test/captures',
    });
  });

  it('exits when bip is not initialized', async () => {
    const { rmSync } = await import('fs');
    rmSync('.buildpublic-test', { recursive: true, force: true });
    vi.spyOn(process, 'exit').mockImplementation((code?: number) => {
      throw exitError(code);
    });

    await expect(soulCommand()).rejects.toThrow('process.exit(1)');
  });

  it('runs the questionnaire and writes soul.md when none exists', async () => {
    vi.mocked(input).mockResolvedValue('casual and direct');
    vi.mocked(select).mockResolvedValue('I/me — first person singular');
    vi.mocked(confirm).mockResolvedValue(false); // no example post

    await soulCommand();

    expect(existsSync(soulPath())).toBe(true);
    const content = readFileSync(soulPath(), 'utf-8');
    expect(content).toContain('# Voice & Personality');
    expect(content).toContain('casual and direct');
  });

  it('cancels without writing when the user chooses cancel on an existing soul.md', async () => {
    // First call creates one.
    vi.mocked(input).mockResolvedValue('casual');
    vi.mocked(select).mockResolvedValue('I/me — first person singular');
    vi.mocked(confirm).mockResolvedValue(false);
    await soulCommand();
    const original = readFileSync(soulPath(), 'utf-8');

    vi.mocked(select).mockResolvedValue('cancel');
    await soulCommand();

    expect(readFileSync(soulPath(), 'utf-8')).toBe(original);
  });

  it('opens the editor and saves hand-edited content when the user chooses edit', async () => {
    vi.mocked(input).mockResolvedValue('casual');
    vi.mocked(select).mockResolvedValue('I/me — first person singular');
    vi.mocked(confirm).mockResolvedValue(false);
    await soulCommand();

    vi.mocked(select).mockResolvedValue('edit');
    vi.mocked(editor).mockResolvedValue('# Hand-edited voice\n');
    await soulCommand();

    expect(readFileSync(soulPath(), 'utf-8')).toBe('# Hand-edited voice\n');
  });
});

describe('soulEvolveCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ensureDirectories();
    writeConfig({
      projectName: 'test-project',
      platforms: {},
      postsDir: '.buildpublic-test/posts',
      capturesDir: '.buildpublic-test/captures',
    });
    vi.spyOn(providers, 'listAvailableProviders').mockReturnValue(['anthropic']);
    vi.spyOn(providerChoice, 'resolveAiProviderForSession').mockResolvedValue('anthropic');
  });

  it('exits when bip is not initialized', async () => {
    const { rmSync } = await import('fs');
    rmSync('.buildpublic-test', { recursive: true, force: true });
    vi.spyOn(process, 'exit').mockImplementation((code?: number) => {
      throw exitError(code);
    });

    await expect(soulEvolveCommand()).rejects.toThrow('process.exit(1)');
  });

  describe('--context-only', () => {
    it('exits with the underlying error when soul.md is missing', async () => {
      vi.spyOn(process, 'exit').mockImplementation((code?: number) => {
        throw exitError(code);
      });

      await expect(soulEvolveCommand({ contextOnly: true })).rejects.toThrow('process.exit(1)');
    });

    it('prints the evolve context without touching any AI provider', async () => {
      const { writeFileSync } = await import('fs');
      writeFileSync(soulPath(), '# Voice\n\nCasual.', 'utf-8');
      vi.spyOn(memory, 'getPostingHistory').mockReturnValue([
        { draftId: 'd1', createdAt: '', platform: 'x', variantChosen: 1, wasEdited: false, textPreview: '', commitSummary: 'a', postedSuccessfully: true },
        { draftId: 'd2', createdAt: '', platform: 'x', variantChosen: 1, wasEdited: false, textPreview: '', commitSummary: 'b', postedSuccessfully: true },
        { draftId: 'd3', createdAt: '', platform: 'x', variantChosen: 1, wasEdited: false, textPreview: '', commitSummary: 'c', postedSuccessfully: true },
      ]);
      vi.spyOn(memory, 'getEditDiffs').mockReturnValue([]);
      const evolveFn = vi.spyOn(evolver, 'evolveSoul');
      const logSpy = vi.spyOn(console, 'log');

      await soulEvolveCommand({ contextOnly: true });

      expect(evolveFn).not.toHaveBeenCalled();
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Casual.'));
    });
  });

  describe('--apply', () => {
    it('saves the evolved soul.md and stamps today\'s date', async () => {
      const { writeFileSync } = await import('fs');
      writeFileSync(soulPath(), '<!-- Last evolved: 2020-01-01 -->\n# Old\n', 'utf-8');
      const inputFile = join(process.cwd(), '.buildpublic-test', 'updated-soul.md');
      writeFileSync(inputFile, '<!-- Last evolved: 2020-01-01 -->\n# New voice\n', 'utf-8');
      const today = new Date().toISOString().slice(0, 10);

      await soulEvolveCommand({ apply: inputFile });

      const saved = readFileSync(soulPath(), 'utf-8');
      expect(saved).toContain('# New voice');
      expect(saved).toContain(`<!-- Last evolved: ${today} -->`);
    });
  });

  it('exits when no AI provider is configured (key-based path)', async () => {
    vi.spyOn(providers, 'listAvailableProviders').mockReturnValue([]);
    vi.spyOn(process, 'exit').mockImplementation((code?: number) => {
      throw exitError(code);
    });

    await expect(soulEvolveCommand()).rejects.toThrow('process.exit(1)');
  });

  it('exits when no soul.md exists (key-based path)', async () => {
    vi.spyOn(process, 'exit').mockImplementation((code?: number) => {
      throw exitError(code);
    });

    await expect(soulEvolveCommand()).rejects.toThrow('process.exit(1)');
  });

  it('reports insufficient history without calling the AI provider', async () => {
    const { writeFileSync } = await import('fs');
    writeFileSync(soulPath(), '# Voice\n', 'utf-8');
    vi.spyOn(memory, 'getEditDiffs').mockReturnValue([]);
    vi.spyOn(memory, 'getPostingHistory').mockReturnValue([]);
    const evolveFn = vi.spyOn(evolver, 'evolveSoul');
    const logSpy = vi.spyOn(console, 'log');

    await soulEvolveCommand();

    expect(evolveFn).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Not enough posting history'));
  });

  it('accepts the AI-proposed soul.md as-is and stamps today\'s date', async () => {
    const { writeFileSync } = await import('fs');
    writeFileSync(soulPath(), '# Voice\n', 'utf-8');
    vi.spyOn(memory, 'getEditDiffs').mockReturnValue([]);
    vi.spyOn(memory, 'getPostingHistory').mockReturnValue([
      { draftId: 'd1', createdAt: '', platform: 'x', variantChosen: 1, wasEdited: false, textPreview: '', commitSummary: 'a', postedSuccessfully: true },
      { draftId: 'd2', createdAt: '', platform: 'x', variantChosen: 1, wasEdited: false, textPreview: '', commitSummary: 'b', postedSuccessfully: true },
      { draftId: 'd3', createdAt: '', platform: 'x', variantChosen: 1, wasEdited: false, textPreview: '', commitSummary: 'c', postedSuccessfully: true },
    ]);
    vi.spyOn(evolver, 'evolveSoul').mockResolvedValue('<!-- Last evolved: 2020-01-01 -->\n# Evolved voice\n');
    vi.mocked(select).mockResolvedValue('accept');
    const today = new Date().toISOString().slice(0, 10);

    await soulEvolveCommand();

    const saved = readFileSync(soulPath(), 'utf-8');
    expect(saved).toContain('# Evolved voice');
    expect(saved).toContain(`<!-- Last evolved: ${today} -->`);
  });
});
