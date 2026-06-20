import { describe, expect, it } from "vitest";
import { createManualMatchHistoryEntry, createRequestHistoryEntry, reorderSummaryForMessage, trackFromAttemptedMatch } from "@/lib/playlist/collaboration";
import { devFixtureHistory, devFixtureMessages, devPlaylistFixture } from "@/lib/playlist/fixtures/devFixtures";
import { exportPlaylist } from "@/lib/playlist/io/exports";
import { parseLocalDraft, serializeLocalDraft } from "@/lib/playlist/io/localDraft";
import { addTracksToPlaylist, applyCuratorResponse, isDuplicateTrack } from "@/lib/playlist/state";
import type { AttemptedMatch, CuratorResponse, PlaylistState, Track } from "@/types/playlist";

function track(overrides: Partial<Track> = {}): Track {
  return {
    id: overrides.id ?? "itunes:1",
    title: overrides.title ?? "Opening Song",
    artist: overrides.artist ?? "Fixture Artist",
    album: overrides.album ?? "Fixture Album",
    durationMs: overrides.durationMs ?? 180000,
    runtime: overrides.runtime ?? "3:00",
    verified: overrides.verified ?? true,
    source: overrides.source ?? "itunes",
    sourceId: overrides.sourceId ?? "1",
    sourceUrl: overrides.sourceUrl ?? null,
    artworkUrl: overrides.artworkUrl ?? null,
    explicit: overrides.explicit ?? false,
    releaseDate: overrides.releaseDate ?? null,
    vibeTags: overrides.vibeTags ?? ["tension"],
    genreTags: overrides.genreTags ?? ["rock"],
    rationale: overrides.rationale ?? "Starts the playlist with pressure.",
    fitNotes: overrides.fitNotes ?? "Fits the opening act by creating forward pressure.",
    energy: overrides.energy ?? 7,
    verificationNote: overrides.verificationNote ?? "Verified.",
    verificationConfidence: overrides.verificationConfidence ?? "high"
  };
}

function playlist(tracks: Track[]): PlaylistState {
  return {
    id: "workflow-playlist",
    title: "Workflow Playlist",
    mood: "A test playlist.",
    arc: null,
    tracks,
    constraints: {},
    discoveryRadius: "moderate",
    conversationSummary: null,
    updatedAt: "2026-06-03T00:00:00.000Z"
  };
}

