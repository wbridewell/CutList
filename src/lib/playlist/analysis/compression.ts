import { normalizeText } from "@/lib/music/normalize";
import type {
  PlaylistState,
  ReviewSuggestion,
  Track,
  TrackRoleAssessment,
  TransitionAssessment
} from "@/types/playlist";

export type CompressionStrength = "gentle" | "moderate" | "aggressive";

export type CompressionRequest = {
  compressionStrength: CompressionStrength;
  preserveExplicitRules: boolean;
  targetTotalDurationMs: number | null;
  targetTrackCount: number | null;
};

const numberWords: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20
};

function parseCountToken(value: string): number | null {
  const normalized = value.trim().toLowerCase();
  const parsed = numberWords[normalized] ?? Number.parseInt(normalized, 10);
  return Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), 200) : null;
}

function trackLabel(track: Pick<Track, "artist" | "title">): string {
  return `${track.artist} - ${track.title}`;
}

function totalDurationMs(tracks: Track[]): number {
  return tracks.reduce((sum, track) => sum + (track.durationMs ?? 0), 0);
}

function hasCompressionLanguage(userQuestion: string): boolean {
  return /\b(compress|compression|tighten|trim|trim the fat|shorter|sharper|cut this|cut it down|reduce)\b/i.test(userQuestion);
}

function parseTargetTrackCount(userQuestion: string): number | null {
  const match = userQuestion.match(/\b(?:cut|trim|compress|tighten|reduce|bring)\b.{0,40}?\bto\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\s+(?:total\s*)?(?:tracks?|songs?)\b/i)
    ?? userQuestion.match(/\b(?:make|turn)\b.{0,20}?\b(?:this|it|the playlist|the set)\b.{0,20}?\b(?:a|an)?\s*(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)(?:-|\s)+(?:track|song)\s+playlist\b/i);
  return match ? parseCountToken(match[1]) : null;
}

function parseTargetRuntimeMs(userQuestion: string): number | null {
  if (
    /\btracks?\b.{0,20}\b(?:under|below|at|around|about|to)\b.{0,10}\d+\s*(?:min|minutes?)\b/i.test(userQuestion) ||
    /\b(?:under|below|at|around|about|to)\b.{0,10}\d+\s*(?:min|minutes?)\b.{0,20}\btracks?\b/i.test(userQuestion)
  ) {
    return null;
  }

  const minuteMatch = userQuestion.match(/\b(?:make this|bring this)\b.{0,20}?(\d+)\s*minute\b/i)
    ?? userQuestion.match(/\b(?:under|to|at|around|about)\b.{0,20}?(\d+)\s*minute\b.{0,20}\b(?:playlist|set|runtime|total|overall)\b/i)
    ?? userQuestion.match(/\b(\d+)\s*minute\s+playlist\b/i);
  if (minuteMatch) {
    const minutes = Number.parseInt(minuteMatch[1], 10);
    return Number.isFinite(minutes) ? Math.max(minutes, 1) * 60_000 : null;
  }

  const runtimeMatch = userQuestion.match(/\b(\d+)\s*(?:min|minutes?)\b/i);
  if (runtimeMatch && /\b(compress|shorter|trim|tighten|reduce|under|to)\b/i.test(userQuestion)) {
    const minutes = Number.parseInt(runtimeMatch[1], 10);
    return Number.isFinite(minutes) ? Math.max(minutes, 1) * 60_000 : null;
  }

  return null;
}

function parseCompressionStrength(userQuestion: string): CompressionStrength {
  if (/\b(light trim|slightly shorter|slightly tighter|gently trim|gentle)\b/i.test(userQuestion)) {
    return "gentle";
  }
  if (/\b(compress hard|aggressively cut|cut hard|aggressive)\b/i.test(userQuestion)) {
    return "aggressive";
  }
  return "moderate";
}

