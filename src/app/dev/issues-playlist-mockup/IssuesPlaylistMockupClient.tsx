"use client";

import { useMemo, useState } from "react";
import {
  applyReviewStatuses,
  basePlaylist,
  baseRejectedEntry,
  baseReview,
  baseReviewHistoryEntry,
  buildRejectedEntry,
  reviewStatusSummary
} from "@/app/dev/issues-fixtures";
import { buildIssueInboxItems, type IssueInboxItem } from "@/components/chat/issueInboxState";
import { createPlaylistHealth } from "@/components/playlist/playlistHealth";
import { type HistoryIssueStatus, type RequestHistoryEntry } from "@/lib/playlist/collaboration";
import styles from "./issues-playlist-mockup.module.css";

type ScenarioKey = "mixed" | "review_focus" | "rules_only";

function scenarioState(key: ScenarioKey): {
  rejectedIssueStatuses: HistoryIssueStatus[];
  appliedSuggestionIds: Set<string>;
  dismissedSuggestionIds: Set<string>;
  ignoredSuggestionIds: Set<string>;
  sentSuggestionIds: Set<string>;
} {
  if (key === "review_focus") {
    return {
      rejectedIssueStatuses: [
        { ...(baseRejectedEntry.issueStatuses ?? [])[0], status: "accepted", actedAt: "2026-06-13T18:21:00.000Z" },
        { ...(baseRejectedEntry.issueStatuses ?? [])[1], status: "dismissed", actedAt: "2026-06-13T18:21:00.000Z" }
      ],
      appliedSuggestionIds: new Set<string>(),
      dismissedSuggestionIds: new Set<string>(),
      ignoredSuggestionIds: new Set<string>(),
      sentSuggestionIds: new Set<string>()
    };
  }

  if (key === "rules_only") {
    return {
      rejectedIssueStatuses: [
        { ...(baseRejectedEntry.issueStatuses ?? [])[0], status: "accepted", actedAt: "2026-06-13T18:21:00.000Z" },
        { ...(baseRejectedEntry.issueStatuses ?? [])[1], status: "dismissed", actedAt: "2026-06-13T18:21:00.000Z" }
      ],
      appliedSuggestionIds: new Set(["suggest-remove-duplicate", "suggest-compress-middle"]),
      dismissedSuggestionIds: new Set<string>(),
      ignoredSuggestionIds: new Set<string>(),
      sentSuggestionIds: new Set(["suggest-bridge-middle"])
    };
  }

  return {
    rejectedIssueStatuses: baseRejectedEntry.issueStatuses ?? [],
    appliedSuggestionIds: new Set(["suggest-remove-duplicate"]),
    dismissedSuggestionIds: new Set<string>(),
    ignoredSuggestionIds: new Set<string>(),
    sentSuggestionIds: new Set(["suggest-bridge-middle"])
  };
}

function trackIdsForItem(item: IssueInboxItem): string[] {
  if (item.kind === "review_action") {
    return item.suggestion.affectedTrackIds;
  }
  if ((item.kind === "verified_rule_issue" || item.kind === "evidence_note") && item.finding.trackId) {
    return [item.finding.trackId];
  }
  return [];
}

function relationLabel(item: IssueInboxItem): string {
  if (item.kind === "rejected_candidate") {
    return "Relates to the intake/replacement lane rather than an existing playlist track.";
  }
  if (item.kind === "review_action") {
    return item.suggestion.applicationMode === "verify_candidate"
      ? "Touches the playlist arc and the candidate-generation lane."
      : "Touches existing tracks already in the playlist."
      ;
  }
  if (item.kind === "verified_rule_issue") {
    return "Touches the saved verified rules and the track currently breaking one.";
  }
  return "Touches metadata coverage details for the current track and rule surface.";
}

function itemKindLabel(item: IssueInboxItem): string {
  if (item.kind === "rejected_candidate") {
    return "Rejected candidate";
  }
  if (item.kind === "review_action") {
    return "Curator review";
  }
  if (item.kind === "verified_rule_issue") {
    return "Verified rule";
  }
  return "Evidence note";
}

