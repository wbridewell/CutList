"use client";

import { useState } from "react";
import { HistorySection, InputsSection, IssuesSection, SessionSection } from "@/components/chat/CommandDrawerSections";
import { buildIssueInboxItems } from "@/components/chat/issueInboxState";
import { evaluatePlaylistConstraints } from "@/lib/playlist/constraints";
import { type RequestHistoryEntry } from "@/lib/playlist/collaboration";
import type { LocalSessionSummary } from "@/lib/playlist/io/localDraft";
import type { PlaylistOperationUndoPayload } from "@/lib/playlist/operations";
import type { AnalyzePlaylistResponse, AttemptedMatch, PlaylistState, ReviewSuggestion } from "@/types/playlist";

export type UtilitySection = "session" | "issues" | "inputs" | "history";

type Props = {
  activeMode: UtilitySection | null;
  activeSessionId?: string | null;
  appliedSuggestionIds?: Set<string>;
  busy: boolean;
  dismissedSuggestionIds?: Set<string>;
  history: RequestHistoryEntry[];
  ignoredSuggestionIds?: Set<string>;
  importText: string;
  onAcceptMatch: (match: AttemptedMatch, context: { entryId: string; issueId: string }) => void;
  onApplySuggestion?: (suggestion: ReviewSuggestion) => void;
  onDeleteSession?: (id: string) => void;
  onDismissRejectedCandidate?: (context: { entryId: string; issueId: string }) => void;
  onDismissSuggestion?: (suggestionId: string) => void;
  onIgnoreSuggestion?: (suggestionId: string) => void;
  onImportChat: () => void;
  onImportTextChange: (value: string) => void;
  onLoadSession?: (id: string) => void;
  onModeChange: (mode: UtilitySection | null) => void;
  onReloadWorkspace?: () => Promise<void>;
  onReusePrompt?: (prompt: string) => void;
  onReviewCompression?: (suggestion: ReviewSuggestion) => void;
  onSaveSession?: (name?: string) => void;
  onSeedTextChange: (value: string) => void;
  onUndoReviewRemoval?: () => void;
  onVerifySeeds: () => void;
  onVerifySuggestion?: (suggestion: ReviewSuggestion) => void;
  playlist: PlaylistState;
  rejectedEntry?: RequestHistoryEntry | null;
  review?: AnalyzePlaylistResponse | null;
  reviewUndoPayload?: PlaylistOperationUndoPayload | null;
  seedText: string;
  sentSuggestionIds?: Set<string>;
  sessions?: LocalSessionSummary[];
  sessionsEnabled?: boolean;
};

function activeSessionLabel(sessions: LocalSessionSummary[], activeSessionId: string | null): string {
  return sessions.find((session) => session.id === activeSessionId)?.name ?? "Local draft";
}

function getUtilityTabs({
  activeSessionId,
  history,
  issuesCount,
  sessions
}: {
  activeSessionId: string | null;
  history: RequestHistoryEntry[];
  issuesCount: number;
  sessions: LocalSessionSummary[];
}): Array<{ mode: UtilitySection; label: string; meta: string }> {
  return [
    {
      mode: "session",
      label: "Session",
      meta: activeSessionLabel(sessions, activeSessionId)
    },
    {
      mode: "issues",
      label: "Issues",
      meta: `${issuesCount} active`
    },
    {
      mode: "inputs",
      label: "Import",
      meta: "Drafts and seeds"
    },
    {
      mode: "history",
      label: "History",
      meta: `${history.length} event${history.length === 1 ? "" : "s"}`
    }
  ];
}

