import { composeGenerationResponse, executeCandidateGeneration } from "@/lib/ai/services/candidateExecution";
import { buildConstraintExecutionState, persistableConstraintsAfterRequest } from "@/lib/ai/services/constraintLifecycle";
import { mergeConstraintLayers, normalizeInstructionIntentLayers } from "@/lib/ai/services/instructionIntent";
import { executeRemovalPlan, selectReplacementTargets } from "@/lib/ai/services/removalPlanner";
import { requestPlaylistShape, handlePlaylistShapeRequest } from "@/lib/ai/services/playlistShapeService";
import { handleConversationalRequest, handlePastedTracks } from "@/lib/ai/services/specialHandlers";
import { workflowSummaryPrompt } from "@/lib/ai/prompts";
import { attemptLlmContract } from "@/lib/ai/services/llmService";
import { buildPreGenerationRemovalPlan } from "@/lib/ai/services/requestResolution";
import { getLLMProvider } from "@/lib/ai/llmClient";
import type { CuratorRunOptions } from "@/lib/ai/curatorTypes";
import { evaluatePlaylistConstraints } from "@/lib/playlist/constraints";
import { applyPlaylistUpdateTracks } from "@/lib/playlist/operations";
import type { CuratorResponse, PlaylistConstraints, PlaylistState, Track } from "@/types/playlist";
import type {
  CuratorPlannedStep,
  ResolvedCuratorRequestPlan,
  StepExecutionResult,
  WorkflowExecutionResult
} from "@/lib/ai/services/workflowTypes";

type ExecutionContext = {
  playlist: PlaylistState;
  activeConstraints: PlaylistConstraints;
  persistedConstraints: PlaylistConstraints;
  stepResults: StepExecutionResult[];
  rejectedCandidates: CuratorResponse["rejectedCandidates"];
  lastOrderRationale: string | null;
  lastExplicitPlaylistMeta: CuratorResponse["playlistMeta"];
};

function normalizeTrackKey(track: Pick<Track, "artist" | "title">): string {
  return `${track.artist.trim().toLowerCase()}::${track.title.trim().toLowerCase()}`;
}

function pushUniqueRejected(
  target: CuratorResponse["rejectedCandidates"],
  incoming: CuratorResponse["rejectedCandidates"]
): void {
  const keys = new Set(target.map((candidate) => `${normalizeTrackKey(candidate)}::${candidate.reason}`));
  for (const candidate of incoming) {
    const key = `${normalizeTrackKey(candidate)}::${candidate.reason}`;
    if (!keys.has(key)) {
      target.push(candidate);
      keys.add(key);
    }
  }
}

function structuralActionCount(results: StepExecutionResult[]): number {
  return results.filter((result) => result.applied && ["set", "add", "remove", "reorder"].includes(result.playlistAction ?? "")).length;
}

function responseRemovedTracks(
  before: PlaylistState,
  response: CuratorResponse
): Track[] {
  if (response.playlistUpdate?.action === "remove") {
    return response.playlistUpdate.tracks;
  }
  if (response.playlistUpdate?.action !== "set") {
    return [];
  }
  const remaining = new Set(response.playlistUpdate.tracks.map((track) => track.id));
  return before.tracks.filter((track) => !remaining.has(track.id));
}

function responseAcceptedTracks(response: CuratorResponse): Track[] {
  if (response.playlistUpdate?.action === "add") {
    return response.playlistUpdate.tracks;
  }
  return [];
}

function applyResponseToPlaylist(
  playlist: PlaylistState,
  response: CuratorResponse
): PlaylistState {
  return {
    ...playlist,
    title: response.playlistMeta?.title ?? playlist.title,
    mood: response.playlistMeta?.mood ?? playlist.mood,
    arc: response.playlistMeta?.arc ?? playlist.arc,
    tracks: response.playlistUpdate ? applyPlaylistUpdateTracks(playlist.tracks, response.playlistUpdate) : playlist.tracks
  };
}

