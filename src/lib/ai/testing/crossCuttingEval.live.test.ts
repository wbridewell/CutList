import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { getConfiguredLlmRequestsPerMinute, resetLlmRateLimitStateForTests } from "@/lib/ai/llmRateLimit";
import {
  formatCrossCuttingEvalMarkdownReport,
  runCrossCuttingEvalFixture,
  type CrossCuttingEvalResult
} from "@/lib/ai/testing/crossCuttingEval";
import { crossCuttingEvalFixtures } from "@/lib/ai/testing/crossCuttingEvalFixtures";
import { getLLMProvider } from "@/lib/ai/llmClient";

function loadLocalEnv(): void {
  const envPath = resolve(process.cwd(), ".env.local");
  if (!existsSync(envPath)) {
    return;
  }

  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]] != null) {
      continue;
    }
    process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
}

loadLocalEnv();

function configureDefaultLiveEvalRateLimit(provider: string): void {
  if (provider !== "gemini") {
    return;
  }

  if (process.env.LLM_TEST_REQUESTS_PER_MINUTE == null && process.env.LLM_REQUESTS_PER_MINUTE == null) {
    process.env.LLM_TEST_REQUESTS_PER_MINUTE = "15";
  }
  if (process.env.LLM_RATE_LIMIT_PROGRESS == null) {
    process.env.LLM_RATE_LIMIT_PROGRESS = "1";
  }
}

function progressPrefix(index: number, total: number): string {
  return `[${String(index + 1).padStart(2, " ")}/${String(total).padStart(2, " ")}]`;
}

function errorSummary(error: unknown): string {
  if (error instanceof ZodError) {
    const issue = error.issues[0];
    if (!issue) {
      return "schema validation failed";
    }
    const path = issue.path.length > 0 ? issue.path.join(".") : "root";
    return `${path}: ${issue.message}`;
  }

  if (error instanceof SyntaxError) {
    return error.message.split("\n")[0];
  }

  if (error instanceof Error) {
    return error.message.split("\n")[0];
  }

  return "unknown schema or provider error";
}

describe("live cross-cutting evaluation", () => {
  it("prints the dated cross-workflow evaluation pack", async () => {
    const provider = getLLMProvider();
    configureDefaultLiveEvalRateLimit(provider);
    resetLlmRateLimitStateForTests();
    const fixtureId = process.env.CROSS_CUTTING_EVAL_FIXTURE?.trim();
    const deterministicOnly = process.env.CROSS_CUTTING_EVAL_DETERMINISTIC === "1" || provider === "none";
    const strictMode = process.env.CROSS_CUTTING_EVAL_STRICT === "1";
    const fixtures = fixtureId
      ? crossCuttingEvalFixtures.filter((fixture) => fixture.id === fixtureId)
      : crossCuttingEvalFixtures;

    expect(fixtures.length, `No cross-cutting fixture matched CROSS_CUTTING_EVAL_FIXTURE=${fixtureId}`).toBeGreaterThan(0);

    const results: CrossCuttingEvalResult[] = [];
    let schemaFailures = 0;
    let providerFailures = 0;

    console.info(`\nCross-cutting evaluation starting (${deterministicOnly ? "deterministic" : provider}${fixtureId ? `, fixture ${fixtureId}` : ""})`);
    if (!deterministicOnly) {
      const rpm = getConfiguredLlmRequestsPerMinute();
      if (rpm) {
        console.info(`Rate-limit pacing enabled: ${rpm} requests/minute.`);
      }
    }

    for (const [fixtureIndex, fixture] of fixtures.entries()) {
      console.info(`${progressPrefix(fixtureIndex, fixtures.length)} Running ${fixture.id} (${fixture.workflowKind})`);
      try {
        results.push(await runCrossCuttingEvalFixture(fixture, { deterministicOnly, fixtureId }));
      } catch (error) {
        const isSchemaFailure = error instanceof ZodError || error instanceof SyntaxError;
        if (isSchemaFailure) {
          schemaFailures += 1;
        } else {
          providerFailures += 1;
        }
        results.push({
          fixtureId: fixture.id,
          workflowKind: fixture.workflowKind,
          mode: deterministicOnly ? "deterministic" : "live",
          passed: false,
          score: 0,
          issues: [{
            kind: isSchemaFailure ? "schema" : "provider",
            message: errorSummary(error)
          }],
          summary: "Evaluation aborted before scoring completed."
        });
      }
    }


    console.info(`\nCross-cutting evaluation (${deterministicOnly ? "deterministic" : provider}${fixtureId ? `, fixture ${fixtureId}` : ""})`);
    console.info("status fixture                                workflow           score    summary");
    for (const result of results) {
      console.info(
        `${result.passed ? "PASS" : "LOW "} ${result.fixtureId.padEnd(38)} ${result.workflowKind.padEnd(17)} ${String(result.score).padStart(3)}/100  ${result.summary}`
      );
      for (const issue of result.issues.slice(0, 4)) {
        console.info(`     [${issue.kind}] ${issue.message}`);
      }
    }

    const averageScore = Math.round(results.reduce((total, result) => total + result.score, 0) / results.length);
    const passed = results.filter((result) => result.passed).length;
    console.info("");
    console.info(`Summary: ${passed}/${results.length} passed, average score ${averageScore}/100`);
    console.info(`Schema failures: ${schemaFailures}`);
    console.info(`Provider failures: ${providerFailures}`);
    if (!strictMode && (schemaFailures > 0 || providerFailures > 0)) {
      console.info("Non-strict mode: reporting schema/provider failures without failing the command. Set CROSS_CUTTING_EVAL_STRICT=1 to make these failures exit non-zero.");
    }

    if (process.env.CROSS_CUTTING_EVAL_MARKDOWN === "1") {
      console.info("");
      console.info(formatCrossCuttingEvalMarkdownReport(results));
    }

    if (strictMode) {
      expect(schemaFailures + providerFailures).toBe(0);
    }
  });
});
