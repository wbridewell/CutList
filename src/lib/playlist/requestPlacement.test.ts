import { describe, expect, it } from "vitest";
import { bindDeclaredTrackPlacement, resolveNamedTrack } from "@/lib/playlist/requestPlacement";
import { detectDeclaredTrackPlacement } from "@/lib/playlist/requestPlacement";
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

  it("treats loose title variants as the same playlist track", () => {
    expect(resolveNamedTrack({
      ...playlist,
      tracks: [{
        ...playlist.tracks[0],
        title: "The Days of Swine & Roses",
        artist: "My Life with the Thrill Kill Kult"
      }]
    }, "Days of Swine and Roses")).toMatchObject({
      trackId: "itunes:264135997",
      resolution: "exact"
    });
  });
});

describe("bridge placement parsing", () => {
  it("treats named bridge requests as insertion after the first anchor track", () => {
    const placed = bindDeclaredTrackPlacement(
      {
        ...playlist,
        tracks: [
          playlist.tracks[0],
          {
            ...playlist.tracks[0],
            id: "itunes:2",
            title: "White Rabbit",
            artist: "Jefferson Airplane"
          }
        ]
      },
      detectDeclaredTrackPlacement("Find 2 verified bridge tracks between New Order - Blue Monday and Jefferson Airplane - White Rabbit.")
    );

    expect(placed).toMatchObject({
      mode: "after_track",
      anchorQuery: "New Order - Blue Monday",
      anchorTrackId: "itunes:264135997",
      resolution: "exact"
    });
  });

  it("treats put-between requests as insertion after the first anchor track", () => {
    const placed = bindDeclaredTrackPlacement(
      {
        ...playlist,
        tracks: [
          playlist.tracks[0],
          {
            ...playlist.tracks[0],
            id: "itunes:2",
            title: "White Rabbit",
            artist: "Jefferson Airplane"
          }
        ]
      },
      detectDeclaredTrackPlacement("Put two tracks between New Order - Blue Monday and Jefferson Airplane - White Rabbit.")
    );

    expect(placed).toMatchObject({
      mode: "after_track",
      anchorQuery: "New Order - Blue Monday",
      anchorTrackId: "itunes:264135997",
      resolution: "exact"
    });
  });
});
