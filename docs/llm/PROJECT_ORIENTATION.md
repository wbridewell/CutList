# Project Orientation

## What This Is

The CutList is a Tauri desktop app with a Next.js TypeScript UI for verified collaborative playlist curation.

The product hypothesis is that serious playlist builders need an AI collaborator for flow, repair, sequencing, and explanation, not just another recommendation generator. See `docs/PRODUCT_STRATEGY.md` before making roadmap-scale product changes.

## What This Is Not

It is not a production multi-user service, streaming-service OAuth integration, playlist uploader, or account system.

## Primary Users

- People drafting and refining playlists.
- Developers improving playlist curation workflows.
- LLM coding agents making scoped changes.

## Core Workflows

- Import or seed tracks.
- Ask for playlist changes.
- Verify candidate tracks.
- Enforce constraints.
- Export playlist data.

## Main Directories

- `src/app`: App Router UI rendered inside Tauri.
- `src/components`: React components.
- `src/hooks`: UI lifecycle hooks and native draft/session restore.
- `src/lib/ai`: Server-side LLM services.
- `src/lib/ai/services`: LLM-backed playlist workflows and intent parsing.
- `src/lib/ai/contracts`: LLM JSON output contracts.
- `src/lib/ai/prompts`: Prompt builders.
- `src/lib/ai/providers`: Hosted/local LLM provider clients.
- `src/lib/client`: Tauri command helpers and UI-side workflow composition.
- `src/lib/music`: Metadata verification.
- `src/lib/playlist`: Schemas, state, operations, collaboration history, and playlist domain helpers.
- `src/lib/playlist/constraints`: Constraint extraction, enforcement, presentation, registry metadata, and prompt guidance.
- `src/lib/playlist/io`: Import, export, and local draft logic.
- `src/lib/playlist/analysis`: Deterministic playlist review and cleanup helpers.

## Important Files

- `src/app/page.tsx`
- `src/lib/desktop/contracts.ts`
- `src/lib/desktop/backend.ts`
- `src/lib/playlist/schemas.ts`
- `src/lib/playlist/constraints/index.ts`
- `src/lib/ai/curator.ts`
- `src/lib/music/verifyTrack.ts`
- `.env.example`

## Run and Test

- Run: `npm run dev`
- UI-only dev: `npm run next:dev`
- Test: `npm run test`
- Typecheck: `npm run typecheck`
- Build UI: `npm run build`
- Build macOS DMG: `npm run build:dmg`

## Where Code Should Go

- Route contracts: `src/lib/playlist/schemas.ts`
- Playlist mutations: `src/lib/playlist/state.ts` and `src/lib/playlist/operations.ts`
- Playlist constraints: `src/lib/playlist/constraints`
- Playlist import/export/drafts: `src/lib/playlist/io`
- Provider integrations: `src/lib/music`
- LLM behavior: `src/lib/ai/services`, `src/lib/ai/prompts`, and `src/lib/ai/contracts`
- Client fetch helpers: `src/lib/client`
- UI: `src/components`

## Where Code Should Not Go

- Do not put provider secrets or LLM calls in client components.
- Do not reimplement constraints inside React.
- Do not add persistence outside native app-data draft/session storage without architecture review.
