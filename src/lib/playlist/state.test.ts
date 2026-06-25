import { describe, expect, it } from "vitest";
import {
  addTracksToPlaylist,
  applyCuratorResponse,
  insertTracksAfterTrack,
  insertTracksBeforeTrack,
  isDuplicateTrack,
  moveTrackInPlaylist,
  removePlaylistConstraint,
  removeTrackFromPlaylist,
  removeTracksFromPlaylist,
  reorderTrackInPlaylist,
  updatePlaylistDiscoveryRadius,
  updatePlaylistTextField
} from "@/lib/playlist/state";
import type { CuratorResponse, PlaylistState, Track } from "@/types/playlist";

const trackA: Track = {
  id: "itunes:1",
  title: "Song A",
  artist: "Artist A",
  album: "Album A",
  durationMs: 120000,
  runtime: "2:00",
  verified: true,
  source: "itunes",
  sourceId: "1",
  sourceUrl: null,
  artworkUrl: null,
  explicit: false,
  releaseDate: null,
  vibeTags: [],
  genreTags: ["rock"],
  rationale: null,
  energy: null,
  verificationNote: null
};

const trackB: Track = {
  ...trackA,
  id: "musicbrainz:2",
  title: "Song B",
  artist: "Artist B",
  source: "musicbrainz",
  sourceId: "2"
};

const playlist: PlaylistState = {
  id: "playlist",
  title: "Before",
  mood: "Old mood",
  arc: null,
  tracks: [trackA],
  constraints: {
    maxTrackDurationMs: 180000,
    excludedArtists: ["Blocked"],
    requiredGenreAdditions: [{ genre: "punk", count: 2 }]
  },
  discoveryRadius: "moderate",
  conversationSummary: null,
  updatedAt: "2026-05-27T00:00:00Z"
};

