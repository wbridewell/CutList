import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { getLLMProvider } from "@/lib/ai/llmClient";
import { getConfiguredLlmRequestsPerMinute, resetLlmRateLimitStateForTests } from "@/lib/ai/llmRateLimit";
import { mergeConstraintLayers, normalizeInstructionIntentLayers } from "@/lib/ai/services/instructionIntent";
import { attemptLlmContract } from "@/lib/ai/services/llmService";
import { candidatePrompt, instructionIntentPrompt } from "@/lib/ai/prompts";
import { scorePromptHarnessRun, type HarnessIssue, type HarnessScore } from "@/lib/ai/testing/promptHarness";
import { promptHarnessFixtures } from "@/lib/ai/testing/promptHarnessFixtures";
import type { CandidateTrack, InstructionIntent } from "@/types/playlist";

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

function printRow(score: HarnessScore): void {
  const status = score.passed ? "PASS" : "LOW ";
  const issues = score.issues.length > 0
    ? score.issues.map((issue) => issue.message).slice(0, 3).join(" | ")
    : "ok";
  console.info(`${status} ${score.fixtureId.padEnd(24)} ${String(score.score).padStart(3)}/100  ${issues}`);
  console.info(`     ${score.candidateSummary || "no candidates"}`);
}

function issueCount(scores: HarnessScore[], kind: HarnessIssue["kind"]): number {
  return scores.reduce((total, score) => total + score.issues.filter((issue) => issue.kind === kind).length, 0);
}

function errorSummary(error: unknown): string {
  if (error instanceof Error) {
    return error.message.split("\n")[0];
  }

  return "unknown schema or provider error";
}

