import { analyzePlaylist } from "@/lib/client/desktopPlaylistBridge";
import { createPlaylistReviewHistoryEntry, type ChatMessage } from "@/lib/playlist/collaboration";
import { emitReviewRoutingTrace } from "@/lib/debug/reviewRouting";
import { applyCuratorResponse, insertTracksAfterTrack, removeTracksFromPlaylist, touchPlaylist } from "@/lib/playlist/state";
import { splitMixedComposerRequest, type MixedComposerRequestPrompts } from "@/lib/playlist/requestRouting";
import type { AnalyzePlaylistResponse, CuratorResponse, PlaylistState, ReviewMode, ReviewSuggestion } from "@/types/playlist";
import { buildConversationContext, createCompletedRequestMessages, createRequestMessageList, workflowErrorResult } from "./shared";
import type { AnalyzeWorkflowDependencies, ClientWorkflowResult, MixedReviewAndCuratorWorkflowDependencies, MixedReviewAndCuratorWorkflowResult } from "./shared";
import { runCuratorRequestWorkflow } from "./curatorRequest";
import { shouldWarnAboutUnverifiedPastedTracks } from "./importAndSeeds";

function validSubsetOrder(playlist: PlaylistState, orderedTrackIds: string[] | undefined, removedTrackIds: string[]): orderedTrackIds is string[] {
  if (!orderedTrackIds || orderedTrackIds.length === 0) {
    return false;
  }
  const removedIds = new Set(removedTrackIds);
  const expectedIds = playlist.tracks.filter((track) => !removedIds.has(track.id)).map((track) => track.id);
  return orderedTrackIds.length === expectedIds.length &&
    new Set(orderedTrackIds).size === expectedIds.length &&
    expectedIds.every((trackId) => orderedTrackIds.includes(trackId));
}

