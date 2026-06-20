# Contributing

Thanks for considering a contribution to The CutList.

## Setup

Desktop development requires the Rust toolchain and the usual Tauri prerequisites for your OS in addition to Node.js and npm.

```bash
npm install
cp .env.example .env.local
npm run dev
```

If you only need the web UI while iterating on React components, use `npm run next:dev` instead of the full desktop shell.

Use `LLM_PROVIDER=none` for deterministic local work that should not call an LLM.

## Before Opening a Pull Request

Run:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
npm run build:dmg
```

`npm run build` builds the static frontend.
`npm run build:dmg` is the macOS release-packaging path and requires `CUTLIST_NODE_RUNTIME_PATH`.

Update documentation when behavior, commands, configuration, architecture, or security assumptions change.

## Contribution Boundaries

- Keep Ollama, OpenAI, Gemini, and metadata provider calls server-side.
- Keep provider verification in `src/lib/music`.
- Keep constraint logic in `src/lib/playlist/constraints` and playlist state logic in `src/lib/playlist`.
- Keep client workflow composition in `src/lib/client`.
- Keep React components out of direct provider and secret handling.
- Avoid new dependencies unless the project clearly benefits from them.
- Do not commit `.env.local`, screenshots with private data, generated builds, or logs.

Security-sensitive changes, route contract changes, and dependency additions need careful review.
