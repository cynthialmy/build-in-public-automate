import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { select, editor } from '@inquirer/prompts';
import { ensureDirectories, writeConfig } from '../../src/config/settings.js';
import * as providers from '../../src/ai/providers.js';
import * as providerChoice from '../../src/ai/provider-choice.js';
import * as evolver from '../../src/ai/evolver.js';
import * as mcpTools from '../../src/mcp/tools.js';
import { evolveCommand } from '../../src/commands/evolve.js';

vi.mock('@inquirer/prompts', () => ({
  select: vi.fn(),
  editor: vi.fn(),
}));

// evolveCommand reads/writes BUILD_IN_PUBLIC.md via process.cwd() directly,
// not under the test-isolated .buildpublic-test/. Sandbox cwd so this never
// touches the real repo's own BUILD_IN_PUBLIC.md.
const SANDBOX = join(process.cwd(), '.buildpublic-test', 'evolve-sandbox');
const MD_PATH = join(SANDBOX, 'BUILD_IN_PUBLIC.md');

function exitError(code?: number) {
  return new Error(`process.exit(${code})`);
}

describe('evolveCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rmSync(SANDBOX, { recursive: true, force: true });
    mkdirSync(SANDBOX, { recursive: true });
    vi.spyOn(process, 'cwd').mockReturnValue(SANDBOX);
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
    rmSync(join(SANDBOX, '.buildpublic-test'), { recursive: true, force: true });
    vi.spyOn(process, 'exit').mockImplementation((code?: number) => {
      throw exitError(code);
    });

    await expect(evolveCommand()).rejects.toThrow('process.exit(1)');
  });

  describe('--context-only', () => {
    it('prints the evolve context without touching any AI provider', async () => {
      writeFileSync(MD_PATH, '# Build In Public\n\nSome context.', 'utf-8');
      const logSpy = vi.spyOn(console, 'log');
      const draftFn = vi.spyOn(evolver, 'evolveProjectDoc');

      await evolveCommand({ contextOnly: true });

      expect(draftFn).not.toHaveBeenCalled();
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Some context.'));
    });

    it('exits with the underlying error when the doc is missing', async () => {
      vi.spyOn(process, 'exit').mockImplementation((code?: number) => {
        throw exitError(code);
      });

      await expect(evolveCommand({ contextOnly: true })).rejects.toThrow('process.exit(1)');
    });
  });

  describe('--apply', () => {
    it('saves the evolved doc and stamps today\'s date', async () => {
      writeFileSync(MD_PATH, '<!-- Last evolved: 2020-01-01 -->\n# Old\n', 'utf-8');
      const inputFile = join(SANDBOX, 'updated.md');
      writeFileSync(inputFile, '<!-- Last evolved: 2020-01-01 -->\n# New content\n', 'utf-8');
      const today = new Date().toISOString().slice(0, 10);

      await evolveCommand({ apply: inputFile });

      const saved = readFileSync(MD_PATH, 'utf-8');
      expect(saved).toContain('# New content');
      expect(saved).toContain(`<!-- Last evolved: ${today} -->`);
    });

    it('exits when the apply file does not exist', async () => {
      vi.spyOn(process, 'exit').mockImplementation((code?: number) => {
        throw exitError(code);
      });

      await expect(evolveCommand({ apply: join(SANDBOX, 'missing.md') })).rejects.toThrow(
        'process.exit(1)'
      );
    });
  });

  it('exits when no AI provider is configured (key-based path)', async () => {
    vi.spyOn(providers, 'listAvailableProviders').mockReturnValue([]);
    vi.spyOn(process, 'exit').mockImplementation((code?: number) => {
      throw exitError(code);
    });

    await expect(evolveCommand()).rejects.toThrow('process.exit(1)');
  });

  it('exits when BUILD_IN_PUBLIC.md does not exist (key-based path)', async () => {
    vi.spyOn(process, 'exit').mockImplementation((code?: number) => {
      throw exitError(code);
    });

    await expect(evolveCommand()).rejects.toThrow('process.exit(1)');
    expect(existsSync(MD_PATH)).toBe(false);
  });

  it('accepts the AI-proposed doc as-is and stamps today\'s date', async () => {
    writeFileSync(MD_PATH, '<!-- Last evolved: 2020-01-01 -->\n# Old\n', 'utf-8');
    vi.spyOn(evolver, 'evolveProjectDoc').mockResolvedValue('<!-- Last evolved: 2020-01-01 -->\n# Evolved\n');
    vi.mocked(select).mockResolvedValue('accept');
    const today = new Date().toISOString().slice(0, 10);

    await evolveCommand();

    const saved = readFileSync(MD_PATH, 'utf-8');
    expect(saved).toContain('# Evolved');
    expect(saved).toContain(`<!-- Last evolved: ${today} -->`);
  });

  it('discards the AI-proposed doc without writing anything', async () => {
    writeFileSync(MD_PATH, '# Original\n', 'utf-8');
    vi.spyOn(evolver, 'evolveProjectDoc').mockResolvedValue('# Evolved\n');
    vi.mocked(select).mockResolvedValue('discard');

    await evolveCommand();

    expect(readFileSync(MD_PATH, 'utf-8')).toBe('# Original\n');
  });

  it('lets the user edit the proposal before saving', async () => {
    writeFileSync(MD_PATH, '# Original\n', 'utf-8');
    vi.spyOn(evolver, 'evolveProjectDoc').mockResolvedValue('# Evolved\n');
    vi.mocked(select).mockResolvedValue('edit');
    vi.mocked(editor).mockResolvedValue('# Hand-edited\n');

    await evolveCommand();

    expect(readFileSync(MD_PATH, 'utf-8')).toContain('# Hand-edited');
  });
});
