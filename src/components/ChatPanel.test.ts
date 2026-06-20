import { describe, expect, it } from "vitest";
import { shouldClearStaleReviewState } from "@/components/ChatPanel";
import type { RequestHistoryEntry } from "@/lib/playlist/collaboration";
import type { AnalyzePlaylistResponse } from "@/types/playlist";

const review: AnalyzePlaylistResponse = {
  message: "Needs review.",
  strengths: [],
  weakLinks: [],
  sequencingNotes: [],
  constraintReport: { passed: true, totalDurationMs: 0, violations: [], evidenceWarnings: [] },
  suggestedEdits: [],
  intentSummary: {
    playlistIdentity: "Test identity.",
    preservedQualities: [],
    likelyUserIntent: "Keep the pressure.",
    riskNotes: [],
    confidence: "medium"
  },
  trackRoles: [],
  transitionReview: [],
  reviewSuggestions: []
};

const historyEntry: RequestHistoryEntry = {
  id: "review-entry",
  userMessage: "Review this.",
  assistantMessage: "Needs review.",
  acceptedCount: 0,
  rejectedCandidates: [],
  createdAt: "2026-06-20T00:00:00.000Z",
  kind: "review",
  reviewSuggestions: []
};

describe("ChatPanel stale review cleanup", () => {
  it("clears stale review state when the backing entry disappears", () => {
    expect(shouldClearStaleReviewState([], "review-entry", review)).toBe(true);
    expect(shouldClearStaleReviewState([historyEntry], "review-entry", review)).toBe(false);
  });

  it("clears orphaned review state when there is no backing entry id and the history is empty", () => {
    expect(shouldClearStaleReviewState([], null, review)).toBe(true);
    expect(shouldClearStaleReviewState([], null, null)).toBe(false);
  });
});
