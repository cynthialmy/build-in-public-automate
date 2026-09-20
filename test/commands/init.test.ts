import { describe, it, expect, vi, beforeEach } from 'vitest';
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { input, checkbox, select } from '@inquirer/prompts';
import { readConfig, writeConfig } from '../../src/config/settings.js';
import { initCommand } from '../../src/commands/init.js';

vi.mock('@inquirer/prompts', () => ({
  input: vi.fn(),
  checkbox: vi.fn(),
  select: vi.fn(),
}));

// init.ts writes BUILD_IN_PUBLIC.md and .gitignore straight into
// process.cwd(), not just under .buildpublic/. Sandbox cwd itself so this
// never touches the real repo's own files.
const SANDBOX = join(process.cwd(), '.buildpublic-test', 'init-sandbox');

describe('initCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rmSync(SANDBOX, { recursive: true, force: true });
    mkdirSync(SANDBOX, { recursive: true });
    vi.spyOn(process, 'cwd').mockReturnValue(SANDBOX);
    vi.mocked(input).mockResolvedValue('my-project');
    vi.mocked(checkbox).mockResolvedValue(['x', 'reddit']);
    vi.mocked(select).mockResolvedValue('blank');
  });

  it('scaffolds config, BUILD_IN_PUBLIC.md, soul.md, skills, the Claude skill, and .gitignore', async () => {
    await initCommand({});

    expect(existsSync(join(SANDBOX, 'BUILD_IN_PUBLIC.md'))).toBe(true);
    expect(existsSync(join(SANDBOX, '.buildpublic-test', 'soul.md'))).toBe(true);
    expect(existsSync(join(SANDBOX, '.buildpublic-test', 'skills', 'x.md'))).toBe(true);
    expect(existsSync(join(SANDBOX, '.claude', 'skills', 'build-in-public', 'SKILL.md'))).toBe(true);

    const gitignore = readFileSync(join(SANDBOX, '.gitignore'), 'utf-8');
    expect(gitignore).toContain('.buildpublic/config.json');

    const config = readConfig();
    expect(config.projectName).toBe('my-project');
    expect(config.platforms.x?.enabled).toBe(true);
    expect(config.platforms.linkedin).toBeUndefined();
  });

  it('exits without --force when already initialized', async () => {
    writeConfig({
      projectName: 'existing',
      platforms: {},
      postsDir: '.buildpublic/posts',
      capturesDir: '.buildpublic/captures',
    });
    vi.spyOn(process, 'exit').mockImplementation((code?: number) => {
      throw new Error(`process.exit(${code})`);
    });

    await expect(initCommand({})).rejects.toThrow('process.exit(1)');
    expect(input).not.toHaveBeenCalled();
  });

  it('--force preserves existing credentials for platforms selected again', async () => {
    writeConfig({
      projectName: 'existing',
      platforms: { x: { enabled: true, credentials: { appKey: 'k', appSecret: 's', accessToken: 't', accessSecret: 'ts' } } },
      postsDir: '.buildpublic/posts',
      capturesDir: '.buildpublic/captures',
    });

    await initCommand({ force: true });

    const config = readConfig();
    expect(config.platforms.x?.credentials).toEqual({
      appKey: 'k',
      appSecret: 's',
      accessToken: 't',
      accessSecret: 'ts',
    });
  });

  it('does not duplicate the gitignore entry if one is already present', async () => {
    writeFileSync(join(SANDBOX, '.gitignore'), '.buildpublic/config.json\nnode_modules/\n', 'utf-8');

    await initCommand({});

    const gitignore = readFileSync(join(SANDBOX, '.gitignore'), 'utf-8');
    expect(gitignore.match(/\.buildpublic\/config\.json/g)).toHaveLength(1);
  });

  it('reports no enabled platforms when none are selected', async () => {
    vi.mocked(checkbox).mockResolvedValue([]);
    const logSpy = vi.spyOn(console, 'log');

    await initCommand({});

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('none (add with'));
  });
});
