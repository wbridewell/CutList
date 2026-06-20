import { createConstraintPresentation } from "@/lib/playlist/constraints/presentation";
import { evaluatePlaylistConstraints } from "@/lib/playlist/constraints";
import { formatRuntime, sumDurations } from "@/lib/playlist/runtime";
import type { PlaylistState } from "@/types/playlist";

export function createPlaylistHealth(playlist: PlaylistState) {
  const runtime = formatRuntime(sumDurations(playlist.tracks)) ?? "0:00";
  const constraintReport = evaluatePlaylistConstraints(playlist.tracks, playlist.constraints);
  const constraintViolations = constraintReport.violations;
  const evidenceWarnings = constraintReport.evidenceWarnings ?? [];
  const constraintPresentation = createConstraintPresentation(playlist.tracks, playlist.constraints, constraintReport);
  const verificationStatus = playlist.tracks.length === 0
    ? "No tracks yet"
    : playlist.tracks.every((track) => track.verified) ? "All verified" : "Needs verification";
  const hasConstraintSupport = constraintPresentation.ruleChips.length > 0
    || constraintPresentation.guidance.length > 0
    || constraintViolations.length > 0
    || evidenceWarnings.length > 0
    || constraintPresentation.evidenceCoverageViews.length > 0;

  return {
    constraintPresentation,
    constraintReport,
    constraintViolations,
    evidenceWarnings,
    hasConstraintSupport,
    runtime,
    verificationStatus
  };
}