function buildStepConstraintState(
  baseState: ResolvedCuratorRequestPlan["constraintState"],
  playlist: PlaylistState,
  activeConstraints: PlaylistConstraints,
  persistedConstraints: PlaylistConstraints
): ResolvedCuratorRequestPlan["constraintState"] {
  return {
    deterministicConstraints: persistedConstraints,
    deterministicPersistentConstraints: persistedConstraints,
    deterministicRequestScopedConstraints: baseState.deterministicRequestScopedConstraints,
    persistentVerifiedRules: mergeConstraintLayers(
      baseState.persistentVerifiedRules,
      persistedConstraints
    ),
    persistentGuidance: baseState.persistentGuidance,
    requestScopedVerifiedRules: baseState.requestScopedVerifiedRules,
    requestScopedGuidance: baseState.requestScopedGuidance,
    effectiveVerifiedRules: mergeConstraintLayers(
      baseState.persistentVerifiedRules,
      persistedConstraints,
      baseState.requestScopedVerifiedRules
    ),
    effectiveGuidance: mergeConstraintLayers(
      baseState.persistentGuidance,
      baseState.requestScopedGuidance
    ),
    activeConstraints,
    persistedConstraintsAfterSuccess: persistedConstraints
  };
}

function buildStepPlan(
  plan: ResolvedCuratorRequestPlan,
  step: CuratorPlannedStep,
  context: ExecutionContext
): ResolvedCuratorRequestPlan {
  const playlistWithConstraints = {
    ...context.playlist,
    constraints: context.persistedConstraints
  };
  return {
    ...plan,
    playlist: playlistWithConstraints,
    userMessage: step.originText,
    operation: step.kind === "add"
      ? "generate"
      : step.kind === "replace"
        ? "replace"
        : step.kind === "remove"
          ? "remove"
          : step.kind === "reorder"
            ? "reorder"
            : step.kind === "import"
              ? "import_tracks"
              : "conversational",
    postOperationShape: false,
    requestedAddCount: step.requestedAddCount ?? plan.requestedAddCount,
    targetTotalTrackCount: step.targetTotalTrackCount ?? plan.targetTotalTrackCount,
    replacementCount: step.replacementCount ?? plan.replacementCount,
    constraintState: buildStepConstraintState(plan.constraintState, playlistWithConstraints, context.activeConstraints, context.persistedConstraints),
    preGenerationRemovalPlan: buildPreGenerationRemovalPlan(playlistWithConstraints, step.originText, context.activeConstraints),
    steps: [step],
    explicitTrackRequests: plan.explicitTrackRequests
  };
}

async function executeGenerationStyleStep(
  stepPlan: ResolvedCuratorRequestPlan,
  options: CuratorRunOptions
): Promise<{ response: CuratorResponse; nextActiveConstraints: PlaylistConstraints }> {
  let baseTracks = stepPlan.preGenerationRemovalPlan.baseTracks;
  let preGenerationRemovedTracks = stepPlan.preGenerationRemovalPlan.removedTracks;

  if (stepPlan.operation === "replace" && preGenerationRemovedTracks.length === 0) {
    const replacementTargets = await selectReplacementTargets(stepPlan, stepPlan.replacementCount, options);
    if (replacementTargets.length > 0) {
      baseTracks = baseTracks.filter((track) => !replacementTargets.some((removed) => removed.id === track.id));
      preGenerationRemovedTracks = [
        ...preGenerationRemovedTracks,
        ...replacementTargets.filter((track) => !preGenerationRemovedTracks.some((removed) => removed.id === track.id))
      ];
    }
  }

  if (stepPlan.operation === "replace" && preGenerationRemovedTracks.length === 0) {
    return {
      response: {
        message: "No tracks were replaced because I could not identify valid existing tracks to remove. Please name the target tracks or ask for a diagnosis-only review first.",
        playlistUpdate: null,
        playlistMeta: null,
        updatedConstraints: stepPlan.constraintState.persistedConstraintsAfterSuccess,
        constraintReport: evaluatePlaylistConstraints(stepPlan.playlist.tracks, stepPlan.constraintState.activeConstraints),
        rejectedCandidates: []
      },
      nextActiveConstraints: stepPlan.constraintState.activeConstraints
    };
  }

  const fillCount = stepPlan.targetTotalTrackCount == null ? null : Math.max(0, stepPlan.targetTotalTrackCount - baseTracks.length);
  const effectiveRequestedCount = fillCount
    ?? stepPlan.requestedAddCount
    ?? stepPlan.replacementCount
    ?? (stepPlan.operation === "replace" ? preGenerationRemovedTracks.length : null);

  const generationResult = await executeCandidateGeneration(stepPlan, options, {
    baseTracks,
    replacementRemovedTracks: preGenerationRemovedTracks,
    effectiveRequestedCount
  });
  if ("playlistUpdate" in generationResult) {
    return {
      response: generationResult,
      nextActiveConstraints: stepPlan.constraintState.activeConstraints
    };
  }

  return {
    response: composeGenerationResponse(stepPlan, generationResult, {
      baseTracks,
      effectiveRequestedCount,
      preGenerationRemovedTracks
    }),
    nextActiveConstraints: generationResult.activeConstraints
  };
}

