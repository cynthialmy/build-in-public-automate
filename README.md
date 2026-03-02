# bip — build in public CLI

Share your progress to X, LinkedIn, Reddit, and HackerNews straight from your terminal. `bip` reads your git activity, generates platform-tailored posts with Claude AI, and publishes them via official APIs or browser automation.

## Quick start

```bash
# Install globally
npm install -g bip

# Inside any project
bip init
bip auth x
ANTHROPIC_API_KEY=... bip draft
bip post
```

## Commands

| Command | Description |
|---|---|
| `bip init` | Scaffold `.buildpublic/` and `BUILD_IN_PUBLIC.md` into your project |
| `bip auth <platform>` | Save credentials for `x`, `linkedin`, `reddit`, or `hackernews` |
| `bip draft` | Analyze recent git changes and generate posts with Claude |
| `bip post [platform]` | Publish the latest draft (optionally to one platform only) |
| `bip capture screenshot <url>` | Save a full-page PNG to `.buildpublic/captures/` |
| `bip capture record <url>` | Record a browser session; press Enter to stop |

## How it works

1. **`bip draft`** reads your last 20 commits, changed files, and diff via `simple-git`, then sends them to `claude-sonnet-4-6` with your `BUILD_IN_PUBLIC.md` project context. Claude returns platform-specific posts as JSON.
2. You review each post in the terminal — accept, edit, or skip per platform.
3. The draft is saved to `.buildpublic/posts/`.
4. **`bip post`** publishes via official APIs (X, LinkedIn, Reddit) and falls back to Playwright browser automation if the API fails. HackerNews always uses Playwright (no official submit API).

## Setup

### Requirements

- Node.js 18+
- `ANTHROPIC_API_KEY` env var for `bip draft`

### Platform credentials

Run `bip auth <platform>` for each platform you want to post to:

- **X** — App Key, App Secret, Access Token, Access Token Secret from [developer.x.com](https://developer.x.com)
- **LinkedIn** — Access Token + Person URN from [LinkedIn Developers](https://www.linkedin.com/developers/)
- **Reddit** — Client ID + Secret from a "script" app at [reddit.com/prefs/apps](https://www.reddit.com/prefs/apps)
- **HackerNews** — Your regular HN username and password (used for browser automation only)

Credentials are stored in `.buildpublic/config.json` which is automatically gitignored.

## Project context

After `bip init`, edit `BUILD_IN_PUBLIC.md` in your project root to tell Claude about your project, target audience, and preferred post style. The more context you provide, the more accurate the generated posts will be.

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
git clone https://github.com/your-username/build-in-public-automate
cd build-in-public-automate
npm install
npm run build       # Compile to dist/
npm run dev         # Run without building (tsx)
npm run typecheck   # Type-check only
```
