import { normalizeText } from "@/lib/music/normalize";
import { acceptedCountForPlaylistUpdate, summarizePlaylistUpdate } from "@/lib/playlist/operations";
import { formatRuntime } from "@/lib/playlist/runtime";
import type {
  AnalyzePlaylistResponse,
  AttemptedMatch,
  CuratorResponse,
  PlaylistState,
  RejectedCandidate,
  ReviewSuggestion,
  Track
} from "@/types/playlist";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type RequestHistoryKind = "request" | "seed" | "import" | "review" | "manual-match" | "error" | "undo";

export type HistoryIssueKind = "rejected_candidate" | "review_suggestion";
export type RejectedCandidateIssueStatus = "rejected" | "accepted" | "dismissed" | "blocked";
export type ReviewSuggestionIssueStatus = "open" | "applied" | "requested" | "ignored" | "dismissed";
export type HistoryIssueStatusValue = RejectedCandidateIssueStatus | ReviewSuggestionIssueStatus;

export type HistoryIssueStatus = {
  issueId: string;
  issueKind: HistoryIssueKind;
  status: HistoryIssueStatusValue;
  actedAt: string | null;
};

export type RequestHistoryEntry = {
  id: string;
  userMessage: string;
  assistantMessage: string;
  acceptedCount: number;
  rejectedCandidates: RejectedCandidate[];
  createdAt: string;
  kind?: RequestHistoryKind;
  error?: string;
  movedTrackCount?: number;
  movedTrackSummary?: string[];
  orderRationale?: string | null;
  playlistAction?: NonNullable<CuratorResponse["playlistUpdate"]>["action"];
  playlistBefore?: PlaylistState;
  resultingPlaylistUpdatedAt?: string;
  reviewSuggestions?: ReviewSuggestion[];
  issueStatuses?: HistoryIssueStatus[];
};

type RequestHistoryOptions = {
  createdAt?: string;
  playlistBefore?: PlaylistState;
  resultingPlaylistUpdatedAt?: string;
};

export function createCollaborationId(createdAt = new Date().toISOString()): string {
  return `${createdAt}:${Math.random().toString(36).slice(2)}`;
}

export function createRequestHistoryEntry(
  userMessage: string,
  assistantMessage: string,
  response: CuratorResponse,
  options: RequestHistoryOptions | string = {}
): RequestHistoryEntry {
  const createdAt = typeof options === "string" ? options : options.createdAt ?? new Date().toISOString();
  const reorderSummary = typeof options === "string"
    ? null
    : summarizeReorder(response, options.playlistBefore);

  return {
    id: createCollaborationId(createdAt),
    userMessage,
    assistantMessage,
    acceptedCount: acceptedCountForPlaylistUpdate(response.playlistUpdate),
    rejectedCandidates: response.rejectedCandidates,
    createdAt,
    kind: "request",
    movedTrackCount: reorderSummary?.movedTrackCount,
    movedTrackSummary: reorderSummary?.movedTrackSummary,
    orderRationale: response.playlistUpdate?.action === "reorder" ? response.playlistUpdate.orderRationale : null,
    playlistAction: response.playlistUpdate?.action,
    playlistBefore: typeof options === "string" ? undefined : options.playlistBefore,
    resultingPlaylistUpdatedAt: typeof options === "string" ? undefined : options.resultingPlaylistUpdatedAt,
    issueStatuses: createRejectedCandidateIssueStatuses(response.rejectedCandidates)
  };
}

export function createErrorHistoryEntry(
  userMessage: string,
  assistantMessage: string,
  createdAt = new Date().toISOString()
): RequestHistoryEntry {
  return {
    id: createCollaborationId(createdAt),
    userMessage,
    assistantMessage,
    acceptedCount: 0,
    rejectedCandidates: [],
    createdAt,
    kind: "error",
    error: assistantMessage,
    issueStatuses: []
  };
}

export function createSeedVerificationHistoryEntry(
  acceptedCount: number,
  rejectedCandidates: RejectedCandidate[],
  createdAt = new Date().toISOString()
): RequestHistoryEntry {
  return {
    id: createCollaborationId(createdAt),
    userMessage: "Seed track verification",
    assistantMessage: `Verified ${acceptedCount} seed track${acceptedCount === 1 ? "" : "s"}.`,
    acceptedCount,
    rejectedCandidates,
    createdAt,
    kind: "seed",
    issueStatuses: createRejectedCandidateIssueStatuses(rejectedCandidates)
  };
}

