import { titlesEquivalent } from "@/lib/music/matchSemantics";
import { normalizeText } from "@/lib/music/normalize";
import { parseDeclaredTrackPlacement, parseReplacementIntent } from "@/lib/playlist/requestLexing";
import type { BoundNamedTrack, BoundTrackPlacement, DeclaredTrackPlacement, PlaylistState } from "@/types/playlist";

export function resolveNamedTrack(playlist: PlaylistState, query: string): BoundNamedTrack {
  const exactIdMatch = playlist.tracks.find((track) => track.id === query);
  if (exactIdMatch) {
    return {
      query,
      trackId: exactIdMatch.id,
      title: exactIdMatch.title,
      artist: exactIdMatch.artist,
      resolution: "exact"
    };
  }

  const normalizedQuery = normalizeText(query);
  const exactMatches = playlist.tracks.filter((track) => {
    const titleMatch = titlesEquivalent(query, track.title);
    const artist = normalizeText(track.artist);
    const combo = normalizeText(`${track.artist} ${track.title}`);
    const dashed = normalizeText(`${track.artist} - ${track.title}`);
    return titleMatch || normalizedQuery === combo || normalizedQuery === dashed || normalizedQuery === artist;
  });
  if (exactMatches.length === 1) {
    const track = exactMatches[0];
    return {
      query,
      trackId: track.id,
      title: track.title,
      artist: track.artist,
      resolution: "exact"
    };
  }

  const queryTokens = normalizedQuery.split(" ").filter(Boolean);
  const fuzzyMatches = playlist.tracks.filter((track) => {
    const haystack = normalizeText(`${track.artist} ${track.title}`);
    return queryTokens.every((token) => haystack.includes(token));
  });
  if (fuzzyMatches.length === 1) {
    const track = fuzzyMatches[0];
    return {
      query,
      trackId: track.id,
      title: track.title,
      artist: track.artist,
      resolution: "fuzzy"
    };
  }
  if (exactMatches.length > 1 || fuzzyMatches.length > 1) {
    return {
      query,
      trackId: null,
      title: null,
      artist: null,
      resolution: "ambiguous"
    };
  }
  return {
    query,
    trackId: null,
    title: null,
    artist: null,
    resolution: "unresolved"
  };
}

export function detectDeclaredTrackPlacement(userMessage: string): DeclaredTrackPlacement | null {
  return parseDeclaredTrackPlacement(userMessage);
}

export function detectCanonicalReplacementTargetQuery(
  playlist: PlaylistState,
  userMessage: string
): string | null {
  const replacementIntent = parseReplacementIntent(userMessage);
  if (replacementIntent?.mode !== "canonical_version") {
    return null;
  }

  if (replacementIntent.targetQuery) {
    return replacementIntent.targetQuery;
  }

  const candidates = playlist.tracks.filter((track) => {
    const title = normalizeText(track.title);
    const combo = normalizeText(`${track.artist} ${track.title}`);
    const message = normalizeText(userMessage);
    return message.includes(title) || message.includes(combo);
  });

  return candidates.length === 1 ? candidates[0].title : null;
}

export function bindDeclaredTrackPlacement(
  playlist: PlaylistState,
  placement: DeclaredTrackPlacement | null
): BoundTrackPlacement | null {
  if (!placement) {
    return null;
  }
  if (placement.mode === "append" || placement.mode === "prepend") {
    return {
      mode: placement.mode,
      anchorQuery: null,
      anchorTrackId: null,
      anchorLabel: null,
      resolution: "not_needed"
    };
  }

  if (!placement.anchorQuery) {
    return {
      mode: placement.mode,
      anchorQuery: null,
      anchorTrackId: null,
      anchorLabel: null,
      resolution: "unresolved"
    };
  }

  const match = resolveNamedTrack(playlist, placement.anchorQuery);
  return {
    mode: placement.mode,
    anchorQuery: placement.anchorQuery,
    anchorTrackId: match.trackId,
    anchorLabel: match.trackId ? `${match.artist} - ${match.title}` : null,
    resolution: match.resolution
  };
}
