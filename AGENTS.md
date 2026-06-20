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
- `src/types`: Shared TypeScript types.
- `docs`: Human-facing architecture, usage, security, development, and deployment docs.
- `docs/llm`: Stable orientation docs for AI agents.

## Security Rules

- Never expose OpenAI or other provider secrets to the webview UI.
- Never add `NEXT_PUBLIC_` to server secrets.
- Keep LLM and metadata provider calls in trusted server-only modules and desktop commands.
- Validate request bodies with Zod before use.
- Preserve request size limits and rate/concurrency guards.
- Do not log API keys, authorization headers, raw provider responses, or large prompt histories.
- Treat legacy `localStorage` drafts as migration-only data; native app-data storage is the supported persistence path.

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
- Update tests when route contracts, schemas, constraints, or provider behavior changes.

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
