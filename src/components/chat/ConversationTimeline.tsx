"use client";

import {
  rejectedCandidateIssueId,
  rejectedCandidateStatusForEntry,
  reviewSuggestionStatusForEntry,
  type RequestHistoryEntry,
  type RequestHistoryKind
} from "@/lib/playlist/collaboration";
import type { AttemptedMatch, RejectedCandidate, ReviewSuggestion } from "@/types/playlist";

type Props = {
  history: RequestHistoryEntry[];
};

function attemptedMatchKey(match: AttemptedMatch, index: number): string {
  return [
    match.source,
    match.sourceId ?? "no-source-id",
    match.artist,
    match.title,
    match.album ?? "no-album",
    match.runtime ?? "no-runtime",
    index
  ].join(":");
}

function entryTitle(entry: RequestHistoryEntry): string {
  const kind: RequestHistoryKind = entry.kind ?? (entry.error ? "error" : "request");

  if (kind === "request" && entry.playlistAction === "reorder") {
    return "Reordered playlist";
  }

  switch (kind) {
    case "seed":
      return "Verified seed tracks";
    case "import":
      return "Imported draft";
    case "review":
      return "Reviewed playlist";
    case "manual-match":
      return entry.userMessage === "Accepted recommended match" ? "Accepted recommended match" : "Accepted reviewed match";
    case "error":
      return "Request failed";
    case "undo":
      return "Undid curator turn";
    case "request":
    default:
      return "Asked for tracks";
  }
}

