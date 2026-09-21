# Contributing to bip

Issues and pull requests are welcome.

## Development Workflow

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run tests (`npm test`) to ensure nothing breaks
5. If adding new functionality, write tests (`test/README.md` has guidelines)
6. Commit your changes (`git commit -m 'Add some amazing feature'`)
7. Push to the branch (`git push origin feature/amazing-feature`)
8. Open a Pull Request

## Setup

```bash
git clone https://github.com/cynthialmy/build-in-public-automate
cd build-in-public-automate
npm install
npm run build       # compile to dist/
npm run dev         # run without building (tsx)
npm run typecheck   # type-check only
```

## Testing

```bash
# Watch mode (development)
npm test

# Run all tests once
npm run test:run

# Generate coverage report
npm run test:coverage
```

See [test/README.md](test/README.md) for how tests are organized and how to run them.

Tests use **Vitest** (`npm test`, `npm run test:run`, `npm run test:coverage`). Layout mirrors `src/` under `test/`.

Before submitting a PR, ensure all tests pass with `npm run test:run`.

## Code Style

- TypeScript for type safety
- Follow existing code structure and patterns
- Add tests for new functionality
- Update documentation as needed

## Build

```bash
npm run build
```

Compiles TypeScript to `dist/index.js` with ESM format, targeting Node 18.

## Publishing to npm (maintainers)

Package name: **`build-in-public`** (`package.json` → `files` ships `dist/`, `templates/`, `README.md`, `LICENSE`).

1. **Pre-release checks**

   ```bash
   npm run typecheck
   npm run build
   npm run test:run    # optional but recommended
   npm pack --dry-run  # inspect tarball contents
   ```

2. **Login** (once per machine): run `npm login`, then `npm whoami` to confirm.

3. **Bump version** (updates `package.json` and creates a git tag if the repo is clean):

   ```bash
   npm version patch   # or minor | major
   ```

4. **Publish**

   ```bash
   npm publish
   ```

   Use a scoped name (e.g. `@org/build-in-public`) only if you change `"name"` in `package.json`; scoped packages often need `npm publish --access public`.

5. **Verify**: `npm view build-in-public version` or install with `npm install -g build-in-public` and run `bip --help`.

## Architecture

```
src/
├── index.ts                 # CLI entry (Commander.js)
├── commands/
│   ├── init.ts           # Scaffold .buildpublic/ into project
│   ├── auth.ts           # Social + AI credential flows
│   ├── auth-ai.ts        # `bip auth ai` → .env upsert
│   ├── draft.ts          # AI post generation + review loop
│   ├── ship.ts           # `bip ship`: draft + screenshot + package + optional post, one command
│   ├── post.ts           # Publish drafts to platforms
│   ├── evolve.ts         # Update BUILD_IN_PUBLIC.md
│   ├── soul.ts           # Voice definition & evolution
│   ├── history.ts        # Browse past drafts
│   ├── status.ts         # Project overview
│   ├── doctor.ts         # Setup diagnostics
│   ├── capture.ts        # Screenshot / video / terminal recording
│   └── feedback.ts       # `bip feedback`: rating or message → Formspree/GitHub issue
├── platforms/
│   ├── base.ts           # IPlatform interface + helpers
│   ├── twitter.ts        # API (twitter-api-v2) + Playwright fallback
│   ├── linkedin.ts       # API (fetch REST) + Playwright fallback
│   ├── reddit.ts         # API (fetch OAuth client) + Playwright fallback
│   ├── reddit-client.ts  # Minimal Reddit OAuth2 script-app client
│   └── hackernews.ts     # Playwright only (no official submit API)
├── ai/
│   ├── drafter.ts        # Multi-provider HTTP drafting + prompts
│   ├── providers.ts      # Provider detection, env keys, config
│   ├── provider-choice.ts # Interactive provider when multiple keys
│   ├── git.ts            # simple-git: diff, log, changed files
│   └── evolver.ts        # Soul / BUILD_IN_PUBLIC evolution (HTTP)
├── capture/
│   ├── screenshot.ts      # Playwright full-page screenshot
│   ├── recorder.ts        # Playwright video recording
│   ├── ensure-browser.ts  # Auto-installs Playwright's Chromium on first use
│   └── terminal.ts        # asciinema + agg: live CLI/terminal recording, not a web page
├── config/
│   ├── types.ts          # All shared interfaces
│   ├── settings.ts       # Read/write .buildpublic/config.json
│   ├── credentials.ts    # Typed credential accessors
│   └── env-file.ts       # Upsert keys in project .env
├── memory/
│   └── index.ts          # Posting history, preference tracking, prompt building
├── core/
│   ├── telemetry.ts      # Anonymous, opt-out `command_run` events (PostHog)
│   ├── draft-flow.ts     # Shared variant-picking UX (`bip draft` + `bip ship`)
│   └── platform-presets.ts # Platform → screenshot preset map
└── skills/
    └── index.ts          # Load platform skills from .buildpublic/skills/
```

### Key Design Decisions

- **ESM throughout**: `"type": "module"` required by ora, chalk, conf v12+
- **Local-first**: Social credentials and drafts live under `.buildpublic/` in the project; LLM keys are typically in `.env` (or the shell environment)
- **Posting strategy**: API primary (twitter-api-v2, LinkedIn REST, fetch-based Reddit OAuth client), Playwright fallback + HackerNews (no submit API)
- **AI**: `drafter.ts` uses provider HTTP APIs (not only Anthropic SDK); default models per provider are in `providers.ts`; responses are parsed into a JSON `PlatformPost[]` array
- **`.env`**: Loaded from `process.cwd()` at CLI startup (`dotenv`)
- **`process.cwd()`**: Config and paths resolve from the developer's project directory, not bip's install location
