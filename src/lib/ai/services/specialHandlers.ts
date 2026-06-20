import { enforceNewTracks, evaluatePlaylistConstraints } from "@/lib/playlist/constraints";
import { verifyTracks } from "@/lib/music/verifyTrack";
import type { CuratorRunOptions } from "@/lib/ai/curatorTypes";
import type { CuratorResponse } from "@/types/playlist";
import type { ResolvedCuratorRequestPlan } from "@/lib/ai/services/workflowTypes";

export function handleConversationalRequest(plan: ResolvedCuratorRequestPlan): CuratorResponse {
  return {
    message: "Ready when you are. Send me a vibe, seed tracks, or a playlist constraint and I will verify additions before they enter the workspace.",
    playlistUpdate: null,
    playlistMeta: null,
    updatedConstraints: plan.constraintState.activeConstraints,
    constraintReport: evaluatePlaylistConstraints(plan.playlist.tracks, plan.constraintState.activeConstraints),
    rejectedCandidates: []
  };
}

export async function handlePastedTracks(
  plan: ResolvedCuratorRequestPlan,
  options: CuratorRunOptions
): Promise<CuratorResponse> {
  options.onProgress?.({
    stage: "verifying",
    message: `Verifying ${plan.parsedTracks.length} pasted track${plan.parsedTracks.length === 1 ? "" : "s"}.`
  });
  const verified = await verifyTracks(plan.parsedTracks);
  const enforcement = enforceNewTracks(
    plan.playlist.tracks,
    verified.verified,
    plan.constraintState.activeConstraints
  );
  const allRejected = [...verified.rejected, ...enforcement.rejected];
  return {
    message: `I detected a pasted track list, verified ${enforcement.accepted.length} track${enforcement.accepted.length === 1 ? "" : "s"}, and rejected ${allRejected.length}.`,
    playlistUpdate: enforcement.accepted.length > 0
      ? { action: "add", tracks: enforcement.accepted, orderRationale: null }
      : null,
    playlistMeta: null,
    updatedConstraints: plan.constraintState.activeConstraints,
    constraintReport: enforcement.report,
    rejectedCandidates: allRejected
  };
}
