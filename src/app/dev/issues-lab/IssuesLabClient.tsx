"use client";

import { useMemo, useState } from "react";
import { CommandDrawer, type UtilitySection } from "@/components/chat/CommandDrawer";
import { buildIssueInboxItems } from "@/components/chat/issueInboxState";
import {
  actionableSuggestionCount,
  applyReviewStatuses,
  basePlaylist,
  baseRejectedEntry,
  baseReview,
  baseReviewHistoryEntry,
  buildRejectedEntry,
  reviewStatusSummary
} from "@/app/dev/issues-fixtures";
import {
  activeRejectedCandidateCount,
  type HistoryIssueStatus,
  type RequestHistoryEntry
} from "@/lib/playlist/collaboration";
import { evaluatePlaylistConstraints } from "@/lib/playlist/constraints";
import {
  createRemoveOperationUndoPayload,
  createSetOperationUndoPayload,
  type PlaylistOperationUndoPayload
} from "@/lib/playlist/operations";
import { updatePlaylistTextField } from "@/lib/playlist/state";
import { trackFromAttemptedMatch } from "@/lib/playlist/collaboration";
import type { AttemptedMatch, ReviewSuggestion } from "@/types/playlist";
import styles from "./issues-lab.module.css";

type ScenarioKey = "fresh" | "partial" | "mostly_cleared";

