import { describe, expect, it } from "vitest";
import { constraintExtractionPatterns, mergeExtractedConstraints } from "@/lib/playlist/constraints/extraction";

describe("constraint extraction", () => {
  it("defines extraction patterns with unique ids", () => {
    const ids = constraintExtractionPatterns.map((pattern) => pattern.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it("groups deterministic extraction by rule and scope", () => {
    expect(constraintExtractionPatterns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "bpm-range-target-and-bounds", ruleId: "bpm", scope: "persistent" }),
        expect.objectContaining({ id: "persistent-vocal-profile", ruleId: "vocalProfile", scope: "persistent" }),
        expect.objectContaining({ id: "energy-trajectory", ruleId: "energyTrajectory", scope: "persistent" }),
        expect.objectContaining({ id: "track-duration-bounds", ruleId: "trackDuration", scope: "persistent" }),
        expect.objectContaining({ id: "genre-addition-guidance", ruleId: "requiredGenreAdditions", scope: "requestScoped" })
      ])
    );
  });

  it("does not treat random as a required genre", () => {
    const constraints = mergeExtractedConstraints({}, "add 10 random songs");

    expect(constraints.requiredGenreAdditions).toEqual([]);
  });

  it("still extracts explicit required genre additions", () => {
    const constraints = mergeExtractedConstraints({}, "add two cowpunk songs");

    expect(constraints.requiredGenreAdditions).toEqual([{ genre: "cowpunk", count: 2 }]);
  });

  it("treats under runtime language as a hard maximum", () => {
    const constraints = mergeExtractedConstraints({}, "songs should be hard rock and under 4 minutes in length");

    expect(constraints.maxTrackDurationMs).toBe(240000);
  });

  it("keeps no-shorter-than runtime language as a hard minimum", () => {
    const constraints = mergeExtractedConstraints({}, "no songs shorter than 2 minutes");

    expect(constraints.minTrackDurationMs).toBe(120000);
    expect(constraints.maxTrackDurationMs).toBeUndefined();
  });

  it("treats over runtime language as a hard minimum", () => {
    const constraints = mergeExtractedConstraints({}, "songs should be over 4 minutes each");

    expect(constraints.minTrackDurationMs).toBe(240000);
    expect(constraints.maxTrackDurationMs).toBeUndefined();
  });

  it("keeps no-over runtime language as a hard maximum", () => {
    const constraints = mergeExtractedConstraints({}, "no songs over 4 minutes");

    expect(constraints.maxTrackDurationMs).toBe(240000);
    expect(constraints.minTrackDurationMs).toBeUndefined();
  });

  it("extracts playlist-level runtime targets separately from per-track limits", () => {
    const constraints = mergeExtractedConstraints({}, "let's create a 20 minute playlist for workouts");

    expect(constraints.targetTotalDurationMs).toBe(1_200_000);
    expect(constraints.totalDurationToleranceMs).toBe(180_000);
    expect(constraints.maxTrackDurationMs).toBeUndefined();
    expect(constraints.minTrackDurationMs).toBeUndefined();
  });

  it("extracts global genre language from should-be phrasing", () => {
    const constraints = mergeExtractedConstraints({}, "songs should be hard rock and under 4 minutes in length");

    expect(constraints.requiredGenreAdditions).toEqual([{ genre: "hard rock", count: 1 }]);
  });

  it("extracts genre quotas from should-only-be phrasing", () => {
    const constraints = mergeExtractedConstraints({}, "there should only be 4 indie rock songs on the playlist");

    expect(constraints.genreLimits).toEqual([{ genre: "indie rock", maxTotalTracks: 4 }]);
  });

  it("extracts BPM ranges", () => {
    const constraints = mergeExtractedConstraints({}, "keep tracks between 100 to 125 bpm");

    expect(constraints.minBpm).toBe(100);
    expect(constraints.maxBpm).toBe(125);
  });

  it("extracts target BPM with tolerance", () => {
    const constraints = mergeExtractedConstraints({}, "aim for around 110 BPM");

    expect(constraints.targetBpm).toBe(110);
    expect(constraints.targetBpmTolerance).toBe(5);
  });

  it("extracts vocalist profile constraints", () => {
    const constraints = mergeExtractedConstraints({}, "female vocalists only, no repeats");

    expect(constraints.vocalProfile).toBe("female_vocals");
  });

  it("stores covers-only requests as persistent curator guidance notes", () => {
    const constraints = mergeExtractedConstraints({}, "add a constraint that only covers are allowed");

    expect(constraints.notes).toContain("Only covers are allowed.");
  });

  it("does not persist additive vocalist profile requests", () => {
    const constraints = mergeExtractedConstraints({}, "add some female vocalists, but show me if the evidence is unknown");

    expect(constraints.vocalProfile).toBeUndefined();
  });

  it("extracts generic per-artist repeat limits", () => {
    expect(mergeExtractedConstraints({}, "only one track per artist").maxTracksPerArtist).toBe(1);
    expect(mergeExtractedConstraints({}, "no repeated artists").maxTracksPerArtist).toBe(1);
    expect(mergeExtractedConstraints({}, "no more than two tracks per artist").maxTracksPerArtist).toBe(2);
    expect(mergeExtractedConstraints({}, "limit this to 2 from each artist").maxTracksPerArtist).toBe(2);
    expect(mergeExtractedConstraints({}, "no more than 2 songs by the same artist can appear on the playlist").maxTracksPerArtist).toBe(2);
  });

  it("does not turn one-track-per-artist transform language into a genre quota", () => {
    const constraints = mergeExtractedConstraints(
      {},
      "make it so that only one track per artist exists and add some tracks to fill this out to 20 total"
    );

    expect(constraints.maxTracksPerArtist).toBe(1);
    expect(constraints.genreLimits).toEqual([]);
  });

  it("extracts energy trajectory constraints", () => {
    const constraints = mergeExtractedConstraints({}, "must gradually increase energy and peak before track 12 with a hopeful ending");

    expect(constraints.energyTrajectory).toEqual({
      direction: "gradual_rise",
      peakTrackNumber: 12,
      ending: "hopeful"
    });
  });

  it("extracts plural energy trajectory phrasing", () => {
    const constraints = mergeExtractedConstraints({}, "sequence this so it gradually increases energy and ends hopeful");

    expect(constraints.energyTrajectory).toEqual({
      direction: "gradual_rise",
      ending: "hopeful"
    });
  });
});
