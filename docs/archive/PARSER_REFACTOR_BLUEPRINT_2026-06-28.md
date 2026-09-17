# Parser Refactor Blueprint

Date: 2026-06-28

This blueprint turns the parser audit findings into a cleanup direction. The goal is to reduce duplicated intent detection, unify replacement parsing, and align playlist-local matching with provider verification.

## Goals

- Parse lexical intent once and reuse it everywhere
- Represent same-song replacement intent as one shared object
- Align title and album equivalence across playlist resolution and provider verification
- Reduce silent semantic reinterpretation in schema normalization
- Keep behavior deterministic first, with LLM routing layered on top rather than re-parsing the same concepts

## Target Architecture

### 1. Shared lexical request parser

Create a single parser-oriented module, for example `src/lib/playlist/requestLexing.ts`, responsible for:

- clause splitting
- add/remove/replace/reorder/analyze/import/conversational cue detection
- read-only and scope language detection
- named track and album span extraction
- replacement/version cue extraction
- placement anchor extraction
- count extraction

It should return a typed intermediate structure such as:

- `actions`
- `entities`
- `replacementIntent`
- `placementIntent`
- `scopeIntent`
- `counts`

Higher-level components should consume this structure instead of running new regex sets.

### 2. Unified replacement intent

Replace independent parsing across planner, request placement, and execution with one shared parsed shape:

- `replacementIntent.mode`
- `replacementIntent.targetQuery`
- `replacementIntent.requestedAlbum`
- `replacementIntent.versionKind`

This object should be created during lexical parsing, resolved against playlist state once, and then passed through planning and execution unchanged.

### 3. Shared semantic matching helpers

Add a dedicated matching-semantics module, for example `src/lib/music/matchSemantics.ts`, that owns:

- title equivalence
- loose title equivalence
- versionless equivalence
- album equivalence
- playlist-local “same named track” matching

`resolveNamedTrack()` should consume these helpers rather than relying only on `normalizeText()`.

### 4. Parse/policy separation

Split current deterministic parsing responsibilities into layers:

- lexical extraction
- policy derivation
- constraint update construction

That means:

- lexical parsing should not decide pruning policy
- cue extraction should not embed planner fallbacks
- clause parsing should not carry routing policy beyond raw extracted facts

### 5. Routing built on parsed facts

`requestRouting.ts` and `operatorPlanner.ts` should stop owning their own lexical vocabularies for review, add, replacement, and read-only cues.

They should route based on:

- shared lexical parse output
- playlist state
- explicit UI override state

Planner overrides should remain, but as policy adjustments over parsed facts rather than fresh lexical inference.

### 6. Import parsing hardening

Replace naive comma splitting in `textImport.ts` with a small quote-aware CSV row parser.

Keep:

- tab-separated handling
- prose rejection heuristics
- exact requested-track parsing delegation

But ensure column parsing is structurally correct before heuristics decide whether the line is import content.

### 7. Explicit normalization provenance

Keep backward compatibility where needed, but separate:

- legacy compatibility normalization
- malformed model repair
- ordinary schema validation

Where semantic repair happens, expose provenance instead of silently normalizing and forgetting it.

## Suggested Module Boundaries

- `src/lib/playlist/requestLexing.ts`
  - shared lexical parsing and extraction
- `src/lib/playlist/requestRouting.ts`
  - route selection from lexical facts plus playlist state
- `src/lib/playlist/requestPlacement.ts`
  - playlist resolution only, not lexical cue ownership
- `src/lib/music/matchSemantics.ts`
  - shared title and album equivalence
- `src/lib/playlist/io/textImport.ts`
  - structured row parsing only
- `src/lib/playlist/schemas.ts`
  - validation and explicitly labeled compatibility normalization

## Migration Order

1. Unify canonical replacement parsing
2. Unify cue detection for add/review/replace/read-only
3. Align playlist-local matching with provider verification semantics
4. Harden text import parsing
5. Reduce silent schema reinterpretation

## Expected Outcomes

- Fewer wording-specific parser bugs
- Fewer cases where routing and execution disagree about the same request
- Better testability because lexical facts are isolated from policy
- Smaller blast radius when new phrasing support is added
