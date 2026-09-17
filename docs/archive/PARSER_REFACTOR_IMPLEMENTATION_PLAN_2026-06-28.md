# Parser Refactor Implementation Plan

Date: 2026-06-28

This plan converts the parser refactor blueprint into a concrete implementation sequence. It is intentionally decision-complete so another engineer or agent can implement it directly.

## Phase 1: Introduce shared lexical parsing

Create `src/lib/playlist/requestLexing.ts` with a typed output that includes:

- operation cues: add, remove, replace, reorder, analyze, import, conversational
- review/read-only cues
- clause boundaries
- counts: requested add count, replacement count, target total count
- scope cues: persistent vs request-scoped
- placement intent
- replacement intent with:
  - mode
  - target query
  - requested album
  - version kind

Implementation rules:

- Move lexical regex ownership into this module.
- Do not move policy decisions here.
- Reuse existing regex behavior where possible for the first pass.
- Keep the module deterministic and side-effect free.

## Phase 2: Rewire request parsing and planning to consume lexical output

Update these consumers to depend on shared lexical facts instead of separate regex sets:

- `src/lib/ai/services/deterministicRequestParser.ts`
- `src/lib/playlist/requestRouting.ts`
- `src/lib/ai/services/operatorPlanner.ts`
- `src/lib/playlist/requestPlacement.ts`

Specific changes:

- Replace duplicate add/review/replacement/read-only cue checks with shared lexical fields.
- Remove local canonical replacement cue ownership from planner and request placement.
- Make planner route selection operate on lexical parse results plus playlist state.
- Keep planner safeguards and overrides, but ensure they do not re-detect lexical concepts from raw text.

## Phase 3: Unify replacement intent flow

Replace the current split replacement parsing flow with one object passed through the stack:

- lexical parse creates `replacementIntent`
- planner resolves playlist target from `replacementIntent.targetQuery`
- resolved plan carries `replacementIntent.requestedAlbum`
- candidate execution uses the carried album directly and stops re-parsing album text from `userMessage`

Specific cleanup:

- Delete execution-time album extraction once the plan carries requested album
- Delete duplicate canonical cue logic from planner and request placement after migration
- Ensure canonical replacement remains sticky if deterministic parsing identifies it early

## Phase 4: Align playlist-local matching with provider semantics

Add `src/lib/music/matchSemantics.ts` with shared helpers for:

- loose title equivalence
- versionless title equivalence
- album equivalence
- playlist-local named-track equivalence

Update:

- `src/lib/playlist/requestPlacement.ts`
- `src/lib/music/matchScore.ts`
- `src/lib/music/verifyTrack.ts`

Implementation rules:

- Playlist-local resolution should stop relying on `normalizeText()` alone for title equality.
- Album equivalence should reuse the same helper in scoring and verification.
- Keep low-level normalizers in `normalize.ts`, but move semantic comparisons into the new helper layer.

## Phase 5: Harden import parsing

Update `src/lib/playlist/io/textImport.ts`:

- Replace raw comma splitting with a quote-aware CSV row parser
- Preserve tab-separated behavior
- Preserve prose rejection logic
- Keep `parseExplicitRequestedTracks()` delegated from deterministic parsing

Implementation rules:

- Do not add a dependency for CSV parsing
- Support quoted commas in title, artist, and album fields
- Maintain current behavior for header-based imports and simple headerless rows unless quotes are involved

## Phase 6: Reduce silent schema reinterpretation

Refine preprocessors in `src/lib/playlist/schemas.ts`:

- Separate legacy compatibility rewrites from malformed-model repair
- Keep currently required compatibility rewrites, but make them explicit and traceable
- Prefer failing validation over silently inventing semantics where the current code is guessing

Specific actions:

- Keep `rationale -> reason` compatibility for candidate tracks if needed
- Review `normalizeInstructionIntentInput()` defaults for routing and scope fields
- Add explicit metadata or dedicated helper names for compatibility paths so future audits can distinguish repair from validation

## Required Tests

Add or update tests covering:

- add phrasing variants:
  - `queue`
  - `put`
  - `slot`
  - `drop in`
- mixed review-plus-curator requests using review phrases not currently shared
- canonical replacement with:
  - `album cut from X`
  - `LP version on X`
  - `record version off X`
- playlist resolution of loose title variants
- quoted comma-delimited import rows
- schema normalization cases that distinguish:
  - accepted legacy payload
  - explicitly repaired malformed payload
  - rejected ambiguous payload

## Acceptance Criteria

- One lexical parser is the source of truth for request cue detection
- Replacement mode, target query, and requested album are parsed once and carried through planning and execution
- Playlist-local track resolution and provider verification use the same semantic title and album equivalence rules
- Text import parsing handles quoted comma-delimited rows correctly
- Schema normalization paths are explicit enough that repair behavior is observable in tests
- Existing targeted parser and matching test suites remain green after migration
