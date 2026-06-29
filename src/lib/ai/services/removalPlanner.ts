import { playlistRemovalPrompt } from "@/lib/ai/prompts";
import { attemptLlmContract } from "@/lib/ai/services/llmService";
import { normalizeText } from "@/lib/music/normalize";
import { deterministicAnalyzePlaylist } from "@/lib/playlist/analysis/deterministicAnalyze";
import { evaluatePlaylistConstraints } from "@/lib/playlist/constraints";
import type { CuratorRunOptions } from "@/lib/ai/curatorTypes";
import type { CuratorResponse, PlaylistState, Track } from "@/types/playlist";
import type { ResolvedCuratorRequestPlan } from "@/lib/ai/services/workflowTypes";

function uniqueExistingRemovalTracks(playlist: PlaylistState, trackIds: string[]): Track[] {
  const remainingIds = new Set(trackIds);
  const removed: Track[] = [];
  for (const track of playlist.tracks) {
    if (remainingIds.has(track.id)) {
      removed.push(track);
      remainingIds.delete(track.id);
    }
  }
  return removed;
}

function removalTrackSummary(tracks: Track[]): string {
  return tracks.slice(0, 6).map((track) => `${track.artist} - ${track.title}`).join("; ");
}

function withStableRemovalConstraintArrays(constraints: PlaylistState["constraints"]): PlaylistState["constraints"] {
  return {
    ...constraints,
    noMoreFromGenres: constraints.noMoreFromGenres ?? [],
    excludedGenres: constraints.excludedGenres ?? [],
    notes: constraints.notes ?? []
  };
}

function tracksRemovedByConstraints(playlist: PlaylistState, constraints: PlaylistState["constraints"]): Track[] {
  const report = evaluatePlaylistConstraints(playlist.tracks, constraints);
  const removedIds = new Set(report.violations
    .map((violation) => violation.trackId)
    .filter((trackId): trackId is string => trackId != null));
  return playlist.tracks.filter((track) => removedIds.has(track.id));
}

function hasWeakestTrackLanguage(message: string): boolean {
  return /\bweak(est|er)?\b|\bdead weight\b|\boutlier\b|\bsoft spot(s)?\b|\bdrag(s|ging)?\b|\bclutter\b|\bdilute(s|d|ing)?\b/i.test(message);
}

function fallbackReplacementTargets(playlist: PlaylistState, replaceCount: number | null, userMessage: string): Track[] {
  const requestedCount = Math.max(1, replaceCount ?? 1);
  const deterministic = deterministicAnalyzePlaylist(playlist);
  const selectedIds: string[] = [];

  for (const weakLink of deterministic.weakLinks) {
    if (!selectedIds.includes(weakLink.trackId)) {
      selectedIds.push(weakLink.trackId);
    }
    if (selectedIds.length >= requestedCount) {
      return uniqueExistingRemovalTracks(playlist, selectedIds);
    }
  }

  if (!hasWeakestTrackLanguage(userMessage)) {
    return [];
  }

  const transitionPenalty = new Map<string, number>();
  for (const transition of deterministic.transitionReview) {
    if (transition.issueType !== "abrupt_energy_jump" && transition.issueType !== "weak_bridge" && transition.issueType !== "flat_ending") {
      continue;
    }
    transitionPenalty.set(transition.fromTrackId, (transitionPenalty.get(transition.fromTrackId) ?? 0) + 1);
    transitionPenalty.set(transition.toTrackId, (transitionPenalty.get(transition.toTrackId) ?? 0) + 1);
  }

  const genreCounts = new Map<string, number>();
  for (const track of playlist.tracks) {
    for (const genre of track.genreTags) {
      const normalized = normalizeText(genre);
      if (normalized) {
        genreCounts.set(normalized, (genreCounts.get(normalized) ?? 0) + 1);
      }
    }
  }
  const dominantGenres = [...genreCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([genre]) => genre);
  const energyValues = playlist.tracks
    .map((track) => track.energy)
    .filter((energy): energy is number => energy != null)
    .sort((a, b) => a - b);
  const medianEnergy = energyValues.length > 0
    ? energyValues[Math.floor(energyValues.length / 2)]
    : null;

  const rankedTracks = playlist.tracks
    .map((track, index) => {
      const normalizedGenres = track.genreTags
        .map((genre) => normalizeText(genre))
        .filter((genre): genre is string => Boolean(genre));
      const genreSupport = normalizedGenres.reduce((total, genre) => total + (genreCounts.get(genre) ?? 0), 0);
      const sharesDominantGenre = dominantGenres.length === 0 || normalizedGenres.some((genre) => dominantGenres.includes(genre));
      const lowEnergyPenalty = medianEnergy != null && track.energy != null && track.energy < medianEnergy ? 1 : 0;
      const score = (
        (sharesDominantGenre ? 0 : 3) +
        (normalizedGenres.length === 0 ? 1 : 0) +
        (genreSupport <= 1 ? 2 : genreSupport <= 2 ? 1 : 0) +
        lowEnergyPenalty +
        (transitionPenalty.get(track.id) ?? 0)
      );
      return { track, index, score };
    })
    .filter(({ track }) => !selectedIds.includes(track.id))
    .sort((a, b) => b.score - a.score || a.index - b.index);

  for (const candidate of rankedTracks) {
    if (candidate.score <= 0) {
      break;
    }
    selectedIds.push(candidate.track.id);
    if (selectedIds.length >= requestedCount) {
      break;
    }
  }

  return uniqueExistingRemovalTracks(playlist, selectedIds);
}