export function CommandDrawer({
  activeMode,
  activeSessionId = null,
  appliedSuggestionIds = new Set(),
  busy,
  dismissedSuggestionIds = new Set(),
  history,
  ignoredSuggestionIds = new Set(),
  importText,
  onAcceptMatch,
  onApplySuggestion,
  onDeleteSession,
  onDismissRejectedCandidate,
  onDismissSuggestion,
  onIgnoreSuggestion,
  onImportChat,
  onImportTextChange,
  onLoadSession,
  onModeChange,
  onReloadWorkspace,
  onReusePrompt,
  onReviewCompression,
  onSaveSession,
  onSeedTextChange,
  onUndoReviewRemoval,
  onVerifySeeds,
  onVerifySuggestion,
  playlist,
  rejectedEntry = null,
  review = null,
  reviewUndoPayload = null,
  seedText,
  sentSuggestionIds = new Set(),
  sessions = [],
  sessionsEnabled = true
}: Props) {
  const [sessionName, setSessionName] = useState("");
  const constraintReport = evaluatePlaylistConstraints(playlist.tracks, playlist.constraints);
  const inboxItems = buildIssueInboxItems({
    appliedSuggestionIds,
    constraintReport,
    dismissedSuggestionIds,
    ignoredSuggestionIds,
    playlist,
    rejectedEntry,
    review,
    sentSuggestionIds
  });
  const issuesCount = inboxItems.length;
  const drawerModes = getUtilityTabs({ activeSessionId, history, issuesCount, sessions });

  function toggleMode(mode: UtilitySection) {
    onModeChange(activeMode === mode ? null : mode);
  }

  return (
    <aside className="command-drawer" aria-label="Curator utilities" data-open={activeMode ? "true" : "false"}>
      <div className="command-bar command-shelf" aria-label="Curator utilities">
        {drawerModes.map((item) => (
          <button
            aria-pressed={activeMode === item.mode}
            className={activeMode === item.mode ? "is-active shelf-tab" : "shelf-tab"}
            data-mode={item.mode}
            key={item.mode}
            onClick={() => toggleMode(item.mode)}
            type="button"
          >
            <span className="shelf-tab-label">{item.label}</span>
            <span className="shelf-tab-meta">{item.meta}</span>
          </button>
        ))}
      </div>

      {activeMode ? (
        <div className="drawer-panel shelf-panel" data-mode={activeMode}>
          {activeMode === "session" ? (
            <SessionSection
              activeSessionId={activeSessionId}
              onDeleteSession={onDeleteSession}
              onLoadSession={onLoadSession}
              onReloadWorkspace={onReloadWorkspace}
              onSaveSession={onSaveSession}
              playlist={playlist}
              sessionName={sessionName}
              sessions={sessions}
              sessionsEnabled={sessionsEnabled}
              setSessionName={setSessionName}
            />
          ) : null}

          {activeMode === "issues" ? (
            <IssuesSection
              appliedSuggestionIds={appliedSuggestionIds}
              busy={busy}
              constraintReport={constraintReport}
              inboxItems={inboxItems}
              issuesCount={issuesCount}
              onAcceptMatch={onAcceptMatch}
              onApplySuggestion={onApplySuggestion}
              onDismissRejectedCandidate={onDismissRejectedCandidate}
              onDismissSuggestion={onDismissSuggestion}
              onIgnoreSuggestion={onIgnoreSuggestion}
              onReviewCompression={onReviewCompression}
              onUndoReviewRemoval={onUndoReviewRemoval}
              onVerifySuggestion={onVerifySuggestion}
              playlist={playlist}
              reviewUndoPayload={reviewUndoPayload}
              sentSuggestionIds={sentSuggestionIds}
            />
          ) : null}

          {activeMode === "inputs" ? (
            <InputsSection
              busy={busy}
              importText={importText}
              onImportChat={onImportChat}
              onImportTextChange={onImportTextChange}
              onSeedTextChange={onSeedTextChange}
              onVerifySeeds={onVerifySeeds}
              seedText={seedText}
            />
          ) : null}

          {activeMode === "history" ? (
            <HistorySection history={history} onReusePrompt={onReusePrompt} />
          ) : null}
        </div>
      ) : null}
    </aside>
  );
}
