# Security Policy

## Supported Versions

The CutList is an early prototype. Security fixes target the current `main` branch unless maintainers publish versioned releases later.

## Reporting Vulnerabilities

Please do not open public issues for suspected vulnerabilities, leaked secrets, or abuse techniques. Report privately to the maintainer through GitHub security advisories or a private maintainer contact listed on the repository profile.

Include:

- A concise description of the issue.
- Affected files, desktop commands, or configuration.
- Reproduction steps that avoid exposing real secrets or user data.
- Potential impact and any suggested remediation.

Do not include:

- Real API keys, access tokens, private keys, or session material.
- Private playlist/user data.
- Active exploitation against systems you do not own.

## Expected Response

Maintainers should acknowledge valid reports, reproduce the issue, prepare a fix, and publish remediation notes. Timelines depend on severity and maintainer availability.

## Secret Handling Rules

- Cloud provider keys belong in the macOS Keychain through the in-app `LLM setup` dialog. Shell environment variables and, in development builds, `.env.local` are debug overrides; never commit them.
- Never use `NEXT_PUBLIC_`, `VITE_`, or `REACT_APP_` prefixes for server secrets.
- Rotate any key that was committed, pasted into a public issue, or exposed to logs.
- Keep `LLM_DEBUG_RAW=0` outside short local debugging sessions.

## Release Security Checklist

- Confirm provider keys never reach the webview, a settings file, or the log; the Rust shell injects keychain secrets into the backend process only.
- Do not expose a local Ollama endpoint beyond the machine running the app.
- Run `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build`, and the cargo checks from `src-tauri`.
- Confirm no `.env*` files, keys, or generated build artifacts are committed or bundled.
- Complete the keychain quit-and-relaunch check in `RELEASE_CHECKLIST.md` before sending a DMG.
