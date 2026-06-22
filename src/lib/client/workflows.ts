import {
  analyzePlaylist,
  importDraftOrChat,
  sendPlaylistMessageStream,
  verifySeedTracks,
  type VerifySeedsResponse
} from "@/lib/client/playlistApi";
import { parseDiscoveryRadiusOverride } from "@/lib/playlist/discoveryRadius";
import {
  createErrorHistoryEntry,
  createImportHistoryEntry,
  createManualMatchHistoryEntry,
  createPlaylistReviewHistoryEntry,
  createRequestHistoryEntry,
  createSeedVerificationHistoryEntry,
  rejectedCandidateSummary,
  reorderSummaryForMessage,
  trackFromAttemptedMatch,
  type ChatMessage,
  type RequestHistoryEntry
} from "@/lib/playlist/collaboration";
import { addTracksToPlaylist, applyCuratorResponse, insertTracksAfterTrack, isDuplicateTrack, removeTracksFromPlaylist, touchPlaylist } from "@/lib/playlist/state";
import { parseTrackRowsFromText, type ParsedTrackLine } from "@/lib/playlist/io/textImport";
import type {
  AnalyzePlaylistResponse,
  AttemptedMatch,
  ConversationContext,
  CuratorResponse,
  DiscoveryRadius,
  ImportChatResponse,
  PlaylistState,
  ReviewSuggestion
} from "@/types/playlist";

export type ClientWorkflowResult = {
  assistantMessage: ChatMessage;
  clearInput?: boolean;
  historyEntry?: RequestHistoryEntry;
  nextPlaylist?: PlaylistState;
  review?: AnalyzePlaylistResponse;
  suppressAssistantMessage?: boolean;
};

export type CuratorRequestWorkflowResult = ClientWorkflowResult & {
  data?: CuratorResponse;
  messages: ChatMessage[];
};

type CuratorRequestDependencies = {
  onProgress: (message: string) => void;
  sendMessage?: typeof sendPlaylistMessageStream;
  signal?: AbortSignal;
};

const maxConversationContextMessages = 8;
const maxConversationContextContentLength = 1200;

type SeedVerificationDependencies = {
  verifySeeds?: (tracks: ParsedTrackLine[]) => Promise<VerifySeedsResponse>;
};

type ImportWorkflowDependencies = {
  importText?: typeof importDraftOrChat;
};

type AnalyzeWorkflowDependencies = {
  analyze?: typeof analyzePlaylist;
};

export function effectiveDiscoveryRadiusForRequest(
  playlist: PlaylistState,
  userMessage: string
): DiscoveryRadius {
  return parseDiscoveryRadiusOverride(userMessage) ?? playlist.discoveryRadius ?? "moderate";
}

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

export function createRequestMessageList(messages: ChatMessage[], outgoing: string): ChatMessage[] {
  return [...messages, { role: "user", content: outgoing }];
}

export function createCompletedRequestMessages(requestMessages: ChatMessage[], assistantMessage: string): ChatMessage[] {
  return [...requestMessages, { role: "assistant", content: assistantMessage }];
}

export function playlistChangedMeaningfully(before: PlaylistState, after: PlaylistState): boolean {
  const { updatedAt: _beforeUpdatedAt, ...beforeComparable } = before;
  const { updatedAt: _afterUpdatedAt, ...afterComparable } = after;
  return JSON.stringify(beforeComparable) !== JSON.stringify(afterComparable);
}

export function buildConversationContext(messages: ChatMessage[]): ConversationContext | undefined {
  const recentMessages = messages
    .map((message) => ({
      role: message.role,
      content: message.content.trim().slice(0, maxConversationContextContentLength)
    }))
    .filter((message) => message.content.length > 0)
    .slice(-maxConversationContextMessages);

  return recentMessages.length > 0 ? { recentMessages } : undefined;
}

