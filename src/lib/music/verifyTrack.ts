import { artistMatchKind, rankMatches, type ScoredMatch } from "@/lib/music/matchScore";
import { logTiming, timeAsync } from "@/lib/debugTiming";
import { reviewAttemptedMatchesWithLLM } from "@/lib/music/llmMatchReview";
import { normalizedTrackKey, normalizeText, normalizeVersionlessText, tokenOverlapScore } from "@/lib/music/normalize";
import type { MusicMetadataProvider, TrackSearchQuery, TrackSearchResult } from "@/lib/music/providers/providerTypes";
import { createDefaultMetadataProviders, verificationPolicy, type VerificationRejectionCode } from "@/lib/music/verificationPolicy";
import { formatRuntime } from "@/lib/playlist/runtime";
import type { AttemptedMatch, CandidateTrack, RejectedCandidate, Track } from "@/types/playlist";

export type VerificationOutcome =
  | { status: "verified"; track: Track }
  | { status: "rejected"; rejected: RejectedCandidate };

function genreTagsFrom(result: TrackSearchResult, candidate?: CandidateTrack): string[] {
  const tags = new Set<string>();
  for (const tag of candidate?.vibeTags ?? []) {
    const normalized = normalizeText(tag);
    if (normalized) {
      tags.add(normalized);
    }
  }
  if (result.primaryGenreName) {
    const normalized = normalizeText(result.primaryGenreName);
    if (normalized) {
      tags.add(normalized);
    }
  }
  return [...tags];
}

function toTrack(result: TrackSearchResult & { confidence?: "high" | "medium" | "low" }, candidate?: CandidateTrack, verificationNote?: string): Track {
  return {
    id: `${result.source}:${result.sourceId}`,
    title: result.title,
    artist: result.artist,
    album: result.album,
    durationMs: result.durationMs,
    runtime: formatRuntime(result.durationMs),
    verified: true,
    source: result.source,
    sourceId: result.sourceId,
    sourceUrl: result.sourceUrl,
    isrcs: result.isrcs,
    artworkUrl: result.artworkUrl,
    explicit: result.explicit,
    releaseDate: result.releaseDate,
    vibeTags: candidate?.vibeTags ?? [],
    genreTags: genreTagsFrom(result, candidate),
    rationale: candidate?.reason ?? null,
    fitNotes: candidate?.expectedFitNotes || null,
    energy: candidate?.energy ?? null,
    bpm: null,
    bpmConfidence: null,
    vocalProfile: null,
    vocalProfileConfidence: null,
    evidenceNotes: [],
    verificationNote: verificationNote ?? `Verified by ${result.source}.`,
    verificationConfidence: result.confidence === "medium" ? "medium" : "high"
  };
}

function attemptedMatchesFrom(query: TrackSearchQuery, results: TrackSearchResult[]) {
  return rankMatches(query, results).map((match) => ({
    sourceId: match.sourceId,
    title: match.title,
    artist: match.artist,
    album: match.album,
    durationMs: match.durationMs,
    runtime: formatRuntime(match.durationMs),
    source: match.source,
    sourceUrl: match.sourceUrl,
    isrcs: match.isrcs,
    artworkUrl: match.artworkUrl,
    explicit: match.explicit,
    releaseDate: match.releaseDate,
    primaryGenreName: match.primaryGenreName,
    score: Number(match.score.toFixed(3)),
    confidence: match.confidence
  }));
}

function hasRequestedAlbumEvidence(query: TrackSearchQuery, result: TrackSearchResult): boolean {
  if (!query.album) {
    return true;
  }
  if (!result.album) {
    return false;
  }

  return normalizeText(query.album) === normalizeText(result.album) ||
    tokenOverlapScore(query.album, result.album) >= 0.8;
}

function equivalentRecording(query: TrackSearchQuery, a: ScoredMatch, b: ScoredMatch): boolean {
  const sameVersionlessTitle = normalizeVersionlessText(a.title) === normalizeVersionlessText(b.title) &&
    normalizeVersionlessText(query.title) === normalizeVersionlessText(a.title);
  const aArtistKind = artistMatchKind(query.artist, a.artist);
  const bArtistKind = artistMatchKind(query.artist, b.artist);
  const compatibleArtists = (aArtistKind === "exact" || aArtistKind === "backing-band") &&
    (bArtistKind === "exact" || bArtistKind === "backing-band");

  return sameVersionlessTitle && compatibleArtists;
}

function hasCloseDistinctAlternative(query: TrackSearchQuery, ranked: ScoredMatch[]): boolean {
  const best = ranked[0];
  if (!best) {
    return false;
  }

  return ranked.slice(1).some((match) => {
    const closeEnough = match.score >= verificationPolicy.ambiguousScore &&
      best.score - match.score <= verificationPolicy.closeMatchMargin;
    return closeEnough && !equivalentRecording(query, best, match);
  });
}

async function collectProviderResults(query: TrackSearchQuery, providers: MusicMetadataProvider[]): Promise<{
  results: TrackSearchResult[];
  providerErrors: string[];
}> {
  const results: TrackSearchResult[] = [];
  const providerErrors: string[] = [];

  for (const provider of providers) {
    const startedAt = performance.now();
    try {
      const providerResults = await provider.searchTrack(query);
      results.push(...providerResults);
      logTiming("provider_search", startedAt, {
        provider: provider.name,
        results: providerResults.length
      });
      const best = rankMatches(query, results)[0];
      if ((best?.score ?? 0) >= verificationPolicy.autoAcceptScore && best && hasRequestedAlbumEvidence(query, best)) {
        break;
      }
    } catch (error) {
      logTiming("provider_search", startedAt, {
        provider: provider.name,
        outcome: "error"
      });
      const status = typeof (error as { status?: unknown }).status === "number" ? ` ${String((error as { status: number }).status)}` : "";
      providerErrors.push(`${provider.name}${status}`);
    }
  }

  return { results, providerErrors };
}

