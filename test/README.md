# Testing Guide

## Overview

This project uses **Vitest** as its testing framework. Tests are organized by module and follow a unit testing approach with mocking for external dependencies.

## Running Tests

```bash
# Run all tests in watch mode
npm test

# Run all tests once
npm run test:run

# Run tests with coverage report
npm run test:coverage
```

## Test Structure

```
test/
├── setup.ts                 # Test setup and cleanup
├── fixtures.ts             # Mock data and test helpers
├── config/                # Configuration module tests
│   ├── settings.test.ts
│   └── credentials.test.ts
├── ai/                    # AI module tests
│   ├── git.test.ts
│   ├── drafter.test.ts
│   └── evolver.test.ts
├── memory/                # Memory module tests
│   └── index.test.ts
├── skills/                # Skills module tests
│   └── index.test.ts
├── platforms/             # Platform module tests
│   └── base.test.ts
└── commands/              # Command tests (integration-style)
    ├── doctor.test.ts
    ├── status.test.ts
    └── history.test.ts
```

## Test Coverage

The test suite currently covers:

### ✅ Fully Tested Modules

1. **Config Module** (`src/config/`)
   - Settings: read/write/update config, directory management
   - Credentials: get/set/has credentials for all platforms

2. **AI Module** (`src/ai/`)
   - Git: repository detection, context gathering, commit analysis
   - Drafter: AI-powered post generation with Claude API
   - Evolver: soul.md and BUILD_IN_PUBLIC.md evolution

3. **Memory Module** (`src/memory/`)
   - Variant choice recording
   - Post result tracking
   - Preferences calculation (variant preferences, edit patterns)
   - Memory prompt building

4. **Skills Module** (`src/skills/`)
   - Platform skill loading
   - User vs template skill precedence

5. **Platforms Module** (`src/platforms/`)
   - Base interface and error handling

### 🚧 Partially Tested

6. **Commands** (`src/commands/`)
   - Basic structure tests for doctor, status, history
   - Integration tests to be added

## Writing Tests

### Test Template

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { functionToTest } from '../../src/module.js';

describe('Module Name', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should do something', () => {
    const result = functionToTest();
    expect(result).toBe(expectedValue);
  });
});
```

### Best Practices

1. **Mock external dependencies**: Use `vi.mock()` for external packages
2. **Clean up in afterEach**: Reset mocks and clean test data
3. **Test edge cases**: Empty inputs, null values, error conditions
4. **Use descriptive test names**: Should read like documentation
5. **Keep tests focused**: One assertion per test when possible

### Mocking Examples

```typescript
// Mock a module
vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    async messages() {
      return { content: [{ type: 'text', text: 'mocked response' }] };
    }
  }
}));

// Spy on a function
const spy = vi.spyOn(someModule, 'someFunction');

// Restore mock
spy.mockRestore();
```

## Fixtures

`test/fixtures.ts` provides reusable mock data:

```typescript
import { mockConfig, mockGitContext, mockPlatformPost } from '../test/fixtures.js';
```

Available fixtures:
- `mockConfig`: Full BipConfig object
- `mockGitContext`: Sample git repository context
- `mockPlatformPost`: Platform post examples
- `mockRedditPost`, `mockHackerNewsPost`: Platform-specific posts
- `mockPostingRecord`: Sample posting history record
- `mockSoulContent`: Sample soul.md content
- `mockBuildInPublicMd`: Sample BUILD_IN_PUBLIC.md

## Coverage Goals

Target: **80%+** code coverage

Current modules with high coverage:
- Config: ~95%
- AI: ~90%
- Memory: ~85%
- Skills: ~80%
- Platforms: ~100% (base interface)

## Continuous Integration

Tests run automatically on:
- Pull requests
- Main branch commits
- Release candidates

## Troubleshooting

### Tests fail with "bip is not initialized"

The tests use a separate test directory (`.buildpublic-test`) that's cleaned up automatically. If you see this error, ensure the test setup is working:

```typescript
// In test/setup.ts
beforeEach(() => {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
  mkdirSync(TEST_DIR, { recursive: true });
});
```

### Mock not working

Ensure `vi.mock()` is called at the top level of the test file (outside any `describe` blocks).

### Coverage report not generating

Install coverage provider:

```bash
npm install -D @vitest/coverage-v8
```

## Adding New Tests

When adding new functionality:

1. Create a test file in the appropriate directory
2. Add test cases for:
   - Happy path (normal operation)
   - Error cases (invalid inputs, API failures)
   - Edge cases (empty data, null values)
   - Integration (with other modules if applicable)
3. Run `npm run test:coverage` to check coverage
4. Update this README with new test info

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [Vitest API Reference](https://vitest.dev/api/)
- [Testing Library Best Practices](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library)
