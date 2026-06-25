"use client";

import { useEffect, useMemo, useState } from "react";
import { ConversationTimeline, RejectedCandidatesDisclosure } from "@/components/chat/ConversationTimeline";
import {
  issueInboxSummary,
  reviewBasisLabel,
  reviewSuggestionActionLabel,
  reviewSuggestionApplicationModeLabel,
  reviewSuggestionCompressionTargetLabel,
  reviewSuggestionSentNote,
  type IssueInboxFilter,
  type IssueInboxItem
} from "@/components/chat/issueInboxState";
import type { RequestHistoryEntry } from "@/lib/playlist/collaboration";
import { undoLabelForPlaylistOperation, undoSummaryForPlaylistOperation, type PlaylistOperationUndoPayload } from "@/lib/playlist/operations";
import type { LocalSessionSummary } from "@/lib/playlist/io/localDraft";
import type { AttemptedMatch, ConstraintReport, PlaylistState, ReviewSuggestion } from "@/types/playlist";

export function SessionSection({
  activeSessionId,
  onDeleteSession,
  onLoadSession,
  onReloadWorkspace,
  onSaveSession,
  playlist,
  sessionName,
  sessions,
  sessionsEnabled,
  setSessionName
}: {
  activeSessionId: string | null;
  onDeleteSession?: (id: string) => void;
  onLoadSession?: (id: string) => void;
  onReloadWorkspace?: () => Promise<void>;
  onSaveSession?: (name?: string) => void;
  playlist: PlaylistState;
  sessionName: string;
  sessions: LocalSessionSummary[];
  sessionsEnabled: boolean;
  setSessionName: (value: string) => void;
}) {
  const [reloadBusy, setReloadBusy] = useState(false);

  function saveSession() {
    if (!sessionsEnabled || !onSaveSession) {
      return;
    }

    onSaveSession(sessionName);
    setSessionName("");
  }

  function formatSavedAt(savedAt: string): string {
    const date = new Date(savedAt);
    if (Number.isNaN(date.getTime())) {
      return "Saved recently";
    }

    return `Saved ${date.toLocaleDateString(undefined, { month: "short", day: "numeric" })} at ${date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
  }

  return (
    <div className="drawer-content session-manager">
      <div className="drawer-panel-head">
        <h3>Session</h3>
        <span className="chip">Current project</span>
      </div>
      {sessionsEnabled ? (
        <>
          <p className="drawer-note">The current draft still autosaves. Save a named session when you want a return point or need to switch playlists.</p>
          <div className="session-save-row">
            <label className="field">
              <span>Session name</span>
              <input
                value={sessionName}
                onChange={(event) => setSessionName(event.target.value)}
                placeholder={!playlist.title || playlist.title === "The CutList" ? "Untitled session" : playlist.title}
              />
            </label>
            <button className="button-primary" type="button" onClick={saveSession}>Save current session</button>
          </div>
          {sessions.length > 0 ? (
            <div className="session-list" aria-label="Saved sessions">
              {sessions.map((session) => (
                <article className="session-card" data-active={session.id === activeSessionId} key={session.id}>
                  <div>
                    <h4>{session.name}</h4>
                    <p>{session.trackCount} track{session.trackCount === 1 ? "" : "s"} - {formatSavedAt(session.savedAt)}</p>
                  </div>
                  <div className="session-actions">
                    {session.id === activeSessionId ? <span className="chip chip-success">Current</span> : null}
                    <button type="button" onClick={() => onLoadSession?.(session.id)}>Load</button>
                    <button className="button-glyph-danger" aria-label={`Delete ${session.name}`} type="button" onClick={() => onDeleteSession?.(session.id)}>x</button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div>
              <p className="drawer-empty">No saved sessions yet.</p>
              {onReloadWorkspace ? (
                <button className="button-secondary" disabled={reloadBusy} type="button" onClick={() => {
                  setReloadBusy(true);
                  void onReloadWorkspace().finally(() => {
                    setReloadBusy(false);
                  });
                }}
                >
                  {reloadBusy ? "Reloading saved sessions..." : "Reload saved sessions"}
                </button>
              ) : null}
            </div>
          )}
        </>
      ) : (
        <p className="drawer-empty">Sessions are disabled while viewing the fixture playlist.</p>
      )}
    </div>
  );
}

export function IssuesSection({
  appliedSuggestionIds,
  busy,
  constraintReport,
  inboxItems,
  issuesCount,
  onAcceptMatch,
  onApplySuggestion,
  onDismissRejectedCandidate,
  onDismissSuggestion,
  onIgnoreSuggestion,
  onReviewCompression,
  onUndoReviewRemoval,
  onVerifySuggestion,
  playlist,
  reviewUndoPayload,
  sentSuggestionIds
}: {
  appliedSuggestionIds: Set<string>;
  busy: boolean;
  constraintReport: ConstraintReport;
  inboxItems: IssueInboxItem[];
  issuesCount: number;
  onAcceptMatch: (match: AttemptedMatch, context: { entryId: string; issueId: string }) => void;
  onApplySuggestion?: (suggestion: ReviewSuggestion) => void;
  onDismissRejectedCandidate?: (context: { entryId: string; issueId: string }) => void;
  onDismissSuggestion?: (suggestionId: string) => void;
  onIgnoreSuggestion?: (suggestionId: string) => void;
  onReviewCompression?: (suggestion: ReviewSuggestion) => void;
  onUndoReviewRemoval?: () => void;
  onVerifySuggestion?: (suggestion: ReviewSuggestion) => void;
  playlist: PlaylistState;
  reviewUndoPayload: PlaylistOperationUndoPayload | null;
  sentSuggestionIds: Set<string>;
}) {
  const defaultFilter: IssueInboxFilter = inboxItems.some((item) => item.filter === "repairs")
    ? "repairs"
    : inboxItems.some((item) => item.filter === "review")
      ? "review"
      : inboxItems.some((item) => item.filter === "rules")
        ? "rules"
        : "all";
  const [activeFilter, setActiveFilter] = useState<IssueInboxFilter>(defaultFilter);
  const [hasExplicitFilterSelection, setHasExplicitFilterSelection] = useState(false);
  const [expandedItemId, setExpandedItemId] = useState<string | null>(inboxItems[0]?.id ?? null);
  const filteredItems = useMemo(() => (
    activeFilter === "all" ? inboxItems : inboxItems.filter((item) => item.filter === activeFilter)
  ), [activeFilter, inboxItems]);
  const visibleItems = useMemo(() => (
    hasExplicitFilterSelection && activeFilter !== "all" ? filteredItems : inboxItems
  ), [activeFilter, filteredItems, hasExplicitFilterSelection, inboxItems]);
  const visibleKinds = new Set(inboxItems.map((item) => item.filter));
  const reviewContextBySuggestionId = useMemo(() => {
    const result = new Map<string, string[]>();
    for (const item of inboxItems) {
      if (item.kind !== "review_action") {
        continue;
      }
      const context: string[] = [];
      const roleLabels = item.review.trackRoles
        .filter((role) => item.suggestion.affectedTrackIds.includes(role.trackId))
        .map((role) => `${role.role.replace(/_/g, " ")}: ${role.rationale}`);
      const transitionLabels = item.review.transitionReview
        .filter((transition) =>
          item.suggestion.affectedTrackIds.includes(transition.fromTrackId) ||
          item.suggestion.affectedTrackIds.includes(transition.toTrackId)
        )
        .map((transition) => transition.summary);
      context.push(...roleLabels, ...transitionLabels);
      result.set(item.suggestion.id, context.slice(0, 3));
    }
    return result;
  }, [inboxItems]);

  useEffect(() => {
    if (activeFilter !== "all" && !visibleKinds.has(activeFilter)) {
      setActiveFilter(defaultFilter);
      setHasExplicitFilterSelection(false);
    }
  }, [activeFilter, defaultFilter, visibleKinds]);

  useEffect(() => {
    if (!visibleItems.length) {
      setExpandedItemId(null);
      return;
    }
    if (!visibleItems.some((item) => item.id === expandedItemId)) {
      setExpandedItemId(visibleItems[0]?.id ?? null);
    }
  }, [expandedItemId, visibleItems]);

  function toggleItem(itemId: string) {
    setExpandedItemId((current) => current === itemId ? null : itemId);
  }

  function selectFilter(filter: IssueInboxFilter) {
    setActiveFilter(filter);
    setHasExplicitFilterSelection(filter !== "all");
  }

  function labelForTrackIds(trackIds: string[]): string {
    const byId = new Map(playlist.tracks.map((track) => [track.id, track]));
    return trackIds
      .map((trackId) => {
        const track = byId.get(trackId);
        return track ? `"${track.title}"` : null;
      })
      .filter((label): label is string => label != null)
      .join(", ");
  }

  function renderReviewItemDetail(item: Extract<IssueInboxItem, { kind: "review_action" }>) {
    const suggestion = item.suggestion;
    const actionLabel = reviewSuggestionActionLabel(suggestion);
    const sent = sentSuggestionIds.has(suggestion.id);
    const contextNotes = reviewContextBySuggestionId.get(suggestion.id) ?? [];

    return (
        <div className="issue-inbox-detail-body">
          <div className="issue-inbox-detail-copy">
          <p>{suggestion.rationale}</p>
          <p className="muted">Basis: {reviewBasisLabel(suggestion.basis)}</p>
          <p className="muted">Preserves: {suggestion.intentPreservation}</p>
          {suggestion.risk ? <p className="muted">Risk: {suggestion.risk}</p> : null}
          {suggestion.type === "compress_section" && suggestion.sectionLabel ? <p className="muted">Section: {suggestion.sectionLabel}</p> : null}
          {suggestion.affectedTrackIds.length ? <p className="muted">Tracks: {labelForTrackIds(suggestion.affectedTrackIds)}</p> : null}
          {contextNotes.length ? (
            <ul className="drawer-issue-list drawer-issue-list-soft">
              {contextNotes.map((note) => <li key={note}>{note}</li>)}
            </ul>
          ) : null}
          {sent ? <p className="review-action-note">{reviewSuggestionSentNote(suggestion)}</p> : null}
        </div>
        <div className="review-suggestion-actions">
          {actionLabel ? (
            <button
              className={suggestion.applicationMode === "remove_existing" ? "button-danger button-compact" : "button-secondary button-compact"}
              disabled={busy || sent}
              type="button"
              onClick={() => suggestion.applicationMode === "verify_candidate" ? onVerifySuggestion?.(suggestion) : onApplySuggestion?.(suggestion)}
            >
              {actionLabel}
            </button>
          ) : null}
          {!sent ? (
            <button className="button-secondary button-compact" disabled={busy} type="button" onClick={() => onIgnoreSuggestion?.(suggestion.id)}>
              Ignore
            </button>
          ) : null}
          {!sent ? (
            <button className="button-secondary button-compact" disabled={busy} type="button" onClick={() => onDismissSuggestion?.(suggestion.id)}>
              Dismiss
            </button>
          ) : null}
          {appliedSuggestionIds.has(suggestion.id) && suggestion.type === "compress_section" ? (
            <button className="button-secondary button-compact" disabled={busy} type="button" onClick={() => onReviewCompression?.(suggestion)}>
              Review compressed playlist
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  function renderItemDetail(item: IssueInboxItem) {
    if (item.kind === "rejected_candidate") {
      return (
        <RejectedCandidatesDisclosure
          candidates={[item.candidate]}
          entry={item.entry}
          mode="live"
          onAcceptMatch={onAcceptMatch}
          onDismissCandidate={onDismissRejectedCandidate}
          title="Review rejected candidate"
        />
      );
    }

    if (item.kind === "review_action") {
      return renderReviewItemDetail(item);
    }

    if (item.kind === "verified_rule_issue") {
      return (
        <div className="issue-inbox-detail-body">
          <p>{item.finding.message}</p>
          {item.finding.trackTitle ? <p className="muted">Track: {item.finding.trackTitle}</p> : null}
        </div>
      );
    }

    return (
      <div className="issue-inbox-detail-body">
        <p>{item.finding.message}</p>
        <p className="muted">This is an evidence note, not a failure. The app cannot fully verify the active verified rules against the current metadata coverage.</p>
      </div>
    );
  }

  return (
    <div className="drawer-content drawer-issues">
      <div className="drawer-panel-head">
        <h3>Issues</h3>
        <span className={issuesCount > 0 ? "chip chip-danger" : "chip chip-success"}>
          {issuesCount} active
        </span>
      </div>
      <div className="shelf-block issue-inbox-intro">
        <h4>Triage inbox</h4>
        <p className="drawer-note">{issueInboxSummary(inboxItems)}</p>
      </div>
      <div className="issue-filter-row" aria-label="Issue filters">
        {(["all", "repairs", "review", "rules"] as const).map((filter) => {
          if (filter !== "all" && !visibleKinds.has(filter)) {
            return null;
          }
          const count = filter === "all" ? inboxItems.length : inboxItems.filter((item) => item.filter === filter).length;
          const label = filter === "all"
            ? "All"
            : filter === "repairs"
              ? "Repairs"
              : filter === "review"
                ? "Review"
                : "Rules";
          return (
            <button
              aria-pressed={activeFilter === filter}
              className={activeFilter === filter ? "issue-filter-chip is-active" : "issue-filter-chip"}
              key={filter}
              type="button"
              onClick={() => selectFilter(filter)}
            >
              {label} <span>{count}</span>
            </button>
          );
        })}
      </div>

      {reviewUndoPayload ? (
        <div className="undo-banner undo-banner-subtle" role="status">
          <span>{undoSummaryForPlaylistOperation(reviewUndoPayload)}</span>
          <button className="button-secondary button-compact" type="button" onClick={onUndoReviewRemoval}>
            {undoLabelForPlaylistOperation(reviewUndoPayload.operationId) ?? "Undo"}
          </button>
        </div>
      ) : null}

      {issuesCount === 0 ? (
        <div className="shelf-block issue-inbox-empty-state">
          <h4>Inbox clear</h4>
          <p className="drawer-empty">There is no active repair, review, or rules cleanup work right now. Check History if you want the receipts from earlier actions.</p>
        </div>
      ) : hasExplicitFilterSelection && filteredItems.length === 0 ? (
        <div className="shelf-block issue-inbox-empty-state">
          <h4>No items in this filter</h4>
          <p className="drawer-empty">Switch filters to see the rest of the active inbox.</p>
        </div>
      ) : (
        <div className="issue-inbox-list" aria-label="Active issue inbox">
          {visibleItems.map((item) => {
            const isExpanded = expandedItemId === item.id;
            const kindLabel = item.kind === "rejected_candidate"
              ? "Rejected candidate"
              : item.kind === "review_action"
                ? "Curator review"
                : item.kind === "verified_rule_issue"
                  ? "Verified rule"
                  : "Evidence note";
            const itemClassName = item.kind === "evidence_note"
              ? "issue-inbox-item issue-inbox-item-soft"
              : item.kind === "verified_rule_issue"
                ? "issue-inbox-item issue-inbox-item-diagnostic"
                : "issue-inbox-item";

            return (
              <article className={itemClassName} key={item.id}>
                <button
                  aria-expanded={isExpanded}
                  className="issue-inbox-trigger"
                  type="button"
                  onClick={() => toggleItem(item.id)}
                >
                  <div className="issue-inbox-head">
                    <strong>{item.title}</strong>
                    <div className="issue-inbox-chips">
                      <span className={item.kind === "rejected_candidate" ? "chip chip-danger" : "chip"}>{kindLabel}</span>
                      {item.kind === "review_action" ? <span className="chip">{reviewSuggestionApplicationModeLabel(item.suggestion)}</span> : null}
                      {item.kind === "review_action" && reviewSuggestionCompressionTargetLabel(item.suggestion) ? (
                        <span className="chip">{reviewSuggestionCompressionTargetLabel(item.suggestion)}</span>
                      ) : null}
                    </div>
                  </div>
                  <p className="issue-inbox-status">{item.statusLabel}</p>
                  <p>{item.summary}</p>
                </button>
                {isExpanded ? (
                  <div className="issue-inbox-detail">
                    {renderItemDetail(item)}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}

      {constraintReport.violations.length === 0
        && (constraintReport.evidenceWarnings?.length ?? 0) === 0
        && (constraintReport.coverage?.fields.length ?? 0) === 0
        && issuesCount > 0 ? (
        <p className="drawer-note">This inbox is showing live repair and curator work only because there are no active verified-rule or evidence diagnostics right now.</p>
      ) : null}
    </div>
  );
}

export function InputsSection({
  busy,
  importText,
  onImportChat,
  onImportTextChange,
  onSeedTextChange,
  onVerifySeeds,
  seedText
}: {
  busy: boolean;
  importText: string;
  onImportChat: () => void;
  onImportTextChange: (value: string) => void;
  onSeedTextChange: (value: string) => void;
  onVerifySeeds: () => void;
  seedText: string;
}) {
  return (
    <div className="drawer-content drawer-inputs">
      <div className="drawer-panel-head">
        <h3>Import</h3>
        <span className="chip">Add known material</span>
      </div>
      <p className="drawer-note">Paste a draft for bulk import, or add a few known tracks as verified seeds.</p>
      <div className="shelf-block form">
        <h4>Import a draft</h4>
        <label className="field">
          <span>Paste draft text</span>
          <textarea rows={4} value={importText} onChange={(event) => onImportTextChange(event.target.value)} placeholder="Paste draft, chat, or rec list." />
        </label>
        <button className="button-primary" type="button" disabled={busy} onClick={onImportChat}>Import and verify</button>
      </div>
      <details className="shelf-block form inputs-secondary-disclosure">
        <summary>
          <span>Seed tracks</span>
        </summary>
        <label className="field">
          <span>Structured rows</span>
          <textarea rows={4} value={seedText} onChange={(event) => onSeedTextChange(event.target.value)} placeholder={"Artist - Title\nTitle\tArtist\tAlbum\nTitle, Artist, Album"} />
        </label>
        <button className="button-secondary" type="button" disabled={busy} onClick={onVerifySeeds}>Verify seed tracks</button>
      </details>
    </div>
  );
}

export function HistorySection({
  history,
  onReusePrompt
}: {
  history: RequestHistoryEntry[];
  onReusePrompt?: (prompt: string) => void;
}) {
  return (
    <div className="drawer-content drawer-history-panel">
      <div className="drawer-panel-head">
        <h3>History</h3>
        <span className="chip">{history.length} event{history.length === 1 ? "" : "s"}</span>
      </div>
      <p className="drawer-note">Conversation turns and issue outcomes stay here after you act on them.</p>
      <div className="shelf-block drawer-history">
        <ConversationTimeline history={history} onReusePrompt={onReusePrompt} />
      </div>
    </div>
  );
}
