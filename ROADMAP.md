# Roadmap

## Problem

Solo builders sharing progress from the terminal need bip's screenshots and drafts
to look good and be reachable from wherever they're already coding. Today the
capture is a raw full-page dump, and bip only exists as a separate CLI session. That
turns a 30-second update into a manual, context-switching chore.

Signals: real usage (240 weekly npm downloads) but zero GitHub issues or PRs. Either
the current narrow flow works for a slice of users, or friction is going unreported.
This roadmap is built from usage and architecture signals plus founder-user
experience, not verified interviews. Worth validating with real users as phases ship.

## Phases

Each phase ships independently. Order reflects leverage: small scope, high visible
win, unlocks the next phase.

### Phase 1: Smarter, platform-aware capture (shipped)

Before: full-page Playwright dump, default viewport, no selector targeting, no crop,
no retina, `networkidle`-only wait, zero test coverage.

- Viewport presets per platform (`og`, `x`, `linkedin`, `reddit`, `hn`, `desktop`,
  `mobile`) instead of one fixed default.
- Element/selector targeting (`--selector`), auto-cropped to just that element.
- Retina/scale support (`--scale`).
- Wait strategies beyond `networkidle`: `--wait-for <selector>`, `--delay <ms>`.
- Test coverage for `capture/`.
- Follow-on (shipped): `bip draft` and `bip post` now crop the attached screenshot
  to whichever platform the post is actually going to, instead of a generic
  full-page desktop dump (`PLATFORM_PRESET` in `draft.ts` / `post.ts`).

### Phase 2: MCP server (shipped, scoped down)

`bip mcp` starts a stdio MCP server (`src/mcp/server.ts`) with:

- `bip_status` / `bip_history`: read-only, no prompts, safe to call freely.
- `bip_capture_screenshot`: same options as the Phase 1 CLI capture.
- `bip_context` / `bip_save_draft`: draft with the caller's own model, save the
  result as a real draft. See Phase 5.
- `bip_draft_preview`: fallback that generates post variants using bip's own
  configured LLM key. Does not save or publish.

No `bip_post` tool. `bip post` is interactive by design (variant picking, editing,
per-platform confirmation before publishing), and an MCP tool that could post to a
real account on an agent's say-so is a safety regression, not a convenience.

Provider selection can't prompt over MCP either: `resolveProviderNonInteractive`
(`src/mcp/tools.ts`) errors instead of showing a picker when multiple provider keys
exist and none was specified.

### Phase 3: Claude Code skill (shipped)

`bip init` scaffolds `.claude/skills/build-in-public/SKILL.md` into every project
that runs it, so there's no separate install step. The skill tells Claude Code to
prefer the MCP tools when connected, fall back to the CLI otherwise, and never
script or fake the interactive prompts in `bip post` to publish on the user's
behalf. Publishing always comes back to the human.

### Phase 4: Review UX, not a separate web UI

A browser dashboard would add a context switch, which is the opposite of what this
persona wants. If anything ships here, it's an inline review step before posting
(e.g. `--dry-run`), not a new app to open. Revisit only if users ask for a UI.

### Phase 5: Draft with your coding agent, not bip's own API key (shipped)

Most people running bip already have a coding agent open (Claude Code, Cursor,
Copilot, Codex). Asking them to also configure a separate LLM API key for bip is an
extra setup step and an extra cost that doesn't match how they actually work.

Split what `bip draft` did into two steps, so the drafting step can be done by
whatever agent is already running, using the model it already has:

- `bip_context` / `bip draft --context-only`: returns the git activity, project
  context, voice, and platform strategy bip would otherwise send to an LLM
  provider. No LLM call, no API key needed.
- `bip_save_draft` / `bip draft --apply <file>`: saves posts drafted elsewhere as
  a real draft, in the same shape the interactive flow produces. No LLM call.

`bip draft`'s own key-based path (and `bip_draft_preview` over MCP) stays as the
fallback for anyone without a coding agent running. `bip evolve` and
`bip soul evolve` still need an API key either way; they are not part of this
split.

## Cross-cutting

Close test-coverage gaps on `capture/`, `auth*`, `draft`, `post`, `evolve`, `init`,
and `soul` while touching them in each phase above. These are the files with zero
tests today, and the ones most affected by this roadmap.
