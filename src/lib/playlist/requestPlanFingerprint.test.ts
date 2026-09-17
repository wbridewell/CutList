import { describe, expect, it } from "vitest";
import { requestPlanFingerprint } from "@/lib/playlist/requestPlanFingerprint";
import type { PlaylistState, Track } from "@/types/playlist";

function track(id: string, title = "Song", artist = "Artist"): Track {
  return {
    id,
    title,
    artist,
    album: null,
    durationMs: 180_000,
    runtime: "3:00",
    verified: true,
    source: "manual",
    sourceId: id,
    sourceUrl: null,
    artworkUrl: null,
    vibeTags: [],
    genreTags: [],
    rationale: null,
    energy: null,
    evidenceNotes: [],
    verificationNote: "Manual.",
    verificationConfidence: "manual"
  };
}

const playlist: PlaylistState = {
  id: "playlist-1",
  title: "Test",
  mood: null,
  arc: null,
  tracks: [track("track-1"), track("track-2", "Other")],
  constraints: { maxTracksPerArtist: 1 },
  discoveryRadius: "moderate",
  conversationSummary: null,
  updatedAt: "2026-06-23T00:00:00Z"
};

describe("requestPlanFingerprint", () => {
  it("is stable for the same inputs and ignores fields the planner does not read", () => {
    const first = requestPlanFingerprint({ playlist, userMessage: "Add two tracks." });
    const second = requestPlanFingerprint({
      playlist: { ...playlist, title: "Renamed", updatedAt: "2026-07-01T00:00:00Z" },
      userMessage: "Add two tracks."
    });

    expect(first).toBe(second);
  });

  it("changes when the message, the tracks, the rules, or the read-only flag change", () => {
    const base = requestPlanFingerprint({ playlist, userMessage: "Add two tracks." });

    expect(requestPlanFingerprint({ playlist, userMessage: "Add three tracks." })).not.toBe(base);
    expect(requestPlanFingerprint({ playlist: { ...playlist, tracks: [playlist.tracks[0]!] }, userMessage: "Add two tracks." })).not.toBe(base);
    expect(requestPlanFingerprint({ playlist: { ...playlist, tracks: [playlist.tracks[1]!, playlist.tracks[0]!] }, userMessage: "Add two tracks." })).not.toBe(base);
    expect(requestPlanFingerprint({ playlist: { ...playlist, constraints: {} }, userMessage: "Add two tracks." })).not.toBe(base);
    expect(requestPlanFingerprint({ playlist, userMessage: "Add two tracks.", forceReadOnly: true })).not.toBe(base);
  });

  it("changes when the conversation context the planner was shown changes", () => {
    const base = requestPlanFingerprint({ playlist, userMessage: "Make it darker." });
    const withContext = requestPlanFingerprint({
      playlist,
      userMessage: "Make it darker.",
      conversationContext: { recentMessages: [{ role: "user", content: "Start with shoegaze." }] }
    });

    expect(withContext).not.toBe(base);
  });
});
