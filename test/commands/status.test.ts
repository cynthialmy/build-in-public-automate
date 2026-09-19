import { describe, it, expect, beforeEach, vi } from 'vitest';
import { statusCommand } from '../../src/commands/status.js';
import { ensureDirectories, writeConfig } from '../../src/config/settings.js';

describe('Status Command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // statusCommand exits(1) when bip isn't initialized in the project —
    // initialize it here so we're testing the happy path, not the exit.
    ensureDirectories();
    writeConfig({
      projectName: 'test-project',
      platforms: {},
      postsDir: '.buildpublic-test/posts',
      capturesDir: '.buildpublic-test/captures',
    });
  });

  it('should be a function', () => {
    expect(typeof statusCommand).toBe('function');
  });

  it('should execute without throwing', async () => {
    await expect(statusCommand()).resolves.not.toThrow();
  });

  // Note: Actual implementation testing would require mocking:
  // - File system operations
  // - Config reading
  // - Console output
  // These would be added as integration tests once the implementation is available
});