export function errorMessageForWorkflow(error: unknown, fallbackMessage: string): string {
  const message = error instanceof Error
    ? error.message
    : typeof error === "string"
      ? error
      : "";

  if (typeof error === "string") {
    return error;
  }
  if (error instanceof Error && error.name === "AbortError") {
    return "Stopped.";
  }
  if (/GEMINI_API_KEY|OPENAI_API_KEY|LLM provider is disabled|Gemini is not configured|OpenAI is unavailable|local LLM provider is unavailable/i.test(message)) {
    return "LLM setup is incomplete or unavailable. Open LLM setup in the top-right, choose a provider, save it, and run Save and test. Your playlist is unchanged.";
  }
  if (/timed out|timeout/i.test(message)) {
    return "The model took too long to respond. Your playlist is unchanged. Try again or raise the timeout in LLM setup.";
  }
  if (/Could not recover a single valid JSON object or array|Model returned an empty JSON response|returned an empty response|thinking output without a JSON response/i.test(message)) {
    return "The model returned something CutList could not safely use. Your playlist is unchanged. Try again.";
  }
  if (/fetch failed|network|ECONNREFUSED|ENOTFOUND|Failed to fetch|request failed|unavailable/i.test(message)) {
    return "CutList could not reach the provider. Check your internet connection or local Ollama server, then try again. Your playlist is unchanged.";
  }
  if (error instanceof Error && message.trim()) {
    return message;
  }
  return `${fallbackMessage} Your playlist is unchanged.`;
}

function workflowErrorResult(
  action: string,
  error: unknown,
  fallbackMessage: string
): Pick<ClientWorkflowResult, "assistantMessage" | "historyEntry"> {
  let assistantContent = errorMessageForWorkflow(error, fallbackMessage);
  const debugTimingEnabled = process.env.NODE_ENV === "development" && process.env.CUTLIST_DEBUG_TIMING === "1";
  if (debugTimingEnabled) {
    const details = [
      `type=${typeof error}`,
      `is_error=${String(error instanceof Error)}`,
      `name=${error instanceof Error ? error.name : "n/a"}`,
      `message=${JSON.stringify(error instanceof Error ? error.message : assistantContent)}`,
      `fallback_used=${String(assistantContent === fallbackMessage)}`
    ].join(" ");
    console.error(`[cutlist:timing] workflow_error_result ${details}`);
    if (assistantContent === fallbackMessage) {
      assistantContent = `${fallbackMessage}\n[debug ${details}]`;
    }
  }
  return {
    assistantMessage: { role: "assistant", content: assistantContent },
    historyEntry: createErrorHistoryEntry(action, assistantContent)
  };
}

export function composeCuratorAssistantMessage(response: CuratorResponse, playlistBefore: PlaylistState): string {
  return [
    response.message,
    reorderSummaryForMessage(response, playlistBefore),
    rejectedCandidateSummary(response.rejectedCandidates)
  ].filter(Boolean).join("\n\n");
}

export async function runCuratorRequestWorkflow(
  input: {
    messages: ChatMessage[];
    outgoing: string;
    playlist: PlaylistState;
  },
  dependencies: CuratorRequestDependencies
): Promise<CuratorRequestWorkflowResult> {
  const requestMessages = createRequestMessageList(input.messages, input.outgoing);

  try {
    const sendMessage = dependencies.sendMessage ?? sendPlaylistMessageStream;
    const data = await sendMessage(
      {
        playlist: input.playlist,
        userMessage: input.outgoing,
        conversationContext: buildConversationContext(input.messages)
      },
      { onProgress: dependencies.onProgress, signal: dependencies.signal }
    );
    const nextPlaylist = data.playlistUpdate || data.updatedConstraints || data.playlistMeta
      ? applyCuratorResponse(input.playlist, data)
      : undefined;
    const assistantContent = composeCuratorAssistantMessage(data, input.playlist);
    const historyEntry = createRequestHistoryEntry(
      input.outgoing,
      data.message,
      data,
      nextPlaylist && playlistChangedMeaningfully(input.playlist, nextPlaylist)
        ? { playlistBefore: input.playlist, resultingPlaylistUpdatedAt: nextPlaylist.updatedAt }
        : {}
    );
    return {
      assistantMessage: { role: "assistant", content: assistantContent },
      data,
      historyEntry,
      messages: createCompletedRequestMessages(requestMessages, assistantContent),
      nextPlaylist
    };
  } catch (error) {
    const failure = workflowErrorResult(input.outgoing, error, "Something went wrong.");
    return {
      ...failure,
      messages: createCompletedRequestMessages(requestMessages, failure.assistantMessage.content)
    };
  }
}

