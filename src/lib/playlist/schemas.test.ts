import { describe, expect, it } from "vitest";
import { AnalyzePlaylistResponseSchema, ConstraintReportSchema, CuratorStreamEventSchema, PlaylistRemovalDecisionSchema, ReviewSuggestionSchema, PlaylistStateSchema, PlaylistUpdateSchema, TrackSchema } from "@/lib/playlist/schemas";

describe("playlist schemas", () => {
  it("normalizes critique replacement candidates that use track-style rationale", () => {
    const parsed = AnalyzePlaylistResponseSchema.omit({ constraintReport: true }).parse({
      message: "This playlist has a strong abrasive core.",
      strengths: ["Focused energy."],
      weakLinks: [{
        trackId: "itunes:1546218551",
        reason: "Cleaner than the rest of the set."
      }],
      sequencingNotes: ["Open with the hardest thesis statement."],
      suggestedEdits: [{
        type: "replace",
        reason: "Use a harder-hitting hip-hop cut.",
        trackId: "itunes:1546218551",
        candidate: {
          title: "King Kunta",
          artist: "Kendrick Lamar",
          album: "To Pimp a Butterfly",
          durationMs: 234690,
          runtime: "3:55",
          genreTags: ["hip hop rap"],
          rationale: "Higher energy hip-hop that aligns with the playlist's aggressive spirit."
        }
      }]
    });

    expect(parsed.suggestedEdits[0].candidate).toEqual({
      title: "King Kunta",
      artist: "Kendrick Lamar",
      album: "To Pimp a Butterfly",
      reason: "Higher energy hip-hop that aligns with the playlist's aggressive spirit.",
      vibeTags: [],
      expectedFitNotes: "",
      energy: null
    });
  });

  it("accepts evidence-backed constraint and track metadata fields", () => {
    const parsedTrack = TrackSchema.parse({
      id: "manual:1",
      title: "Evidence Song",
      artist: "Evidence Artist",
      album: null,
      durationMs: 180000,
      runtime: "3:00",
      verified: true,
      source: "manual",
      sourceId: "manual-1",
      sourceUrl: null,
      artworkUrl: null,
      vibeTags: [],
      genreTags: [],
      rationale: null,
      fitNotes: null,
      energy: 6,
      bpm: 112,
      bpmConfidence: "high",
      vocalProfile: "female_vocals",
      vocalProfileConfidence: "medium",
      evidenceNotes: ["BPM and vocalist profile were manually reviewed."],
      verificationNote: "Manual entry."
    });

    const parsedPlaylist = PlaylistStateSchema.parse({
      id: "playlist",
      title: "Evidence Playlist",
      mood: null,
      arc: null,
      tracks: [parsedTrack],
      constraints: {
        maxTracksPerArtist: 1,
        minBpm: 100,
        maxBpm: 125,
        targetBpm: 112,
        targetBpmTolerance: 5,
        vocalProfile: "female_vocals",
        energyTrajectory: {
          direction: "gradual_rise",
          peakTrackNumber: 8,
          ending: "hopeful"
        }
      },
      conversationSummary: null,
      updatedAt: "2026-06-05T00:00:00.000Z"
    });

    expect(parsedPlaylist.tracks[0]).toMatchObject({
      bpm: 112,
      vocalProfile: "female_vocals",
      evidenceNotes: ["BPM and vocalist profile were manually reviewed."]
    });
    expect(parsedPlaylist.constraints).toMatchObject({
      maxTracksPerArtist: 1,
      minBpm: 100,
      maxBpm: 125,
      vocalProfile: "female_vocals"
    });
  });

  it("parses playlist removal decisions with rationale by track id", () => {
    const parsed = PlaylistRemovalDecisionSchema.parse({
      message: "I would remove the track that pulls the mood down.",
      removeTrackIds: ["track-2"],
      rationaleByTrackId: {
        "track-2": "Lower energy and fit notes make it feel like a drag."
      }
    });

    expect(parsed).toEqual({
      message: "I would remove the track that pulls the mood down.",
      removeTrackIds: ["track-2"],
      rationaleByTrackId: {
        "track-2": "Lower energy and fit notes make it feel like a drag."
      }
    });
  });

  it("accepts transformation review roles, transitions, intent, and suggestions", () => {
    const parsed = AnalyzePlaylistResponseSchema.parse({
      message: "The playlist has a clear rise.",
      strengths: [],
      weakLinks: [],
      sequencingNotes: [],
      constraintReport: {
        passed: true,
        totalDurationMs: 360000,
        violations: [],
        evidenceWarnings: []
      },
      suggestedEdits: [],
      intentSummary: {
        playlistIdentity: "Tense art-pop ascent.",
        preservedQualities: ["Keep the anxious opening."],
        likelyUserIntent: "Build toward release without losing intimacy.",
        riskNotes: ["The climax may arrive too early."],
        confidence: "medium"
      },
      trackRoles: [{
        trackId: "track-1",
        role: "opener",
        rationale: "It frames the unease.",
        confidence: "high",
        basis: "metadata_heuristic"
      }],
      transitionReview: [{
        fromTrackId: "track-1",
        toTrackId: "track-2",
        issueType: "weak_bridge",
        summary: "The shift is emotionally abrupt.",
        suggestedRepair: "Add a bridge.",
        confidence: "medium",
        basis: "model_judgment"
      }],
      reviewSuggestions: [{
        id: "suggestion-1",
        type: "add_bridge",
        applicationMode: "verify_candidate",
        affectedTrackIds: ["track-1", "track-2"],
        rationale: "A bridge would preserve the arc.",
        intentPreservation: "Keeps both anchors.",
        risk: null,
        confidence: "medium",
        basis: "mixed",
        suggestedPrompt: "Find one bridge track."
      }]
    });

    expect(parsed.intentSummary?.confidence).toBe("medium");
    expect(parsed.trackRoles[0]).toMatchObject({ role: "opener" });
    expect(parsed.transitionReview[0]).toMatchObject({ issueType: "weak_bridge" });
    expect(parsed.reviewSuggestions[0]).toMatchObject({ applicationMode: "verify_candidate" });
  });

  it("accepts additive evidence coverage reports", () => {
    const parsed = ConstraintReportSchema.parse({
      passed: true,
      totalDurationMs: 0,
      violations: [],
      evidenceWarnings: [],
      coverage: {
        activeVerifiedRuleIds: ["minBpm"],
        fields: [{
          field: "bpm",
          activeRuleIds: ["minBpm"],
          status: "missing",
          availableTrackCount: 0,
          missingTrackCount: 2,
          totalTrackCount: 2,
          coverageRatio: 0,
          summary: "BPM data is missing for 2 of 2 tracks, so BPM rules could only be partially verified."
        }],
        summary: ["BPM data is missing for 2 of 2 tracks, so BPM rules could only be partially verified."]
      }
    });

    expect(parsed.coverage?.fields[0]).toMatchObject({ field: "bpm", status: "missing" });
  });

  it("validates review suggestion application modes", () => {
    expect(ReviewSuggestionSchema.parse({
      id: "remove-1",
      type: "remove",
      applicationMode: "remove_existing",
      affectedTrackIds: ["track-1"],
      rationale: "Fails a hard rule.",
      intentPreservation: "Preserves explicit constraints.",
      confidence: "high"
    })).toMatchObject({
      risk: null,
      suggestedPrompt: null
    });
    expect(ReviewSuggestionSchema.parse({
      id: "reorder-1",
      type: "reorder_existing",
      applicationMode: "reorder_existing",
      affectedTrackIds: ["track-1", "track-2"],
      orderedTrackIds: ["track-2", "track-1"],
      rationale: "Move the stronger opener first.",
      intentPreservation: "Keeps the same tracks.",
      confidence: "medium"
    })).toMatchObject({
      type: "reorder",
      applicationMode: "reorder_existing"
    });
    expect(ReviewSuggestionSchema.safeParse({
      id: "bad",
      type: "add_bridge",
      applicationMode: "direct_add",
      affectedTrackIds: [],
      rationale: "Nope.",
      intentPreservation: "Nope.",
      confidence: "medium"
    }).success).toBe(false);
    expect(ReviewSuggestionSchema.parse({
      id: "compress-1",
      type: "compress_section",
      applicationMode: "remove_existing",
      affectedTrackIds: ["track-2"],
      rationale: "Trim the repeated middle section.",
      intentPreservation: "Keeps the anchor tracks intact.",
      confidence: "medium",
      compressionPlan: {
        removeTrackIds: ["track-2"],
        keepTrackIds: ["track-1", "track-3"],
        targetTrackCount: 2,
        targetTotalDurationMs: 540000
      },
      sectionLabel: "Middle drag",
      sectionStartTrackId: "track-1",
      sectionEndTrackId: "track-3"
    })).toMatchObject({
      type: "compress_section",
      applicationMode: "remove_existing",
      sectionLabel: "Middle drag",
      compressionPlan: {
        removeTrackIds: ["track-2"],
        targetTrackCount: 2
      }
    });
  });

  it("exports the playlist update schema used by curator responses", () => {
    expect(PlaylistUpdateSchema.parse({
      action: "reorder",
      tracks: [],
      orderRationale: "Open stronger."
    })).toEqual({
      action: "reorder",
      tracks: [],
      orderRationale: "Open stronger."
    });
  });

  it("validates shared curator stream events", () => {
    expect(CuratorStreamEventSchema.parse({
      type: "progress",
      event: { stage: "parsing", message: "Parsing request." }
    })).toMatchObject({
      type: "progress",
      event: { stage: "parsing" }
    });
    expect(CuratorStreamEventSchema.safeParse({
      type: "progress",
      event: { message: "Missing stage." }
    }).success).toBe(false);
  });

  it("accepts structured constraint findings while preserving legacy report fields", () => {
    const parsed = ConstraintReportSchema.parse({
      passed: false,
      totalDurationMs: 337000,
      violations: [{
        type: "maxTrackDurationMs",
        message: "Holocene exceeds the maximum track runtime.",
        trackId: "track-1"
      }],
      evidenceWarnings: [],
      findings: [{
        ruleId: "maxTrackDurationMs",
        status: "failed",
        subject: { kind: "track", trackId: "track-1" },
        summary: "exceeds the maximum track runtime.",
        detail: null,
        actionable: true
      }]
    });

    expect(parsed.findings?.[0]).toMatchObject({
      ruleId: "maxTrackDurationMs",
      status: "failed",
      actionable: true
    });
  });
});
