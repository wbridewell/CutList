import { describe, expect, it } from "vitest";
import {
  createConstraintPresentation,
  getConstraintChips,
  getConstraintGuidance
} from "@/lib/playlist/constraints/presentation";
import type { ConstraintReport, PlaylistConstraints, Track } from "@/types/playlist";

function track(overrides: Partial<Track>): Track {
  return {
    id: overrides.id ?? "track-1",
    title: overrides.title ?? "Holocene",
    artist: overrides.artist ?? "Bon Iver",
    album: overrides.album ?? null,
    durationMs: overrides.durationMs ?? 337000,
    runtime: overrides.runtime ?? "5:37",
    verified: overrides.verified ?? true,
    source: overrides.source ?? "itunes",
    sourceId: overrides.sourceId ?? "itunes-1",
    sourceUrl: overrides.sourceUrl ?? null,
    artworkUrl: overrides.artworkUrl ?? null,
    vibeTags: overrides.vibeTags ?? [],
    genreTags: overrides.genreTags ?? [],
    rationale: overrides.rationale ?? null,
    fitNotes: overrides.fitNotes,
    energy: overrides.energy ?? null,
    verificationNote: overrides.verificationNote ?? "Verified."
  };
}

describe("constraint presentation", () => {
  it("derives compact rule chips and guidance from playlist constraints", () => {
    const constraints: PlaylistConstraints = {
      maxTrackDurationMs: 300000,
      targetBpm: 110,
      targetBpmTolerance: 5,
      maxTracksPerArtist: 1,
      vocalProfile: "female_vocals",
      energyTrajectory: {
        direction: "gradual_rise",
        peakTrackNumber: 12,
        ending: "hopeful"
      },
      preferredGenres: ["rock", "soul"],
      notes: ["Keep the fourth act high energy.", "End cleanly."]
    };

    expect(getConstraintChips(constraints).map((chip) => chip.label)).toEqual([
      "Tracks must be 5:00 or shorter",
      "Target 110 BPM ±5 when known",
      "No more than 1 track per artist"
    ]);
    expect(getConstraintGuidance(constraints)).toEqual([
      "Female vocals requested",
      "Energy trajectory: gradually increase energy, peak by track 12, hopeful ending",
      "Prefer rock",
      "Prefer soul",
      "Keep the fourth act high energy.",
      "End cleanly."
    ]);
  });

  it("groups track-level violation and evidence views without UI string parsing", () => {
    const tracks = [track({ id: "track-1", title: "Holocene", artist: "Bon Iver" })];
    const report: ConstraintReport = {
      passed: false,
      totalDurationMs: 337000,
      violations: [{
        type: "maxTrackDurationMs",
        message: "Holocene exceeds the maximum track runtime.",
        trackId: "track-1"
      }],
      evidenceWarnings: [{
        type: "bpmEvidence",
        message: "Holocene does not have BPM evidence, so BPM constraints could not be fully verified.",
        trackId: "track-1"
      }],
      coverage: {
        activeVerifiedRuleIds: ["maxTrackDurationMs", "minBpm"],
        fields: [{
          field: "bpm",
          activeRuleIds: ["minBpm"],
          status: "missing",
          availableTrackCount: 0,
          missingTrackCount: 1,
          totalTrackCount: 1,
          coverageRatio: 0,
          summary: "BPM data is missing for 1 of 1 tracks, so BPM rules could only be partially verified."
        }],
        summary: ["BPM data is missing for 1 of 1 tracks, so BPM rules could only be partially verified."]
      }
    };

    const presentation = createConstraintPresentation(tracks, { maxTrackDurationMs: 300000, minBpm: 100 }, report);

    expect(presentation.violationTrackCount).toBe(1);
    expect(presentation.evidenceWarningTrackCount).toBe(1);
    expect(presentation.violationViews[0]).toMatchObject({
      trackId: "track-1",
      trackTitle: "Holocene",
      summary: "exceeds the maximum track runtime."
    });
    expect(presentation.evidenceWarningViews[0]).toMatchObject({
      trackId: "track-1",
      trackTitle: "Holocene",
      summary: "does not have BPM evidence, so BPM constraints could not be fully verified."
    });
    expect(presentation.evidenceCoverageSummary).toEqual([
      "BPM data is missing for 1 of 1 tracks, so BPM rules could only be partially verified."
    ]);
    expect(presentation.violationMessagesByTrackId.get("track-1")).toEqual([
      "Holocene exceeds the maximum track runtime."
    ]);
  });

  it("splits rule and guidance overflow for compact rendering", () => {
    const presentation = createConstraintPresentation([], {
      maxTrackDurationMs: 300000,
      minBpm: 90,
      maxBpm: 130,
      maxTracks: 20,
      maxTracksPerArtist: 1,
      preferredGenres: ["post-punk"],
      notes: ["First note.", "Second note.", "Third note."]
    }, {
      passed: true,
      totalDurationMs: 0,
      violations: [],
      evidenceWarnings: []
    });

    expect(presentation.primaryRuleChips).toHaveLength(4);
    expect(presentation.overflowRuleChips.map((chip) => chip.key)).toEqual(["maxTracksPerArtist"]);
    expect(presentation.primaryGuidance).toEqual(["Prefer post-punk", "First note."]);
    expect(presentation.overflowGuidance).toEqual(["Second note.", "Third note."]);
  });

  it("separates verified rules from curator guidance chips", () => {
    const presentation = createConstraintPresentation([], {
      maxTrackDurationMs: 300000,
      vocalProfile: "female_vocals",
      energyTrajectory: { direction: "gradual_rise" }
    }, {
      passed: true,
      totalDurationMs: 0,
      violations: [],
      evidenceWarnings: []
    });

    expect(presentation.verifiedRuleChips.map((chip) => chip.key)).toEqual(["maxTrackDurationMs"]);
    expect(presentation.curatorGuidanceChips.map((chip) => chip.key)).toEqual(["vocalProfile", "energyTrajectory"]);
  });
});
