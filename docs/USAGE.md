# Usage

The CutList helps build a playlist from seeds, pasted track lists, and natural-language direction.

If you are handing this to a non-developer alpha tester, start with [ALPHA_TEST_GUIDE.md](ALPHA_TEST_GUIDE.md).

## Main Workflows

1. Add seed tracks or paste a draft list.
2. Use the Curator Console to ask for additions, removals, reordering, or playlist review.
3. Review accepted and rejected candidates.
4. Save named sessions when you want return points for different playlist directions.
5. Export the playlist as migration CSV, M3U/M3U8, CSV backup, TXT, JSON, or Apple Music XML.

## Important Concepts

- Accepted tracks should be verified by provider metadata or explicitly treated as manual.
- Verified rules such as duration, artist limits, genre limits, explicit-content preferences, and BPM when known are deterministic.
- Artist-repeat constraints such as "one track per artist" prune existing repeats before new additions are requested.
- BPM is supported as a verified rule when BPM data exists. If BPM is missing, the app reports that it does not have enough evidence to verify the BPM rule instead of pretending the value is known.
- External BPM enrichment is currently deferred. The app can reason about BPM when BPM data is already present, but it does not currently fetch BPM from a separate enrichment source.
- Vocalist profile, energy trajectory, rare genres, vibes, and similar shaping requests are curator guidance. The LLM can use them, but they do not participate in deterministic rejection.
- Discovery radius is a saved playlist preference that shapes how conservative or exploratory candidate generation should be. The composer exposes four modes: `Safe`, `Moderate`, `Adventurous`, and `Highly experimental`.
- Natural-language phrases such as "play it safe" or "get weirder" temporarily override the saved discovery radius for that one request only.
- Removal requests can be deterministic or curator-guided. Hard rules remove matching constraint violations directly; subjective requests such as "remove tracks that bring down the mood" require the model to return existing track IDs before the playlist changes.
- The desktop app autosaves the current local draft in native app-data storage.
- Named sessions are local desktop snapshots that can be saved, loaded, or deleted from Curator tools.
- LLM output is advisory. It does not bypass verification or verified rules.

## Sessions

Open Curator tools, then Sessions, to save the current playlist, messages, and request history as a named snapshot.

- Save current session creates or updates a named local return point.
- Load replaces the current draft with that saved snapshot.
- Delete removes the named snapshot only.
- The current draft continues to autosave independently, so a loaded session becomes the active local draft.

## Common Mistakes

- Expecting the app to upload to Spotify or Apple Music. It does not.
- Storing private secrets in client-side variables.
- Treating local draft or named session storage as secure storage.
- Assuming generated candidates are accepted before provider verification runs.

## Troubleshooting

- If generation is unavailable, open the in-app `LLM setup` dialog and run `Save and test`.
- If using Ollama, confirm the server is running and the configured model is pulled.
- If using OpenAI, confirm `OPENAI_API_KEY` and billing/quota status.
- If using Gemini, confirm `GEMINI_API_KEY`, `GEMINI_MODEL`, and free-tier quota status in Google AI Studio.
- If verification is slow or fails, retry after provider rate limits clear.
