# Coding Guidelines

## TypeScript

Use explicit types at module boundaries. Prefer schema-derived types where practical.

## Naming

Use domain names already present in the code: playlist, track, candidate, constraint, verification, provider, curator.

## Error Handling

Return client-safe messages from desktop command handlers. Do not leak stack traces, filesystem paths, provider payloads, or secrets.

## Testing

Add focused tests for schemas, constraints, parsing, provider mapping, desktop helpers, and client command parsing.

## Components

Keep components focused on rendering and interaction. Move reusable domain behavior into `src/lib`.

## API Conventions

Validate desktop-command payloads with Zod. Keep handlers thin. Parse responses before returning.

## Styling

Use the existing global stylesheet and component classes unless a broader design change is approved.

## Dependencies

Do not add dependencies for trivial helpers. New runtime dependencies require clear value and supply-chain review.

## Performance

Avoid unbounded arrays, large prompt payloads, and repeated provider calls when a scoped helper can do the work.
