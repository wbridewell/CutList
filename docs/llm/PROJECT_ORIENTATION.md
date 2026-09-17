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
- `src/lib/shared`: Dependency-free helpers used across layers (normalization, atomic writes, app version, provider enums).
- `src/lib/debug`: Opt-in timing and routing traces.

## Module Map

One line per area: the entry point to read first, and the test that covers it.

| Area | Entry point | Tests |
| --- | --- | --- |
| Desktop command contracts | `src/lib/desktop/contracts.ts` | `backend.test.ts`, `errors.test.ts` |
| Trusted backend handlers | `src/lib/desktop/backend.ts` and `desktop/command.ts` | `backend.test.ts` |
| Native shell | `src-tauri/src/main.rs` registers handlers; `runtime.rs`, `backend.rs`, `commands/*.rs` do the work | `cargo test` in `src-tauri`, tests sit in each module |
| Client command helpers | `src/lib/client/desktopApi.ts`, `desktopPlaylistBridge.ts` | `desktopApi.test.ts`, `desktopPlaylistBridge.test.ts` |
| Client workflows | `src/lib/client/workflows.ts` | `workflows.test.ts` |
| Request planning | `src/lib/ai/services/userRequestPlan.ts`, `operatorPlanner.ts` | `userRequestPlan.test.ts`, `operatorPlanner.test.ts` |
| Request resolution and execution | `src/lib/ai/curator.ts`, `services/requestResolution.ts`, `services/curatorWorkflow.ts` | `curator.test.ts`, `requestResolution.test.ts` |
| Shared request cues | `src/lib/playlist/requestLexing.ts` | `requestLexing.test.ts` |
| Prompts and contracts | `src/lib/ai/prompts/index.ts`, `contracts/index.ts` | `prompts.test.ts`, `contracts.test.ts` |
| LLM providers | `src/lib/ai/llmClient.ts`, `providers/*` | `llmClient.test.ts`, `providers/*.test.ts` |
| Verification | `src/lib/music/verifyTrack.ts`, `verificationPolicy.ts` | `verifyTrack.test.ts` |
| Constraints | `src/lib/playlist/constraints/index.ts`, `registry.ts`, `extraction.ts` | `constraints/*.test.ts` |
| Playlist state and operations | `src/lib/playlist/state.ts`, `operations.ts` | `state.test.ts`, `operations.test.ts` |
| Import, export, persistence | `src/lib/playlist/io/*` | `io/*.test.ts` |
| Workspace persistence hook | `src/hooks/useLocalPlaylistDraft.ts` | `useLocalPlaylistDraft.test.ts` |
| UI | `src/app/page.tsx`, `src/components/ChatPanel.tsx`, `PlaylistPanel.tsx` | `uiRedesign.test.ts`, `ChatPanel.test.ts`, `PlaylistPanel.test.ts` |

## Important Files

- `src/app/page.tsx`
- `src/lib/desktop/contracts.ts`
- `src/lib/desktop/backend.ts`
- `src/lib/playlist/schemas.ts`
- `src/lib/playlist/constraints/index.ts`
- `src/lib/ai/curator.ts`
- `src/lib/music/verifyTrack.ts`
- `docs/llm/REQUEST_PIPELINE.md`
- `.env.example`

## Run and Test

- Run: `npm run dev`
- UI-only dev: `npm run next:dev`
- Test: `npm run test`
- Typecheck: `npm run typecheck`
- Build UI: `npm run build`
- Build macOS DMG: `npm run build:dmg`

## Where Code Should Go

- Desktop command payload schemas: `src/lib/playlist/schemas.ts`; command names and result types: `src/lib/desktop/contracts.ts`
- Playlist mutations: `src/lib/playlist/state.ts` and `src/lib/playlist/operations.ts`
- Playlist constraints: `src/lib/playlist/constraints`
- Playlist import/export/drafts: `src/lib/playlist/io`
- Provider integrations: `src/lib/music`
- LLM behavior: `src/lib/ai/services`, `src/lib/ai/prompts`, and `src/lib/ai/contracts`
- Client native-command helpers and workflow composition: `src/lib/client`
- UI: `src/components`

## Import Boundaries

ESLint enforces the layer order in `AGENTS.md`: `app -> components -> hooks -> client -> desktop -> ai -> music -> playlist -> types`, with `shared` and `debug` usable from anywhere. A forbidden import fails `npm run lint` with a message naming the rule.

## Where Code Should Not Go

- Do not put provider secrets or LLM calls in client components.
- Do not reimplement constraints inside React.
- Do not add request-cue regexes outside `src/lib/playlist/requestLexing.ts` and the deterministic parser; see `REQUEST_PIPELINE.md`.
- Do not add persistence outside native app-data draft/session storage without architecture review.
