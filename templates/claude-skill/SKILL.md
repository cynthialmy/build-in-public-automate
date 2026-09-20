---
name: build-in-public
description: Draft and check "build in public" social posts (X, LinkedIn, Reddit, HackerNews) from this project's git activity using the bip CLI. Use when the user asks to draft a build-in-public post, share progress, check bip status/history, or capture a screenshot for a post.
---

# Build in Public (bip)

This project uses [`bip`](https://github.com/cynthialmy/build-in-public-automate) to
turn git activity into platform-tailored social posts.

## When to use this skill

- The user asks to draft a post about recent work, share progress, or "post an update"
- The user asks about draft/post history, or which platforms have credentials set up
- The user wants a screenshot sized for a specific platform (og/x/linkedin/reddit/hn)

## Preferred: MCP tools

If the `build-in-public` MCP server is connected (`bip mcp`), use its tools directly:

- `bip_status` — read-only: project name, platform credential status, recent drafts, cadence nudge
- `bip_history` — past drafts with previews (`limit` optional)
- `bip_capture_screenshot` — capture a URL; `preset` is one of `og`, `x`, `linkedin`, `reddit`, `hn`, `desktop`, `mobile`; also supports `selector`, `scale`, `waitFor`, `delay`
- `bip_draft_preview` — generate draft variants from git activity (`platforms`, `provider`, `focus`). **This only previews — it never saves or publishes anything.**

If the MCP server isn't connected, fall back to the CLI via Bash: `bip status`,
`bip history --limit <n>`, `bip capture screenshot <url> --preset <name>`.

## Saving and publishing — always hand back to the user

`bip_draft_preview` and `bip capture screenshot` are read-only/preview-only and safe
to call freely. Saving a draft or publishing it is a different matter: `bip draft` and
`bip post` are interactive on purpose — they make the user pick a variant, optionally
edit it, and confirm platform-by-platform before anything is saved or sent to a real
X/LinkedIn/Reddit/HackerNews account.

**Never** try to script or fake those interactive prompts (e.g. piping canned answers
into `bip draft`/`bip post` over stdin) to save or publish on the user's behalf — that
removes the human review step the tool is designed around. Instead:

1. Use `bip_draft_preview` (or `bip draft --preview`) to show the user what a post
   would look like.
2. If they like it and want it saved or posted, tell them to run `bip draft` / `bip post`
   themselves in their terminal, or run it together with you present to supply the
   interactive answers live.

## Setup

If `bip_status` / `bip status` reports "not initialized", tell the user to run
`bip init` themselves — it's an interactive setup wizard, so don't attempt to run it
non-interactively on their behalf.
