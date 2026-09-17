# CLAUDE.md

Read `AGENTS.md` first; it is the orientation file for this repository and applies to every coding agent. Then read `docs/llm/PROJECT_ORIENTATION.md` for the module map and `docs/llm/REQUEST_PIPELINE.md` before touching request interpretation.

Verification before finishing any change:

```bash
npm run lint && npm run typecheck && npm run test && npm run build
```

When `src-tauri/` changes, also run from that directory:

```bash
cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test
```
