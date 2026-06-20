import { describe, expect, it } from "vitest";
import {
  constraintRuleRegistry,
  evaluateRegisteredTrackConstraintRules,
  getConstraintRuleById,
  getConstraintRuleChips,
  mergeConstraintLayersWithRegistry
} from "@/lib/playlist/constraints/registry";
import { PlaylistConstraintsSchema } from "@/lib/playlist/schemas";
import type { Track } from "@/types/playlist";

function track(overrides: Partial<Track>): Track {
  return {
    id: overrides.id ?? "track-1",
    title: overrides.title ?? "Test Track",
    artist: overrides.artist ?? "Test Artist",
    album: overrides.album ?? null,
    durationMs: overrides.durationMs ?? 180000,
    runtime: overrides.runtime ?? "3:00",
    verified: overrides.verified ?? true,
    source: overrides.source ?? "itunes",
    sourceId: overrides.sourceId ?? "itunes-1",
    sourceUrl: overrides.sourceUrl ?? null,
    artworkUrl: overrides.artworkUrl ?? null,
    vibeTags: overrides.vibeTags ?? [],
    genreTags: overrides.genreTags ?? [],
    rationale: overrides.rationale ?? null,
    energy: overrides.energy ?? null,
    bpm: overrides.bpm,
    bpmConfidence: overrides.bpmConfidence,
    vocalProfile: overrides.vocalProfile,
    vocalProfileConfidence: overrides.vocalProfileConfidence,
    verificationNote: overrides.verificationNote ?? "Verified."
  };
}

describe("constraint rule registry", () => {
  it("uses unique rule ids and references schema fields", () => {
    const ids = constraintRuleRegistry.map((rule) => rule.id);

    expect(new Set(ids).size).toBe(ids.length);
    for (const rule of constraintRuleRegistry) {
      expect(rule.fields.length).toBeGreaterThan(0);
    }
  });

  it("covers every playlist constraint schema field", () => {
    const schemaFields = Object.keys(PlaylistConstraintsSchema._def.innerType.shape).sort();
    const registryFields = [...new Set(constraintRuleRegistry.flatMap((rule) => rule.fields))].sort();

    expect(registryFields).toEqual(schemaFields);
  });

  it("defines rule metadata needed by later registry-driven phases", () => {
    expect(getConstraintRuleById("maxTracksPerArtist")).toMatchObject({
      category: "hard",
      enforcementLevel: "verified_rule",
      scope: "playlist",
      merge: "minLimit"
    });
    expect(getConstraintRuleById("vocalProfile")).toMatchObject({
      category: "guidance",
      enforcementLevel: "curator_guidance",
      scope: "track",
      merge: "replace"
    });
    expect(getConstraintRuleById("requiredGenreAdditions")).toMatchObject({
      category: "guidance",
      enforcementLevel: "curator_guidance",
      scope: "candidate",
      merge: "maxRequirement"
    });
  });

  it("renders existing constraint chip labels and removable keys", () => {
    const chips = getConstraintRuleChips({
      maxTrackDurationMs: 300000,
      targetBpm: 110,
      targetBpmTolerance: 5,
      maxTracksPerArtist: 1,
      vocalProfile: "female_vocals",
      excludedArtists: ["Bad Religion", "Drake"]
    });

    expect(chips.map((chip) => ({ key: chip.key, label: chip.label }))).toEqual([
      { key: "maxTrackDurationMs", label: "Tracks must be 5:00 or shorter" },
      { key: "targetBpm", label: "Target 110 BPM ±5 when known" },
      { key: "maxTracksPerArtist", label: "No more than 1 track per artist" },
      { key: "vocalProfile", label: "Female vocals requested" },
      { key: "excludedArtists:0", label: "Exclude artist: Bad Religion" },
      { key: "excludedArtists:1", label: "Exclude artist: Drake" }
    ]);
  });

  it("evaluates selected track-level hard and evidence-backed rules", () => {
    const evaluations = evaluateRegisteredTrackConstraintRules({
      artistCountBeforeTrack: 1,
      constraints: {
        maxTrackDurationMs: 180000,
        minBpm: 100,
        maxTracksPerArtist: 1,
        vocalProfile: "female_vocals"
      },
      track: track({
        durationMs: 240000,
        artist: "A",
        title: "Too Long"
      })
    });

    expect(evaluations.map((evaluation) => [evaluation.ruleId, evaluation.status])).toEqual([
      ["maxTrackDurationMs", "failed"],
      ["bpmEvidence", "unknown"],
      ["maxTracksPerArtist", "failed"]
    ]);
    expect(evaluations[0].message).toBe("Too Long exceeds the maximum track runtime.");
  });

  it("declares an enforcement level for every rule", () => {
    for (const rule of constraintRuleRegistry) {
      expect(["verified_rule", "curator_guidance"]).toContain(rule.enforcementLevel);
    }
  });

  it("declares evidence behavior for every verified rule and dependencies when needed", () => {
    for (const rule of constraintRuleRegistry) {
      if (rule.enforcementLevel !== "verified_rule") {
        continue;
      }
      expect(rule.evidenceBehavior).toBeTruthy();
      if (rule.evidenceBehavior !== "none") {
        expect(rule.evidenceDependencies?.length).toBeGreaterThan(0);
      }
    }
  });

  it("merges repeated constraint lists using registry merge strategies", () => {
    const result = mergeConstraintLayersWithRegistry(
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

  it("tightens scalar min-limit fields when merging", () => {
    const result = mergeConstraintLayersWithRegistry(
      { maxTracksPerArtist: 1 },
      { maxTracksPerArtist: 3 }
    );

    expect(result.maxTracksPerArtist).toBe(1);
  });
});
