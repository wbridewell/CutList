import { describe, expect, it } from "vitest";
import { getLlmContract, llmContracts, returnJsonShapeGuidance } from "@/lib/ai/contracts";

describe("LLM contracts", () => {
  it("defines unique contract ids", () => {
    const ids = llmContracts.map((contract) => contract.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it("registers the current LLM tasks", () => {
    expect(llmContracts.map((contract) => contract.id)).toEqual([
      "instructionIntent",
      "curatorStepPlan",
      "candidateBatch",
      "playlistShape",
      "playlistRemoval",
      "importChat",
      "matchReview",
      "playlistCritique",
      "workflowSummary"
    ]);
  });

  it("renders reusable JSON shape guidance", () => {
    const contract = getLlmContract("candidateBatch");

    expect(returnJsonShapeGuidance(contract)).toContain("Return only JSON with this shape");
    expect(returnJsonShapeGuidance(contract)).toContain("\"candidates\": CandidateTrack[]");
  });

  it("parses valid candidate batches through the registered contract", () => {
    const parsed = getLlmContract("candidateBatch").parse({
      message: "Try these.",
      playlistMeta: null,
      candidates: [{
        title: "Song",
        artist: "Artist",
        album: null,
        reason: "Fits.",
        vibeTags: [],
        expectedFitNotes: "",
        energy: null
      }]
    });

    expect(parsed.candidates[0]?.title).toBe("Song");
  });

  it("normalizes legacy candidate rationale input through the shared schema", () => {
    const parsed = getLlmContract("candidateBatch").parse({
      message: "Try this.",
      playlistMeta: null,
      candidates: [{
        title: "Song",
        artist: "Artist",
        album: null,
        rationale: "Fits.",
        vibeTags: []
      }]
    });

    expect(parsed.candidates[0]).toMatchObject({
      reason: "Fits.",
      expectedFitNotes: "",
      energy: null
    });
  });

  it("rejects invalid contract output", () => {
    expect(() => getLlmContract("playlistRemoval").parse({
      message: "Remove it.",
      removeTrackIds: [""],
      rationaleByTrackId: {}
    })).toThrow();
  });

  it("parses transformation review critique fields through the registered contract", () => {
    const parsed = getLlmContract("playlistCritique").parse({
      curatorTake: "This has a clear center but still needs a bridge.",
      message: "This sequence works but needs a bridge.",
      strengths: [],
      weakLinks: [],
      sequencingNotes: [],
      suggestedEdits: [],
      intentSummary: {
        playlistIdentity: "Nocturnal ascent.",
        preservedQualities: ["Keep the verified anchors."],
        likelyUserIntent: "Move from tension to release.",
        riskNotes: [],
        confidence: "medium"
      },
      trackRoles: [{
        trackId: "track-1",
        role: "opener",
        rationale: "It frames the entry.",
        confidence: "high"
      }],
      transitionReview: [{
        fromTrackId: "track-1",
        toTrackId: "track-2",
        issueType: "weak_bridge",
        summary: "Needs connective tissue.",
        suggestedRepair: "Find a bridge.",
        confidence: "medium"
      }],
      reviewSuggestions: [{
        id: "bridge-1",
        type: "add_bridge",
        applicationMode: "verify_candidate",
        affectedTrackIds: ["track-1", "track-2"],
        rationale: "Bridge the transition.",
        intentPreservation: "Keep both anchors.",
        risk: null,
        confidence: "medium",
        suggestedPrompt: "Find a bridge track."
      }]
    });

    expect(parsed.trackRoles[0]?.role).toBe("opener");
    expect(parsed.reviewSuggestions[0]?.applicationMode).toBe("verify_candidate");
  });

  it("parses compression review suggestions through the critique contract", () => {
    const parsed = getLlmContract("playlistCritique").parse({
      curatorTake: "The middle is overbuilt and wants tightening.",
      message: "This playlist wants a tighter middle section.",
      strengths: [],
      weakLinks: [],
      sequencingNotes: [],
      suggestedEdits: [],
      intentSummary: {
        playlistIdentity: "Warm nocturnal climb.",
        preservedQualities: ["Keep the opener and closer."],
        likelyUserIntent: "Tighten the draggy middle without losing lift.",
        riskNotes: [],
        confidence: "medium"
      },
      trackRoles: [],
      transitionReview: [],
      reviewSuggestions: [{
        id: "compress-1",
        type: "compress_section",
        applicationMode: "remove_existing",
        affectedTrackIds: ["track-2"],
        rationale: "The middle repeats the same palette without advancing the arc.",
        intentPreservation: "Keeps the opener and closer as anchors.",
        risk: "Compression is interpretive.",
        confidence: "medium",
        suggestedPrompt: null,
        orderedTrackIds: ["track-1", "track-3"],
        compressionPlan: {
          removeTrackIds: ["track-2"],
          keepTrackIds: ["track-1", "track-3"],
          targetTrackCount: 2,
          targetTotalDurationMs: null
        },
        sectionLabel: "Middle drag",
        sectionStartTrackId: "track-1",
        sectionEndTrackId: "track-3"
      }]
    });

    expect(parsed.reviewSuggestions[0]).toMatchObject({
      type: "compress_section",
      applicationMode: "remove_existing",
      sectionLabel: "Middle drag"
    });
  });

  it("normalizes review suggestion types that accidentally use application mode names", () => {
    const contract = getLlmContract("playlistCritique");
    const parsed = contract.parse({
      curatorTake: "The arc is there, but the order is doing it no favors.",
      message: "The arc works but could be reordered.",
      strengths: ["Cohesive identity."],
      weakLinks: [],
      sequencingNotes: [],
      suggestedEdits: [],
      intentSummary: {
        playlistIdentity: "Cold rhythmic minimalism.",
        preservedQualities: ["Keep the verified anchors."],
        likelyUserIntent: "Descend into atmospheric dread.",
        riskNotes: [],
        confidence: "medium"
      },
      trackRoles: [],
      transitionReview: [],
      reviewSuggestions: [{
        id: "reorder-1",
        type: "reorder_existing",
        applicationMode: "reorder_existing",
        affectedTrackIds: ["track-1", "track-2"],
        orderedTrackIds: ["track-2", "track-1"],
        rationale: "Open with the colder anchor.",
        intentPreservation: "Keeps the same material.",
        risk: "Changes the entry point.",
        confidence: "medium",
        suggestedPrompt: null
      }]
    });

    expect(parsed.reviewSuggestions[0]?.type).toBe("reorder");
    expect(parsed.reviewSuggestions[0]?.applicationMode).toBe("reorder_existing");
  });
});
