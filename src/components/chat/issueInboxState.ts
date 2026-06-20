import { getActionableReviewSuggestions } from "@/components/chat/reviewSuggestionState";
import { createConstraintPresentation, type ConstraintFindingView } from "@/lib/playlist/constraints/presentation";
import {
  rejectedCandidateIssueId,
  rejectedCandidateStatusForEntry,
  type RequestHistoryEntry
} from "@/lib/playlist/collaboration";
import type { AnalyzePlaylistResponse, ConstraintReport, PlaylistState, RejectedCandidate, ReviewBasis, ReviewSuggestion } from "@/types/playlist";

export type IssueInboxKind = "rejected_candidate" | "review_action" | "verified_rule_issue" | "evidence_note";
export type IssueInboxFilter = "all" | "repairs" | "review" | "rules";

type IssueInboxBase = {
  id: string;
  kind: IssueInboxKind;
  priority: number;
  title: string;
  summary: string;
  statusLabel: string;
  filter: Exclude<IssueInboxFilter, "all">;
  groupKey?: string;
};

export type RejectedCandidateInboxItem = IssueInboxBase & {
  kind: "rejected_candidate";
  candidate: RejectedCandidate;
  entry: RequestHistoryEntry;
  issueId: string;
};

export type ReviewActionInboxItem = IssueInboxBase & {
  kind: "review_action";
  review: AnalyzePlaylistResponse;
  suggestion: ReviewSuggestion;
};

export type VerifiedRuleInboxItem = IssueInboxBase & {
  kind: "verified_rule_issue";
  finding: ConstraintFindingView;
};

export type EvidenceNoteInboxItem = IssueInboxBase & {
  kind: "evidence_note";
  finding: ConstraintFindingView;
};

export type IssueInboxItem =
  | RejectedCandidateInboxItem
  | ReviewActionInboxItem
  | VerifiedRuleInboxItem
  | EvidenceNoteInboxItem;

export function reviewSuggestionHeadingLabel(suggestion: ReviewSuggestion): string {
  const label = suggestion.type === "compress_section"
    ? "Compress section"
    : suggestion.type.replace(/_/g, " ");
  return label.slice(0, 1).toUpperCase() + label.slice(1);
}

export function reviewBasisLabel(basis?: ReviewBasis): string {
  switch (basis) {
    case "constraint":
      return "Verified";
    case "metadata_heuristic":
      return "Metadata signal";
    case "mixed":
      return "Mixed basis";
    case "model_judgment":
    default:
      return "Curator judgment";
  }
}

export function reviewSuggestionActionLabel(suggestion: ReviewSuggestion): string | null {
  if (suggestion.applicationMode === "remove_existing") {
    return suggestion.type === "compress_section" ? "Apply compression" : "Apply review action";
  }
  if (suggestion.applicationMode === "reorder_existing") {
    return "Apply reorder";
  }
  if (suggestion.applicationMode === "verify_candidate") {
    if (suggestion.type === "add_bridge") {
      return "Find bridge track";
    }
    if (suggestion.type === "replace") {
      return "Find replacement";
    }
    return "Find candidate";
  }
  return null;
}

export function reviewSuggestionApplicationModeLabel(suggestion: ReviewSuggestion): string {
  if (suggestion.applicationMode === "verify_candidate") {
    return suggestion.type === "add_bridge" ? "curator bridge" : "curator candidate";
  }
  return suggestion.applicationMode.replace(/_/g, " ");
}

export function reviewSuggestionSentNote(suggestion: ReviewSuggestion): string {
  return suggestion.type === "add_bridge"
    ? "Curator request sent to find a checked bridge track."
    : "Curator request sent to find a checked candidate.";
}

export function reviewSuggestionCompressionTargetLabel(suggestion: ReviewSuggestion): string | null {
  if (suggestion.type !== "compress_section") {
    return null;
  }
  if (suggestion.compressionPlan?.targetTrackCount != null) {
    return `Toward ${suggestion.compressionPlan.targetTrackCount} tracks`;
  }
  if (suggestion.compressionPlan?.targetTotalDurationMs != null) {
    return `Toward ${Math.round(suggestion.compressionPlan.targetTotalDurationMs / 60_000)} minutes`;
  }
  return null;
}

