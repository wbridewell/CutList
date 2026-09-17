# Release Checklist

Use this before making the repository public or tagging a release.

- Bump the version in `package.json` and `src-tauri/Cargo.toml`. `tauri.conf.json`, the About dialog, and the MusicBrainz User-Agent all read the package.json version, and a cargo test fails if Cargo.toml drifts from it.
- Install from a clean checkout with `npm ci`.
- Copy `.env.example` to `.env.local` and use safe local values.
- Confirm desktop prerequisites are installed: Node.js, npm, Rust, and the Tauri prerequisites for your OS.
- Run the development server with `npm run dev`.
- Run `npm run lint`.
- Run `npm run typecheck`.
- Run `npm run test`.
- Run `cargo test` and `cargo clippy` from `src-tauri`.
- Run `npm run build`.
- If you are sending a macOS DMG, run `npm run build:dmg`. Set `CUTLIST_NODE_RUNTIME_PATH=/absolute/path/to/node` only when overriding the bundled portable Node.
- Install the built app, save a Gemini or OpenAI key in `LLM setup`, run `Save and test`, then quit and relaunch. The key must still be reported as stored in the keychain after the relaunch; if it is missing, the keyring backend is not the platform store.
- Confirm no `.env*` files, logs, or generated build artifacts are tracked.
- Search for secrets before publishing.
- Confirm docs match current commands, architecture, routes, and environment variables.
- Review all security-sensitive desktop commands, the trusted backend, and provider integrations.
- Verify dependency changes are intentional and reflected in `package-lock.json`.
