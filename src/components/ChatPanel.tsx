"use client";

import { useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { CommandDrawer, type UtilitySection } from "@/components/chat/CommandDrawer";
import { ActiveExchange } from "@/components/chat/ActiveExchange";
import { NaturalRequestForm } from "@/components/chat/NaturalRequestForm";
import { WelcomeGuide } from "@/components/WelcomeGuide";
import {
  appCommandIds,
  registerAppCommand
} from "@/lib/client/appCommands";
import type { CuratorPersona } from "@/lib/client/llmSetupApi";
import {
  acceptManualMatchWorkflow,
  applyVerifiedReviewSuggestionResponse,
  applyReviewSuggestionWorkflow,
  buildConversationContext,
  createCompletedRequestMessages,
  createRequestMessageList,
  playlistChangedMeaningfully,
  promptForReviewSuggestion,
  reviewPromptForComposerRequest,
  runAnalyzeWorkflow,
  runCuratorRequestWorkflow,
  runMixedReviewAndCuratorWorkflow,
  runImportWorkflow,
  runSeedVerificationWorkflow,
  type ClientWorkflowResult
} from "@/lib/client/workflows";
import { planPlaylistRequest } from "@/lib/client/playlistApi";
import { emitReviewRoutingTrace } from "@/lib/debug/reviewRouting";
import {
  createCuratorUndoHistoryEntry,
  rejectedCandidateSiblingIssueIds,
  updateHistoryIssueStatuses,
  type ChatMessage,
  type RequestHistoryEntry
} from "@/lib/playlist/collaboration";
import type { LocalSessionSummary } from "@/lib/playlist/io/localDraft";
import {
  applyPlaylistOperationUndo,
  createRemoveOperationUndoPayload,
  createSetOperationUndoPayload,
  type PlaylistOperationUndoPayload
} from "@/lib/playlist/operations";
import { parseDiscoveryRadiusOverride } from "@/lib/playlist/discoveryRadius";
import { nowIso, touchPlaylist, updatePlaylistDiscoveryRadius } from "@/lib/playlist/state";
import type { AnalyzePlaylistResponse, AttemptedMatch, PlaylistState, ReviewSuggestion } from "@/types/playlist";

export { createCompletedRequestMessages, createRequestMessageList } from "@/lib/client/workflows";

export function shouldClearStaleReviewState(
  history: RequestHistoryEntry[],
  activeReviewEntryId: string | null,
  activeReview: AnalyzePlaylistResponse | null
): boolean {
  if (!activeReview) {
    return false;
  }
  if (!activeReviewEntryId) {
    return history.length === 0;
  }
  return !history.some((entry) => entry.id === activeReviewEntryId);
}

export function reviewHasIssues(review: AnalyzePlaylistResponse | null): boolean {
  return Boolean(review && review.reviewSuggestions.length > 0);
}

type CuratorTurnUndoState = {
  expectedUpdatedAt: string;
  previousPlaylist: PlaylistState;
  sourceEntryId: string;
};

type ComposerRequestApplyResult = {
  messages: ChatMessage[];
  nextPlaylist?: PlaylistState;
  historyEntries?: Array<RequestHistoryEntry | undefined>;
  review?: AnalyzePlaylistResponse | null;
  reviewEntryId?: string | null;
  curatorUndoEntry?: RequestHistoryEntry | null;
};

export function restoreCuratorTurnUndoState(
  history: RequestHistoryEntry[],
  playlist: PlaylistState
): CuratorTurnUndoState | null {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const entry = history[index];
    if (entry?.kind !== "request" || !entry.playlistBefore || entry.resultingPlaylistUpdatedAt !== playlist.updatedAt) {
      continue;
    }
    return {
      expectedUpdatedAt: playlist.updatedAt,
      previousPlaylist: entry.playlistBefore,
      sourceEntryId: entry.id
    };
  }
  return null;
}

