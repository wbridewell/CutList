# Changelog

## 0.2.0 - 2026-09-16

- Curator requests are planned once: the plan preview now hands its operator plan to the message command, which reuses it when the message, tracks, rules, and conversation are unchanged instead of asking the model to plan again.
- ESLint enforces the module layer direction (`app` → `components` → `hooks` → `client` → `desktop` → `ai` → `music` → `playlist` → `types`); the seven imports that ran against it are fixed, and a `shared` layer holds normalization, atomic writes, the app version, and the provider enums.
- Repository invariant tests keep the three desktop command registries in sync, fail on unused exports, and require every environment variable the code reads to be listed in `.env.example`.
- The schema, prompt, constraint, and client workflow hub files are split into domain modules behind barrels that re-export the same names; the Rust shell's `main.rs` is split into runtime, backend, command, error, and timing modules.
- Added shared test fixture builders; removed dead exports and orphaned CSS; dropped the `Legacy` names.
- Agent docs: a request pipeline map, a module map with the import boundaries, the full add-a-command procedure, and a `CLAUDE.md`.
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
