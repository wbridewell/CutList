# Cross-Cutting Evaluation

Date: 2026-06-15

This companion doc describes the current cross-cutting evaluation pack for The CutList. It exists to make prompt and workflow regressions legible across the product’s core editing surfaces, not just isolated unit tests.

## Purpose

The cross-cutting pack checks whether the current stack still behaves coherently across:

- generation
- review
- replace
- compression
- discovery-radius comparison

It is intentionally small and dated. The goal is to keep a readable baseline of representative curator scenarios rather than building a heavyweight benchmark suite.

## Current Fixture Pack

The current dated cohort is `2026-06-15`.

Included fixtures:

- `2026-06-15-generate-straightforward`
  Checks a normal add request with both verified rules and request-scoped curator guidance.
- `2026-06-15-generate-mixed-request`
  Checks that a mixed shaping-plus-addition request still routes to generation rather than collapsing into reorder-only commentary.
- `2026-06-15-replace-weakest-three`
  Checks first-class replace semantics and preservation of a lasting verified rule.
- `2026-06-15-review-actionable`
  Checks that review still produces a concrete actionable repair rather than generic commentary.
- `2026-06-15-compress-overbuilt`
  Checks that explicit compression requests still return section-level `compress_section` suggestions with non-mutating apply semantics.
- `2026-06-15-discovery-radius-compare`
  Checks that `safe` and `highly_experimental` produce meaningfully different candidate sets without breaking core prompt discipline.

## How To Run

Run the full pack:

```bash
npm run eval:cross-cutting
```

Run one fixture:

```bash
CROSS_CUTTING_EVAL_FIXTURE=2026-06-15-review-actionable npm run eval:cross-cutting
```

Run deterministic-only mode:

```bash
CROSS_CUTTING_EVAL_DETERMINISTIC=1 npm run eval:cross-cutting
```

Print a markdown-friendly report:

```bash
CROSS_CUTTING_EVAL_MARKDOWN=1 npm run eval:cross-cutting
```

Make schema/provider failures fail the command:

```bash
CROSS_CUTTING_EVAL_STRICT=1 npm run eval:cross-cutting
```

## What Counts As A Meaningful Regression

Treat these as significant:

- a mixed request routes to the wrong workflow
- a replace request loses replacement count semantics
- a review fixture stops producing actionable suggestions
- a compression fixture stops producing `compress_section`
- discovery-radius comparison produces nearly identical candidate sets
- verified-rule versus curator-guidance persistence expectations stop holding

Treat low scores as prompts to inspect the output, not automatic proof that the system is broken. By default this pack is a tuning and regression tool, not a hard release gate. Use `CROSS_CUTTING_EVAL_STRICT=1` when you want schema/provider failures to exit non-zero.

## Baseline Refresh Policy

Refresh the dated cohort only when one of these is true:

- the product semantics intentionally changed
- the fixture no longer represents the real product goal
- a prompt or workflow refactor materially improves behavior and the new output is intentionally better

When refreshing:

1. keep the old dated doc if it still has historical value,
2. add a new dated cohort rather than silently rewriting history,
3. document why the baseline changed.