export function parseCompressionRequest(userQuestion?: string | null): CompressionRequest | null {
  if (!userQuestion?.trim()) {
    return null;
  }

  const targetTrackCount = parseTargetTrackCount(userQuestion);
  const targetTotalDurationMs = parseTargetRuntimeMs(userQuestion);
  if (!hasCompressionLanguage(userQuestion) && targetTrackCount == null && targetTotalDurationMs == null) {
    return null;
  }

  return {
    targetTrackCount,
    targetTotalDurationMs,
    compressionStrength: parseCompressionStrength(userQuestion),
    preserveExplicitRules: true
  };
}

function anchorTrackIds(
  playlist: PlaylistState,
  trackRoles: TrackRoleAssessment[]
): Set<string> {
  const anchors = new Set<string>();
  const roleById = new Map(trackRoles.map((role) => [role.trackId, role.role]));
  const currentGenres = new Set((playlist.constraints.requiredGenreAdditions ?? []).map((item) => normalizeText(item.genre)));

  for (const track of playlist.tracks) {
    const role = roleById.get(track.id);
    if (role === "opener" || role === "climax" || role === "cooldown" || role === "resolution") {
      anchors.add(track.id);
    }
    if ((playlist.constraints.excludedArtists ?? []).some((artist) => normalizeText(artist) === normalizeText(track.artist))) {
      anchors.add(track.id);
    }
    if (currentGenres.size > 0 && track.genreTags.some((genre) => currentGenres.has(normalizeText(genre)))) {
      anchors.add(track.id);
    }
  }
  return anchors;
}

function transitionPenalty(transitionReview: TransitionAssessment[], trackId: string): number {
  let penalty = 0;
  for (const transition of transitionReview) {
    if (transition.toTrackId !== trackId && transition.fromTrackId !== trackId) {
      continue;
    }
    if (transition.issueType === "weak_bridge" || transition.issueType === "repetitive_texture") {
      penalty += 3;
    }
    if (transition.issueType === "abrupt_energy_jump") {
      penalty += 2;
    }
  }
  return penalty;
}

function duplicateArtistPenalty(playlist: PlaylistState, track: Track): number {
  const duplicates = playlist.tracks.filter((item) => normalizeText(item.artist) === normalizeText(track.artist)).length;
  return duplicates > 1 ? duplicates : 0;
}

function duplicateGenrePenalty(playlist: PlaylistState, track: Track): number {
  if (track.genreTags.length === 0) {
    return 0;
  }
  const shared = playlist.tracks.filter((item) => item.id !== track.id && item.genreTags.some((genre) =>
    track.genreTags.some((trackGenre) => normalizeText(trackGenre) === normalizeText(genre))
  )).length;
  return shared > 0 ? Math.min(shared, 3) : 0;
}

function rolePenalty(trackRoles: TrackRoleAssessment[], trackId: string): number {
  const role = trackRoles.find((item) => item.trackId === trackId)?.role;
  if (role === "bridge" || role === "palette_cleanser") {
    return 2;
  }
  if (role === "anchor" || role === "escalator" || role === "surprise") {
    return 1;
  }
  return 0;
}

function removableTracks(
  playlist: PlaylistState,
  trackRoles: TrackRoleAssessment[],
  transitionReview: TransitionAssessment[],
  request: CompressionRequest
): Track[] {
  const anchors = anchorTrackIds(playlist, trackRoles);
  const candidates = playlist.tracks
    .filter((track) => !anchors.has(track.id))
    .map((track) => ({
      score: duplicateArtistPenalty(playlist, track) + duplicateGenrePenalty(playlist, track) + rolePenalty(trackRoles, track.id) + transitionPenalty(transitionReview, track.id),
      track
    }))
    .filter((item) => item.score > 0);

  const sorted = candidates.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return (b.track.durationMs ?? 0) - (a.track.durationMs ?? 0);
  });

  const hardCountCut = request.targetTrackCount == null ? 0 : Math.max(0, playlist.tracks.length - request.targetTrackCount);
  const hardRuntimeCut = request.targetTotalDurationMs == null
    ? 0
    : Math.max(0, totalDurationMs(playlist.tracks) - request.targetTotalDurationMs);
  const requestedByRuntime = hardRuntimeCut > 0
    ? sorted.reduce<{ selected: Track[]; remaining: number }>((state, item) => {
      if (state.remaining <= 0) {
        return state;
      }
      state.selected.push(item.track);
      state.remaining -= item.track.durationMs ?? 0;
      return state;
    }, { selected: [], remaining: hardRuntimeCut }).selected
    : [];

  const strengthCount = request.compressionStrength === "gentle" ? 1 : request.compressionStrength === "aggressive" ? 3 : 2;
  const baseSelection = hardCountCut > 0
    ? sorted.slice(0, hardCountCut).map((item) => item.track)
    : sorted.slice(0, Math.min(sorted.length, strengthCount)).map((item) => item.track);

  const byId = new Map<string, Track>();
  for (const track of [...baseSelection, ...requestedByRuntime]) {
    byId.set(track.id, track);
  }
  return [...byId.values()];
}