function entryTime(entry: RequestHistoryEntry): number {
  const timestamp = Date.parse(entry.createdAt);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function rejectedCandidateEvidence(candidate: RejectedCandidate): string {
  const reviewedCount = candidate.attemptedMatches?.length ?? 0;
  const remainingChoiceText = candidate.rejectionCode === "ambiguousMatch"
    ? reviewedCount > 0
      ? `${reviewedCount} plausible provider match${reviewedCount === 1 ? "" : "es"} still need review`
      : "No safe provider match"
    : reviewedCount > 0
      ? `${reviewedCount} provider match${reviewedCount === 1 ? "" : "es"} reviewed`
      : "No safe provider match";

  return [
    candidate.violatedConstraint ? `Constraint: ${candidate.violatedConstraint}` : null,
    candidate.llmReviewed && candidate.prunedMatchCount
      ? `Curator filtered out ${candidate.prunedMatchCount} obvious non-match${candidate.prunedMatchCount === 1 ? "" : "es"}`
      : null,
    remainingChoiceText
  ].filter(Boolean).join(" / ");
}

function rejectedCandidateSummary(candidates: RejectedCandidate[]): string {
  const constraintCount = candidates.filter((candidate) => candidate.violatedConstraint).length;
  const providerCount = candidates.filter((candidate) => !candidate.violatedConstraint).length;
  const parts = [
    providerCount ? `${providerCount} unverified` : null,
    constraintCount ? `${constraintCount} constraint issue${constraintCount === 1 ? "" : "s"}` : null
  ].filter(Boolean);

  if (parts.length === 0) {
    return `${candidates.length} rejected candidate${candidates.length === 1 ? "" : "s"}`;
  }
  return `${candidates.length} rejected: ${parts.join(", ")}`;
}

function matchActionLabel(match: AttemptedMatch, allowAccept: boolean): string {
  if (!allowAccept) {
    return "Blocked by constraint";
  }
  if (!match.sourceId) {
    return "Missing source ID";
  }
  if (match.isRecommended) {
    return "Accept recommended match";
  }
  return "Accept match";
}

export function sortedConversationHistory(history: RequestHistoryEntry[]): RequestHistoryEntry[] {
  return [...history].sort((a, b) => entryTime(b) - entryTime(a));
}

function rejectedCandidateHistoryLabel(entry: RequestHistoryEntry, candidate: RejectedCandidate): string {
  const status = rejectedCandidateStatusForEntry(entry, candidate);
  switch (status) {
    case "accepted":
      return "Accepted";
    case "dismissed":
      return "Dismissed";
    case "blocked":
      return "Blocked";
    case "rejected":
    default:
      return "Still open";
  }
}

function reviewSuggestionHistoryLabel(entry: RequestHistoryEntry, suggestion: ReviewSuggestion): string {
  const status = reviewSuggestionStatusForEntry(entry, suggestion.id);
  switch (status) {
    case "applied":
      return "Applied";
    case "requested":
      return "Requested";
    case "ignored":
      return "Ignored";
    case "dismissed":
      return "Dismissed";
    case "open":
    default:
      return "Still open";
  }
}

export function ConversationTimeline({ history }: Props) {
  const timeline = sortedConversationHistory(history);

  return (
    <div className="section conversation-timeline">
      <h2>Conversation History</h2>
      {timeline.length === 0 ? <p className="muted">Conversation activity appears here after you ask, import, verify, or review.</p> : null}
      {timeline.length > 0 ? (
        <div className="timeline-list">
          {timeline.map((entry) => (
            <article className="timeline-entry" key={entry.id}>
              <div className="timeline-head">
                <div>
                  <h3>{entryTitle(entry)}</h3>
                </div>
                <time className="muted" dateTime={entry.createdAt}>{new Date(entry.createdAt).toLocaleTimeString()}</time>
              </div>
              <div className="stats">
                {entry.playlistAction === "reorder" ? (
                  <>
                    <span className="chip">{entry.movedTrackCount ?? 0} moved</span>
                    <span className="chip">Sequence only</span>
                  </>
                ) : (
                  <span className="chip">{entry.acceptedCount} accepted</span>
                )}
                <span className={entry.error ? "bad" : "chip"}>{entry.error ? "Error" : `${entry.rejectedCandidates.length} rejected`}</span>
              </div>
              <div className="timeline-exchange">
                <div className="timeline-message timeline-message-user">
                  <span>You</span>
                  <p>{entry.userMessage}</p>
                </div>
                {entry.assistantMessage ? (
                  <div className="timeline-message timeline-message-curator">
                    <span>Curator</span>
                    <p>{entry.assistantMessage}</p>
                  </div>
                ) : null}
              </div>
              {entry.playlistAction === "reorder" ? (
                <div className="timeline-reorder">
                  <span className="timeline-reorder-kicker">Reorder recap</span>
                  {entry.orderRationale ? (
                    <p><strong>Why this order:</strong> {entry.orderRationale}</p>
                  ) : null}
                  {entry.movedTrackSummary?.length ? (
                    <details>
                      <summary>Show {entry.movedTrackSummary.length} position change{entry.movedTrackSummary.length === 1 ? "" : "s"}</summary>
                      <ul>
                        {entry.movedTrackSummary.map((item) => <li key={item}>{item}</li>)}
                      </ul>
                    </details>
                  ) : null}
                </div>
              ) : null}
              {entry.rejectedCandidates.length > 0 ? (
                <RejectedCandidatesDisclosure
                  candidates={entry.rejectedCandidates}
                  entry={entry}
                  mode="history"
                />
              ) : null}
              {entry.reviewSuggestions?.length ? (
                <div className="timeline-review-statuses">
                  <h4>Review suggestion outcomes</h4>
                  <ul className="timeline-review-list">
                    {entry.reviewSuggestions.map((suggestion) => (
                      <li key={suggestion.id}>
                        <div className="timeline-review-head">
                          <strong>{suggestion.type.replace(/_/g, " ")}</strong>
                          <span className="chip">{reviewSuggestionHistoryLabel(entry, suggestion)}</span>
                        </div>
                        <p>{suggestion.rationale}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function RejectedCandidatesDisclosure({
  candidates,
  entry,
  mode = "history",
  onAcceptMatch,
  onDismissCandidate,
  title
}: {
  candidates: RejectedCandidate[];
  entry: Pick<RequestHistoryEntry, "id" | "issueStatuses">;
  mode?: "history" | "live";
  onAcceptMatch?: (match: AttemptedMatch, context: { entryId: string; issueId: string }) => void;
  onDismissCandidate?: (context: { entryId: string; issueId: string }) => void;
  title?: string;
}) {
  const visibleCandidates = mode === "live"
    ? candidates.filter((candidate) => {
      const status = rejectedCandidateStatusForEntry(entry, candidate);
      return status !== "accepted" && status !== "dismissed";
    })
    : candidates;

  return (
    <details className="rejection-disclosure" open={Boolean(title)}>
      <summary>{title ?? rejectedCandidateSummary(visibleCandidates)}</summary>
      <ul className="rejection-list">
        {visibleCandidates.map((candidate, index) => {
          const issueId = rejectedCandidateIssueId(candidate);
          const status = rejectedCandidateStatusForEntry(entry, candidate);
          const allowAccept = !candidate.violatedConstraint && mode === "live";
          return (
          <li key={`${candidate.artist}-${candidate.title}-${index}`}>
            <div className="rejection-card-head">
              <strong>{candidate.artist} - {candidate.title}</strong>
              {candidate.violatedConstraint ? <span className="chip">{candidate.violatedConstraint}</span> : null}
              <span className={status === "accepted" ? "chip chip-success" : status === "dismissed" ? "chip" : status === "blocked" ? "chip chip-danger" : "chip"}>
                {mode === "history" ? rejectedCandidateHistoryLabel(entry as RequestHistoryEntry, candidate) : status === "blocked" ? "Blocked" : "Open"}
              </span>
            </div>
            <p>{candidate.reason}</p>
            {candidate.reviewSummary ? <p>{candidate.reviewSummary}</p> : null}
            <span className="rejection-evidence">{rejectedCandidateEvidence(candidate)}</span>
            {candidate.attemptedMatches?.length ? (
              <MatchReview
                allowAccept={allowAccept}
                issueId={issueId}
                entryId={entry.id}
                matches={candidate.attemptedMatches}
                onAcceptMatch={onAcceptMatch}
                showActions={mode === "live"}
              />
            ) : null}
            {mode === "live" ? (
              <div className="rejection-actions">
                <button className="button-secondary button-compact" type="button" onClick={() => onDismissCandidate?.({ entryId: entry.id, issueId })}>
                  Dismiss
                </button>
              </div>
            ) : null}
          </li>
          );
        })}
      </ul>
      {visibleCandidates.length === 0 ? <p className="muted">No active rejected candidates.</p> : null}
    </details>
  );
}

function MatchReview({
  allowAccept,
  entryId,
  issueId,
  matches,
  onAcceptMatch,
  showActions
}: {
  allowAccept: boolean;
  entryId: string;
  issueId: string;
  matches: AttemptedMatch[];
  onAcceptMatch?: (match: AttemptedMatch, context: { entryId: string; issueId: string }) => void;
  showActions: boolean;
}) {
  const recommended = matches.find((match) => match.isRecommended) ?? null;
  const visibleMatches = recommended
    ? [recommended, ...matches.filter((match) => match !== recommended)]
    : matches;

  return (
    <div className="match-review-list">
      {visibleMatches.slice(0, 4).map((match, matchIndex) => (
        <div className="match-review" key={attemptedMatchKey(match, matchIndex)}>
          <div>
            <strong>{match.artist} - {match.title}</strong>
            {match.isRecommended ? <span>Curator recommendation</span> : null}
            <span>{[match.album, match.runtime, match.source, match.confidence ? `${match.confidence} confidence` : null].filter(Boolean).join(" / ")}</span>
            {typeof match.score === "number" ? <span>score {Math.round(match.score * 100)}%</span> : null}
            {match.recommendationReason ? <span>{match.recommendationReason}</span> : null}
          </div>
          {showActions ? (
            <button type="button" disabled={!allowAccept || !match.sourceId} onClick={() => onAcceptMatch?.(match, { entryId, issueId })}>
              {matchActionLabel(match, allowAccept)}
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}
