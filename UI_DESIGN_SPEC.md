# CutList UI Design Spec

## Product Principle

The CutList is a structured playlist workspace with an expressive curator attached. The user can ask in loose, evocative language, but the accepted playlist should always feel inspectable, verified, and under control.

The interface should make this split obvious:

- The playlist is the primary object.
- The curator is the primary input method.
- Verification, constraints, rejected matches, and exports are supporting tools.

## Visual Direction

Use the CutList brand assets as the north star: The Curator, a friendly hooded neon playlist guide; acid green mascot glow; amber wordmark; cyan vector-display framing; and tiny coral signal accents. The UI should feel like a neon curator workbench for verified playlists: playful, precise, dark, technical, and a little luminous without becoming noisy or nostalgic cosplay.

Brand asset roles:

- `public/cutlist_little_guy.png`: The Curator mascot for app icon moments, empty states, compact brand moments, and assistant identity.
- `public/cutlist_banner_simple_transparent.png`: app header and compact horizontal lockup.
- `public/cutlist_banner_full.png`: README, docs, project presentation, and large brand surfaces.

Good references:

- amber and green CRT palettes,
- vector display cyan for focus and selected states,
- The Curator mascot and HUD-frame geometry,
- fine grid discipline,
- compact machine-readable metadata,
- calm dark panels with strong readability.

Avoid:

- scanline backgrounds,
- glow on every element,
- monospace everywhere,
- all-uppercase body UI,
- decorative command prompts or `::` prefixes on every heading,
- excessive card borders.

## Design Tokens

Use CSS custom properties as the source of truth.

- Backgrounds: near-black charcoal, with slightly raised panel surfaces.
- Text: warm off-white for primary text, muted amber-gray for secondary text.
- Amber: primary brand/action accent.
- Green: verified/success/local-save states.
- Cyan: focus, selected states, vector-display accents, links, and review telemetry.
- Red: destructive actions and hard errors.
- Borders: subtle amber/green-tinted lines, used sparingly.

Typography:

- Use a readable system sans stack for most UI.
- Use monospace for counters, chips, timestamps, compact metadata, and status strips.
- Do not use viewport-scaled body copy.

## Layout Rules

Desktop:

- Playlist workspace appears first and is visually dominant.
- Curator panel appears second and supports adding, importing, reviewing, and exporting.
- Use fewer, larger regions instead of many equally loud cards.

Mobile:

- Do not stack the full desktop interface blindly.
- Use task-level views: Playlist, Ask, History.
- Default to Ask when the playlist is empty; default to Playlist once tracks exist.

## Component Rules

Buttons:

- Primary actions should be obvious and scarce.
- Secondary actions are quieter.
- Destructive actions use the danger treatment and require confirmation or undo.
- Prefer clear labels over cryptic abbreviations.

Panels:

- Use panels for major work areas only.
- Avoid nested cards unless the nested item is a repeated object, modal, or focused tool.

Chips:

- Use chips for compact metadata and constraints.
- Editable chips must show their remove affordance persistently.

Track rows:

- Track title, artist, runtime, and verification status must be scannable without expansion.
- Use one disclosure control for details.
- Reorder and remove controls must have clear visible labels or icons plus accessible names.

Forms:

- Every textarea/input needs a visible label.
- Helper text belongs outside the placeholder.
- Placeholders should show examples only.

States:

- Empty states should tell the user what can happen next.
- Loading states should say what is happening.
- Error states should be plain-language and recoverable.
- Rejected-match states should explain what failed and offer review when possible.

## Copy Rules

Use user-goal language rather than implementation language.

- Use brand voice mainly in the masthead, mascot moments, and a few empty states. Workflow controls, statuses, errors, and destructive actions should stay literal.
- Avoid lore terms when they replace a clearer product noun. The user should never have to decode the metaphor to know what will happen.
- Refer to the mascot as "The Curator" in docs and brand guidance. Avoid alternate names like "the little guy," "summoner," or "familiar" in durable project language.
- Treat personality as texture, not a metaphor the user must perform. The product can sound sharp, vivid, and music-aware without turning routine actions into roleplay.
- Shared composer copy should not overfit to track generation. It must support both request prompting and review focus text.

Preferred replacements:

- "Natural Request" -> "Curator Console"
- "Ask for tracks" -> "Curator Console" when the area also supports playlist review
- "Seeds" -> "Add seed tracks"
- "Import Draft Or Chat" -> "Import a draft"
- "Critique" -> "Review playlist"
- "Verified Workspace" -> "Playlist"
- "Request History" -> "Conversation History"
- "Extract And Verify" -> "Import and verify"

Keep status text short and literal. Do not use terminal words like "LOCAL" or "READY" unless the status is meaningful to the user.

## Accessibility Baseline

- Preserve visible focus on every interactive element.
- Maintain logical heading order.
- Use semantic buttons for actions and links for navigation/source URLs.
- Do not rely on color alone for verification, error, selected, or disabled states.
- Destructive actions must be protected without blocking ordinary editing.
- Mobile controls must remain at least 44px tall where practical.
