# The CutList Architecture

The CutList uses one guiding rule:

> The LLM proposes, providers verify, constraints enforce, and the client persists the local draft.

## Boundaries

- `src/app/api/playlist`: Thin route handlers. They parse and validate requests, call server services, and serialize responses. Shared request guards and NDJSON streaming live beside the routes.
- `src/lib/ai`: Server-side LLM orchestration. The curator facade handles natural-language playlist requests, while `services`, `contracts`, `prompts`, `guidance`, `providers`, and `testing` subdirectories own the supporting concerns.
- `src/lib/music`: Metadata provider integration and match scoring. Accepted tracks must come from provider-backed or manually reviewed provider metadata.
- `src/lib/playlist`: Shared playlist domain logic. Schemas define the contract; pure state helpers apply playlist updates; `constraints`, `io`, `analysis`, and `fixtures` subdirectories own focused supporting domains.
- `src/lib/client`: Frontend-safe API transport and workflow composition. React components should call these helpers instead of owning `fetch`, stream parsing, or playlist workflow details directly.
- `src/components`: Rendering and interaction components. Components may coordinate state, but reusable playlist mutations should live in `src/lib/playlist`.
- `src/hooks`: Browser state lifecycle hooks such as local draft restore/autosave.

## Data Flow

1. The user sends seeds, pasted drafts, or natural-language requests from the browser.
2. Client API helpers call the matching `/api/playlist/*` route.
3. Server routes validate with Zod schemas from `src/lib/playlist/schemas`.
4. LLM services may propose candidates, but music providers verify identity and metadata.
5. Playlist constraints are enforced before any accepted track reaches the playlist update.
6. Client workflow helpers compose playlist updates, assistant messages, and history entries.
7. The browser applies accepted updates through pure playlist state helpers and autosaves one local draft.

## Refactor Rules

- Keep API route shapes backward-compatible unless a change is intentional and tested.
- Keep verification policy in `src/lib/music` and constraint policy in `src/lib/playlist`; React should not reimplement either.
- Add new UI flows by composing client API helpers, playlist state helpers, and focused components.
- Prefer pure functions for playlist mutations so behavior is easy to test outside React.
