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

### Phase 5: Use your coding agent, not bip's own API key (shipped)

Most people running bip already have a coding agent open (Claude Code, Cursor,
Copilot, Codex). Asking them to also configure a separate LLM API key for bip is an
extra setup step and an extra cost that doesn't match how they actually work.

Split what `bip draft`, `bip evolve`, and `bip soul evolve` each did into two
steps, so the text-generation step can be done by whatever agent is already
running, using the model it already has:

- `bip_context` / `bip draft --context-only`: returns the git activity, project
  context, voice, and platform strategy bip would otherwise send to an LLM
  provider. No LLM call, no API key needed.
- `bip_save_draft` / `bip draft --apply <file>`: saves posts drafted elsewhere as
  a real draft, in the same shape the interactive flow produces. No LLM call.
- `bip_evolve_context` / `bip evolve --context-only`, then `bip_evolve_apply` /
  `bip evolve --apply <file>`: same split for BUILD_IN_PUBLIC.md.
- `bip_soul_context` / `bip soul evolve --context-only`, then `bip_soul_apply` /
  `bip soul evolve --apply <file>`: same split for soul.md.

Each command's own key-based path (and `bip_draft_preview` over MCP) stays as the
fallback for anyone without a coding agent running.

### Phase 6: GIF/video export (shipped)

`bip capture record` only produced webm, which X and LinkedIn don't accept.
`bip capture record <url> --format mp4` converts the recording to mp4, and
`--format gif` (with `--gif-width`/`--gif-fps` to tune it) produces a short GIF.
Both use a system `ffmpeg` binary (`src/capture/convert.ts`), the same pattern
bip already uses for Playwright's Chromium install rather than bundling a
WASM encoder, which would bloat the npm package for a feature most captures
won't use. Plain `bip capture record` (webm) and all screenshots still need
no extra install.

Recording stays CLI-only, not an MCP tool: starting and stopping are two
separate interactive steps (open a browser, press Enter to stop), which
doesn't fit a single stateless tool call the way screenshots do.

### Phase 7: Closing the feedback gap (shipped)

Real usage but zero GitHub issues or PRs (see Signals above) meant friction
was going unreported, not that it didn't exist. `bip feedback` (`src/commands/
feedback.ts`) gives users a path that takes seconds either way:

- Interactive by default: a 1-5 rating prompt, then an optional free-text
  prompt, both skippable with enter.
- `--rating <n>` and a positional message argument skip the corresponding
  prompt for a one-line, scriptable submission.
- A rating with no typed message posts straight to a Formspree endpoint,
  no click and no browser tab, since asking someone to review and submit a
  GitHub form defeats the point of a one-tap rating.
- Any typed message, rating or not, opens a pre-filled GitHub issue (title,
  body, `feedback` label) with bip/Node/OS versions attached, for the user
  to review and submit themselves rather than send silently on their
  behalf, matching Phase 2's "publishing always comes back to the human"
  principle. Written feedback benefits from visible triage; a bare rating
  doesn't need it.

No separate backend to host: Formspree forwards rating-only submissions to
email, and GitHub issues are already where this repo's bugs and PRs are
triaged, so nothing here needs its own upkeep.

### Phase 8: Anonymous usage telemetry (shipped)

`bip feedback` only captures what users choose to report. To see what's
actually being used without waiting for someone to say so, every command
sends a fire-and-forget `command_run` event to PostHog (`src/core/
telemetry.ts`): command name, a few non-identifying flags (e.g. which
platform, which preset), bip/Node/OS versions, and a random per-install ID.
Never git content, drafts, file contents, or credentials.

- Opt-out, not opt-in, with a one-time disclosure printed the first time an
  event would fire, `bip telemetry off`/`on`/status to manage it, and
  `BIP_TELEMETRY=0` as a scriptable override.
- The event fires without blocking the command: it doesn't await, so the
  real command starts immediately, bounded by an internal timeout so a
  slow or offline network can never hang the CLI on exit.
- Disabled automatically under `VITEST`, so the test suite never sends
  events or depends on network access.

### Phase 9: `bip ship`, one command instead of two (shipped)

`bip draft` then `bip post` covered the same ground this phase does, but as
two separate commands, and two things stayed manual every time: screenshots
needed a URL retyped from scratch on every run with no memory between them,
and the copy-paste-ready folder (`saveManualExport`, already built for
`bip post`'s manual fallback) only got created reactively, one platform at a
time, if you explicitly chose it.

`bip ship` (`src/commands/ship.ts`) wraps the same drafting and posting
logic into one pass:

- Same per-platform variant picker as `bip draft` (kept deliberately, not
  redesigned, so the reviewed UX stays familiar).
- Auto-screenshots once per platform's crop, using a URL saved to
  `previewUrl` in `.buildpublic/config.json` the first time it's asked for,
  never re-prompted after that.
- Always writes a manual-export folder for every accepted platform, so a
  ready-to-grab package exists by default, not only when the API/browser
  posting path fails.
- Posts automatically only where credentials exist and only with agreement,
  asked per platform, defaulting to no.

`PLATFORM_PRESET` (previously duplicated identically in `draft.ts` and
`post.ts`) moved to `src/core/platform-presets.ts`, and the variant-picking
UX moved to `src/core/draft-flow.ts`, so `bip draft` and `bip ship` share one
implementation instead of two that could drift. `bip draft` and `bip post`
are unchanged for anyone who prefers the two-step flow.

## Cross-cutting

### Test coverage (shipped)

`capture/recorder.ts`, `commands/{capture,auth,auth-ai,post,mcp,metrics,init,
evolve,soul,draft}.ts`, and `platforms/{twitter,reddit-client}.ts` had zero
tests before this pass. All now have real coverage: credential flows, the
post/publish decision tree (API success, browser fallback, manual export),
the full interactive draft flow (variant pick/edit/skip, screenshot attach),
init's project scaffolding, and the evolve/soul context/apply split.

Two things worth knowing if you touch these tests:

- `init.ts` and `evolve.ts`/`soul.ts`'s key-based path read or write
  `BUILD_IN_PUBLIC.md` and `.gitignore` straight from `process.cwd()`, not
  under the test-isolated `.buildpublic-test/`. Their tests mock
  `process.cwd()` itself to a sandboxed subdirectory so they never touch
  this repo's own files.
- Platform classes (`TwitterPlatform`, etc.) are instantiated once at
  module load in `post.ts`/`metrics.ts`, so their tests mock the platform
  modules with `vi.hoisted()` fixed instances rather than per-test
  `mockImplementationOnce`.

`platforms/hackernews.ts`, `platforms/linkedin.ts`, `platforms/reddit.ts`,
and `src/mcp/server.ts` now have real coverage too (100%, 98.88%, 100%, and
90% statements respectively): API posting paths, credential-missing errors,
Playwright browser-fallback login/compose/submit flows, and, for
`server.ts`, all 10 registered MCP tools verified against a real client over
`InMemoryTransport` rather than a mocked SDK. Overall suite coverage moved
from 76.82% to 85.28%.
