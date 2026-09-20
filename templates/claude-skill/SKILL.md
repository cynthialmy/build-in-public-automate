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

## Drafting: use your own model, not bip's

You are already a coding agent with a model attached, so draft the post yourself
instead of asking bip to call its own LLM provider. That needs no extra API key and
costs nothing beyond the conversation you're already having.

If the `build-in-public` MCP server is connected (`bip mcp`):

1. Call `bip_context` (`platforms`, `focus` optional) to get the system prompt,
   user prompt, and git activity bip would normally send to a provider. This makes
   no LLM call and has no side effects.
2. Write the post yourself, following that context and the platform/voice rules
   inside it.
3. Call `bip_save_draft` with the posts you wrote (`{ posts: [{ platform, text, ... }] }`)
   to save them as a real draft. This does not publish anything.

Without MCP, do the same over the CLI: `bip draft --context-only` prints the same
context as JSON, then `bip draft --apply <file>` saves a JSON file shaped like
`{ "posts": [...], "attachments": [...] }`.

Only fall back to bip's own key-based drafting (`bip_draft_preview`, or
`bip draft` without `--context-only`/`--apply`) if the user has no coding agent
available and wants bip to draft on its own.

## Other tools

- `bip_status` (or `bip status`): project name, platform credential status, recent
  drafts, cadence nudge. Read-only.
- `bip_history` (or `bip history --limit <n>`): past drafts with previews.
- `bip_capture_screenshot` (or `bip capture screenshot <url> --preset <name>`):
  capture a URL. `preset` is one of `og`, `x`, `linkedin`, `reddit`, `hn`, `desktop`,
  `mobile`. Also supports `selector`, `scale`, `waitFor`, `delay`.

## Publishing: always hand back to the user

`bip_save_draft` and `bip draft --apply` save a draft. They do not publish it.
Publishing is `bip post`, and it is interactive on purpose: it makes the user pick
a variant if more than one exists, optionally edit it, and confirm platform by
platform before anything is sent to a real X/LinkedIn/Reddit/HackerNews account.

**Never** try to script or fake those interactive prompts (for example piping
canned answers into `bip post` over stdin) to publish on the user's behalf. That
removes the human review step the tool is built around. Instead, tell the user to
run `bip post` themselves, or run it together with you present to supply the
interactive answers live.

## Setup

If `bip_status` / `bip status` reports "not initialized", tell the user to run
`bip init` themselves. It is an interactive setup wizard, so do not attempt to run
it non-interactively on their behalf.
