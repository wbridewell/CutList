# Changelog

## Unreleased

- Fixed provider API keys never reaching the macOS Keychain: the desktop shell compiled keyring's in-memory mock store, so a key saved in `LLM setup` vanished on the next backend call. Keys now persist in the Keychain; a plaintext key left in the settings file by earlier builds is migrated on first launch and removed only once the Keychain can read it back.
- Autosave now reports write failures instead of showing the draft as saved, and flushes before the window closes or the app quits.
- Help, Report Issue, Save Workspace As, and Toggle Developer Tools now work inside the desktop shell. Command Palette is removed until it exists.
- Development builds read `.env.local` and pass it to the trusted backend; packaged builds still use only the in-app settings and the Keychain.
- MusicBrainz requests are throttled to one per second and identify the app version and contact URL.
- The app version has one source, `package.json`; the About dialog and provider User-Agent no longer drift from the bundle.
- Added ESLint; `npm run lint` now lints instead of aliasing the type check.
- CI runs rustfmt, clippy, and cargo test on macOS; Dependabot watches the Rust crate; the Node version is pinned.
- Dependency audit is clean after lifting the stale postcss pin and patching Next.
- Desktop bundle is smaller: unused brand sources left `public/`, in-app images are webp, and development-only pages are excluded from the export.
- Docs describe the desktop app rather than a hosted service; finished working documents moved to `docs/archive`.
- Added confidence-aware playlist constraints for BPM, vocalist profile, and energy trajectory.
- Added curator-guided removals, destructive action labeling, undo payload cleanup, and improved constraint/evidence UI handling.
- Centralized constraint rules, LLM contracts, playlist operations, verification policy, stream contracts, export formats, and client playlist workflows.
- Reorganized AI and playlist domain files into focused subdirectories.
- Added Gemini provider support alongside Ollama, OpenAI, and deterministic no-LLM mode.
- Prepared repository documentation, security policy, CI, and agent orientation for public GitHub distribution.
