# Design

The CutList should feel like a focused playlist workbench: dense enough for review, calm enough for iterative curation, and explicit about what happened to each suggestion.

## Brand Voice

CutList can have personality without asking the user to decode lore. Use the amber/green/cyan visual language, The Curator mascot, and the `AI summons. You listen.` masthead line as brand texture. Keep workflow labels literal when the user is making a decision, recovering from an error, exporting data, or taking a destructive action.

Good places for brand flavor:

- Masthead and project presentation.
- The Curator mascot and assistant identity.
- Empty states and compact workspace labels such as `Curator Console`.
- Music-aware Curator prose returned by the LLM.

Avoid:

- Replacing clear controls with lore terms.
- Making import/export/review/reset labels playful.
- Turning every panel title into terminal cosplay.
- Decorative language that makes verification, constraints, or rejected matches harder to understand.

## UI Structure

- Playlist review is the primary surface.
- Chat and natural-language requests support the playlist, not the other way around.
- Rejected candidates and constraints should remain visible enough for accountability.
- The Curator Console supports both playlist-change requests and playlist review. Shared UI copy should describe those as concrete actions, not as prompt taxonomies.

## Navigation Model

The current app is a single-page workspace. Avoid adding multi-page navigation unless there is a clear workflow split.

## Component System

- Reuse components in `src/components`.
- Keep playlist mutations in `src/lib/playlist`.
- Keep desktop command calls in `src/lib/client`.

## Styling System

Global styles are imported through `src/app/globals.css` and split into focused files under `src/app/styles`. Preserve responsive behavior and avoid introducing a second styling system without review.

## Accessibility

- Maintain keyboard-accessible controls.
- Keep visible labels or accessible names for inputs and icon buttons.
- Preserve readable contrast and focus indicators.
- Do not hide critical status only in color.

## Constraints

- Keep screens intentionally simple.
- Avoid UI that implies streaming-service account integration.
- Avoid decorative complexity that makes track review harder.
