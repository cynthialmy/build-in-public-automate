# Build In Public: bip

## Project Description
`bip` is a CLI tool that automates "build in public" workflows for developers.
You add it to any project and it reads your recent git activity, generates platform-tailored posts using Claude AI, and publishes to X/Twitter, LinkedIn, Reddit, and HackerNews — all from the terminal.
The goal: make sharing dev progress frictionless so more builders actually do it.

## Tech Stack
- TypeScript (ESM), Node 18+
- Claude API (claude-sonnet-4-6) for post generation
- Commander.js for CLI, @inquirer/prompts for interactive input
- twitter-api-v2, LinkedIn REST API, snoowrap (Reddit)
- Playwright for browser automation fallback + HackerNews
- tsup for bundling, simple-git for reading git history

## Target Audience
- Indie hackers and solo developers building in public
- Developer advocates sharing project updates
- Open source maintainers announcing releases
- Anyone who commits code but rarely posts about it

## Preferred Platforms
1. X (Twitter) — short punchy updates, threads for launches
2. HackerNews — Show HN posts for major milestones
3. LinkedIn — slightly more professional tone, career context
4. Reddit — community-specific subreddits (r/SideProject, r/webdev)

## Post Style
Casual but credible. Technical enough to be interesting to developers, but not jargon-heavy.
Single posts preferred (not threads) unless it's a launch or major milestone.
First person, honest about what's working and what isn't.
No hype — just real progress updates with context.

## Milestones / Goals
- [x] Core CLI (init, auth, draft, post)
- [x] Claude-powered post generation from git diffs
- [x] X/Twitter, LinkedIn, Reddit, HackerNews posting
- [x] `bip doctor` health check command
- [x] `bip history` and `bip status` commands
- [ ] Web dashboard to review/edit drafts before posting
- [ ] Scheduled posting (post at best engagement times)
- [ ] Analytics: track which posts get the most engagement
- [ ] Plugin system for custom post templates
- [ ] npm publish and public launch
