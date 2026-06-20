# Tech Stack

The CutList is a local-first Tauri desktop app with a Next.js TypeScript UI for verified collaborative playlist curation. The stack is intentionally small: application code owns playlist state, validation, provider matching, and constraints, while external services are limited to LLM providers and music metadata lookup.

## Runtime and Package Management

- Node.js and npm run the trusted TypeScript layers. Use a Node.js version compatible with Next.js 15.
- npm is the package manager, with `package-lock.json` committed for reproducible installs.
- The app has no server database, account system, OAuth integration, queue worker, or vector store.

## Application Framework

- Tauri v2 is the desktop runtime and native command host.
- Next.js 15 provides the embedded App Router UI and development server.
- React 19 renders the desktop webview UI.
- TypeScript 5.8 is used across the app, trusted desktop backend logic, and tests.
- Path imports use the `@` alias for `src`.

Primary framework entry points:

- `src/app/page.tsx`: main playlist workbench page.
- `src/app/layout.tsx`: root layout.
- `src/lib/desktop/backend.ts`: trusted desktop backend service layer.
- `desktop/command.ts`: Node/TypeScript desktop command runner.
- `next.config.ts`: embedded UI configuration.

## Frontend

- The UI is built with React components in `src/components`.
- Desktop UI lifecycle state, including native draft restore and autosave, lives in `src/hooks`.
- CSS is plain stylesheet code under `src/app/globals.css` and `src/app/styles`.
- Native app-data storage keeps the current draft and sessions. This is convenience storage, not secure storage.
- Frontend native-command calls should go through `src/lib/client` instead of ad hoc `invoke` calls in components.

## Desktop Boundaries

- Tauri commands replace the old HTTP API boundary.
- Trusted TypeScript services validate requests, call desktop-safe backend logic, and return structured responses.
- Request and response boundaries are validated with Zod before use.
- Server-only modules must keep provider credentials and raw LLM or metadata calls out of the UI bundle.

## Validation and Domain Modeling

- Zod defines runtime schemas at important boundaries, especially in `src/lib/playlist/schemas.ts`.
- Shared TypeScript playlist types live in `src/types/playlist.ts`.
- Playlist state transitions and operations are pure helpers in `src/lib/playlist`.
- Deterministic constraints live in `src/lib/playlist/constraints`.
- Import, export, and native draft storage live in `src/lib/playlist/io`.
- Deterministic analysis and version cleanup live in `src/lib/playlist/analysis`.

The core product rule is that the LLM proposes, metadata providers verify, deterministic constraints enforce, and the desktop app persists the local draft.

## LLM Providers

- Server-side LLM orchestration lives in `src/lib/ai`.
- The provider can be selected with `LLM_PROVIDER`.
- Supported provider modes are `ollama`, `openai`, `gemini`, and `none`.
- `none` is deterministic and useful for tests, demos, and constrained local work.
- Ollama is the default local development path.
- OpenAI support uses the `openai` npm package.
- Gemini support is implemented in the provider layer without adding a separate package dependency.

Important environment variables include:

- `LLM_PROVIDER`
- `OLLAMA_BASE_URL`
- `OLLAMA_MODEL`
- `OLLAMA_GPT_OSS_THINK`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `GEMINI_API_KEY`
- `GEMINI_MODEL`
- `LLM_TIMEOUT_MS`
- `LLM_DEBUG_RAW`

Provider keys are server-only. Do not expose them with `NEXT_PUBLIC_` variables.

Curator persona is no longer selected by environment variable in normal runtime use. It is stored as a local machine setting through the in-app `Curator persona` control and affects Curator-facing model outputs without changing verification policy.

## Music Metadata

- Music verification logic lives in `src/lib/music`.
- Provider integrations live in `src/lib/music/providers`.
- Track matching uses normalization and match scoring before accepting provider-backed metadata.
- iTunes and MusicBrainz-backed verification are part of the current product flow.
- Provider metadata can be incomplete, so verified rules may surface not-enough-evidence warnings instead of pretending the data is certain.

## Playlist Constraints

Verified rules are a first-class part of the stack. They cover playlist limits and metadata-backed filtering such as:

- Runtime.
- Duplicates.
- Artist spread.
- Genre fit.
- Explicit-content limits.
- BPM.

Curator guidance also lives in the same playlist-constraint system for v1. Guidance includes vocalist profile, energy trajectory, rare genres, vibes, and other shaping requests that the LLM should try to honor without presenting them as verified facts.

The current product distinction is:

- Verified rules: backend-checkable against current metadata fields.
- Curator guidance: prompt-driving preferences and shaping instructions.
- Not-enough-evidence warnings: only for verified rules whose required data is missing.

Constraint extraction, enforcement, registry metadata, user-facing presentation, and prompt guidance are all grouped under `src/lib/playlist/constraints`.

## Import and Export

Playlist IO is implemented in TypeScript rather than delegated to an external service. Supported export surfaces include:

- CSV.
- TXT.
- JSON.
- Migration CSV.
- M3U and M3U8.
- Apple Music XML.

Import-from-chat behavior is exposed through the playlist API and supporting playlist IO/domain helpers.

## Testing and Quality

- Vitest is the test runner.
- Tests run in a Node environment.
- React component tests use Testing Library.
- The default test command includes `src/**/*.test.ts` and excludes live provider tests.
- The prompt harness has its own Vitest config in `vitest.prompt-harness.config.ts`.
- `npm run lint` currently aliases `npm run typecheck`; there is no separate ESLint configuration yet.

Common commands:

- `npm run dev`: start the Tauri desktop app.
- `npm run next:dev`: start only the embedded Next.js development server.
- `npm run test`: run the normal Vitest suite.
- `npm run test:watch`: run Vitest in watch mode.
- `npm run prompt:harness`: run live prompt harness tests against a configured provider.
- `npm run eval:cross-cutting`: run the dated cross-workflow evaluation pack on top of the prompt/review harness layer.
- `npm run typecheck`: run TypeScript without emitting files.
- `npm run lint`: run the current lint placeholder, which is type checking.
- `npm run build`: build the static frontend used by the desktop app.
- `npm run build:dmg`: build the macOS DMG release package and bundled desktop runtime.

## Security Posture

- LLM and metadata provider calls stay in the trusted desktop backend.
- Secrets belong in `.env.local`, shell environment variables, or deployment secret storage.
- Request bodies are size-limited and schema-validated.
- API errors avoid exposing internal exception details.
- `next.config.ts` sets baseline security headers.
- `LLM_DEBUG_RAW` should stay off except during local debugging because raw model output can include user-supplied text; production ignores this flag.
- The local desktop persistence model is suitable for a prototype, not hardened secure storage.

## Deliberately Not Included

The current stack does not include:

- Spotify OAuth.
- Apple Music OAuth.
- Streaming-service upload.
- User accounts.
- Persistent server database.
- Production multi-user collaboration storage.
- Vector database or retrieval pipeline.
- Durable distributed rate limiting.

Adding any of those would be an architecture change, not a small dependency addition.