export function IssuesPlaylistMockupClient() {
  const [scenario, setScenario] = useState<ScenarioKey>("mixed");
  const scenarioData = scenarioState(scenario);
  const playlist = basePlaylist;
  const rejectedEntry = useMemo<RequestHistoryEntry>(() => buildRejectedEntry(scenarioData.rejectedIssueStatuses), [scenarioData.rejectedIssueStatuses]);
  const reviewEntry = useMemo<RequestHistoryEntry>(() => applyReviewStatuses(
    baseReviewHistoryEntry,
    scenarioData.appliedSuggestionIds,
    scenarioData.dismissedSuggestionIds,
    scenarioData.ignoredSuggestionIds,
    scenarioData.sentSuggestionIds
  ), [scenarioData.appliedSuggestionIds, scenarioData.dismissedSuggestionIds, scenarioData.ignoredSuggestionIds, scenarioData.sentSuggestionIds]);
  const health = createPlaylistHealth(playlist);
  const inboxItems = useMemo(() => buildIssueInboxItems({
    appliedSuggestionIds: scenarioData.appliedSuggestionIds,
    constraintReport: health.constraintReport,
    dismissedSuggestionIds: scenarioData.dismissedSuggestionIds,
    ignoredSuggestionIds: scenarioData.ignoredSuggestionIds,
    playlist,
    rejectedEntry,
    review: baseReview,
    sentSuggestionIds: scenarioData.sentSuggestionIds
  }), [health.constraintReport, playlist, rejectedEntry, scenarioData.appliedSuggestionIds, scenarioData.dismissedSuggestionIds, scenarioData.ignoredSuggestionIds, scenarioData.sentSuggestionIds]);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  const selectedItem = inboxItems.find((item) => item.id === selectedItemId) ?? inboxItems[0] ?? null;
  const selectedTrackIds = new Set(selectedItem ? trackIdsForItem(selectedItem) : []);
  const highlightRules = selectedItem?.kind === "verified_rule_issue";
  const highlightEvidence = selectedItem?.kind === "evidence_note";
  const highlightIntake = selectedItem?.kind === "rejected_candidate";
  const reviewStatuses = reviewStatusSummary(reviewEntry, baseReview.reviewSuggestions);

  return (
    <main className={styles.page}>
      <section className={styles.header}>
        <div>
          <p className={styles.kicker}>Dev-only relationship mockup</p>
          <h1>Issues + Playlist Workbench</h1>
          <p className={styles.lead}>
            This mockup is meant to answer a narrower question than the lab: when the triage inbox is open, does it feel properly connected to the playlist surface it is talking about?
          </p>
        </div>
        <div className={styles.scenarioBar}>
          <button type="button" data-active={scenario === "mixed"} onClick={() => { setScenario("mixed"); setSelectedItemId(null); }}>Mixed queue</button>
          <button type="button" data-active={scenario === "review_focus"} onClick={() => { setScenario("review_focus"); setSelectedItemId(null); }}>Review focus</button>
          <button type="button" data-active={scenario === "rules_only"} onClick={() => { setScenario("rules_only"); setSelectedItemId(null); }}>Rules only</button>
        </div>
      </section>

      <section className={styles.grid}>
        <aside className={styles.sidebar}>
          <div className={styles.panel}>
            <h2>What this mockup is testing</h2>
            <ul className={styles.list}>
              <li>Whether an issue reads like it belongs to the playlist you are looking at.</li>
              <li>Whether diagnostics feel secondary to active repair and review work.</li>
              <li>Whether highlighted playlist regions make the inbox feel less detached.</li>
            </ul>
          </div>

          <div className={styles.panel}>
            <h2>Current issue mix</h2>
            <div className={styles.metricList}>
              <article><strong>{inboxItems.length}</strong><span>active inbox items</span></article>
              <article><strong>{inboxItems.filter((item) => item.kind === "rejected_candidate").length}</strong><span>repair items</span></article>
              <article><strong>{inboxItems.filter((item) => item.kind === "review_action").length}</strong><span>review actions</span></article>
              <article><strong>{inboxItems.filter((item) => item.kind === "verified_rule_issue").length}</strong><span>rule violations</span></article>
            </div>
          </div>

          <div className={styles.panel}>
            <h2>Review statuses</h2>
            <div className={styles.statusList}>
              {reviewStatuses.map((item) => (
                <div className={styles.statusRow} key={item.id}>
                  <span>{item.label}</span>
                  <strong>{item.status}</strong>
                </div>
              ))}
            </div>
          </div>
        </aside>

        <section className={styles.workspace}>
          <div className={styles.playlistSurface}>
            <div className={styles.playlistSummary} data-highlight={highlightIntake ? "true" : "false"}>
              <div>
                <p className={styles.surfaceKicker}>Playlist workspace</p>
                <h2>{playlist.title}</h2>
                <p>{playlist.mood}</p>
              </div>
              <div className={styles.statsRow}>
                <span className={styles.statChip}>{playlist.tracks.length} tracks</span>
                <span className={styles.statChip}>{health.runtime}</span>
                <span className={styles.statChipStrong}>{inboxItems.length} open issue{inboxItems.length === 1 ? "" : "s"}</span>
              </div>
              <p className={styles.relationshipNote}>
                {highlightIntake
                  ? "Selected issue is about what to add or repair next, so the summary rail is highlighted instead of any existing track."
                  : "Most issue types should map back to either saved rules, verification details, or specific tracks below."}
              </p>
            </div>

            <div className={styles.rulesBlock} data-highlight={highlightRules ? "true" : "false"}>
              <div className={styles.blockHead}>
                <h3>Verified rules</h3>
                <span>{health.constraintPresentation.verifiedRuleChips.length}</span>
              </div>
              <div className={styles.chipRow}>
                {health.constraintPresentation.verifiedRuleChips.map((chip) => (
                  <span className={styles.ruleChip} key={chip.key}>{chip.label}</span>
                ))}
              </div>
              <div className={styles.blockHead}>
                <h3>Curator guidance</h3>
                <span>{health.constraintPresentation.curatorGuidanceChips.length}</span>
              </div>
              <div className={styles.chipRow}>
                {health.constraintPresentation.curatorGuidanceChips.map((chip) => (
                  <span className={styles.guidanceChip} key={chip.key}>{chip.label}</span>
                ))}
              </div>
            </div>

            <div className={styles.supportGrid}>
              <section className={styles.supportBlock} data-highlight={highlightRules ? "true" : "false"}>
                <div className={styles.blockHead}>
                  <h3>Rule conflicts</h3>
                  <span>{health.constraintPresentation.violationViews.length}</span>
                </div>
                <ul className={styles.detailList}>
                  {health.constraintPresentation.violationViews.map((view) => (
                    <li key={view.key}>
                      <strong>{view.trackTitle ?? "Playlist"}</strong>
                      <span>{view.summary}</span>
                    </li>
                  ))}
                </ul>
              </section>
              <section className={styles.supportBlock} data-highlight={highlightEvidence ? "true" : "false"}>
                <div className={styles.blockHead}>
                  <h3>Evidence notes</h3>
                  <span>{health.constraintPresentation.evidenceWarningViews.length}</span>
                </div>
                <ul className={styles.detailList}>
                  {health.constraintPresentation.evidenceWarningViews.map((view) => (
                    <li key={view.key}>
                      <strong>{view.trackTitle ?? "Playlist"}</strong>
                      <span>{view.summary}</span>
                    </li>
                  ))}
                </ul>
              </section>
            </div>

            <div className={styles.trackStack}>
              {playlist.tracks.map((track) => (
                <article
                  className={styles.trackCard}
                  data-highlight={selectedTrackIds.has(track.id) ? "true" : "false"}
                  key={track.id}
                >
                  <div className={styles.trackHead}>
                    <div>
                      <strong>{track.title}</strong>
                      <span>{track.artist}</span>
                    </div>
                    <div className={styles.trackMeta}>
                      {track.explicit ? <span className={styles.warningChip}>Explicit</span> : null}
                      {track.bpm == null ? <span className={styles.softChip}>No BPM</span> : <span className={styles.softChip}>{track.bpm} BPM</span>}
                    </div>
                  </div>
                  <p>{track.fitNotes}</p>
                </article>
              ))}
            </div>
          </div>

          <div className={styles.inboxSurface}>
            <div className={styles.inboxHead}>
              <div>
                <p className={styles.surfaceKicker}>Triage inbox</p>
                <h2>Active issues</h2>
              </div>
              <span className={styles.inboxCount}>{inboxItems.length} active</span>
            </div>
            <div className={styles.inboxList}>
              {inboxItems.map((item) => (
                <button
                  key={item.id}
                  className={styles.inboxItem}
                  data-active={selectedItem?.id === item.id ? "true" : "false"}
                  data-kind={item.kind}
                  type="button"
                  onClick={() => setSelectedItemId(item.id)}
                >
                  <div className={styles.inboxItemHead}>
                    <strong>{item.title}</strong>
                    <span>{itemKindLabel(item)}</span>
                  </div>
                  <p>{item.summary}</p>
                </button>
              ))}
            </div>

            {selectedItem ? (
              <div className={styles.relationshipPanel}>
                <h3>Selected issue → playlist relationship</h3>
                <div className={styles.relationshipMeta}>
                  <span className={styles.relationshipKind}>{itemKindLabel(selectedItem)}</span>
                  <span>{selectedItem.statusLabel}</span>
                </div>
                <p>{relationLabel(selectedItem)}</p>
                <ul className={styles.list}>
                  {selectedItem.kind === "review_action" ? (
                    <>
                      <li>Affected tracks: {selectedItem.suggestion.affectedTrackIds.join(", ") || "none"}</li>
                      <li>Suggested operation: {selectedItem.suggestion.applicationMode.replace(/_/g, " ")}</li>
                    </>
                  ) : null}
                  {selectedItem.kind === "verified_rule_issue" || selectedItem.kind === "evidence_note" ? (
                    <li>Mapped track: {selectedItem.finding.trackTitle ?? "playlist-level"}</li>
                  ) : null}
                  {selectedItem.kind === "rejected_candidate" ? (
                    <li>Provider options: {selectedItem.candidate.attemptedMatches?.length ?? 0} reviewed matches</li>
                  ) : null}
                </ul>
              </div>
            ) : null}
          </div>
        </section>
      </section>
    </main>
  );
}
