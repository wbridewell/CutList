import type { RequestHistoryEntry } from "@/lib/playlist/collaboration";
import type { CuratorResponse, PlaylistState, Track } from "@/types/playlist";

// Fixture builders for tests. Every field has a value a schema accepts, so a test states
// only what it cares about. Defaults are deliberately plain (one manual track, an empty
// playlist, a passing constraint report) so no assertion depends on them by accident.

const FIXTURE_TIMESTAMP = "2026-06-23T00:00:00.000Z";

export function buildTrack(overrides: Partial<Track> = {}): Track {
  const id = overrides.id ?? "track-1";
  return {
    id,
    title: "Song",
    artist: "Artist",
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
    verificationConfidence: "manual",
    ...overrides
  };
}

// A provider-verified track, the shape verifyTrack produces for an accepted candidate.
export function buildVerifiedTrack(overrides: Partial<Track> = {}): Track {
  const id = overrides.id ?? "itunes:1";
  return buildTrack({
    id,
    sourceId: id.replace(/^itunes:/, ""),
    source: "itunes",
    sourceUrl: `https://music.apple.com/track/${id.replace(/^itunes:/, "")}`,
    verificationNote: "Verified by itunes.",
    verificationConfidence: "high",
    ...overrides
  });
}

export function buildPlaylist(overrides: Partial<PlaylistState> = {}): PlaylistState {
  return {
    id: "playlist-1",
    title: "Test",
    mood: null,
    arc: null,
    tracks: [],
    constraints: {},
    discoveryRadius: "moderate",
    conversationSummary: null,
    updatedAt: FIXTURE_TIMESTAMP,
    ...overrides
  };
}

export function buildCuratorResponse(overrides: Partial<CuratorResponse> = {}): CuratorResponse {
  return {
    message: "Done.",
    playlistUpdate: null,
    playlistMeta: null,
    updatedConstraints: {},
    constraintReport: { passed: true, totalDurationMs: 0, violations: [], evidenceWarnings: [] },
    rejectedCandidates: [],
    ...overrides
  };
}

export function buildHistoryEntry(overrides: Partial<RequestHistoryEntry> = {}): RequestHistoryEntry {
  return {
    id: "entry-1",
    userMessage: "Add two tracks.",
    assistantMessage: "Done.",
    acceptedCount: 0,
    rejectedCandidates: [],
    createdAt: FIXTURE_TIMESTAMP,
    kind: "request",
    ...overrides
  };
}
