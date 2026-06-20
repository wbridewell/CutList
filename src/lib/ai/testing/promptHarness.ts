import type { PromptHarnessFixture, ReviewHarnessFixture } from "@/lib/ai/testing/promptHarnessFixtures";
import { normalizeInstructionIntentLayers } from "@/lib/ai/services/instructionIntent";
import type { AnalyzePlaylistResponse, CandidateTrack, InstructionIntent } from "@/types/playlist";

type HarnessIssueKind = "schema" | "provider" | "constraint" | "candidate" | "intent" | "hallucination" | "review";

export type HarnessIssue = {
  kind: HarnessIssueKind;
  message: string;
};

export type HarnessScore = {
  fixtureId: string;
  passed: boolean;
  score: number;
  issues: HarnessIssue[];
  candidateSummary: string;
};

export type ReviewHarnessScore = Omit<HarnessScore, "candidateSummary"> & {
  reviewSummary: string;
};

const placeholderPatterns = [
  /\b(track|song|artist|band)\s*\d+\b/i,
  /\bunknown artist\b/i,
  /\btbd\b/i,
  /\bplaceholder\b/i,
  /\bmade[- ]?up\b/i,
  /\bfictional\b/i
];

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function candidateKey(candidate: Pick<CandidateTrack, "artist" | "title">): string {
  return `${normalize(candidate.artist)}::${normalize(candidate.title)}`;
}