export function composeAnalyzeAssistantMessage(data: AnalyzePlaylistResponse, playlist?: PlaylistState): string {
  const basisLabel = (basis?: string): string => (
    basis === "metadata_heuristic"
      ? "metadata signal"
      : basis === "constraint"
        ? "verified"
        : basis === "mixed"
          ? "mixed basis"
          : "curator judgment"
  );
  const debugText = data.debug
    ? `Model debug:\nValidation: ${data.debug.validationError ?? "n/a"}\nRaw output:\n${JSON.stringify(data.debug.modelRawOutput, null, 2)}`
    : null;
  const trackById = new Map((playlist?.tracks ?? []).map((track) => [track.id, track]));
  const labelForTrackId = (trackId: string): string => {
    const track = trackById.get(trackId);
    return track ? `${track.artist} - ${track.title}` : trackId;
  };
  const labelForSuggestion = (trackIds: string[]): string | null => {
    const labels = trackIds.map((trackId) => labelForTrackId(trackId));
    return labels.length > 0 ? labels.join("; ") : null;
  };
  const labelForTransition = (fromTrackId: string, toTrackId: string): string => {
    return `${labelForTrackId(fromTrackId)} -> ${labelForTrackId(toTrackId)}`;
  };
  const summaryWithTransitionLabel = (item: { fromTrackId: string; toTrackId: string; summary: string }): string => {
    return `${labelForTransition(item.fromTrackId, item.toTrackId)}: ${item.summary}`;
  };
  if (data.reviewMode === "focused_transition_repair" || data.reviewMode === "bridge_options_only") {
    const transitionText = data.transitionReview.length
      ? `Transition diagnosis:\n${data.transitionReview.slice(0, 1).map((item) => `- ${summaryWithTransitionLabel(item)} (${basisLabel(item.basis)})`).join("\n")}`
      : null;
    const suggestionText = data.reviewSuggestions.length
      ? `Bridge options:\n${data.reviewSuggestions.map((item) => {
        const candidateLabel = item.candidate ? `${item.candidate.artist} - ${item.candidate.title}` : item.rationale;
        const roleText = item.candidate ? item.rationale.replace(new RegExp(`^${item.candidate.artist} - ${item.candidate.title}:\\s*`), "") : item.rationale;
        return `- ${candidateLabel}: ${roleText} (${basisLabel(item.basis)})`;
      }).join("\n")}`
      : null;
    return [data.curatorTake ?? data.message, transitionText, suggestionText, debugText].filter(Boolean).join("\n\n");
  }
  if (data.reviewMode === "diagnose_only") {
    const evidenceText = [
      data.sequencingNotes.length ? `Evidence:\n${data.sequencingNotes.map((item) => `- ${item}`).join("\n")}` : null,
      data.transitionReview.length ? `Transitions:\n${data.transitionReview.slice(0, 3).map((item) => `- ${summaryWithTransitionLabel(item)} (${basisLabel(item.basis)})`).join("\n")}` : null
    ].filter(Boolean).join("\n\n");
    return [data.curatorTake ?? data.message, evidenceText, debugText].filter(Boolean).join("\n\n");
  }
  if (data.reviewMode === "weak_links_only") {
    const weakLinkText = data.weakLinks.length
      ? `Weak links:\n${data.weakLinks.map((item) => `- ${labelForTrackId(item.trackId)}: ${item.reason}`).join("\n")}`
      : null;
    const suggestionText = data.reviewSuggestions.length
      ? `Suggested cuts:\n${data.reviewSuggestions.map((item) => {
        const label = labelForSuggestion(item.affectedTrackIds);
        return `- ${label ? `${label}: ` : ""}${item.rationale} (${basisLabel(item.basis)})`;
      }).join("\n")}`
      : null;
    return [data.curatorTake ?? data.message, weakLinkText, suggestionText, debugText].filter(Boolean).join("\n\n");
  }
  const identityText = data.intentSummary?.playlistIdentity
    ? `Playlist identity: ${data.intentSummary.playlistIdentity}`
    : null;
  const intentText = data.intentSummary
    ? [
      `Intent: ${data.intentSummary.likelyUserIntent}`,
      data.intentSummary.preservedQualities.length ? `Preserve: ${data.intentSummary.preservedQualities.join("; ")}` : null,
      `Confidence: ${data.intentSummary.confidence}`
    ].filter(Boolean).join("\n")
    : null;
  const roleText = data.trackRoles.length
    ? `Track roles:\n${data.trackRoles.slice(0, 6).map((item) => `- ${item.role}: ${item.rationale} (${basisLabel(item.basis)})`).join("\n")}`
    : null;
  const transitionText = data.transitionReview.length
    ? `Transitions:\n${data.transitionReview.slice(0, 5).map((item) => `- ${item.issueType}: ${summaryWithTransitionLabel(item)} (${basisLabel(item.basis)})`).join("\n")}`
    : null;
  const suggestionText = data.reviewSuggestions.length
    ? `Suggested follow-ups:\n${data.reviewSuggestions.slice(0, 5).map((item) => `- ${item.type}: ${item.rationale} (${basisLabel(item.basis)})`).join("\n")}`
    : null;
  const verifiedObservationBlocks = [
    data.constraintReport.violations.length ? `Verified-rule issues:\n${data.constraintReport.violations.map((item) => `- ${item.message}`).join("\n")}` : null,
    data.constraintReport.coverage?.summary?.length ? `Evidence coverage notes:\n${data.constraintReport.coverage.summary.map((item) => `- ${item}`).join("\n")}` : null,
    data.constraintReport.evidenceWarnings?.length ? `Not enough evidence to verify all rules:\n${data.constraintReport.evidenceWarnings.map((item) => `- ${item.message}`).join("\n")}` : null
  ].filter(Boolean).join("\n\n");
  const curatorJudgmentBlocks = [
    identityText,
    intentText,
    data.strengths.length ? `What works:\n${data.strengths.map((item) => `- ${item}`).join("\n")}` : null,
    roleText,
    data.sequencingNotes.length ? `Sequencing:\n${data.sequencingNotes.map((item) => `- ${item}`).join("\n")}` : null,
    transitionText,
    suggestionText
  ].filter(Boolean).join("\n\n");
  const operationalNote = data.curatorTake && data.message && data.message !== data.curatorTake
    ? `Review note:\n${data.message}`
    : null;
  const reviewMessage = [
    data.curatorTake ?? data.message,
    operationalNote,
    verifiedObservationBlocks ? `Verified observations:\n${verifiedObservationBlocks}` : null,
    curatorJudgmentBlocks ? `Curator judgment:\n${curatorJudgmentBlocks}` : null
  ].filter(Boolean).join("\n\n");
  return [reviewMessage, debugText].filter(Boolean).join("\n\n");
}

