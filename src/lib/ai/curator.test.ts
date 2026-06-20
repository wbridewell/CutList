import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleAnalyzePlaylist, handleImportChat, handlePlaylistMessage } from "@/lib/ai/curator";
import { mergeConstraintLayers } from "@/lib/ai/services/instructionIntent";
import { getJsonFromLLM, getLLMProvider } from "@/lib/ai/llmClient";
import { verifyTrack, verifyTracks } from "@/lib/music/verifyTrack";
import type { PlaylistState, Track } from "@/types/playlist";

vi.mock("@/lib/ai/llmClient", () => ({
  getJsonFromLLM: vi.fn(async () => {
    throw new Error("LLM should not be called");
  }),
  getLLMProvider: vi.fn(() => "none"),
  LLMDisabledError: class LLMDisabledError extends Error {},
  LLMTimeoutError: class LLMTimeoutError extends Error {}
}));

vi.mock("@/lib/music/verifyTrack", () => ({
  verifyTracks: vi.fn(async () => ({ verified: [], rejected: [] })),
  verifyTrack: vi.fn()
}));

const playlist: PlaylistState = {
  id: "test",
  title: "Test",
  mood: null,
  arc: null,
  tracks: [],
  constraints: {},
  discoveryRadius: "moderate",
  conversationSummary: null,
  updatedAt: "2026-05-27T00:00:00Z"
};

const verifiedTrack: Track = {
  id: "itunes:1",
  title: "Wild Side",
  artist: "Motley Crue",
  album: "Girls, Girls, Girls",
  durationMs: 280000,
  runtime: "4:40",
  verified: true,
  source: "itunes",
  sourceId: "1",
  sourceUrl: null,
  artworkUrl: null,
  explicit: false,
  releaseDate: null,
  vibeTags: [],
  genreTags: ["hard rock"],
  rationale: "Fits.",
  energy: 8,
  verificationNote: "Verified."
};

function acceptedTrack(id: string, title: string, artist = "Artist"): Track {
  return {
    ...verifiedTrack,
    id,
    title,
    artist,
    sourceId: id
  };
}