async function summarizeWorkflow(
  originalUserMessage: string,
  stepResults: StepExecutionResult[],
  finalPlaylist: PlaylistState,
  fallbackMessage: string,
  options: CuratorRunOptions
): Promise<string> {
  const contentStepCount = stepResults.filter((step) => step.stepKind !== "update_rules").length;
  if (contentStepCount < 2 || getLLMProvider() === "none") {
    return fallbackMessage;
  }

  const attempt = await attemptLlmContract<{ message: string }>(
    "workflowSummary",
    workflowSummaryPrompt({
      originalUserMessage,
      finalTrackCount: finalPlaylist.tracks.length,
      stepResults: stepResults.map((step) => ({
        stepKind: step.stepKind,
        sourceOrder: step.sourceOrder,
        originText: step.originText,
        message: step.message,
        acceptedTracks: step.acceptedTracks.map((track) => `${track.artist} - ${track.title}`),
        removedTracks: step.removedTracks.map((track) => `${track.artist} - ${track.title}`),
        rejectedCandidates: step.rejectedCandidates.map((candidate) => `${candidate.artist} - ${candidate.title}`),
        applied: step.applied,
        skipped: step.skipped,
        failed: step.failed,
        failureReason: step.failureReason
      }))
    }),
    { signal: options.signal }
  );

  if (attempt.status === "fallback") {
    return fallbackMessage;
  }
  return attempt.parsed.message;
}

function deterministicWorkflowSummary(stepResults: StepExecutionResult[]): string {
  const contentSteps = stepResults.filter((step) => (step.applied || step.failed || step.skipped) && step.stepKind !== "update_rules");
  if (contentSteps.length <= 1) {
    return contentSteps
      .map((step) => step.message)
      .filter(Boolean)
      .join(" ");
  }

  const totalRemoved = contentSteps.reduce((total, step) => total + step.removedTracks.length, 0);
  const totalAccepted = contentSteps.reduce((total, step) => total + step.acceptedTracks.length, 0);
  const totalRejected = contentSteps.reduce((total, step) => total + step.rejectedCandidates.length, 0);
  const hadReorder = contentSteps.some((step) => step.playlistAction === "reorder");
  const hadAddOrReplace = contentSteps.some((step) => step.stepKind === "add" || step.stepKind === "replace");
  const failedSteps = contentSteps.filter((step) => step.failed);
  const parts: string[] = [];

  if (hadReorder) {
    parts.push("Reordered the playlist to separate repeated artists and improve the spacing.");
  }
  if (totalRemoved > 0) {
    parts.push(`Removed ${totalRemoved} track${totalRemoved === 1 ? "" : "s"} from the playlist.`);
  }
  if (hadAddOrReplace && totalAccepted > 0) {
    parts.push(`Verified and accepted ${totalAccepted} track${totalAccepted === 1 ? "" : "s"}.`);
  } else if (hadAddOrReplace && totalAccepted === 0) {
    parts.push("I could not accept any new tracks from this pass.");
  }
  if (hadAddOrReplace && totalRejected > 0) {
    parts.push(`Rejected ${totalRejected} candidate${totalRejected === 1 ? "" : "s"} because verification or constraints did not hold.`);
  }
  if (failedSteps.length > 0) {
    parts.push(`Could not finish ${failedSteps.length} later step${failedSteps.length === 1 ? "" : "s"}.`);
  }

  return parts.join(" ");
}

function ruleOnlyWorkflowSummary(constraints: PlaylistConstraints): string {
  const guidance = constraints.notes ?? [];
  if (guidance.length > 0) {
    return `Updated the playlist rules and guidance. ${guidance.join(" ")}`;
  }
  return "Updated the playlist rules and guidance.";
}

