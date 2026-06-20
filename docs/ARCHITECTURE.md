# Architecture

The core rule is: the LLM proposes, providers verify, constraints enforce, and the desktop app persists local drafts and sessions.

## Runtime

- Tauri desktop shell.
- Next.js App Router UI rendered inside the Tauri webview.
- TypeScript throughout the UI and trusted desktop backend logic.
- Native desktop commands for LLM/provider access and persistence.

## Entry Points

- UI: `src/app/page.tsx`
- Layout: `src/app/layout.tsx`
- Desktop command contract: `src/lib/desktop/contracts.ts`
- Desktop backend service: `src/lib/desktop/backend.ts`
- Client API wrapper: `src/lib/client/playlistApi.ts`
- Client workflow composition: `src/lib/client/workflows.ts`

## Domain Layout

- `src/lib/ai/curator.ts`: public AI orchestration facade used by the desktop backend service.
- `src/lib/ai/services`: LLM-backed workflow services and instruction intent parsing.
- `src/lib/ai/contracts`: LLM JSON contracts and tests.
- `src/lib/ai/prompts`: prompt builders.
- `src/lib/ai/guidance`: reusable prompt guidance.
- `src/lib/ai/providers`: provider-specific LLM clients.
- `src/lib/ai/testing`: prompt harness fixtures and tests.
- `src/lib/music`: metadata providers, verification policy, matching, and normalization.
- `src/lib/playlist`: core schemas, playlist state transitions, operations, collaboration history, and runtime helpers.
- `src/lib/playlist/constraints`: constraint extraction, enforcement, presentation, registry metadata, and prompt guidance.
- `src/lib/playlist/io`: playlist import/export and local draft persistence.
- `src/lib/playlist/analysis`: deterministic review and version cleanup helpers.
- `src/lib/playlist/fixtures`: development fixtures.

## Desktop Command Model

Desktop commands accept JSON-like payloads, validate with Zod schemas, and return structured JSON results. Curator progress is emitted as Tauri events while a native command is in flight.

## Data Flow

1. React components collect playlist state and user intent.
2. Client helpers invoke native desktop commands.
3. Trusted TypeScript desktop services validate inputs and call the curator/verification layers.
4. LLM services propose candidates or analysis.
5. Metadata providers verify track identity.
6. Playlist constraints accept, reject, annotate results, or surface unknown evidence when a rule needs metadata the current providers do not supply.
7. Constraint-driven transforms can prune existing tracks before generation, such as enforcing one track per artist before filling to a target count.
8. Curator-guided removals are validated against existing track IDs before any playlist mutation is returned.
9. The UI applies updates and native app-data persistence saves the current draft and sessions.

## Persistence

There is no database. Draft and named session persistence live in native app-data files, with a one-time import path from legacy webview `localStorage`.

## External Services

- Ollama for local LLM generation.
- OpenAI or Gemini for optional hosted LLM generation.
- iTunes Search API and MusicBrainz for metadata verification.

## Tradeoffs

- Native command execution keeps the architecture small, but the trusted backend still depends on the local Node/TypeScript toolchain.
- Local draft and session storage make setup easy but are not secure storage.
- Provider metadata improves quality but cannot guarantee perfect track identity.
- BPM, vocalist-profile, and energy-trajectory constraints are confidence-aware foundations. They can reject clear known violations, but missing evidence is reported separately from hard constraint failure.

## Current Refactor State

The completed refactor arc centralized playlist constraints, LLM contracts, playlist operations, verification policy, stream contracts, export formats, and client workflows into domain modules. Future changes should extend those registries and helpers instead of reintroducing parallel prompt strings, component-local mutation rules, or ad hoc constraint handling.
