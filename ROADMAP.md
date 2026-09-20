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

### Phase 1 — Smarter, platform-aware capture (shipped)

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

### Phase 2 — MCP server (shipped, scoped down)

`bip mcp` starts a stdio MCP server (`src/mcp/server.ts`) exposing:

- `bip_status` / `bip_history` — read-only, no prompts, safe to call freely.
- `bip_capture_screenshot` — same options as the Phase 1 CLI capture.
- `bip_draft_preview` — generates post variants from git activity for one or more
  platforms and returns them as data. Does **not** save or publish.

Deliberately out of scope for this phase: `bip_post` and a "save this draft" tool.
`bip draft`/`bip post` are interactive by design (variant picking, edit-in-editor,
platform-by-platform post/manual/skip choices, credential-backed publishing) — that
human-in-the-loop review is the point, and an MCP tool that silently posts to X/
LinkedIn/Reddit/HN on an agent's say-so is a real safety regression, not a
convenience. Revisit only with an explicit confirmation step designed in, not as a
default tool call.

Provider selection also can't prompt over MCP: `resolveProviderNonInteractive`
(`src/mcp/tools.ts`) errors instead of showing an interactive picker when multiple
AI provider keys are set and none is passed explicitly.

### Phase 3 — Claude Code skill / connector (shipped)

`bip init` now scaffolds `.claude/skills/build-in-public/SKILL.md` into every project
that runs it (from `templates/claude-skill/SKILL.md`, via `scaffoldClaudeSkill` in
`src/core/claude-skill.ts`) — no extra install step, it rides along with the setup
everyone already runs. The skill tells Claude Code to prefer the Phase 2 MCP tools
when connected, fall back to the CLI otherwise, and — critically — never script or
fake the interactive prompts in `bip draft`/`bip post` to save or publish on the
user's behalf; that hands back to the human for the actual save/publish step, same
boundary Phase 2 drew for the MCP tools themselves.

### Phase 4 — Review UX (not a separate web UI)

The problem statement argues against a browser dashboard — that would add a context
switch, the opposite of what this persona wants. If anything ships here, it's an
inline review/diff step before posting (e.g. `--dry-run`), not a new app to open.
Revisit only if users explicitly ask for a UI.

## Cross-cutting

Close test-coverage gaps on `capture/`, `auth*`, `draft`, `post`, `evolve`, `init`,
`soul` while touching them in each phase above — these are exactly the files with
zero tests today and the ones most affected by this roadmap.
