import { describe, expect, it } from "vitest";
import { promptHarnessFixtures, reviewHarnessFixtures } from "@/lib/ai/testing/promptHarnessFixtures";
import { scorePromptHarnessRun, scoreReviewHarnessRun } from "@/lib/ai/testing/promptHarness";
import { deterministicAnalyzePlaylist } from "@/lib/playlist/analysis/deterministicAnalyze";
import { parseCompressionRequest } from "@/lib/playlist/analysis/compression";
import type { AnalyzePlaylistResponse, CandidateTrack, InstructionIntent } from "@/types/playlist";

const baseIntent: InstructionIntent = {
  operationIntent: {
    type: "add",
    requestedTrackCount: 5,
    targetTotalTrackCount: null,
    replaceCount: null,
    confidence: "high"
  },
  verifiedRules: {
    maxTrackDurationMs: 180000,
    excludedArtists: ["motley crue"]
  },
  curatorGuidance: {
    requiredGenreAdditions: [{ genre: "hard rock", count: 5 }]
  },
  routingIntent: {
    routeFamily: "curator",
    allowMutation: true,
    diagnosisOnly: false,
    hypotheticalOnly: false,
    reviewMode: null
  },
  scopeIntent: {
    persistentVerifiedRuleFields: ["maxTrackDurationMs", "excludedArtists"],
    persistentGuidanceFields: [],
    requestScopedVerifiedRuleFields: [],
    requestScopedGuidanceFields: ["requiredGenreAdditions"]
  },
  notes: []
};

function candidate(title: string, artist: string): CandidateTrack {
  return {
    title,
    artist,
    album: null,
    reason: "Fast hard rock fit.",
    vibeTags: ["hard rock"],
    expectedFitNotes: "Fits the requested hard rock lane.",
    energy: 8
  };
}

describe("prompt harness scoring", () => {
  it("passes a fixture when intent, constraints, and candidates satisfy expectations", () => {
    const fixture = promptHarnessFixtures.find((item) => item.id === "duration-and-count");
    expect(fixture).toBeDefined();

    const result = scorePromptHarnessRun(fixture!, baseIntent, [
      candidate("Kickstart My Heart", "Band A"),
      candidate("Ace of Spades", "Motorhead"),
      candidate("Communication Breakdown", "Led Zeppelin"),
      candidate("Tush", "ZZ Top"),
      candidate("Search and Destroy", "The Stooges")
    ]);

    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.issues).toEqual([]);
  });

  it("penalizes wrong intent and missing constraints", () => {
    const fixture = promptHarnessFixtures.find((item) => item.id === "duration-and-count");
    expect(fixture).toBeDefined();

    const result = scorePromptHarnessRun(
      fixture!,
      {
        operationIntent: {
          type: "reorder",
          requestedTrackCount: null,
          targetTotalTrackCount: null,
          replaceCount: null,
          confidence: "high"
        },
        verifiedRules: {},
        curatorGuidance: {},
        routingIntent: {
          routeFamily: "curator",
          allowMutation: true,
          diagnosisOnly: false,
          hypotheticalOnly: false,
          reviewMode: null
        },
        scopeIntent: {
          persistentVerifiedRuleFields: [],
          persistentGuidanceFields: [],
          requestScopedVerifiedRuleFields: [],
          requestScopedGuidanceFields: []
        },
        notes: []
      },
      [candidate("Ace of Spades", "Motorhead")]
    );

    expect(result.passed).toBe(false);
    expect(result.issues.some((issue) => issue.kind === "intent")).toBe(true);
    expect(result.issues.some((issue) => issue.kind === "constraint")).toBe(true);
  });

  it("penalizes duplicate existing tracks and placeholder-like candidates", () => {
    const fixture = promptHarnessFixtures.find((item) => item.id === "simple-additions");
    expect(fixture).toBeDefined();

    const result = scorePromptHarnessRun(
      fixture!,
      {
        operationIntent: {
          type: "add",
          requestedTrackCount: 3,
          targetTotalTrackCount: null,
          replaceCount: null,
          confidence: "high"
        },
        verifiedRules: {},
        curatorGuidance: {},
        routingIntent: {
          routeFamily: "curator",
          allowMutation: true,
          diagnosisOnly: false,
          hypotheticalOnly: false,
          reviewMode: null
        },
        scopeIntent: {
          persistentVerifiedRuleFields: [],
          persistentGuidanceFields: [],
          requestScopedVerifiedRuleFields: [],
          requestScopedGuidanceFields: []
        },
        notes: []
      },
      [
        candidate("Just What I Needed", "The Cars"),
        candidate("Song 1", "Unknown Artist"),
        candidate("Blue Monday", "New Order")
      ]
    );

    expect(result.passed).toBe(false);
    expect(result.issues.some((issue) => issue.kind === "candidate")).toBe(true);
    expect(result.issues.some((issue) => issue.kind === "hallucination")).toBe(true);
  });

  it("scores transformation review fixtures against structured review output", () => {
    const results = reviewHarnessFixtures.map((fixture) =>
      scoreReviewHarnessRun(
        fixture,
        deterministicAnalyzePlaylist(
          fixture.playlist,
          undefined,
          { compressionRequest: parseCompressionRequest(fixture.userQuestion) }
        )
      )
    );

    expect(results.map((result) => [result.fixtureId, result.passed])).toEqual(
      reviewHarnessFixtures.map((fixture) => [fixture.id, true])
    );
  });

  it("penalizes unsafe direct application modes for candidate-style review suggestions", () => {
    const fixture = reviewHarnessFixtures.find((item) => item.id === "review-abrupt-bridge");
    expect(fixture).toBeDefined();
    const response: AnalyzePlaylistResponse = {
      reviewMode: "full_critique",
      message: "Unsafe.",
      strengths: [],
      weakLinks: [],
      sequencingNotes: [],
      constraintReport: { passed: true, totalDurationMs: 0, violations: [], evidenceWarnings: [] },
      suggestedEdits: [],
      trackRoles: [],
      transitionReview: [],
      reviewSuggestions: [{
        id: "unsafe",
        type: "add_bridge",
        applicationMode: "remove_existing",
        affectedTrackIds: ["soft-opener"],
        rationale: "Bad mode.",
        intentPreservation: "N/A",
        risk: null,
        confidence: "low",
        suggestedPrompt: null
      }]
    };

    const result = scoreReviewHarnessRun(fixture!, response);

    expect(result.passed).toBe(false);
    expect(result.issues.some((issue) => issue.kind === "review")).toBe(true);
  });
});
