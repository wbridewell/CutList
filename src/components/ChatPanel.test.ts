import { describe, expect, it } from "vitest";
import { restoreCuratorTurnUndoState, shouldClearStaleReviewState } from "@/components/ChatPanel";
import { classifyComposerRequest } from "@/lib/client/workflows";
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

  it("routes explicit composer review prompts to playlist review instead of curator edit requests", () => {
    const populatedPlaylist = {
      ...playlist,
      tracks: [{
        id: "track-1",
        title: "Song",
        artist: "Artist",
        album: null,
        durationMs: 180000,
        runtime: "3:00",
        verified: true,
        source: "manual" as const,
        sourceId: "track-1",
        sourceUrl: null,
        artworkUrl: null,
        vibeTags: [],
        genreTags: [],
        rationale: null,
        energy: null,
        verificationNote: "Manual."
      }]
    };
    expect(classifyComposerRequest("Review this playlist and name the two tracks that weaken its identity.", populatedPlaylist)).toBe("review_only");
    expect(classifyComposerRequest("Analyze what is working here.", populatedPlaylist)).toBe("review_only");
    expect(classifyComposerRequest("Review this playlist. Suggest two tracks by Tori Amos.", populatedPlaylist)).toBe("mixed_review_and_curator");
    expect(classifyComposerRequest("Reorder the playlist to improve flow without adding or removing songs.", populatedPlaylist)).toBe("curator_only");
    expect(classifyComposerRequest("Review this playlist.", { ...playlist, tracks: [] })).toBe("curator_only");
  });
});
