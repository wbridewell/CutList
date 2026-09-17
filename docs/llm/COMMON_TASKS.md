# Common Tasks

## Add a Desktop Command

A command that runs in the Node backend touches eight files. In order:

1. `src/lib/playlist/schemas.ts`: Zod schemas for the payload and result.
2. `src/types/playlist.ts`: export the inferred types.
3. `src/lib/desktop/contracts.ts`: add the name to `desktopCommandNames` and entries to the payload and result maps.
4. `src/lib/desktop/backend.ts`: the thin handler that parses the payload, calls a service, and parses the result.
5. `desktop/command.ts`: add the handler to the `handlers` map.
6. `src-tauri/src/backend.rs`: a `desktop_value_command!` line; then the `generate_handler!` entry in `src-tauri/src/main.rs`, written as a module path such as `backend::desktop_new_command`.
7. `src/lib/client/desktopApi.ts`: the `invoke` helper.
8. `src/lib/client/desktopPlaylistBridge.ts` or the matching `*Api.ts`: the client-facing function components call.

A native-only command (keychain, dialogs, reveal, open URL) skips steps 4 and 5, lives in the matching file under `src-tauri/src/commands/`, and may need a permission in `src-tauri/capabilities/default.json`. Add a test in `backend.test.ts` or `desktopApi.test.ts`, and the contract test that keeps the three command lists in sync will fail until all of them agree.

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

Use Vitest. Put tests near the module as `*.test.ts`. Build fixtures with `src/lib/testing/builders.ts` (`buildTrack`, `buildVerifiedTrack`, `buildPlaylist`, `buildCuratorResponse`, `buildHistoryEntry`) and pass only the fields the test is about; do not write a new local `track()` or `playlist()` helper. Component tests render to static markup with `react-dom/server` and assert on the HTML.

## Add Configuration

Update `.env.example`, `docs/DEVELOPMENT.md`, `docs/DEPLOYMENT.md`, and `AGENTS.md` if behavior changes.

## Update Docs

Keep docs concise and factual. Avoid claims that imply production security or reliability guarantees.

## Perform a Release

Run the checks in `RELEASE_CHECKLIST.md`, review secrets, review docs, and confirm no generated artifacts are tracked.
