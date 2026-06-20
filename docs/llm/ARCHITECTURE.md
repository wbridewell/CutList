# Architecture

## System Boundaries

The Tauri webview owns interaction and React state. Trusted desktop services own local draft persistence, named session snapshots, LLM calls, provider calls, validation, and command responses.

## Frontend/Backend Split

Frontend components call desktop-aware client helpers in `src/lib/client`. Native desktop commands call trusted TypeScript backend services.

## Data Flow

User input -> client desktop helper -> Tauri command -> Zod validation -> LLM/provider/domain service -> Zod response validation -> React state update -> native app-data save.

## State Management

Playlist state is held in React and persisted through desktop workspace-state helpers into native app-data files. Named sessions are explicit local snapshots of playlist, messages, and request history. Shared playlist changes should use pure helpers in `src/lib/playlist`.

## Routing Model

The UI is a single App Router page rendered inside Tauri. Desktop-native actions flow through Tauri commands rather than localhost HTTP routes.

## API Model

Desktop commands validate JSON-like payloads and structured responses. Curator progress is emitted as Tauri events while a command is in flight.

## Persistence Model

No database exists. Local drafts and named sessions are versioned JSON in native app-data storage.

## External Services

Ollama, OpenAI, Gemini, iTunes Search API, and MusicBrainz are the current external integrations.

## Build and Deployment

Next.js builds the static frontend used by the desktop app. macOS release packaging is a separate `build:dmg` path that bundles the desktop runtime.

## Tradeoffs

The app favors explicit schemas, local-first desktop drafts, and deterministic constraints over broad integrations.
