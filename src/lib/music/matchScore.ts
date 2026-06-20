import {
  hasDiscouragedVersionTerms,
  normalizeArtist,
  normalizeText,
  normalizeVersionlessText,
  tokenOverlapScore
} from "@/lib/music/normalize";
import { verificationPolicy, type MatchConfidence } from "@/lib/music/verificationPolicy";
import type { TrackSearchQuery, TrackSearchResult } from "@/lib/music/providers/providerTypes";

export type ScoredMatch = TrackSearchResult & {
  score: number;
  confidence: MatchConfidence;
};

export type ArtistMatchKind = "exact" | "backing-band" | "overlap" | "weak";

function tokens(value: string): string[] {
  return normalizeArtist(value).split(" ").filter(Boolean);
}

function tokenIncludesAll(container: string[], contained: string[]): boolean {
  const containerTokens = new Set(container);
  return contained.length > 0 && contained.every((token) => containerTokens.has(token));
}

function hasBackingBandRelationship(queryArtist: string, resultArtist: string): boolean {
  const queryTokens = tokens(queryArtist);
  const resultTokens = tokens(resultArtist);
  const normalizedQuery = normalizeArtist(queryArtist);
  const normalizedResult = normalizeArtist(resultArtist);
  const hasJoiner = /\b(and|with)\b/.test(normalizeText(resultArtist));

  return hasJoiner && (
    normalizedResult.startsWith(`${normalizedQuery} and `) ||
    normalizedResult.startsWith(`${normalizedQuery} with `) ||
    tokenIncludesAll(resultTokens, queryTokens)
  );
}

export function artistMatchKind(queryArtist: string, resultArtist: string): ArtistMatchKind {
  const normalizedQuery = normalizeArtist(queryArtist);
  const normalizedResult = normalizeArtist(resultArtist);

  if (normalizedQuery && normalizedQuery === normalizedResult) {
    return "exact";
  }
  if (hasBackingBandRelationship(queryArtist, resultArtist)) {
    return "backing-band";
  }
  if (tokenOverlapScore(normalizedQuery, normalizedResult) >= 0.5) {
    return "overlap";
  }
  return "weak";
}

function artistScoreFor(kind: ArtistMatchKind, queryArtist: string, resultArtist: string): number {
  if (kind === "exact") {
    return 1;
  }
  if (kind === "backing-band") {
    return 0.72;
  }
  return tokenOverlapScore(normalizeArtist(queryArtist), normalizeArtist(resultArtist));
}

function hasRiskyAttribution(result: TrackSearchResult): boolean {
  return hasDiscouragedVersionTerms(result.artist) ||
    hasDiscouragedVersionTerms(result.title) ||
    hasDiscouragedVersionTerms(result.album ?? "");
}

export function scoreTrackMatch(query: TrackSearchQuery, result: TrackSearchResult): number {
  const exactTitle = normalizeText(query.title) === normalizeText(result.title) ? 1 : 0;
  const versionlessTitle = normalizeVersionlessText(query.title) === normalizeVersionlessText(result.title) ? 0.96 : 0;
  const artistKind = artistMatchKind(query.artist, result.artist);
  const titleScore = Math.max(exactTitle, versionlessTitle, tokenOverlapScore(query.title, result.title));
  const artistScore = artistScoreFor(artistKind, query.artist, result.artist);
  const albumScore = query.album && result.album ? tokenOverlapScore(query.album, result.album) : 0.55;
  const albumBoost = query.album && result.album && normalizeText(query.album) === normalizeText(result.album) ? 0.06 : 0;
  const canonicalBoost = exactTitle && artistKind === "exact" ? 0.03 : 0;
  const backingBandBoost = exactTitle && artistKind === "backing-band" ? 0.02 : 0;
  const versionPenalty = hasRiskyAttribution(result) ? 0.18 : 0;
  const providerBoost = result.source === "musicbrainz" && query.album ? 0.02 : 0;

  return Math.max(0, Math.min(1, titleScore * 0.5 + artistScore * 0.38 + albumScore * 0.1 + albumBoost + canonicalBoost + backingBandBoost + providerBoost - versionPenalty));
}

export function rankMatches(query: TrackSearchQuery, results: TrackSearchResult[]): ScoredMatch[] {
  return results
    .map((result) => {
      const score = scoreTrackMatch(query, result);
      return { ...result, score, confidence: verificationPolicy.confidenceForScore(score) };
    })
    .sort((a, b) => b.score - a.score);
}
