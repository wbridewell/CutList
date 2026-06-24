# Development

## Prerequisites

- Node.js compatible with Next.js 15.
- npm.
- Rust toolchain.
- Tauri prerequisites for your OS.
- Optional: Ollama with `granite4.1:8b` for local LLM generation.

## Desktop Setup

```bash
npm install
npm run dev
```

`npm run dev` is the normal development path. It launches the Tauri desktop app and the embedded Next.js development server together.

## UI-Only Setup

```bash
npm install
npm run next:dev
```

`npm run next:dev` starts only the embedded Next.js UI. Use this when you are working on frontend layout or styling and do not need the Tauri shell.

## Alpha Handoff Helpers

For a friendlier local alpha handoff, use:

```bash
npm run first-run
```

This installs dependencies if needed, starts the local app, and lets the tester configure Gemini from the in-app `LLM setup` dialog.

After first setup, use:

```bash
npm run start-alpha
```

This starts the already-configured local alpha without reinstalling dependencies.

## Environment

Use `LLM_PROVIDER=none` for deterministic work that should not call an LLM.

Use `LLM_PROVIDER=ollama` for local LLM work.

For Ollama `gpt-oss:*` models, the app uses a model-specific request path: streaming chat responses, no Ollama JSON mode, a single user message that includes the strict-JSON instruction, and `OLLAMA_GPT_OSS_THINK=medium` by default. Valid thinking levels are `low`, `medium`, and `high`; `medium` is the recommended baseline because `low` can return poor candidate quality. These models are slower than Granite-class local models, so use `LLM_TIMEOUT_MS=180000` or higher when testing them locally.

Use `LLM_PROVIDER=openai` only when `OPENAI_API_KEY` is configured in `.env.local` or deployment secrets.

Use `LLM_PROVIDER=gemini` for Google's Gemini API. The default `GEMINI_MODEL` is `gemini-2.5-flash`, which has a Gemini Developer API free tier. Set `GEMINI_MODEL=gemini-2.5-flash-lite` if you want the smaller free-tier model for faster prompt harness experiments. If `OPENAI_API_KEY` or `GEMINI_API_KEY` is already exported in your shell, `.env.local` only needs `LLM_PROVIDER` and any model override; do not copy secret values into `.env.local` unless you need them loaded by the dev server.

See [Gemini API guide](GEMINI.md) for free-tier model recommendations and prompt harness usage.

Curator personality is now selected in-app from `Curator persona` next to `LLM setup`. This is a machine-local preference, not a playlist rule, and it affects Curator prose across requests, reviews, and match-review language without changing verification standards.

## Commands

- `npm run dev`: start the Tauri desktop app.
- `npm run next:dev`: start only the embedded Next.js development server, without the desktop shell.
- `npm run first-run`: install dependencies when needed and start the local alpha onboarding path.
- `npm run start-alpha`: start the already-set-up local alpha.
- `npm run sync:public`: copy the current committed repo snapshot into the sibling public repo at `../CutList-public` and create one fresh public commit there.
- `npm run sync:public:push`: run the same sync, then push the public repo's `main` branch to its `origin`.
- `npm run test`: run Vitest tests.
- `npm run prompt:harness`: run live playlist-generation prompt evals against the configured LLM provider.
- `npm run eval:cross-cutting`: run the dated cross-workflow evaluation pack for generation, review, replace, compression, and discovery-radius comparisons.
- `npm run typecheck`: run TypeScript checks.
- `npm run lint`: currently aliases type checking.
- `npm run build`: build the static frontend used by the desktop app.
- `npm run build:desktop-runtime`: stage the compiled trusted backend runtime.
- `npm run build:dmg`: build the macOS DMG release artifact. This is release packaging, not the normal development build. It uses the bundled portable Node when available; set `CUTLIST_NODE_RUNTIME_PATH` only to override it.

## Common Workflows

### Public Mirror Sync

Use `npm run sync:public` from this private repo when you want the public repo to catch up without sharing private prehistory.

The script publishes the current committed `HEAD` snapshot into `../CutList-public`, creates a fresh commit there, and leaves the public history rooted in the separate public repository. It refuses to run if the public repo has uncommitted changes.

Use `npm run sync:public:push` if you also want the public repo pushed to its GitHub `origin` in the same step.

- Add schemas in `src/lib/playlist/schemas.ts` before changing API contracts.
- Add playlist state helpers in `src/lib/playlist`.
- Add constraint behavior in `src/lib/playlist/constraints`.
- Add import, export, or local draft behavior in `src/lib/playlist/io`.
- Add deterministic playlist analysis helpers in `src/lib/playlist/analysis`.
- Add LLM workflow behavior in `src/lib/ai/services`.
- Add prompt contracts, prompt builders, reusable prompt guidance, and provider clients in the matching `src/lib/ai` subdirectories.
- Add provider logic in `src/lib/music`.
- Add client native-command behavior in `src/lib/client`.
- Add client-side workflow composition in `src/lib/client/workflows.ts`.
- Add UI components under `src/components`.

## UI Fixture

When running `npm run dev`, append `?fixture=playlist` to the Tauri app URL to load a deterministic sample playlist for visual QA. This development-only fixture includes verified-looking tracks with varied genres, runtimes, energy values, fit notes, rationale text, and constraints so track rows, details, drag handles, removal controls, and responsive layouts can be tested without provider calls.

Fixture mode ignores and does not overwrite the native saved local draft.

## Debugging

Keep `LLM_DEBUG_RAW=0` unless debugging malformed model output locally. Raw model output can contain user-supplied text, and production ignores this flag.

Set `CUTLIST_DEBUG_TIMING=1` locally to print lightweight Tauri child-process, backend command, provider lookup, and LLM phase timings to stderr.

Use `npm run prompt:harness` when iterating on playlist generation prompts. It loads `.env.local`, requires `LLM_PROVIDER=ollama`, `LLM_PROVIDER=openai`, or `LLM_PROVIDER=gemini`, calls the live provider, and prints a compact scorecard for curated generation-loop fixtures. Low scores are reported without failing the command; provider/schema failures fail the run.

### Stale Embedded Next.js Dev Runtime

During local UI iteration, the Next.js development server can occasionally get into a stale Webpack/HMR state. Symptoms include:

- A webview overlay such as `Runtime TypeError: __webpack_modules__[moduleId] is not a function`.
- The page rendering without normal styling.
- `?fixture=playlist` showing the empty default draft instead of the fixture playlist.
- The app reporting that `localhost:3000` cannot be reached after a build or server stop.

First try a hard browser reload. If the page is still unstyled or the fixture query is ignored, restart the dev server:

```bash
# Stop the existing npm run dev process, then:
npm run dev
```

If a detached process is still holding port 3000, find and stop it before restarting:

```bash
lsof -nP -iTCP:3000 -sTCP:LISTEN
kill <pid>
```

Only clear `.next` if a normal restart does not fix the stale runtime:

```bash
rm -rf .next
npm run dev
```