export async function runAnalyzeWorkflow(
  input: {
    playlist: PlaylistState;
    requestId?: string;
    userMessage: string;
    messages?: ChatMessage[];
    reviewMode?: ReviewMode;
  },
  dependencies: AnalyzeWorkflowDependencies = {}
): Promise<ClientWorkflowResult> {
  if (shouldWarnAboutUnverifiedPastedTracks(input.userMessage, input.playlist)) {
    return {
      assistantMessage: {
        role: "assistant",
        content: "I detected a pasted track table. Use Import and verify first so review runs against verified metadata instead of untrusted text."
      }
    };
  }

  try {
    emitReviewRoutingTrace("workflow.runAnalyze.start", {
      requestId: input.requestId ?? null,
      userMessage: input.userMessage
    });
    const analyze = dependencies.analyze ?? analyzePlaylist;
    const data = await analyze(
      input.playlist,
      input.userMessage || undefined,
      buildConversationContext(input.messages ?? []),
      input.requestId,
      input.reviewMode
    );
    const assistantContent = composeAnalyzeAssistantMessage(data, input.playlist);
    emitReviewRoutingTrace("workflow.runAnalyze.result", {
      requestId: input.requestId ?? null,
      assistantContainsReordered: assistantContent.includes("Reordered "),
      reviewSuggestionTypes: data.reviewSuggestions.map((suggestion) => `${suggestion.type}:${suggestion.applicationMode}`)
    });
    return {
      assistantMessage: { role: "assistant", content: assistantContent },
      clearInput: true,
      historyEntry: createPlaylistReviewHistoryEntry(assistantContent, data, input.userMessage),
      review: data
    };
  } catch (error) {
    return workflowErrorResult(input.userMessage || "Review playlist", error, "Analysis failed.");
  }
}

export function composeMixedReviewAndCuratorAssistantMessage(
  reviewMessage: string,
  curatorMessage: string
): string {
  const parts = [
    reviewMessage.trim() ? `Review:\n${reviewMessage.trim()}` : null,
    curatorMessage.trim() ? `Curator action:\n${curatorMessage.trim()}` : null
  ].filter(Boolean);
  return parts.join("\n\n");
}

export async function runMixedReviewAndCuratorWorkflow(
  input: {
    messages: ChatMessage[];
    outgoing: string;
    playlist: PlaylistState;
    requestId?: string;
    reviewMode?: ReviewMode;
  },
  dependencies: MixedReviewAndCuratorWorkflowDependencies,
  prompts?: MixedComposerRequestPrompts
): Promise<MixedReviewAndCuratorWorkflowResult> {
  const requestMessages = createRequestMessageList(input.messages, input.outgoing);
  const { reviewPrompt, curatorPrompt } = prompts ?? splitMixedComposerRequest(input.outgoing);
  emitReviewRoutingTrace("workflow.runMixed.start", {
    requestId: input.requestId ?? null,
    outgoing: input.outgoing,
    reviewPrompt,
    curatorPrompt
  });
  const reviewResult = await runAnalyzeWorkflow(
    {
      playlist: input.playlist,
      requestId: input.requestId,
      userMessage: reviewPrompt,
      messages: input.messages,
      reviewMode: input.reviewMode
    },
    { analyze: dependencies.analyze }
  );
  const curatorResult = await runCuratorRequestWorkflow(
    {
      ...input,
      outgoing: curatorPrompt
    },
    {
      onProgress: dependencies.onProgress,
      sendMessage: dependencies.sendMessage,
      signal: dependencies.signal
    }
  );

  const assistantContent = composeMixedReviewAndCuratorAssistantMessage(
    reviewResult.assistantMessage.content,
    curatorResult.assistantMessage.content
  );

  return {
    assistantMessage: { role: "assistant", content: assistantContent },
    clearInput: reviewResult.clearInput || curatorResult.clearInput,
    curatorHistoryEntry: curatorResult.historyEntry,
    messages: createCompletedRequestMessages(requestMessages, assistantContent),
    nextPlaylist: curatorResult.nextPlaylist,
    review: reviewResult.review,
    reviewHistoryEntry: reviewResult.historyEntry
  };
}

