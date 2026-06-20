import { getLLMProvider } from "@/lib/ai/llmClient";
import { candidatePrompt, critiquePrompt } from "@/lib/ai/prompts";
import { attemptLlmContract } from "@/lib/ai/services/llmService";
import { resolveCuratorRequestPlan } from "@/lib/ai/services/requestResolution";
import { type ResolvedCuratorRequestPlan } from "@/lib/ai/services/workflowTypes";
import { evaluatePlaylistConstraints } from "@/lib/playlist/constraints";
import { deterministicAnalyzePlaylist } from "@/lib/playlist/analysis/deterministicAnalyze";
import { parseCompressionRequest } from "@/lib/playlist/analysis/compression";
import { type AnalyzePlaylistResponse, type CandidateTrack, type InstructionIntent, type PlaylistConstraints } from "@/types/playlist";
import { promptHarnessFixtures, reviewHarnessFixtures, type ConstraintExpectation } from "@/lib/ai/testing/promptHarnessFixtures";
import {
  type HarnessIssue,
  scorePromptHarnessRun,
  scoreReviewHarnessRun
} from "@/lib/ai/testing/promptHarness";
import { type CrossCuttingEvalFixture, crossCuttingEvalFixtures } from "@/lib/ai/testing/crossCuttingEvalFixtures";

type CrossCuttingWorkflowKind = CrossCuttingEvalFixture["workflowKind"];

export type CrossCuttingEvalIssue = HarnessIssue | {
  kind: "workflow" | "discovery" | "parser";
  message: string;
};

export type CrossCuttingEvalResult = {
  fixtureId: string;
  workflowKind: CrossCuttingWorkflowKind;
  mode: "deterministic" | "live";
  passed: boolean;
  score: number;
  issues: CrossCuttingEvalIssue[];
  summary: string;
};

export type CrossCuttingEvalRunOptions = {
  deterministicOnly?: boolean;
  fixtureId?: string;
};

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, score));
}

function hasConstraintField(constraints: PlaylistConstraints, field: keyof PlaylistConstraints): boolean {
  return constraints[field] != null;
}

function addIssue(issues: CrossCuttingEvalIssue[], kind: CrossCuttingEvalIssue["kind"], message: string): void {
  issues.push({ kind, message });
}

function withTemporaryEnv<T>(key: string, value: string | undefined, operation: () => Promise<T>): Promise<T> {
  const previous = process.env[key];
  if (value == null) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }

  return operation().finally(() => {
    if (previous == null) {
      delete process.env[key];
    } else {
      process.env[key] = previous;
    }
  });
}

