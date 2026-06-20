# Tauri Architecture Decision

## Decision

CutList is a Tauri-first desktop app with a trusted TypeScript backend/service layer.

We will not rewrite the application wholesale into Rust or collapse all backend logic into Tauri commands. Tauri/Rust should provide the native shell, privileged desktop boundary, app integration points, and secure OS-level capabilities. The product/domain logic should remain in TypeScript unless there is a concrete reason to move a specific piece.

In short:

> React renders the workspace.  
> Tauri owns native privilege.  
> TypeScript owns the product brain.

## Current Architectural Direction

The intended runtime shape is:

```text
React / Next UI
  ↓
client workflow + API adapter layer
  ↓
Tauri command boundary
  ↓
trusted TypeScript desktop backend service
  ↓
domain modules:
  - playlist operations
  - constraints
  - LLM orchestration
  - prompt/contracts
  - music metadata verification
  - import/export
  - session persistence helpers
  ↓
Tauri/Rust native capabilities:
  - app-data paths
  - keychain / secret storage
  - native file dialogs
  - cancellation/events
  - process lifecycle
  - packaging/runtime launch
```

## Why This Decision Exists

The app has already moved beyond a browser-only architecture. It is now a Tauri desktop app using a trusted backend boundary.

The TypeScript backend is not merely leftover web-server code. It is the service layer that protects secrets, performs provider calls, validates command payloads, runs playlist/LLM/music workflows, and keeps the webview from becoming the trusted execution environment.

The most valuable application logic is already well-factored into TypeScript domain modules. Rewriting that logic in Rust would introduce churn, duplicate behavior, increase test burden, and reduce future web portability without a clear product payoff.

## What Belongs in TypeScript

Keep these areas in TypeScript by default:

* playlist state transitions
* playlist operations
* constraint parsing, enforcement, registry metadata, and presentation
* LLM contracts and prompt construction
* LLM provider orchestration
* music metadata provider integration
* track verification and match ranking
* import/export format logic
* client workflow composition
* deterministic analysis and cleanup helpers
* shared schemas and tests

TypeScript is the default home for product behavior, domain rules, provider glue, and anything that benefits from sharing between desktop and a possible future web/hosted version.

## What Belongs in Tauri/Rust

Move code into Tauri/Rust only when it needs native privilege, native integration, or process control.

Good Rust/Tauri candidates:

* OS keychain access for API keys and secrets
* native file open/save dialogs
* app-data directory resolution
* safe filesystem access
* process lifecycle and cancellation
* progress/event emission
* native menu/window integration
* packaging, signing, and runtime launch concerns
* narrowly scoped privileged commands

Rust should be used for native boundaries, not as a general rewrite target.

## What We Are Avoiding

Avoid these architecture drifts:

* rewriting working TypeScript domain logic in Rust without measured need
* creating parallel TS and Rust implementations of playlist rules
* moving LLM prompts/contracts into scattered UI code
* reintroducing component-local playlist mutation rules
* adding ad hoc constraint handling outside the constraint registry
* treating every desktop feature as a Rust feature
* keeping backend abstractions solely because they resemble a former web server
* introducing a localhost HTTP service without measured need
* prematurely designing for a hosted backend before that is a real product goal

## Backend Policy

The trusted TypeScript backend should remain thin but meaningful.

It should:

* validate command payloads
* call domain services
* protect provider/API-key access from the webview
* centralize persistence and export workflows
* return structured JSON results
* emit progress where needed
* keep UI components from knowing provider/backend details

It should not:

* become a large independent application server
* expose unnecessary localhost HTTP APIs
* duplicate domain logic already available in shared modules
* hide simple pure functions behind unnecessary command boundaries

Do not introduce a localhost HTTP service by default. The Tauri command bridge is the preferred boundary because it avoids opening an unnecessary local network surface. A localhost service or sidecar API requires measured need, such as process-model limitations, tooling constraints, or a concrete integration requirement that Tauri commands do not handle cleanly.

## Security Direction

The main desktop security improvement is not a Rust rewrite. It is tightening the privilege boundary.

Priorities:

1. Keep provider calls and API keys out of the React/webview layer.
2. Move secrets from local JSON into OS keychain storage before broader distribution.
3. Keep Tauri permissions narrow.
4. Prefer explicit command contracts with Zod/schema validation.
5. Treat filesystem access as privileged.
6. Use native dialogs for user-mediated file access where appropriate.
7. Keep external network calls in the trusted backend/service layer.

Local JSON settings are acceptable for private development and technical alpha testing with a documented warning. Before any non-technical alpha, public alpha, or distribution to users who may paste real hosted-provider API keys, secrets should move to OS keychain storage or an equivalent secure credential store.

## Portability Direction

We want the option of a future web or hosted version without overbuilding for it now.

To preserve that option:

* keep domain logic platform-neutral
* keep provider interfaces clean
* isolate desktop-only persistence and native commands
* avoid baking Tauri assumptions into core playlist/AI/music modules
* use adapters where platform-specific behavior is needed

Future web deployment is a valuable option, not the primary architecture driver.

Future web deployment should remain possible through a real but thin adapter boundary. `src/lib/client/playlistApi.ts` should either be renamed to make its desktop role explicit or split into a platform-neutral interface plus a Tauri implementation when the next related refactor touches it.

## Process Model

The current per-command TypeScript child-process backend is acceptable for now. We should not replace it preemptively.

Before changing the process model, measure:

* command startup time
* backend execution time
* LLM/provider latency
* import/export latency
* perceived UI delay

If timing logs show command startup materially affects UX, the preferred next experiment is a long-lived local sidecar/worker using the same TypeScript service layer and command contracts. A Rust rewrite is not the next step unless the sidecar model also fails or packaging/runtime constraints become decisive.

## Refactor Rules

When refactoring this architecture:

1. Preserve behavior unless the task explicitly asks for a functional change.
2. Keep changes small and reviewable.
3. State the current behavior before changing structure.
4. Identify the validation command before editing.
5. Do not mix refactor, migration, dependency upgrade, and UI redesign in the same pass.
6. Prefer boring internal APIs over clever DSLs.
7. Introduce a DSL only when the pattern is repeated, stable, rule-like, and testable.
8. Keep public command contracts stable unless changing them is the point of the task.
9. Add tests before moving behavior across boundaries.
10. Do not move code to Rust merely because it is “backend” code.

#### Decision Checklist

Before moving any logic from TypeScript to Rust, answer:

* Does this require native OS privilege?
* Does this require secure local storage?
* Does this require direct filesystem/process/window integration?
* Is TypeScript causing a measured performance or packaging problem?
* Would moving this to Rust reduce complexity rather than just move it?
* Can existing tests prove behavior parity?
* Would this harm future web portability?
* Is this a narrow native boundary or a product-domain rewrite?

If the answer is mostly “no,” keep it in TypeScript.

## Preferred Next Improvements

Near-term improvements should focus on boundary quality rather than rewrites:

* add timing logs for command startup and backend phases
* move secrets to OS keychain
* add native save/open dialogs where desktop polish matters
* clarify naming around client API adapters
* document trusted-backend-only modules
* keep constraints, playlist operations, verification policy, and LLM contracts centralized

Native file open/save dialogs are part of the first desktop-polish pass, not a prerequisite for the architecture. Desktop export now uses a native save dialog; browser blob download remains only as the non-Tauri fallback path.

## Summary

CutList should remain a Tauri desktop app with a trusted TypeScript product backend.

We should make the native boundary cleaner, not rewrite the product brain in Rust.