export function createCompressionSuggestion(
  playlist: PlaylistState,
  request: CompressionRequest,
  trackRoles: TrackRoleAssessment[],
  transitionReview: TransitionAssessment[]
): ReviewSuggestion | null {
  const removed = removableTracks(playlist, trackRoles, transitionReview, request);
  if (removed.length === 0) {
    return null;
  }

  const kept = playlist.tracks.filter((track) => !removed.some((removedTrack) => removedTrack.id === track.id));
  const firstRemovedIndex = playlist.tracks.findIndex((track) => track.id === removed[0]?.id);
  const lastRemovedIndex = Math.max(...removed.map((track) => playlist.tracks.findIndex((item) => item.id === track.id)));
  const sectionTracks = playlist.tracks.slice(
    Math.max(0, firstRemovedIndex - 1),
    Math.min(playlist.tracks.length, lastRemovedIndex + 2)
  );
  const targetSummary = request.targetTrackCount != null
    ? `toward ${request.targetTrackCount} tracks`
    : request.targetTotalDurationMs != null
      ? `toward ${Math.round(request.targetTotalDurationMs / 60_000)} minutes`
      : "into a tighter section";

  return {
    id: `deterministic-compress-${removed.map((track) => track.id).join("-")}`,
    type: "compress_section",
    applicationMode: "remove_existing",
    affectedTrackIds: removed.map((track) => track.id),
    rationale: `This stretch feels overbuilt. Removing ${removed.map((track) => trackLabel(track)).join("; ")} should tighten the pacing ${targetSummary} while preserving the anchor beats around it.`,
    intentPreservation: `Keeps ${kept.slice(0, 3).map((track) => trackLabel(track)).join("; ")} as the identity-bearing spine.`,
    risk: request.targetTrackCount != null && request.targetTotalDurationMs != null
      ? "The count and runtime targets may pull in different directions, so this cut prioritizes the stricter shrink."
      : "Compression is interpretive; review the removals if any of these tracks feel central to the playlist's character.",
    confidence: request.compressionStrength === "aggressive" ? "medium" : "high",
    basis: "mixed",
    suggestedPrompt: null,
    orderedTrackIds: kept.map((track) => track.id),
    compressionPlan: {
      removeTrackIds: removed.map((track) => track.id),
      keepTrackIds: kept.map((track) => track.id),
      targetTrackCount: request.targetTrackCount,
      targetTotalDurationMs: request.targetTotalDurationMs
    },
    sectionLabel: sectionTracks.length > 0
      ? `${sectionTracks[0]?.title ?? "Section"} to ${sectionTracks.at(-1)?.title ?? "section end"}`
      : "Overbuilt section",
    sectionStartTrackId: sectionTracks[0]?.id ?? null,
    sectionEndTrackId: sectionTracks.at(-1)?.id ?? null
  };
}

export function filterCompressionSuggestions(
  suggestions: ReviewSuggestion[],
  request: CompressionRequest | null
): ReviewSuggestion[] {
  if (request) {
    return suggestions;
  }
  return suggestions.filter((suggestion) => suggestion.type !== "compress_section");
}
