# Common Tasks

## Add a Desktop Command

Add or update a desktop command contract in `src/lib/desktop/contracts.ts`, implement the thin handler in `src/lib/desktop/backend.ts`, define or update Zod schemas in `src/lib/playlist/schemas.ts`, and add tests.

## Add a Component

Place it in `src/components`, reuse existing props and domain helpers, and preserve accessible labels.

## Add Playlist Domain Behavior

- State transitions: `src/lib/playlist/state.ts` or `src/lib/playlist/operations.ts`.
- Constraints: `src/lib/playlist/constraints`.
- Import/export/local drafts: `src/lib/playlist/io`.
- Deterministic analysis helpers: `src/lib/playlist/analysis`.

## Add LLM Behavior

Use the existing AI subdirectories: `services` for workflows, `contracts` for JSON shapes, `prompts` for prompt builders, `guidance` for reusable instructions, and `providers` for provider-specific clients.

## Add a Trusted Backend Entry Point

Keep the command handler thin. Validate input, call a service, validate output, and return client-safe errors.

## Add a Dependency

Prefer not to. If needed, document why it is necessary, update the lockfile, and verify CI.

## Add a Test

Use Vitest. Put tests near the module as `*.test.ts` unless the existing pattern changes.

## Add Configuration

Update `.env.example`, `docs/DEVELOPMENT.md`, `docs/DEPLOYMENT.md`, and `AGENTS.md` if behavior changes.

## Update Docs

Keep docs concise and factual. Avoid claims that imply production security or reliability guarantees.

## Perform a Release

Run the checks in `RELEASE_CHECKLIST.md`, review secrets, review docs, and confirm no generated artifacts are tracked.
