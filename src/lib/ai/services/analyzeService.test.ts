import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleAnalyzePlaylist } from "@/lib/ai/services/analyzeService";
import { JsonExtractionError } from "@/lib/ai/jsonResponse";
import type { PlaylistState, Track } from "@/types/playlist";

vi.mock("@/lib/ai/llmClient", async () => {
  const actual = await vi.importActual<typeof import("@/lib/ai/llmClient")>("@/lib/ai/llmClient");
  return {
    ...actual,
    getJsonFromLLM: vi.fn()
  };
});

const { getJsonFromLLM } = await import("@/lib/ai/llmClient");

function track(overrides: Partial<Track> = {}): Track {
  return {
    id: overrides.id ?? "track-1",
    title: overrides.title ?? "Song",
    artist: overrides.artist ?? "Artist",
    album: overrides.album ?? null,
    durationMs: overrides.durationMs ?? 180000,
    runtime: overrides.runtime ?? "3:00",
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
    fitNotes: overrides.fitNotes ?? null,
    energy: overrides.energy ?? null,
    verificationNote: overrides.verificationNote ?? "Verified."
  };
}

const playlist: PlaylistState = {
  id: "playlist",
  title: "Test",
  mood: null,
  arc: null,
  tracks: [
    track({ id: "open", title: "Open", artist: "A", energy: 2, genreTags: ["dream pop"] }),
    track({ id: "middle", title: "Middle", artist: "B", energy: 4, genreTags: ["dream pop"] }),
    track({ id: "close", title: "Close", artist: "C", energy: 3, genreTags: ["dream pop"] })
  ],
  constraints: {},
  discoveryRadius: "moderate",
  conversationSummary: null,
  updatedAt: "2026-06-13T00:00:00Z"
};