function getField(input: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((value, key) => {
    if (value == null || typeof value !== "object" || Array.isArray(value)) {
      return undefined;
    }
    return (value as Record<string, unknown>)[key];
  }, input);
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

function addIssue(issues: HarnessIssue[], kind: HarnessIssueKind, message: string): void {
  issues.push({ kind, message });
}

function joinedCandidateText(candidates: CandidateTrack[]): string {
  return candidates
    .flatMap((candidate) => [
      candidate.title,
      candidate.artist,
      candidate.album ?? "",
      candidate.reason,
      candidate.expectedFitNotes,
      ...candidate.vibeTags
    ])
    .join(" ")
    .toLowerCase();
}

function summarizeCandidates(candidates: CandidateTrack[]): string {
  return candidates
    .slice(0, 6)
    .map((candidate) => `${candidate.artist} - ${candidate.title}`)
    .join("; ");
}

export function scorePromptHarnessRun(
  fixture: PromptHarnessFixture,
  intent: InstructionIntent,
  candidates: CandidateTrack[]
): HarnessScore {
  let score = 100;
  const issues: HarnessIssue[] = [];
  const normalizedIntent = normalizeInstructionIntentLayers(intent);

  if (normalizedIntent.operationType !== fixture.expectedAction) {
    score -= 12;
    addIssue(issues, "intent", `expected action ${fixture.expectedAction}, got ${normalizedIntent.operationType}`);
  }

  if (
    fixture.expectedRequestedTrackCount !== undefined &&
    normalizedIntent.requestedAddCount !== fixture.expectedRequestedTrackCount
  ) {
    score -= 10;
    addIssue(issues, "intent", `expected requestedTrackCount ${fixture.expectedRequestedTrackCount}, got ${normalizedIntent.requestedAddCount}`);
  }

  for (const expectation of fixture.expectedConstraints ?? []) {
    const source = expectation.scope === "persistent" ? normalizedIntent.persistentConstraints : normalizedIntent.requestScopedConstraints;
    const actual = getField(source as Record<string, unknown>, expectation.field);
    const matched = expectation.value !== undefined
      ? valuesMatch(actual, expectation.value)
      : expectation.includes != null
        ? arrayIncludesText(actual, expectation.includes)
        : expectation.objectIncludes != null
          ? objectIncludes(actual, expectation.objectIncludes)
          : actual != null;

    if (!matched) {
      score -= 10;
      addIssue(issues, "constraint", `missing ${expectation.scope}.${expectation.field}`);
    }
  }

  if (fixture.candidateCount) {
    const { min, max } = fixture.candidateCount;
    if (candidates.length < min || candidates.length > max) {
      score -= 15;
      addIssue(issues, "candidate", `expected ${min}-${max} candidates, got ${candidates.length}`);
    }
  }

  if (candidates.length > 12) {
    score -= 10;
    addIssue(issues, "candidate", `candidate list should stay at 12 or fewer, got ${candidates.length}`);
  }

  const existingKeys = new Set(fixture.playlist.tracks.map(candidateKey));
  const duplicateExisting = candidates.filter((candidate) => existingKeys.has(candidateKey(candidate)));
  if (duplicateExisting.length > 0) {
    score -= 15;
    addIssue(issues, "candidate", `repeated existing track ${summarizeCandidates(duplicateExisting)}`);
  }

  const seen = new Set<string>();
  const duplicateCandidates = candidates.filter((candidate) => {
    const key = candidateKey(candidate);
    if (seen.has(key)) {
      return true;
    }
    seen.add(key);
    return false;
  });
  if (duplicateCandidates.length > 0) {
    score -= 10;
    addIssue(issues, "candidate", `repeated candidate ${summarizeCandidates(duplicateCandidates)}`);
  }

  const text = joinedCandidateText(candidates);
  for (const expected of fixture.candidateTextShouldInclude ?? []) {
    if (!text.includes(normalize(expected))) {
      score -= 6;
      addIssue(issues, "candidate", `candidate text did not include "${expected}"`);
    }
  }

  for (const avoided of fixture.candidateTextShouldAvoid ?? []) {
    if (text.includes(normalize(avoided))) {
      score -= 10;
      addIssue(issues, "candidate", `candidate text included avoided phrase "${avoided}"`);
    }
  }

  const suspicious = candidates.filter((candidate) => {
    const combined = `${candidate.title} ${candidate.artist} ${candidate.album ?? ""}`;
    return placeholderPatterns.some((pattern) => pattern.test(combined));
  });
  if (suspicious.length > 0) {
    score -= 20;
    addIssue(issues, "hallucination", `placeholder-like candidates: ${summarizeCandidates(suspicious)}`);
  }

  const compactScore = Math.max(0, Math.min(100, score));
  return {
    fixtureId: fixture.id,
    passed: compactScore >= 75 && !issues.some((issue) => issue.kind === "schema"),
    score: compactScore,
    issues,
    candidateSummary: summarizeCandidates(candidates)
  };
}

function includesEvery<T>(actual: T[], expected: T[] | undefined): boolean {
  return (expected ?? []).every((item) => actual.includes(item));
}

function summarizeReview(response: AnalyzePlaylistResponse): string {
  return [
    `${response.trackRoles.length} roles`,
    `${response.transitionReview.length} transitions`,
    `${response.reviewSuggestions.length} suggestions`
  ].join("; ");
}

export function scoreReviewHarnessRun(
  fixture: ReviewHarnessFixture,
  response: AnalyzePlaylistResponse
): ReviewHarnessScore {
  let score = 100;
  const issues: HarnessIssue[] = [];

  for (const [trackId, expectedRole] of Object.entries(fixture.expectedRoleByTrackId ?? {})) {
    const actual = response.trackRoles.find((role) => role.trackId === trackId)?.role;
    if (actual !== expectedRole) {
      score -= 12;
      addIssue(issues, "review", `expected role ${expectedRole} for ${trackId}, got ${actual ?? "none"}`);
    }
  }

  const actualTransitionTypes = response.transitionReview.map((transition) => transition.issueType);
  if (!includesEvery(actualTransitionTypes, fixture.expectedTransitionIssueTypes)) {
    score -= 15;
    addIssue(issues, "review", `missing transition issue types ${(fixture.expectedTransitionIssueTypes ?? []).join(", ")}`);
  }

  const actualSuggestionTypes = response.reviewSuggestions.map((suggestion) => suggestion.type);
  if (!includesEvery(actualSuggestionTypes, fixture.expectedSuggestionTypes)) {
    score -= 15;
    addIssue(issues, "review", `missing suggestion types ${(fixture.expectedSuggestionTypes ?? []).join(", ")}`);
  }

  const actualApplicationModes = response.reviewSuggestions.map((suggestion) => suggestion.applicationMode);
  if (!includesEvery(actualApplicationModes, fixture.expectedApplicationModes)) {
    score -= 15;
    addIssue(issues, "review", `missing application modes ${(fixture.expectedApplicationModes ?? []).join(", ")}`);
  }

  const unsafeCandidateSuggestion = response.reviewSuggestions.find((suggestion) =>
    (suggestion.type === "add" || suggestion.type === "replace" || suggestion.type === "add_bridge") &&
    suggestion.applicationMode !== "verify_candidate" &&
    suggestion.applicationMode !== "informational"
  );
  if (unsafeCandidateSuggestion) {
    score -= 20;
    addIssue(issues, "review", `candidate-style suggestion ${unsafeCandidateSuggestion.id} used unsafe mode ${unsafeCandidateSuggestion.applicationMode}`);
  }

  const invalidReorder = response.reviewSuggestions.find((suggestion) =>
    suggestion.applicationMode === "reorder_existing" &&
    (!suggestion.orderedTrackIds || new Set(suggestion.orderedTrackIds).size !== fixture.playlist.tracks.length)
  );
  if (invalidReorder) {
    score -= 15;
    addIssue(issues, "review", `reorder suggestion ${invalidReorder.id} is not a complete unique order`);
  }

  const compactScore = Math.max(0, Math.min(100, score));
  return {
    fixtureId: fixture.id,
    passed: compactScore >= 75 && issues.length === 0,
    score: compactScore,
    issues,
    reviewSummary: summarizeReview(response)
  };
}
