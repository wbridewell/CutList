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
- `src/lib/playlist/schemas.ts`: Primary contract file for playlist data and API payloads.
