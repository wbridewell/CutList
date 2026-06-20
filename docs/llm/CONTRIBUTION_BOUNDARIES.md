# Contribution Boundaries

## Freely Change

- Documentation.
- Focused UI copy and layout fixes.
- Tests for existing behavior.
- Small pure helpers with clear coverage.

## Careful Review Required

- Desktop command contracts.
- Zod schemas.
- LLM prompts and parsing.
- Provider matching and confidence thresholds.
- Constraint enforcement.
- Security headers and deployment assumptions.
- Dependency additions.

## Do Not Change Casually

- Server-only secret boundaries.
- Local draft format version.
- Accepted/rejected track semantics.
- Verification requirements.
- License and public maturity claims.

## Core Assumption Files

- `src/lib/playlist/schemas.ts`
- `src/lib/playlist/constraints/index.ts`
- `src/lib/music/verifyTrack.ts`
- `src/lib/ai/curator.ts`
- `src/lib/desktop/backend.ts`
- `src/lib/desktop/contracts.ts`
- `.env.example`
- `AGENTS.md`