describe("curator LLM boundaries", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getJsonFromLLM).mockImplementation(async () => {
      throw new Error("LLM should not be called");
    });
    vi.mocked(getLLMProvider).mockReturnValue("none");
    vi.mocked(verifyTracks).mockResolvedValue({ verified: [], rejected: [] });
    vi.mocked(verifyTrack).mockReset();
  });

  it("imports tabular track lists without calling the LLM", async () => {
    await handleImportChat("Name\tArtist\tAlbum\nPink Moon\tNick Drake\tPink Moon");

    expect(verifyTracks).toHaveBeenCalledWith([{ title: "Pink Moon", artist: "Nick Drake", album: "Pink Moon" }]);
    expect(getJsonFromLLM).not.toHaveBeenCalled();
  });

  it("handles pasted tabular natural requests without calling the LLM", async () => {
    const result = await handlePlaylistMessage(playlist, "Name\tArtist\tAlbum\nPink Moon\tNick Drake\tPink Moon");

    expect(result.message).toContain("detected a pasted track list");
    expect(verifyTracks).toHaveBeenCalled();
    expect(getJsonFromLLM).not.toHaveBeenCalled();
  });

  it("does not treat comma-separated version cleanup prose as pasted tracks", async () => {
    const original = acceptedTrack("track-1", "Schism", "Tool");
    const live = { ...acceptedTrack("track-2", "Schism (Live)", "Tool"), album: "Live" };
    vi.mocked(getJsonFromLLM).mockResolvedValueOnce({
      message: "Here are replacements.",
      playlistMeta: null,
      candidates: [
        { title: "Forty Six & 2", artist: "Tool", album: null, reason: "Fits.", vibeTags: [], expectedFitNotes: "", energy: null },
        { title: "Sober", artist: "Tool", album: null, reason: "Fits.", vibeTags: [], expectedFitNotes: "", energy: null },
        { title: "Aenema", artist: "Tool", album: null, reason: "Fits.", vibeTags: [], expectedFitNotes: "", energy: null }
      ]
    });
    vi.mocked(verifyTrack).mockImplementation(async ({ title, artist }) => ({
      status: "verified",
      track: acceptedTrack(`id:${title}`, title, artist)
    }));

    const result = await handlePlaylistMessage(
      { ...playlist, tracks: [live, original] },
      "some of these songs are versions of the same track. can you keep the best versions, remove the other versions, and add a few replacements?"
    );

    expect(verifyTracks).not.toHaveBeenCalled();
    expect(result.message).toContain("removed 1 alternate version");
    expect(result.playlistUpdate?.action).toBe("set");
    expect(result.playlistUpdate?.tracks.map((track) => track.title)).toEqual(["Schism", "Forty Six & 2", "Sober", "Aenema"]);
  });

  it("does not treat comma-separated starter prompt prose as pasted tracks", async () => {
    vi.mocked(getJsonFromLLM).mockResolvedValueOnce({
      message: "Here are warm strange songs.",
      playlistMeta: null,
      candidates: [{
        title: "Warmth",
        artist: "A",
        album: null,
        reason: "Moves from tension to relief.",
        vibeTags: ["warm", "strange"],
        expectedFitNotes: "Fits the requested emotional motion.",
        energy: 5
      }]
    });
    vi.mocked(verifyTrack).mockImplementation(async ({ title, artist }) => ({
      status: "verified",
      track: acceptedTrack(`id:${title}`, title, artist)
    }));

    const result = await handlePlaylistMessage(
      playlist,
      "Find warm, strange songs that move from tension to relief."
    );

    expect(result.message).not.toContain("detected a pasted track list");
    expect(verifyTracks).not.toHaveBeenCalled();
    expect(getJsonFromLLM).toHaveBeenCalled();
  });

  it("routes replace requests through removal selection and verified backfill", async () => {
    vi.mocked(getLLMProvider).mockReturnValue("ollama");
    const opener = acceptedTrack("track-1", "Cold Open", "A");
    const weakest = acceptedTrack("track-2", "Grey Dip", "B");
    const closer = acceptedTrack("track-3", "Resolve", "C");
    vi.mocked(getJsonFromLLM)
      .mockResolvedValueOnce({
        operationIntent: {
          type: "replace",
          requestedTrackCount: null,
          targetTotalTrackCount: null,
          replaceCount: 1,
          confidence: "high"
        },
        verifiedRules: { allowExplicit: false },
        curatorGuidance: { preferredGenres: ["warm soul"] },
        scopeIntent: {
          persistentVerifiedRuleFields: ["allowExplicit"],
          persistentGuidanceFields: [],
          requestScopedVerifiedRuleFields: [],
          requestScopedGuidanceFields: ["preferredGenres"]
        },
        notes: ["Replace weakest track, then backfill one slot."]
      })
      .mockResolvedValueOnce({
        message: "Grey Dip is the weakest fit.",
        removeTrackIds: ["track-2"],
        rationaleByTrackId: {
          "track-2": "It stalls the lift into the closer."
        }
      })
      .mockResolvedValueOnce({
        message: "Here is a warmer replacement.",
        playlistMeta: null,
        candidates: [
          { title: "Warm Lift", artist: "D", album: null, reason: "Warmer and more buoyant.", vibeTags: ["warm", "soul"], expectedFitNotes: "", energy: 6 }
        ]
      });
    vi.mocked(verifyTrack).mockResolvedValue({
      status: "verified",
      track: {
        ...acceptedTrack("id:Warm Lift", "Warm Lift", "D"),
        explicit: false,
        genreTags: ["soul"]
      }
    });

    const result = await handlePlaylistMessage(
      { ...playlist, tracks: [opener, weakest, closer] },
      "replace the weakest track with something warmer and more soulful"
    );

    expect(getJsonFromLLM).toHaveBeenCalledTimes(3);
    expect(result.updatedConstraints?.allowExplicit).toBe(false);
    expect(result.message).toContain("I verified and accepted 1 track toward the requested 1.");
    expect(result.playlistUpdate?.action).toBe("set");
    expect(result.playlistUpdate?.tracks.map((track) => track.title)).toEqual(["Cold Open", "Resolve", "Warm Lift"]);
  });

  it("applies pure covers-only rule updates without generating tracks", async () => {
    vi.mocked(getLLMProvider).mockReturnValue("ollama");
    vi.mocked(getJsonFromLLM).mockResolvedValueOnce({
      operationIntent: {
        type: "other",
        requestedTrackCount: null,
        targetTotalTrackCount: null,
        replaceCount: null,
        confidence: "medium"
      },
      verifiedRules: {},
      curatorGuidance: {},
      scopeIntent: {
        persistentVerifiedRuleFields: [],
        persistentGuidanceFields: [],
        requestScopedVerifiedRuleFields: [],
        requestScopedGuidanceFields: []
      },
      notes: []
    });

    const result = await handlePlaylistMessage(
      playlist,
      "add a constraint that only covers are allowed"
    );

    expect(getJsonFromLLM).toHaveBeenCalledTimes(1);
    expect(verifyTrack).not.toHaveBeenCalled();
    expect(result.playlistUpdate).toBeNull();
    expect(result.updatedConstraints?.notes).toContain("Only covers are allowed.");
    expect(result.message).toContain("Updated the playlist rules and guidance.");
  });

  it("supports mixed removal-and-resequence requests without collapsing into fresh generation", async () => {
    vi.mocked(getLLMProvider).mockReturnValue("ollama");
    const first = acceptedTrack("track-1", "Wild Horses", "The Sundays");
    const second = acceptedTrack("track-2", "Gloomy Sunday", "Diamanda Galas");
    const third = acceptedTrack("track-3", "25 Minutes to Go", "Diamanda Galas");
    const fourth = acceptedTrack("track-4", "Sweet Jane", "Cowboy Junkies");
    vi.mocked(getJsonFromLLM)
      .mockResolvedValueOnce({
        operationIntent: {
          type: "reorder",
          requestedTrackCount: null,
          targetTotalTrackCount: null,
          replaceCount: null,
          confidence: "high"
        },
        verifiedRules: {},
        curatorGuidance: {},
        scopeIntent: {
          persistentVerifiedRuleFields: [],
          persistentGuidanceFields: [],
          requestScopedVerifiedRuleFields: [],
          requestScopedGuidanceFields: []
        },
        notes: ["After cuts, separate repeated artists in the remaining sequence."]
      })
      .mockResolvedValueOnce({
        message: "25 Minutes to Go is the expendable duplicate.",
        removeTrackIds: ["track-3"],
        rationaleByTrackId: {
          "track-3": "The second Diamanda slot is the obvious surplus."
        }
      })
      .mockResolvedValueOnce({
        message: "The survivors breathe better with the duplicate gone and the weights redistributed.",
        playlistMeta: { title: "After the Cut", mood: "Bleak procession", arc: "Tightened descent" },
        orderedTrackIds: ["track-2", "track-1", "track-4"],
        orderRationale: "Start with the heaviest blow, then widen the frame."
      })
      .mockResolvedValueOnce({
        message: "I broke the artist clustering and cut the obvious surplus. The survivors carry more air now."
      });

    const result = await handlePlaylistMessage(
      { ...playlist, tracks: [first, second, third, fourth] },
      "Cut 25 Minutes to Go, then reorder this so tracks by the same artist are separated."
    );

    expect(getJsonFromLLM).toHaveBeenCalledTimes(4);
    expect(result.message).toBe("I broke the artist clustering and cut the obvious surplus. The survivors carry more air now.");
    expect(result.playlistUpdate?.action).toBe("set");
    expect(result.playlistUpdate?.tracks.map((track) => track.id)).toEqual(["track-2", "track-1", "track-4"]);
    expect(result.playlistMeta).toEqual({
      title: "After the Cut",
      mood: "Bleak procession",
      arc: "Tightened descent"
    });
  });

  it("collapses multi-step reorder-and-cut summaries without contradictory stale prose", async () => {
    vi.mocked(getLLMProvider).mockReturnValue("ollama");
    const first = acceptedTrack("track-1", "Wild Horses", "The Sundays");
    const second = acceptedTrack("track-2", "Gloomy Sunday", "Diamanda Galas");
    const third = acceptedTrack("track-3", "25 Minutes to Go", "Diamanda Galas");
    const fourth = acceptedTrack("track-4", "Sweet Jane", "Cowboy Junkies");
    vi.mocked(getJsonFromLLM)
      .mockResolvedValueOnce({
        operationIntent: {
          type: "reorder",
          requestedTrackCount: null,
          targetTotalTrackCount: null,
          replaceCount: null,
          confidence: "high"
        },
        verifiedRules: {},
        curatorGuidance: {},
        scopeIntent: {
          persistentVerifiedRuleFields: [],
          persistentGuidanceFields: [],
          requestScopedVerifiedRuleFields: [],
          requestScopedGuidanceFields: []
        },
        notes: ["After cuts, separate repeated artists in the remaining sequence."]
      })
      .mockResolvedValueOnce({
        message: "All 4 tracks remain in the list; if you want to gut the excess, give the word.",
        playlistMeta: { title: "After the Cut", mood: "Bleak procession", arc: "Tightened descent" },
        orderedTrackIds: ["track-2", "track-1", "track-3", "track-4"],
        orderRationale: "Break the cluster first."
      })
      .mockResolvedValueOnce({
        message: "25 Minutes to Go is the expendable duplicate.",
        removeTrackIds: ["track-3"],
        rationaleByTrackId: {
          "track-3": "The second Diamanda slot is the obvious surplus."
        }
      })
      .mockResolvedValueOnce({
        message: "I separated the repeated voices and cut the extra weight. The stale cluster is gone."
      });

    const result = await handlePlaylistMessage(
      { ...playlist, tracks: [first, second, third, fourth] },
      "Reorder this so repeated artists are separated, then suggest cuts."
    );

    expect(result.message).toBe("I separated the repeated voices and cut the extra weight. The stale cluster is gone.");
    expect(result.message).not.toContain("All 4 tracks remain in the list");
    expect(result.message).not.toContain("give the word");
  });

  it("does not treat bridge-transition review prompts as pasted tracks", async () => {
    vi.mocked(getLLMProvider).mockReturnValue("ollama");
    vi.mocked(getJsonFromLLM)
      .mockResolvedValueOnce({
        action: "add",
        requestedTrackCount: 1,
        persistentConstraints: {},
        requestScopedConstraints: {},
        notes: []
      })
      .mockResolvedValueOnce({
        message: "I will look for a verified bridge.",
        playlistMeta: null,
        candidates: []
      });

    const result = await handlePlaylistMessage(
      { ...playlist, tracks: [acceptedTrack("track-1", "Phone Down", "Erykah Badu"), acceptedTrack("track-2", "Cherry-Coloured Funk", "Cocteau Twins")] },
      [
        "Find one verified bridge track for this transition: Erykah Badu - Phone Down into Cocteau Twins - Cherry-Coloured Funk.",
        "Transition: Erykah Badu - Phone Down into Cocteau Twins - Cherry-Coloured Funk."
      ].join("\n")
    );

    expect(result.message).not.toContain("detected a pasted track list");
    expect(verifyTracks).not.toHaveBeenCalled();
    expect(getJsonFromLLM).toHaveBeenCalledTimes(2);
  });

  it("does not generate playlist candidates for a plain greeting", async () => {
    const result = await handlePlaylistMessage(playlist, "hello");

    expect(result.playlistUpdate).toBeNull();
    expect(result.rejectedCandidates).toEqual([]);
    expect(getJsonFromLLM).not.toHaveBeenCalled();
  });

  it("filters session-suppressed non-credible candidates before verification", async () => {
    vi.mocked(getLLMProvider).mockReturnValue("ollama");
    vi.mocked(getJsonFromLLM).mockResolvedValueOnce({
      operationIntent: {
        type: "add",
        requestedTrackCount: 1,
        targetTotalTrackCount: null,
        replaceCount: null,
        confidence: "high"
      },
      verifiedRules: {},
      curatorGuidance: {},
      scopeIntent: {
        persistentVerifiedRuleFields: [],
        persistentGuidanceFields: [],
        requestScopedVerifiedRuleFields: [],
        requestScopedGuidanceFields: []
      },
      notes: []
    }).mockResolvedValueOnce({
      message: "Here is a track.",
      playlistMeta: null,
      candidates: [
        { title: "Imaginary Song", artist: "Ghost Artist", album: null, reason: "Fits.", vibeTags: [], expectedFitNotes: "", energy: null }
      ]
    }).mockResolvedValueOnce({
      message: "Retry with another real track.",
      playlistMeta: null,
      candidates: [
        { title: "Findable Song", artist: "Real Artist", album: null, reason: "Fits.", vibeTags: [], expectedFitNotes: "", energy: null }
      ]
    });
    vi.mocked(verifyTrack).mockResolvedValue({
      status: "verified",
      track: acceptedTrack("itunes:findable", "Findable Song", "Real Artist")
    });

    const result = await handlePlaylistMessage({
      ...playlist,
      suppressedCandidateFingerprints: [{
        fingerprint: "ghost artist::imaginary song",
        artist: "Ghost Artist",
        title: "Imaginary Song",
        reasonCode: "noCredibleMatch",
        createdAt: "2026-06-14T00:00:00.000Z"
      }]
    }, "add one more track");

    expect(verifyTrack).toHaveBeenCalledTimes(1);
    expect(vi.mocked(verifyTrack).mock.calls[0]?.[0]).toMatchObject({ title: "Findable Song", artist: "Real Artist" });
    expect(result.playlistUpdate?.tracks.map((track) => track.title)).toEqual(["Findable Song"]);
  });

  it("allows an explicit user re-ask to bypass session suppression for one request", async () => {
    vi.mocked(getLLMProvider).mockReturnValue("ollama");
    vi.mocked(getJsonFromLLM).mockResolvedValueOnce({
      operationIntent: {
        type: "add",
        requestedTrackCount: 1,
        targetTotalTrackCount: null,
        replaceCount: null,
        confidence: "high"
      },
      verifiedRules: {},
      curatorGuidance: {},
      scopeIntent: {
        persistentVerifiedRuleFields: [],
        persistentGuidanceFields: [],
        requestScopedVerifiedRuleFields: [],
        requestScopedGuidanceFields: []
      },
      notes: []
    }).mockResolvedValueOnce({
      message: "Trying it again.",
      playlistMeta: null,
      candidates: [
        { title: "Imaginary Song", artist: "Ghost Artist", album: null, reason: "Fits.", vibeTags: [], expectedFitNotes: "", energy: null }
      ]
    });
    vi.mocked(verifyTrack).mockResolvedValue({
      status: "verified",
      track: acceptedTrack("itunes:imaginary", "Imaginary Song", "Ghost Artist")
    });

    await handlePlaylistMessage({
      ...playlist,
      suppressedCandidateFingerprints: [{
        fingerprint: "ghost artist::imaginary song",
        artist: "Ghost Artist",
        title: "Imaginary Song",
        reasonCode: "noCredibleMatch",
        createdAt: "2026-06-14T00:00:00.000Z"
      }]
    }, "please try adding Ghost Artist Imaginary Song again if it turns out to be real");

    expect(verifyTrack).toHaveBeenCalledTimes(1);
    expect(vi.mocked(verifyTrack).mock.calls[0]?.[0]).toMatchObject({ title: "Imaginary Song", artist: "Ghost Artist" });
  });

  it("deduplicates repeated constraint lists when merging model and existing constraints", () => {
    const result = mergeConstraintLayers(
      {
        excludedArtists: ["Bad Religion"],
        excludedGenres: ["punk"],
        artistLimits: [{ artist: "A", maxTotalTracks: 2 }],
        requiredGenreAdditions: [{ genre: "hard rock", count: 2 }],
        notes: ["Keep it tense."]
      },
      {
        excludedArtists: ["bad religion", " Bad Religion "],
        excludedGenres: ["Punk"],
        artistLimits: [{ artist: "a", maxTotalTracks: 1 }],
        requiredGenreAdditions: [{ genre: "Hard Rock", count: 4 }],
        notes: ["Keep it tense."]
      }
    );

    expect(result.excludedArtists).toEqual(["Bad Religion"]);
    expect(result.excludedGenres).toEqual(["punk"]);
    expect(result.artistLimits).toEqual([{ artist: "A", maxTotalTracks: 1 }]);
    expect(result.requiredGenreAdditions).toEqual([{ genre: "hard rock", count: 4 }]);
    expect(result.notes).toEqual(["Keep it tense."]);
  });

  it("falls back to deterministic critique when model critique JSON is invalid", async () => {
    vi.stubEnv("LLM_DEBUG_RAW", "1");
    vi.mocked(getJsonFromLLM)
      .mockResolvedValueOnce({ nope: true })
      .mockResolvedValueOnce({ still: "bad" });

    const result = await handleAnalyzePlaylist(playlist);

    expect(result.message).toContain("deterministic playlist check");
    expect(result.constraintReport.totalDurationMs).toBe(0);
    expect(result.debug?.modelRawOutput).toEqual({ still: "bad" });
  });

  it("accepts nullable playlist metadata fields from model generation", async () => {
    vi.mocked(getJsonFromLLM).mockResolvedValueOnce({
      message: "Adding more Motley Crue.",
      playlistMeta: { title: null, mood: null, arc: null },
      candidates: [{
        title: "Wild Side",
        artist: "Motley Crue",
        album: null,
        reason: "Big sleazy hard rock.",
        vibeTags: ["hard rock"],
        expectedFitNotes: "Fits the glam metal lane.",
        energy: 8
      }]
    });
    vi.mocked(verifyTrack).mockResolvedValueOnce({ status: "verified", track: verifiedTrack });

    const result = await handlePlaylistMessage(playlist, "add some tracks by motley crue");

    expect(result.playlistMeta).toEqual({ title: null, mood: null, arc: null });
    expect(result.playlistUpdate?.tracks[0].title).toBe("Wild Side");
  });

  it("reorders existing tracks and updates playlist title and arc without verifying candidates", async () => {
    const first = acceptedTrack("track-1", "First", "A");
    const second = acceptedTrack("track-2", "Second", "B");
    vi.mocked(getJsonFromLLM).mockResolvedValueOnce({
      message: "This sequence now rises from tension into release.",
      playlistMeta: {
        title: "Pressure Bloom",
        mood: "Heavy, coiled, and cathartic.",
        arc: "Starts tense, gets heavier, then releases."
      },
      orderedTrackIds: ["track-2", "track-1"],
      orderRationale: "Second sets the tone before First resolves it."
    });

    const result = await handlePlaylistMessage(
      { ...playlist, tracks: [first, second] },
      "give this playlist a good reorder, title, description, and arc"
    );

    expect(getJsonFromLLM).toHaveBeenCalledTimes(1);
    expect(verifyTrack).not.toHaveBeenCalled();
    expect(verifyTracks).not.toHaveBeenCalled();
    expect(result.playlistUpdate?.action).toBe("reorder");
    expect(result.playlistUpdate?.tracks.map((track) => track.id)).toEqual(["track-2", "track-1"]);
    expect(result.playlistMeta).toEqual({
      title: "Pressure Bloom",
      mood: "Heavy, coiled, and cathartic.",
      arc: "Starts tense, gets heavier, then releases."
    });
  });

  it("routes flow and grouping requests to playlist shaping without generating additions", async () => {
    vi.mocked(getLLMProvider).mockReturnValue("ollama");
    const first = acceptedTrack("track-1", "First", "A");
    const second = acceptedTrack("track-2", "Second", "B");
    vi.mocked(getJsonFromLLM).mockResolvedValueOnce({
      message: "A cleaner flow.",
      playlistMeta: { title: "New Shape", mood: "Focused.", arc: "A to B." },
      orderedTrackIds: ["track-2", "track-1"],
      orderRationale: "A better opening."
    });

    const result = await handlePlaylistMessage(
      { ...playlist, tracks: [first, second] },
      "group the rock tracks together and improve the overall flow"
    );

    expect(getJsonFromLLM).toHaveBeenCalledTimes(1);
    expect(getJsonFromLLM).toHaveBeenCalledWith(expect.stringContaining("group or separate genres"), expect.anything());
    expect(verifyTrack).not.toHaveBeenCalled();
    expect(result.playlistUpdate?.action).toBe("reorder");
    expect(result.playlistUpdate?.tracks.map((track) => track.id)).toEqual(["track-2", "track-1"]);
  });

  it("preserves deterministically extracted constraints on early playlist shaping requests", async () => {
    vi.mocked(getLLMProvider).mockReturnValue("ollama");
    const first = acceptedTrack("track-1", "First", "A");
    const second = acceptedTrack("track-2", "Second", "B");
    vi.mocked(getJsonFromLLM).mockResolvedValueOnce({
      message: "A cleaner rise.",
      playlistMeta: { title: "Rising Shape", mood: "Focused.", arc: "Builds upward." },
      orderedTrackIds: ["track-1", "track-2"],
      orderRationale: "A steady lift."
    });

    const result = await handlePlaylistMessage(
      { ...playlist, tracks: [first, second] },
      "sequence this so it gradually increases energy and ends hopeful"
    );

    expect(getJsonFromLLM).toHaveBeenCalledTimes(1);
    expect(getJsonFromLLM).toHaveBeenCalledWith(expect.stringContaining("\"energyTrajectory\":{\"direction\":\"gradual_rise\",\"ending\":\"hopeful\"}"), expect.anything());
    expect(result.updatedConstraints?.energyTrajectory).toEqual({
      direction: "gradual_rise",
      ending: "hopeful"
    });
    expect(result.playlistUpdate?.action).toBe("reorder");
  });

  it("retries generation to satisfy an explicit requested track count", async () => {
    vi.mocked(getJsonFromLLM)
      .mockResolvedValueOnce({
        message: "Here are five candidates.",
        playlistMeta: null,
        candidates: [
          { title: "One", artist: "A", album: null, reason: "Fits.", vibeTags: [], expectedFitNotes: "", energy: null },
          { title: "Two", artist: "B", album: null, reason: "Fits.", vibeTags: [], expectedFitNotes: "", energy: null },
          { title: "Bad", artist: "C", album: null, reason: "Fits.", vibeTags: [], expectedFitNotes: "", energy: null }
        ]
      })
      .mockResolvedValueOnce({
        message: "Here are more candidates.",
        playlistMeta: null,
        candidates: [
          { title: "Three", artist: "D", album: null, reason: "Fits.", vibeTags: [], expectedFitNotes: "", energy: null },
          { title: "Four", artist: "E", album: null, reason: "Fits.", vibeTags: [], expectedFitNotes: "", energy: null },
          { title: "Five", artist: "F", album: null, reason: "Fits.", vibeTags: [], expectedFitNotes: "", energy: null }
        ]
      });
    vi.mocked(verifyTrack).mockImplementation(async ({ title, artist }) => {
      if (title === "Bad") {
        return {
          status: "rejected",
          rejected: { title, artist, reason: "No credible metadata match was found." }
        };
      }
      return { status: "verified", track: acceptedTrack(`id:${title}`, title, artist) };
    });

    const result = await handlePlaylistMessage(playlist, "give me 5 songs");

    expect(getJsonFromLLM).toHaveBeenCalledTimes(2);
    const retryPrompt = vi.mocked(getJsonFromLLM).mock.calls[1][0] as string;
    expect(retryPrompt).toContain("Prefer canonical, widely released studio tracks");
    expect(retryPrompt).toContain("Avoid live versions, remasters, alternate mixes");
    expect(retryPrompt).toContain("Previous rejected candidates in this request");
    expect(retryPrompt).toContain("Rejected because No credible metadata match was found.");
    expect(retryPrompt).toContain("- C - Bad");
    expect(retryPrompt).toContain("c::bad");
    expect(result.playlistUpdate?.tracks.map((track) => track.title)).toEqual(["One", "Two", "Three", "Four", "Five"]);
    expect(result.rejectedCandidates).toHaveLength(1);
  });

  it("deduplicates repeated rejected candidates across retry passes", async () => {
    vi.mocked(getLLMProvider).mockReturnValue("ollama");
    vi.mocked(getJsonFromLLM)
      .mockResolvedValueOnce({
        message: "First pass.",
        playlistMeta: null,
        candidates: [
          { title: "Bad", artist: "C", album: null, reason: "Fits.", vibeTags: [], expectedFitNotes: "", energy: null }
        ]
      })
      .mockResolvedValueOnce({
        message: "Second pass.",
        playlistMeta: null,
        candidates: [
          { title: "Bad", artist: "C", album: null, reason: "Fits.", vibeTags: [], expectedFitNotes: "", energy: null },
          { title: "Good", artist: "D", album: null, reason: "Fits.", vibeTags: [], expectedFitNotes: "", energy: null }
        ]
      });
    vi.mocked(verifyTrack).mockImplementation(async ({ title, artist }) => {
      if (title === "Bad") {
        return {
          status: "rejected",
          rejected: {
            title,
            artist,
            reason: "No credible metadata match was found.",
            rejectionCode: "noCredibleMatch"
          }
        };
      }
      return { status: "verified", track: acceptedTrack(`id:${title}`, title, artist) };
    });

    const result = await handlePlaylistMessage(playlist, "give me 1 song");

    expect(result.playlistUpdate?.tracks.map((track) => track.title)).toEqual(["Good"]);
    expect(result.rejectedCandidates).toHaveLength(1);
    expect(result.rejectedCandidates[0]).toMatchObject({
      title: "Bad",
      artist: "C",
      reason: "No credible metadata match was found."
    });
  });

  it("honors requested count, global genre, and under-duration constraints together", async () => {
    const candidates = [
      ["One", "A"],
      ["Too Long", "B"],
      ["Two", "C"],
      ["Not Hard Rock", "D"],
      ["Three", "E"],
      ["Four", "F"],
      ["Five", "G"],
      ["Extra", "H"],
      ["Extra Two", "I"],
      ["Extra Three", "J"]
    ].map(([title, artist]) => ({
      title,
      artist,
      album: null,
      reason: "Fits.",
      vibeTags: ["hard rock"],
      expectedFitNotes: "",
      energy: null
    }));
    vi.mocked(getJsonFromLLM).mockResolvedValueOnce({
      message: "Here are ten candidates.",
      playlistMeta: null,
      candidates
    });
    vi.mocked(verifyTrack).mockImplementation(async ({ title, artist }) => {
      const durationMs = title === "Too Long" ? 260000 : 210000;
      const genreTags = title === "Not Hard Rock" ? ["pop"] : ["hard rock"];
      return {
        status: "verified",
        track: {
          ...acceptedTrack(`id:${title}`, title, artist),
          durationMs,
          runtime: durationMs === 260000 ? "4:20" : "3:30",
          genreTags
        }
      };
    });

    const result = await handlePlaylistMessage(
      playlist,
      "songs should be hard rock and under 4 minutes in length. find me 5 songs like that."
    );

    expect(result.updatedConstraints?.maxTrackDurationMs).toBe(240000);
    expect(result.updatedConstraints?.requiredGenreAdditions).toEqual([]);
    expect(result.playlistUpdate?.tracks.map((track) => track.title)).toEqual(["One", "Two", "Not Hard Rock", "Three", "Four"]);
    expect(result.rejectedCandidates.map((candidate) => candidate.title)).toEqual(["Too Long"]);
    expect(verifyTrack).toHaveBeenCalledTimes(6);
  });

  it("does not persist unmet request-scoped genre additions as active chips", async () => {
    vi.mocked(getJsonFromLLM)
      .mockResolvedValueOnce({
        message: "Here are four candidates.",
        playlistMeta: null,
        candidates: [
          { title: "Short Pop", artist: "A", album: null, reason: "Fits.", vibeTags: ["pop"], expectedFitNotes: "", energy: null },
          { title: "Too Long", artist: "B", album: null, reason: "Fits.", vibeTags: ["pop"], expectedFitNotes: "", energy: null },
          { title: "Not Pop", artist: "C", album: null, reason: "Fits.", vibeTags: ["rock"], expectedFitNotes: "", energy: null }
        ]
      })
      .mockResolvedValueOnce({
        message: "No better replacements.",
        playlistMeta: null,
        candidates: []
      });
    vi.mocked(verifyTrack).mockImplementation(async ({ title, artist }) => {
      const durationMs = title === "Too Long" ? 200000 : 150000;
      const genreTags = title === "Not Pop" ? ["rock"] : ["pop"];
      return {
        status: "verified",
        track: {
          ...acceptedTrack(`id:${title}`, title, artist),
          durationMs,
          runtime: durationMs === 200000 ? "3:20" : "2:30",
          genreTags
        }
      };
    });

    const result = await handlePlaylistMessage(playlist, "add 4 pop songs under 3 minutes each");

    expect(result.playlistUpdate?.tracks.map((track) => track.title)).toEqual(["Short Pop", "Not Pop"]);
    expect(result.updatedConstraints?.maxTrackDurationMs).toBe(180000);
    expect(result.updatedConstraints?.requiredGenreAdditions).toEqual([]);
    expect(result.constraintReport.violations).toEqual([]);
  });

  it("does not persist additive vocalist profile requests as future rules", async () => {
    vi.mocked(getLLMProvider).mockReturnValue("ollama");
    vi.mocked(getJsonFromLLM)
      .mockResolvedValueOnce({
        action: "add",
        requestedTrackCount: null,
        persistentConstraints: { vocalProfile: "female_vocals" },
        requestScopedConstraints: {},
        notes: []
      })
      .mockResolvedValueOnce({
        message: "Here is a vocalist-forward candidate.",
        playlistMeta: null,
        candidates: [
          { title: "Voice One", artist: "A", album: null, reason: "Fits.", vibeTags: ["female vocals"], expectedFitNotes: "", energy: null }
        ]
      });
    vi.mocked(verifyTrack).mockResolvedValue({
      status: "verified",
      track: acceptedTrack("id:Voice One", "Voice One", "A")
    });

    const result = await handlePlaylistMessage(playlist, "add some female vocalists, but show me if the evidence is unknown");

    expect(result.playlistUpdate?.tracks.map((track) => track.title)).toEqual(["Voice One"]);
    expect(result.updatedConstraints?.vocalProfile).toBeUndefined();
    expect(vi.mocked(getJsonFromLLM).mock.calls[1][0]).toContain("\"vocalProfile\":\"female_vocals\"");
  });

  it("uses LLM instruction parsing to keep addition genres request scoped", async () => {
    vi.mocked(getLLMProvider).mockReturnValue("ollama");
    vi.mocked(getJsonFromLLM)
      .mockResolvedValueOnce({
        action: "add",
        requestedTrackCount: 4,
        persistentConstraints: { maxTrackDurationMs: 180000 },
        requestScopedConstraints: { requiredGenreAdditions: [{ genre: "pop", count: 4 }] },
        notes: []
      })
      .mockResolvedValueOnce({
        message: "Here are four candidates.",
        playlistMeta: null,
        candidates: [
          { title: "Short Pop", artist: "A", album: null, reason: "Fits.", vibeTags: ["pop"], expectedFitNotes: "", energy: null }
        ]
      })
      .mockResolvedValueOnce({
        message: "No more.",
        playlistMeta: null,
        candidates: []
      });
    vi.mocked(verifyTrack).mockResolvedValue({
      status: "verified",
      track: {
        ...acceptedTrack("id:Short Pop", "Short Pop", "A"),
        durationMs: 150000,
        runtime: "2:30",
        genreTags: ["pop"]
      }
    });

    const result = await handlePlaylistMessage(playlist, "add 4 pop songs under 3 minutes each");

    expect(getJsonFromLLM).toHaveBeenCalledTimes(3);
    expect(result.playlistUpdate?.tracks.map((track) => track.title)).toEqual(["Short Pop"]);
    expect(result.updatedConstraints?.maxTrackDurationMs).toBe(180000);
    expect(result.updatedConstraints?.requiredGenreAdditions).toEqual([]);
  });

  it("verifies exact requested additions without inventing substitute tracks", async () => {
    vi.mocked(getLLMProvider).mockReturnValue("ollama");
    vi.mocked(getJsonFromLLM).mockResolvedValueOnce({
      operationIntent: {
        type: "add",
        requestedTrackCount: null,
        targetTotalTrackCount: null,
        replaceCount: null,
        confidence: "high"
      },
      verifiedRules: {},
      curatorGuidance: {},
      scopeIntent: {
        persistentVerifiedRuleFields: [],
        persistentGuidanceFields: [],
        requestScopedVerifiedRuleFields: [],
        requestScopedGuidanceFields: []
      },
      notes: []
    });
    vi.mocked(verifyTrack)
      .mockImplementationOnce(async ({ title, artist }) => ({
        status: "verified",
        track: acceptedTrack(`id:${title}:${artist}`, title, artist)
      }))
      .mockImplementationOnce(async ({ title, artist }) => ({
        status: "rejected",
        rejected: {
          title,
          artist,
          reason: "The best metadata match was ambiguous and needs review.",
          rejectionCode: "ambiguousMatch"
        }
      }));

    const result = await handlePlaylistMessage(
      playlist,
      "add smells like teen spirit covered by patti smith and covered by tori amos"
    );

    expect(getJsonFromLLM).toHaveBeenCalledTimes(1);
    expect(verifyTrack).toHaveBeenCalledTimes(2);
    expect(result.playlistUpdate?.action).toBe("add");
    expect(result.playlistUpdate?.tracks.map((track) => `${track.artist} - ${track.title}`)).toEqual([
      "patti smith - smells like teen spirit"
    ]);
    expect(result.rejectedCandidates).toEqual([
      expect.objectContaining({
        artist: "tori amos",
        title: "smells like teen spirit",
        rejectionCode: "ambiguousMatch"
      })
    ]);
  });

  it("enforces playlist-level runtime targets while accepting a small tolerance", async () => {
    vi.mocked(getLLMProvider).mockReturnValue("ollama");
    vi.mocked(getJsonFromLLM)
      .mockResolvedValueOnce({
        action: "add",
        requestedTrackCount: null,
        persistentConstraints: { targetTotalDurationMs: 1_200_000, totalDurationToleranceMs: 180_000 },
        requestScopedConstraints: {},
        notes: []
      })
      .mockResolvedValueOnce({
        message: "Here are high-energy candidates.",
        playlistMeta: null,
        candidates: [
          "One",
          "Two",
          "Three",
          "Four",
          "Five",
          "Six"
        ].map((title) => ({ title, artist: "A", album: null, reason: "Fits.", vibeTags: ["classic rock"], expectedFitNotes: "", energy: 9 }))
      });
    vi.mocked(verifyTrack).mockImplementation(async ({ title, artist }) => ({
      status: "verified",
      track: {
        ...acceptedTrack(`id:${title}`, title, artist),
        durationMs: 240000,
        runtime: "4:00",
        genreTags: ["classic rock"]
      }
    }));

    const result = await handlePlaylistMessage(
      playlist,
      "let's create a 20 minute playlist for workouts. it should be high energy and focus on classic rock from the 1970s."
    );

    expect(result.updatedConstraints?.targetTotalDurationMs).toBe(1_200_000);
    expect(result.updatedConstraints?.totalDurationToleranceMs).toBe(180_000);
    expect(result.playlistUpdate?.tracks).toHaveLength(5);
    expect(result.constraintReport.totalDurationMs).toBe(1_200_000);
    expect(result.constraintReport.passed).toBe(true);
    expect(result.rejectedCandidates[0]).toMatchObject({
      title: "Six",
      violatedConstraint: "targetTotalDurationMs"
    });
  });

  it("uses deterministic duration polarity when LLM intent inverts over language", async () => {
    vi.mocked(getLLMProvider).mockReturnValue("ollama");
    vi.mocked(getJsonFromLLM)
      .mockResolvedValueOnce({
        action: "add",
        requestedTrackCount: 10,
        persistentConstraints: { maxTrackDurationMs: 240000 },
        requestScopedConstraints: { requiredGenreAdditions: [{ genre: "baroque classical", count: 10 }] },
        notes: []
      })
      .mockResolvedValueOnce({
        message: "No candidates.",
        playlistMeta: null,
        candidates: []
      });

    const result = await handlePlaylistMessage(
      playlist,
      "i think i want a playlist of about 10 songs. they should be over 4 minutes each and baroque classical."
    );

    expect(result.updatedConstraints?.minTrackDurationMs).toBe(240000);
    expect(result.updatedConstraints?.maxTrackDurationMs).toBeUndefined();
  });

  it("removes existing tracks that violate newly requested runtime constraints without calling the LLM", async () => {
    const longTrack: Track = {
      ...verifiedTrack,
      id: "itunes:2",
      title: "Sister Ray",
      artist: "The Velvet Underground",
      durationMs: 1040000,
      runtime: "17:20"
    };
    const result = await handlePlaylistMessage(
      { ...playlist, tracks: [verifiedTrack, longTrack] },
      "remove any songs over 5 minutes in length"
    );

    expect(getJsonFromLLM).not.toHaveBeenCalled();
    expect(result.updatedConstraints?.maxTrackDurationMs).toBe(300000);
    expect(result.playlistUpdate?.action).toBe("remove");
    expect(result.playlistUpdate?.tracks).toEqual([longTrack]);
    expect(result.constraintReport.passed).toBe(true);
  });

  it("treats keep-under runtime feedback as deterministic cleanup instead of generation", async () => {
    const longTrack: Track = {
      ...verifiedTrack,
      id: "itunes:2",
      title: "A Plague of Lighthouse Keepers",
      artist: "Van der Graaf Generator",
      durationMs: 1400000,
      runtime: "23:20"
    };
    const result = await handlePlaylistMessage(
      { ...playlist, tracks: [verifiedTrack, longTrack] },
      "the tracks you suggested were a bit made up or too hard to find. the van der graaf generator track was too long. let's keep these songs under 8 minutes"
    );

    expect(getJsonFromLLM).not.toHaveBeenCalled();
    expect(result.updatedConstraints?.maxTrackDurationMs).toBe(480000);
    expect(result.playlistUpdate?.action).toBe("remove");
    expect(result.playlistUpdate?.tracks).toEqual([longTrack]);
    expect(result.message).toContain("violated the updated constraints");
    expect(result.rejectedCandidates).toEqual([]);
  });

  it("removes existing tracks selected by LLM-guided subjective removal", async () => {
    vi.mocked(getLLMProvider).mockReturnValue("ollama");
    const bright = { ...acceptedTrack("track-1", "Bright Lift", "A"), durationMs: 180000, energy: 8, fitNotes: "Keeps the mood moving upward." };
    const drag = { ...acceptedTrack("track-2", "Grey Drag", "B"), durationMs: 180000, energy: 2, fitNotes: "Pulls the set into a colder lull." };
    vi.mocked(getJsonFromLLM).mockResolvedValueOnce({
      message: "I interpreted this as removing the track that stalls the upward mood.",
      removeTrackIds: ["track-2"],
      rationaleByTrackId: {
        "track-2": "Lower energy and fit notes point toward a colder lull."
      }
    });

    const result = await handlePlaylistMessage(
      { ...playlist, tracks: [bright, drag] },
      "remove tracks that bring down the mood"
    );

    expect(getJsonFromLLM).toHaveBeenCalledTimes(1);
    expect(getJsonFromLLM).toHaveBeenCalledWith(expect.stringContaining("You are selecting existing tracks to remove"), expect.anything());
    expect(verifyTrack).not.toHaveBeenCalled();
    expect(result.playlistUpdate?.action).toBe("remove");
    expect(result.playlistUpdate?.tracks.map((track) => track.id)).toEqual(["track-2"]);
    expect(result.message).toContain("Removed 1 track selected by curator judgment");
    expect(result.updatedConstraints?.noMoreFromGenres).toEqual([]);
    expect(result.updatedConstraints?.excludedGenres).toEqual([]);
    expect(result.updatedConstraints?.notes).toEqual([]);
    expect(result.constraintReport.totalDurationMs).toBe(bright.durationMs);
  });

  it("does not mutate the playlist when LLM-guided removal returns no valid track ids", async () => {
    vi.mocked(getLLMProvider).mockReturnValue("ollama");
    const first = acceptedTrack("track-1", "First", "A");
    vi.mocked(getJsonFromLLM).mockResolvedValueOnce({
      message: "I would remove a nonexistent track.",
      removeTrackIds: ["not-in-playlist"],
      rationaleByTrackId: {
        "not-in-playlist": "Invalid id."
      }
    });

    const result = await handlePlaylistMessage(
      { ...playlist, tracks: [first] },
      "remove anything that weakens the vibe"
    );

    expect(result.playlistUpdate).toBeNull();
    expect(getJsonFromLLM).toHaveBeenCalledTimes(1);
    expect(result.message).toContain("No tracks were removed because the curator did not return any valid existing track IDs");
    expect(result.updatedConstraints?.noMoreFromGenres).toEqual([]);
    expect(result.updatedConstraints?.excludedGenres).toEqual([]);
    expect(result.updatedConstraints?.notes).toEqual([]);
    expect(result.constraintReport.totalDurationMs).toBe(first.durationMs);
  });

  it("prunes repeated artists before filling to a requested total track count", async () => {
    vi.mocked(getLLMProvider).mockReturnValue("ollama");
    const keeper = acceptedTrack("track-1", "Keeper", "A");
    const repeat = acceptedTrack("track-2", "Repeat", "A");
    const other = acceptedTrack("track-3", "Other", "B");
    vi.mocked(getJsonFromLLM)
      .mockResolvedValueOnce({
        action: "add",
        requestedTrackCount: 1,
        persistentConstraints: { maxTracksPerArtist: 1 },
        requestScopedConstraints: {},
        notes: []
      })
      .mockResolvedValueOnce({
        message: "Here are two fresh artists.",
        playlistMeta: null,
        candidates: [
          { title: "New One", artist: "C", album: null, reason: "Fits.", vibeTags: [], expectedFitNotes: "", energy: null },
          { title: "New Two", artist: "D", album: null, reason: "Fits.", vibeTags: [], expectedFitNotes: "", energy: null }
        ]
      });
    vi.mocked(verifyTrack).mockImplementation(async ({ title, artist }) => ({
      status: "verified",
      track: acceptedTrack(`id:${title}`, title, artist)
    }));

    const result = await handlePlaylistMessage(
      { ...playlist, tracks: [keeper, repeat, other] },
      "make it so that only one track per artist exists and add some tracks to fill this out to 4 total"
    );

    expect(result.updatedConstraints?.maxTracksPerArtist).toBe(1);
    expect(result.message).toContain("Removed 1 track to satisfy existing playlist constraints before adding replacements.");
    expect(result.message).toContain("I verified and accepted 2 tracks toward the requested 2.");
    expect(result.playlistUpdate?.action).toBe("set");
    expect(result.playlistUpdate?.tracks.map((track) => `${track.artist}:${track.title}`)).toEqual([
      "A:Keeper",
      "B:Other",
      "C:New One",
      "D:New Two"
    ]);
    expect(result.constraintReport.passed).toBe(true);
    expect(vi.mocked(getJsonFromLLM).mock.calls[1][0]).toContain("The user needs 2 accepted tracks");
  });
});
