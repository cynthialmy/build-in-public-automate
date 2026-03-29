import { beforeEach } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';

const TEST_DIR = join(process.cwd(), '.buildpublic-test');

// Set environment variable to use test directory
process.env.BIP_TEST_DIR = '.buildpublic-test';

beforeEach(() => {
  // Clean up test directory before each test
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
  mkdirSync(TEST_DIR, { recursive: true });
});

export { TEST_DIR };

// Suppress deprecation warnings for tests
process.env.NODE_NO_WARNINGS = '1';