function describeIntentStatus(status: ResolvedCuratorRequestPlan["instructionIntentStatus"]): string {
  if (status === "success_repaired") {
    return "instruction intent parsed after one repair pass";
  }
  if (status === "success" || status === "not_attempted") {
    return "the resolved plan had no raw LLM intent payload";
  }
  return `instruction intent fell back due to ${status}`;
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function valuesMatch(actual: unknown, expected: unknown): boolean {
  if (typeof actual === "string" && typeof expected === "string") {
    return normalize(actual) === normalize(expected);
  }
  return actual === expected;
}

function arrayIncludesText(value: unknown, expected: string): boolean {
  if (!Array.isArray(value)) {
    return false;
  }
  const normalizedExpected = normalize(expected);
  return value.some((item) => typeof item === "string" && normalize(item).includes(normalizedExpected));
}

function objectIncludes(value: unknown, expected: Record<string, unknown>): boolean {
  if (!Array.isArray(value)) {
    return false;
  }
  return value.some((item) => {
    if (item == null || typeof item !== "object" || Array.isArray(item)) {
      return false;
    }
    const record = item as Record<string, unknown>;
    return Object.entries(expected).every(([key, expectedValue]) => valuesMatch(record[key], expectedValue));
  });
}

function getField(input: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((value, key) => {
    if (value == null || typeof value !== "object" || Array.isArray(value)) {
      return undefined;
    }
    return (value as Record<string, unknown>)[key];
  }, input);
}

function expectationMatched(source: PlaylistConstraints, expectation: ConstraintExpectation): boolean {
  const actual = getField(source as Record<string, unknown>, expectation.field);
  return expectation.value !== undefined
    ? valuesMatch(actual, expectation.value)
    : expectation.includes != null
      ? arrayIncludesText(actual, expectation.includes)
      : expectation.objectIncludes != null
        ? objectIncludes(actual, expectation.objectIncludes)
        : actual != null;
}

function withTemporaryProvider<T>(provider: string | undefined, operation: () => Promise<T>): Promise<T> {
  if (provider === undefined) {
    return operation();
  }
  return withTemporaryEnv("LLM_PROVIDER", provider, operation);
}

function normalizeReviewText(value: string | undefined | null): string {
  return (value ?? "").trim().toLowerCase();
}

function hasGenericIdentityThesis(value: string | undefined | null): boolean {
  const normalized = normalizeReviewText(value);
  if (normalized.length < 16) {
    return true;
  }

  const genericPhrases = [
    "a verified cutlist draft",
    "good energy",
    "works well",
    "fits the vibe",
    "cohesive playlist",
    "strong playlist",
    "nice flow"
  ];

  return genericPhrases.some((phrase) => normalized.includes(phrase));
}

async function runCritiquePersonaDifferentiationCheck(
  fixture: CrossCuttingEvalFixture
): Promise<{ score: number; issues: CrossCuttingEvalIssue[] }> {
  const personas = [
    { env: "sharp", label: "razor" },
    { env: "classic", label: "archivist" },
    { env: "critic", label: "firestarter" }
  ] as const;
  const outputs = await Promise.all(personas.map(async (persona) =>
    withTemporaryEnv("LLM_CURATOR_VOICE", persona.env, async () => {
      const attempt = await attemptLlmContract<Omit<AnalyzePlaylistResponse, "constraintReport">>(
        "playlistCritique",
        critiquePrompt(fixture.playlist, fixture.userMessage)
      );
      return { persona: persona.label, attempt };
    })
  ));

  const issues: CrossCuttingEvalIssue[] = [];
  const successful: Array<{
    persona: string;
    attempt: Exclude<(typeof outputs)[number]["attempt"], { status: "fallback" }>;
  }> = [];
  for (const output of outputs) {
    if (output.attempt.status !== "fallback") {
      successful.push(output as {
        persona: string;
        attempt: Exclude<(typeof outputs)[number]["attempt"], { status: "fallback" }>;
      });
    }
  }
  if (successful.length < 3) {
    addIssue(issues, "parser", "persona differentiation check skipped because one or more persona critique runs fell back.");
    return { score: 95, issues };
  }

  const signatureSet = new Set(successful.map((output) => [
    normalizeReviewText(output.attempt.parsed.curatorTake),
    normalizeReviewText(output.attempt.parsed.intentSummary?.playlistIdentity)
  ].join(" || ")));

  if (signatureSet.size < 3) {
    addIssue(issues, "review", "persona differentiation check found critique outputs that were not materially distinct across personas.");
    return { score: 80, issues };
  }

  return { score: 100, issues };
}

async function resolvePlanForFixture(
  fixture: CrossCuttingEvalFixture,
  options: CrossCuttingEvalRunOptions
): Promise<ResolvedCuratorRequestPlan> {
  return withTemporaryProvider(options.deterministicOnly ? "none" : undefined, () =>
    resolveCuratorRequestPlan(fixture.playlist, fixture.userMessage)
  );
}

function scorePlanExpectations(
  fixture: CrossCuttingEvalFixture,
  plan: ResolvedCuratorRequestPlan
): { score: number; issues: CrossCuttingEvalIssue[] } {
  let score = 100;
  const issues: CrossCuttingEvalIssue[] = [];
  const canScoreScopedFields = plan.normalizedIntent.raw != null;

  if (plan.instructionIntentStatus === "success_repaired") {
    score -= 5;
    addIssue(issues, "parser", "instruction intent required one repair pass before the contract parsed cleanly.");
  }

  if (fixture.expectedOperation && plan.operation !== fixture.expectedOperation) {
    score -= 20;
    addIssue(issues, "workflow", `expected operation ${fixture.expectedOperation}, got ${plan.operation}`);
  }

  if (fixture.expectedRequestedAddCount !== undefined && plan.requestedAddCount !== fixture.expectedRequestedAddCount) {
    score -= 12;
    addIssue(issues, "workflow", `expected requestedAddCount ${fixture.expectedRequestedAddCount}, got ${plan.requestedAddCount}`);
  }

  if (fixture.expectedTargetTotalTrackCount !== undefined && plan.targetTotalTrackCount !== fixture.expectedTargetTotalTrackCount) {
    score -= 12;
    addIssue(issues, "workflow", `expected targetTotalTrackCount ${fixture.expectedTargetTotalTrackCount}, got ${plan.targetTotalTrackCount}`);
  }

  if (fixture.expectedReplacementCount !== undefined && plan.replacementCount !== fixture.expectedReplacementCount) {
    score -= 12;
    addIssue(issues, "workflow", `expected replacementCount ${fixture.expectedReplacementCount}, got ${plan.replacementCount}`);
  }

  if (canScoreScopedFields) {
    for (const field of fixture.requiredPersistentVerifiedRuleFields) {
      if (!hasConstraintField(plan.constraintState.persistentVerifiedRules, field)) {
        score -= 8;
        addIssue(issues, "workflow", `missing persistent verified rule ${field}`);
      }
    }

    for (const field of fixture.requiredPersistentGuidanceFields) {
      if (!hasConstraintField(plan.constraintState.persistentGuidance, field)) {
        score -= 8;
        addIssue(issues, "workflow", `missing persistent guidance ${field}`);
      }
    }

    for (const field of fixture.requiredRequestScopedVerifiedRuleFields) {
      if (!hasConstraintField(plan.constraintState.requestScopedVerifiedRules, field)) {
        score -= 8;
        addIssue(issues, "workflow", `missing request-scoped verified rule ${field}`);
      }
    }

    for (const field of fixture.requiredRequestScopedGuidanceFields) {
      if (!hasConstraintField(plan.constraintState.requestScopedGuidance, field)) {
        score -= 8;
        addIssue(issues, "workflow", `missing request-scoped guidance ${field}`);
      }
    }
  }

  return { score: clampScore(score), issues };
}

function promptFixtureFor(id: string) {
  return promptHarnessFixtures.find((fixture) => fixture.id === id);
}

function reviewFixtureFor(id: string) {
  return reviewHarnessFixtures.find((fixture) => fixture.id === id);
}

function combinedResult(
  fixture: CrossCuttingEvalFixture,
  mode: "deterministic" | "live",
  baseScore: number,
  baseIssues: CrossCuttingEvalIssue[],
  summary: string,
  extraScores: number[] = []
): CrossCuttingEvalResult {
  const allScores = [baseScore, ...extraScores];
  const score = clampScore(Math.round(allScores.reduce((total, value) => total + value, 0) / allScores.length));
  const blockingKinds = new Set<CrossCuttingEvalIssue["kind"]>(["schema", "provider", "workflow", "review", "candidate", "constraint", "discovery", "intent", "hallucination"]);
  const passed = score >= 75 && !baseIssues.some((issue) => blockingKinds.has(issue.kind));
  return {
    fixtureId: fixture.id,
    workflowKind: fixture.workflowKind,
    mode,
    passed,
    score,
    issues: baseIssues,
    summary
  };
}

async function runLiveGenerationScoring(
  fixture: CrossCuttingEvalFixture,
  plan: ResolvedCuratorRequestPlan
): Promise<{ score: number; issues: CrossCuttingEvalIssue[]; summary: string }> {
  const promptFixture = promptFixtureFor(fixture.promptFixtureId!);
  if (!promptFixture) {
    return {
      score: 0,
      issues: [{ kind: "workflow", message: `missing prompt fixture ${fixture.promptFixtureId}` }],
      summary: "Prompt fixture missing."
    };
  }

  const rawIntent = plan.normalizedIntent.raw;
  if (!rawIntent) {
    const reason = describeIntentStatus(plan.instructionIntentStatus);
    return {
      score: 70,
      issues: [{ kind: "parser", message: `live prompt scoring skipped because ${reason}.` }],
      summary: `Prompt scoring skipped because ${reason}.`
    };
  }

  const batchAttempt = await attemptLlmContract<{
    message: string;
    playlistMeta: { title: string; mood: string; arc: string } | null;
    candidates: CandidateTrack[];
  }>("candidateBatch", candidatePrompt(
    {
      ...fixture.playlist,
      constraints: plan.constraintState.activeConstraints
    },
    fixture.userMessage,
    {
      requestedTrackCount: plan.requestedAddCount ?? plan.replacementCount ?? null,
      discoveryRadius: plan.effectiveDiscoveryRadius
    }
  ));
  if (batchAttempt.status === "fallback") {
    return {
      score: 60,
      issues: [{ kind: "parser", message: `candidate batch contract fell back due to ${batchAttempt.reason}.` }],
      summary: `Candidate prompt could not be scored because the candidate batch contract fell back due to ${batchAttempt.reason}.`
    };
  }

  const batch = batchAttempt.parsed;
  const score = scorePromptHarnessRun(promptFixture, rawIntent as InstructionIntent, batch.candidates);
  let adjustedScore = score.score;
  const adjustedIssues: CrossCuttingEvalIssue[] = [];

  if (batchAttempt.status === "success_repaired") {
    adjustedScore = clampScore(adjustedScore - 5);
    adjustedIssues.push({
      kind: "parser",
      message: "candidate batch required one repair pass before the contract parsed cleanly."
    });
  }

  for (const issue of score.issues) {
    if (issue.kind !== "constraint") {
      adjustedIssues.push(issue);
      continue;
    }

    const missingExpectation = (promptFixture.expectedConstraints ?? []).find((expectation) => issue.message === `missing ${expectation.scope}.${expectation.field}`);
    if (!missingExpectation) {
      adjustedIssues.push(issue);
      continue;
    }

    const planSource = missingExpectation.scope === "persistent"
      ? plan.constraintState.persistedConstraintsAfterSuccess
      : plan.constraintState.activeConstraints;
    if (expectationMatched(planSource, missingExpectation)) {
      adjustedScore = clampScore(adjustedScore + 10);
      adjustedIssues.push({
        kind: "parser",
        message: `raw intent missed ${missingExpectation.scope}.${missingExpectation.field}, but the resolved plan still enforced it.`
      });
      continue;
    }

    adjustedIssues.push(issue);
  }

  return {
    score: adjustedScore,
    issues: adjustedIssues,
    summary: score.candidateSummary || `${batch.candidates.length} candidates`
  };
}

async function runCritique(
  fixture: CrossCuttingEvalFixture,
  options: CrossCuttingEvalRunOptions
): Promise<{ response: AnalyzePlaylistResponse; issues: CrossCuttingEvalIssue[]; score: number }> {
  if (options.deterministicOnly || getLLMProvider() === "none") {
    return {
      response: deterministicAnalyzePlaylist(
        fixture.playlist,
        undefined,
        { compressionRequest: parseCompressionRequest(fixture.userMessage) }
      ),
      issues: [],
      score: 100
    };
  }

  const attempt = await attemptLlmContract<Omit<AnalyzePlaylistResponse, "constraintReport">>(
    "playlistCritique",
    critiquePrompt(fixture.playlist, fixture.userMessage)
  );
  if (attempt.status === "fallback") {
    const fallback = deterministicAnalyzePlaylist(
      fixture.playlist,
      `Evaluation fallback: playlist critique contract fell back due to ${attempt.reason}.`,
      { compressionRequest: parseCompressionRequest(fixture.userMessage) }
    );
    return {
      response: fallback,
      issues: [{ kind: "parser", message: `playlist critique contract fell back due to ${attempt.reason}.` }],
      score: 70
    };
  }

  return {
    response: {
      ...attempt.parsed,
      constraintReport: evaluatePlaylistConstraints(fixture.playlist.tracks, fixture.playlist.constraints)
    },
    issues: attempt.status === "success_repaired"
      ? [{ kind: "parser", message: "playlist critique required one repair pass before the contract parsed cleanly." }]
      : [],
    score: attempt.status === "success_repaired" ? 95 : 100
  };
}

function applyReviewSpecificChecks(
  fixture: CrossCuttingEvalFixture,
  response: AnalyzePlaylistResponse,
  issues: CrossCuttingEvalIssue[]
): number {
  let score = 100;
  const actionableCount = response.reviewSuggestions.filter((suggestion) => suggestion.applicationMode !== "informational").length;

  if (fixture.requireActionableReviewSuggestion && actionableCount === 0) {
    score -= 20;
    addIssue(issues, "review", "expected at least one actionable review suggestion.");
  }

  if (
    fixture.forbidInformationalOnlyReorder &&
    response.reviewSuggestions.length > 0 &&
    response.reviewSuggestions.every((suggestion) => suggestion.type === "reorder" && suggestion.applicationMode === "informational")
  ) {
    score -= 20;
    addIssue(issues, "review", "review devolved into informational-only reorder commentary.");
  }

  if (hasGenericIdentityThesis(response.intentSummary?.playlistIdentity)) {
    score -= 15;
    addIssue(issues, "review", "playlistIdentity stayed generic instead of naming a concrete playlist thesis.");
  }

  return clampScore(score);
}

function candidateKeys(candidates: CandidateTrack[]): Set<string> {
  return new Set(candidates.map((candidate) => `${candidate.artist.trim().toLowerCase()}::${candidate.title.trim().toLowerCase()}`));
}

async function runDiscoveryComparison(
  fixture: CrossCuttingEvalFixture,
  options: CrossCuttingEvalRunOptions
): Promise<{ score: number; issues: CrossCuttingEvalIssue[]; summary: string }> {
  const promptFixture = promptFixtureFor(fixture.promptFixtureId!);
  if (!promptFixture) {
    return {
      score: 0,
      issues: [{ kind: "workflow", message: `missing prompt fixture ${fixture.promptFixtureId}` }],
      summary: "Prompt fixture missing."
    };
  }

  const safePlaylist = { ...fixture.playlist, discoveryRadius: fixture.discoveryRadiusPair!.safeRadius };
  const experimentalPlaylist = { ...fixture.playlist, discoveryRadius: fixture.discoveryRadiusPair!.experimentalRadius };
  const safePlan = await resolveCuratorRequestPlan(safePlaylist, fixture.userMessage);
  const experimentalPlan = await resolveCuratorRequestPlan(experimentalPlaylist, fixture.userMessage);
  const issues: CrossCuttingEvalIssue[] = [];

  if (safePlan.effectiveDiscoveryRadius !== fixture.discoveryRadiusPair!.safeRadius) {
    addIssue(issues, "discovery", `expected safe effective discovery radius ${fixture.discoveryRadiusPair!.safeRadius}, got ${safePlan.effectiveDiscoveryRadius}`);
  }
  if (experimentalPlan.effectiveDiscoveryRadius !== fixture.discoveryRadiusPair!.experimentalRadius) {
    addIssue(issues, "discovery", `expected experimental discovery radius ${fixture.discoveryRadiusPair!.experimentalRadius}, got ${experimentalPlan.effectiveDiscoveryRadius}`);
  }

  if (options.deterministicOnly || getLLMProvider() === "none" || !safePlan.normalizedIntent.raw || !experimentalPlan.normalizedIntent.raw) {
    const missingLiveReason = !safePlan.normalizedIntent.raw || !experimentalPlan.normalizedIntent.raw
      ? `instruction intent fallback (${safePlan.instructionIntentStatus}/${experimentalPlan.instructionIntentStatus}) prevented a live candidate comparison`
      : "deterministic-only mode checked radius resolution only";
    if (!options.deterministicOnly && getLLMProvider() !== "none" && (!safePlan.normalizedIntent.raw || !experimentalPlan.normalizedIntent.raw)) {
      addIssue(issues, "discovery", missingLiveReason);
    }
    return {
      score: issues.length === 0 ? 100 : 70,
      issues,
      summary: issues.length === 0
        ? "Deterministic comparison checked radius resolution only."
        : "Incomplete live comparison: radius resolution passed, but candidate divergence was not measured."
    };
  }

  const safeBatchAttempt = await attemptLlmContract<{
    message: string;
    playlistMeta: { title: string; mood: string; arc: string } | null;
    candidates: CandidateTrack[];
  }>("candidateBatch", candidatePrompt(
    { ...safePlaylist, constraints: safePlan.constraintState.activeConstraints },
    fixture.userMessage,
    {
      requestedTrackCount: safePlan.requestedAddCount,
      discoveryRadius: safePlan.effectiveDiscoveryRadius
    }
  ));
  const experimentalBatchAttempt = await attemptLlmContract<{
    message: string;
    playlistMeta: { title: string; mood: string; arc: string } | null;
    candidates: CandidateTrack[];
  }>("candidateBatch", candidatePrompt(
    { ...experimentalPlaylist, constraints: experimentalPlan.constraintState.activeConstraints },
    fixture.userMessage,
    {
      requestedTrackCount: experimentalPlan.requestedAddCount,
      discoveryRadius: experimentalPlan.effectiveDiscoveryRadius
    }
  ));
  if (safeBatchAttempt.status === "fallback" || experimentalBatchAttempt.status === "fallback") {
    let reason: string;
    if (safeBatchAttempt.status === "fallback") {
      reason = `safe batch fell back due to ${safeBatchAttempt.reason}`;
    } else if (experimentalBatchAttempt.status === "fallback") {
      reason = `experimental batch fell back due to ${experimentalBatchAttempt.reason}`;
    } else {
      reason = "candidate comparison fell back unexpectedly";
    }
    addIssue(issues, "parser", `discovery comparison could not score live candidates because ${reason}.`);
    return {
      score: 70,
      issues,
      summary: "Incomplete live comparison: radius resolution passed, but candidate divergence was not measured."
    };
  }

  const safeBatch = safeBatchAttempt.parsed;
  const experimentalBatch = experimentalBatchAttempt.parsed;

  const safeScore = scorePromptHarnessRun(promptFixture, safePlan.normalizedIntent.raw as InstructionIntent, safeBatch.candidates);
  const experimentalScore = scorePromptHarnessRun(promptFixture, experimentalPlan.normalizedIntent.raw as InstructionIntent, experimentalBatch.candidates);
  const safeKeys = candidateKeys(safeBatch.candidates);
  const experimentalKeys = candidateKeys(experimentalBatch.candidates);
  const distinctCount = [...safeKeys].filter((key) => !experimentalKeys.has(key)).length
    + [...experimentalKeys].filter((key) => !safeKeys.has(key)).length;

  if (distinctCount < fixture.discoveryRadiusPair!.minimumDistinctCandidateKeys) {
    addIssue(issues, "discovery", `expected at least ${fixture.discoveryRadiusPair!.minimumDistinctCandidateKeys} distinct candidate slots between safe and highly experimental, got ${distinctCount}`);
  }

  let comparisonScore = Math.round((safeScore.score + experimentalScore.score) / 2);
  if (safeBatchAttempt.status === "success_repaired" || experimentalBatchAttempt.status === "success_repaired") {
    comparisonScore = clampScore(comparisonScore - 5);
    addIssue(issues, "parser", "one side of the discovery comparison required a contract repair pass.");
  }

  return {
    score: clampScore(comparisonScore),
    issues: [...issues, ...safeScore.issues, ...experimentalScore.issues],
    summary: `Safe ${safeBatch.candidates.length} / experimental ${experimentalBatch.candidates.length} candidates, ${distinctCount} distinct slots`
  };
}

export async function runCrossCuttingEvalFixture(
  fixture: CrossCuttingEvalFixture,
  options: CrossCuttingEvalRunOptions = {}
): Promise<CrossCuttingEvalResult> {
  const mode = options.deterministicOnly || getLLMProvider() === "none" ? "deterministic" : "live";
  const plan = await resolvePlanForFixture(fixture, options);
  const planScore = scorePlanExpectations(fixture, plan);

  if (fixture.workflowKind === "generate" || fixture.workflowKind === "replace") {
    if (mode === "deterministic") {
      return combinedResult(
        fixture,
        mode,
        planScore.score,
        planScore.issues,
        `Resolved ${plan.operation} with ${plan.requestedAddCount ?? plan.replacementCount ?? 0} requested additions/replacements.`
      );
    }
    const generationScore = await runLiveGenerationScoring(fixture, plan);
    return combinedResult(
      fixture,
      mode,
      planScore.score,
      [...planScore.issues, ...generationScore.issues],
      generationScore.summary,
      [generationScore.score]
    );
  }

  if (fixture.workflowKind === "review" || fixture.workflowKind === "compress") {
    const reviewFixture = reviewFixtureFor(fixture.reviewFixtureId!);
    if (!reviewFixture) {
      return combinedResult(
        fixture,
        mode,
        0,
        [{ kind: "workflow", message: `missing review fixture ${fixture.reviewFixtureId}` }],
        "Review fixture missing."
      );
    }
    const critiqueResult = await runCritique(fixture, options);
    const reviewScore = scoreReviewHarnessRun(reviewFixture, critiqueResult.response);
    const customScore = applyReviewSpecificChecks(fixture, critiqueResult.response, planScore.issues);
    const personaScore = mode === "live"
      ? await runCritiquePersonaDifferentiationCheck(fixture)
      : { score: 100, issues: [] as CrossCuttingEvalIssue[] };
    return combinedResult(
      fixture,
      mode,
      planScore.score,
      [...planScore.issues, ...critiqueResult.issues, ...reviewScore.issues, ...personaScore.issues],
      reviewScore.reviewSummary,
      [critiqueResult.score, reviewScore.score, customScore, personaScore.score]
    );
  }

  if (fixture.workflowKind === "discovery_compare") {
    const discoveryScore = await runDiscoveryComparison(fixture, options);
    return combinedResult(
      fixture,
      mode,
      planScore.score,
      [...planScore.issues, ...discoveryScore.issues],
      discoveryScore.summary,
      [discoveryScore.score]
    );
  }

  return combinedResult(fixture, mode, 0, [{ kind: "workflow", message: `Unsupported workflow kind ${fixture.workflowKind}` }], "Unsupported fixture.");
}

export async function runCrossCuttingEvalPack(
  options: CrossCuttingEvalRunOptions = {}
): Promise<CrossCuttingEvalResult[]> {
  const fixtures = options.fixtureId
    ? crossCuttingEvalFixtures.filter((fixture) => fixture.id === options.fixtureId)
    : crossCuttingEvalFixtures;

  return Promise.all(fixtures.map((fixture) => runCrossCuttingEvalFixture(fixture, options)));
}

export function formatCrossCuttingEvalMarkdownReport(results: CrossCuttingEvalResult[]): string {
  const lines = [
    "# Cross-Cutting Eval Report",
    "",
    "| Fixture | Workflow | Mode | Score | Status | Summary |",
    "| --- | --- | --- | ---: | --- | --- |"
  ];

  for (const result of results) {
    lines.push(`| ${result.fixtureId} | ${result.workflowKind} | ${result.mode} | ${result.score} | ${result.passed ? "PASS" : "LOW"} | ${result.summary.replace(/\|/g, "\\|")} |`);
  }

  lines.push("", "## Issues");
  for (const result of results) {
    if (result.issues.length === 0) {
      continue;
    }
    lines.push("", `### ${result.fixtureId}`);
    for (const issue of result.issues) {
      lines.push(`- [${issue.kind}] ${issue.message}`);
    }
  }

  return lines.join("\n");
}
