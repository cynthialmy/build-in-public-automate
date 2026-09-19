import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        'test/',
        'templates/',
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/*.config.ts',
      ],
    },
    setupFiles: ['./test/setup.ts'],
    include: ['**/*.test.ts'],
    // Several suites share the same on-disk fixture dir
    // (`join(process.cwd(), '.buildpublic-test')`, isolated only by
    // BIP_TEST_DIR, not per-file/per-test). Running test files in
    // parallel workers races reads/writes/rmSync against that shared
    // path. Serialize files instead of giving every suite its own dir.
    fileParallelism: false,
  },
});