function createStepResult(
  step: CuratorPlannedStep,
  response: CuratorResponse,
  before: PlaylistState,
  failureReason: string | null = null
): StepExecutionResult {
  return {
    stepId: step.id,
    stepKind: step.kind,
    sourceOrder: step.sourceOrder,
    originText: step.originText,
    acceptedTracks: responseAcceptedTracks(response),
    removedTracks: responseRemovedTracks(before, response),
    rejectedCandidates: response.rejectedCandidates,
    playlistAction: response.playlistUpdate?.action ?? null,
    orderRationale: response.playlistUpdate?.orderRationale ?? null,
    ruleChanges: response.updatedConstraints ?? null,
    message: response.message,
    applied: response.playlistUpdate != null || response.updatedConstraints != null || response.playlistMeta != null || response.message.length > 0,
    skipped: false,
    skipReason: null,
    failed: failureReason != null,
    failureReason
  };
}

function unchangedMeta(original: PlaylistState, current: PlaylistState): CuratorResponse["playlistMeta"] {
  const title = current.title !== original.title ? current.title : null;
  const mood = current.mood !== original.mood ? current.mood : null;
  const arc = current.arc !== original.arc ? current.arc : null;
  return title != null || mood != null || arc != null ? { title, mood, arc } : null;
}

function collapseFinalResponse(
  originalPlaylist: PlaylistState,
  context: ExecutionContext,
  summaryMessage: string
): CuratorResponse {
  const structuralCount = structuralActionCount(context.stepResults);
  const playlistChanged = JSON.stringify(originalPlaylist.tracks.map((track) => track.id)) !== JSON.stringify(context.playlist.tracks.map((track) => track.id));
  const finalTracksById = new Set(context.playlist.tracks.map((track) => track.id));
  const originalTracksById = new Set(originalPlaylist.tracks.map((track) => track.id));
  const addedTracks = context.playlist.tracks.filter((track) => !originalTracksById.has(track.id));
  const removedTracks = originalPlaylist.tracks.filter((track) => !finalTracksById.has(track.id));
  const lastAppliedAction = [...context.stepResults].reverse().find((result) => result.applied && result.playlistAction != null)?.playlistAction
    ?? (addedTracks.length > 0 ? "add" : removedTracks.length > 0 ? "remove" : null);
  const shouldKeepSingleReorder = structuralCount === 1 && lastAppliedAction === "reorder";
  const playlistUpdate: CuratorResponse["playlistUpdate"] = !playlistChanged && !shouldKeepSingleReorder
    ? null
    : structuralCount <= 1 && (lastAppliedAction === "add" || lastAppliedAction === "remove" || lastAppliedAction === "reorder")
      ? {
        action: lastAppliedAction as "add" | "remove" | "reorder",
        tracks: lastAppliedAction === "add"
          ? addedTracks
          : lastAppliedAction === "remove"
            ? removedTracks
            : context.playlist.tracks,
        orderRationale: lastAppliedAction === "reorder" ? context.lastOrderRationale : null
      }
      : {
        action: "set",
        tracks: context.playlist.tracks,
        orderRationale: context.lastOrderRationale
      };

  return {
    message: summaryMessage,
    playlistUpdate,
    playlistMeta: context.lastExplicitPlaylistMeta ?? unchangedMeta(originalPlaylist, context.playlist),
    updatedConstraints: context.persistedConstraints,
    constraintReport: evaluatePlaylistConstraints(context.playlist.tracks, context.persistedConstraints),
    rejectedCandidates: context.rejectedCandidates
  };
}

