# Roadmap Checklist

Date: 2026-06-13

Companion to [ROADMAP_2026-06-13.md](ROADMAP_2026-06-13.md).

This document is the operational companion to the roadmap. The roadmap explains why each milestone matters; this checklist tracks what is already in place, what is underway, and what should happen next.

## Status Key

- `[x]` Landed
- `[~]` In progress
- `[ ]` Not started
- `[-]` Deferred on purpose

## 1. Improve Evidence Quality

### Foundations

- `[x]` Product-visible split between Verified rules and Curator guidance is in place.
- `[x]` Verified-rule evaluation can report missing evidence instead of pretending uncertain fields are known.
- `[x]` BPM is treated as a verified-rule family only when BPM data exists.
- `[-]` External BPM enrichment is deferred until a compliant, responsive source is chosen.

### Still To Do

- `[x]` Audit which verified rules depend on metadata fields that are commonly null.
- `[x]` Add better coverage reporting for incomplete provider metadata.
- `[~]` Expand fixtures for wrong versions, ambiguous matches, and sparse metadata.
- `[x]` Improve user-facing provenance copy for verified versus inferred judgments.
- `[~]` Consider an agentic match-disambiguation pass when provider verification returns multiple plausible matches, where the system compares versions, duration, album/release context, and confidence signals before either selecting a best match with rationale or escalating to manual review.

### Next Recommended Moves

- `[x]` Produce a field-by-field nullability audit for current provider metadata.
- `[x]` Turn the highest-risk null fields into explicit evidence warnings or coverage counters.
- `[x]` Add evaluation fixtures for BPM-missing and genre-sparse cases.
- `[~]` Prototype ambiguous-match fixtures that compare automatic curator-assisted selection against the current manual-review-only flow.

## 2. Harden Intent Modeling

### Landed In V1

- `[x]` Layered intent output separates `operationIntent`, `verifiedRules`, `curatorGuidance`, and `scopeIntent`.
- `[x]` `replace` is a first-class operation.
- `[x]` Verified rules versus curator guidance are normalized before workflow routing.
- `[x]` Count semantics are separated more clearly than the original mixed intent path.

### Still To Do

- `[ ]` Expand contradiction and ambiguity fixtures.
- `[ ]` Tighten mixed-request handling where shaping, scope, and generation appear together.
- `[ ]` Improve persistent-versus-one-shot detection for more conversational phrasings.
- `[ ]` Add more regression coverage around target-total versus add-count requests.

### Next Recommended Moves

- `[ ]` Build a dated evaluation set of real mixed requests and contradiction cases.
- `[ ]` Prioritize the top few misroutes and add targeted parser and workflow tests.
- `[ ]` Review whether any remaining regex overrides should move into normalization or prompt examples.

## 3. Expand Transformation Review

### Current Position

- `[x]` Transformation Review v1 exists as a real workflow surface.
- `[x]` Review suggestions can already drive concrete follow-up actions.
- `[~]` Review is useful, but it still needs stronger role language, risk framing, and example coverage.

### Still To Do

- `[ ]` Improve explanations for track roles, transitions, and preserved identity.
- `[ ]` Strengthen repair suggestions for weak bridges, pacing cliffs, and endings.
- `[ ]` Improve confidence framing for subjective review judgments.
- `[ ]` Expand fixture coverage for representative review requests.

### Next Recommended Moves

- `[ ]` Build a small review evaluation pack with good, weak, and obviously overbuilt playlists.
- `[ ]` Tighten review copy so interpretive claims read as judgment, not evidence.
- `[ ]` Add a pass focused on explainability before adding more review surface area.

## 4. Add Playlist Compression

### Current Position

- `[x]` Compression v1 exists as a review-style workflow centered on cutting existing tracks, not replacing them.
- `[x]` Compression suggestions use section-level guidance with manual apply.

### Still To Do

- `[ ]` Validate compression suggestions against a representative set of long playlists.
- `[ ]` Improve preserved-versus-removed explanation quality.
- `[ ]` Check that optional post-apply review feels useful without becoming noisy.
- `[ ]` Add stronger regression coverage around apply, stale suggestions, and undo.

### Next Recommended Moves

- `[ ]` Run compression against a handful of real playlist shapes: repetitive middle, weak ending, overlong first act, duplicate-artist congestion.
- `[ ]` Review whether compression should emit clearer target progress summaries.
- `[ ]` Decide what counts as "done" for compression before broadening it toward replacement-aware editing.

## 5. Expand Discovery-Radius Behavior

### Landed In V1

- `[x]` Playlist state stores a persistent `discoveryRadius`.
- `[x]` New playlists default to `moderate`.
- `[x]` The composer exposes `Safe`, `Moderate`, `Adventurous`, and `Highly experimental`.
- `[x]` Request text can temporarily override the saved mode for a single send.
- `[x]` Candidate-generation prompts use the effective discovery radius.

### Still To Do

- `[ ]` Evaluate safe versus experimental behavior on real playlist fixtures.
- `[ ]` Decide whether more review follow-ups should honor one-shot discovery overrides.
- `[ ]` Improve prompt grounding around what identity must be preserved during exploration.
- `[ ]` Measure when broader exploration starts hurting verification yield or fit quality.

### Next Recommended Moves

- `[ ]` Add prompt-harness fixtures that compare the same request under `safe` and `highly_experimental`.
- `[ ]` Track whether adventurous modes lower acceptance rates or increase weak-fit rejections.
- `[ ]` Refine the language that tells the model what it is allowed to stretch versus preserve.

## Cross-Cutting Evaluation Work

- `[x]` Build a dated evaluation set from representative playlist requests and failure cases.
- `[x]` Add a lightweight way to compare prompt behavior before and after prompt edits.
- `[x]` Collect a small set of canonical playlists for regression checks across generation, review, replacement, compression, and discovery radius.

## Notable Since This Snapshot

- `[x]` Local alpha setup now includes an in-app LLM settings flow for Gemini, OpenAI, and Ollama instead of requiring manual `.env.local` editing.
- `[x]` Desktop alpha persistence now uses native app-data storage for workspace state instead of relying only on browser storage semantics.
- `[x]` Candidate generation now respects session-scoped suppression for previously non-credible tracks so made-up suggestions do not keep resurfacing within the same playlist session.
- `[x]` Manual match acceptance now clears sibling rejected-candidate issues for the same normalized track within the same curator interaction.
- `[x]` Retry passes now deduplicate repeated rejected candidates before they reach History and Issues.
- `[x]` LLM-assisted match review can prune obvious non-matches and recommend one plausible provider match without auto-accepting it.
- `[x]` Rejected-candidate copy is cleaner: user-facing prune summaries no longer expose raw provider ids in the Issues surface.

## Recommended Execution Order

- `[ ]` Finish the evidence-quality audit and missing-evidence coverage work.
- `[ ]` Expand intent-modeling fixtures for mixed and contradictory requests.
- `[ ]` Deepen transformation review explanations and confidence framing.
- `[ ]` Validate and harden playlist compression.
- `[ ]` Run discovery-radius comparison fixtures and tune prompt behavior.

## Definition Of Roadmap Progress

- `[ ]` Evidence quality is meaningfully better when users can see what is verified, what is missing, and what is only inferred.
- `[ ]` Intent modeling is meaningfully better when mixed requests route correctly and persistent rules stop surprising users.
- `[ ]` Transformation review is meaningfully better when suggestions feel specific, legible, and safe to act on.
- `[ ]` Compression is meaningfully better when long playlists can be tightened without losing identity.
- `[ ]` Discovery radius is meaningfully better when users can feel the difference between modes without breaking fit quality or verification discipline.
