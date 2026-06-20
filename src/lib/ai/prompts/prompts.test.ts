import { afterEach, describe, expect, it, vi } from "vitest";
import {
  candidatePrompt,
  critiquePrompt,
  getCuratorPersona,
  instructionIntentPrompt,
  playlistRemovalPrompt,
  playlistShapePrompt
} from "@/lib/ai/prompts";
import { readLocalLLMSettings } from "@/lib/ai/llmConfig";
import type { PlaylistState } from "@/types/playlist";

vi.mock("@/lib/ai/llmConfig", async () => {
  const actual = await vi.importActual<typeof import("@/lib/ai/llmConfig")>("@/lib/ai/llmConfig");
  return {
    ...actual,
    readLocalLLMSettings: vi.fn(() => ({}))
  };
});

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

describe("curator prompt personas", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.mocked(readLocalLLMSettings).mockReturnValue({});
  });

  it("defaults to razor persona", () => {
    vi.stubEnv("LLM_CURATOR_VOICE", "");

    expect(getCuratorPersona()).toBe("razor");
    expect(candidatePrompt(playlist, "add three songs")).toContain("Curator persona: razor.");
  });

  it("falls back to razor for unknown legacy env values", () => {
    vi.stubEnv("LLM_CURATOR_VOICE", "bogus");

    expect(getCuratorPersona()).toBe("razor");
    expect(critiquePrompt(playlist)).toContain("Curator persona: razor.");
  });

  it("uses saved archivist persona guidance", () => {
    vi.mocked(readLocalLLMSettings).mockReturnValue({ curatorPersona: "archivist" });
    const prompt = candidatePrompt(playlist, "add three songs");

    expect(getCuratorPersona()).toBe("archivist");
    expect(prompt).toContain("Curator persona: archivist.");
    expect(prompt).toContain("Sound like The Archivist");
    expect(prompt).toContain("Judge tracks by ancestry, continuity, and the hidden bridges");
    expect(prompt).toContain("Return only JSON with this shape");
    expect(prompt).toContain("Never invent artists, bands, ensembles, albums, or track titles");
    expect(prompt).toContain("Honor verified rules in the request");
  });

  it("spells out structured genre-addition intent shape", () => {
    const intentPrompt = instructionIntentPrompt(playlist, "add three hard rock songs");

    expect(intentPrompt).toContain("Always include every top-level key");
    expect(intentPrompt).toContain("Duration limits on requested tracks");
    expect(intentPrompt).toContain("requiredGenreAdditions must always be an array of objects");
    expect(intentPrompt).toContain("never return a string, null, or a bare array of genre names");
    expect(intentPrompt).toContain("verifiedRules.excludedGenres");
    expect(intentPrompt).toContain("excludedArtists must always be an array of artist-name strings");
    expect(intentPrompt).toContain("artistLimits as objects");
    expect(intentPrompt).toContain("verifiedRules.excludedArtists");
    expect(intentPrompt).toContain("verifiedRules.maxTracksPerArtist = 1");
    expect(intentPrompt).toContain("Additive vocalist requests");
    expect(intentPrompt).toContain("scopeIntent.requestScopedGuidanceFields");
    expect(intentPrompt).toContain("prefer add, remove, or replace as operationIntent.type");
    expect(intentPrompt).toContain("Return every top-level key exactly once");
    expect(intentPrompt).toContain("\"replace the weakest 3 tracks\"");
    expect(intentPrompt).toContain("\"bring this to 15 total\"");
  });

  it("spells out candidate energy bounds", () => {
    const prompt = candidatePrompt(playlist, "add three songs", { requestedTrackCount: 3 });

    expect(prompt).toContain("CandidateTrack.energy must be null or a number from 1 to 10");
    expect(prompt).toContain("CandidateTrack.reason and CandidateTrack.expectedFitNotes must be non-null strings");
    expect(prompt).toContain("The user needs 3 accepted tracks; propose about 6 candidates");
    expect(prompt).toContain("backend verification can trim the list");
    expect(prompt).toContain("propose plausible real catalog matches without trying to prove exact metadata");
    expect(prompt).toContain("Do not include runtimes or source claims in candidate objects");
    expect(prompt).toContain("artists that have already reached an artistLimits maximum");
    expect(prompt).toContain("Do not literalize invented vibe phrases");
    expect(prompt).toContain("current playlist already has N tracks by that artist");
    expect(prompt).toContain("avoid putting two tracks by the same artist back to back");
    expect(prompt).toContain("Never return a track that is already present in the current playlist JSON");
  });

  it("adds discovery-radius guidance to candidate prompts", () => {
    const safePrompt = candidatePrompt(playlist, "add three songs", {
      requestedTrackCount: 3,
      discoveryRadius: "safe"
    });
    const experimentalPrompt = candidatePrompt(playlist, "add three songs", {
      requestedTrackCount: 3,
      discoveryRadius: "highly_experimental"
    });

    expect(safePrompt).toContain("Discovery radius: safe.");
    expect(safePrompt).toContain("Stay close to verified anchors");
    expect(experimentalPrompt).toContain("Discovery radius: highly experimental.");
    expect(experimentalPrompt).toContain("Maximize exploratory breadth");
  });

  it("adds recent conversation context as continuity rather than hard rules", () => {
    const prompt = candidatePrompt(playlist, "add two songs", {
      conversationContext: {
        recentMessages: [
          { role: "user", content: "The last picks were too made up." },
          { role: "assistant", content: "I will stay closer to findable catalog tracks." }
        ]
      }
    });

    expect(prompt).toContain("Recent conversation context for continuity only:");
    expect(prompt).toContain("- User: The last picks were too made up.");
    expect(prompt).toContain("- Curator: I will stay closer to findable catalog tracks.");
    expect(prompt).toContain("the latest user message and verified playlist rules as higher priority");
  });

  it("adds session suppression guidance to candidate prompts", () => {
    const prompt = candidatePrompt(playlist, "add two songs", {
      suppressedCandidates: [{
        fingerprint: "ghost artist::imaginary song",
        artist: "Ghost Artist",
        title: "Imaginary Song",
        reasonCode: "noCredibleMatch",
        createdAt: "2026-06-14T00:00:00.000Z"
      }]
    });

    expect(prompt).toContain("Previously rejected as non-credible in this session");
    expect(prompt).toContain("- Ghost Artist - Imaginary Song");
  });

  it("adds firestarter guidance to critique and playlist shape prompts", () => {
    vi.mocked(readLocalLLMSettings).mockReturnValue({ curatorPersona: "firestarter" });

    const critique = critiquePrompt(playlist);
    const shape = playlistShapePrompt(playlist, "sequence this");

    expect(critique).toContain("Curator persona: firestarter.");
    expect(critique).toContain("Sound like The Firestarter");
    expect(critique).toContain("Name friction, danger, rupture, ugliness, swagger, collapse, and bodily impact");
    expect(critique).toContain("Do not use markdown tables, headings, or long essays");
    expect(critique).toContain("Use only these track roles");
    expect(critique).toContain("Use only these transition issue types");
    expect(critique).toContain("Treat back-to-back tracks by the same artist as a likely sequencing weakness");
    expect(critique).toContain("Treat intentSummary.playlistIdentity as the critique's thesis line.");
    expect(critique).toContain("Use curatorTake as the compact voice burst.");
    expect(critique).toContain("Prefer sensory, scene, or tension language over generic filler");
    expect(critique).toContain("Every reviewSuggestion must be safe to inspect before application.");
    expect(critique).toContain("Return curatorTake as the Curator's compact human read of the playlist");
    expect(critique).toContain("Return one JSON object only.");
    expect(critique).toContain("reviewSuggestions must be [] when you have no safe suggestion to make.");
    expect(critique).toContain("verify_candidate");
    expect(shape).toContain("Curator persona: firestarter.");
    expect(shape).toContain("Return only JSON with this shape");
    expect(shape).toContain("Do not add, remove, invent, rename, or alter track metadata.");
    expect(shape).toContain("Avoid putting two tracks by the same artist back to back");
    expect(shape).toContain("Never claim you removed, cut, dropped, gutted, filtered, shortened, or kept only some tracks.");
  });

  it("adds razor-specific critique guidance for thesis and pressure points", () => {
    vi.mocked(readLocalLLMSettings).mockReturnValue({ curatorPersona: "razor" });

    const critique = critiquePrompt(playlist);

    expect(critique).toContain("Sound like The Razor: decisive, compressed, surgical");
    expect(critique).toContain("Make the thesis fast, name the pressure points cleanly");
    expect(critique).toContain("playlistIdentity as the critique's thesis line");
    expect(critique).toContain("what force holds it together");
  });

  it("marks post-edit sequencing prompts so they do not ask for removals again", () => {
    const prompt = playlistShapePrompt(playlist, "cut the extras and resequence", { postEditShape: true });

    expect(prompt).toContain("Structural edits requested by the user have already been applied");
    expect(prompt).toContain("Do not say removals still need to happen");
    expect(prompt).toContain("Original user request");
  });

  it("adds compression-specific critique guidance for explicit compression review", () => {
    const prompt = critiquePrompt(playlist, "compress this to 12 tracks", {
      compressionRequest: {
        targetTrackCount: 12,
        targetTotalDurationMs: null,
        compressionStrength: "moderate",
        preserveExplicitRules: true
      }
    });

    expect(prompt).toContain("explicitly asking for playlist compression");
    expect(prompt).toContain("Prefer section-level compress_section suggestions");
    expect(prompt).toContain("Aim toward 12 total tracks.");
  });

  it("requires playlist removal decisions to use existing track ids", () => {
    const prompt = playlistRemovalPrompt({
      ...playlist,
      tracks: [{
        id: "track-1",
        title: "Grey Drag",
        artist: "B",
        album: null,
        durationMs: 180000,
        runtime: "3:00",
        verified: true,
        source: "manual",
        sourceId: "track-1",
        sourceUrl: null,
        artworkUrl: null,
        vibeTags: [],
        genreTags: [],
        rationale: null,
        energy: 2,
        verificationNote: "Manual."
      }]
    }, "remove tracks that bring down the mood");

    expect(prompt).toContain("removeTrackIds must contain only track ids from the provided playlist JSON.");
    expect(prompt).toContain("Never claim you removed tracks in the message.");
    expect(prompt).toContain("track-1");
    expect(prompt).toContain("remove tracks that bring down the mood");
  });
});
