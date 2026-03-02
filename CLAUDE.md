# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

`bip` is a TypeScript CLI tool that automates "build in public" workflows. Developers add it to any project to share progress to X/Twitter, LinkedIn, Reddit, and HackerNews. It uses Claude API to generate platform-tailored posts from git activity.

## Commands

```bash
npm run build       # Compile TypeScript → dist/ (tsup, ESM)
npm run dev         # Run CLI directly via tsx (no build step)
npm run typecheck   # Type-check without emitting
```

CLI (after build):
```bash
node dist/index.js --help
node dist/index.js init
node dist/index.js auth x
node dist/index.js draft
node dist/index.js post [platform]
node dist/index.js capture screenshot <url>
node dist/index.js capture record <url>
```

## Architecture

```
src/
├── index.ts                  # CLI entry (Commander.js)
├── commands/
│   ├── init.ts               # Scaffold .buildpublic/ into project
│   ├── auth.ts               # Interactive credential setup
│   ├── draft.ts              # AI post generation + review loop
│   ├── post.ts               # Publish drafts to platforms
│   └── capture.ts            # Screenshot / video recording
├── platforms/
│   ├── base.ts               # IPlatform interface + helpers
│   ├── twitter.ts            # API (twitter-api-v2) + Playwright fallback
│   ├── linkedin.ts           # API (fetch REST) + Playwright fallback
│   ├── reddit.ts             # API (snoowrap) + Playwright fallback
│   └── hackernews.ts         # Playwright only (no official API)
├── ai/
│   ├── drafter.ts            # Claude API call + prompt engineering
│   └── git.ts                # simple-git: read diff, log, changed files
├── capture/
│   ├── screenshot.ts         # Playwright full-page screenshot
│   └── recorder.ts           # Playwright video recording
└── config/
    ├── types.ts              # All shared interfaces
    ├── settings.ts           # Read/write .buildpublic/config.json
    └── credentials.ts        # Typed credential accessors
templates/
├── BUILD_IN_PUBLIC.md        # Scaffolded into developer's project by init
└── config.template.json      # Default config template
```

## Key Design Decisions

- **ESM throughout**: `"type": "module"` required by ora, chalk, conf v12+
- **Local-first**: all credentials/drafts live in `.buildpublic/` inside the developer's project (not in bip's install location)
- **Posting strategy**: API primary (twitter-api-v2, LinkedIn REST, snoowrap), Playwright browser automation fallback for all platforms + HackerNews (no submit API)
- **AI model**: `claude-sonnet-4-6`, `max_tokens: 2048`, returns JSON array of PlatformPost
- **`process.cwd()`**: settings.ts always reads from the developer's project directory, not bip's own directory

## Environment Variables

- `ANTHROPIC_API_KEY` — required for `bip draft`

## Local Data Structure (per developer project)

```
.buildpublic/
├── config.json       # Credentials + platform config (gitignored)
├── posts/            # Draft JSON files (YYYY-MM-DD-HHmmss.json)
├── captures/         # Screenshots and videos (gitignored)
└── hn-state.json     # Playwright HN session cookies (gitignored)
```
