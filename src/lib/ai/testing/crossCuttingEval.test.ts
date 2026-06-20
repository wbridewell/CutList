import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  CrossCuttingEvalFixtureSchema,
  crossCuttingEvalFixtures
} from "@/lib/ai/testing/crossCuttingEvalFixtures";
import {
  formatCrossCuttingEvalMarkdownReport,
  runCrossCuttingEvalFixture,
  runCrossCuttingEvalPack
} from "@/lib/ai/testing/crossCuttingEval";

describe("cross-cutting evaluation fixtures", () => {
  it("accepts the dated core-five fixture pack", () => {
    expect(crossCuttingEvalFixtures.length).toBeGreaterThanOrEqual(5);
    expect(crossCuttingEvalFixtures.map((fixture) => fixture.workflowKind)).toEqual(
      expect.arrayContaining(["generate", "review", "replace", "compress", "discovery_compare"])
    );
  });

  it("rejects invalid expectation combinations", () => {
    expect(() => CrossCuttingEvalFixtureSchema.parse({
      id: "bad",
      cohort: "2026-06-15",
      title: "Bad fixture",
      rationale: "Missing discovery pair.",
      workflowKind: "discovery_compare",
      playlist: crossCuttingEvalFixtures[0]!.playlist,
      userMessage: "Add songs.",
      promptFixtureId: "simple-additions"
    })).toThrow(z.ZodError);
  });
});

describe("cross-cutting evaluation scoring", () => {
  it("scores a deterministic generation fixture against routing and persistence expectations", async () => {
    vi.stubEnv("LLM_PROVIDER", "none");
    const fixture = crossCuttingEvalFixtures.find((item) => item.id === "2026-06-15-generate-straightforward");
    expect(fixture).toBeDefined();

    const result = await runCrossCuttingEvalFixture(fixture!, { deterministicOnly: true });

    expect(result.workflowKind).toBe("generate");
    expect(result.mode).toBe("deterministic");
    expect(result.passed).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(75);
    vi.unstubAllEnvs();
  });

  it("scores a deterministic replace fixture against replace semantics", async () => {
    vi.stubEnv("LLM_PROVIDER", "none");
    const fixture = crossCuttingEvalFixtures.find((item) => item.id === "2026-06-15-replace-weakest-three");
    expect(fixture).toBeDefined();

    const result = await runCrossCuttingEvalFixture(fixture!, { deterministicOnly: true });

    expect(result.workflowKind).toBe("replace");
    expect(result.score).toBeGreaterThanOrEqual(75);
    expect(result.passed).toBe(true);
    vi.unstubAllEnvs();
  });

  it("scores a deterministic compression fixture against compression suggestion quality", async () => {
    vi.stubEnv("LLM_PROVIDER", "none");
    const fixture = crossCuttingEvalFixtures.find((item) => item.id === "2026-06-15-compress-overbuilt");
    expect(fixture).toBeDefined();

    const result = await runCrossCuttingEvalFixture(fixture!, { deterministicOnly: true });

    expect(result.workflowKind).toBe("compress");
    expect(result.passed).toBe(true);
    expect(result.summary).toContain("suggestions");
    vi.unstubAllEnvs();
  });

  it("checks discovery comparison in deterministic mode by validating radius resolution", async () => {
    vi.stubEnv("LLM_PROVIDER", "none");
    const fixture = crossCuttingEvalFixtures.find((item) => item.id === "2026-06-15-discovery-radius-compare");
    expect(fixture).toBeDefined();

    const result = await runCrossCuttingEvalFixture(fixture!, { deterministicOnly: true });

    expect(result.workflowKind).toBe("discovery_compare");
    expect(result.passed).toBe(true);
    expect(result.summary).toContain("Deterministic comparison checked radius resolution only.");
    vi.unstubAllEnvs();
  });

  it("supports fixture filtering and markdown reporting", async () => {
    vi.stubEnv("LLM_PROVIDER", "none");
    const results = await runCrossCuttingEvalPack({
      deterministicOnly: true,
      fixtureId: "2026-06-15-review-actionable"
    });

    expect(results).toHaveLength(1);
    const markdown = formatCrossCuttingEvalMarkdownReport(results);
    expect(markdown).toContain("# Cross-Cutting Eval Report");
    expect(markdown).toContain("2026-06-15-review-actionable");
    vi.unstubAllEnvs();
  });
});