function validCompleteOrder(playlist: PlaylistState, orderedTrackIds: string[] | undefined): orderedTrackIds is string[] {
  if (!orderedTrackIds || orderedTrackIds.length !== playlist.tracks.length) {
    return false;
  }
  const currentIds = new Set(playlist.tracks.map((track) => track.id));
  return new Set(orderedTrackIds).size === currentIds.size && orderedTrackIds.every((trackId) => currentIds.has(trackId));
}

export function applyVerifiedReviewSuggestionResponse(
  playlist: PlaylistState,
  suggestion: ReviewSuggestion,
  response: CuratorResponse
): PlaylistState | undefined {
  if (suggestion.applicationMode !== "verify_candidate" || response.playlistUpdate?.action !== "add") {
    return response.playlistUpdate || response.updatedConstraints || response.playlistMeta
      ? applyCuratorResponse(playlist, response)
      : undefined;
  }

  const insertionTrackId = suggestion.affectedTrackIds[0];
  if (!insertionTrackId) {
    return applyCuratorResponse(playlist, response);
  }

  const playlistWithMeta = {
    ...playlist,
    title: response.playlistMeta?.title ?? playlist.title,
    mood: response.playlistMeta?.mood ?? playlist.mood,
    arc: response.playlistMeta?.arc ?? playlist.arc,
    constraints: response.updatedConstraints ?? playlist.constraints
  };
  return insertTracksAfterTrack(playlistWithMeta, insertionTrackId, response.playlistUpdate.tracks);
}

export function applyReviewSuggestionWorkflow(
  playlist: PlaylistState,
  suggestion: ReviewSuggestion
): ClientWorkflowResult {
  if (suggestion.type === "compress_section" && suggestion.applicationMode === "remove_existing") {
    const removeTrackIds = suggestion.compressionPlan?.removeTrackIds?.length
      ? suggestion.compressionPlan.removeTrackIds
      : suggestion.affectedTrackIds;
    const removableIds = removeTrackIds.filter((trackId) => playlist.tracks.some((track) => track.id === trackId));
    if (removableIds.length === 0) {
      return {
        assistantMessage: { role: "assistant", content: "That compression suggestion no longer matches any current playlist tracks." }
      };
    }
    const reducedPlaylist = removeTracksFromPlaylist(playlist, removableIds);
    const nextPlaylist = validSubsetOrder(playlist, suggestion.orderedTrackIds, removableIds)
      ? touchPlaylist({
        ...reducedPlaylist,
        tracks: suggestion.orderedTrackIds.map((trackId) => reducedPlaylist.tracks.find((track) => track.id === trackId)!)
      })
      : reducedPlaylist;
    return {
      assistantMessage: {
        role: "assistant",
        content: validSubsetOrder(playlist, suggestion.orderedTrackIds, removableIds)
          ? `Applied compression: removed ${removableIds.length} track${removableIds.length === 1 ? "" : "s"} and tightened the surviving sequence. Review compressed playlist if you want a fresh second pass.`
          : `Applied compression: removed ${removableIds.length} track${removableIds.length === 1 ? "" : "s"}. Review compressed playlist if you want a fresh second pass.`
      },
      nextPlaylist,
      suppressAssistantMessage: true
    };
  }

  if (suggestion.applicationMode === "remove_existing") {
    const removableIds = suggestion.affectedTrackIds.filter((trackId) => playlist.tracks.some((track) => track.id === trackId));
    if (removableIds.length === 0) {
      return {
        assistantMessage: { role: "assistant", content: "That review suggestion no longer matches any current playlist tracks." }
      };
    }
    return {
      assistantMessage: { role: "assistant", content: `Applied review suggestion: removed ${removableIds.length} track${removableIds.length === 1 ? "" : "s"}.` },
      nextPlaylist: removeTracksFromPlaylist(playlist, removableIds),
      suppressAssistantMessage: true
    };
  }

  if (suggestion.applicationMode === "reorder_existing") {
    if (!validCompleteOrder(playlist, suggestion.orderedTrackIds)) {
      return {
        assistantMessage: { role: "assistant", content: "That reorder suggestion is stale or incomplete, so I left the playlist unchanged." }
      };
    }
    const byId = new Map(playlist.tracks.map((track) => [track.id, track]));
    return {
      assistantMessage: { role: "assistant", content: "Applied review suggestion: reordered the current playlist." },
      nextPlaylist: touchPlaylist({ ...playlist, tracks: suggestion.orderedTrackIds.map((trackId) => byId.get(trackId)!) }),
      suppressAssistantMessage: true
    };
  }

  return {
    assistantMessage: { role: "assistant", content: "This review suggestion needs verification before it can change the playlist." }
  };
}

