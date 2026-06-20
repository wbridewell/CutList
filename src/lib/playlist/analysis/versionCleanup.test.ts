import { describe, expect, it } from "vitest";
import { removeAlternateTrackVersions } from "@/lib/playlist/analysis/versionCleanup";
import type { Track } from "@/types/playlist";

function track(id: string, title: string, album: string | null = "Album"): Track {
  return {
    id,
    title,
    artist: "Tool",
    album,
    durationMs: 300000,
    runtime: "5:00",
    verified: true,
    source: "itunes",
    sourceId: id,
    sourceUrl: "https://example.com",
    artworkUrl: null,
    explicit: false,
    releaseDate: null,
    vibeTags: [],
    genreTags: [],
    rationale: null,
    energy: null,
    verificationNote: "Verified.",
    verificationConfidence: "high"
  };
}

describe("version cleanup", () => {
  it("keeps the best version and removes alternate versions of the same track", () => {
    const original = track("1", "Schism", "Lateralus");
    const live = track("2", "Schism (Live)", "Live Album");
    const remaster = track("3", "Schism - Remastered", "Deluxe Edition");
    const other = track("4", "Sober", "Undertow");

    const result = removeAlternateTrackVersions([live, original, other, remaster]);

    expect(result.keptTracks.map((item) => item.id)).toEqual(["1", "4"]);
    expect(result.removedTracks.map((item) => item.id)).toEqual(["2", "3"]);
  });

  it("does not collapse tracks by different artists", () => {
    const tool = track("1", "Sober");
    const cover = { ...track("2", "Sober"), artist: "Other Artist" };

    const result = removeAlternateTrackVersions([tool, cover]);

    expect(result.keptTracks).toEqual([tool, cover]);
    expect(result.removedTracks).toEqual([]);
  });
});
