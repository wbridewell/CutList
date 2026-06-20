# Evidence Audit

## Purpose

This document captures the current evidence posture of The CutList as of June 15, 2026. It explains which verified-rule families depend on which metadata fields, where current provider support is strong or weak, and what the product should communicate to users when evidence is incomplete.

This is a current-state audit, not a roadmap promise. It should be updated if provider integrations or verified-track population change materially.

## Current Provider-Backed Metadata Surface

Provider verification currently populates these concrete metadata fields from provider results:

- `title`
- `artist`
- `album`
- `durationMs`
- `sourceUrl`
- `isrcs`
- `artworkUrl`
- `explicit`
- `releaseDate`
- `primaryGenreName`

Verified playlist tracks also store additional evidence-oriented fields:

- `bpm`
- `bpmConfidence`
- `vocalProfile`
- `vocalProfileConfidence`
- `evidenceNotes`

Important current limitation:

- verification currently leaves `bpm`, `bpmConfidence`, `vocalProfile`, and `vocalProfileConfidence` as `null` unless a track was enriched or reviewed outside the standard provider-verification path.

## Verified-Rule Evidence Dependency Table

| Rule family | Evidence field(s) | Current availability | Product consequence | Recommended handling |
| --- | --- | --- | --- | --- |
| Track max/min duration | `durationMs` | Strong | Deterministic enforcement is reliable in normal verified flows. | Keep as verified rules with normal enforcement. |
| Target total duration | `durationMs` | Strong | Playlist-level runtime targets are broadly trustworthy. | Keep as verified rule and surface any rare runtime gaps as evidence notes. |
| Max/min track count | none | Strong | No metadata dependency. | No special evidence handling needed. |
| Explicit-content rule | `explicit` | Partial | Some tracks can be checked deterministically, some cannot. | Report coverage notes when explicitness is unknown. |
| Artist exclusions / artist limits / max-per-artist | `artist` | Strong | Provider-backed artist identity is available enough for verified enforcement. | Keep current enforcement. |
| Text exclusions | `title`, `artist` | Strong | Matching against verified track text is reliable enough for deterministic filtering. | Keep current enforcement. |
| Genre exclusions / no-more-from-genres / genre limits | `genreTags` | Partial and broad | Rules work against provider tags, but provider coverage is sparse or broad on some tracks. | Keep as verified rules for v1, but always frame genre evidence as provider-tag-based and incomplete. |
| BPM min/max/target | `bpm` | Weak / often missing | BPM rules are only trustworthy when BPM is present. | Keep as verified-when-known, surface coverage notes and unknown evidence warnings. |

## High-Risk Sparse or Null Fields

### BPM

- Highest-risk evidence gap in the verified-rule system.
- Verified rules already support BPM semantics correctly when BPM exists.
- The main product problem is not logic, but coverage.

User-facing implication:

- users should see that BPM rules are active,
- known BPM mismatches should still reject,
- missing BPM should be reported as partial or missing evidence rather than silently ignored.

### Genre Tags

- Genre tags are available through provider/tag mapping, but coverage is broad and inconsistent.
- Empty `genreTags` arrays weaken any genre-based verified rule.
- Broad provider tags like `Alternative` or other store-level buckets may be technically present but only loosely informative.

User-facing implication:

- genre rules can remain verified in v1,
- but evidence notes should acknowledge that these rules rely on provider tag coverage, not canonical genre truth.

### Explicitness

- `explicit` can be null even on otherwise verified tracks.
- This creates a meaningful but non-failing evidence gap for no-explicit requests.

User-facing implication:

- explicit-track blocking is still valid when explicitness is known,
- but users should see partial coverage notes if some tracks are unclassified.

## User-Facing Implications

### Verified rules

Verified rules should continue to be presented as backend-checkable rules, but only with the evidence quality the current metadata supports.

This means:

- runtime rules are strong,
- artist and text rules are strong,
- genre rules are broad/incomplete,
- explicitness is partial,
- BPM is verified only when known.

### Curator guidance

These are not evidence-backed verified rules today:

- `vocalProfile`
- `energyTrajectory`
- vibe language
- sequencing feel
- rare-genre or narrative shaping language

They may influence prompts and review, but they should not be described as evidence-backed support.

### Rejected candidates and ambiguity

Verification issues should read like:

- the system found no safe provider match,
- or the system narrowed provider results but a human still needs to choose,
- or a recommendation is available but remains manual.

They should not expose raw provider ids or sound more certain than the underlying evidence supports.

## Deferred Evidence Work

### BPM enrichment

Still deferred.

Current rationale:

- AcousticBrainz is too slow and stale for the intended product feel.
- SongBPM does not allow automated access under its terms.
- No compliant, responsive enrichment source has been chosen yet.

### Vocal-profile verification

Still deferred as a verified-rule feature.

Current posture:

- vocal profile is useful curator guidance,
- but there is no reliable evidence source in the current verification path,
- so it should remain prompt/review guidance rather than deterministic rule logic.

### Stronger transition evidence

Still deferred.

Current posture:

- transition and sequence commentary can use metadata heuristics and curator judgment,
- but they should not be framed as fully evidence-backed truth.

## Recommended Next Actions

1. Keep the new evidence-coverage reporting wired into playlist review and issues surfaces.
2. Add more fixture coverage for sparse genre tags, missing explicitness, and BPM-missing verified-rule prompts.
3. Expand ambiguous verification fixtures around soundtrack/title collisions and wrong-version pruning.
4. Tighten any remaining docs or UI copy that imply vocal profile or energy trajectory are evidence-backed.
5. Revisit BPM enrichment only after a compliant and responsive source is identified.
