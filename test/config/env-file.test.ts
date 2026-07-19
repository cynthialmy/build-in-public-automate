import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { upsertEnvKey } from '../../src/config/env-file.js';

const testDirectories: string[] = [];

function createTestDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'build-in-public-env-'));
  testDirectories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of testDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe('upsertEnvKey', () => {
  it('creates a private environment file', () => {
    const directory = createTestDirectory();

    upsertEnvKey(directory, 'ANTHROPIC_API_KEY', 'secret value');

    const envPath = join(directory, '.env');
    expect(readFileSync(envPath, 'utf-8')).toBe(
      'ANTHROPIC_API_KEY="secret value"\n'
    );
    expect(statSync(envPath).mode & 0o777).toBe(0o600);
  });

  it('repairs permissions while preserving unrelated entries', () => {
    const directory = createTestDirectory();
    const envPath = join(directory, '.env');
    writeFileSync(envPath, 'OTHER=value\nANTHROPIC_API_KEY=old\n', {
      mode: 0o644,
    });

    upsertEnvKey(directory, 'ANTHROPIC_API_KEY', 'new');

    expect(readFileSync(envPath, 'utf-8')).toBe(
      'OTHER=value\nANTHROPIC_API_KEY=new\n'
    );
    expect(statSync(envPath).mode & 0o777).toBe(0o600);
  });
});
