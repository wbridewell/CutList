# Security Implementation Notes

## Threat Model

The app accepts user-provided playlist text and prompts, calls LLM and metadata providers, and returns generated text and track metadata to the desktop UI. Risks include prompt abuse, provider abuse, sensitive data leakage, oversized requests, malformed model output, and unsafe local configuration assumptions.

## Trust Boundaries

- UI input is untrusted.
- LLM output is untrusted.
- Metadata provider responses are untrusted.
- Environment variables are server-only secrets or configuration.
- Native app-data drafts and named sessions are private convenience storage, not secure storage.

## Authentication and Authorization

There is currently no authentication or authorization model. Do not repurpose this as a multi-user production service without adding access control, abuse controls, and a persistence model.

## Input Validation

Desktop command payloads are validated with Zod schemas in `src/lib/playlist/schemas.ts`.

## Output Handling

React escapes rendered strings by default. Do not introduce raw HTML rendering for LLM output or imported playlist text without sanitization.

## Secret Handling

OpenAI and Gemini keys are stored in the OS keychain (`src-tauri/src/secrets.rs`), the shell environment, or `.env.local` for development; they are never written to the local settings JSON file. Rust injects a keychain-stored key into the trusted backend process env at spawn time and never returns one to the webview. Never expose provider keys with public client prefixes.

## Logging

Do not log secrets, authorization headers, raw provider responses, or large prompt histories. `LLM_DEBUG_RAW` is for short local debugging only and is ignored when `NODE_ENV=production`.

## Rate Limiting

The current architecture is local-first and not designed for public hosted traffic.
