import { describe, expect, it } from "vitest";
import { enforceNewTracks, evaluatePlaylistConstraints } from "@/lib/playlist/constraints";
import type { Track } from "@/types/playlist";

function track(overrides: Partial<Track>): Track {
  return {
    id: overrides.id ?? `${overrides.artist}:${overrides.title}`,
    title: overrides.title ?? "Song",
    artist: overrides.artist ?? "Artist",
    album: overrides.album ?? null,
    durationMs: overrides.durationMs ?? 120000,
    runtime: overrides.runtime ?? "2:00",
    verified: overrides.verified ?? true,
    source: overrides.source ?? "itunes",
    sourceId: overrides.sourceId ?? `${overrides.artist}:${overrides.title}`,
    sourceUrl: overrides.sourceUrl ?? null,
    artworkUrl: overrides.artworkUrl ?? null,
    explicit: overrides.explicit !== undefined ? overrides.explicit : false,
    releaseDate: overrides.releaseDate ?? null,
    vibeTags: overrides.vibeTags ?? [],
    genreTags: overrides.genreTags ?? [],
    rationale: overrides.rationale ?? null,
    energy: overrides.energy ?? null,
    bpm: overrides.bpm,
    bpmConfidence: overrides.bpmConfidence,
    vocalProfile: overrides.vocalProfile,
    vocalProfileConfidence: overrides.vocalProfileConfidence,
    evidenceNotes: overrides.evidenceNotes,
    verificationNote: overrides.verificationNote ?? "Verified."
  };
}

