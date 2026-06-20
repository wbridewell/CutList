import { matchReviewPrompt } from "@/lib/ai/prompts";
import { attemptLlmContract } from "@/lib/ai/services/llmService";
import { resolveLLMConfig, readLocalLLMSettings } from "@/lib/ai/llmConfig";
import type { CandidateTrack, AttemptedMatch } from "@/types/playlist";

type ReviewInput = {
  query: { title: string; artist: string; album?: string | null };
  rejectionCode: "noCredibleMatch" | "ambiguousMatch" | "albumMismatch";
  attemptedMatches: AttemptedMatch[];
  candidate?: CandidateTrack;
};

export type MatchReviewResult = {
  attemptedMatches: AttemptedMatch[];
  prunedMatchCount: number;
  reviewSummary: string | null;
  llmReviewed: boolean;
};

function summarizePruneBucket(label: string, count: number): string | null {
  if (count <= 0) {
    return null;
  }
  const plural = label === "remix"
    ? "remixes"
    : label.endsWith("match")
      ? `${label}es`
    : `${label}s`;
  return `${count} ${count === 1 ? label : plural}`;
}

function countBucketIds(summary: string, pattern: RegExp): number {
  const match = summary.match(pattern);
  if (!match?.[1]) {
    return 0;
  }
  return match[1]
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .length;
}

function sanitizeReviewSummary(summary: string | null | undefined): string | null {
  if (!summary) {
    return null;
  }

  const cleaned = summary
    .replace(/\(\s*(?:\d+\s*(?:,\s*\d+\s*)*)\)/g, "")
    .replace(/\bCandidate\s+\d+\b/gi, "One candidate")
    .replace(/\s+/g, " ")
    .trim();

  const singleCandidatePrune = summary.match(/^Candidate\s+\d+\s+was pruned as it is\s+(.+)\.$/i);
  if (singleCandidatePrune?.[1]) {
    const reason = singleCandidatePrune[1].trim();
    return `One candidate was pruned because it is ${reason}.`;
  }

  const remixCount = countBucketIds(summary, /remix(?:es)?\s*\(([^)]*)\)/i);
  const liveCount = countBucketIds(summary, /live recordings?\s*\(([^)]*)\)/i);
  const theatricalCount = countBucketIds(summary, /non-canonical theatrical\/musical versions?\s*\(([^)]*)\)/i);
  const wrongArtistCount = countBucketIds(summary, /wrong artists?\s*\(([^)]*)\)/i);
  const wrongTitleCount = countBucketIds(summary, /wrong titles?\s*\(([^)]*)\)/i);
  const soundtrackCollisionCount = countBucketIds(summary, /soundtrack\/title collisions?\s*\(([^)]*)\)/i);
  const alternateSessionCount = countBucketIds(summary, /alternate sessions?\/alternate recordings?\s*\(([^)]*)\)/i);
  const nonCanonicalCount = countBucketIds(summary, /non-canonical versions?\s*\(([^)]*)\)/i);

  if (
    remixCount === 0 &&
    liveCount === 0 &&
    theatricalCount === 0 &&
    wrongArtistCount === 0 &&
    wrongTitleCount === 0 &&
    soundtrackCollisionCount === 0 &&
    alternateSessionCount === 0 &&
    nonCanonicalCount === 0
  ) {
    return cleaned;
  }

  const parts = [
    summarizePruneBucket("remix", remixCount),
    summarizePruneBucket("live recording", liveCount),
    summarizePruneBucket("non-canonical theatrical or musical version", theatricalCount),
    summarizePruneBucket("wrong artist match", wrongArtistCount),
    summarizePruneBucket("wrong title match", wrongTitleCount),
    summarizePruneBucket("soundtrack or title collision", soundtrackCollisionCount),
    summarizePruneBucket("alternate session or alternate recording", alternateSessionCount),
    summarizePruneBucket("non-canonical version", nonCanonicalCount)
  ].filter((value): value is string => Boolean(value));

  if (parts.length === 0) {
    return cleaned;
  }

  if (parts.length === 1) {
    return `All candidates were pruned: ${parts[0]}.`;
  }

  if (parts.length === 2) {
    return `All candidates were pruned: ${parts[0]} and ${parts[1]}.`;
  }

  return `All candidates were pruned: ${parts[0]}, ${parts[1]}, and ${parts[2]}.`;
}

export function sanitizeMatchReviewSummary(summary: string | null | undefined): string | null {
  return sanitizeReviewSummary(summary);
}

function uniqueMatches(matches: AttemptedMatch[]): AttemptedMatch[] {
  const seen = new Set<string>();
  const deduped: AttemptedMatch[] = [];
  for (const match of matches) {
    const key = `${match.source}:${match.sourceId ?? "no-source-id"}:${match.artist}:${match.title}:${match.album ?? "no-album"}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(match);
  }
  return deduped;
}

export function llmAssistedMatchReviewEnabled(): boolean {
  return readLocalLLMSettings().llmAssistedMatchReviewEnabled ?? true;
}

export async function reviewAttemptedMatchesWithLLM(input: ReviewInput): Promise<MatchReviewResult | null> {
  const config = resolveLLMConfig();
  if (!llmAssistedMatchReviewEnabled() || config.provider === "none") {
    return null;
  }
  if (config.provider === "gemini" && !config.geminiApiKey) {
    return null;
  }
  if (config.provider === "openai" && !config.openaiApiKey) {
    return null;
  }
  if (input.attemptedMatches.length === 0) {
    return null;
  }

  const dedupedMatches = uniqueMatches(input.attemptedMatches).slice(0, 8);
  const attempt = await attemptLlmContract<{
    recommendedSourceId: string | null;
    keepSourceIds: string[];
    recommendationReason: string | null;
    pruneSummary: string | null;
  }>(
    "matchReview",
    matchReviewPrompt({
      query: input.query,
      rejectionCode: input.rejectionCode,
      attemptedMatches: dedupedMatches,
      candidate: input.candidate
    })
  ).catch(() => null);

  if (!attempt || attempt.status === "fallback") {
    return null;
  }

  const sourceIds = new Set(dedupedMatches.map((match) => match.sourceId).filter((value): value is string => Boolean(value)));
  const keepSourceIds = attempt.parsed.keepSourceIds.filter((sourceId) => sourceIds.has(sourceId));
  const recommendedSourceId = attempt.parsed.recommendedSourceId && sourceIds.has(attempt.parsed.recommendedSourceId)
    ? attempt.parsed.recommendedSourceId
    : null;
  const finalKeepIds = recommendedSourceId && !keepSourceIds.includes(recommendedSourceId)
    ? [recommendedSourceId, ...keepSourceIds]
    : keepSourceIds;

  const keptMatches = dedupedMatches
    .filter((match) => match.sourceId && finalKeepIds.includes(match.sourceId))
    .map((match) => ({
      ...match,
      isRecommended: Boolean(recommendedSourceId && match.sourceId === recommendedSourceId),
      recommendationReason: recommendedSourceId && match.sourceId === recommendedSourceId
        ? attempt.parsed.recommendationReason
        : null
    }));

  return {
    attemptedMatches: keptMatches,
    prunedMatchCount: Math.max(0, dedupedMatches.length - keptMatches.length),
    reviewSummary: sanitizeReviewSummary(attempt.parsed.pruneSummary ?? attempt.parsed.recommendationReason),
    llmReviewed: true
  };
}
