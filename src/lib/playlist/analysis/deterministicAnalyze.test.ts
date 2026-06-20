import { describe, expect, it } from "vitest";
import { deterministicAnalyzePlaylist } from "@/lib/playlist/analysis/deterministicAnalyze";
import type { PlaylistState, Track } from "@/types/playlist";

function track(overrides: Partial<Track>): Track {
  return {
    id: overrides.id ?? "1",
    title: overrides.title ?? "Song",
    artist: overrides.artist ?? "Artist",
    album: overrides.album ?? null,
    durationMs: overrides.durationMs ?? 120000,
    runtime: overrides.runtime ?? "2:00",
    verified: overrides.verified ?? true,
    source: overrides.source ?? "itunes",
    sourceId: overrides.sourceId ?? "1",
    sourceUrl: overrides.sourceUrl ?? null,
    artworkUrl: overrides.artworkUrl ?? null,
    explicit: overrides.explicit ?? false,
    releaseDate: overrides.releaseDate ?? null,
    vibeTags: overrides.vibeTags ?? [],
    genreTags: overrides.genreTags ?? [],
    rationale: overrides.rationale ?? null,
    energy: overrides.energy ?? null,
    verificationNote: overrides.verificationNote ?? "Verified."
  };
}

describe("deterministic playlist analysis", () => {
  it("returns constraint-aware critique without OpenAI", () => {
    const playlist: PlaylistState = {
      id: "test",
      title: "Test",
      mood: null,
      arc: null,
      tracks: [
        track({ id: "too-long", title: "Too Long", durationMs: 181000, energy: 2 }),
        track({ id: "jump", title: "Jump", artist: "Other", energy: 8 }),
        track({ id: "landing", title: "Landing", artist: "Third", energy: 4 })
      ],
      constraints: { maxTrackDurationMs: 180000 },
      discoveryRadius: "moderate",
      conversationSummary: null,
      updatedAt: "2026-05-27T00:00:00Z"
    };

    const result = deterministicAnalyzePlaylist(playlist);

    expect(result.constraintReport.passed).toBe(false);
    expect(result.weakLinks[0].trackId).toBe("too-long");
    expect(result.suggestedEdits[0].type).toBe("remove");
    expect(result.intentSummary?.playlistIdentity).not.toBe("Test");
    expect(result.intentSummary?.playlistIdentity).not.toBe("A verified CutList draft.");
    expect(result.curatorTake).toContain("deterministic fallback read");
    expect(result.intentSummary?.likelyUserIntent).toContain("Build a coherent verified playlist");
    expect(result.trackRoles.map((role) => role.role)).toEqual(["opener", "climax", "resolution"]);
    expect(result.trackRoles[0]?.basis).toBe("metadata_heuristic");
    expect(result.transitionReview[0]).toMatchObject({ issueType: "abrupt_energy_jump" });
    expect(result.transitionReview[0]?.basis).toBe("metadata_heuristic");
    expect(result.reviewSuggestions.some((suggestion) => suggestion.applicationMode === "remove_existing")).toBe(true);
    expect(result.reviewSuggestions.some((suggestion) => suggestion.applicationMode === "verify_candidate")).toBe(true);
  });

  it("adds a conservative compression suggestion for explicit compression requests", () => {
    const playlist: PlaylistState = {
      id: "compression",
      title: "Compression Test",
      mood: "Overbuilt middle.",
      arc: null,
      tracks: [
        track({ id: "open", title: "Open", artist: "A", energy: 2, durationMs: 180000, runtime: "3:00", genreTags: ["dream pop"] }),
        track({ id: "drag-1", title: "Drag One", artist: "B", energy: 4, durationMs: 240000, runtime: "4:00", genreTags: ["dream pop"] }),
        track({ id: "drag-2", title: "Drag Two", artist: "B", energy: 4, durationMs: 240000, runtime: "4:00", genreTags: ["dream pop"] }),
        track({ id: "close", title: "Close", artist: "C", energy: 3, durationMs: 180000, runtime: "3:00", genreTags: ["dream pop"] })
      ],
      constraints: {},
      discoveryRadius: "moderate",
      conversationSummary: null,
      updatedAt: "2026-06-13T00:00:00Z"
    };

    const result = deterministicAnalyzePlaylist(playlist, undefined, {
      compressionRequest: {
        targetTrackCount: 3,
        targetTotalDurationMs: null,
        compressionStrength: "moderate",
        preserveExplicitRules: true
      }
    });

    expect(result.reviewSuggestions.some((suggestion) => suggestion.type === "compress_section")).toBe(true);
    expect(result.reviewSuggestions.find((suggestion) => suggestion.type === "compress_section")).toMatchObject({
      applicationMode: "remove_existing",
      compressionPlan: {
        targetTrackCount: 3
      }
    });
  });

  it("builds a thesis-like identity instead of echoing mood or title when metadata supports it", () => {
    const playlist: PlaylistState = {
      id: "identity",
      title: "Fixture Playlist",
      mood: "Something vague.",
      arc: null,
      tracks: [
        track({ id: "one", title: "One", artist: "Repeat", genreTags: ["post-punk"], energy: 2 }),
        track({ id: "two", title: "Two", artist: "Repeat", genreTags: ["industrial"], energy: 8 }),
        track({ id: "three", title: "Three", artist: "Other", genreTags: ["post-punk"], energy: 4 })
      ],
      constraints: {},
      discoveryRadius: "moderate",
      conversationSummary: null,
      updatedAt: "2026-06-19T00:00:00Z"
    };

    const result = deterministicAnalyzePlaylist(playlist);

    expect(result.intentSummary?.playlistIdentity).toContain("post punk-led");
    expect(result.intentSummary?.playlistIdentity).toContain("repeat pressure point");
    expect(result.intentSummary?.playlistIdentity).not.toBe("Something vague.");
    expect((result.curatorTake ?? "").toLowerCase()).toContain("repeat bunches the texture");
  });
});
