# Deployment

The CutList is currently best treated as a prototype or single-user/local tool. Public hosting requires additional review.

This repository is desktop-first. `npm run build` produces the static frontend used by the Tauri app. It is not the macOS release-packaging step.

## Build Requirements

```bash
npm ci
npm run lint
npm run typecheck
npm run test
npm run build
```

If you are preparing the macOS handoff artifact instead of the normal frontend build, use:

```bash
CUTLIST_NODE_RUNTIME_PATH=/absolute/path/to/node npm run build:dmg
```

## Runtime Requirements

- Next.js-compatible Node runtime.
- HTTPS in production.
- Deployment secret storage for `OPENAI_API_KEY` if OpenAI is enabled, or `GEMINI_API_KEY` if Gemini is enabled.
- Network access to metadata providers.

## Environment Variables

See `.env.example`.

Server-only variables:

- `LLM_PROVIDER`
- `OLLAMA_BASE_URL`
- `OLLAMA_MODEL`
- `OLLAMA_GPT_OSS_THINK`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `GEMINI_API_KEY`
- `GEMINI_MODEL`
- `GEMINI_API_BASE_URL`
- `LLM_TIMEOUT_MS`
- `LLM_DEBUG_RAW`

## Security Checklist

- Do not deploy with secrets in source files.
- Do not expose local Ollama endpoints publicly.
- Add durable rate limiting for public deployments.
- Review logging configuration.
- Keep `LLM_DEBUG_RAW=0`.
- Review terms and rate limits for metadata providers.

## Rollback Notes

Keep previous deployment artifacts available through the hosting platform. If a release exposes secrets, rotate the affected credentials before redeploying.

Curator persona is not a deployment variable in v1. It is chosen in-app and stored as a local machine setting. The legacy `LLM_CURATOR_VOICE` env var remains only as a deprecated fallback for development compatibility.

## Monitoring

Track API error rates, provider failures, build failures, and rate-limit events. Avoid logging full user prompts or generated model output by default.
