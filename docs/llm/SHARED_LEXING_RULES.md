# Shared Lexing Rules

## Purpose

`src/lib/playlist/requestLexing.ts` is the shared lexical source of truth for natural-language playlist request cues.

Use it for low-level request detection such as:

- add intent
- remove or cut intent
- replace intent
- explicit reorder intent
- review intent
- non-modification directives
- placement phrases like `after X`, `before X`, and `at the beginning`
- replacement metadata like canonical-version and requested album cues
- ordered clause splitting for mixed prompts

Do not re-implement these regex families in other parser layers unless there is a very strong reason and the behavior is kept in lockstep.

## Why This Matters

Several parser layers consume the same user phrasing:

- `src/lib/ai/services/operatorPlanner.ts`
- `src/lib/ai/services/deterministicRequestParser.ts`
- `src/lib/ai/services/stepPlanner.ts`
- `src/lib/ai/services/requestResolution.ts`
- `src/lib/playlist/requestRouting.ts`
- `src/lib/playlist/requestPlacement.ts`

If one layer recognizes a cue and another does not, requests can drift between:

- review vs mutating routes
- add vs reorder vs remove steps
- placement move vs fresh addition
- deterministic fallback vs LLM-dependent handling

This repo has already seen failures from that drift.

## Current Invariants

- `drop in` is an add-placement cue, not a removal cue.
- `tighten`, `compress`, and `reduce` count as cut/compression language and should participate in mutating removal-style planning, not just review-only compression analysis.
- Apostrophes, ampersands, and other title punctuation should be handled by shared normalization or shared matching helpers, not by one-off parser fixes.
- Leading articles and similar title or album normalization rules should be shared across matching and request interpretation paths.
- If a request can be handled deterministically from shared lexical cues, prefer that over pushing the request into an LLM-only route.

## Practical Rules For Agents

- Before adding a new request cue, check `src/lib/playlist/requestLexing.ts` first.
- If a parser bug appears in more than one workflow, fix the shared lexing or normalization layer instead of patching only the named symptom path.
- Request routing, operator planning fallbacks, deterministic parsing, step planning, and replacement-mode parsing should consume shared lexing helpers directly unless the behavior is intentionally higher-level.
- If a consumer currently carries local copies of add/remove/reorder/review regexes, treat that as drift debt and prefer reusing the shared helper.
- When changing a lexing rule, add or update regression tests in the parser or request-resolution layer that prove the user-visible route or step sequence.

## Minimum Regression Expectations

When shared lexing changes, cover at least one scenario for each affected behavior:

- positive case: the intended route or step is chosen
- negative case: a neighboring intent is not misclassified
- mixed case: multi-clause prompts preserve execution order
- fallback case: deterministic handling still works when the LLM is disabled or times out

## Source Of Truth

- Shared lexing: `src/lib/playlist/requestLexing.ts`
- Placement binding: `src/lib/playlist/requestPlacement.ts`
- Deterministic request parsing: `src/lib/ai/services/deterministicRequestParser.ts`
- Step planning: `src/lib/ai/services/stepPlanner.ts`
- Final curator request resolution: `src/lib/ai/services/requestResolution.ts`
