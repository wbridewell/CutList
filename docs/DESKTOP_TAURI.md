# Tauri Desktop

The CutList runs as a Tauri v2 desktop app with a static-exported Next.js frontend and a trusted native-command backend.

## Architecture

- `TAURI_BUILD=1 next build` creates a static frontend in `out/`.
- The Tauri webview loads the static export in production and the Next dev server in development.
- The desktop frontend invokes Tauri commands instead of calling localhost APIs.
- Desktop export uses a native Save dialog and writes the chosen file path from the trusted backend.
- Desktop builds now install a native app menu that dispatches shared command IDs back into the React action layer, so menu items and visible buttons reuse the same handlers.
- Development launches the trusted TypeScript backend from source with `node + tsx`.
- Production launches a bundled Node runtime plus a staged compiled backend artifact from Tauri resources.

## Alpha Commands

Desktop development requires Node.js, npm, the Rust toolchain, and the Tauri prerequisites for your OS.

```bash
npm install
npm run tauri:dev
```

`npm run tauri:dev` starts the Next dev server through Tauri. The Rust shell invokes trusted desktop commands that run the existing TypeScript backend logic with the `react-server` condition so `server-only` markers still protect those modules from client imports.

For packaged builds:

```bash
npm run build:dmg
```

`npm run build` builds the static frontend used by the desktop app.
`npm run build:dmg` stages `.desktop-runtime/` before Tauri bundles the app and creates the macOS DMG. It uses the bundled portable Node when available; set `CUTLIST_NODE_RUNTIME_PATH` only to override it with a different standalone macOS Node binary. The production app no longer depends on the repository checkout, local `node_modules`, or a globally installed Node runtime on the target machine.

## LLM Setup

The normal desktop flow uses the in-app `LLM setup` dialog and stores settings in native app-data files. Environment variables still work as development/debug overrides.

## Native Menu And Command Layer

- Desktop-only menu setup lives in `src/lib/client/desktopMenu.ts` and is installed only when the app is running inside Tauri.
- Shared command IDs live in `src/lib/client/appCommands.ts`.
- React components still render visible controls for discovery, but import/export/session commands now register shared handlers instead of duplicating menu logic.
- Browser mode keeps working because Tauri APIs are loaded through `src/lib/client/tauriRuntime.ts` dynamic imports rather than at startup.

For local Ollama:

```bash
ollama pull granite4.1:8b
LLM_PROVIDER=ollama OLLAMA_MODEL=granite4.1:8b npm run tauri:dev
```

For OpenAI:

```bash
LLM_PROVIDER=openai OPENAI_API_KEY=... npm run tauri:dev
```

For Gemini:

```bash
LLM_PROVIDER=gemini GEMINI_API_KEY=... npm run tauri:dev
```

If the UI reports that the desktop backend request failed, restart the app. If generation starts but the model fails, check the provider-specific model name, API key, quota, or local Ollama server.

## Security Notes

- There is no localhost listener.
- The webview talks to the trusted backend only through Tauri commands and progress events.
- Cloud provider keys must stay in the trusted desktop backend process, not the webview.
- The current alpha does not yet implement OS keychain settings storage.

## Distribution Status

This is an internal macOS alpha scaffold, not a signed public build.

The intended source-free tester handoff is an unsigned DMG. See [macOS DMG Alpha](MACOS_DMG_ALPHA.md) for the packaging target and tester flow.

Before sending to non-technical users, finish:

- app icon and bundle polish
- OS keychain-backed provider settings
- macOS signing and notarization
