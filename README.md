# bip — build in public CLI

[![npm](https://img.shields.io/npm/v/build-in-public)](https://www.npmjs.com/package/build-in-public)
[![license](https://img.shields.io/npm/l/build-in-public)](LICENSE)
[![node](https://img.shields.io/node/v/build-in-public)](https://nodejs.org)
[![vitest](https://img.shields.io/badge/tests-vitest-6E9F18?logo=vitest)](https://vitest.dev)

Share your progress to X, LinkedIn, Reddit, and HackerNews from your terminal. `bip` reads your git activity, generates platform-tailored posts with your chosen **LLM provider** (Anthropic, OpenAI, GLM, and others), and publishes via official APIs or browser automation.

Posts improve over time — bip remembers variant preferences, learns editing patterns, and adapts voice to match yours.

## Features

- **Multi-provider AI**: Anthropic (Claude), Zhipu GLM, OpenAI, Google Gemini, Cohere, DeepSeek, Qwen — HTTP-based drafting with a unified prompt pipeline
- **CLI setup for API keys**: `bip auth ai` writes keys into the project `.env` (see [AI API keys](#ai-api-keys))
- **Multi-Platform Posting**: X, LinkedIn, Reddit, HackerNews with per-platform strategies
- **Smart Memory**: Tracks preferences, edit patterns, and avoids repetition
- **Browser Fallback**: Playwright when APIs fail; HackerNews uses automation (no submit API)
- **Voice**: `bip soul` and `bip soul evolve` refine `soul.md` from your behavior
- **Project Context**: `BUILD_IN_PUBLIC.md`, skills, and memory injected into prompts
- **Draft Review**: Two variants per platform, pick/edit/skip, then save or post
- **Capture**: Full-page screenshots and browser session recordings
- **Tests**: Vitest suite under `test/` (see [test/README.md](test/README.md))

## Install

```bash
npm install -g build-in-public
```

## Quick Start

```bash
cd your-project
bip init                    # scaffold config, skills, soul template
bip soul                    # define your posting voice (optional)
bip auth ai                 # set LLM API key → writes ./.env (or: bip auth ai glm)
bip auth x                  # set up social platform credentials (after bip init)
bip draft                   # generate posts from git activity
bip post                    # publish to platforms
```

Load order: a `.env` file in the **current working directory** is loaded automatically when you run `bip`. You can still use `export ANTHROPIC_API_KEY=...` if you prefer.

## Usage

### 1. Initialize

```bash
bip init
```

This scaffolds into your project:

- `BUILD_IN_PUBLIC.md` — your project's living story (committed to git)
- `.buildpublic/config.json` — credentials and platform config (gitignored)
- `.buildpublic/soul.md` — your posting voice and personality (committed)
- `.buildpublic/skills/` — per-platform posting strategies (committed)
- `.buildpublic/memory/` — posting history and preference tracking (gitignored)
- `.buildpublic/posts/` — saved draft JSON files
- `.buildpublic/captures/` — screenshots and videos (gitignored)

### 2. Define Your Voice

```bash
bip soul
```

An interactive questionnaire that creates `soul.md` — your posting personality:

- **Tone**: Casual, technical, enthusiastic...
- **Perspective**: I/me, we/us, third person...
- **Recurring themes**: Topics you post about
- **Words and phrases to avoid**: Things that don't sound like you
- **Example post**: For calibration

Soul evolves over time. After a few drafts, run `bip soul evolve` to refine it based on how you actually edit posts.

### 3. Customize Platform Skills

Each platform has a strategy file in `.buildpublic/skills/`:

| File | What it controls |
|-------|----------------|
| `skills/x.md` | Character limits, thread strategy, hooks, hashtag policy |
| `skills/linkedin.md` | Word count, opening hooks, professional tone, formatting |
| `skills/reddit.md` | Title style, peer tone, discussion format, self-promotion rules |
| `skills/hackernews.md` | Title constraints, Show HN/Ask HN format, technical focus |

Edit these files to change how bip writes for each platform. They're injected directly into the AI prompt.

### 4. AI API keys

`bip draft`, `bip evolve`, and `bip soul evolve` need **at least one** provider key in the environment.

**Recommended — interactive setup** (writes or updates `./.env` in the project root):

```bash
bip auth ai              # pick provider, paste key
bip auth ai glm          # set GLM_API_KEY only
bip auth ai anthropic    # set ANTHROPIC_API_KEY only
bip auth ai --list       # show which provider env vars are set (masked)
```

**Environment variables** (any one you configure can be used; see `src/ai/providers.ts` for the full list):

| Provider   | Variable             |
|-----------|----------------------|
| Anthropic | `ANTHROPIC_API_KEY`  |
| OpenAI    | `OPENAI_API_KEY`     |
| Google    | `GOOGLE_API_KEY`     |
| Cohere    | `COHERE_API_KEY`     |
| DeepSeek  | `DEEPSEEK_API_KEY`   |
| Qwen      | `QWEN_API_KEY`       |
| GLM       | `GLM_API_KEY`        |

**Multiple keys**: If more than one provider is configured, `bip` prompts you to choose (or use `BIP_AI_PROVIDER=glm`, or `bip draft --provider glm`). You can save a default in `.buildpublic/config.json` as `aiProvider` when prompted.

### 5. Set Up Platform Credentials

```bash
bip auth x           # X (Twitter) API keys
bip auth linkedin     # LinkedIn access token + person URN
bip auth reddit       # Reddit client ID + secret
bip auth hackernews   # HN username + password (browser automation only)
bip auth --list       # check credential status for all platforms
```

The main `bip auth` menu also includes **AI / LLM API keys** alongside social platforms.

| Platform | What you need | Where to get it |
|----------|---------------|----------------|
| **X** | App Key, App Secret, Access Token, Access Token Secret | [developer.x.com](https://developer.x.com) |
| **LinkedIn** | Access Token + Person URN | [linkedin.com/developers](https://www.linkedin.com/developers/) |
| **Reddit** | Client ID + Secret | [reddit.com/prefs/apps](https://www.reddit.com/prefs/apps) — create a "script" app |
| **HackerNews** | Username + password | Your regular HN login (browser automation only) |

Credentials are stored in `.buildpublic/config.json` (automatically gitignored).

## Workflow

### Generate Posts

```bash
bip draft
bip draft --provider glm   # non-interactive when multiple keys exist
```

1. Reads your last 20 commits, changed files, and diff
2. Shows a git summary — confirm before calling the API
3. Sends everything to the configured LLM with:
   - `BUILD_IN_PUBLIC.md` context
   - `soul.md` voice
   - Platform `skills`
   - Posting `memory` (variant prefs, edit rate, common edits, recent topics, posts to avoid repeating)
4. Returns **2 variants per platform** — pick one, edit inline, or skip
5. Saves draft to `.buildpublic/posts/YYYY-MM-DD-HHmmss.json`
6. Records your variant choice and any edits to memory

If `BUILD_IN_PUBLIC.md` hasn't been updated in 30+ days, bip will nudge you to run `bip evolve`.

### Publish

```bash
bip post              # publish to all platforms
bip post x            # publish to X only
bip post --dry-run    # preview with character counts, no API calls
```

Posts via official APIs first (X, LinkedIn, Reddit). Falls back to Playwright browser automation if API fails. HackerNews always uses Playwright (no official submit API).

### Evolve Your Project Doc

```bash
bip evolve
```

The AI reads your current `BUILD_IN_PUBLIC.md`, recent git log (50 commits), `package.json`, and posting history, then proposes updates section by section:

- **Project Description**: Deepens based on what's been shipped
- **Tech Stack**: Detects new/removed dependencies
- **Milestones**: Checks off completed items, suggests new ones based on recent direction
- **Target Audience & Post Style**: Only touches if clearly outdated

You review, edit, or discard each change. Adds a `<!-- Last evolved: YYYY-MM-DD -->` comment at the top.

### Evolve Your Voice

```bash
bip soul evolve
```

Analyzes your posting memory — which variants you pick, how you edit AI-generated text, what you add or remove — and proposes `soul.md` refinements. Examples:

- "You consistently remove hashtags" → adds to your **Avoid** section
- "You always shorten LinkedIn posts" → notes conciseness preference in **Tone**
- "You prefer direct openers over questions" → updates hook style in **Style**

## How the AI Prompt Works

When you run `bip draft`, the prompt is assembled from four sources:

```
┌─────────────────────────────────┐
│ System prompt                        │
│ ├── Base strategist instructions      │
│ ├── Platform skills (from skills/*.md) │
│ └── Soul / voice (from soul.md)        │
├─────────────────────────────────┤
│ User prompt                         │
│ ├── BUILD_IN_PUBLIC.md project context │
│ ├── Memory (variant prefs, edit rate,  │
│ │   recent topics, posts to avoid)     │
│ ├── Git activity (commits, diff, files)│
│ └── Output format instructions         │
└─────────────────────────────────┘
```

Everything except base instructions is editable by you.

## Commands

| Command | Description |
|---------|-------------|
| `bip init` | Scaffold config, skills, soul template, and directories |
| `bip auth` | Interactive menu: AI keys or social platforms |
| `bip auth ai [provider]` | Save an LLM API key into `.env` (`--list` to show status) |
| `bip auth <platform>` | Save credentials for `x`, `linkedin`, `reddit`, or `hackernews` |
| `bip auth --list` | Show credential status for all **social** platforms |
| `bip draft` | Generate 2 post variants per platform from git activity |
| `bip draft --provider <id>` | Force provider when multiple API keys exist |
| `bip post [platform]` | Publish latest draft (optionally to one platform) |
| `bip post --dry-run` | Preview posts with character counts, no API calls |
| `bip soul` | Interactive questionnaire to create or redo soul.md |
| `bip soul evolve` | Propose soul.md refinements from posting patterns |
| `bip evolve` | Update BUILD_IN_PUBLIC.md from recent project activity |
| `bip doctor` | Check your setup for common issues |
| `bip status` | See platforms, credentials, and recent drafts at a glance |
| `bip history` | Browse past drafts with content previews |
| `bip capture screenshot <url>` | Save a full-page PNG |
| `bip capture record <url>` | Record a browser session (press Enter to stop) |

## Local Data Structure

```
your-project/
├── BUILD_IN_PUBLIC.md          # project context (committed)
└── .buildpublic/
    ├── config.json             # credentials, platforms, optional aiProvider (gitignored)
    ├── soul.md                 # voice / personality (committed)
    ├── skills/                 # platform strategies (committed)
    │   ├── x.md
    │   ├── linkedin.md
    │   ├── reddit.md
    │   └── hackernews.md
    ├── memory/                 # posting history + prefs (gitignored)
    │   ├── posting-history.json
    │   └── preferences.json
    ├── posts/                  # saved drafts
    ├── captures/               # screenshots + videos (gitignored)
    └── hn-state.json           # HN session cookies (gitignored)
```

## Development

### Setup

```bash
git clone https://github.com/cynthialmy/build-in-public-automate
cd build-in-public-automate
npm install
npm run build       # compile to dist/
npm run dev         # run without building (tsx)
npm run typecheck   # type-check only
```

### Testing

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

### Build

```bash
npm run build
```

Compiles TypeScript to `dist/index.js` with ESM format, targeting Node 18.

### Publishing to npm (maintainers)

Package name: **`build-in-public`** (`package.json` → `files` ships `dist/`, `templates/`, `README.md`, `LICENSE`).

1. **Pre-release checks**

   ```bash
   npm run typecheck
   npm run build
   npm run test:run    # optional but recommended
   npm pack --dry-run  # inspect tarball contents
   ```

2. **Login** (once per machine): `npm login` — then `npm whoami` to confirm.

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

## Requirements

- **Node.js**: 18+
- **At least one LLM API key** for draft/evolve flows — see [AI API keys](#4-ai-api-keys). Use `bip auth ai` or set the corresponding env vars manually.

## Architecture

```
src/
├── index.ts                 # CLI entry (Commander.js)
├── commands/
│   ├── init.ts           # Scaffold .buildpublic/ into project
│   ├── auth.ts           # Social + AI credential flows
│   ├── auth-ai.ts        # `bip auth ai` → .env upsert
│   ├── draft.ts          # AI post generation + review loop
│   ├── post.ts           # Publish drafts to platforms
│   ├── evolve.ts         # Update BUILD_IN_PUBLIC.md
│   ├── soul.ts           # Voice definition & evolution
│   ├── history.ts        # Browse past drafts
│   ├── status.ts         # Project overview
│   ├── doctor.ts         # Setup diagnostics
│   └── capture.ts        # Screenshot / video recording
├── platforms/
│   ├── base.ts           # IPlatform interface + helpers
│   ├── twitter.ts        # API (twitter-api-v2) + Playwright fallback
│   ├── linkedin.ts       # API (fetch REST) + Playwright fallback
│   ├── reddit.ts         # API (snoowrap) + Playwright fallback
│   └── hackernews.ts     # Playwright only (no official submit API)
├── ai/
│   ├── drafter.ts        # Multi-provider HTTP drafting + prompts
│   ├── providers.ts      # Provider detection, env keys, config
│   ├── provider-choice.ts # Interactive provider when multiple keys
│   ├── git.ts            # simple-git: diff, log, changed files
│   └── evolver.ts        # Soul / BUILD_IN_PUBLIC evolution (HTTP)
├── capture/
│   ├── screenshot.ts      # Playwright full-page screenshot
│   └── recorder.ts        # Playwright video recording
├── config/
│   ├── types.ts          # All shared interfaces
│   ├── settings.ts       # Read/write .buildpublic/config.json
│   ├── credentials.ts    # Typed credential accessors
│   └── env-file.ts       # Upsert keys in project .env
├── memory/
│   └── index.ts          # Posting history, preference tracking, prompt building
└── skills/
    └── index.ts          # Load platform skills from .buildpublic/skills/
```

### Key Design Decisions

- **ESM throughout**: `"type": "module"` required by ora, chalk, conf v12+
- **Local-first**: Social credentials and drafts live under `.buildpublic/` in the project; LLM keys are typically in `.env` (or the shell environment)
- **Posting strategy**: API primary (twitter-api-v2, LinkedIn REST, snoowrap), Playwright fallback + HackerNews (no submit API)
- **AI**: `drafter.ts` uses provider HTTP APIs (not only Anthropic SDK); default models per provider are in `providers.ts`; responses are parsed into a JSON `PlatformPost[]` array
- **`.env`**: Loaded from `process.cwd()` at CLI startup (`dotenv`)
- **`process.cwd()`**: Config and paths resolve from the developer's project directory, not bip's install location

## Contributing

Issues and pull requests are welcome.

### Development Workflow

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run tests (`npm test`) to ensure nothing breaks
5. If adding new functionality, write tests (`test/README.md` has guidelines)
6. Commit your changes (`git commit -m 'Add some amazing feature'`)
7. Push to the branch (`git push origin feature/amazing-feature`)
8. Open a Pull Request

### Running Tests Locally

Before submitting a PR, ensure all tests pass:

```bash
npm run test:run
```

For coverage reports:

```bash
npm run test:coverage
```

### Code Style

- TypeScript for type safety
- Follow existing code structure and patterns
- Add tests for new functionality
- Update documentation as needed

## Troubleshooting

### Common Issues

**"API Error: Unable to connect to API: Self-signed certificate detected"**

This can happen with corporate proxies or network inspection. Solutions:

1. **Set NODE_EXTRA_CA_CERTS** (recommended):
   ```bash
   export NODE_EXTRA_CA_CERTS=/path/to/your-ca-bundle.pem
   ```

2. **Insecure workaround** (last resort):
   ```bash
   export NODE_TLS_REJECT_UNAUTHORIZED=0
   ```

**"bip is not initialized in this project"**

Run `bip init` first to scaffold the `.buildpublic/` directory.

**Platform credentials not working**

Run `bip auth --list` to check which platforms have credentials configured. Re-run `bip auth <platform>` if needed.

**LLM key not found / wrong provider**

Run `bip auth ai --list`. Ensure you run `bip` from the project directory that contains your `.env`, or export the variable in your shell.

**Tests failing with process.cwd() errors**

The testing framework uses isolated test directories. Ensure test cleanup is working properly in `test/setup.ts`.

## License

MIT

## Acknowledgments

- LLM providers (Anthropic, OpenAI, Zhipu, and others) for content generation
- [Commander.js](https://github.com/tj/commander.js) for CLI parsing
- [Playwright](https://playwright.dev) for browser automation
- [Vitest](https://vitest.dev) for the testing framework
- All platform providers for their APIs and documentation