export async function runSeedVerificationWorkflow(
  input: {
    playlist: PlaylistState;
    seedText: string;
  },
  dependencies: SeedVerificationDependencies = {}
): Promise<ClientWorkflowResult> {
  const tracks = parseTrackRowsFromText(input.seedText);
  if (tracks.length === 0) {
    return {
      assistantMessage: {
        role: "assistant",
        content: "I could not read any seed tracks. Use one track per line as Artist - Title, Title / Artist / Album separated by tabs, or Title, Artist, Album."
      }
    };
  }

  try {
    const verifySeeds = dependencies.verifySeeds ?? verifySeedTracks;
    const data = await verifySeeds(tracks);
    return {
      assistantMessage: {
        role: "assistant",
        content: `Verified ${data.verified.length} seed track${data.verified.length === 1 ? "" : "s"}. ${data.rejected.length ? `${data.rejected.length} could not be accepted.` : ""}`
      },
      clearInput: true,
      historyEntry: createSeedVerificationHistoryEntry(data.verified.length, data.rejected),
      nextPlaylist: addTracksToPlaylist(input.playlist, data.verified)
    };
  } catch (error) {
    return workflowErrorResult("Verify seed tracks", error, "Seed verification failed.");
  }
}

export async function runImportWorkflow(
  input: {
    importText: string;
    playlist: PlaylistState;
  },
  dependencies: ImportWorkflowDependencies = {}
): Promise<ClientWorkflowResult | null> {
  if (!input.importText.trim()) {
    return null;
  }

  try {
    const importText = dependencies.importText ?? importDraftOrChat;
    const data: ImportChatResponse = await importText(input.importText);
    return {
      assistantMessage: {
        role: "assistant",
        content: [
          data.extractedVibeBrief ? `Vibe brief: ${data.extractedVibeBrief}` : null,
          `Imported ${data.verifiedTracks.length} verified track${data.verifiedTracks.length === 1 ? "" : "s"} and rejected ${data.rejectedCandidates.length}.`,
          data.suggestedNextPrompt ? `Next: ${data.suggestedNextPrompt}` : null
        ].filter(Boolean).join("\n")
      },
      clearInput: true,
      historyEntry: createImportHistoryEntry(data.verifiedTracks.length, data.rejectedCandidates, data.extractedVibeBrief),
      nextPlaylist: {
        ...input.playlist,
        mood: data.extractedVibeBrief ?? input.playlist.mood,
        constraints: data.extractedConstraints,
        tracks: [...input.playlist.tracks, ...data.verifiedTracks],
        updatedAt: new Date().toISOString()
      }
    };
  } catch (error) {
    return workflowErrorResult("Import and verify", error, "Import failed.");
  }
}

export function shouldWarnAboutUnverifiedPastedTracks(userMessage: string, playlist: PlaylistState): boolean {
  return (
    userMessage.trim().length > 0 &&
    parseTrackRowsFromText(userMessage, { allowHeaderlessCommaRows: false }).length > 0 &&
    playlist.tracks.length === 0
  );
}

export function composeAnalyzeAssistantMessage(data: AnalyzePlaylistResponse): string {
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
    ? `Transitions:\n${data.transitionReview.slice(0, 5).map((item) => `- ${item.issueType}: ${item.summary} (${basisLabel(item.basis)})`).join("\n")}`
    : null;
  const suggestionText = data.reviewSuggestions.length
    ? `Suggested edits:\n${data.reviewSuggestions.slice(0, 5).map((item) => `- ${item.type}: ${item.rationale} (${basisLabel(item.basis)})`).join("\n")}`
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
    userMessage: string;
    messages?: ChatMessage[];
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
    const analyze = dependencies.analyze ?? analyzePlaylist;
    const data = await analyze(
      input.playlist,
      input.userMessage || undefined,
      buildConversationContext(input.messages ?? [])
    );
    const assistantContent = composeAnalyzeAssistantMessage(data);
    return {
      assistantMessage: { role: "assistant", content: assistantContent },
      clearInput: true,
      historyEntry: createPlaylistReviewHistoryEntry(assistantContent, data),
      review: data
    };
  } catch (error) {
    return workflowErrorResult("Review playlist", error, "Analysis failed.");
  }
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

export function acceptManualMatchWorkflow(
  playlist: PlaylistState,
  match: AttemptedMatch
): ClientWorkflowResult {
  const track = trackFromAttemptedMatch(match);
  if (!track) {
    return {
      assistantMessage: { role: "assistant", content: "That match is missing a provider id, so I cannot safely add it." }
    };
  }

  if (isDuplicateTrack(playlist, track)) {
    return {
      assistantMessage: { role: "assistant", content: `${track.artist} - ${track.title} is already in the playlist.` }
    };
  }

  return {
    assistantMessage: {
      role: "assistant",
      content: `${match.isRecommended ? "Added recommended match" : "Added manually reviewed match"}: ${track.artist} - ${track.title}.`
    },
    historyEntry: createManualMatchHistoryEntry(track, { recommended: match.isRecommended }),
    nextPlaylist: addTracksToPlaylist(playlist, [track]),
    suppressAssistantMessage: true
  };
}
