# Release Checklist

Use this before making the repository public or tagging a release.

- Install from a clean checkout with `npm ci`.
- Copy `.env.example` to `.env.local` and use safe local values.
- Confirm desktop prerequisites are installed: Node.js, npm, Rust, and the Tauri prerequisites for your OS.
- Run the development server with `npm run dev`.
- Run `npm run lint`.
- Run `npm run typecheck`.
- Run `npm run test`.
- Run `npm run build`.
- If you are sending a macOS DMG, run `CUTLIST_NODE_RUNTIME_PATH=/absolute/path/to/node npm run build:dmg`.
- Confirm no `.env*` files, logs, or generated build artifacts are tracked.
- Search for secrets before publishing.
- Confirm docs match current commands, architecture, routes, and environment variables.
- Review all security-sensitive API routes and provider integrations.
- Verify dependency changes are intentional and reflected in `package-lock.json`.
