# Request Pipeline

How a message typed into the Curator Console becomes a playlist change. Read this before changing how requests are interpreted: the logic spans two processes and a dozen modules, and the same request is planned once for a preview and then executed.

## Stages

| Stage | Where it runs | Entry point | Model calls |
| --- | --- | --- | --- |
| 1. Plan preview | Backend spawn via `desktop_plan_user_request` | `resolveUserRequestPlan` in `src/lib/ai/services/userRequestPlan.ts` | `instructionIntent`, `operatorPlan` (none when a deterministic exit applies) |
| 2. Client routing | Webview, `sendMessage` in `src/components/ChatPanel.tsx` | reads `routeFamily`, `executionPolicy`, `operationPlan` | none |
| 3. Message handling | Backend spawn via `desktop_playlist_message` | `handlePlaylistMessage` in `src/lib/ai/curator.ts` | reuses the preview plan; re-plans only if the fingerprint no longer matches |
| 4. Request resolution | same spawn | `resolveCuratorRequestPlan` in `src/lib/ai/services/requestResolution.ts` | `instructionIntent` only if the plan never attempted it; `curatorStepPlan` only for multi-step requests |
| 5. Execution | same spawn | `executeResolvedCuratorPlan` in `src/lib/ai/services/curatorWorkflow.ts` | one or more execution contracts per step (see below) |
| 6. Response | Webview | `applyCuratorResponse` in `src/lib/playlist/state.ts` | none |

Review requests skip stages 4 and 5: the client calls `desktop_analyze_playlist`, which runs `handleAnalyzePlaylist` in `src/lib/ai/services/analyzeService.ts` (`playlistCritique` or `playlistTransitionRepair` contract, with `deterministicAnalyzePlaylist` as the fallback).

## Stage 1: plan preview

`resolveOperatorPlan` in `src/lib/ai/services/operatorPlanner.ts` produces a `ResolvedOperatorPlan`:

1. Deterministic signals: `parseDeterministicRequest` (`deterministicRequestParser.ts`) for operation and constraint cues, `parseTrackRowsFromText` for pasted tables, and the shared cue functions in `src/lib/playlist/requestLexing.ts`.
2. Deterministic exits, no model call: pasted tracks route to import; an empty playlist with review signals routes to review; an explicit non-modification directive or the Review button forces a read-only review plan.
3. Otherwise two model calls: the `instructionIntent` contract (`instructionIntent.ts`, producing verified rules, curator guidance, and counts) and the `operatorPlan` contract (route family, template, operators, declared entities). Either can fall back to a deterministic plan.
4. Overrides: a review plan becomes a curator plan when the text has explicit mutating cues; a conversational plan is rejected for anything that is not a greeting; read-only plans cannot carry mutating operators.
5. Entity binding: declared track names, transitions, placements, and replacement targets are resolved against the playlist (`requestPlacement.ts`).

`resolveUserRequestPlan` wraps this in the client-facing `ResolvedUserRequestPlan`: the operation, the `operationPlan` kind with its review and curator prompts, and the full `operatorPlan` plus a `fingerprint` from `requestPlanFingerprint` covering the message, tracks, rules, discovery radius, suppressions, and conversation context.

## Stage 2: client routing

`sendMessage` reads the preview and dispatches:

- review with `read_only` policy: `runAnalyzeWorkflow` with the review prompt
- import: `runImportWorkflow`
- `mixed_review_and_curator`: `runAnalyzeWorkflow` with the review clause, then `runCuratorRequestWorkflow` with the curator clause
- everything else: `runCuratorRequestWorkflow` with the whole message and the `precomputedPlan`

The mixed path sends a different string from the one previewed, so its curator half is re-planned in stage 3 by design.

## Stage 3: message handling

`handlePlaylistMessage` in order:

1. Unsupported catalog questions ("what songs are on X", "list songs by Y") get a fixed answer from `detectUnsupportedCatalogQuery` in the lexer.
2. The operator plan comes from `precomputedPlan` when its fingerprint equals `requestPlanFingerprint` of the incoming message and playlist; otherwise `resolveOperatorPlan` runs again.
3. Route family: review goes to `handleAnalyzePlaylist`; import to `handleImportChat`; conversational returns a canned reply.
4. A strict reorder-only request (`isStrictReorderOnlyRequest`) with at least two tracks goes straight to `handlePlaylistShapeRequest`.
5. Everything else continues to stage 4.

## Stage 4: request resolution

`resolveCuratorRequestPlan` builds a `ResolvedCuratorRequestPlan` (`workflowTypes.ts`):

1. Deterministic parse again, plus heuristics from `curatorRequestIntent.ts` (operation, counts, scope, special cases).
2. Heuristic early exits, no model call: conversational-only, pasted rows, a direct reorder, a direct removal, a constraint prune.
3. Instruction intent is taken from the operator plan when it attempted one; otherwise the `instructionIntent` contract runs here.
4. Constraint state from `constraintLifecycle.ts`: persistent versus request-scoped, verified rules versus curator guidance, and what persists after success.
5. The pre-generation removal plan: alternate-version cleanup and constraint pruning that must happen before adding tracks.
6. Steps from `stepPlanner.ts`: heuristic steps first; the `curatorStepPlan` contract only when there are more than two non-rule steps and the text has no explicit ordering words.

## Stage 5: execution

`executeResolvedCuratorPlan` runs the steps in order, threading playlist and constraint state between them:

| Step kind | Service | Model contract |
| --- | --- | --- |
| `update_rules` | inline | none |
| `remove` | `removalPlanner.ts` | `playlistRemoval` for subjective removals; deterministic for rule violations |
| `add`, `replace` | `candidateExecution.ts` | `candidateBatch`, up to three attempts when a count was requested; every candidate goes through `verifyTrack` in `src/lib/music`; optional `matchReview` |
| `reorder` | directed placement, else `playlistShapeService.ts` | `playlistShape` |
| `import` | `specialHandlers.ts` | none |
| multi-step summary | inline | `workflowSummary` |

## Where request cues live

- `src/lib/playlist/requestLexing.ts`: the shared cues (add, remove, replace, reorder, review, non-modification, placement, replacement metadata, strict reorder-only, unsupported catalog questions). New cues go here.
- `src/lib/ai/services/deterministicRequestParser.ts` and `src/lib/playlist/constraints/extraction.ts`: constraint values and per-clause operation signals.
- `src/lib/ai/services/reviewMode.ts`: which review mode a review request wants.
- `src/lib/playlist/analysis/compression.ts`: compression requests.

Do not add cue regexes to the facade, the planners, or the client; they belong in the lexer or the parser, where the tests are.

## Changing behavior

| To change | Edit | Tests |
| --- | --- | --- |
| Which route family a phrasing gets | overrides and fallbacks in `operatorPlanner.ts` | `operatorPlanner.test.ts`, `userRequestPlan.test.ts` |
| A new constraint parsed from text | `constraints/extraction.ts`, `constraints/registry.ts` | `constraints/*.test.ts`, `deterministicRequestParser.test.ts` |
| How steps are derived | `stepPlanner.ts` | `stepPlanner.test.ts` |
| What a step does | `curatorWorkflow.ts` and the service it calls | `curator.test.ts`, `candidateExecution.test.ts` |
| A shared cue | `requestLexing.ts` | `requestLexing.test.ts` |
| A prompt | `src/lib/ai/prompts/index.ts` | `prompts.test.ts`, then `npm run prompt:harness` |
