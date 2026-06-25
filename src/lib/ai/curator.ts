import {
  isLLMDisabledError,
  isLLMTimeoutError,
  isOllamaUnavailableError,
  isOpenAIQuotaError,
  RequestResolutionError
} from "@/lib/ai/errors";
import { emitReviewRoutingTrace } from "@/lib/debug/reviewRouting";
import { handleAnalyzePlaylist } from "@/lib/ai/services/analyzeService";
import { handleImportChat } from "@/lib/ai/services/importChatService";
import type { CuratorRunOptions } from "@/lib/ai/curatorTypes";
import { executeResolvedCuratorPlan } from "@/lib/ai/services/curatorWorkflow";
import { resolveOperatorPlan } from "@/lib/ai/services/operatorPlanner";
import { resolveCuratorRequestPlan } from "@/lib/ai/services/requestResolution";
import { handlePlaylistShapeRequest } from "@/lib/ai/services/playlistShapeService";
import { evaluatePlaylistConstraints } from "@/lib/playlist/constraints";
import type { CuratorResponse, PlaylistState } from "@/types/playlist";

export type { CuratorProgressEvent } from "@/lib/ai/curatorTypes";
export { handleAnalyzePlaylist, handleImportChat };

function logCuratorDebugError(stage: "request_resolution" | "workflow_execution", error: unknown): void {
  if (process.env.CUTLIST_DEBUG_TIMING !== "1") {
    return;
  }
  const timingId = process.env.CUTLIST_TIMING_ID?.trim() || "unknown";
  const errorName = error instanceof Error ? error.name : typeof error;
  const errorMessage = error instanceof Error ? error.message : String(error);
  console.error(`[cutlist:timing] ${stage}_error id=${timingId} error_name=${errorName} error_message=${JSON.stringify(errorMessage)}`);
}

function isStrictReorderOnlyRequest(userMessage: string): boolean {
  const hasReorderIntent = /\b(re-?order|reorganize|resequence|sequence|sequencing|arrange|rearrange|flow|arc|transition|transitions|group|cluster|separate)\b/i.test(userMessage);
  const forbidsStructuralChanges = /\bwithout\b(?:.{0,60})\b(?:add(?:ing)?|remov(?:e|ing))\b/i.test(userMessage) ||
    /\b(?:do not|don't|never)\s+(?:add|remove)\b/i.test(userMessage) ||
    /\bwithout changing\b(?:.{0,30})\b(?:track list|tracks|songs|track count)\b/i.test(userMessage) ||
    /\bkeep\b(?:.{0,20})\b(?:the same tracks|all the tracks|all the songs)\b/i.test(userMessage) ||
    /\bno additions? or removals?\b/i.test(userMessage);
  return hasReorderIntent && forbidsStructuralChanges;
}

export async function handlePlaylistMessage(
  playlist: PlaylistState,
  userMessage: string,
  options: CuratorRunOptions = {}
): Promise<CuratorResponse> {
  emitReviewRoutingTrace("backend.handlePlaylistMessage.start", {
    requestId: options.requestId ?? null,
    userMessage,
    trackCount: playlist.tracks.length
  });
  const operatorPlan = await resolveOperatorPlan(playlist, userMessage, options);
  emitReviewRoutingTrace("backend.handlePlaylistMessage.operatorPlan", {
    requestId: options.requestId ?? null,
    routeFamily: operatorPlan.routeFamily,
    executionPolicy: operatorPlan.executionPolicy,
    planTemplate: operatorPlan.planTemplate,
    operators: operatorPlan.operators.map((operator) => operator.kind)
  });

  if (operatorPlan.routeFamily === "review") {
    const review = await handleAnalyzePlaylist(playlist, userMessage, {
      conversationContext: options.conversationContext,
      requestId: options.requestId,
      reviewMode: operatorPlan.reviewMode ?? undefined
    });
    return {
      message: review.curatorTake ?? review.message,
      playlistUpdate: null,
      playlistMeta: null,
      updatedConstraints: playlist.constraints,
      constraintReport: review.constraintReport,
      rejectedCandidates: []
    };
  }

  if (operatorPlan.routeFamily === "import") {
    const imported = await handleImportChat(userMessage);
    return {
      message: imported.verifiedTracks.length > 0
        ? `Imported ${imported.verifiedTracks.length} verified track${imported.verifiedTracks.length === 1 ? "" : "s"} from the request.`
        : "I treated this as an import request, but I could not verify any tracks from the text.",
      playlistUpdate: imported.verifiedTracks.length > 0
        ? { action: "add", tracks: imported.verifiedTracks, orderRationale: null }
        : null,
      playlistMeta: null,
      updatedConstraints: playlist.constraints,
      constraintReport: evaluatePlaylistConstraints(
        [...playlist.tracks, ...imported.verifiedTracks],
        playlist.constraints
      ),
      rejectedCandidates: imported.rejectedCandidates
    };
  }

  if (operatorPlan.routeFamily === "conversational") {
    return {
      message: "Ready when you are. Send me a vibe, seed tracks, or a playlist constraint and I will verify additions before they enter the workspace.",
      playlistUpdate: null,
      playlistMeta: null,
      updatedConstraints: playlist.constraints,
      constraintReport: evaluatePlaylistConstraints(playlist.tracks, playlist.constraints),
      rejectedCandidates: []
    };
  }

  if (playlist.tracks.length >= 2 && isStrictReorderOnlyRequest(userMessage)) {
    options.onProgress?.({ stage: "parsing", message: "Understanding your request and active rules." });
    emitReviewRoutingTrace("backend.handlePlaylistMessage.strictReorder", {
      requestId: options.requestId ?? null
    });
    return handlePlaylistShapeRequest(playlist, userMessage, options);
  }

  options.onProgress?.({ stage: "parsing", message: "Understanding your request and active rules." });
  let plan;
  try {
    plan = await resolveCuratorRequestPlan(playlist, userMessage, {
      ...options,
      operatorPlan
    });
  } catch (error) {
    logCuratorDebugError("request_resolution", error);
    if (
      isLLMDisabledError(error) ||
      isLLMTimeoutError(error) ||
      isOpenAIQuotaError(error) ||
      isOllamaUnavailableError(error) ||
      (error instanceof Error && /GEMINI_API_KEY|OPENAI_API_KEY/i.test(error.message))
    ) {
      throw error;
    }
    throw new RequestResolutionError();
  }

  try {
    emitReviewRoutingTrace("backend.handlePlaylistMessage.plan", {
      requestId: options.requestId ?? null,
      operation: plan.operation,
      steps: plan.steps.map((step) => step.kind)
    });
    return await executeResolvedCuratorPlan(plan, options);
  } catch (error) {
    logCuratorDebugError("workflow_execution", error);
    throw error;
  }
}
