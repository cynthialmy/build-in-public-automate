import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { select, password } from '@inquirer/prompts';
import { upsertEnvKey } from '../../src/config/env-file.js';
import { authAiCommand } from '../../src/commands/auth-ai.js';

vi.mock('@inquirer/prompts', () => ({
  select: vi.fn(),
  password: vi.fn(),
}));

vi.mock('../../src/config/env-file.js', () => ({
  upsertEnvKey: vi.fn(),
}));

function exitError(code?: number) {
  return new Error(`process.exit(${code})`);
}

describe('authAiCommand', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.GLM_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('lists provider status without prompting or writing anything', async () => {
    await authAiCommand({ list: true });

    expect(select).not.toHaveBeenCalled();
    expect(password).not.toHaveBeenCalled();
    expect(upsertEnvKey).not.toHaveBeenCalled();
  });

  it('exits on an unknown provider argument', async () => {
    vi.spyOn(process, 'exit').mockImplementation((code?: number) => {
      throw exitError(code);
    });

    await expect(authAiCommand({ provider: 'not-a-provider' })).rejects.toThrow('process.exit(1)');
    expect(upsertEnvKey).not.toHaveBeenCalled();
  });

  it('saves a key for an explicit provider without prompting for a choice', async () => {
    vi.mocked(password).mockResolvedValue('test-fixture-glm-key-value');

    await authAiCommand({ provider: 'glm' });

    expect(select).not.toHaveBeenCalled();
    expect(upsertEnvKey).toHaveBeenCalledWith(process.cwd(), 'GLM_API_KEY', 'test-fixture-glm-key-value');
    expect(process.env.GLM_API_KEY).toBe('test-fixture-glm-key-value');
  });

  it('prompts for a provider when none is given', async () => {
    vi.mocked(select).mockResolvedValue('anthropic');
    vi.mocked(password).mockResolvedValue('test-fixture-anthropic-key-value');

    await authAiCommand({});

    expect(select).toHaveBeenCalled();
    expect(upsertEnvKey).toHaveBeenCalledWith(process.cwd(), 'ANTHROPIC_API_KEY', 'test-fixture-anthropic-key-value');
  });

  it('aborts on an empty key without writing anything', async () => {
    vi.spyOn(process, 'exit').mockImplementation((code?: number) => {
      throw exitError(code);
    });
    vi.mocked(password).mockResolvedValue('   ');

    await expect(authAiCommand({ provider: 'glm' })).rejects.toThrow('process.exit(1)');
    expect(upsertEnvKey).not.toHaveBeenCalled();
  });
});