type Props = {
  activeSessionId?: string | null;
  curatorPersona?: CuratorPersona;
  history: RequestHistoryEntry[];
  messages: ChatMessage[];
  mobileActive?: boolean;
  mobileMode?: "ask" | "history";
  onHistoryChange: Dispatch<SetStateAction<RequestHistoryEntry[]>>;
  onMessagesChange: Dispatch<SetStateAction<ChatMessage[]>>;
  playlist: PlaylistState;
  sessions?: LocalSessionSummary[];
  sessionsEnabled?: boolean;
  onDeleteSession?: (id: string) => void;
  onLoadSession?: (id: string) => void;
  onPlaylistChange: (playlist: PlaylistState) => void;
  onReloadWorkspace?: () => Promise<void>;
  onSaveSession?: (name?: string) => void;
  requestedUtilitySection?: UtilitySection | null;
  requestedUtilitySectionToken?: number;
  showWelcomeGuide?: boolean;
};

export function ChatPanel({
  activeSessionId = null,
  curatorPersona = "razor",
  history,
  messages,
  mobileActive = true,
  mobileMode = "ask",
  onHistoryChange,
  onMessagesChange,
  playlist,
  sessions = [],
  sessionsEnabled = true,
  onDeleteSession,
  onLoadSession,
  onPlaylistChange,
  onReloadWorkspace,
  onSaveSession,
  requestedUtilitySection = null,
  requestedUtilitySectionToken = 0,
  showWelcomeGuide = false
}: Props) {
  function reviewRoutingRequestId(): string {
    return typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `cutlist-review-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  const [userMessage, setUserMessage] = useState("");
  const [seedText, setSeedText] = useState("");
  const [importText, setImportText] = useState("");
  const [busy, setBusy] = useState(false);
  const [composerDiscoveryRadius, setComposerDiscoveryRadius] = useState(playlist.discoveryRadius ?? "moderate");
  const [progressStatus, setProgressStatus] = useState<string | null>(null);
  const [activeController, setActiveController] = useState<AbortController | null>(null);
  const [activeDrawerMode, setActiveDrawerMode] = useState<UtilitySection | null>(null);
  const [activeReview, setActiveReview] = useState<AnalyzePlaylistResponse | null>(null);
  const [activeReviewEntryId, setActiveReviewEntryId] = useState<string | null>(null);
  const [appliedSuggestionIds, setAppliedSuggestionIds] = useState<Set<string>>(new Set());
  const [dismissedSuggestionIds, setDismissedSuggestionIds] = useState<Set<string>>(new Set());
  const [ignoredSuggestionIds, setIgnoredSuggestionIds] = useState<Set<string>>(new Set());
  const [sentSuggestionIds, setSentSuggestionIds] = useState<Set<string>>(new Set());
  const [reviewUndoPayload, setReviewUndoPayload] = useState<PlaylistOperationUndoPayload | null>(null);
  const [curatorTurnUndoState, setCuratorTurnUndoState] = useState<CuratorTurnUndoState | null>(null);
  const autoOpenIssuesRef = useRef(true);
  const latestRejectedEntry = [...history].reverse().find((entry) => entry.rejectedCandidates.length > 0) ?? null;
  const discoveryRadiusOverride = parseDiscoveryRadiusOverride(userMessage);
  const playlistForComposer = composerDiscoveryRadius === (playlist.discoveryRadius ?? "moderate")
    ? playlist
    : updatePlaylistDiscoveryRadius(playlist, composerDiscoveryRadius);

  function reviewRequestLabel(outgoing: string): string {
    return outgoing.trim() ? outgoing : "Review requested.";
  }

  function appendMessage(message: ChatMessage) {
    onMessagesChange((currentMessages) => [...currentMessages, message]);
  }

  function appendHistory(entry: RequestHistoryEntry) {
    onHistoryChange((currentHistory) => [...currentHistory, entry]);
  }

  function updateHistoryIssueStatus(
    entryId: string | null,
    issueId: string,
    issueKind: "rejected_candidate" | "review_suggestion",
    status: "accepted" | "dismissed" | "applied" | "requested" | "ignored"
  ) {
    if (!entryId) {
      return;
    }

    onHistoryChange((currentHistory) => currentHistory.map((entry) => (
      entry.id === entryId
        ? {
          ...entry,
          issueStatuses: updateHistoryIssueStatuses(entry.issueStatuses, { issueId, issueKind, status })
        }
        : entry
    )));
  }

  function openUtilitySection(section: UtilitySection, options?: { force?: boolean; manual?: boolean }) {
    if (options?.manual) {
      autoOpenIssuesRef.current = false;
    }

    setActiveDrawerMode((current) => {
      if (options?.force) {
        return section;
      }
      return current === section ? null : section;
    });
  }

  function maybeAutoOpenIssues(entry?: RequestHistoryEntry | null) {
    if (entry?.rejectedCandidates.length && autoOpenIssuesRef.current) {
      setActiveDrawerMode("issues");
    }
  }

  function resetReviewState() {
    setAppliedSuggestionIds(new Set());
    setDismissedSuggestionIds(new Set());
    setIgnoredSuggestionIds(new Set());
    setSentSuggestionIds(new Set());
    setReviewUndoPayload(null);
  }

  function reusePrompt(prompt: string) {
    setUserMessage(prompt);
  }

  function applyReviewState(review: AnalyzePlaylistResponse, reviewEntryId: string | null = null) {
    setActiveReview(review);
    setActiveReviewEntryId(reviewEntryId);
    resetReviewState();
    if (autoOpenIssuesRef.current && reviewHasIssues(review)) {
      setActiveDrawerMode("issues");
    }
  }

  function applyComposerRequestResult(result: ComposerRequestApplyResult) {
    if (result.nextPlaylist) {
      onPlaylistChange(result.nextPlaylist);
    }
    onMessagesChange(result.messages);

    for (const entry of result.historyEntries ?? []) {
      if (!entry) {
        continue;
      }
      appendHistory(entry);
      maybeAutoOpenIssues(entry);
    }

    if (
      result.curatorUndoEntry?.kind === "request" &&
      result.curatorUndoEntry.playlistBefore &&
      result.nextPlaylist &&
      playlistChangedMeaningfully(playlistForComposer, result.nextPlaylist)
    ) {
      setCuratorTurnUndoState({
        expectedUpdatedAt: result.nextPlaylist.updatedAt,
        previousPlaylist: result.curatorUndoEntry.playlistBefore,
        sourceEntryId: result.curatorUndoEntry.id
      });
    }

    if (result.review) {
      applyReviewState(result.review, result.reviewEntryId ?? null);
    }
    emitReviewRoutingTrace("chat.applyComposerRequestResult", {
      assistantContainsReordered: result.messages[result.messages.length - 1]?.content.includes("Reordered ") ?? false,
      hasNextPlaylist: Boolean(result.nextPlaylist),
      historyKinds: (result.historyEntries ?? []).filter(Boolean).map((entry) => entry?.kind ?? null),
      reviewApplied: Boolean(result.review)
    });
  }

  function applyWorkflowResult(result: ClientWorkflowResult | null) {
    if (!result) {
      return;
    }
    if (result.nextPlaylist) {
      onPlaylistChange(result.nextPlaylist);
    }
    if (!result.suppressAssistantMessage) {
      appendMessage(result.assistantMessage);
    }
    if (result.historyEntry) {
      appendHistory(result.historyEntry);
      maybeAutoOpenIssues(result.historyEntry);
    }
    if (result.review) {
      applyReviewState(result.review, result.historyEntry?.id ?? null);
    }
    emitReviewRoutingTrace("chat.applyWorkflowResult", {
      assistantContainsReordered: result.assistantMessage.content.includes("Reordered "),
      hasNextPlaylist: Boolean(result.nextPlaylist),
      historyKind: result.historyEntry?.kind ?? null,
      reviewApplied: Boolean(result.review)
    });
  }

  useEffect(() => {
    if (mobileMode === "history") {
      setActiveDrawerMode("history");
      return;
    }
    setActiveDrawerMode((current) => current === "history" ? null : current);
  }, [mobileMode]);

  useEffect(() => {
    setComposerDiscoveryRadius(playlist.discoveryRadius ?? "moderate");
  }, [playlist.discoveryRadius]);

  useEffect(() => {
    if (requestedUtilitySection && requestedUtilitySectionToken > 0) {
      setActiveDrawerMode((current) => current === requestedUtilitySection ? null : requestedUtilitySection);
    }
  }, [requestedUtilitySection, requestedUtilitySectionToken]);

  useEffect(() => {
    if (!shouldClearStaleReviewState(history, activeReviewEntryId, activeReview)) {
      return;
    }

    setActiveReview(null);
    setActiveReviewEntryId(null);
    resetReviewState();
  }, [activeReview, activeReviewEntryId, history]);

  useEffect(() => {
    if (!curatorTurnUndoState) {
      const restored = restoreCuratorTurnUndoState(history, playlist);
      if (restored) {
        setCuratorTurnUndoState(restored);
      }
      return;
    }
    if (!history.some((entry) => entry.id === curatorTurnUndoState.sourceEntryId)) {
      setCuratorTurnUndoState(null);
      return;
    }
    if (playlist.updatedAt !== curatorTurnUndoState.expectedUpdatedAt) {
      setCuratorTurnUndoState(null);
    }
  }, [curatorTurnUndoState, history, playlist]);

  useEffect(() => {
    return registerAppCommand(appCommandIds.toggleSidebar, () => {
      setActiveDrawerMode((current) => current ? null : "session");
    });
  }, []);

  function acceptMatch(match: AttemptedMatch, context: { entryId: string; issueId: string }) {
    const historyEntry = history.find((entry) => entry.id === context.entryId) ?? null;
    const result = acceptManualMatchWorkflow(playlist, match, { historyEntry });
    if (result.historyEntry) {
      onHistoryChange((currentHistory) => currentHistory.map((entry) => {
        if (entry.id !== context.entryId) {
          return entry;
        }

        const siblingIssueIds = new Set(rejectedCandidateSiblingIssueIds(entry, match));
        siblingIssueIds.add(context.issueId);
        return {
          ...entry,
          issueStatuses: [...siblingIssueIds].reduce(
            (issueStatuses, issueId) => updateHistoryIssueStatuses(issueStatuses, {
              issueId,
              issueKind: "rejected_candidate",
              status: "accepted"
            }),
            entry.issueStatuses
          )
        };
      }));
    }
    applyWorkflowResult(result);
  }

  function dismissRejectedCandidate(context: { entryId: string; issueId: string }) {
    updateHistoryIssueStatus(context.entryId, context.issueId, "rejected_candidate", "dismissed");
  }

  function applyReviewSuggestion(suggestion: ReviewSuggestion) {
    if (suggestion.type === "compress_section") {
      setReviewUndoPayload(createSetOperationUndoPayload(playlist, { qualifier: "compressed" }));
    } else if (suggestion.applicationMode === "remove_existing") {
      const payload = createRemoveOperationUndoPayload(playlist, suggestion.affectedTrackIds, { qualifier: "reviewed" });
      setReviewUndoPayload(payload);
    } else {
      setReviewUndoPayload(null);
    }
    applyWorkflowResult(applyReviewSuggestionWorkflow(playlist, suggestion));
    setAppliedSuggestionIds((current) => new Set([...current, suggestion.id]));
    setDismissedSuggestionIds((current) => {
      const next = new Set(current);
      next.delete(suggestion.id);
      return next;
    });
    setIgnoredSuggestionIds((current) => {
      const next = new Set(current);
      next.delete(suggestion.id);
      return next;
    });
    setSentSuggestionIds((current) => {
      const next = new Set(current);
      next.delete(suggestion.id);
      return next;
    });
    updateHistoryIssueStatus(activeReviewEntryId, suggestion.id, "review_suggestion", "applied");
  }

  function ignoreReviewSuggestion(suggestionId: string) {
    setIgnoredSuggestionIds((current) => new Set([...current, suggestionId]));
    setAppliedSuggestionIds((current) => {
      const next = new Set(current);
      next.delete(suggestionId);
      return next;
    });
    setDismissedSuggestionIds((current) => {
      const next = new Set(current);
      next.delete(suggestionId);
      return next;
    });
    setSentSuggestionIds((current) => {
      const next = new Set(current);
      next.delete(suggestionId);
      return next;
    });
    updateHistoryIssueStatus(activeReviewEntryId, suggestionId, "review_suggestion", "ignored");
  }

  function dismissReviewSuggestion(suggestionId: string) {
    setDismissedSuggestionIds((current) => new Set([...current, suggestionId]));
    setAppliedSuggestionIds((current) => {
      const next = new Set(current);
      next.delete(suggestionId);
      return next;
    });
    setIgnoredSuggestionIds((current) => {
      const next = new Set(current);
      next.delete(suggestionId);
      return next;
    });
    setSentSuggestionIds((current) => {
      const next = new Set(current);
      next.delete(suggestionId);
      return next;
    });
    updateHistoryIssueStatus(activeReviewEntryId, suggestionId, "review_suggestion", "dismissed");
  }

  async function submitCuratorRequest(
    outgoing: string,
    startingStatus: string,
    options: { requestId?: string; reviewSuggestion?: ReviewSuggestion } = {}
  ) {
    const requestId = options.requestId ?? reviewRoutingRequestId();
    const requestMessages = createRequestMessageList(messages, outgoing);
    onMessagesChange(requestMessages);
    emitReviewRoutingTrace("chat.submitCuratorRequest", {
      requestId,
      outgoing
    });
    autoOpenIssuesRef.current = true;
    setBusy(true);
    setProgressStatus(startingStatus);
    const controller = new AbortController();
    setActiveController(controller);
    try {
      const result = await runCuratorRequestWorkflow(
        { messages, outgoing, playlist: playlistForComposer, requestId },
        { onProgress: setProgressStatus, signal: controller.signal }
      );
      const nextPlaylist = result.data && options.reviewSuggestion
        ? applyVerifiedReviewSuggestionResponse(playlistForComposer, options.reviewSuggestion, result.data)
        : result.nextPlaylist;
      const changed = nextPlaylist ? playlistChangedMeaningfully(playlistForComposer, nextPlaylist) : false;
      const historyEntry = options.reviewSuggestion && result.historyEntry && nextPlaylist && changed
        ? {
          ...result.historyEntry,
          playlistBefore: playlistForComposer,
          resultingPlaylistUpdatedAt: nextPlaylist.updatedAt
        }
        : result.historyEntry;
      applyComposerRequestResult({
        messages: createCompletedRequestMessages(requestMessages, result.assistantMessage.content),
        nextPlaylist,
        historyEntries: [historyEntry],
        curatorUndoEntry: historyEntry
      });
    } finally {
      setBusy(false);
      setProgressStatus(null);
      setActiveController(null);
    }
  }

  async function verifyReviewSuggestion(suggestion: ReviewSuggestion) {
    setSentSuggestionIds((current) => new Set([...current, suggestion.id]));
    setDismissedSuggestionIds((current) => {
      const next = new Set(current);
      next.delete(suggestion.id);
      return next;
    });
    setIgnoredSuggestionIds((current) => {
      const next = new Set(current);
      next.delete(suggestion.id);
      return next;
    });
    setReviewUndoPayload(null);
    updateHistoryIssueStatus(activeReviewEntryId, suggestion.id, "review_suggestion", "requested");
    await submitCuratorRequest(promptForReviewSuggestion(suggestion, playlistForComposer), "Starting verification.", { reviewSuggestion: suggestion });
  }

  async function reviewCompressedPlaylist(suggestion: ReviewSuggestion) {
    autoOpenIssuesRef.current = true;
    const outgoing = promptForReviewSuggestion(suggestion, playlistForComposer);
    const requestId = reviewRoutingRequestId();
    const requestMessages = createRequestMessageList(messages, reviewRequestLabel(outgoing));
    onMessagesChange(requestMessages);
    emitReviewRoutingTrace("chat.reviewCompressedPlaylist", {
      requestId,
      outgoing
    });
    setBusy(true);
    try {
      const result = await runAnalyzeWorkflow({
        playlist: playlistForComposer,
        requestId,
        userMessage: outgoing,
        messages
      });
      applyWorkflowResult(result);
    } finally {
      setBusy(false);
    }
  }

  function undoReviewRemoval() {
    if (!reviewUndoPayload) {
      return;
    }
    onPlaylistChange(applyPlaylistOperationUndo(playlist, reviewUndoPayload, nowIso()));
    setReviewUndoPayload(null);
  }

  function undoLastCuratorTurn() {
    if (!curatorTurnUndoState) {
      return;
    }
    const assistantMessage = "Undid the last curator turn. Restored the previous playlist state.";
    onPlaylistChange(touchPlaylist(curatorTurnUndoState.previousPlaylist, nowIso()));
    setCuratorTurnUndoState(null);
    appendMessage({ role: "assistant", content: assistantMessage });
    appendHistory(createCuratorUndoHistoryEntry(assistantMessage));
  }

  async function sendMessage() {
    if (!userMessage.trim()) {
      return;
    }
    const outgoing = userMessage;
    const requestId = reviewRoutingRequestId();
    let shouldClearUserMessage = false;
    setBusy(true);
    try {
      const requestPlan = await planPlaylistRequest(
        playlistForComposer,
        outgoing,
        buildConversationContext(messages),
        requestId
      );
      emitReviewRoutingTrace("chat.sendMessage.route", {
        requestId,
        outgoing,
        requestKind: requestPlan.operationPlan.kind,
        routeFamily: requestPlan.routeFamily,
        executionPolicy: requestPlan.executionPolicy
      });

      if (requestPlan.routeFamily === "review" && requestPlan.executionPolicy === "read_only") {
        autoOpenIssuesRef.current = true;
        const reviewPrompt = requestPlan.operationPlan.reviewPrompt ?? reviewPromptForComposerRequest(outgoing);
        const requestMessages = createRequestMessageList(messages, reviewRequestLabel(reviewPrompt));
        onMessagesChange(requestMessages);
        shouldClearUserMessage = true;
        const result = await runAnalyzeWorkflow({
          playlist: playlistForComposer,
          requestId,
          userMessage: reviewPrompt,
          messages,
          reviewMode: requestPlan.reviewMode ?? undefined
        });
        applyWorkflowResult(result);
        return;
      }

      if (requestPlan.routeFamily === "import") {
        autoOpenIssuesRef.current = true;
        const requestMessages = createRequestMessageList(messages, outgoing);
        onMessagesChange(requestMessages);
        shouldClearUserMessage = true;
        const result = await runImportWorkflow({ playlist, importText: outgoing });
        applyWorkflowResult(result);
        return;
      }

      if (requestPlan.operationPlan.kind === "mixed_review_and_curator") {
        autoOpenIssuesRef.current = true;
        const requestMessages = createRequestMessageList(messages, outgoing);
        onMessagesChange(requestMessages);
        shouldClearUserMessage = true;
        setProgressStatus("Starting mixed review and curator request.");
        const controller = new AbortController();
        setActiveController(controller);
        try {
          const result = await runMixedReviewAndCuratorWorkflow(
            { messages, outgoing, playlist: playlistForComposer, requestId, reviewMode: requestPlan.reviewMode ?? undefined },
            { analyze: undefined, onProgress: setProgressStatus, signal: controller.signal, sendMessage: undefined },
            {
              reviewPrompt: requestPlan.operationPlan.reviewPrompt ?? reviewPromptForComposerRequest(outgoing),
              curatorPrompt: requestPlan.operationPlan.curatorPrompt ?? outgoing
            }
          );
          applyComposerRequestResult({
            messages: createCompletedRequestMessages(requestMessages, result.assistantMessage.content),
            nextPlaylist: result.nextPlaylist,
            historyEntries: [result.reviewHistoryEntry, result.curatorHistoryEntry],
            review: result.review,
            reviewEntryId: result.reviewHistoryEntry?.id ?? null,
            curatorUndoEntry: result.curatorHistoryEntry
          });
        } finally {
          setProgressStatus(null);
          setActiveController(null);
        }
        return;
      }

      shouldClearUserMessage = true;
      await submitCuratorRequest(outgoing, "Starting request.", { requestId });
    } finally {
      setBusy(false);
      if (shouldClearUserMessage) {
        setUserMessage("");
      }
    }
  }

  function interruptRequest() {
    activeController?.abort();
    setProgressStatus("Interrupting request.");
  }

  async function verifySeeds() {
    autoOpenIssuesRef.current = true;
    setBusy(true);
    try {
      const result = await runSeedVerificationWorkflow({ playlist, seedText });
      applyWorkflowResult(result);
      if (result.clearInput) {
        setSeedText("");
      }
    } finally {
      setBusy(false);
    }
  }

  async function importChat() {
    if (!importText.trim()) {
      return;
    }
    autoOpenIssuesRef.current = true;
    setBusy(true);
    try {
      const result = await runImportWorkflow({ playlist, importText });
      applyWorkflowResult(result);
      if (result?.clearInput) {
        setImportText("");
      }
    } finally {
      setBusy(false);
    }
  }

  async function analyze() {
    autoOpenIssuesRef.current = true;
    const outgoing = reviewPromptForComposerRequest(userMessage);
    const requestId = reviewRoutingRequestId();
    const requestMessages = createRequestMessageList(messages, outgoing);
    onMessagesChange(requestMessages);
    emitReviewRoutingTrace("chat.analyzeButton", {
      requestId,
      outgoing
    });
    setBusy(true);
    try {
      const requestPlan = await planPlaylistRequest(
        playlistForComposer,
        outgoing,
        buildConversationContext(messages),
        requestId,
        true
      );
      const result = await runAnalyzeWorkflow({
        playlist: playlistForComposer,
        requestId,
        userMessage: requestPlan.operationPlan.reviewPrompt ?? outgoing,
        messages,
        reviewMode: requestPlan.reviewMode ?? undefined
      });
      applyWorkflowResult(result);
      if (result.clearInput) {
        setUserMessage("");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel chat-panel" data-mobile-active={mobileActive}>
      <div className="curator-workbench" data-drawer-open={activeDrawerMode ? "true" : "false"} data-mobile-mode={mobileMode}>
        <div className="chat-primary-region curator-main">
          <div className="curator-stack">
            {showWelcomeGuide ? <WelcomeGuide /> : null}
            <NaturalRequestForm
              busy={busy}
              curatorPersona={curatorPersona}
              discoveryRadius={composerDiscoveryRadius}
              discoveryRadiusOverride={discoveryRadiusOverride}
              playlistHasTracks={playlist.tracks.length > 0}
              progressStatus={progressStatus}
              userMessage={userMessage}
              onDiscoveryRadiusChange={(value) => {
                setComposerDiscoveryRadius(value);
                onPlaylistChange(updatePlaylistDiscoveryRadius(playlist, value));
              }}
              onAnalyze={() => void analyze()}
              onInterrupt={interruptRequest}
              onSend={() => void sendMessage()}
              onUserMessageChange={setUserMessage}
            />
            <div className="latest-response-region">
              <ActiveExchange
                busy={busy}
                curatorUndoDescription={curatorTurnUndoState ? "Restore the playlist state from before the most recent curator-applied turn." : null}
                messages={messages}
                onReusePrompt={reusePrompt}
                onUndoCuratorTurn={curatorTurnUndoState ? undoLastCuratorTurn : undefined}
                progressStatus={progressStatus}
              />
            </div>
          </div>
        </div>
        <CommandDrawer
          activeSessionId={activeSessionId}
          activeMode={activeDrawerMode}
          appliedSuggestionIds={appliedSuggestionIds}
          busy={busy}
          dismissedSuggestionIds={dismissedSuggestionIds}
          history={history}
          ignoredSuggestionIds={ignoredSuggestionIds}
          importText={importText}
          onApplySuggestion={applyReviewSuggestion}
          onDismissRejectedCandidate={dismissRejectedCandidate}
          onDismissSuggestion={dismissReviewSuggestion}
          playlist={playlist}
          rejectedEntry={latestRejectedEntry}
          review={activeReview}
          reviewUndoPayload={reviewUndoPayload}
          seedText={seedText}
          sentSuggestionIds={sentSuggestionIds}
          sessions={sessions}
          sessionsEnabled={sessionsEnabled}
          onAcceptMatch={acceptMatch}
          onDeleteSession={onDeleteSession}
          onIgnoreSuggestion={ignoreReviewSuggestion}
          onImportChat={() => void importChat()}
          onImportTextChange={setImportText}
          onLoadSession={onLoadSession}
          onModeChange={(mode) => {
            if (mode) {
              openUtilitySection(mode, { manual: true });
              return;
            }
            setActiveDrawerMode(null);
            autoOpenIssuesRef.current = false;
          }}
          onReloadWorkspace={onReloadWorkspace}
          onReusePrompt={reusePrompt}
          onReviewCompression={(suggestion) => void reviewCompressedPlaylist(suggestion)}
          onSaveSession={onSaveSession}
          onSeedTextChange={setSeedText}
          onUndoReviewRemoval={undoReviewRemoval}
          onVerifySeeds={() => void verifySeeds()}
          onVerifySuggestion={(suggestion) => void verifyReviewSuggestion(suggestion)}
        />
      </div>
    </section>
  );
}
