# Security Policy

## Supported Versions

The CutList is an early prototype. Security fixes target the current `main` branch unless maintainers publish versioned releases later.

## Reporting Vulnerabilities

Please do not open public issues for suspected vulnerabilities, leaked secrets, or abuse techniques. Report privately to the maintainer through GitHub security advisories or a private maintainer contact listed on the repository profile.

Include:

- A concise description of the issue.
- Affected files, routes, or configuration.
- Reproduction steps that avoid exposing real secrets or user data.
- Potential impact and any suggested remediation.

Do not include:

- Real API keys, access tokens, private keys, or session material.
- Private playlist/user data.
- Active exploitation against systems you do not own.

## Expected Response

Maintainers should acknowledge valid reports, reproduce the issue, prepare a fix, and publish remediation notes. Timelines depend on severity and maintainer availability.

## Secret Handling Rules

- Keep secrets in `.env.local` or deployment secret stores only.
- Never use `NEXT_PUBLIC_`, `VITE_`, or `REACT_APP_` prefixes for server secrets.
- Rotate any key that was committed, pasted into a public issue, or exposed to logs.
- Keep `LLM_DEBUG_RAW=0` outside short local debugging sessions.

## Deployment Security Checklist

- Use HTTPS.
- Store OpenAI keys and other credentials in the deployment platform's secret manager.
- Restrict access to development-only Ollama endpoints.
- Run `npm run lint`, `npm run typecheck`, `npm run test`, and `npm run build`.
- Confirm no `.env*` files or generated build artifacts are committed.
- Review provider rate limits and abuse controls before public hosting.