describe("playlist workflows", () => {
  it("loads fixture data that exercises constraints, fit notes, reorder history, and rejected matches", () => {
    expect(devPlaylistFixture.tracks.length).toBeGreaterThan(0);
    expect(devPlaylistFixture.constraints.maxTrackDurationMs).toBe(300000);
    expect(devPlaylistFixture.tracks.every((item) => item.fitNotes && item.fitNotes.length > 20)).toBe(true);
    expect(devFixtureMessages[0].content).toContain("Development fixture loaded");

    const reorderEntry = devFixtureHistory.find((entry) => entry.playlistAction === "reorder");
    const rejectionEntry = devFixtureHistory.find((entry) => entry.rejectedCandidates.length > 0);

    expect(reorderEntry?.movedTrackSummary?.[0]).toContain("->");
    expect(reorderEntry?.orderRationale).toContain("fourth-act lift");
    expect(rejectionEntry?.rejectedCandidates.some((candidate) => candidate.violatedConstraint === "maxTrackDurationMs")).toBe(true);
    expect(rejectionEntry?.rejectedCandidates.some((candidate) => candidate.attemptedMatches?.some((match) => !match.sourceId))).toBe(true);
  });

  it("applies an LLM reorder, records movement history, persists it, and exports track fit notes", () => {
    const opening = track({ id: "itunes:1", title: "Opening Song", artist: "Alpha" });
    const closer = track({
      id: "itunes:2",
      sourceId: "2",
      title: "Redemption Song",
      artist: "Beta",
      fitNotes: "Resolves the playlist by turning pressure into release.",
      rationale: "Works better as the final release."
    });
    const before = playlist([opening, closer]);
    const response: CuratorResponse = {
      message: "I moved the redemptive track to the front to make the arc clearer.",
      playlistUpdate: {
        action: "reorder",
        tracks: [closer, opening],
        orderRationale: "The redemptive track creates a stronger opening thesis before the pressure returns."
      },
      playlistMeta: {
        title: "Reordered Workflow Playlist",
        mood: null,
        arc: "Release first, pressure second."
      },
      updatedConstraints: {},
      constraintReport: { passed: true, totalDurationMs: 360000, violations: [] },
      rejectedCandidates: []
    };

    const after = applyCuratorResponse(before, response, "2026-06-03T00:00:01.000Z");
    const assistantMessage = [response.message, reorderSummaryForMessage(response, before)].filter(Boolean).join("\n\n");
    const historyEntry = createRequestHistoryEntry("Improve the flow.", response.message, response, {
      createdAt: "2026-06-03T00:00:02.000Z",
      playlistBefore: before
    });
    const draft = parseLocalDraft(serializeLocalDraft({
      playlist: after,
      messages: [
        { role: "user", content: "Improve the flow." },
        { role: "assistant", content: assistantMessage }
      ],
      history: [historyEntry],
      savedAt: "2026-06-03T00:00:03.000Z"
    }));
    const csv = exportPlaylist(after, "csv");

    expect(after.title).toBe("Reordered Workflow Playlist");
    expect(after.tracks.map((item) => item.id)).toEqual(["itunes:2", "itunes:1"]);
    expect(historyEntry).toMatchObject({
      playlistAction: "reorder",
      movedTrackCount: 2,
      orderRationale: "The redemptive track creates a stronger opening thesis before the pressure returns."
    });
    expect(historyEntry.movedTrackSummary).toEqual([
      "2 -> 1 · Redemption Song by Beta",
      "1 -> 2 · Opening Song by Alpha"
    ]);
    expect(draft?.history[0].movedTrackSummary).toEqual(historyEntry.movedTrackSummary);
    expect(draft?.playlist.tracks[0].fitNotes).toBe("Resolves the playlist by turning pressure into release.");
    expect(csv.content).toContain("FitNotes");
    expect(csv.content).toContain("Resolves the playlist by turning pressure into release.");
  });

  it("turns an accepted reviewed match into a manual track and history item without duplicating existing tracks", () => {
    const existing = track({ id: "itunes:existing", sourceId: "existing", title: "Existing Song", artist: "Gamma" });
    const base = playlist([existing]);
    const match: AttemptedMatch = {
      artist: "Delta",
      title: "Manual Candidate",
      album: "Manual Album",
      durationMs: 210000,
      runtime: "3:30",
      source: "musicbrainz",
      sourceId: "mb-1",
      sourceUrl: "https://musicbrainz.org/recording/mb-1",
      artworkUrl: null,
      confidence: "medium",
      score: 0.78,
      primaryGenreName: "Soul"
    };

    const manualTrack = trackFromAttemptedMatch(match);
    expect(manualTrack).not.toBeNull();
    const after = manualTrack ? addTracksToPlaylist(base, [manualTrack], "2026-06-03T00:00:04.000Z") : base;
    const manualHistory = manualTrack ? createManualMatchHistoryEntry(manualTrack, "2026-06-03T00:00:05.000Z") : null;

    expect(after.tracks.map((item) => item.title)).toEqual(["Existing Song", "Manual Candidate"]);
    expect(manualTrack?.verificationConfidence).toBe("manual");
    expect(manualTrack?.genreTags).toEqual(["soul"]);
    expect(manualHistory).toMatchObject({
      kind: "manual-match",
      acceptedCount: 1,
      assistantMessage: "Added Delta - Manual Candidate."
    });
    expect(isDuplicateTrack(after, manualTrack!)).toBe(true);
  });
});
