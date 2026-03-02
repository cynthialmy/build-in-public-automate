# bip — build in public CLI

[![npm](https://img.shields.io/npm/v/build-in-public)](https://www.npmjs.com/package/build-in-public)
[![license](https://img.shields.io/npm/l/build-in-public)](LICENSE)
[![node](https://img.shields.io/node/v/build-in-public)](https://nodejs.org)

Share your progress to X, LinkedIn, Reddit, and HackerNews straight from your terminal. `bip` reads your git activity, generates platform-tailored posts with Claude AI, and publishes them via official APIs or browser automation.

## Install

```bash
npm install -g build-in-public
```

## Quick start

```bash
# Inside any project with git
bip init
bip auth x
ANTHROPIC_API_KEY=sk-ant-... bip draft
bip post
```

## Commands

| Command | Description |
|---|---|
| `bip init` | Scaffold `.buildpublic/` and `BUILD_IN_PUBLIC.md` into your project |
| `bip auth <platform>` | Save credentials for `x`, `linkedin`, `reddit`, or `hackernews` |
| `bip auth --list` | Show credential status for all platforms |
| `bip draft` | Analyze recent git changes and generate 2 post variants per platform |
| `bip post [platform]` | Publish the latest draft (optionally to one platform only) |
| `bip post --dry-run` | Preview posts with character counts — no API calls made |
| `bip doctor` | Check your setup for common issues |
| `bip status` | See platforms, credential status, and recent drafts at a glance |
| `bip history` | Browse past drafts with content previews |
| `bip capture screenshot <url>` | Save a full-page PNG to `.buildpublic/captures/` |
| `bip capture record <url>` | Record a browser session; press Enter to stop |

## How it works

1. **`bip draft`** reads your last 20 commits, changed files, and diff via `simple-git`, shows you a summary, then sends everything to `claude-sonnet-4-6` with your `BUILD_IN_PUBLIC.md` project context. Claude returns **2 variants per platform** as JSON.
2. You pick a variant per platform in the terminal (or edit inline).
3. The draft is saved to `.buildpublic/posts/`.
4. **`bip post`** publishes via official APIs (X, LinkedIn, Reddit) and falls back to Playwright browser automation if the API fails. HackerNews always uses Playwright (no official submit API).

## Setup

### Requirements

- Node.js 18+
- `ANTHROPIC_API_KEY` env var ([get one at console.anthropic.com](https://console.anthropic.com))

### Platform credentials

Run `bip auth <platform>` for each platform you want to post to:

| Platform | What you need | Where to get it |
|---|---|---|
| **X** | App Key, App Secret, Access Token, Access Token Secret | [developer.x.com](https://developer.x.com) |
| **LinkedIn** | Access Token + Person URN | [linkedin.com/developers](https://www.linkedin.com/developers/) |
| **Reddit** | Client ID + Secret | [reddit.com/prefs/apps](https://www.reddit.com/prefs/apps) — create a "script" app |
| **HackerNews** | Username + password | Your regular HN login (used for browser automation only) |

Credentials are stored in `.buildpublic/config.json` which is automatically gitignored.

## Project context

After `bip init`, edit `BUILD_IN_PUBLIC.md` in your project root to tell Claude about your project, target audience, and preferred post style. The more context you provide, the better the generated posts.

## Local data

```
.buildpublic/
├── config.json       # Credentials + settings (gitignored)
├── posts/            # Draft JSON files
├── captures/         # Screenshots and videos (gitignored)
└── hn-state.json     # HackerNews session cookies (gitignored)
```

## Development

```bash
git clone https://github.com/cynthialmy/build-in-public-automate
cd build-in-public-automate
npm install
npm run build       # Compile to dist/
npm run dev         # Run without building (tsx)
npm run typecheck   # Type-check only
```

## License

MIT