export async function executeResolvedCuratorPlan(
  plan: ResolvedCuratorRequestPlan,
  options: CuratorRunOptions = {}
): Promise<CuratorResponse> {
  const context: ExecutionContext = {
    playlist: { ...plan.playlist, constraints: plan.constraintState.persistedConstraintsAfterSuccess },
    activeConstraints: plan.constraintState.activeConstraints,
    persistedConstraints: plan.constraintState.persistedConstraintsAfterSuccess,
    stepResults: [],
    rejectedCandidates: [],
    lastOrderRationale: null,
    lastExplicitPlaylistMeta: null
  };

  for (const step of plan.steps) {
    const before = context.playlist;
    if (step.kind === "update_rules") {
      context.activeConstraints = plan.constraintState.activeConstraints;
      context.persistedConstraints = plan.constraintState.persistedConstraintsAfterSuccess;
      context.stepResults.push({
        stepId: step.id,
        stepKind: step.kind,
        sourceOrder: step.sourceOrder,
        originText: step.originText,
        acceptedTracks: [],
        removedTracks: [],
        rejectedCandidates: [],
        playlistAction: null,
        orderRationale: null,
        ruleChanges: context.persistedConstraints,
        message: "Applied updated rules before executing the requested playlist edits.",
        applied: true,
        skipped: false,
        skipReason: null,
        failed: false,
        failureReason: null
      });
      continue;
    }

    try {
      const stepPlan = buildStepPlan(plan, step, context);
      let response: CuratorResponse;
      let nextActiveConstraints = context.activeConstraints;

      switch (step.kind) {
        case "remove":
          response = await executeRemovalPlan(stepPlan, options);
          break;
        case "replace":
        case "add": {
          const generation = await executeGenerationStyleStep(stepPlan, options);
          response = generation.response;
          nextActiveConstraints = generation.nextActiveConstraints;
          break;
        }
        case "reorder":
          response = await handlePlaylistShapeRequest(
            { ...context.playlist, constraints: context.activeConstraints },
            step.originText,
            options
          );
          break;
        case "import":
          response = await handlePastedTracks(stepPlan, options);
          break;
        case "analyze":
        case "metadata":
        default:
          response = await handleConversationalRequest(stepPlan);
          break;
      }

      pushUniqueRejected(context.rejectedCandidates, response.rejectedCandidates);
      context.playlist = applyResponseToPlaylist(context.playlist, response);
      context.activeConstraints = nextActiveConstraints;
      if (response.updatedConstraints) {
        context.persistedConstraints = response.updatedConstraints;
      }
      if (response.playlistMeta) {
        context.lastExplicitPlaylistMeta = response.playlistMeta;
      }
      if (response.playlistUpdate?.orderRationale) {
        context.lastOrderRationale = response.playlistUpdate.orderRationale;
      }
      context.stepResults.push(createStepResult(step, response, before));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Step execution failed.";
      context.stepResults.push({
        stepId: step.id,
        stepKind: step.kind,
        sourceOrder: step.sourceOrder,
        originText: step.originText,
        acceptedTracks: [],
        removedTracks: [],
        rejectedCandidates: [],
        playlistAction: null,
        orderRationale: null,
        ruleChanges: null,
        message: `Could not finish the ${step.kind} step.`,
        applied: false,
        skipped: false,
        skipReason: null,
        failed: true,
        failureReason: message
      });
    }
  }

  const onlyRuleSteps = context.stepResults.length > 0 && context.stepResults.every((step) => step.stepKind === "update_rules");
  const fallbackSummary = onlyRuleSteps
    ? ruleOnlyWorkflowSummary(context.persistedConstraints)
    : deterministicWorkflowSummary(context.stepResults);
  const summaryMessage = await summarizeWorkflow(plan.userMessage, context.stepResults, context.playlist, fallbackSummary, options);
  const finalResponse = collapseFinalResponse(plan.playlist, context, summaryMessage);

  return finalResponse;
}

export async function executeResolvedCuratorWorkflow(
  plan: ResolvedCuratorRequestPlan,
  options: CuratorRunOptions = {}
): Promise<WorkflowExecutionResult> {
  const finalResponse = await executeResolvedCuratorPlan(plan, options);
  const finalPlaylist = {
    ...plan.playlist,
    title: finalResponse.playlistMeta?.title ?? plan.playlist.title,
    mood: finalResponse.playlistMeta?.mood ?? plan.playlist.mood,
    arc: finalResponse.playlistMeta?.arc ?? plan.playlist.arc,
    tracks: finalResponse.playlistUpdate ? applyPlaylistUpdateTracks(plan.playlist.tracks, finalResponse.playlistUpdate) : plan.playlist.tracks,
    constraints: finalResponse.updatedConstraints ?? plan.playlist.constraints
  };
  return {
    finalResponse,
    finalPlaylist,
    finalActiveConstraints: mergeConstraintLayers(finalResponse.updatedConstraints, undefined),
    finalPersistedConstraints: finalResponse.updatedConstraints ?? plan.playlist.constraints,
    stepResults: []
  };
}
