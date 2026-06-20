import { describe, expect, it } from "vitest";
import {
  createReviewSuggestionIssueStatuses,
  createErrorHistoryEntry,
  createImportHistoryEntry,
  createManualMatchHistoryEntry,
  createPlaylistReviewHistoryEntry,
  createRejectedCandidateIssueStatuses,
  createRequestHistoryEntry,
  createSeedVerificationHistoryEntry,
  rejectedCandidateIssueId,
  rejectedCandidateSiblingIssueIds,
  rejectedCandidateSummary,
  reorderSummaryForMessage,
  summarizeReorder,
  trackFromAttemptedMatch
} from "@/lib/playlist/collaboration";
import type { AnalyzePlaylistResponse, AttemptedMatch, CuratorResponse, PlaylistState, Track } from "@/types/playlist";

const track: Track = {
  id: "itunes:1",
  title: "Song",
  artist: "Artist",
  album: null,
  durationMs: 123000,
  runtime: "2:03",
  verified: true,
  source: "itunes",
  sourceId: "1",
  sourceUrl: null,
  artworkUrl: null,
  explicit: false,
  releaseDate: null,
  vibeTags: [],
  genreTags: [],
  rationale: null,
  energy: null,
  verificationNote: "Verified."
};

describe("collaboration helpers", () => {
  it("creates request and error history entries", () => {
    const response: CuratorResponse = {
      message: "Done.",
      playlistUpdate: { action: "add", tracks: [track], orderRationale: null },
      playlistMeta: null,
      updatedConstraints: {},
      constraintReport: { passed: true, totalDurationMs: 123000, violations: [] },
      rejectedCandidates: [{ artist: "Nope", title: "Bad", reason: "Missing" }]
    };

    const entry = createRequestHistoryEntry("add one", "Done.", response, "now");
    expect(entry.acceptedCount).toBe(1);
    expect(entry.rejectedCandidates).toEqual(response.rejectedCandidates);
    expect(entry.kind).toBe("request");

    const error = createErrorHistoryEntry("add one", "Timed out.", "later");
    expect(error.error).toBe("Timed out.");
    expect(error.acceptedCount).toBe(0);
    expect(error.kind).toBe("error");
  });

  it("groups seed verification under one request even without rejections", () => {
    const entry = createSeedVerificationHistoryEntry(2, [], "now");

    expect(entry.userMessage).toBe("Seed track verification");
    expect(entry.assistantMessage).toBe("Verified 2 seed tracks.");
    expect(entry.rejectedCandidates).toHaveLength(0);
    expect(entry.kind).toBe("seed");
  });

  it("creates import, review, and manual match history entries", () => {
    const rejected = [{ artist: "Nope", title: "Bad", reason: "Missing" }];
    const imported = createImportHistoryEntry(3, rejected, "A bright draft.", "import-time");
    const reviewData: Pick<AnalyzePlaylistResponse, "reviewSuggestions"> = {
      reviewSuggestions: [{
        id: "suggestion-1",
        type: "replace",
        applicationMode: "verify_candidate",
        affectedTrackIds: ["itunes:1"],
        rationale: "Cleaner fit.",
        intentPreservation: "Keeps the opener energy.",
        risk: null,
        confidence: "medium",
        suggestedPrompt: "Swap the opener."
      }]
    };
    const review = createPlaylistReviewHistoryEntry("Strong opener.", reviewData, "review-time");
    const manual = createManualMatchHistoryEntry(track, "manual-time");

    expect(imported).toMatchObject({
      userMessage: "Import and verify",
      acceptedCount: 3,
      rejectedCandidates: rejected,
      createdAt: "import-time",
      kind: "import"
    });
    expect(imported.assistantMessage).toContain("A bright draft.");
    expect(review).toMatchObject({
      userMessage: "Review playlist",
      assistantMessage: "Strong opener.",
      acceptedCount: 0,
      kind: "review"
    });
    expect(review.reviewSuggestions).toEqual(reviewData.reviewSuggestions);
    expect(review.issueStatuses).toEqual([{
      issueId: "suggestion-1",
      issueKind: "review_suggestion",
      status: "open",
      actedAt: null
    }]);
    expect(manual).toMatchObject({
      userMessage: "Accepted reviewed match",
      assistantMessage: "Added Artist - Song.",
      acceptedCount: 1,
      kind: "manual-match"
    });
  });

  it("formats rejected candidate summaries", () => {
    expect(rejectedCandidateSummary([{ artist: "A", title: "B", reason: "No match" }])).toBe("Rejected A - B: No match");
  });

  it("derives stable issue ids and initial statuses for live issues", () => {
    const candidate = {
      artist: "A",
      title: "B",
      reason: "No match",
      violatedConstraint: "maxTrackDurationMs" as const,
      attemptedMatches: [{
        source: "itunes" as const,
        sourceId: "123",
        title: "B",
        artist: "A",
        album: null,
        durationMs: 123000,
        runtime: "2:03",
        score: 0.5,
        confidence: "medium" as const
      }]
    };

    expect(rejectedCandidateIssueId(candidate)).toBe(rejectedCandidateIssueId({ ...candidate }));
    expect(createRejectedCandidateIssueStatuses([candidate])).toEqual([{
      issueId: rejectedCandidateIssueId(candidate),
      issueKind: "rejected_candidate",
      status: "blocked",
      actedAt: null
    }]);
    expect(createReviewSuggestionIssueStatuses([{
      id: "suggestion-2",
      type: "add_bridge",
      applicationMode: "verify_candidate",
      affectedTrackIds: ["itunes:1", "itunes:2"],
      rationale: "Bridge the gap.",
      intentPreservation: "Keeps the pacing.",
      risk: null,
      confidence: "high",
      suggestedPrompt: "Find a bridge."
    }])).toEqual([{
      issueId: "suggestion-2",
      issueKind: "review_suggestion",
      status: "open",
      actedAt: null
    }]);
  });

  it("finds sibling rejected candidate issue ids for the same normalized artist and title", () => {
    const first = {
      artist: "Goblin",
      title: "Deep Red",
      reason: "Ambiguous match.",
      attemptedMatches: [{
        source: "itunes" as const,
        sourceId: "123",
        title: "Deep Red",
        artist: "Goblin",
        album: null,
        durationMs: 123000,
        runtime: "2:03",
        score: 0.5,
        confidence: "medium" as const
      }]
    };
    const second = {
      artist: "Goblin",
      title: "Deep Red",
      reason: "No credible match.",
      attemptedMatches: [{
        source: "itunes" as const,
        sourceId: "456",
        title: "Deep Red",
        artist: "Goblin",
        album: null,
        durationMs: 124000,
        runtime: "2:04",
        score: 0.4,
        confidence: "low" as const
      }]
    };
    const unrelated = {
      artist: "Goblin",
      title: "Suspiria",
      reason: "No credible match."
    };

    expect(rejectedCandidateSiblingIssueIds({
      rejectedCandidates: [first, second, unrelated]
    }, {
      artist: "goblin",
      title: "deep red"
    })).toEqual([
      rejectedCandidateIssueId(first),
      rejectedCandidateIssueId(second)
    ]);
  });

  it("summarizes curator reorder responses", () => {
    const trackB = { ...track, id: "itunes:2", title: "Second", artist: "Artist B", sourceId: "2" };
    const playlistBefore: PlaylistState = {
      id: "playlist",
      title: "Before",
      mood: null,
      arc: null,
      tracks: [track, trackB],
      constraints: {},
      discoveryRadius: "moderate",
      conversationSummary: null,
      updatedAt: "before"
    };
    const response: CuratorResponse = {
      message: "Reordered.",
      playlistUpdate: { action: "reorder", tracks: [trackB, track], orderRationale: "The second track opens stronger." },
      playlistMeta: null,
      updatedConstraints: {},
      constraintReport: { passed: true, totalDurationMs: 246000, violations: [] },
      rejectedCandidates: []
    };

    const summary = summarizeReorder(response, playlistBefore);
    const message = reorderSummaryForMessage(response, playlistBefore);
    const entry = createRequestHistoryEntry("improve the flow", "Reordered.", response, {
      createdAt: "reorder-time",
      playlistBefore
    });

    expect(summary?.movedTrackCount).toBe(2);
    expect(summary?.movedTrackSummary).toEqual([
      "2 -> 1 · Second by Artist B",
      "1 -> 2 · Song by Artist"
    ]);
    expect(message).toContain("Reordered 2 tracks.");
    expect(message).toContain("Sequencing rationale: The second track opens stronger.");
    expect(entry).toMatchObject({
      playlistAction: "reorder",
      movedTrackCount: 2,
      orderRationale: "The second track opens stronger."
    });
  });

  it("converts attempted matches into manual verified tracks", () => {
    const match: AttemptedMatch = {
      sourceId: "abc",
      title: "Manual Song",
      artist: "Manual Artist",
      album: "Manual Album",
      durationMs: 61000,
      runtime: null,
      source: "musicbrainz",
      sourceUrl: "https://musicbrainz.org/recording/abc",
      artworkUrl: null,
      explicit: null,
      releaseDate: "1977",
      primaryGenreName: "Post Punk",
      score: 0.7,
      confidence: "medium"
    };

    const manualTrack = trackFromAttemptedMatch(match);

    expect(manualTrack?.id).toBe("musicbrainz:abc");
    expect(manualTrack?.runtime).toBe("1:01");
    expect(manualTrack?.genreTags).toEqual(["post punk"]);
    expect(manualTrack?.verificationConfidence).toBe("manual");
    expect(trackFromAttemptedMatch({ ...match, sourceId: undefined })).toBeNull();
  });
});
