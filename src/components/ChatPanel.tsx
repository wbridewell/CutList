"use client";

import { useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { CommandDrawer, type UtilitySection } from "@/components/chat/CommandDrawer";
import { ActiveExchange } from "@/components/chat/ActiveExchange";
import { NaturalRequestForm } from "@/components/chat/NaturalRequestForm";
import { WelcomeGuide } from "@/components/WelcomeGuide";
import {
  appCommandIds,
  dispatchAppCommand,
  registerAppCommand
} from "@/lib/client/appCommands";
import type { CuratorPersona } from "@/lib/client/llmSetupApi";
import {
  acceptManualMatchWorkflow,
  applyVerifiedReviewSuggestionResponse,
  applyReviewSuggestionWorkflow,
  createRequestMessageList,
  promptForReviewSuggestion,
  runAnalyzeWorkflow,
  runCuratorRequestWorkflow,
  runImportWorkflow,
  runSeedVerificationWorkflow,
  type ClientWorkflowResult
} from "@/lib/client/workflows";
import {
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
import { nowIso, updatePlaylistDiscoveryRadius } from "@/lib/playlist/state";
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
      setActiveReview(result.review);
      setActiveReviewEntryId(result.historyEntry?.id ?? null);
      setAppliedSuggestionIds(new Set());
      setDismissedSuggestionIds(new Set());
      setIgnoredSuggestionIds(new Set());
      setSentSuggestionIds(new Set());
      setReviewUndoPayload(null);
      if (autoOpenIssuesRef.current) {
        setActiveDrawerMode("issues");
      }
    }
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
    setAppliedSuggestionIds(new Set());
    setDismissedSuggestionIds(new Set());
    setIgnoredSuggestionIds(new Set());
    setSentSuggestionIds(new Set());
    setReviewUndoPayload(null);
  }, [activeReview, activeReviewEntryId, history]);

  useEffect(() => {
    return registerAppCommand(appCommandIds.toggleSidebar, () => {
      setActiveDrawerMode((current) => current ? null : "session");
    });
  }, []);

  function acceptMatch(match: AttemptedMatch, context: { entryId: string; issueId: string }) {
    const result = acceptManualMatchWorkflow(playlist, match);
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
    options: { reviewSuggestion?: ReviewSuggestion } = {}
  ) {
    const requestMessages = createRequestMessageList(messages, outgoing);
    onMessagesChange(requestMessages);
    autoOpenIssuesRef.current = true;
    setBusy(true);
    setProgressStatus(startingStatus);
    const controller = new AbortController();
    setActiveController(controller);
    try {
      const result = await runCuratorRequestWorkflow(
        { messages, outgoing, playlist: playlistForComposer },
        { onProgress: setProgressStatus, signal: controller.signal }
      );
      const nextPlaylist = result.data && options.reviewSuggestion
        ? applyVerifiedReviewSuggestionResponse(playlistForComposer, options.reviewSuggestion, result.data)
        : result.nextPlaylist;
      if (nextPlaylist) {
        onPlaylistChange(nextPlaylist);
      }
      onMessagesChange(result.messages);
      if (result.historyEntry) {
        appendHistory(result.historyEntry);
        maybeAutoOpenIssues(result.historyEntry);
      }
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
    const requestMessages = createRequestMessageList(messages, reviewRequestLabel(outgoing));
    onMessagesChange(requestMessages);
    setBusy(true);
    try {
      const result = await runAnalyzeWorkflow({
        playlist: playlistForComposer,
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

  async function sendMessage() {
    if (!userMessage.trim()) {
      return;
    }
    const outgoing = userMessage;
    setUserMessage("");
    await submitCuratorRequest(outgoing, "Starting request.");
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
    const outgoing = reviewRequestLabel(userMessage);
    const requestMessages = createRequestMessageList(messages, outgoing);
    onMessagesChange(requestMessages);
    setBusy(true);
    try {
      const result = await runAnalyzeWorkflow({ playlist: playlistForComposer, userMessage, messages });
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
              <ActiveExchange busy={busy} messages={messages} progressStatus={progressStatus} />
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
