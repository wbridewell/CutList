# Distribution

The CutList is a local-first desktop app. There is no hosted deployment: distribution means building a macOS app bundle and handing it to testers as a DMG. This page is the short version; [MACOS_DMG_ALPHA.md](MACOS_DMG_ALPHA.md) has the full packaging and smoke-test procedure.

## Build Requirements

- Node.js matching `.node-version`, plus npm.
- The Rust toolchain and the Tauri prerequisites for macOS.
- A portable macOS Node binary for the bundled runtime. The build uses the maintainer's cached copy when present; set `CUTLIST_NODE_RUNTIME_PATH=/absolute/path/to/node` on any other machine.

## Verify Before Packaging

```bash
npm ci
npm run lint
npm run typecheck
npm run test
npm run build
```

Then, from `src-tauri`:

```bash
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cargo test
```

`npm run build` produces the static frontend the desktop app embeds. It is not the release artifact.

## Package

```bash
npm run build:dmg
```

This builds the static frontend, stages the compiled trusted backend and the bundled Node runtime under `.desktop-runtime/`, bundles `The CutList.app`, and writes `The-CutList-Alpha.dmg`. The result is unsigned and un-notarized; that is acceptable for trusted alpha testers only.

## Configuration In The Packaged App

Testers configure the LLM provider entirely in the app. `LLM setup` writes non-secret settings to a JSON file in the app-data directory and stores Gemini or OpenAI keys in the macOS Keychain. Packaged builds do not read `.env.local`.

The desktop shell reads these variables from its own environment, which matters only when launching the app from a terminal:

- `CUTLIST_DEBUG_TIMING`: print command, provider, and LLM phase timings.
- `CUTLIST_DESKTOP_LOG_PATH`: override the backend log file location.
- `CUTLIST_DESKTOP_WORKSPACE_STATE_PATH` and `CUTLIST_LLM_SETTINGS_PATH`: override the app-data file locations, mainly for tests.

See `.env.example` for the LLM provider variables that development builds accept as overrides.

## Security Checklist

- Confirm no `.env*` files, logs, keys, or generated artifacts are in the repository or the bundle.
- Keep `LLM_DEBUG_RAW` unset; raw model output can include user text.
- Review the terms and rate limits of the metadata providers the build talks to.
- Complete the keychain quit-and-relaunch step in [RELEASE_CHECKLIST.md](../RELEASE_CHECKLIST.md).

## If A Build Leaks A Secret

Rotate the affected key at the provider first, then rebuild. A DMG cannot be recalled once sent.
