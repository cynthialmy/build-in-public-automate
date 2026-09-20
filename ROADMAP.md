# Roadmap

## Problem

Solo builders sharing progress from the terminal need bip's screenshots and drafts
to be sharp and reachable from wherever they're already coding, because today the
capture is a raw full-page dump and bip only exists as a separate CLI session, which
turns a 30-second update into a manual, context-switching chore — undermining the
"build in public while building" ease the tool exists to provide.

Signals: real usage (240 weekly npm downloads) but zero GitHub issues/PRs — either the
current narrow flow works for a slice of users, or friction is going unreported rather
than requested. This roadmap is built from usage/architecture signals and founder-user
experience, not verified interviews — worth validating with real users as phases ship.

## Phases

Each phase ships independently; order reflects leverage (small scope, high visible
win, unlocks the next phase) rather than strict blocking dependencies.

### Phase 1 — Smarter, platform-aware capture (in progress)

`src/capture/screenshot.ts` today: full-page Playwright dump, default viewport, no
selector targeting, no crop, no retina, `networkidle`-only wait. Zero test coverage.

- Viewport presets per platform (`og`, `x`, `linkedin`, `reddit`, `hn`, `desktop`,
  `mobile`) instead of one fixed default.
- Element/selector targeting (`--selector`) — auto-crops to just that element instead
  of a full-page dump.
- Retina/scale support (`--scale`).
- Wait strategies beyond `networkidle`: `--wait-for <selector>`, `--delay <ms>`.
- Test coverage for `capture/` (currently none).
- Follow-on (not in this pass): auto-attach a capture to a draft from `bip draft`.

### Phase 2 — MCP server

Expose bip's capabilities (`draft`, `post`, `capture`, `status`, `history`) as MCP
tools so bip is usable from inside Claude Code / Claude Desktop directly, not just a
separate terminal session. Requires splitting command logic from CLI I/O so both the
CLI and the MCP server call the same functions.

### Phase 3 — Claude Code skill / connector

A packaged skill/plugin that calls into the Phase 2 MCP server (or CLI as fallback),
so `bip draft` / `bip post` work as slash-commands inside any Claude Code session.
Likely the best distribution lever given existing real npm downloads.

### Phase 4 — Review UX (not a separate web UI)

The problem statement argues against a browser dashboard — that would add a context
switch, the opposite of what this persona wants. If anything ships here, it's an
inline review/diff step before posting (e.g. `--dry-run`), not a new app to open.
Revisit only if users explicitly ask for a UI.

## Cross-cutting

Close test-coverage gaps on `capture/`, `auth*`, `draft`, `post`, `evolve`, `init`,
`soul` while touching them in each phase above — these are exactly the files with
zero tests today and the ones most affected by this roadmap.