describe("playlist constraints", () => {
  it("rejects tracks over the maximum runtime", () => {
    const result = enforceNewTracks([], [
      track({ id: "1", title: "Too Long", durationMs: 181000 })
    ], { maxTrackDurationMs: 180000 });

    expect(result.accepted).toHaveLength(0);
    expect(result.rejected[0].violatedConstraint).toBe("maxTrackDurationMs");
  });

  it("detects duplicate source ids and normalized title/artist pairs", () => {
    const report = evaluatePlaylistConstraints([
      track({ id: "1", sourceId: "abc", artist: "Ministry", title: "Stigmata" }),
      track({ id: "2", sourceId: "abc", artist: "Ministry", title: "Stigmata" })
    ], {});

    expect(report.passed).toBe(false);
    expect(report.violations.some((violation) => violation.type === "duplicate")).toBe(true);
  });

  it("rejects the candidate that pushes a playlist beyond total runtime tolerance", () => {
    const existing = [
      track({ id: "1", title: "Fast One", durationMs: 240000 }),
      track({ id: "2", title: "Fast Two", durationMs: 240000 }),
      track({ id: "3", title: "Fast Three", durationMs: 240000 }),
      track({ id: "4", title: "Fast Four", durationMs: 240000 }),
      track({ id: "5", title: "Fast Five", durationMs: 240000 })
    ];
    const result = enforceNewTracks(existing, [
      track({ id: "6", title: "Barely Fine", durationMs: 120000 }),
      track({ id: "7", title: "Way Too Much", durationMs: 300000 })
    ], {
      targetTotalDurationMs: 1_200_000,
      totalDurationToleranceMs: 180_000
    });

    expect(result.accepted.map((item) => item.title)).toEqual(["Barely Fine"]);
    expect(result.rejected[0]).toMatchObject({
      title: "Way Too Much",
      violatedConstraint: "targetTotalDurationMs"
    });
    expect(result.report.totalDurationMs).toBe(1_320_000);
    expect(result.report.passed).toBe(true);
  });

  it("enforces blocked artists and artist quotas against existing tracks", () => {
    const existing = [track({ id: "1", artist: "Ministry", title: "Stigmata" })];
    const result = enforceNewTracks(existing, [
      track({ id: "2", artist: "Ministry", title: "Thieves" })
    ], {
      artistLimits: [{ artist: "Ministry", maxTotalTracks: 1 }],
      noMoreFromArtists: ["Viagra Boys"]
    });

    expect(result.accepted).toHaveLength(0);
    expect(result.rejected[0].violatedConstraint).toBe("artistLimits");
  });

  it("does not blame unrelated candidates for a pre-existing artist quota violation", () => {
    const existing = [
      track({ id: "1", artist: "Ministry", title: "Stigmata" }),
      track({ id: "2", artist: "Ministry", title: "Thieves" })
    ];
    const result = enforceNewTracks(existing, [
      track({ id: "3", artist: "Bauhaus", title: "Telegram Sam" })
    ], {
      artistLimits: [{ artist: "Ministry", maxTotalTracks: 1 }]
    });

    expect(result.accepted.map((item) => item.title)).toEqual(["Telegram Sam"]);
    expect(result.rejected).toEqual([]);
    expect(result.report.violations).toContainEqual({
      type: "artistLimits",
      message: "Ministry exceeds the artist quota of 1."
    });
  });

  it("flags existing tracks over a generic per-artist limit", () => {
    const report = evaluatePlaylistConstraints([
      track({ id: "1", artist: "A", title: "Keeper" }),
      track({ id: "2", artist: "A", title: "Repeat" }),
      track({ id: "3", artist: "B", title: "Other" })
    ], {
      maxTracksPerArtist: 1
    });

    expect(report.passed).toBe(false);
    expect(report.violations).toContainEqual({
      type: "maxTracksPerArtist",
      message: "A already has 1 track in the playlist.",
      trackId: "2"
    });
  });

  it("rejects new tracks that exceed a generic per-artist limit", () => {
    const result = enforceNewTracks([
      track({ id: "1", artist: "A", title: "Keeper" })
    ], [
      track({ id: "2", artist: "A", title: "Repeat" }),
      track({ id: "3", artist: "B", title: "Other" })
    ], {
      maxTracksPerArtist: 1
    });

    expect(result.accepted.map((item) => item.title)).toEqual(["Other"]);
    expect(result.rejected[0]).toMatchObject({
      title: "Repeat",
      violatedConstraint: "maxTracksPerArtist"
    });
  });

  it("enforces blocked genres and genre quotas", () => {
    const existing = [track({ id: "1", title: "Cowpunk One", genreTags: ["cowpunk"] })];
    const quota = enforceNewTracks(existing, [
      track({ id: "2", title: "Cowpunk Two", genreTags: ["cowpunk"] })
    ], {
      genreLimits: [{ genre: "cowpunk", maxTotalTracks: 1 }]
    });
    const blocked = enforceNewTracks([], [
      track({ id: "3", title: "Hardcore Song", genreTags: ["hardcore"] })
    ], {
      noMoreFromGenres: ["hardcore"]
    });

    expect(quota.accepted).toHaveLength(0);
    expect(quota.rejected[0].violatedConstraint).toBe("genreLimits");
    expect(blocked.accepted).toHaveLength(0);
    expect(blocked.rejected[0].violatedConstraint).toBe("noMoreFromGenres");
  });

  it("only counts genre quotas when metadata tags actually match", () => {
    const result = enforceNewTracks([
      track({ id: "1", title: "Tagged One", genreTags: ["indie rock"] }),
      track({ id: "2", title: "Broad Store Tag", genreTags: ["Alternative"] })
    ], [
      track({ id: "3", title: "Tagged Two", genreTags: ["Indie/Rock"] })
    ], {
      genreLimits: [{ genre: "indie rock", maxTotalTracks: 2 }]
    });

    expect(result.accepted).toHaveLength(1);
    expect(result.report.passed).toBe(true);
  });

  it("treats requested genre additions as generation guidance, not hard rejection rules", () => {
    const result = enforceNewTracks([], [
      track({ id: "1", title: "Wrong Texture", genreTags: ["post punk"] }),
      track({ id: "2", title: "Right Texture", genreTags: ["cowpunk"] })
    ], {
      requiredGenreAdditions: [{ genre: "cowpunk", count: 2 }]
    });

    expect(result.accepted.map((item) => item.title)).toEqual(["Wrong Texture", "Right Texture"]);
    expect(result.rejected).toEqual([]);
    expect(result.report.violations.some((violation) => violation.type === "requiredGenreAdditions")).toBe(false);
  });

  it("matches compact style spellings like postpunk and post punk", () => {
    const result = enforceNewTracks([], [
      track({ id: "1", title: "Transmission", genreTags: ["post punk"] })
    ], {
      requiredGenreAdditions: [{ genre: "postpunk", count: 1 }]
    });

    expect(result.accepted).toHaveLength(1);
    expect(result.report.violations).toEqual([]);
  });

  it("does not reject broad provider genres for style-scene additions", () => {
    const result = enforceNewTracks([], [
      track({ id: "1", title: "Transmission", genreTags: ["Alternative"] })
    ], {
      requiredGenreAdditions: [{ genre: "postpunk", count: 1 }]
    });

    expect(result.accepted).toHaveLength(1);
    expect(result.report.violations).toEqual([]);
  });

  it("rejects known BPM violations while warning about missing BPM evidence", () => {
    const result = enforceNewTracks([], [
      track({ id: "1", title: "In Range", bpm: 112, bpmConfidence: "high" }),
      track({ id: "2", title: "Too Fast", bpm: 145, bpmConfidence: "high" }),
      track({ id: "3", title: "Unknown Tempo" })
    ], {
      minBpm: 100,
      maxBpm: 125
    });

    expect(result.accepted.map((item) => item.title)).toEqual(["In Range", "Unknown Tempo"]);
    expect(result.rejected[0]).toMatchObject({ title: "Too Fast", violatedConstraint: "maxBpm" });
    expect(result.report.evidenceWarnings?.some((warning) => warning.type === "bpmEvidence")).toBe(true);
    expect(result.report.coverage?.fields).toContainEqual(expect.objectContaining({
      field: "bpm",
      status: "partial",
      availableTrackCount: 1,
      missingTrackCount: 1,
      totalTrackCount: 2
    }));
  });

  it("treats vocal profile as curator guidance instead of a rejecting rule", () => {
    const report = evaluatePlaylistConstraints([
      track({
        id: "1",
        title: "Clear Match",
        vocalProfile: "female_vocals",
        vocalProfileConfidence: "high"
      })
    ], {
      vocalProfile: "female_vocals"
    });

    expect(report.passed).toBe(true);
    expect(report.violations).toEqual([]);
    expect(report.evidenceWarnings).toEqual([]);
  });

  it("does not warn when vocalist profile evidence is unavailable", () => {
    const report = evaluatePlaylistConstraints([
      track({ id: "1", title: "Unknown Singer" })
    ], {
      vocalProfile: "female_vocals"
    });

    expect(report.passed).toBe(true);
    expect(report.violations).toEqual([]);
    expect(report.evidenceWarnings).toEqual([]);
  });

  it("does not fail energy trajectory guidance when track energy is missing", () => {
    const report = evaluatePlaylistConstraints([
      track({ id: "1", title: "Unknown Arc Start" }),
      track({ id: "2", title: "Unknown Arc End" })
    ], {
      energyTrajectory: {
        direction: "gradual_rise",
        peakTrackNumber: 2
      }
    });

    expect(report.passed).toBe(true);
    expect(report.violations).toEqual([]);
    expect(report.evidenceWarnings).toEqual([]);
  });

  it("handles mixed verified rules and curator guidance", () => {
    const result = enforceNewTracks([], [
      track({
        id: "1",
        title: "Too Long But Vocal Match",
        durationMs: 260000,
        vocalProfile: "female_vocals",
        vocalProfileConfidence: "medium"
      }),
      track({
        id: "2",
        title: "Accepted Unknown Tempo",
        durationMs: 180000
      })
    ], {
      maxTrackDurationMs: 240000,
      minBpm: 90,
      vocalProfile: "female_vocals"
    });

    expect(result.accepted.map((item) => item.title)).toEqual(["Accepted Unknown Tempo"]);
    expect(result.rejected[0].violatedConstraint).toBe("maxTrackDurationMs");
    expect(result.report.evidenceWarnings?.map((warning) => warning.type)).toEqual(["bpmEvidence"]);
    expect(result.report.findings?.map((finding) => finding.status)).toEqual(["unknown"]);
  });

  it("reports partial genre coverage for verified genre rules with sparse tags", () => {
    const report = evaluatePlaylistConstraints([
      track({ id: "1", title: "Tagged", genreTags: ["post punk"] }),
      track({ id: "2", title: "Broad", genreTags: [] })
    ], {
      excludedGenres: ["post punk"]
    });

    expect(report.coverage?.fields).toContainEqual(expect.objectContaining({
      field: "genreTags",
      status: "partial",
      availableTrackCount: 1,
      missingTrackCount: 1,
      totalTrackCount: 2
    }));
  });

  it("reports partial explicit coverage when explicitness is unknown", () => {
    const report = evaluatePlaylistConstraints([
      track({ id: "1", title: "Known", explicit: false }),
      track({ id: "2", title: "Unknown", explicit: null })
    ], {
      allowExplicit: false
    });

    expect(report.coverage?.fields).toContainEqual(expect.objectContaining({
      field: "explicit",
      status: "partial",
      availableTrackCount: 1,
      missingTrackCount: 1,
      totalTrackCount: 2
    }));
  });

  it("does not create noisy coverage entries for count-only rules", () => {
    const report = evaluatePlaylistConstraints([track({ id: "1" })], {
      maxTracks: 10
    });

    expect(report.coverage?.fields ?? []).toEqual([]);
  });
});
