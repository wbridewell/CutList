import { normalizeText } from "@/lib/music/normalize";
import { evaluatePlaylistConstraints } from "@/lib/playlist/constraints";
import { createCompressionSuggestion, type CompressionRequest } from "@/lib/playlist/analysis/compression";
import { formatRuntime } from "@/lib/playlist/runtime";
import type {
  AnalyzePlaylistResponse,
  PlaylistState,
  PlaylistTrackRole,
  ReviewConfidence,
  ReviewSuggestion,
  Track,
  TrackRoleAssessment,
  TransitionAssessment,
  TransitionIssueType
} from "@/types/playlist";

function countBy(values: string[]): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const value of values) {
    const key = normalizeText(value);
    if (key) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

function trackLabel(track: Pick<Track, "artist" | "title">): string {
  return `${track.artist} - ${track.title}`;
}

function roleForTrack(track: Track, index: number, tracks: Track[]): PlaylistTrackRole {
  if (index === 0) {
    return "opener";
  }
  if (index === tracks.length - 1) {
    return track.energy != null && track.energy <= 4 ? "resolution" : "cooldown";
  }

  const highestEnergy = Math.max(...tracks.map((item) => item.energy ?? 0));
  if (track.energy != null && track.energy >= 8 && track.energy === highestEnergy) {
    return "climax";
  }
  const previous = tracks[index - 1];
  const next = tracks[index + 1];
  if (previous && normalizeText(previous.artist) === normalizeText(track.artist)) {
    return "palette_cleanser";
  }
  if (track.energy != null && previous?.energy != null && next?.energy != null && previous.energy < track.energy && track.energy < next.energy) {
    return "escalator";
  }
  return index <= 2 ? "anchor" : "bridge";
}

function createTrackRoles(tracks: Track[]): TrackRoleAssessment[] {
  return tracks.map((track, index) => ({
    trackId: track.id,
    role: roleForTrack(track, index, tracks),
    rationale: index === 0
      ? "Positioned first, so it frames the listener's entry point."
      : index === tracks.length - 1
        ? "Positioned last, so it shapes the ending and aftertaste."
        : `Position ${index + 1} functions as connective tissue in the current sequence.`,
    confidence: track.energy == null ? "low" : "medium",
    basis: "metadata_heuristic"
  }));
}

function transitionIssueFor(from: Track, to: Track, isFinalTransition: boolean): {
  confidence: ReviewConfidence;
  basis: TransitionAssessment["basis"];
  issueType: TransitionIssueType;
  suggestedRepair: string | null;
  summary: string;
} {
  if (isFinalTransition && to.energy != null && to.energy >= 8) {
    return {
      issueType: "flat_ending",
      summary: `${trackLabel(to)} ends with high energy, so the playlist may not land cleanly.`,
      suggestedRepair: "Consider a cooldown or resolution after the climax.",
      confidence: "medium",
      basis: "metadata_heuristic"
    };
  }

  if (from.energy != null && to.energy != null && Math.abs(to.energy - from.energy) >= 4) {
    return {
      issueType: "abrupt_energy_jump",
      summary: `${trackLabel(from)} into ${trackLabel(to)} has a large energy jump.`,
      suggestedRepair: "Consider a bridge track or moving one of these tracks nearer a better energy match.",
      confidence: "medium",
      basis: "metadata_heuristic"
    };
  }

  if (normalizeText(from.artist) === normalizeText(to.artist)) {
    return {
      issueType: "repetitive_texture",
      summary: `${trackLabel(from)} and ${trackLabel(to)} repeat the same artist back to back.`,
      suggestedRepair: "Consider separating them unless the repetition is intentional.",
      confidence: "high",
      basis: "metadata_heuristic"
    };
  }

  const sharedGenre = from.genreTags.some((genre) => to.genreTags.some((nextGenre) => normalizeText(genre) === normalizeText(nextGenre)));
  return {
    issueType: sharedGenre ? "strong_transition" : "weak_bridge",
    summary: sharedGenre
      ? `${trackLabel(from)} into ${trackLabel(to)} shares provider genre evidence.`
      : `${trackLabel(from)} into ${trackLabel(to)} lacks obvious shared metadata evidence.`,
    suggestedRepair: sharedGenre ? null : "Consider checking whether this transition needs a bridge.",
    confidence: sharedGenre ? "medium" : "low",
    basis: "metadata_heuristic"
  };
}

function createTransitionReview(tracks: Track[]): TransitionAssessment[] {
  return tracks.slice(0, -1).map((track, index) => {
    const issue = transitionIssueFor(track, tracks[index + 1], index === tracks.length - 2);
    return {
      fromTrackId: track.id,
      toTrackId: tracks[index + 1].id,
      ...issue
    };
  });
}

function createIntentSummary(playlist: PlaylistState): AnalyzePlaylistResponse["intentSummary"] {
  const topGenres = countBy(playlist.tracks.flatMap((track) => track.genreTags)).slice(0, 3);
  const repeatedArtist = countBy(playlist.tracks.map((track) => track.artist)).find(([, count]) => count > 1)?.[0] ?? null;
  const energyValues = playlist.tracks.map((track) => track.energy).filter((energy): energy is number => energy != null);
  const hasBroadEnergySpread = energyValues.length >= 2 && (Math.max(...energyValues) - Math.min(...energyValues) >= 4);
  const leadGenre = topGenres[0]?.[0] ?? null;
  const secondaryGenres = topGenres.slice(1).map(([genre]) => genre);
  const identityParts = [
    leadGenre ? `${leadGenre}-led` : null,
    secondaryGenres.length > 0 ? `${secondaryGenres.join("/")} crosscurrent` : null,
    repeatedArtist ? `${repeatedArtist} pressure point` : null,
    hasBroadEnergySpread ? "wide dynamic swing" : playlist.tracks.length >= 5 ? "steady pressure build" : null
  ].filter((part): part is string => part != null);

  return {
    playlistIdentity: identityParts.length > 0
      ? identityParts.join(", ")
      : playlist.mood ?? playlist.title ?? "A verified CutList draft with a recognizable center of gravity.",
    preservedQualities: [
      playlist.arc ? `Arc: ${playlist.arc}` : null,
      topGenres.length ? `Provider/tag center: ${topGenres.map(([genre]) => genre).join(", ")}` : null,
      playlist.constraints.maxTracksPerArtist ? "Artist variety constraint is part of the current identity." : null
    ].filter((item): item is string => item != null),
    likelyUserIntent: playlist.arc ?? playlist.mood ?? "Build a coherent verified playlist from the current track set.",
    riskNotes: [
      "This deterministic review uses metadata and sequence signals only; subjective fit is low-confidence without model analysis."
    ],
    confidence: playlist.tracks.length >= 4 ? "medium" : "low"
  };
}

function createReviewSuggestions(
  playlist: PlaylistState,
  constraintReport: AnalyzePlaylistResponse["constraintReport"],
  transitionReview: TransitionAssessment[],
  trackRoles: TrackRoleAssessment[],
  compressionRequest: CompressionRequest | null = null
): ReviewSuggestion[] {
  const suggestions: ReviewSuggestion[] = [];
  const violationTrackIds = [...new Set(constraintReport.violations
    .map((violation) => violation.trackId)
    .filter((trackId): trackId is string => trackId != null))];

  if (violationTrackIds.length > 0) {
    suggestions.push({
      id: "deterministic-remove-constraint-violations",
      type: "remove",
      applicationMode: "remove_existing",
      affectedTrackIds: violationTrackIds,
      rationale: `Remove ${violationTrackIds.length} track${violationTrackIds.length === 1 ? "" : "s"} currently failing hard constraints.`,
      intentPreservation: "Preserves the explicit playlist rules and keeps accepted tracks that are not flagged.",
      risk: "May remove tracks the user considers central; review the highlighted tracks before applying.",
      confidence: "high",
      basis: "constraint",
      suggestedPrompt: null
    });
  }

  const weakTransition = transitionReview.find((transition) => transition.issueType === "abrupt_energy_jump" || transition.issueType === "weak_bridge");
  if (weakTransition) {
    suggestions.push({
      id: `deterministic-bridge-${weakTransition.fromTrackId}-${weakTransition.toTrackId}`,
      type: "add_bridge",
      applicationMode: "verify_candidate",
      affectedTrackIds: [weakTransition.fromTrackId, weakTransition.toTrackId],
      rationale: weakTransition.summary,
      intentPreservation: "Preserves the current sequence while asking for a verified bridge candidate.",
      risk: "Bridge quality is interpretive; verify and reject candidates that feel too obvious or off-vibe.",
      confidence: weakTransition.confidence,
      basis: "metadata_heuristic",
      suggestedPrompt: "Suggest one verified bridge track for the weakest transition in this playlist."
    });
  }

  const endingIssue = transitionReview.find((transition) => transition.issueType === "flat_ending");
  if (endingIssue) {
    suggestions.push({
      id: `deterministic-ending-${endingIssue.toTrackId}`,
      type: "improve_ending",
      applicationMode: "informational",
      affectedTrackIds: [endingIssue.toTrackId],
      rationale: endingIssue.summary,
      intentPreservation: "Keeps the current ending visible while flagging that it may need a cooldown or resolution.",
      risk: "A high-energy ending can be intentional; treat this as review guidance, not a rule.",
      confidence: endingIssue.confidence,
      basis: "metadata_heuristic",
      suggestedPrompt: "Suggest a verified cooldown or resolution track for the ending."
    });
  }

  if (playlist.tracks.length >= 4) {
    const orderedByEnergy = playlist.tracks.every((track) => track.energy != null)
      ? [...playlist.tracks].sort((a, b) => (a.energy ?? 0) - (b.energy ?? 0))
      : null;
    if (orderedByEnergy && orderedByEnergy.some((track, index) => track.id !== playlist.tracks[index].id)) {
      suggestions.push({
        id: "deterministic-reorder-energy-rise",
        type: "reorder",
        applicationMode: "reorder_existing",
        affectedTrackIds: playlist.tracks.map((track) => track.id),
        orderedTrackIds: orderedByEnergy.map((track) => track.id),
        rationale: "Try a conservative energy-rise sequence based on available track energy metadata.",
        intentPreservation: "Keeps every current track and changes only the order.",
        risk: "Energy metadata is a simplified signal and may not capture lyrical or textural flow.",
        confidence: "medium",
        basis: "metadata_heuristic",
        suggestedPrompt: null
      });
    }
  }

  if (compressionRequest) {
    const compressionSuggestion = createCompressionSuggestion(playlist, compressionRequest, trackRoles, transitionReview);
    if (compressionSuggestion) {
      suggestions.push(compressionSuggestion);
    }
  }

  return suggestions;
}

export function deterministicAnalyzePlaylist(
  playlist: PlaylistState,
  reason?: string,
  options: { compressionRequest?: CompressionRequest | null } = {}
): AnalyzePlaylistResponse {
  const constraintReport = evaluatePlaylistConstraints(playlist.tracks, playlist.constraints);
  const unverified = playlist.tracks.filter((track) => !track.verified);
  const longest = [...playlist.tracks]
    .filter((track) => track.durationMs != null)
    .sort((a, b) => (b.durationMs ?? 0) - (a.durationMs ?? 0))
    .slice(0, 3);
  const topArtists = countBy(playlist.tracks.map((track) => track.artist)).slice(0, 5);
  const topGenres = countBy(playlist.tracks.flatMap((track) => track.genreTags)).slice(0, 5);
  const leadGenre = topGenres[0]?.[0] ?? null;
  const repeatedArtist = topArtists.find(([, count]) => count > 1)?.[0] ?? null;

  const strengths = [
    playlist.tracks.length > 0 ? `${playlist.tracks.length} track${playlist.tracks.length === 1 ? "" : "s"} are in structured playlist state.` : "The playlist is ready for verified imports.",
    unverified.length === 0 ? "All current tracks are marked verified." : `${unverified.length} track${unverified.length === 1 ? " is" : "s are"} unverified.`,
    topArtists.length > 0 ? `Most represented artists: ${topArtists.map(([artist, count]) => `${artist} (${count})`).join(", ")}.` : "No artist concentration yet.",
    topGenres.length > 0 ? `Most represented provider/tag genres: ${topGenres.map(([genre, count]) => `${genre} (${count})`).join(", ")}.` : "Genre tags are sparse; iTunes metadata may be broad."
  ];

  const weakLinks = constraintReport.violations
    .filter((violation) => violation.trackId)
    .map((violation) => ({
      trackId: violation.trackId as string,
      reason: violation.message
    }));

  const sequencingNotes = [
    longest.length > 0 ? `Longest verified runtimes: ${longest.map((track) => `${track.artist} - ${track.title} (${formatRuntime(track.durationMs)})`).join(", ")}.` : "No runtime metadata is available yet.",
    "This fallback critique is deterministic because the OpenAI call did not complete; it checks metadata, constraints, counts, and ordering data but not aesthetic nuance."
  ];
  const trackRoles = createTrackRoles(playlist.tracks);
  const transitionReview = createTransitionReview(playlist.tracks);
  const curatorTake = [
    playlist.tracks.length === 0
      ? "There is no real playlist body here yet, so this pass can only speak in setup terms."
      : leadGenre
        ? `This presently reads as a ${leadGenre}-led set with a real center of gravity, but the order still has to prove that the pressure is intentional rather than accidental.`
        : "This has the skeleton of a real set, but right now the identity is being carried more by adjacency than by a clearly earned thesis.",
    repeatedArtist
      ? `${repeatedArtist} bunches the texture enough to become an audible pressure point, so artist spacing is one of the first things I would revisit.`
      : playlist.tracks.length >= 6
        ? "The material is here; the real question is whether the sequence earns its momentum instead of merely stacking compatible tracks."
        : "At this size, a few order changes could still redraw the whole silhouette quickly.",
    "Treat this as a deterministic fallback read rather than a full taste verdict."
  ].join(" ");

  return {
    curatorTake,
    message: reason ?? "OpenAI critique is unavailable, so I ran a deterministic playlist check instead.",
    strengths,
    weakLinks,
    sequencingNotes,
    constraintReport,
    suggestedEdits: constraintReport.violations.map((violation) => ({
      type: "remove",
      reason: violation.message,
      trackId: violation.trackId
    })),
    intentSummary: createIntentSummary(playlist),
    trackRoles,
    transitionReview,
    reviewSuggestions: createReviewSuggestions(playlist, constraintReport, transitionReview, trackRoles, options.compressionRequest ?? null)
  };
}