function rejectWithCode(
  code: Exclude<VerificationRejectionCode, "providerUnavailable">,
  query: TrackSearchQuery,
  attemptedMatches: ReturnType<typeof attemptedMatchesFrom>,
  providerErrors: string[] = []
): VerificationOutcome {
  return {
    status: "rejected",
    rejected: {
      title: query.title,
      artist: query.artist,
      reason: verificationPolicy.rejectionMessage(code, { providerErrors }),
      attemptedMatches,
      rejectionCode: code
    }
  };
}

function dedupeAttemptedMatches(matches: AttemptedMatch[]): AttemptedMatch[] {
  const seen = new Set<string>();
  const deduped: AttemptedMatch[] = [];
  for (const match of matches) {
    const key = `${match.source}:${match.sourceId ?? "no-source-id"}:${match.artist}:${match.title}:${match.album ?? "no-album"}:${match.runtime ?? "no-runtime"}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(match);
  }
  return deduped;
}

async function verifyTrackOnce(
  query: TrackSearchQuery,
  candidate: CandidateTrack | undefined,
  providers: MusicMetadataProvider[],
  verificationNote?: string
): Promise<VerificationOutcome> {
  const { results, providerErrors } = await collectProviderResults(query, providers);
  const ranked = rankMatches(query, results);
  const best = ranked[0];
  const attemptedMatches = attemptedMatchesFrom(query, results);
  if (!best || best.score < verificationPolicy.ambiguousScore) {
    return rejectWithCode("noCredibleMatch", query, attemptedMatches, providerErrors);
  }

  if (best.score < verificationPolicy.autoAcceptScore || hasCloseDistinctAlternative(query, ranked)) {
    return rejectWithCode("ambiguousMatch", query, attemptedMatches);
  }

  if (!hasRequestedAlbumEvidence(query, best)) {
    return rejectWithCode("albumMismatch", query, attemptedMatches);
  }

  return { status: "verified", track: toTrack(best, candidate, verificationNote) };
}

export async function verifyTrack(
  query: TrackSearchQuery,
  candidate?: CandidateTrack,
  providerOrProviders?: MusicMetadataProvider | MusicMetadataProvider[]
): Promise<VerificationOutcome> {
  const startedAt = performance.now();
  try {
    const providers = providerOrProviders == null
      ? createDefaultMetadataProviders()
      : Array.isArray(providerOrProviders) ? providerOrProviders : [providerOrProviders];
    const firstOutcome = await verifyTrackOnce(query, candidate, providers);
    if (firstOutcome.status === "verified") {
      return firstOutcome;
    }

    const fallbackRejected: RejectedCandidate[] = [];
    for (const fallback of verificationPolicy.fallbackStrategies) {
      const fallbackOutcome = await verifyTrackOnce(
        fallback.query(query),
        candidate,
        providers,
        fallback.verificationNote
      );

      if (fallbackOutcome.status === "verified") {
        return fallbackOutcome;
      }
      fallbackRejected.push(fallbackOutcome.rejected);
    }

    const attemptedMatches = dedupeAttemptedMatches([
      ...(firstOutcome.rejected.attemptedMatches ?? []),
      ...fallbackRejected.flatMap((rejected) => rejected.attemptedMatches ?? [])
    ]).slice(0, 8);
    const rejectionCode = firstOutcome.rejected.rejectionCode ?? "noCredibleMatch";
    const llmReview = (rejectionCode === "ambiguousMatch" || rejectionCode === "noCredibleMatch")
      ? await reviewAttemptedMatchesWithLLM({
        query,
        rejectionCode,
        attemptedMatches,
        candidate
      })
      : null;

    return {
      status: "rejected",
      rejected: {
        ...firstOutcome.rejected,
        attemptedMatches: llmReview?.attemptedMatches ?? attemptedMatches,
        llmReviewed: llmReview?.llmReviewed,
        prunedMatchCount: llmReview?.prunedMatchCount,
        reviewSummary: llmReview?.reviewSummary ?? null
      }
    };
  } finally {
    logTiming("provider_verify_track", startedAt);
  }
}

export async function verifyTracks(
  queries: TrackSearchQuery[],
  providerOrProviders?: MusicMetadataProvider | MusicMetadataProvider[]
): Promise<{ verified: Track[]; rejected: RejectedCandidate[] }> {
  return timeAsync("provider_verify_tracks_batch", async () => {
    const verified: Track[] = [];
    const rejected: RejectedCandidate[] = [];
    const seen = new Set<string>();

    for (const query of queries) {
      const outcome = await verifyTrack(query, undefined, providerOrProviders);
      if (outcome.status === "verified") {
        const key = outcome.track.sourceId ?? normalizedTrackKey(outcome.track.artist, outcome.track.title);
        if (!seen.has(key)) {
          seen.add(key);
          verified.push(outcome.track);
        }
      } else {
        rejected.push(outcome.rejected);
      }
    }

    return { verified, rejected };
  }, { track_count: queries.length });
}
