# AGENTS.md

This file orients AI coding agents working on The CutList.

## Project Summary

The CutList is a Tauri desktop app with a Next.js TypeScript UI for collaborative playlist curation. The LLM proposes playlist ideas, external metadata providers verify tracks, deterministic playlist constraints enforce hard limits, and native app-data storage keeps one local draft plus named sessions.

This is not an account system, streaming-service uploader, Spotify/Apple Music OAuth app, or production multi-user service.

## Commands

- Install: `npm install`
- Dev app: `npm run dev`
- Next UI dev server: `npm run next:dev`
- Test: `npm run test`
- Typecheck: `npm run typecheck`
- Lint: `npm run lint`
- Build UI: `npm run build`
- Build macOS DMG: `npm run build:dmg`

## Repository Map

- `src/app`: Next.js App Router UI pages rendered inside Tauri.
- `src/lib/desktop`: Desktop command contracts and trusted backend services.
- `src/components`: React UI components.
- `src/hooks`: UI lifecycle hooks and native draft/session restore.
- `src/lib/ai`: Server-side LLM orchestration and prompt handling.
- `src/lib/client`: Tauri command helpers and UI-side workflow composition.
- `src/lib/music`: Metadata provider integrations and matching.
- `src/lib/playlist`: Core schemas, playlist state transitions, operations, collaboration history, and runtime helpers.
- `src/lib/playlist/constraints`: Constraint extraction, presentation, enforcement, registry metadata, and prompt guidance.
- `src/lib/playlist/io`: Playlist import, export, and local draft storage.
- `src/lib/playlist/analysis`: Deterministic playlist review helpers and version cleanup.
- `src/lib/shared`: Helpers with no domain dependencies that several layers need: text normalization, title and album equivalence, atomic file writes, the app version, and the provider and persona enums.
- `src/lib/debug`: Opt-in timing and routing traces. Importable from anywhere; imports nothing.
- `src-tauri/src`: The Rust shell. `runtime.rs` locates and validates the Node backend runtime and injects secrets; `backend.rs` spawns it per command and streams progress; `commands/` holds the native-only commands (export, keychain, workspace file, shell); `error.rs` is the error shape; `secrets.rs` wraps the keyring; `desktop_log.rs` is the redacted log; `main.rs` only registers handlers.
- `src/types`: Shared TypeScript types.
- `docs`: Human-facing architecture, usage, security, development, and deployment docs.
- `docs/llm`: Stable orientation docs for AI agents. Read `docs/llm/REQUEST_PIPELINE.md` before changing how requests are interpreted.

## Security Rules

- Never expose OpenAI or other provider secrets to the webview UI.
- Never add `NEXT_PUBLIC_` to server secrets.
- Keep LLM and metadata provider calls in trusted server-only modules and desktop commands.
- Validate desktop command payloads with Zod before use.
- Preserve payload size limits and the per-process LLM request guard.
- Do not log API keys, authorization headers, raw provider responses, or large prompt histories.
- Treat legacy `localStorage` drafts as migration-only data; native app-data storage is the supported persistence path.

## Import Boundaries

Dependencies point one way, and ESLint enforces it (`eslint.config.mjs`, the `boundary` blocks):

```text
app -> components -> hooks -> client -> desktop -> ai -> music -> playlist -> types
```

- `shared` and `debug` may be imported from anywhere and import nothing above `types`.
- The UI layers (`app`, `components`, `hooks`, `client`) may import `src/lib/desktop/contracts` and nothing else under `desktop`, and never `ai` or `music`.
- `music` may use the model client surface (`ai/services/llmService`, `ai/prompts`, `ai/llmConfig`, `ai/errors`) for match review, but not the curator services.
- `playlist` is the domain core and imports only `shared`, `debug`, and `types`.
- Tests are exempt so they can mock across layers.

If a change needs an edge the rule forbids, move the code to the layer that both sides can reach rather than widening the rule.

## Design Rules

- Keep the product focused on verified playlist curation.
- Reuse existing components before adding new patterns.
- Preserve accessible form labels, focus states, and readable responsive layouts.
- Do not add OAuth, accounts, playlist upload, or database persistence without an explicit architecture change.

## Coding Rules

- Prefer pure functions for playlist state, constraints, parsing, and matching.
- Keep desktop command handlers thin.
- Put frontend native-command logic in `src/lib/client`.
- Use explicit TypeScript types and Zod schemas at boundaries.
- Avoid new dependencies for trivial helpers.
- Update tests when desktop command contracts, schemas, constraints, or provider behavior changes.
- Every exported value must be imported by another module or by a test; `src/deadExports.test.ts` fails otherwise. Unexport helpers only their own file uses, and delete what nothing uses.
- `src/lib/desktop/commandRegistry.test.ts` fails when the TypeScript contract, the Rust handler list, and the Node dispatcher disagree about desktop commands.

## Documentation Rules

Update docs when changing commands, environment variables, desktop commands, architecture, security posture, or user workflows.

## Extra Caution

Review changes carefully in:

- `src/lib/desktop/*`
- `src/lib/ai/*`
- `src/lib/music/*`
- `src/lib/playlist/schemas.ts`
- `src/lib/playlist/constraints/*`
- `.env.example`
- `next.config.ts`
