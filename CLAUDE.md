# CLAUDE.md

This file provides guidance for AI tools working in this repository.

## Project Overview

`bip` is a TypeScript CLI that automates “build in public” workflows: generate social posts from git activity and publish to X, LinkedIn, Reddit, and HackerNews. **Drafting** uses multiple LLM providers via HTTP (`src/ai/drafter.ts`, `src/ai/providers.ts`); **social credentials** live in `.buildpublic/config.json`.

## Commands (maintainer)

```bash
npm run build       # tsup → dist/
npm run dev         # tsx src/index.ts
npm run typecheck   # tsc --noEmit
npm run test:run    # vitest run
```

CLI (after build): `node dist/index.js --help`

## Architecture (high level)

```
src/
├── index.ts              # Commander; loads dotenv from cwd .env first
├── commands/
│   ├── auth.ts / auth-ai.ts   # Social creds + LLM keys → .env
│   ├── draft.ts, post.ts, evolve.ts, soul.ts, …
├── ai/
│   ├── drafter.ts        # Multi-provider HTTP completion + PlatformPost JSON
│   ├── providers.ts      # PROVIDER_ENV_KEYS, detectProvider, getProviderConfigFor
│   ├── provider-choice.ts
│   ├── evolver.ts        # soul / BUILD_IN_PUBLIC evolution (HTTP)
│   └── git.ts
├── platforms/            # X, LinkedIn, Reddit, HN (+ Playwright fallbacks)
├── config/
│   ├── settings.ts, credentials.ts, types.ts, env-file.ts
├── memory/, skills/, capture/
```

## Design notes

- **ESM** (`"type": "module"`).
- **`process.cwd()`** — project-local paths, not bip’s install path.
- **LLM keys**: env vars (e.g. `ANTHROPIC_API_KEY`, `GLM_API_KEY`); `bip auth ai` upserts project `.env`.
- **Social posting**: APIs first; Playwright fallback; HN has no submit API.

## Environment

- Provider keys: see `PROVIDER_ENV_KEYS` in `src/ai/providers.ts`.
- Optional: `BIP_AI_PROVIDER` to force a provider when multiple keys exist.

## Local project layout (typical)

```
.buildpublic/
├── config.json    # platforms + optional aiProvider (gitignored)
├── posts/, memory/, captures/, …
```