function maybePrintRaw(label: string, value: unknown): void {
  if (process.env.PROMPT_HARNESS_DEBUG_RAW !== "1") {
    return;
  }
  console.info(`${label} raw output:`);
  console.info(JSON.stringify(value, null, 2));
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

describe("live playlist prompt harness", () => {
  it("scores generation-loop prompt fixtures with the configured live LLM provider", async () => {
    const provider = getLLMProvider();
    configureDefaultLiveEvalRateLimit(provider);
    resetLlmRateLimitStateForTests();
    if (provider === "none") {
      console.info("Skipping prompt harness because LLM_PROVIDER=none. Set LLM_PROVIDER=ollama, LLM_PROVIDER=openai, or LLM_PROVIDER=gemini to run live prompt evals.");
      return;
    }

    const scores: HarnessScore[] = [];
    let schemaFailures = 0;
    let providerFailures = 0;
    let repairedSuccesses = 0;

    const fixtureFilter = process.env.PROMPT_HARNESS_FIXTURE?.trim();
    const fixtures = fixtureFilter
      ? promptHarnessFixtures.filter((fixture) => fixture.id === fixtureFilter)
      : promptHarnessFixtures;

    expect(fixtures.length, `No prompt harness fixture matched PROMPT_HARNESS_FIXTURE=${fixtureFilter}`).toBeGreaterThan(0);

    console.info(`\nLive playlist prompt harness (${provider}${fixtureFilter ? `, fixture ${fixtureFilter}` : ""})`);
    const rpm = getConfiguredLlmRequestsPerMinute();
    if (rpm) {
      console.info(`Rate-limit pacing enabled: ${rpm} requests/minute.`);
    }
    console.info("status fixture                  score    issues");

    for (const [index, fixture] of fixtures.entries()) {
      console.info(`[${String(index + 1).padStart(2, " ")}/${String(fixtures.length).padStart(2, " ")}] Running ${fixture.id}`);
      let score: HarnessScore;
      try {
        const intentAttempt = await attemptLlmContract<InstructionIntent>(
          "instructionIntent",
          instructionIntentPrompt(fixture.playlist, fixture.userMessage)
        );
        if (intentAttempt.status === "fallback") {
          schemaFailures += intentAttempt.reason === "shape_error" || intentAttempt.reason === "json_extraction_error" ? 1 : 0;
          providerFailures += intentAttempt.reason === "disabled" || intentAttempt.reason === "timeout" || intentAttempt.reason === "quota" ? 1 : 0;
          score = {
            fixtureId: fixture.id,
            passed: false,
            score: 0,
            issues: [{
              kind: intentAttempt.reason === "shape_error" || intentAttempt.reason === "json_extraction_error" ? "schema" : "provider",
              message: `intent: ${intentAttempt.reason}`
            }],
            candidateSummary: ""
          };
          scores.push(score);
          printRow(score);
          continue;
        }

        if (intentAttempt.status === "success_repaired") {
          repairedSuccesses += 1;
        }
        maybePrintRaw(`${fixture.id} intent`, intentAttempt.raw);
        const intent = intentAttempt.parsed;
        const normalizedIntent = normalizeInstructionIntentLayers(intent);
        const promptPlaylist = {
          ...fixture.playlist,
          constraints: mergeConstraintLayers(
            fixture.playlist.constraints,
            normalizedIntent.persistentConstraints,
            normalizedIntent.requestScopedConstraints
          )
        };
        const batchAttempt = await attemptLlmContract<{
          message: string;
          playlistMeta: { title: string; mood: string; arc: string } | null;
          candidates: CandidateTrack[];
        }>("candidateBatch", candidatePrompt(promptPlaylist, fixture.userMessage, {
          requestedTrackCount: normalizedIntent.requestedAddCount
        }));
        if (batchAttempt.status === "fallback") {
          schemaFailures += batchAttempt.reason === "shape_error" || batchAttempt.reason === "json_extraction_error" ? 1 : 0;
          providerFailures += batchAttempt.reason === "disabled" || batchAttempt.reason === "timeout" || batchAttempt.reason === "quota" ? 1 : 0;
          score = {
            fixtureId: fixture.id,
            passed: false,
            score: 0,
            issues: [{
              kind: batchAttempt.reason === "shape_error" || batchAttempt.reason === "json_extraction_error" ? "schema" : "provider",
              message: `candidates: ${batchAttempt.reason}`
            }],
            candidateSummary: ""
          };
          scores.push(score);
          printRow(score);
          continue;
        }

        if (batchAttempt.status === "success_repaired") {
          repairedSuccesses += 1;
        }
        maybePrintRaw(`${fixture.id} candidates`, batchAttempt.raw);
        const batch = batchAttempt.parsed;
        score = scorePromptHarnessRun(fixture, intent, batch.candidates);
        if (intentAttempt.status === "success_repaired" || batchAttempt.status === "success_repaired") {
          score = {
            ...score,
            score: Math.max(0, score.score - 5),
            issues: [
              ...score.issues,
              {
                kind: "schema",
                message: "One contract needed a repair pass before it parsed cleanly."
              }
            ]
          };
        }
      } catch (error) {
        providerFailures += 1;
        score = {
          fixtureId: fixture.id,
          passed: false,
          score: 0,
          issues: [{
            kind: "provider",
            message: errorSummary(error)
          }],
          candidateSummary: ""
        };
      }

      scores.push(score);
      printRow(score);
    }

    const averageScore = scores.length > 0
      ? Math.round(scores.reduce((total, score) => total + score.score, 0) / scores.length)
      : 0;
    const passed = scores.filter((score) => score.passed).length;

    console.info("");
    console.info(`Summary: ${passed}/${scores.length} passed, average score ${averageScore}/100`);
    console.info(`Schema failures: ${schemaFailures}`);
    console.info(`Provider failures: ${providerFailures}`);
    console.info(`Repaired successes: ${repairedSuccesses}`);
    console.info(`Likely hallucination failures: ${issueCount(scores, "hallucination")}`);
    console.info(`Constraint interpretation failures: ${issueCount(scores, "constraint")}`);

    expect(schemaFailures + providerFailures).toBe(0);
  });
});
