# Parser Audit Findings

Date: 2026-06-28

This audit reviews parser-like surfaces across request intent parsing, track/import parsing, music matching and normalization, and LLM contract normalization.

Targeted validation run:

- `npm test -- src/lib/ai/services/operatorPlanner.test.ts src/lib/ai/services/deterministicRequestParser.test.ts src/lib/music/verifyTrack.test.ts src/lib/playlist/io/textImport.test.ts src/lib/ai/contracts/contracts.test.ts`
- Result: 60 passing tests

## Findings

### 1. Split add-intent vocabulary can route the same request differently

- Severity: `bug`
- Impacted parser surface: request routing, deterministic parsing, placement detection
- Why it is risky: the same user phrasing can be recognized as an add request in one layer but not another, which creates inconsistent routing and partial parsing.
- Duplicated/conflicting behavior:
  - `src/lib/playlist/requestRouting.ts` treats `add`, `adding`, `find`, `give me`, `recommend`, `suggest`, `replace`, `remove`, `cut`, `sequence`, and similar terms as curator signals.
  - `src/lib/ai/services/deterministicRequestParser.ts` has a separate add-intent detector with its own exclusions and vocabulary.
  - `src/lib/playlist/requestPlacement.ts` has a third add detector that also recognizes `insert`, `place`, `put`, `slot`, `drop in`, `bring in`, and `queue`.
- Concrete failure mode:
  - `queue Bela Lugosi's Dead after Firestarter`
  - Placement parsing can succeed while higher-level routing fails to treat the request as an add workflow.
- Smallest safe consolidation target:
  - One shared lexical add-intent detector consumed by routing, deterministic parsing, and placement parsing.

### 2. Canonical replacement parsing is split across independent layers

- Severity: `bug`
- Impacted parser surface: replacement routing, replacement target extraction, replacement album extraction
- Why it is risky: mode, target, and requested album are inferred in different places with different phrase coverage, so same-song replacement requests can partially parse and drift into generic replacement.
- Duplicated/conflicting behavior:
  - `src/lib/ai/services/operatorPlanner.ts` decides `replacementMode`.
  - `src/lib/playlist/requestPlacement.ts` extracts the playlist track target for canonical replacement.
  - `src/lib/ai/services/candidateExecution.ts` separately extracts requested album text during execution.
- Concrete failure mode:
  - `swap the live cut for the LP version from Murder Ballads`
  - The system can identify replacement mode without carrying the requested album, or carry the album without resolving the playlist target cleanly.
- Smallest safe consolidation target:
  - One shared `replacementIntent` parse result that includes mode, target query, and requested album.

### 3. Playlist-local track resolution is stricter than provider verification

- Severity: `fragile`
- Impacted parser surface: playlist track resolution vs music verification
- Why it is risky: a track can be treated as equivalent by provider verification but still fail local playlist resolution because the normalization rules differ.
- Duplicated/conflicting behavior:
  - `src/lib/playlist/requestPlacement.ts` resolves playlist tracks with `normalizeText()` and token inclusion.
  - `src/lib/music/matchScore.ts` and `src/lib/music/verifyTrack.ts` use looser semantics such as `normalizeLooseTitle()` and `normalizeVersionlessText()`.
- Concrete failure mode:
  - A title variant like `The Days of Swine & Roses` can verify as the same song while playlist-local replacement or placement still fails if only strict text normalization is used.
- Smallest safe consolidation target:
  - Shared semantic title and album equivalence helpers used by both playlist resolution and provider matching.

### 4. CSV-like import parsing is not quote-aware

- Severity: `bug`
- Impacted parser surface: track/import parsing
- Why it is risky: valid comma-delimited rows with commas inside quoted fields are split incorrectly, causing dropped or malformed imports.
- Duplicated/conflicting behavior:
  - `src/lib/playlist/io/textImport.ts` uses a raw `split(",")` path for comma rows.
  - Later import heuristics assume those columns are trustworthy.
- Concrete failure mode:
  - `"Mack the Knife, Live",Ella Fitzgerald,Mack the Knife`
  - The parser can mis-split the title into multiple columns or reject the row entirely.
- Smallest safe consolidation target:
  - A single quote-aware CSV row splitter for comma-delimited imports.

### 5. Review/analyze cue detection disagrees between routing and clause inference

- Severity: `fragile`
- Impacted parser surface: mixed review and curator requests
- Why it is risky: a request can be treated as review-bearing by routing but not by deterministic clause inference, which changes how mixed requests are decomposed.
- Duplicated/conflicting behavior:
  - `src/lib/playlist/requestRouting.ts` recognizes phrases like `focus on identity`, `which tracks weaken`, and `version risks?`.
  - `src/lib/ai/services/deterministicRequestParser.ts` uses a narrower `containsAnalyzeIntent()` detector.
- Concrete failure mode:
  - `focus on identity, then add two tracks`
  - Routing can treat this as mixed review plus mutate, while clause inference may miss the review intent entirely.
- Smallest safe consolidation target:
  - One shared review/analyze cue detector reused by routing and deterministic clause parsing.

### 6. Schema preprocessors silently reinterpret malformed or legacy-shaped payloads

- Severity: `fragile`
- Impacted parser surface: LLM contract normalization
- Why it is risky: malformed model output can be normalized into a valid mutating structure without making the semantic repair explicit, which hides parser drift and weakens contract boundaries.
- Duplicated/conflicting behavior:
  - `src/lib/playlist/schemas.ts` rewrites `rationale` to `reason` in candidate tracks.
  - The same file rewrites some review suggestion `type` values from application modes.
  - `normalizeInstructionIntentInput()` can synthesize `routingIntent` and `scopeIntent` from partial or legacy-shaped input.
- Concrete failure mode:
  - A partially malformed instruction-intent payload can still parse into a default mutating curator request instead of failing loudly.
- Smallest safe consolidation target:
  - Separate legacy compatibility normalization from model repair, and surface repair metadata explicitly.

## Highest-Risk Duplication Clusters

- Request-intent cue detection across `requestRouting.ts`, `deterministicRequestParser.ts`, `operatorPlanner.ts`, and `requestPlacement.ts`
- Replacement parsing split across planner, request placement, and candidate execution
- Title and album equivalence split between playlist-local resolution and provider verification

## Highest-Value Missing Regression Tests

- Add phrasing variants such as `queue`, `put`, `slot`, and `drop in` flowing correctly through routing plus placement
- Canonical replacement requests phrased as `LP version`, `record version`, or `album cut` with requested album propagation intact
- Quoted comma-delimited import rows with embedded commas
- Mixed review-plus-curator requests using phrases like `focus on identity`
- Contract normalization tests distinguishing accepted legacy input from repaired malformed input

## Areas That Look Safe

- Recent title and album normalization behavior in provider verification is covered well by `src/lib/music/verifyTrack.test.ts`
- Prose-vs-import false-positive protection is reasonably covered in `src/lib/playlist/io/textImport.test.ts`
- Operator planner safeguards for non-greeting conversational fallback and sticky canonical replacement now have direct regression coverage
