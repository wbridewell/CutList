import type { ParsedTrackLine } from "@/lib/playlist/io/textImport";
import {
  containsAddIntent,
  containsAnalyzeIntent,
  containsExplicitReorderIntent,
  containsRemoveIntent,
  containsReplaceIntent,
  normalizeClauseText,
  parsePlacementSubjectQuery,
  splitOrderedClauses
} from "@/lib/playlist/requestLexing";

// Pulls exact track requests ("add Song by Artist", "add Song covered by X and Y", "put
// Song after ...") out of a request so they can be verified directly instead of asked of
// the model. Lives in the playlist layer because both the text importer and the
// deterministic request parser need it; it must not depend on either.
function cleanRequestedTrackFragment(value: string): string {
  return value.trim().replace(/^[,.;:!?]+|[,.;:!?]+$/g, "").trim();
}

function looksLikeRequestedCountPlaceholder(value: string): boolean {
  return /^(?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d+|some|few|couple)\s+(?:more\s+)?(?:songs?|tracks?)$/i.test(value.trim());
}

function isConstraintDeclaration(userMessage: string): boolean {
  return /\badd(?:ing)?\s+(?:a\s+)?(?:constraint|rule)\b/i.test(userMessage) ||
    /\b(?:make|set)\s+(?:a\s+)?(?:constraint|rule)\b/i.test(userMessage);
}

export function parseExplicitRequestedTracks(text: string): ParsedTrackLine[] {
  return splitOrderedClauses(text).flatMap((clause) => parseExplicitRequestedTrackClause(clause.text));
}

export function parseExplicitRequestedTrackClause(text: string): ParsedTrackLine[] {
  const normalized = normalizeClauseText(text);
  if (!normalized || isConstraintDeclaration(normalized) || !containsAddIntent(normalized)) {
    return [];
  }

  // ponytail: exact-track parsing only applies to a single add clause, not a whole mixed prompt.
  if (containsRemoveIntent(normalized) || containsReplaceIntent(normalized) || containsExplicitReorderIntent(normalized) || containsAnalyzeIntent(normalized)) {
    return [];
  }

  const coveredByMatch = normalized.match(/\badd\s+(.+?)\s+covered by\s+(.+)$/i);
  if (coveredByMatch) {
    const title = cleanRequestedTrackFragment(coveredByMatch[1] ?? "");
    const artistSegments = (coveredByMatch[2] ?? "")
      .split(/\s+and\s+covered by\s+/i)
      .map((segment) => cleanRequestedTrackFragment(segment))
      .filter(Boolean);
    if (title && !looksLikeRequestedCountPlaceholder(title) && artistSegments.length > 0) {
      return artistSegments.map((artist) => ({ title, artist, album: null }));
    }
  }

  const byArtistMatch = normalized.match(/\badd\s+(.+?)\s+by\s+(.+)$/i);
  if (byArtistMatch) {
    const title = cleanRequestedTrackFragment(byArtistMatch[1] ?? "");
    const artist = cleanRequestedTrackFragment(byArtistMatch[2] ?? "");
    if (title && !looksLikeRequestedCountPlaceholder(title) && artist) {
      return [{ title, artist, album: null }];
    }
  }

  const placementSubject = parsePlacementSubjectQuery(normalized);
  if (placementSubject && !looksLikeRequestedCountPlaceholder(placementSubject)) {
    return [{ title: placementSubject, artist: "", album: null }];
  }

  return [];
}
