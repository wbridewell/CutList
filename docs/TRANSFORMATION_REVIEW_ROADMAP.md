# Transformation Review Roadmap

This tracker covers Transformation Review v1: structured playlist analysis for roles, transitions, intent preservation, and safe manual suggestions.

Status values: `pending`, `in progress`, `done`, `deferred`.

## Goal

Upgrade playlist review from a text critique into a non-mutating curation review. The review should help a user understand what the playlist is trying to be, which tracks serve which roles, where transitions work or fail, and which edits can safely be applied.

## Phase Checklist

| Phase | Status | Notes |
| --- | --- | --- |
| Contract and schema | done | Analyze responses include intent summary, track roles, transition review, and structured review suggestions while preserving legacy fields. |
| Prompt and service | done | Playlist critique guidance asks for roles, transitions, confidence, intent preservation, and safe application modes. |
| Deterministic fallback | done | Fallback review produces conservative structured fields from metadata, sequence position, constraints, and energy. |
| UI and manual apply | done | The latest review renders below the composer with Apply, Ignore, and verification-prefill controls. |
| Test coverage | done | Added schema, contract, prompt, fallback, workflow, and UI coverage for Transformation Review v1. |
| Example evaluation fixtures | done | Added review harness fixtures for abrupt bridges, flat endings, repetitive texture, hard-rule removals, and strong sequences. |

## Product Rules

- Review is non-mutating by default.
- Existing-track removals and complete reorders may be applied manually.
- Additions, replacements, and bridge-track suggestions must go through provider verification.
- Roles, transitions, and intent preservation are model judgment unless backed by deterministic metadata.
- The review should expose confidence and risk instead of claiming subjective certainty.

## Known Deferrals

- No new metadata provider.
- No accounts, database, OAuth, or streaming upload.
- No auto-application of model edits.
- No persistent taste model.
- No separate agent services unless reliability later requires them.
