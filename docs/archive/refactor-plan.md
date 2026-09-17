# Refactor Plan

This tracker covers the LLM action/schema refactor work identified in the schema-pattern analysis.

Status values: `pending`, `in progress`, `done`, `deferred`.

## Goal

Reduce repeated semantic plumbing around constraint scoping, request-plan assembly, workflow error handling, and import parsing without changing product behavior. The target is smaller, more explicit module boundaries for stable domain concepts, not a broad rewrite.

## Non-Goals

- No product-scope changes.
- No prompt-behavior expansion beyond what existing contracts already require.
- No new DSL unless a later pass proves a rule language is unavoidable.
- No schema contract breakage for desktop commands, LLM contracts, or persisted playlist state.
- No provider-integration rewrite.
- No UI redesign.

## Behavior That Must Stay Stable

- LLM contract ids, expected shapes, and repair behavior stay compatible with current prompts and tests.
- Verified-rule versus curator-guidance semantics stay unchanged.
- Persistent versus request-scoped constraint behavior stays unchanged.
- Playlist operations keep the same user-visible effects for add, remove, reorder, and set-style updates.
- Import parsing accepts the same supported pasted formats and rejects the same prose-like false positives.
- Verification keeps the same normalization, ambiguity handling, fallback behavior, and rejection codes.
- Desktop command names and payload/result schemas stay unchanged.
- Client workflow user-facing error messages stay unchanged unless a pass explicitly narrows wording without changing meaning.

## Candidate Refactor Passes

| Pass | Status | Notes |
| --- | --- | --- |
| Constraint domain model | done | Introduced a small shared constraint-layer model in `src/lib/ai/services/instructionIntent.ts` and reused it from `src/lib/ai/services/constraintLifecycle.ts` so persistent/request-scoped verified/guidance merge logic lives in one place. Kept behavior stable and trimmed the wrapper/return ceremony after ponytail review. |
| Heuristic request-plan helper | done | Extracted the repeated single-step fast-path assembly in `src/lib/ai/services/requestResolution.ts` with a small local helper inside `resolveCuratorRequestPlan`. Kept behavior stable and avoided the larger transport-object version. |
| Playlist operation module tightening | deferred | Reviewed this seam and tried a tiny registry-lookup tightening in `src/lib/playlist/operations.ts`, but reverted it after ponytail review. The current registry plus `find(...)` is already the simpler code at this size. |
| Workflow failure helper | done | Extracted a tiny helper in `src/lib/client/workflows.ts` for repeated workflow error-result assembly while keeping the same assistant messages, history entries, and workflow return shapes. Ponytail review did not justify backing it out. |
| Import parsing cleanup | done | Removed the duplicate delimiter-splitting helper in `src/lib/playlist/io/textImport.ts` and reused the existing splitter with no parsing-rule changes. |
| Verified track mapping seam | deferred | Consider a small typed mapping layer around provider-result-to-`Track` construction if provider metadata mapping grows. Not required for the first cleanup pass. |
| LLM contract plumbing | deferred | Keep current contract registry, prompt wiring, and repair flow unless later work shows real friction. Existing centralization is already good enough. |
| Desktop command wrapper consolidation | deferred | Leave thin client/backend wrappers alone unless command count grows enough to justify more abstraction. |

## Validation Commands

Run these after each meaningful pass:

- `npm run test`
- `npm run typecheck`
- `npm run lint`

Targeted checks worth rerunning while iterating on specific passes:

- `npm run test -- src/lib/ai/contracts/contracts.test.ts`
- `npm run test -- src/lib/ai/services/requestResolution.test.ts`
- `npm run test -- src/lib/ai/services/instructionIntent.test.ts`
- `npm run test -- src/lib/client/workflows.test.ts`
- `npm run test -- src/lib/playlist/io/textImport.test.ts`
- `npm run test -- src/lib/music/verifyTrack.test.ts`
- `npm run test -- src/lib/playlist/schemas.test.ts`

## Rollback Strategy

- Keep refactors in small passes with reviewable diffs.
- After each pass, run the validation commands before starting the next one.
- If a pass destabilizes behavior, revert only that pass instead of layering compensating fixes on top.
- Prefer preserving existing public types and schemas while moving logic behind them.
- If a typed domain model introduces churn across too many files at once, stop and split the pass into smaller compatibility-first steps.

## Completed / Deferred Log

### Completed

- `2026-06-19`: Analyzed LLM action schemas and adjacent workflow code for repeated semantic patterns.
- `2026-06-19`: Chose extraction targets conservatively: prioritize typed constraint modeling and small helpers; defer DSLs.
- `2026-06-19`: Created this refactor plan before implementation changes.
- `2026-06-19`: Completed the constraint-domain-model pass in `src/lib/ai/services/instructionIntent.ts` and `src/lib/ai/services/constraintLifecycle.ts`.
- `2026-06-19`: Centralized the persistent/request-scoped verified/guidance merge shape in one shared helper while keeping exported interfaces stable.
- `2026-06-19`: Trimmed follow-up wrapper and return-mapping ceremony after ponytail review instead of backing out the domain-model extraction.
- `2026-06-19`: Validated the constraint-domain-model pass with `npm run test -- src/lib/ai/services/instructionIntent.test.ts`, `npm run test -- src/lib/ai/services/requestResolution.test.ts`, `npm run typecheck`, and `npm run lint`.
- `2026-06-19`: Completed the workflow-failure-helper pass in `src/lib/client/workflows.ts`.
- `2026-06-19`: Kept the tiny workflow error helper after ponytail review; no further simplification was worth the churn.
- `2026-06-19`: Completed the import-parsing-cleanup pass in `src/lib/playlist/io/textImport.ts` by removing the duplicate delimiter splitter.
- `2026-06-19`: Validated the workflow/import cleanup pass with `npm run test -- src/lib/client/workflows.test.ts`, `npm run test -- src/lib/playlist/io/textImport.test.ts`, `npm run typecheck`, and `npm run lint`.
- `2026-06-19`: Reviewed the playlist-operations module seam and reverted the attempted lookup-table tightening in `src/lib/playlist/operations.ts`.
- `2026-06-19`: Completed the heuristic request-plan helper pass in `src/lib/ai/services/requestResolution.ts`.
- `2026-06-19`: Kept the helper local to `resolveCuratorRequestPlan` after ponytail review pushed back on the larger typed input object.
- `2026-06-19`: Validated the request-plan helper pass with `npm run test -- src/lib/ai/services/requestResolution.test.ts`, `npm run typecheck`, and `npm run lint`.

### Deferred

- `2026-06-19`: No DSL introduced. Current rule patterns do not justify one yet.
- `2026-06-19`: Playlist operation module tightening deferred; the attempted change added machinery without enough payoff.
- `2026-06-19`: No further abstraction added around LLM contract wiring.
- `2026-06-19`: No further abstraction added around desktop command wrappers.
- `2026-06-19`: Verified track mapping model deferred until provider-mapping complexity increases.
