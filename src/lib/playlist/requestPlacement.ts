import { normalizeText } from "@/lib/music/normalize";
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
    const title = normalizeText(track.title);
    const artist = normalizeText(track.artist);
    const combo = normalizeText(`${track.artist} ${track.title}`);
    const dashed = normalizeText(`${track.artist} - ${track.title}`);
    return normalizedQuery === title || normalizedQuery === combo || normalizedQuery === dashed || normalizedQuery === artist;
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

function hasCanonicalReplacementCue(userMessage: string): boolean {
  return /\b(?:canonical|proper|real|original|studio)\b/i.test(userMessage) ||
    /\bitunes originals?\b/i.test(userMessage) ||
    /\bversion\b/i.test(userMessage);
}

function hasAddIntent(userMessage: string): boolean {
  if (/\b(?:do not|don't|never)\s+add\b/i.test(userMessage)) {
    return false;
  }
  return /\b(?:add|adding|insert|place|put|slot|drop in|bring in|queue)\b/i.test(userMessage);
}

export function detectDeclaredTrackPlacement(userMessage: string): DeclaredTrackPlacement | null {
  if (!hasAddIntent(userMessage)) {
    return null;
  }

  const afterMatch = userMessage.match(/\bafter\s+["']?([^"'.!\n]+?)["']?(?=$|[.!?\n]|,\s*(?:and|then)\b)/i);
  if (afterMatch?.[1]) {
    return {
      mode: "after_track",
      anchorQuery: afterMatch[1].trim()
    };
  }

  const beforeMatch = userMessage.match(/\bbefore\s+["']?([^"'.!\n]+?)["']?(?=$|[.!?\n]|,\s*(?:and|then)\b)/i);
  if (beforeMatch?.[1]) {
    return {
      mode: "before_track",
      anchorQuery: beforeMatch[1].trim()
    };
  }

  if (/\bat\s+the\s+(?:beginning|start)\b|\bto\s+the\s+(?:beginning|start)\b/i.test(userMessage)) {
    return {
      mode: "prepend",
      anchorQuery: null
    };
  }

  if (/\bat\s+the\s+end\b|\bto\s+the\s+end\b/i.test(userMessage)) {
    return {
      mode: "append",
      anchorQuery: null
    };
  }

  return null;
}

export function detectCanonicalReplacementTargetQuery(
  playlist: PlaylistState,
  userMessage: string
): string | null {
  if (!/\breplace\b/i.test(userMessage) || !hasCanonicalReplacementCue(userMessage)) {
    return null;
  }

  const versionOfMatch = userMessage.match(/\bversion\s+of\s+["']?([^"'.!\n]+?)["']?(?=$|[.!?\n]|\s+\b(?:with|for|and|then)\b|,\s*(?:with|for|and|then)\b)/i);
  if (versionOfMatch?.[1]) {
    return versionOfMatch[1].trim();
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