export function createImportHistoryEntry(
  acceptedCount: number,
  rejectedCandidates: RejectedCandidate[],
  extractedVibeBrief: string | null,
  createdAt = new Date().toISOString()
): RequestHistoryEntry {
  return {
    id: createCollaborationId(createdAt),
    userMessage: "Import and verify",
    assistantMessage: [
      extractedVibeBrief ? `Vibe brief: ${extractedVibeBrief}` : null,
      `Imported ${acceptedCount} verified track${acceptedCount === 1 ? "" : "s"} and rejected ${rejectedCandidates.length}.`
    ].filter(Boolean).join("\n"),
    acceptedCount,
    rejectedCandidates,
    createdAt,
    kind: "import",
    issueStatuses: createRejectedCandidateIssueStatuses(rejectedCandidates)
  };
}

export function createPlaylistReviewHistoryEntry(
  assistantMessage: string,
  review: Pick<AnalyzePlaylistResponse, "reviewSuggestions">,
  createdAt = new Date().toISOString()
): RequestHistoryEntry {
  return {
    id: createCollaborationId(createdAt),
    userMessage: "Review playlist",
    assistantMessage,
    acceptedCount: 0,
    rejectedCandidates: [],
    createdAt,
    kind: "review",
    reviewSuggestions: review.reviewSuggestions,
    issueStatuses: createReviewSuggestionIssueStatuses(review.reviewSuggestions)
  };
}

export function createManualMatchHistoryEntry(
  track: Track,
  optionsOrCreatedAt: { recommended?: boolean } | string = {},
  createdAt = new Date().toISOString()
): RequestHistoryEntry {
  const options = typeof optionsOrCreatedAt === "string" ? {} : optionsOrCreatedAt;
  const timestamp = typeof optionsOrCreatedAt === "string" ? optionsOrCreatedAt : createdAt;
  return {
    id: createCollaborationId(timestamp),
    userMessage: options.recommended ? "Accepted recommended match" : "Accepted reviewed match",
    assistantMessage: `Added ${track.artist} - ${track.title}.`,
    acceptedCount: 1,
    rejectedCandidates: [],
    createdAt: timestamp,
    kind: "manual-match",
    issueStatuses: []
  };
}

export function createCuratorUndoHistoryEntry(
  assistantMessage = "Undid the last curator turn. Restored the previous playlist state.",
  createdAt = new Date().toISOString()
): RequestHistoryEntry {
  return {
    id: createCollaborationId(createdAt),
    userMessage: "Undo last curator turn",
    assistantMessage,
    acceptedCount: 0,
    rejectedCandidates: [],
    createdAt,
    kind: "undo",
    issueStatuses: []
  };
}

export function rejectedCandidateIssueId(candidate: RejectedCandidate): string {
  const attempted = (candidate.attemptedMatches ?? [])
    .map((match) => [
      match.source,
      match.sourceId ?? "",
      normalizeText(match.artist),
      normalizeText(match.title)
    ].join(":"))
    .join("|");
  return [
    normalizeText(candidate.artist),
    normalizeText(candidate.title),
    normalizeText(candidate.reason),
    candidate.violatedConstraint ?? "",
    attempted
  ].join("::");
}

export function rejectedCandidateSiblingIssueIds(
  entry: Pick<RequestHistoryEntry, "rejectedCandidates">,
  match: Pick<AttemptedMatch, "artist" | "title">
): string[] {
  const targetArtist = normalizeText(match.artist);
  const targetTitle = normalizeText(match.title);

  return entry.rejectedCandidates
    .filter((candidate) => (
      normalizeText(candidate.artist) === targetArtist &&
      normalizeText(candidate.title) === targetTitle
    ))
    .map((candidate) => rejectedCandidateIssueId(candidate));
}

export function createRejectedCandidateIssueStatuses(candidates: RejectedCandidate[]): HistoryIssueStatus[] {
  return candidates.map((candidate) => ({
    issueId: rejectedCandidateIssueId(candidate),
    issueKind: "rejected_candidate",
    status: candidate.violatedConstraint ? "blocked" : "rejected",
    actedAt: null
  }));
}

export function createReviewSuggestionIssueStatuses(suggestions: ReviewSuggestion[]): HistoryIssueStatus[] {
  return suggestions.map((suggestion) => ({
    issueId: suggestion.id,
    issueKind: "review_suggestion",
    status: "open",
    actedAt: null
  }));
}