describe("analyze service compression routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("filters compression suggestions from normal review requests", async () => {
    vi.mocked(getJsonFromLLM).mockResolvedValue({
      curatorTake: "The center holds, but the review does not need to overcut it.",
      message: "Looks good overall.",
      strengths: [],
      weakLinks: [],
      sequencingNotes: [],
      suggestedEdits: [],
      intentSummary: {
        playlistIdentity: "Dream-pop drift.",
        preservedQualities: [],
        likelyUserIntent: "Keep the soft landing.",
        riskNotes: [],
        confidence: "medium"
      },
      trackRoles: [],
      transitionReview: [],
      reviewSuggestions: [{
        id: "compress-1",
        type: "compress_section",
        applicationMode: "remove_existing",
        affectedTrackIds: ["middle"],
        rationale: "Trim the drag.",
        intentPreservation: "Keeps anchors.",
        risk: null,
        confidence: "medium",
        suggestedPrompt: null
      }]
    });

    const result = await handleAnalyzePlaylist(playlist, "what is working here?");

    expect(result.reviewSuggestions).toEqual([]);
  });

  it("downgrades overbroad compression suggestions to informational review notes", async () => {
    vi.mocked(getJsonFromLLM).mockResolvedValue({
      curatorTake: "The room is overbuilt, but this cut is too brutal to apply blindly.",
      message: "There is excess here, but not enough to justify gutting the playlist.",
      strengths: [],
      weakLinks: [],
      sequencingNotes: [],
      suggestedEdits: [],
      intentSummary: {
        playlistIdentity: "Dream-pop drift.",
        preservedQualities: [],
        likelyUserIntent: "Keep the soft landing.",
        riskNotes: [],
        confidence: "medium"
      },
      trackRoles: [],
      transitionReview: [],
      reviewSuggestions: [{
        id: "compress-1",
        type: "compress_section",
        applicationMode: "remove_existing",
        affectedTrackIds: ["open", "middle"],
        rationale: "Trim the drag.",
        intentPreservation: "Keeps anchors.",
        risk: null,
        confidence: "medium",
        suggestedPrompt: null,
        compressionPlan: {
          removeTrackIds: ["open", "middle"],
          keepTrackIds: ["close"],
          targetTrackCount: 1,
          targetTotalDurationMs: null
        }
      }]
    });

    const result = await handleAnalyzePlaylist(playlist, "compress this a little");

    expect(result.reviewSuggestions[0]).toMatchObject({
      id: "compress-1",
      type: "compress_section",
      applicationMode: "informational"
    });
  });

  it("downgrades incomplete reorder suggestions to informational review notes", async () => {
    vi.mocked(getJsonFromLLM).mockResolvedValue({
      curatorTake: "The tracks work, but the clusters need air between them.",
      message: "Spread out the clusters.",
      strengths: [],
      weakLinks: [],
      sequencingNotes: [],
      suggestedEdits: [],
      intentSummary: {
        playlistIdentity: "Dream-pop drift.",
        preservedQualities: [],
        likelyUserIntent: "Keep the soft landing.",
        riskNotes: [],
        confidence: "medium"
      },
      trackRoles: [],
      transitionReview: [],
      reviewSuggestions: [{
        id: "reorder-1",
        type: "reorder",
        applicationMode: "reorder_existing",
        affectedTrackIds: ["open", "middle"],
        rationale: "Spread out the repeated artists.",
        intentPreservation: "Keeps the same material.",
        risk: null,
        confidence: "medium",
        suggestedPrompt: null
      }]
    });

    const result = await handleAnalyzePlaylist(playlist, "review playlist");

    expect(result.reviewSuggestions[0]).toMatchObject({
      id: "reorder-1",
      type: "reorder",
      applicationMode: "informational"
    });
  });

  it("filters non-removal suggestions from weak-link identification reviews", async () => {
    const result = await handleAnalyzePlaylist(playlist, "Review this playlist and name the two tracks that weaken its identity.");

    expect(result.reviewMode).toBe("weak_links_only");
    expect(result.reviewSuggestions.every((suggestion) => suggestion.type === "remove")).toBe(true);
  });

  it("keeps focused transition repair reviews scoped to bridge suggestions", async () => {
    vi.mocked(getJsonFromLLM).mockResolvedValue({
      message: "The jump is too violent.",
      transitionSummary: "The handoff needs a dark decompression chamber.",
      bridgeOptions: [{
        candidate: {
          title: "Closer",
          artist: "Nine Inch Nails",
          album: null,
          reason: "Cold mid-tempo pressure.",
          vibeTags: [],
          expectedFitNotes: "",
          energy: 7
        },
        role: "Acts as a heavy hydraulic brake that keeps the mechanical pulse alive."
      }, {
        candidate: {
          title: "Angel",
          artist: "Massive Attack",
          album: null,
          reason: "Dark breakbeat descent.",
          vibeTags: [],
          expectedFitNotes: "",
          energy: 6
        },
        role: "Keeps the pressure in the drums while darkening the temperature."
      }, {
        candidate: {
          title: "Rabbit in Your Headlights",
          artist: "UNKLE",
          album: null,
          reason: "Bleak electronic glide.",
          vibeTags: [],
          expectedFitNotes: "",
          energy: 5
        },
        role: "Strips out the rave velocity and leaves a cold nocturnal tunnel into Roads."
      }]
    });

    const result = await handleAnalyzePlaylist(
      playlist,
      "Repair only the transition from Firestarter into Roads. Do not remove or reorder existing tracks. Recommend 3 possible bridge tracks.",
      { reviewMode: "focused_transition_repair" }
    );

    expect(result.reviewMode).toBe("focused_transition_repair");
    expect(result.reviewSuggestions.every((suggestion) => suggestion.type === "add_bridge")).toBe(true);
    expect(result.reviewSuggestions).toHaveLength(3);
    expect(result.reviewSuggestions.every((suggestion) => suggestion.candidate)).toBe(true);
    expect(result.weakLinks).toEqual([]);
    expect(result.trackRoles).toEqual([]);
  });

  it("upgrades an accidentally broad incoming review mode when the prompt is clearly focused", async () => {
    vi.mocked(getJsonFromLLM).mockResolvedValue({
      message: "The jump is too violent.",
      transitionSummary: "The handoff needs a dark decompression chamber.",
      bridgeOptions: [{
        candidate: {
          title: "Closer",
          artist: "Nine Inch Nails",
          album: null,
          reason: "Cold mid-tempo pressure.",
          vibeTags: [],
          expectedFitNotes: "",
          energy: 7
        },
        role: "Acts as a heavy hydraulic brake that keeps the mechanical pulse alive."
      }, {
        candidate: {
          title: "Angel",
          artist: "Massive Attack",
          album: null,
          reason: "Dark breakbeat descent.",
          vibeTags: [],
          expectedFitNotes: "",
          energy: 6
        },
        role: "Keeps the pressure in the drums while darkening the temperature."
      }, {
        candidate: {
          title: "Rabbit in Your Headlights",
          artist: "UNKLE",
          album: null,
          reason: "Bleak electronic glide.",
          vibeTags: [],
          expectedFitNotes: "",
          energy: 5
        },
        role: "Strips out the rave velocity and leaves a cold nocturnal tunnel into Roads."
      }]
    });

    const result = await handleAnalyzePlaylist(
      playlist,
      "Repair only the transition from Firestarter into Roads. Do not remove or reorder existing tracks. Recommend 3 possible bridge tracks.",
      { reviewMode: "full_critique" }
    );

    expect(result.reviewMode).toBe("focused_transition_repair");
    expect(result.reviewSuggestions.every((suggestion) => suggestion.type === "add_bridge")).toBe(true);
    expect(result.reviewSuggestions).toHaveLength(3);
  });

  it("stays in focused transition mode when the dedicated bridge contract falls back", async () => {
    vi.mocked(getJsonFromLLM).mockRejectedValueOnce(new JsonExtractionError("bad output", "Curator judgment:\nSuggested follow-ups:\n- compress_section"));

    const result = await handleAnalyzePlaylist(
      playlist,
      "Repair only the transition from Firestarter into Roads. Do not remove or reorder existing tracks. Recommend 3 possible bridge tracks.",
      { reviewMode: "focused_transition_repair" }
    );

    expect(result.reviewMode).toBe("focused_transition_repair");
    expect(result.reviewSuggestions.every((suggestion) => suggestion.type === "add_bridge")).toBe(true);
    expect(result.reviewSuggestions.some((suggestion) => suggestion.type === "compress_section")).toBe(false);
    expect(result.strengths).toEqual([]);
    expect(result.trackRoles).toEqual([]);
  });

  it("suppresses follow-up suggestions for diagnose-only reviews", async () => {
    vi.mocked(getJsonFromLLM).mockResolvedValue({
      curatorTake: "The identity is split between two incompatible worlds.",
      message: "The biggest problem is identity fracture.",
      strengths: [],
      weakLinks: [],
      sequencingNotes: ["The industrial core keeps colliding with softer nostalgia cues."],
      suggestedEdits: [],
      intentSummary: {
        playlistIdentity: "Fractured industrial drift.",
        preservedQualities: [],
        likelyUserIntent: "Name the problem clearly.",
        riskNotes: [],
        confidence: "high"
      },
      trackRoles: [],
      transitionReview: [],
      reviewSuggestions: [{
        id: "bridge-1",
        type: "add_bridge",
        applicationMode: "verify_candidate",
        affectedTrackIds: ["open", "middle"],
        rationale: "Too action-oriented for diagnose-only.",
        intentPreservation: "N/A",
        risk: null,
        confidence: "medium",
        suggestedPrompt: "Find a bridge."
      }]
    });

    const result = await handleAnalyzePlaylist(
      playlist,
      "Identify the single biggest structural problem in this playlist. Give a focused diagnosis, not a full rewrite.",
      { reviewMode: "diagnose_only" }
    );

    expect(result.reviewMode).toBe("diagnose_only");
    expect(result.reviewSuggestions).toEqual([]);
  });

  it("recovers critique output after one repair pass instead of falling back immediately", async () => {
    vi.mocked(getJsonFromLLM)
      .mockResolvedValueOnce({
        message: "Missing required fields."
      })
      .mockResolvedValueOnce({
        curatorTake: "The center holds, but the sequence still needs more air between pressure points.",
        message: "The sequence works but needs spacing.",
        strengths: [],
        weakLinks: [],
        sequencingNotes: [],
        suggestedEdits: [],
        intentSummary: {
          playlistIdentity: "Dream-pop drift.",
          preservedQualities: [],
          likelyUserIntent: "Keep the soft landing.",
          riskNotes: [],
          confidence: "medium"
        },
        trackRoles: [],
        transitionReview: [],
        reviewSuggestions: []
      });

    const result = await handleAnalyzePlaylist(playlist, "review playlist");

    expect(result.message).toBe("The sequence works but needs spacing.");
    expect(vi.mocked(getJsonFromLLM)).toHaveBeenCalledTimes(2);
  });

  it("does not auto-append a deterministic bridge when the curator already made a review judgment", async () => {
    vi.mocked(getJsonFromLLM).mockResolvedValue({
      curatorTake: "The playlist is bleeding out.",
      message: "The sequence is bloated and the jump is part of the violence, not a bridge problem.",
      strengths: ["The opening rupture is intentional."],
      weakLinks: [],
      sequencingNotes: ["Do not soften the first impact with extra connective tissue."],
      suggestedEdits: [],
      intentSummary: {
        playlistIdentity: "High-anxiety suburban decay.",
        preservedQualities: ["Keep the ugly opening collision."],
        likelyUserIntent: "Sharpen the tension without cleaning it up.",
        riskNotes: [],
        confidence: "high"
      },
      trackRoles: [],
      transitionReview: [{
        fromTrackId: "open",
        toTrackId: "middle",
        issueType: "abrupt_energy_jump",
        summary: "The jump is violent by design and should stay that way.",
        suggestedRepair: null,
        confidence: "medium",
        basis: "model_judgment"
      }],
      reviewSuggestions: []
    });

    const result = await handleAnalyzePlaylist(playlist, "review playlist");

    expect(result.reviewSuggestions).toEqual([]);
  });

  it("falls back safely when the critique response never yields recoverable JSON", async () => {
    vi.mocked(getJsonFromLLM).mockRejectedValue(
      new JsonExtractionError("Could not recover JSON.", "Not actually JSON.")
    );

    const result = await handleAnalyzePlaylist(playlist, "review playlist");

    expect(result.message).toContain("deterministic playlist check");
    expect(result.reviewSuggestions.length).toBeGreaterThanOrEqual(0);
  });
});
