# Security Model

## Threat Model

Attackers may submit oversized JSON, hostile prompts, malformed playlist data, or repeated requests. LLM and provider outputs may be wrong or malformed. Contributors may accidentally expose secrets.

## Trust Boundaries

- Browser input: untrusted.
- LLM output: untrusted.
- Provider responses: untrusted.
- Environment variables: server-only.
- Local draft and named session storage: convenience storage, not secure storage.

## Authentication and Authorization

There is no auth model. Do not add multi-user assumptions without explicit design work.

## Secret Handling

Secrets must stay out of client code, docs, logs, and committed files. Use `.env.local` locally and deployment secret stores in hosted environments.

## Input Validation

Use Zod schemas at desktop-command and model-output boundaries.

## Output Escaping

Render text through React's normal escaping. Do not use raw HTML for LLM output.

## Rate Limiting

Preserve request size limits and in-memory rate/concurrency guards. Add durable rate limiting before public hosting.

## Logging Rules

Do not log secrets, auth headers, raw provider responses, or full user prompt history.

## Client/Server Data Separation

OpenAI keys, Gemini keys, Ollama URLs, and provider calls belong in the trusted desktop backend. Client code should call only project desktop-command helpers.