describe("playlist state operations", () => {
  it("applies curator add updates with meta and constraints", () => {
    const response: CuratorResponse = {
      message: "Added.",
      playlistUpdate: { action: "add", tracks: [trackB], orderRationale: null },
      playlistMeta: { title: "After", mood: "New mood", arc: "Rise" },
      updatedConstraints: { minTrackDurationMs: 60000 },
      constraintReport: { passed: true, totalDurationMs: 240000, violations: [] },
      rejectedCandidates: []
    };

    const next = applyCuratorResponse(playlist, response, "2026-05-27T00:00:01Z");

    expect(next.tracks).toEqual([trackA, trackB]);
    expect(next.title).toBe("After");
    expect(next.mood).toBe("New mood");
    expect(next.arc).toBe("Rise");
    expect(next.constraints).toEqual({ minTrackDurationMs: 60000 });
    expect(next.updatedAt).toBe("2026-05-27T00:00:01Z");
  });

  it("applies curator remove updates", () => {
    const response: CuratorResponse = {
      message: "Removed.",
      playlistUpdate: { action: "remove", tracks: [trackA], orderRationale: null },
      playlistMeta: null,
      updatedConstraints: undefined,
      constraintReport: { passed: true, totalDurationMs: 0, violations: [] },
      rejectedCandidates: []
    };

    expect(applyCuratorResponse({ ...playlist, tracks: [trackA, trackB] }, response).tracks).toEqual([trackB]);
  });

  it("adds, removes, reorders, and edits playlist data immutably", () => {
    const withAdded = addTracksToPlaylist(playlist, [trackB], "added");
    expect(withAdded.tracks).toEqual([trackA, trackB]);

    const inserted = insertTracksAfterTrack({ ...playlist, tracks: [trackA, trackB] }, trackA.id, [
      { ...trackB, id: "itunes:3", title: "Bridge" }
    ], "inserted");
    expect(inserted.tracks.map((track) => track.title)).toEqual(["Song A", "Bridge", "Song B"]);
    expect(inserted.updatedAt).toBe("inserted");

    const appended = insertTracksAfterTrack(playlist, "missing", [trackB], "fallback");
    expect(appended.tracks).toEqual([trackA, trackB]);
    expect(appended.updatedAt).toBe("fallback");

    const insertedBefore = insertTracksBeforeTrack({ ...playlist, tracks: [trackA, trackB] }, trackB.id, [
      { ...trackB, id: "itunes:4", title: "Lead-in" }
    ], "before");
    expect(insertedBefore.tracks.map((track) => track.title)).toEqual(["Song A", "Lead-in", "Song B"]);
    expect(insertedBefore.updatedAt).toBe("before");

    const moved = moveTrackInPlaylist(withAdded, 1, -1, "moved");
    expect(moved.tracks).toEqual([trackB, trackA]);
    expect(moveTrackInPlaylist(moved, 0, -1)).toBe(moved);

    const reordered = reorderTrackInPlaylist(moved, 0, 1, "reordered");
    expect(reordered.tracks).toEqual([trackA, trackB]);
    expect(reordered.updatedAt).toBe("reordered");
    expect(reorderTrackInPlaylist(reordered, 0, 0)).toBe(reordered);
    expect(reorderTrackInPlaylist(reordered, -1, 1)).toBe(reordered);

    const removed = removeTrackFromPlaylist(moved, trackB.id, "removed");
    expect(removed.tracks).toEqual([trackA]);

    const bulkRemoved = removeTracksFromPlaylist(withAdded, [trackA.id, trackB.id], "bulk-removed");
    expect(bulkRemoved.tracks).toEqual([]);
    expect(bulkRemoved.updatedAt).toBe("bulk-removed");
    expect(removeTracksFromPlaylist(withAdded, ["missing"])).toBe(withAdded);

    const edited = updatePlaylistTextField(removed, "mood", "  ", "edited");
    expect(edited.mood).toBeNull();
    expect(edited.updatedAt).toBe("edited");

    const radius = updatePlaylistDiscoveryRadius(playlist, "adventurous", "radius");
    expect(radius.discoveryRadius).toBe("adventurous");
    expect(radius.updatedAt).toBe("radius");
  });

  it("removes scalar and list constraints while ignoring malformed keys", () => {
    expect(removePlaylistConstraint(playlist, "maxTrackDurationMs", "one").constraints.maxTrackDurationMs).toBeUndefined();
    expect(removePlaylistConstraint(playlist, "excludedArtists:0", "two").constraints.excludedArtists).toBeUndefined();
    expect(removePlaylistConstraint(playlist, "requiredGenreAdditions:0", "three").constraints.requiredGenreAdditions).toBeUndefined();
    expect(removePlaylistConstraint({
      ...playlist,
      constraints: {
        ...playlist.constraints,
        vocalProfile: "female_vocals",
        energyTrajectory: { direction: "gradual_rise" },
        preferredGenres: ["rock"],
        notes: ["Keep it tense."]
      }
    }, "vocalProfile", "four").constraints.vocalProfile).toBeUndefined();
    expect(removePlaylistConstraint({
      ...playlist,
      constraints: {
        ...playlist.constraints,
        vocalProfile: "female_vocals",
        energyTrajectory: { direction: "gradual_rise" },
        preferredGenres: ["rock"],
        notes: ["Keep it tense."]
      }
    }, "energyTrajectory", "five").constraints.energyTrajectory).toBeUndefined();
    expect(removePlaylistConstraint({
      ...playlist,
      constraints: {
        ...playlist.constraints,
        preferredGenres: ["rock"],
        notes: ["Keep it tense."]
      }
    }, "preferredGenres:0", "six").constraints.preferredGenres).toBeUndefined();
    expect(removePlaylistConstraint({
      ...playlist,
      constraints: {
        ...playlist.constraints,
        preferredGenres: ["rock"],
        notes: ["Keep it tense."]
      }
    }, "notes:0", "seven").constraints.notes).toBeUndefined();
    expect(removePlaylistConstraint(playlist, "excludedArtists:not-a-number")).toBe(playlist);
    expect(removePlaylistConstraint(playlist, "missing:0")).toBe(playlist);
  });

  it("detects duplicates by provider id and normalized artist/title", () => {
    expect(isDuplicateTrack(playlist, { ...trackB, source: "itunes", sourceId: "1" })).toBe(true);
    expect(isDuplicateTrack(playlist, { ...trackB, artist: "artist a", title: "song a", sourceId: "new" })).toBe(true);
    expect(isDuplicateTrack(playlist, trackB)).toBe(false);
  });
});