export async function selectReplacementTargets(
  plan: ResolvedCuratorRequestPlan,
  replaceCount: number | null,
  options: CuratorRunOptions
): Promise<Track[]> {
  const playlist = {
    ...plan.playlist,
    tracks: plan.preGenerationRemovalPlan.baseTracks,
    constraints: plan.constraintState.activeConstraints
  };

  if (playlist.tracks.length === 0) {
    return [];
  }

  if (/\bopener\b/i.test(plan.userMessage)) {
    return playlist.tracks.slice(0, 1);
  }

  if (/\bcloser\b|\bending track\b|\bfinal track\b/i.test(plan.userMessage)) {
    return playlist.tracks.slice(-1);
  }

  options.onProgress?.({ stage: "generating", message: "Asking the curator which existing tracks to replace." });
  const attempt = await attemptLlmContract<{
    message: string;
    removeTrackIds: string[];
    rationaleByTrackId: Record<string, string>;
  }>("playlistRemoval", playlistRemovalPrompt(playlist, plan.userMessage, { conversationContext: plan.conversationContext }), { signal: options.signal });

  if (attempt.status === "fallback") {
    if (attempt.reason === "disabled") {
      return [];
    }
    throw attempt.error;
  }

  const selectedTracks = uniqueExistingRemovalTracks(playlist, attempt.parsed.removeTrackIds);
  if (selectedTracks.length > 0) {
    if (replaceCount != null && selectedTracks.length > replaceCount) {
      return selectedTracks.slice(0, replaceCount);
    }
    return selectedTracks;
  }

  return fallbackReplacementTargets(playlist, replaceCount, plan.userMessage);
}

export async function executeRemovalPlan(
  plan: ResolvedCuratorRequestPlan,
  options: CuratorRunOptions
): Promise<CuratorResponse> {
  const removedTracks = tracksRemovedByConstraints(plan.playlist, plan.constraintState.activeConstraints);
  const versionRemovedTracks = plan.preGenerationRemovalPlan.versionCleanup?.removedTracks ?? [];
  const allRemovedTracks = [
    ...versionRemovedTracks,
    ...removedTracks.filter((track) => !versionRemovedTracks.some((removed) => removed.id === track.id))
  ];
  const finalTracks = plan.preGenerationRemovalPlan.versionCleanup
    ? plan.preGenerationRemovalPlan.baseTracks
    : plan.playlist.tracks.filter((track) => !removedTracks.some((removed) => removed.id === track.id));

  if (allRemovedTracks.length === 0 && plan.playlist.tracks.length > 0) {
    options.onProgress?.({ stage: "generating", message: "Asking the curator which existing tracks match the removal request." });
    const attempt = await attemptLlmContract<{
      message: string;
      removeTrackIds: string[];
      rationaleByTrackId: Record<string, string>;
    }>(
      "playlistRemoval",
      playlistRemovalPrompt(
        { ...plan.playlist, constraints: plan.constraintState.activeConstraints },
        plan.userMessage,
        { conversationContext: plan.conversationContext }
      ),
      { signal: options.signal }
    );

    if (attempt.status === "fallback") {
      if (attempt.reason !== "disabled") {
        throw attempt.error;
      }
    } else {
      const llmRemovedTracks = uniqueExistingRemovalTracks(plan.playlist, attempt.parsed.removeTrackIds);
      const reportTracks = plan.playlist.tracks.filter((track) => !llmRemovedTracks.some((removed) => removed.id === track.id));
      return {
        message: llmRemovedTracks.length > 0
          ? [
            `Removed ${llmRemovedTracks.length} track${llmRemovedTracks.length === 1 ? "" : "s"} selected by curator judgment: ${removalTrackSummary(llmRemovedTracks)}.`,
            attempt.parsed.message
          ].join(" ")
          : [
            "No tracks were removed because the curator did not return any valid existing track IDs for that request.",
            attempt.parsed.message
          ].join(" "),
        playlistUpdate: llmRemovedTracks.length > 0
          ? { action: "remove", tracks: llmRemovedTracks, orderRationale: null }
          : null,
        playlistMeta: null,
        updatedConstraints: withStableRemovalConstraintArrays(plan.constraintState.persistedConstraintsAfterSuccess),
        constraintReport: evaluatePlaylistConstraints(reportTracks, plan.constraintState.activeConstraints),
        rejectedCandidates: []
      };
    }
  }

  return {
    message: allRemovedTracks.length > 0
      ? plan.preGenerationRemovalPlan.versionCleanup
        ? `I kept the best versions and removed ${allRemovedTracks.length} alternate version${allRemovedTracks.length === 1 ? "" : "s"}.`
        : `Removed ${allRemovedTracks.length} track${allRemovedTracks.length === 1 ? "" : "s"} that violated the updated constraints.`
      : "No existing tracks violated the updated constraints, so nothing was removed.",
    playlistUpdate: allRemovedTracks.length > 0
      ? {
        action: plan.preGenerationRemovalPlan.versionCleanup ? "set" : "remove",
        tracks: plan.preGenerationRemovalPlan.versionCleanup ? finalTracks : allRemovedTracks,
        orderRationale: null
      }
      : null,
    playlistMeta: null,
    updatedConstraints: withStableRemovalConstraintArrays(plan.constraintState.persistedConstraintsAfterSuccess),
    constraintReport: evaluatePlaylistConstraints(finalTracks, plan.constraintState.activeConstraints),
    rejectedCandidates: []
  };
}
