# bip — build in public CLI

[![npm](https://img.shields.io/npm/v/build-in-public)](https://www.npmjs.com/package/build-in-public)
[![license](https://img.shields.io/npm/l/build-in-public)](LICENSE)
[![node](https://img.shields.io/node/v/build-in-public)](https://nodejs.org)

Share your progress to X, LinkedIn, Reddit, and HackerNews straight from your terminal. `bip` reads your git activity, generates platform-tailored posts with Claude AI, and publishes them via official APIs or browser automation.

Posts get better over time — bip remembers your variant preferences, learns your editing patterns, and adapts its voice to match yours.

## Install

```bash
npm install -g build-in-public
```

## Quick start

```bash
cd your-project
bip init                              # scaffold config, skills, soul template
bip soul                              # define your posting voice
bip auth x                            # set up platform credentials
ANTHROPIC_API_KEY=sk-ant-... bip draft # generate posts from git activity
bip post                              # publish to platforms
```

## Setup

### Requirements

- Node.js 18+
- `ANTHROPIC_API_KEY` env var ([get one at console.anthropic.com](https://console.anthropic.com))

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

### 2. Define your voice

```bash
bip soul
```

An interactive questionnaire that creates `soul.md` — your posting personality:
- Tone (casual, technical, enthusiastic...)
- Perspective (I/me, we/us, third person)
- Recurring themes
- Words and phrases to avoid
- Example post for calibration

Soul evolves over time. After a few drafts, run `bip soul evolve` to refine it based on how you actually edit posts.

### 3. Customize platform skills

Each platform has a strategy file in `.buildpublic/skills/`:

| File | What it controls |
|---|---|
| `skills/x.md` | Character limits, thread strategy, hooks, hashtag policy |
| `skills/linkedin.md` | Word count, opening hooks, professional tone, formatting |
| `skills/reddit.md` | Title style, peer tone, discussion format, self-promotion rules |
| `skills/hackernews.md` | Title constraints, Show HN/Ask HN format, technical focus |

Edit these files to change how bip writes for each platform. They're injected directly into the AI prompt.

### 4. Set up platform credentials

```bash
bip auth x           # X (Twitter) API keys
bip auth linkedin     # LinkedIn access token + person URN
bip auth reddit       # Reddit client ID + secret
bip auth hackernews   # HN username + password (browser automation)
bip auth --list       # check credential status for all platforms
```

| Platform | What you need | Where to get it |
|---|---|---|
| **X** | App Key, App Secret, Access Token, Access Token Secret | [developer.x.com](https://developer.x.com) |
| **LinkedIn** | Access Token + Person URN | [linkedin.com/developers](https://www.linkedin.com/developers/) |
| **Reddit** | Client ID + Secret | [reddit.com/prefs/apps](https://www.reddit.com/prefs/apps) — create a "script" app |
| **HackerNews** | Username + password | Your regular HN login (browser automation only) |

Credentials are stored in `.buildpublic/config.json` (automatically gitignored).

## Workflow

### Generate posts

```bash
bip draft
```

1. Reads your last 20 commits, changed files, and diff
2. Shows a git summary — confirm before calling the API
3. Sends everything to Claude with your `BUILD_IN_PUBLIC.md` context, `soul.md` voice, platform `skills`, and posting `memory`
4. Returns **2 variants per platform** — pick one, edit inline, or skip
5. Saves the draft to `.buildpublic/posts/`
6. Records your variant choice and any edits to memory

If `BUILD_IN_PUBLIC.md` hasn't been updated in 30+ days, bip will nudge you to run `bip evolve`.

### Publish

```bash
bip post              # publish the latest draft
bip post x            # publish to X only
bip post --dry-run    # preview with character counts, no API calls
```

Posts via official APIs first (X, LinkedIn, Reddit). Falls back to Playwright browser automation if the API fails. HackerNews always uses Playwright (no official submit API).

### Evolve your project doc

```bash
bip evolve
```

Claude reads your current `BUILD_IN_PUBLIC.md`, recent git log (50 commits), `package.json`, and posting history, then proposes updates section by section:
- Deepens the project description based on shipped features
- Detects new/removed dependencies for the tech stack
- Checks off completed milestones, suggests new ones
- You review, edit, or discard each change

### Evolve your voice

```bash
bip soul evolve
```

Analyzes your posting memory — which variants you pick, how you edit AI-generated text, what you add or remove — and proposes `soul.md` refinements. Examples:

- "You consistently remove hashtags" → adds to your Avoid section
- "You always shorten LinkedIn posts" → notes conciseness preference in Tone
- "You prefer direct openers over questions" → updates hook style

## How the AI prompt works

When you run `bip draft`, the prompt is assembled from four sources:

```
┌─────────────────────────────────────────┐
│  System prompt                          │
│  ├── Base strategist instructions       │
│  ├── Platform skills (from skills/*.md) │
│  └── Soul / voice (from soul.md)        │
├─────────────────────────────────────────┤
│  User prompt                            │
│  ├── BUILD_IN_PUBLIC.md project context │
│  ├── Memory (variant prefs, edit rate,  │
│  │   recent topics, posts to avoid      │
│  │   repeating)                         │
│  ├── Git activity (commits, diff, files)│
│  └── Output format instructions         │
└─────────────────────────────────────────┘
```

Everything except the base instructions is editable by you.

## Commands

| Command | Description |
|---|---|
| `bip init` | Scaffold config, skills, soul template, and directories |
| `bip auth <platform>` | Save credentials for x, linkedin, reddit, or hackernews |
| `bip auth --list` | Show credential status for all platforms |
| `bip draft` | Generate 2 post variants per platform from git activity |
| `bip post [platform]` | Publish the latest draft (optionally to one platform) |
| `bip post --dry-run` | Preview posts with character counts |
| `bip soul` | Interactive questionnaire to create or redo soul.md |
| `bip soul evolve` | Propose soul.md refinements from posting patterns |
| `bip evolve` | Update BUILD_IN_PUBLIC.md from recent project activity |
| `bip doctor` | Check your setup for common issues |
| `bip status` | See platforms, credentials, and recent drafts at a glance |
| `bip history` | Browse past drafts with content previews |
| `bip capture screenshot <url>` | Save a full-page PNG |
| `bip capture record <url>` | Record a browser session |

## Local data

```
your-project/
├── BUILD_IN_PUBLIC.md          # project context (committed)
└── .buildpublic/
    ├── config.json             # credentials + settings (gitignored)
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

```bash
git clone https://github.com/cynthialmy/build-in-public-automate
cd build-in-public-automate
npm install
npm run build       # compile to dist/
npm run dev         # run without building (tsx)
npm run typecheck   # type-check only
```

## License

MIT
