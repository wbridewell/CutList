import { beforeEach, describe, expect, it, vi } from "vitest";
import { composeGenerationResponse, executeCandidateGeneration } from "@/lib/ai/services/candidateExecution";
import type { ResolvedCuratorRequestPlan } from "@/lib/ai/services/workflowTypes";
import type { PlaylistState, Track } from "@/types/playlist";

vi.mock("@/lib/ai/services/llmService", () => ({
  attemptLlmContract: vi.fn()
}));

vi.mock("@/lib/music/verifyTrack", () => ({
  verifyTrack: vi.fn()
}));

const { attemptLlmContract } = await import("@/lib/ai/services/llmService");
const { verifyTrack } = await import("@/lib/music/verifyTrack");

function track(overrides: Partial<Track> = {}): Track {
  return {
    id: overrides.id ?? "manual:1",
    title: overrides.title ?? "Song",
    artist: overrides.artist ?? "Artist",
    album: overrides.album ?? null,
    durationMs: overrides.durationMs ?? 180000,
    runtime: overrides.runtime ?? "3:00",
    verified: overrides.verified ?? true,
    source: overrides.source ?? "manual",
    sourceId: overrides.sourceId ?? "1",
    sourceUrl: overrides.sourceUrl ?? null,
    artworkUrl: overrides.artworkUrl ?? null,
    vibeTags: overrides.vibeTags ?? [],
    genreTags: overrides.genreTags ?? [],
    rationale: overrides.rationale ?? null,
    fitNotes: overrides.fitNotes ?? null,
    energy: overrides.energy ?? null,
    bpm: overrides.bpm ?? null,
    bpmConfidence: overrides.bpmConfidence ?? null,
    vocalProfile: overrides.vocalProfile ?? null,
    vocalProfileConfidence: overrides.vocalProfileConfidence ?? null,
    evidenceNotes: overrides.evidenceNotes ?? [],
    verificationNote: overrides.verificationNote ?? "Manual.",
    verificationConfidence: overrides.verificationConfidence ?? "manual"
  };
}

function plan(playlist: PlaylistState): ResolvedCuratorRequestPlan {
  return {
    playlist,
    userMessage: "Replace the weakest track with a nastier fit.",
    operation: "replace",
    postOperationShape: false,
    normalizedIntent: {
      operationType: "replace",
      operationConfidence: "high",
      requestedAddCount: null,
      targetTotalTrackCount: null,
      replacementCount: 1,
      verifiedRules: {},
      curatorGuidance: {},
      persistentVerifiedRules: {},
      persistentGuidance: {},
      requestScopedVerifiedRules: {},
      requestScopedGuidance: {},
      persistentConstraints: {},
      requestScopedConstraints: {},
      activeConstraints: {},
      notes: [],
      raw: null
    },
    parsedTracks: [],
    explicitTrackRequests: [],
    requestedAddCount: null,
    targetTotalTrackCount: null,
    replacementCount: 1,
    instructionIntentStatus: "success",
    effectiveDiscoveryRadius: "moderate",
    constraintState: {
      deterministicConstraints: {},
      deterministicPersistentConstraints: {},
      deterministicRequestScopedConstraints: {},
      persistentVerifiedRules: {},
      persistentGuidance: {},
      requestScopedVerifiedRules: {},
      requestScopedGuidance: {},
      effectiveVerifiedRules: {},
      effectiveGuidance: {},
      activeConstraints: {},
      persistedConstraintsAfterSuccess: {}
    },
    suppressionState: {
      entries: [],
      overriddenFingerprints: new Set()
    },
    preGenerationRemovalPlan: {
      baseTracks: playlist.tracks,
      constraintRemovedTracks: [],
      removedTracks: [],
      versionCleanup: null
    },
    steps: [],
    debugNotes: []
  };
}

describe("executeCandidateGeneration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("skips first-pass candidates that are already in the original playlist during replacements", async () => {
    const existing = track({ id: "manual:old", sourceId: "old", title: "King Kunta", artist: "Kendrick Lamar" });
    const replacement = track({ id: "manual:new", sourceId: "new", title: "Assimilate", artist: "Skinny Puppy" });
    const playlist: PlaylistState = {
      id: "playlist",
      title: "Test",
      mood: null,
      arc: null,
      tracks: [existing],
      constraints: {},
      discoveryRadius: "moderate",
      conversationSummary: null,
      updatedAt: "2026-06-23T00:00:00Z"
    };

    vi.mocked(attemptLlmContract).mockResolvedValueOnce({
      status: "success",
      raw: {},
      repairedFromRaw: null,
      parsed: {
        message: "Try these.",
        playlistMeta: null,
        candidates: [
          {
            title: "King Kunta",
            artist: "Kendrick Lamar",
            album: null,
            reason: "Actually the same weak link again.",
            vibeTags: [],
            expectedFitNotes: "",
            energy: 8
          },
          {
            title: "Assimilate",
            artist: "Skinny Puppy",
            album: null,
            reason: "Sharper fit.",
            vibeTags: [],
            expectedFitNotes: "",
            energy: 9
          }
        ]
      }
    });

    vi.mocked(verifyTrack).mockResolvedValue({
      status: "verified",
      track: replacement
    });

    const result = await executeCandidateGeneration(
      plan(playlist),
      {},
      {
        baseTracks: [],
        replacementRemovedTracks: [existing],
        effectiveRequestedCount: 1
      }
    );

    if ("playlistUpdate" in result) {
      throw new Error("Expected candidate execution result, got final curator response.");
    }

    expect(vi.mocked(verifyTrack)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(verifyTrack).mock.calls[0]?.[0]).toMatchObject({
      title: "Assimilate",
      artist: "Skinny Puppy"
    });
    expect(result.acceptedTracks).toEqual([replacement]);
  });

  it("uses factual replacement summaries instead of replaying model removal claims", () => {
    const removedA = track({ id: "manual:old-1", title: "This Must Be the Place", artist: "Talking Heads" });
    const removedB = track({ id: "manual:old-2", title: "Midnight City", artist: "M83" });
    const addedA = track({ id: "manual:new-1", title: "Assimilate", artist: "Skinny Puppy" });
    const addedB = track({ id: "manual:new-2", title: "Dig It", artist: "Skinny Puppy" });
    const playlist: PlaylistState = {
      id: "playlist",
      title: "Test",
      mood: null,
      arc: null,
      tracks: [removedA, removedB],
      constraints: {},
      discoveryRadius: "moderate",
      conversationSummary: null,
      updatedAt: "2026-06-23T00:00:00Z"
    };

    const response = composeGenerationResponse(
      plan(playlist),
      {
        acceptedTracks: [addedA, addedB],
        rejectedCandidates: [],
        playlistMeta: null,
        activeConstraints: {},
        batchMessages: ["We are pruning the dead weight and replacing it with surgical essentials."]
      },
      {
        baseTracks: [],
        effectiveRequestedCount: 2,
        preGenerationRemovedTracks: [removedA, removedB]
      }
    );

    expect(response.message).toContain("Removed 2 tracks for replacement: Talking Heads - This Must Be the Place; M83 - Midnight City.");
    expect(response.message).toContain("Added 2 replacement tracks: Skinny Puppy - Assimilate; Skinny Puppy - Dig It.");
    expect(response.message).not.toContain("We are pruning the dead weight");
    expect(response.playlistUpdate).toMatchObject({
      action: "set",
      tracks: [addedA, addedB]
    });
  });
});