export function IssuesLabClient() {
  const [activeMode, setActiveMode] = useState<UtilitySection | null>("issues");
  const [playlist, setPlaylist] = useState(basePlaylist);
  const [rejectedIssueStatuses, setRejectedIssueStatuses] = useState<HistoryIssueStatus[]>(baseRejectedEntry.issueStatuses ?? []);
  const [appliedSuggestionIds, setAppliedSuggestionIds] = useState<Set<string>>(new Set());
  const [dismissedSuggestionIds, setDismissedSuggestionIds] = useState<Set<string>>(new Set());
  const [ignoredSuggestionIds, setIgnoredSuggestionIds] = useState<Set<string>>(new Set());
  const [sentSuggestionIds, setSentSuggestionIds] = useState<Set<string>>(new Set());
  const [reviewUndoPayload, setReviewUndoPayload] = useState<PlaylistOperationUndoPayload | null>(null);
  const [eventLog, setEventLog] = useState<string[]>(["Lab ready."]);

  const rejectedEntry = useMemo<RequestHistoryEntry>(() => buildRejectedEntry(rejectedIssueStatuses), [rejectedIssueStatuses]);

  const reviewHistoryEntry = useMemo<RequestHistoryEntry>(() => applyReviewStatuses(
    baseReviewHistoryEntry,
    appliedSuggestionIds,
    dismissedSuggestionIds,
    ignoredSuggestionIds,
    sentSuggestionIds
  ), [appliedSuggestionIds, dismissedSuggestionIds, ignoredSuggestionIds, sentSuggestionIds]);

  const history = useMemo<RequestHistoryEntry[]>(() => [rejectedEntry, reviewHistoryEntry], [rejectedEntry, reviewHistoryEntry]);

  const constraintReport = useMemo(() => evaluatePlaylistConstraints(playlist.tracks, playlist.constraints), [playlist]);
  const inboxItems = useMemo(() => buildIssueInboxItems({
    appliedSuggestionIds,
    constraintReport,
    dismissedSuggestionIds,
    ignoredSuggestionIds,
    playlist,
    rejectedEntry,
    review: baseReview,
    sentSuggestionIds
  }), [appliedSuggestionIds, constraintReport, dismissedSuggestionIds, ignoredSuggestionIds, playlist, rejectedEntry, sentSuggestionIds]);
  const rejectedActive = activeRejectedCandidateCount(rejectedEntry);
  const actionableReview = actionableSuggestionCount(baseReview, appliedSuggestionIds, dismissedSuggestionIds, ignoredSuggestionIds, sentSuggestionIds);
  const statuses = reviewStatusSummary(reviewHistoryEntry, baseReview.reviewSuggestions);

  function log(message: string) {
    setEventLog((current) => [message, ...current].slice(0, 8));
  }

  function loadScenario(key: ScenarioKey) {
    if (key === "fresh") {
      setRejectedIssueStatuses(baseRejectedEntry.issueStatuses ?? []);
      setAppliedSuggestionIds(new Set());
      setDismissedSuggestionIds(new Set());
      setIgnoredSuggestionIds(new Set());
      setSentSuggestionIds(new Set());
      setReviewUndoPayload(null);
      log("Loaded fresh scenario.");
      return;
    }

    if (key === "partial") {
      setRejectedIssueStatuses([
        { ...(baseRejectedEntry.issueStatuses ?? [])[0], status: "accepted", actedAt: "2026-06-13T18:21:00.000Z" },
        { ...(baseRejectedEntry.issueStatuses ?? [])[1], status: "blocked", actedAt: null }
      ]);
      setAppliedSuggestionIds(new Set(["suggest-remove-duplicate"]));
      setDismissedSuggestionIds(new Set());
      setIgnoredSuggestionIds(new Set(["suggest-compress-middle"]));
      setSentSuggestionIds(new Set(["suggest-bridge-middle"]));
      setReviewUndoPayload(createRemoveOperationUndoPayload(playlist, ["track-2"], { qualifier: "reviewed" }));
      log("Loaded partially handled scenario.");
      return;
    }

    setRejectedIssueStatuses([
      { ...(baseRejectedEntry.issueStatuses ?? [])[0], status: "dismissed", actedAt: "2026-06-13T18:23:00.000Z" },
      { ...(baseRejectedEntry.issueStatuses ?? [])[1], status: "dismissed", actedAt: "2026-06-13T18:24:00.000Z" }
    ]);
    setAppliedSuggestionIds(new Set(["suggest-remove-duplicate", "suggest-compress-middle"]));
    setDismissedSuggestionIds(new Set());
    setIgnoredSuggestionIds(new Set());
    setSentSuggestionIds(new Set(["suggest-bridge-middle"]));
    setReviewUndoPayload(createSetOperationUndoPayload(playlist, { qualifier: "compressed" }));
    log("Loaded mostly cleared scenario.");
  }

  function handleAcceptMatch(match: AttemptedMatch, context: { entryId: string; issueId: string }) {
    const acceptedTrack = trackFromAttemptedMatch(match);
    setRejectedIssueStatuses((current) => current.map((status) => (
      status.issueId === context.issueId && status.issueKind === "rejected_candidate"
        ? { ...status, status: "accepted", actedAt: "2026-06-13T18:31:00.000Z" }
        : status
    )));
    log(acceptedTrack ? `Accepted reviewed match for ${acceptedTrack.artist} - ${acceptedTrack.title}.` : "Accepted reviewed match.");
  }

  function handleDismissRejectedCandidate(context: { entryId: string; issueId: string }) {
    setRejectedIssueStatuses((current) => current.map((status) => (
      status.issueId === context.issueId && status.issueKind === "rejected_candidate"
        ? { ...status, status: "dismissed", actedAt: "2026-06-13T18:32:00.000Z" }
        : status
    )));
    log(`Dismissed rejected candidate in ${context.entryId}.`);
  }

  function handleApplySuggestion(suggestion: ReviewSuggestion) {
    setAppliedSuggestionIds((current) => new Set(current).add(suggestion.id));
    if (suggestion.type === "compress_section") {
      setReviewUndoPayload(createSetOperationUndoPayload(playlist, { qualifier: "compressed" }));
    } else if (suggestion.applicationMode === "remove_existing") {
      setReviewUndoPayload(createRemoveOperationUndoPayload(playlist, suggestion.affectedTrackIds, { qualifier: "reviewed" }));
    }
    log(`Applied suggestion: ${suggestion.type}.`);
  }

  function handleDismissSuggestion(suggestionId: string) {
    setDismissedSuggestionIds((current) => new Set(current).add(suggestionId));
    log(`Dismissed suggestion ${suggestionId}.`);
  }

  function handleIgnoreSuggestion(suggestionId: string) {
    setIgnoredSuggestionIds((current) => new Set(current).add(suggestionId));
    log(`Ignored suggestion ${suggestionId}.`);
  }

  function handleVerifySuggestion(suggestion: ReviewSuggestion) {
    setSentSuggestionIds((current) => new Set(current).add(suggestion.id));
    log(`Sent follow-up request for ${suggestion.type}.`);
  }

  function handleReviewCompression(suggestion: ReviewSuggestion) {
    log(`Requested re-review after ${suggestion.type}.`);
  }

  function handleUndoReviewRemoval() {
    setReviewUndoPayload(null);
    log("Cleared review undo banner.");
  }

  return (
    <main className={styles.page}>
      <section className={styles.header}>
        <div>
          <p className={styles.kicker}>Dev-only drawer sandbox</p>
          <h1>Issues Drawer Lab</h1>
          <p className={styles.lead}>
            This route uses the real Issues drawer components with controllable mock state. It is meant for tuning the triage inbox and checking that handled work leaves the live queue cleanly.
          </p>
        </div>
        <div className={styles.scenarioBar}>
          <button type="button" onClick={() => loadScenario("fresh")}>Fresh queue</button>
          <button type="button" onClick={() => loadScenario("partial")}>Partially handled</button>
          <button type="button" onClick={() => loadScenario("mostly_cleared")}>Mostly cleared</button>
        </div>
      </section>

      <section className={styles.grid}>
        <aside className={styles.controls}>
          <div className={styles.panel}>
            <h2>What to inspect</h2>
            <ul className={styles.list}>
              <li>Rejected candidates disappear when accepted or dismissed.</li>
              <li>Handled review suggestions leave the live inbox and only remain in History.</li>
              <li>The Issues count matches active inbox items rather than old section totals.</li>
              <li>Diagnostics sit below repair and review work instead of competing with them.</li>
            </ul>
          </div>

          <div className={styles.panel}>
            <h2>Live state</h2>
            <div className={styles.metricList}>
              <article><strong>{inboxItems.length}</strong><span>active inbox items</span></article>
              <article><strong>{rejectedActive}</strong><span>active rejected candidates</span></article>
              <article><strong>{constraintReport.violations.length}</strong><span>constraint issues</span></article>
              <article><strong>{constraintReport.evidenceWarnings?.length ?? 0}</strong><span>evidence warnings</span></article>
              <article><strong>{actionableReview}</strong><span>actionable review suggestions</span></article>
            </div>
          </div>

          <div className={styles.panel}>
            <h2>Review statuses</h2>
            <div className={styles.statusList}>
              {statuses.map((item) => (
                <div className={styles.statusRow} key={item.id}>
                  <span>{item.label}</span>
                  <strong>{item.status}</strong>
                </div>
              ))}
            </div>
          </div>

          <div className={styles.panel}>
            <h2>Quick controls</h2>
            <div className={styles.controlGroup}>
              <button type="button" onClick={() => setActiveMode("issues")}>Open issues tab</button>
              <button type="button" onClick={() => setActiveMode("history")}>Open history tab</button>
              <button type="button" onClick={() => setActiveMode(null)}>Close drawer</button>
            </div>
            <div className={styles.controlGroup}>
              <button type="button" onClick={() => setPlaylist((current) => updatePlaylistTextField(current, "title", `${current.title} (renamed)`))}>Rename playlist</button>
              <button type="button" onClick={() => setReviewUndoPayload(null)}>Hide undo banner</button>
              <button type="button" onClick={() => loadScenario("fresh")}>Reset all state</button>
            </div>
          </div>

          <div className={styles.panel}>
            <h2>Event log</h2>
            <ul className={styles.logList}>
              {eventLog.map((entry, index) => <li key={`${entry}-${index}`}>{entry}</li>)}
            </ul>
          </div>
        </aside>

        <section className={styles.preview}>
          <div className={styles.previewCanvas}>
            <div className={styles.fakeComposer}>
              <strong>Curator Console</strong>
              <p>The drawer on the right is the real component. Use its own buttons to move mock issues through handled states.</p>
            </div>
            <div className={styles.fakePlaylist}>
              <h2>{playlist.title}</h2>
              <p>{playlist.mood}</p>
              <div className={styles.fakeTrackList}>
                {playlist.tracks.map((track) => (
                  <article key={track.id}>
                    <strong>{track.title}</strong>
                    <span>{track.artist}</span>
                  </article>
                ))}
              </div>
            </div>

            <div className={styles.drawerMount}>
              <CommandDrawer
                activeMode={activeMode}
                appliedSuggestionIds={appliedSuggestionIds}
                busy={false}
                dismissedSuggestionIds={dismissedSuggestionIds}
                history={history}
                ignoredSuggestionIds={ignoredSuggestionIds}
                importText=""
                onAcceptMatch={handleAcceptMatch}
                onApplySuggestion={handleApplySuggestion}
                onDismissRejectedCandidate={handleDismissRejectedCandidate}
                onDismissSuggestion={handleDismissSuggestion}
                onIgnoreSuggestion={handleIgnoreSuggestion}
                onImportChat={() => log("Import action clicked.")}
                onImportTextChange={() => undefined}
                onLoadSession={() => undefined}
                onModeChange={setActiveMode}
                onReviewCompression={handleReviewCompression}
                onSaveSession={() => undefined}
                onSeedTextChange={() => undefined}
                onUndoReviewRemoval={handleUndoReviewRemoval}
                onVerifySeeds={() => log("Verify seeds clicked.")}
                onVerifySuggestion={handleVerifySuggestion}
                playlist={playlist}
                rejectedEntry={rejectedEntry}
                review={baseReview}
                reviewUndoPayload={reviewUndoPayload}
                seedText=""
                sentSuggestionIds={sentSuggestionIds}
                sessions={[]}
              />
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}
