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

    expect(result.reviewSuggestions.every((suggestion) => suggestion.type === "remove")).toBe(true);
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
