# Glossary

- Accepted track: A track allowed into the playlist after verification and constraint checks.
- Candidate: A proposed track from user input or LLM output.
- Constraint: A deterministic rule such as duration, artist limit, genre limit, or explicit-content setting.
- Curator: The LLM-facing service layer that interprets requests and proposes playlist updates. In product/brand docs, "The Curator" also names the hooded mascot in the CutList logo.
- Local draft: Versioned current playlist state stored in native app-data files, with a one-time import path from legacy webview `localStorage`.
- Named session: Explicit machine-local snapshot of playlist, messages, and request history stored in native app-data files.
- Metadata provider: External service used to verify track identity, currently iTunes and MusicBrainz.
- Rejected candidate: A proposed track that failed verification or constraints.
- Verification: Matching a candidate to provider metadata.
- `Curator persona`: Machine-local in-app setting that changes Curator tone across requests, reviews, and match-review language without changing verification standards. The v1 personas are `The Razor`, `The Archivist`, and `The Firestarter`.
- `LLM_PROVIDER`: Server-side environment variable selecting `ollama`, `openai`, `gemini`, or `none`.
- `src/lib/playlist/schemas.ts`: Primary contract file for playlist data and desktop command payloads.

## Request planning

See [REQUEST_PIPELINE.md](REQUEST_PIPELINE.md) for how these fit together.

- Route family: The top-level classification of a request: `review`, `curator`, `import`, or `conversational`.
- Execution policy: Whether a request may change the playlist: `mutating` or `read_only`.
- Deterministic signals: Regex-derived facts about the text (review cues, curator cues, pasted tracks, addition, removal, replacement) computed before any model call.
- Instruction intent: The model's structured reading of a request: operation type, requested counts, verified rules, and curator guidance. Normalized into persistent and request-scoped layers.
- Operator plan: The output of `resolveOperatorPlan`: route family, execution policy, plan template, operators, declared and bound entities, deterministic signals, and the instruction intent. Previewed by the client and reused by the message command.
- User request plan: The client-facing summary of an operator plan returned by `desktop_plan_user_request`: operation, operation-plan kind, review and curator prompts, plus the operator plan itself and its fingerprint.
- Plan fingerprint: A hash of the message, tracks, rules, discovery radius, suppressions, and conversation context an operator plan was computed against. The message command reuses a plan only when the fingerprint still matches.
- Curator request plan: The resolved execution plan (`ResolvedCuratorRequestPlan`): operation, constraint state, pre-generation removals, placement, and ordered steps.
- Step: One unit of a curator request plan: `update_rules`, `remove`, `replace`, `add`, `reorder`, `metadata`, `analyze`, or `import`.
- Verified rule: A constraint the backend can check against provider metadata (runtime, duplicates, artist and genre limits, explicit content, BPM when known). Enforced deterministically.
- Curator guidance: A shaping preference the model is asked to honor (vocalist profile, energy trajectory, vibes, notes) that never rejects a track on its own.
