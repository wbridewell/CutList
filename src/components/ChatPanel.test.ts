import { describe, expect, it } from "vitest";
import { restoreCuratorTurnUndoState, shouldClearStaleReviewState } from "@/components/ChatPanel";
import type { RequestHistoryEntry } from "@/lib/playlist/collaboration";
import type { AnalyzePlaylistResponse, PlaylistState } from "@/types/playlist";

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

const playlist: PlaylistState = {
  id: "playlist-1",
  title: "Test",
  mood: null,
  arc: null,
  tracks: [],
  constraints: {},
  discoveryRadius: "moderate",
  conversationSummary: null,
  updatedAt: "2026-06-20T00:01:00.000Z"
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

  it("restores curator turn undo state only when the saved resulting revision still matches the current playlist", () => {
    const undoableHistory: RequestHistoryEntry = {
      id: "request-1",
      userMessage: "Fix this.",
      assistantMessage: "Done.",
      acceptedCount: 1,
      rejectedCandidates: [],
      createdAt: "2026-06-20T00:02:00.000Z",
      kind: "request",
      playlistBefore: { ...playlist, title: "Before", updatedAt: "2026-06-20T00:00:00.000Z" },
      resultingPlaylistUpdatedAt: "2026-06-20T00:01:00.000Z"
    };

    expect(restoreCuratorTurnUndoState([undoableHistory], playlist)).toEqual({
      expectedUpdatedAt: "2026-06-20T00:01:00.000Z",
      previousPlaylist: { ...playlist, title: "Before", updatedAt: "2026-06-20T00:00:00.000Z" },
      sourceEntryId: "request-1"
    });
    expect(restoreCuratorTurnUndoState([undoableHistory], { ...playlist, updatedAt: "2026-06-20T00:03:00.000Z" })).toBeNull();
  });
});
