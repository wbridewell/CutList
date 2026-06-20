# Product Strategy

The CutList explores an AI-native version of playlist curation: not a service that simply asks a model for songs, but a workbench where a user can shape a listening experience, verify the facts, inspect the tradeoffs, and export a usable artifact.

## Problem

Most AI playlist tools optimize for recommendation. They can suggest plausible songs from a mood, artist, era, or genre prompt, but they are weaker at the parts that make a playlist feel curated:

- sequencing,
- emotional flow,
- transition quality,
- constraint discipline,
- source-of-truth track metadata,
- and repair after a suggestion fails.

That gap matters because serious playlist builders are not only asking "what songs fit?" They are asking "does this playlist work?"

## Product Hypothesis

Curators want an AI collaborator that behaves more like a music editor than a recommendation engine.

The useful collaborator should:

- preserve the playlist's identity while making changes,
- explain why a recommendation fits,
- distinguish interpretation from verified fact,
- reject or repair bad candidates,
- and let the user remain in control of the final sequence.

## Current Approach

The prototype is built around one rule:

> The LLM proposes, providers verify, constraints enforce, and the desktop app stores the local draft.

This split is the core product and technical decision. The LLM is allowed to be creative, interpretive, and conversational. It is not treated as the source of truth for track existence, runtime, artist spelling, duplicates, or hard constraints.

## Design Principles

### Curation Over Generation

The main product surface is a playlist workspace, not a prompt box. Chat supports the playlist; it does not replace structured playlist state.

### Explanation Over Authority

Recommendations should include reasoning, but reasoning should be framed as an interpretation. The app should make it clear when a claim is backed by provider metadata, deterministic constraints, or model judgment.

### Evidence Over Assumption

The system should avoid relying on artist reputation, album reputation, genre stereotypes, or a model's memory when a provider can verify the concrete track. Future evidence sources may add lyrics, listener tags, audio features, or release context, but those sources should be represented explicitly.

### Editing Over Replacement

The strongest workflow is iterative repair: keep what works, identify what weakens the draft, and suggest focused changes. The user should be able to accept, reject, reorder, and export without surrendering ownership of the playlist.

## Architecture Decisions

### Metadata First

Accepted tracks come from provider metadata or deliberate manual entry. This prevents non-existent songs, wrong versions, duration mistakes, and malformed candidate output from silently entering the playlist.

### Deterministic Constraints

Hard limits belong in code. Duration ceilings, artist limits, duplicate handling, explicit-content preferences, and blocked artists cannot depend on prompt obedience.

### Thin Desktop Commands, Typed Boundaries

Desktop command handlers validate requests and delegate. Zod schemas define command contracts and playlist state boundaries. This keeps LLM behavior, provider matching, and playlist mutation logic testable outside React.

### Local-First Prototype

Drafts and named sessions live in native app-data files, with a one-time import path from legacy webview `localStorage`. This keeps the prototype easy to run and review while avoiding premature account, database, and OAuth design.

## Current Capabilities

- Natural-language playlist requests.
- Server-side LLM orchestration with Ollama, OpenAI, Gemini, or deterministic no-LLM mode.
- iTunes and MusicBrainz-backed track verification.
- Verified rules for runtime, duplicate handling, artist limits, genre limits, explicit-content preferences, and BPM when evidence exists.
- Curator guidance for vocalist profile, energy trajectory, vibes, sequencing feel, and rarer stylistic requests that are useful for shaping but not evidence-backed enforcement.
- Generic artist-repeat rules, including one-track-per-artist transforms before filling a playlist to a target size.
- Unknown-evidence warnings when a constraint needs metadata the current providers do not supply.
- Rejected-candidate feedback.
- Playlist analysis and import-from-chat workflows.
- Backend-validated subjective removals for requests such as removing tracks that weaken a mood or flow.
- Native app-data draft and named session persistence.
- CSV, TXT, JSON, migration CSV, M3U/M3U8, and Apple Music XML export.

## Intended Differentiators

### Playlist Gap Analysis

Identify weak openings, repetitive sections, energy cliffs, abrupt endings, missing connective tissue, and obvious constraint violations. Return a problem, a suggested repair, and a confidence level.

### Transition Repair

Evaluate adjacent tracks and suggest reorders, bridge tracks, or removals when a transition breaks the intended flow.

### Playlist Compression

Reduce a long playlist while preserving its identity, emotional arc, variety, and defining tracks.

### Intent Preservation

Every substantial edit should explain what was preserved, what changed, and how close the new draft remains to the user's apparent intent.

### Discovery Radius

Let the user choose how far recommendations should travel from the current playlist identity: safe, moderate, adventurous, or highly experimental.

### Track Roles

Represent tracks by playlist function, such as opener, bridge, anchor, climax, cooldown, resolution, surprise, or palette cleanser. Functional roles are easier to inspect and repair than abstract mood labels alone.

## Future Agent Roles

These are product concepts, not current separate services:

- **Verifier:** confirms track identity, version, runtime, and provider metadata.
- **Match Disambiguator:** compares multiple plausible provider matches for the same requested track and either chooses the strongest evidence-backed match with rationale or escalates uncertainty to the user.
- **Evidence Gatherer:** collects supporting signals such as tags, lyrics, audio features, listener descriptions, and release context.
- **Fit Evaluator:** estimates playlist role, emotional contribution, narrative contribution, and constraint compliance.
- **Skeptic:** challenges unsupported assumptions, version ambiguity, weak evidence, and stereotype-driven recommendations.

The current codebase already implements parts of the Verifier and Fit Evaluator responsibilities through provider verification, constraints, and analysis routes. Future work should add these roles only when they improve reliability or explainability.

## Evaluation

CutList should be evaluated on whether it helps users produce better playlists, not on whether it generates more text.

Useful evaluation questions:

- Did the app prevent hallucinated or misidentified tracks from being accepted?
- Did the final playlist satisfy hard constraints?
- Did the user understand why candidates were accepted or rejected?
- Did suggestions improve sequence, flow, or thematic coherence?
- Did the app preserve the user's intent after edits?
- Could the user export a playlist with minimal cleanup?

Potential test fixtures:

- prompts with fake or ambiguous songs,
- playlists with runtime violations,
- drafts with duplicated artists or tracks,
- long playlists that need compression,
- strong aesthetic prompts with missing bridge tracks,
- and transcripts containing useful analysis mixed with invalid recommendations.

## Roadmap

### Near Term

- Improve critique output around track roles, flow, and repair suggestions.
- Add clearer confidence and rejection explanations in the UI.
- Expand fixtures for ambiguous metadata, wrong versions, and constraint-heavy prompts.
- Document example playlists and failure cases.

### Medium Term

- Add transition-level analysis.
- Add playlist compression.
- Add user-controlled discovery radius.
- Add stronger evidence representation for subjective claims.
- Add lightweight evaluation reports for curated examples.

### Later

- Explore durable taste models from accepted, rejected, and reordered tracks.
- Explore richer evidence providers.
- Consider accounts, databases, or streaming-service integrations only after an explicit architecture change.

## Non-Goals

- No account system in the prototype.
- No Spotify or Apple Music OAuth.
- No direct playlist upload.
- No vector database unless retrieval becomes necessary and justified.
- No claim that provider metadata guarantees availability on every streaming service.
