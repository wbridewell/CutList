# macOS DMG Alpha

This is the target handoff path for alpha testers who should not receive the source repository.

## Goal

Distribute an unsigned macOS `.dmg` containing `The CutList.app`.

The tester should be able to:

- open the DMG,
- drag `The CutList.app` to Applications,
- launch the app,
- paste a Gemini API key in the in-app LLM setup screen,
- optionally choose a Curator persona in-app for tone,
- use the app without installing Node, npm, Rust, Tauri, or the source project.

## What Testers Receive

The handoff artifact should be:

```text
The-CutList-Alpha.dmg
```

It should not include:

- source files,
- `.env.local`,
- `.cutlist.local-settings.json`,
- `node_modules`,
- build caches,
- local API keys.

The app bundle will still contain compiled/static frontend assets and the local backend runtime needed to run the app. This is normal for a desktop alpha, but it is not the same thing as handing over the repository.

## Current Status

The app now stages a bundled desktop backend runtime for production builds:

- static frontend assets from `TAURI_BUILD=1 next build`,
- compiled trusted backend JS under `.desktop-runtime/app`,
- a bundled Node runtime under `.desktop-runtime/node`,
- copied runtime packages under `.desktop-runtime/node_modules`.

Development still uses the source-based backend launcher for speed, but packaged builds no longer assume a repo checkout or global Node install on the tester's machine.

The release build is the single packaging entry point:

```bash
npm run build:dmg
```

Release packaging uses the bundled portable Node when available. Set `CUTLIST_NODE_RUNTIME_PATH` only when you need to override it with a different standalone macOS Node binary. The staging script fails fast instead of bundling a non-portable runtime.

That command must keep doing all four jobs together:

- build the static frontend into `out/`,
- stage `.desktop-runtime/`,
- bundle the macOS app,
- create `The-CutList-Alpha.dmg` with the macOS-native `hdiutil` flow.

## Release Verification Commands

Run these before sending a DMG:

```bash
npm install
npm run typecheck
npm run test -- src/components/uiRedesign.test.ts src/components/ChatPanel.test.ts
npm run build:dmg
```

Example with an explicit portable Node runtime:

```bash
CUTLIST_NODE_RUNTIME_PATH=/absolute/path/to/node npm run build:dmg
```

## Expected Build Command

The release command is:

```bash
npm run build:dmg
```

The DMG output should land at:

```text
src-tauri/target/release/bundle/dmg/The-CutList-Alpha.dmg
```

The app bundle should also be present under:

```text
src-tauri/target/release/bundle/macos/
```

Success means:

- `The CutList.app` exists,
- `The-CutList-Alpha.dmg` exists,
- the packaged app launches from Finder,
- the bundled backend works without the repo checkout,
- export works,
- relaunch preserves local state.

## Packaging Sanity Checks

Before handing the DMG to a tester, confirm:

- the packaged app does not depend on the repository checkout,
- the packaged app does not depend on a globally installed Node runtime,
- `.env.local`, `.cutlist.local-settings.json`, source files, and local API keys are not shipped as handoff artifacts,
- LLM settings and draft state are written to app-data on the tester machine, not into the app bundle.

The production Tauri shell should resolve `.desktop-runtime` from bundled resources and write local state into the app-data directory.

## Tester Install Notes

Because the alpha is unsigned, macOS Gatekeeper may block the first launch.

Tester instructions should say:

1. Open the DMG.
2. Drag `The CutList.app` to Applications.
3. If macOS says the app cannot be opened because it is from an unidentified developer, right-click the app and choose `Open`.
4. Confirm the warning.
5. Use `LLM setup` in the app to configure Gemini. Optionally set `Curator persona` beside it.

## Smoke Test Checklist

Smoke-test the DMG on a clean macOS user account or another Mac:

1. Open the DMG and drag `The CutList.app` to Applications.
2. Launch the app from Finder.
3. Complete `LLM setup` with Gemini and run `Save and test`.
4. Send one Curator request.
5. Import or verify one draft/seed track list.
6. Export one playlist file.
7. Quit and relaunch the app.
8. Confirm the local draft and settings are still present.

## Security Notes

- Cloud API keys must stay in the local backend/settings layer, not in frontend state, browser storage, or bundled files.
- The unsigned alpha is appropriate for trusted testers only.
- Signing, notarization, auto-update, and OS keychain storage are follow-up milestones before broader distribution.
