import { describe, expect, it, vi } from "vitest";
import { resolveCuratorRequestPlan } from "@/lib/ai/services/requestResolution";
import type { PlaylistState, Track } from "@/types/playlist";

vi.mock("@/lib/ai/llmClient", () => ({
  getLLMProvider: vi.fn(() => "none"),
  getJsonFromLLM: vi.fn()
}));

function track(id: string, title: string, artist: string): Track {
  return {
    id,
    title,
    artist,
    album: null,
    durationMs: 180000,
    runtime: "3:00",
    verified: true,
    source: "manual",
    sourceId: id,
    sourceUrl: null,
    artworkUrl: null,
    vibeTags: [],
    genreTags: ["rock"],
    rationale: null,
    energy: 5,
    verificationNote: "Manual."
  };
}

const playlist: PlaylistState = {
  id: "playlist",
  title: "Test",
  mood: null,
  arc: null,
  tracks: [
    track("track-1", "First", "A"),
    track("track-2", "Second", "B"),
    track("track-3", "Third", "C")
  ],
  constraints: {},
  discoveryRadius: "moderate",
  conversationSummary: null,
  updatedAt: "2026-06-18T00:00:00.000Z"
};

describe("request resolution step planning", () => {
  it("preserves remove-then-reorder order from the user prompt", async () => {
    const plan = await resolveCuratorRequestPlan(
      playlist,
      "Remove the weakest track, then reorder the survivors so the energy rises."
    );

    expect(plan.steps.filter((step) => step.kind !== "update_rules").map((step) => step.kind)).toEqual(["remove", "reorder"]);
  });

  it("preserves reorder-before-remove order when the user states it explicitly", async () => {
    const plan = await resolveCuratorRequestPlan(
      playlist,
      "Reorder this first for a slower burn. After that, cut the weakest track."
    );

    expect(plan.steps.filter((step) => step.kind !== "update_rules").map((step) => step.kind)).toEqual(["reorder", "remove"]);
  });

  it("keeps pure rule-setting requests as update-rules only", async () => {
    const plan = await resolveCuratorRequestPlan(
      playlist,
      "Add a constraint that only covers are allowed."
    );

    expect(plan.steps.map((step) => step.kind)).toEqual(["update_rules"]);
    expect(plan.constraintState.persistedConstraintsAfterSuccess.notes).toContain("Only covers are allowed.");
  });

  it("treats reorganize-into-narrative-arc as a reorder request", async () => {
    const plan = await resolveCuratorRequestPlan(
      playlist,
      "Reorganize into a verifiable narrative arc."
    );

    expect(plan.steps.filter((step) => step.kind !== "update_rules").map((step) => step.kind)).toEqual(["reorder"]);
    expect(plan.operation).toBe("reorder");
  });

  it("treats reorganize-playlist-into-narrative-arc as a reorder request", async () => {
    const plan = await resolveCuratorRequestPlan(
      playlist,
      "Reorganize playlist into a verifiable narrative arc."
    );

    expect(plan.steps.filter((step) => step.kind !== "update_rules").map((step) => step.kind)).toEqual(["reorder"]);
    expect(plan.operation).toBe("reorder");
    expect(plan.constraintState.activeConstraints.notes).toBeUndefined();
  });

  it("treats tighten-the-playlist language as a mutating cut request instead of a reorder fallback", async () => {
    const plan = await resolveCuratorRequestPlan(
      playlist,
      "Tighten the playlist while preserving continuity, mutation, and physical atmosphere."
    );

    expect(plan.operation).toBe("remove");
    expect(plan.steps.filter((step) => step.kind !== "update_rules").map((step) => step.kind)).toEqual(["remove"]);
  });

  it("strips a previously stuck reorder note on the direct reorder path", async () => {
    const plan = await resolveCuratorRequestPlan(
      {
        ...playlist,
        constraints: {
          notes: ["Reorganize the playlist into a verifiable narrative arc."]
        }
      },
      "Reorganize the playlist into a verifiable narrative arc."
    );

    expect(plan.operation).toBe("reorder");
    expect(plan.constraintState.activeConstraints.notes).toBeUndefined();
    expect(plan.constraintState.persistedConstraintsAfterSuccess.notes).toBeUndefined();
  });

  it("does not collapse reorder-plus-cut prompts into generation", async () => {
    const repeatedArtistPlaylist: PlaylistState = {
      ...playlist,
      tracks: [
        track("track-1", "One", "Diamanda Galas"),
        track("track-2", "Two", "Diamanda Galas"),
        track("track-3", "Three", "Patti Smith"),
        track("track-4", "Four", "Patti Smith")
      ]
    };

    const plan = await resolveCuratorRequestPlan(
      repeatedArtistPlaylist,
      "This is a list of covered songs. I want you to reorder it so that tracks by the same artist are separated. We have too many Diamanda Galas and Patti Smith tracks. Probably I should limit this to 2 from each artist, so suggest cuts."
    );

    expect(plan.steps.map((step) => step.kind)).toEqual(["update_rules", "reorder", "remove"]);
    expect(plan.steps.some((step) => step.kind === "add" || step.kind === "replace")).toBe(false);
    expect(plan.constraintState.persistedConstraintsAfterSuccess.maxTracksPerArtist).toBe(2);
  });

  it("does not persist fake genre-addition guidance from mixed structural prompts", async () => {
    const plan = await resolveCuratorRequestPlan(
      playlist,
      "add a constraint that no more than 2 songs by the same artist can appear on the playlist and then remove tracks that violate that constraint. this is a playlist of covers only. add two songs by lingua ignota that are covers. reorganize the playlist into a verifiable narrative arc."
    );

    expect(plan.constraintState.activeConstraints.requiredGenreAdditions).toBeUndefined();
    expect(plan.constraintState.persistedConstraintsAfterSuccess.notes).toContain("Only covers are allowed.");
  });

  it("keeps explicit artist-targeted additions scoped to the current request", async () => {
    const plan = await resolveCuratorRequestPlan(
      playlist,
      "suggest two tracks by tori amos"
    );

    expect(plan.steps.some((step) => step.kind === "add")).toBe(true);
    expect(plan.constraintState.activeConstraints.requiredArtists).toEqual(["tori amos"]);
    expect(plan.constraintState.persistedConstraintsAfterSuccess.requiredArtists).toBeUndefined();
  });

  it("binds named bridge requests to insertion after the first anchor track", async () => {
    const bridgePlan = await resolveCuratorRequestPlan(
      {
        ...playlist,
        tracks: [
          track("track-1", "Candle", "Skinny Puppy"),
          track("track-2", "White Rabbit", "Jefferson Airplane")
        ]
      },
      "Find 2 verified bridge tracks between Skinny Puppy - Candle and Jefferson Airplane - White Rabbit."
    );

    expect(bridgePlan.operation).toBe("generate");
    expect(bridgePlan.addPlacement).toMatchObject({
      mode: "after_track",
      anchorQuery: "Skinny Puppy - Candle",
      anchorTrackId: "track-1",
      resolution: "exact"
    });
  });

  it("binds put-between requests to insertion after the first anchor track", async () => {
    const bridgePlan = await resolveCuratorRequestPlan(
      {
        ...playlist,
        tracks: [
          track("track-1", "Candle", "Skinny Puppy"),
          track("track-2", "White Rabbit", "Jefferson Airplane")
        ]
      },
      "Put two tracks between Skinny Puppy - Candle and Jefferson Airplane - White Rabbit."
    );

    expect(bridgePlan.operation).toBe("generate");
    expect(bridgePlan.addPlacement).toMatchObject({
      mode: "after_track",
      anchorQuery: "Skinny Puppy - Candle",
      anchorTrackId: "track-1",
      resolution: "exact"
    });
  });

  it("resolves the weak-link review prompt as reorder if it ever reaches curator planning", async () => {
    const plan = await resolveCuratorRequestPlan(
      playlist,
      "Review this playlist and name the two tracks that weaken its identity."
    );

    expect(plan.operation).toBe("reorder");
    expect(plan.steps.filter((step) => step.kind !== "update_rules").map((step) => step.kind)).toEqual(["reorder"]);
  });

  it("treats queue-after requests as a reorder when the requested track is already present", async () => {
    const queuedPlaylist: PlaylistState = {
      ...playlist,
      tracks: [
        track("track-1", "Army of Me", "Bjork"),
        track("track-2", "Firestarter", "The Prodigy"),
        track("track-3", "Roads", "Portishead")
      ]
    };

    const plan = await resolveCuratorRequestPlan(
      queuedPlaylist,
      "queue army of me after firestarter"
    );

    expect(plan.operation).toBe("reorder");
    expect(plan.steps.filter((step) => step.kind !== "update_rules").map((step) => step.kind)).toEqual(["reorder"]);
  });

  it("keeps queue-after requests as additions when the requested track is missing", async () => {
    const queuedPlaylist: PlaylistState = {
      ...playlist,
      tracks: [
        track("track-1", "Firestarter", "The Prodigy"),
        track("track-2", "Roads", "Portishead")
      ]
    };

    const plan = await resolveCuratorRequestPlan(
      queuedPlaylist,
      "queue army of me after firestarter"
    );

    expect(plan.operation).toBe("generate");
    expect(plan.steps.filter((step) => step.kind !== "update_rules").map((step) => step.kind)).toEqual(["add"]);
  });
});
