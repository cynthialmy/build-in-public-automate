import { describe, it, expect, vi, beforeEach } from 'vitest';
import { select, input, password } from '@inquirer/prompts';
import { ensureDirectories, writeConfig, readConfig } from '../../src/config/settings.js';
import { setCredentials, hasCredentials } from '../../src/config/credentials.js';
import { getMe as getRedditMe } from '../../src/platforms/reddit-client.js';
import { authAiCommand } from '../../src/commands/auth-ai.js';
import { authCommand } from '../../src/commands/auth.js';

vi.mock('@inquirer/prompts', () => ({
  select: vi.fn(),
  input: vi.fn(),
  password: vi.fn(),
}));

vi.mock('../../src/config/credentials.js', () => ({
  setCredentials: vi.fn(),
  hasCredentials: vi.fn(() => false),
}));

vi.mock('../../src/platforms/reddit-client.js', () => ({
  getMe: vi.fn(),
}));

vi.mock('../../src/commands/auth-ai.js', () => ({
  authAiCommand: vi.fn(),
}));

// authX() and authLinkedIn() verify credentials over the real network unless
// mocked — twitter-api-v2 and global fetch, respectively.
vi.mock('twitter-api-v2', () => ({
  TwitterApi: vi.fn().mockImplementation(() => ({
    v2: { me: vi.fn().mockRejectedValue(new Error('not a real account')) },
  })),
}));
vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));

function exitError(code?: number) {
  return new Error(`process.exit(${code})`);
}

describe('authCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ensureDirectories();
    writeConfig({
      projectName: 'test-project',
      platforms: {},
      postsDir: '.buildpublic-test/posts',
      capturesDir: '.buildpublic-test/captures',
    });
    vi.mocked(input).mockResolvedValue('');
    vi.mocked(password).mockResolvedValue('');
  });

  it('delegates straight to authAiCommand for "ai", bypassing the init check', async () => {
    await authCommand('ai');
    expect(authAiCommand).toHaveBeenCalled();
  });

  it('--list prints credential status without touching any prompts', async () => {
    await authCommand(undefined, { list: true });
    expect(select).not.toHaveBeenCalled();
    expect(input).not.toHaveBeenCalled();
  });

  it('exits on an unknown platform target', async () => {
    vi.spyOn(process, 'exit').mockImplementation((code?: number) => {
      throw exitError(code);
    });
    await expect(authCommand('bluesky')).rejects.toThrow('process.exit(1)');
  });

  it('prompts for a target when none is given, and can route to ai', async () => {
    vi.mocked(select).mockResolvedValue('ai');
    await authCommand();
    expect(select).toHaveBeenCalled();
    expect(authAiCommand).toHaveBeenCalled();
  });

  describe('x', () => {
    it('saves credentials without the optional browser-login fields when skipped', async () => {
      vi.mocked(input)
        .mockResolvedValueOnce('app-key')
        .mockResolvedValueOnce('access-token')
        .mockResolvedValueOnce(''); // username skipped
      vi.mocked(password).mockResolvedValueOnce('app-secret').mockResolvedValueOnce('access-secret');

      await authCommand('x');

      expect(setCredentials).toHaveBeenCalledWith('x', {
        appKey: 'app-key',
        appSecret: 'app-secret',
        accessToken: 'access-token',
        accessSecret: 'access-secret',
      });
    });
  });

  describe('linkedin', () => {
    it('saves the browser-login sentinel when no access token is given', async () => {
      vi.mocked(input).mockResolvedValueOnce(''); // access token skipped

      await authCommand('linkedin');

      expect(setCredentials).toHaveBeenCalledWith('linkedin', { accessToken: '', personUrn: '' });
    });

    it('asks for a person URN and saves real credentials when a token is given', async () => {
      vi.mocked(input).mockResolvedValueOnce('token-123').mockResolvedValueOnce('urn:li:person:abc');

      await authCommand('linkedin');

      expect(setCredentials).toHaveBeenCalledWith('linkedin', {
        accessToken: 'token-123',
        personUrn: 'urn:li:person:abc',
      });
    });
  });

  describe('reddit', () => {
    it('saves credentials and writes the chosen default subreddit into config', async () => {
      vi.mocked(input)
        .mockResolvedValueOnce('client-id')
        .mockResolvedValueOnce('reddit-user')
        .mockResolvedValueOnce('webdev'); // subreddit
      vi.mocked(password).mockResolvedValueOnce('client-secret').mockResolvedValueOnce('testpass');
      vi.mocked(getRedditMe).mockResolvedValue({ name: 'reddit-user' } as never);

      await authCommand('reddit');

      expect(setCredentials).toHaveBeenCalledWith('reddit', {
        clientId: 'client-id',
        clientSecret: 'client-secret',
        username: 'reddit-user',
        password: 'testpass',
      });
      expect(readConfig().platforms.reddit?.defaultSubreddit).toBe('webdev');
    });
  });

  describe('hackernews', () => {
    it('saves username/password with no verification step', async () => {
      vi.mocked(input).mockResolvedValueOnce('hn-user');
      vi.mocked(password).mockResolvedValueOnce('testpass');

      await authCommand('hackernews');

      expect(setCredentials).toHaveBeenCalledWith('hackernews', {
        username: 'hn-user',
        password: 'testpass',
      });
    });
  });

  it('exits when bip is not initialized for a platform target', async () => {
    const { rmSync } = await import('fs');
    rmSync('.buildpublic-test', { recursive: true, force: true });
    vi.spyOn(process, 'exit').mockImplementation((code?: number) => {
      throw exitError(code);
    });

    await expect(authCommand('x')).rejects.toThrow('process.exit(1)');
    expect(setCredentials).not.toHaveBeenCalled();
  });
});
