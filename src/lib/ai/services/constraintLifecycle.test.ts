import { describe, expect, it } from "vitest";
import { buildConstraintExecutionState } from "@/lib/ai/services/constraintLifecycle";
import { mergeConstraintLayers, normalizeInstructionIntentLayers } from "@/lib/ai/services/instructionIntent";
import type { PlaylistState } from "@/types/playlist";

const playlist: PlaylistState = {
  id: "playlist",
  title: "Test",
  mood: null,
  arc: null,
  tracks: [],
  constraints: {},
  discoveryRadius: "moderate",
  conversationSummary: null,
  updatedAt: "2026-06-25T00:00:00.000Z"
};

describe("buildConstraintExecutionState", () => {
  it("preserves existing persistent guidance when adding a new hard rule", () => {
    const currentPlaylist = {
      ...playlist,
      constraints: {
        preferredGenres: ["trip-hop"],
        vocalProfile: "female_vocals" as const
      }
    };

    const state = buildConstraintExecutionState({
      playlist: currentPlaylist,
      deterministicConstraints: mergeConstraintLayers(currentPlaylist.constraints, { allowExplicit: false }),
      deterministicPersistentConstraints: { allowExplicit: false },
      deterministicRequestScopedConstraints: {},
      normalizedIntent: normalizeInstructionIntentLayers(null),
      userMessage: "Make no explicit tracks a lasting rule.",
      requestedAddCount: null
    });

    expect(state.persistentVerifiedRules.allowExplicit).toBe(false);
    expect(state.persistentGuidance.preferredGenres).toEqual(["trip-hop"]);
    expect(state.persistentGuidance.vocalProfile).toBe("female_vocals");
    expect(state.persistedConstraintsAfterSuccess.preferredGenres).toEqual(["trip-hop"]);
    expect(state.persistedConstraintsAfterSuccess.vocalProfile).toBe("female_vocals");
  });

  it("preserves notes and energy trajectory when adding duration and bpm rules", () => {
    const currentPlaylist = {
      ...playlist,
      constraints: {
        notes: ["Only covers are allowed."],
        energyTrajectory: {
          direction: "gradual_rise" as const,
          ending: "cathartic" as const
        }
      }
    };

    const state = buildConstraintExecutionState({
      playlist: currentPlaylist,
      deterministicConstraints: mergeConstraintLayers(currentPlaylist.constraints, {
        maxTrackDurationMs: 300000,
        maxBpm: 120
      }),
      deterministicPersistentConstraints: {
        maxTrackDurationMs: 300000,
        maxBpm: 120
      },
      deterministicRequestScopedConstraints: {},
      normalizedIntent: normalizeInstructionIntentLayers(null),
      userMessage: "Keep tracks under 5 minutes and below 120 BPM.",
      requestedAddCount: null
    });

    expect(state.persistentVerifiedRules.maxTrackDurationMs).toBe(300000);
    expect(state.persistentVerifiedRules.maxBpm).toBe(120);
    expect(state.persistentGuidance.notes).toEqual(["Only covers are allowed."]);
    expect(state.persistentGuidance.energyTrajectory).toEqual({
      direction: "gradual_rise",
      ending: "cathartic"
    });
  });

  it("keeps request-scoped guidance active without promoting it to persisted constraints", () => {
    const currentPlaylist = {
      ...playlist,
      constraints: {
        preferredGenres: ["industrial"]
      }
    };

    const state = buildConstraintExecutionState({
      playlist: currentPlaylist,
      deterministicConstraints: mergeConstraintLayers(currentPlaylist.constraints, {
        requiredGenreAdditions: [{ genre: "goth", count: 2 }]
      }),
      deterministicPersistentConstraints: {},
      deterministicRequestScopedConstraints: {
        requiredGenreAdditions: [{ genre: "goth", count: 2 }]
      },
      normalizedIntent: normalizeInstructionIntentLayers(null),
      userMessage: "For this batch, add two goth tracks.",
      requestedAddCount: 2
    });

    expect(state.requestScopedGuidance.requiredGenreAdditions).toEqual([{ genre: "goth", count: 2 }]);
    expect(state.activeConstraints.requiredGenreAdditions).toEqual([{ genre: "goth", count: 2 }]);
    expect(state.persistedConstraintsAfterSuccess.requiredGenreAdditions).toEqual([]);
    expect(state.persistedConstraintsAfterSuccess.preferredGenres).toEqual(["industrial"]);
  });
});
