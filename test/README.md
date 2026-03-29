# Testing

This repo uses **[Vitest](https://vitest.dev/)** for unit tests. Test files live under `test/` and mirror areas of `src/`.

## Commands

```bash
npm test              # watch mode
npm run test:run      # single run
npm run test:coverage # coverage report (requires @vitest/coverage-v8)
```

## Layout

```
test/
├── setup.ts           # env (e.g. BIP_TEST_DIR), global hooks
├── fixtures.ts        # shared mocks / sample data
├── config/            # settings, credentials
├── ai/                # git, drafter, evolver
├── memory/
├── skills/
├── platforms/
└── commands/            # doctor, status, history
```

## Writing tests

- Prefer `vi.mock()` for filesystem, network, and external SDKs; hoist mocks at file top level when Vitest requires it.
- Use `test/fixtures.ts` for `BipConfig`, `GitContext`, and post shapes when helpful.
- Clear mocks in `beforeEach` / `afterEach` as needed.

## Fixtures

`fixtures.ts` exports helpers such as `mockConfig`, `mockGitContext`, `mockPlatformPost`, and sample `soul` / `BUILD_IN_PUBLIC` strings. Extend when adding new scenarios.

## Troubleshooting

- **`bip is not initialized` in tests**: `test/setup.ts` should point bip at an isolated directory via `BIP_TEST_DIR`; ensure tests create/clean that tree.
- **Mock APIs**: If production code stops using a mocked module (e.g. moving from SDK to `fetch`), update the test mocks to match.

For Vitest APIs, see the [Vitest documentation](https://vitest.dev/).