export function updateHistoryIssueStatuses(
  issueStatuses: HistoryIssueStatus[] | undefined,
  update: Pick<HistoryIssueStatus, "issueId" | "issueKind" | "status">,
  actedAt = new Date().toISOString()
): HistoryIssueStatus[] {
  const existing = issueStatuses ?? [];
  const nextStatus: HistoryIssueStatus = {
    issueId: update.issueId,
    issueKind: update.issueKind,
    status: update.status,
    actedAt
  };
  const matchIndex = existing.findIndex((item) => item.issueId === update.issueId && item.issueKind === update.issueKind);
  if (matchIndex === -1) {
    return [...existing, nextStatus];
  }

  return existing.map((item, index) => (index === matchIndex ? nextStatus : item));
}

export function rejectedCandidateStatusForEntry(
  entry: Pick<RequestHistoryEntry, "issueStatuses">,
  candidate: RejectedCandidate
): RejectedCandidateIssueStatus {
  const issueId = rejectedCandidateIssueId(candidate);
  const stored = entry.issueStatuses?.find((item) => item.issueId === issueId && item.issueKind === "rejected_candidate");
  if (stored?.status === "accepted" || stored?.status === "dismissed" || stored?.status === "blocked" || stored?.status === "rejected") {
    return stored.status;
  }
  return candidate.violatedConstraint ? "blocked" : "rejected";
}

export function reviewSuggestionStatusForEntry(
  entry: Pick<RequestHistoryEntry, "issueStatuses">,
  suggestionId: string
): ReviewSuggestionIssueStatus {
  const stored = entry.issueStatuses?.find((item) => item.issueId === suggestionId && item.issueKind === "review_suggestion");
  if (
    stored?.status === "applied" ||
    stored?.status === "requested" ||
    stored?.status === "ignored" ||
    stored?.status === "dismissed" ||
    stored?.status === "open"
  ) {
    return stored.status;
  }
  return "open";
}

export function activeRejectedCandidateCount(entry: Pick<RequestHistoryEntry, "rejectedCandidates" | "issueStatuses"> | null | undefined): number {
  if (!entry) {
    return 0;
  }

  return entry.rejectedCandidates.filter((candidate) => {
    const status = rejectedCandidateStatusForEntry(entry, candidate);
    return status !== "accepted" && status !== "dismissed";
  }).length;
}

export function rejectedCandidateSummary(rejectedCandidates: RejectedCandidate[]): string {
  return rejectedCandidates
    .map((item) => `Rejected ${item.artist} - ${item.title}: ${item.reason}${item.rejectionCode === "noCredibleMatch" && !item.violatedConstraint ? " Won't be suggested again in this session." : ""}`)
    .join("\n");
}

export function summarizeReorder(
  response: CuratorResponse,
  playlistBefore?: Pick<PlaylistState, "tracks">
): { movedTrackCount: number; movedTrackSummary: string[] } | null {
  if (response.playlistUpdate?.action !== "reorder") {
    return null;
  }

  const summary = summarizePlaylistUpdate(response.playlistUpdate, playlistBefore);
  return summary?.movedTrackCount != null && summary.movedTrackSummary
    ? { movedTrackCount: summary.movedTrackCount, movedTrackSummary: summary.movedTrackSummary }
    : null;
}

export function reorderSummaryForMessage(response: CuratorResponse, playlistBefore: Pick<PlaylistState, "tracks">): string | null {
  const summary = summarizeReorder(response, playlistBefore);
  if (!summary) {
    return null;
  }

  return [
    `Reordered ${summary.movedTrackCount} track${summary.movedTrackCount === 1 ? "" : "s"}.`,
    summary.movedTrackSummary.length ? `Movement highlights:\n${summary.movedTrackSummary.map((item) => `- ${item}`).join("\n")}` : null,
    response.playlistUpdate?.orderRationale ? `Sequencing rationale: ${response.playlistUpdate.orderRationale}` : null
  ].filter(Boolean).join("\n");
}

export function trackFromAttemptedMatch(match: AttemptedMatch): Track | null {
  if (!match.sourceId) {
    return null;
  }

  return {
    id: `${match.source}:${match.sourceId}`,
    title: match.title,
    artist: match.artist,
    album: match.album ?? null,
    durationMs: match.durationMs,
    runtime: match.runtime ?? formatRuntime(match.durationMs),
    verified: true,
    source: match.source,
    sourceId: match.sourceId,
    sourceUrl: match.sourceUrl ?? null,
    artworkUrl: match.artworkUrl ?? null,
    explicit: match.explicit ?? null,
    releaseDate: match.releaseDate ?? null,
    vibeTags: [],
    genreTags: match.primaryGenreName ? [normalizeText(match.primaryGenreName)].filter(Boolean) : [],
    rationale: "Manually selected from provider matches.",
    energy: null,
    verificationNote: `Manually selected from ${match.source}.`,
    verificationConfidence: "manual"
  };
}
