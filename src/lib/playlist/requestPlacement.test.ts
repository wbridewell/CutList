import { describe, expect, it } from "vitest";
import { resolveNamedTrack } from "@/lib/playlist/requestPlacement";
import type { PlaylistState } from "@/types/playlist";

const playlist: PlaylistState = {
  id: "playlist-1",
  title: "Test",
  mood: null,
  arc: null,
  tracks: [{
    id: "itunes:264135997",
    title: "Blue Monday",
    artist: "New Order",
    album: "iTunes Originals",
    durationMs: 420000,
    runtime: "7:00",
    verified: true,
    source: "itunes",
    sourceId: "264135997",
    sourceUrl: null,
    artworkUrl: null,
    vibeTags: [],
    genreTags: ["electronic"],
    rationale: null,
    fitNotes: null,
    energy: 7,
    verificationNote: "Manual."
  }],
  constraints: {},
  discoveryRadius: "moderate",
  conversationSummary: null,
  updatedAt: "2026-06-24T00:00:00Z"
};

describe("resolveNamedTrack", () => {
  it("binds a stored track id as an exact match", () => {
    expect(resolveNamedTrack(playlist, "itunes:264135997")).toMatchObject({
      query: "itunes:264135997",
      trackId: "itunes:264135997",
      title: "Blue Monday",
      artist: "New Order",
      resolution: "exact"
    });
  });
});