export function buildIssueInboxItems({
  appliedSuggestionIds,
  constraintReport,
  dismissedSuggestionIds,
  ignoredSuggestionIds,
  playlist,
  rejectedEntry,
  review,
  sentSuggestionIds
}: {
  appliedSuggestionIds: Set<string>;
  constraintReport: ConstraintReport;
  dismissedSuggestionIds: Set<string>;
  ignoredSuggestionIds: Set<string>;
  playlist: PlaylistState;
  rejectedEntry: RequestHistoryEntry | null;
  review: AnalyzePlaylistResponse | null;
  sentSuggestionIds: Set<string>;
}): IssueInboxItem[] {
  const items: IssueInboxItem[] = [];

  if (rejectedEntry) {
    rejectedEntry.rejectedCandidates.forEach((candidate, candidateIndex) => {
      const issueId = rejectedCandidateIssueId(candidate);
      const status = rejectedCandidateStatusForEntry(rejectedEntry, candidate);
      if (status === "accepted" || status === "dismissed") {
        return;
      }

      items.push({
        id: `rejected:${rejectedEntry.id}:${candidateIndex}:${issueId}`,
        kind: "rejected_candidate",
        priority: status === "blocked" ? 0 : 1,
        title: `${candidate.artist} - ${candidate.title}`,
        summary: candidate.reason,
        statusLabel: status === "blocked"
          ? "Blocked by verified rule"
          : candidate.attemptedMatches?.some((match) => match.isRecommended)
            ? "Recommended match available"
            : "Needs match review",
        filter: "repairs",
        groupKey: rejectedEntry.id,
        candidate,
        entry: rejectedEntry,
        issueId
      });
    });
  }

  if (review) {
    const actionableSuggestions = getActionableReviewSuggestions(
      review,
      appliedSuggestionIds,
      dismissedSuggestionIds,
      ignoredSuggestionIds,
      sentSuggestionIds
    );

    for (const suggestion of actionableSuggestions) {
      items.push({
        id: `review:${suggestion.id}`,
        kind: "review_action",
        priority: 2,
        title: reviewSuggestionHeadingLabel(suggestion),
        summary: suggestion.rationale,
        statusLabel: `${suggestion.confidence} confidence · ${reviewBasisLabel(suggestion.basis)}`,
        filter: "review",
        review,
        suggestion
      });
    }
  }

  const presentation = createConstraintPresentation(playlist.tracks, playlist.constraints, constraintReport);

  for (const finding of presentation.violationViews) {
    items.push({
      id: `rule:${finding.key}`,
      kind: "verified_rule_issue",
      priority: 3,
      title: finding.trackTitle ? `${finding.trackTitle} breaks a verified rule` : "Verified-rule cleanup",
      summary: finding.summary,
      statusLabel: "Rule violation",
      filter: "rules",
      finding
    });
  }

  for (const finding of presentation.evidenceWarningViews) {
    items.push({
      id: `evidence:${finding.key}`,
      kind: "evidence_note",
      priority: 4,
      title: finding.trackTitle ? `${finding.trackTitle} has limited metadata evidence` : "Metadata coverage note",
      summary: finding.summary,
      statusLabel: "Informational",
      filter: "rules",
      finding
    });
  }

  for (const field of presentation.evidenceCoverageViews) {
    items.push({
      id: `coverage:${field.field}`,
      kind: "evidence_note",
      priority: 4,
      title: "Metadata coverage note",
      summary: field.summary,
      statusLabel: field.status === "missing" ? "Coverage missing" : "Coverage partial",
      filter: "rules",
      finding: {
        key: `coverage-${field.field}`,
        message: field.summary,
        summary: field.summary,
        trackId: null,
        trackTitle: null
      }
    });
  }

  return items.sort((left, right) => {
    if (left.priority !== right.priority) {
      return left.priority - right.priority;
    }
    return left.title.localeCompare(right.title);
  });
}

export function issueInboxSummary(items: IssueInboxItem[]): string {
  const rejectedCount = items.filter((item) => item.kind === "rejected_candidate").length;
  const reviewCount = items.filter((item) => item.kind === "review_action").length;
  const verifiedRuleCount = items.filter((item) => item.kind === "verified_rule_issue").length;
  const evidenceCount = items.filter((item) => item.kind === "evidence_note").length;

  if (rejectedCount > 0) {
    return `Next up: repair ${rejectedCount} rejected candidate${rejectedCount === 1 ? "" : "s"}.`;
  }
  if (reviewCount > 0) {
    return `Next up: review ${reviewCount} curator action${reviewCount === 1 ? "" : "s"}.`;
  }
  if (verifiedRuleCount > 0) {
    return `Next up: clean up ${verifiedRuleCount} verified-rule issue${verifiedRuleCount === 1 ? "" : "s"}.`;
  }
  if (evidenceCount > 0) {
    return `Next up: review ${evidenceCount} metadata coverage note${evidenceCount === 1 ? "" : "s"}.`;
  }
  return "No active issues. History keeps the receipts from earlier fixes.";
}