function reviewSuggestionTrackContext(playlist: PlaylistState, suggestion: ReviewSuggestion): string | null {
  if (suggestion.affectedTrackIds.length === 0) {
    return null;
  }

  const byId = new Map(playlist.tracks.map((track) => [track.id, track]));
  const labels = suggestion.affectedTrackIds
    .map((trackId) => {
      const track = byId.get(trackId);
      return track ? `${track.title} by ${track.artist}` : null;
    })
    .filter((item): item is string => item != null);
  return labels.length > 0 ? labels.join(" -> ") : null;
}

export function promptForReviewSuggestion(suggestion: ReviewSuggestion, playlist: PlaylistState): string {
  const trackContext = reviewSuggestionTrackContext(playlist, suggestion);
  const basePrompt = suggestion.suggestedPrompt?.trim()
    ?? (suggestion.candidate
      ? `Verify and add ${suggestion.candidate.title} by ${suggestion.candidate.artist}${suggestion.candidate.album ? ` from ${suggestion.candidate.album}` : ""}.`
      : `Help apply this review suggestion through verified candidates.`);
  const context = [
    trackContext ? `Transition: ${trackContext}.` : null,
    `Review rationale: ${suggestion.rationale}`,
    `Preserve: ${suggestion.intentPreservation}`,
    suggestion.risk ? `Risk to watch: ${suggestion.risk}` : null
  ].filter(Boolean).join(" ");

  if (suggestion.type === "add_bridge") {
    return [
      `Find one verified bridge track for this transition${trackContext ? `: ${trackContext}` : ""}.`,
      context,
      `Original review instruction: ${basePrompt}`,
      `Discovery radius: ${playlist.discoveryRadius ?? "moderate"}.`
    ].filter(Boolean).join("\n\n");
  }

  if (suggestion.type === "compress_section") {
    return [
      `Review this compressed playlist state after removing ${suggestion.compressionPlan?.removeTrackIds.length ?? suggestion.affectedTrackIds.length} tracks from ${suggestion.sectionLabel ?? "the overbuilt section"}.`,
      context,
      suggestion.compressionPlan?.targetTrackCount != null ? `Target: about ${suggestion.compressionPlan.targetTrackCount} track${suggestion.compressionPlan.targetTrackCount === 1 ? "" : "s"}.` : null,
      suggestion.compressionPlan?.targetTotalDurationMs != null ? `Target: about ${Math.round(suggestion.compressionPlan.targetTotalDurationMs / 60_000)} minutes.` : null
    ].filter(Boolean).join("\n\n");
  }

  if (suggestion.candidate) {
    return [
      basePrompt,
      context,
      `Discovery radius: ${playlist.discoveryRadius ?? "moderate"}.`
    ].filter(Boolean).join("\n\n");
  }
  if (suggestion.applicationMode === "verify_candidate") {
    return [
      basePrompt,
      context,
      `Discovery radius: ${playlist.discoveryRadius ?? "moderate"}.`
    ].filter(Boolean).join("\n\n");
  }
  return [basePrompt, context].filter(Boolean).join("\n\n");
}
