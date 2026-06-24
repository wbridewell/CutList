import { describe, expect, it } from "vitest";
import { filterCompressionSuggestions, parseCompressionRequest } from "@/lib/playlist/analysis/compression";
import type { ReviewSuggestion } from "@/types/playlist";

describe("compression analysis helpers", () => {
  it("parses explicit compression requests and targets", () => {
    expect(parseCompressionRequest("compress this to 12 tracks")).toMatchObject({
      targetTrackCount: 12,
      compressionStrength: "moderate"
    });
    expect(parseCompressionRequest("make this a 12 track playlist")).toMatchObject({
      targetTrackCount: 12
    });
    expect(parseCompressionRequest("make this a 45 minute playlist")).toMatchObject({
      targetTotalDurationMs: 2_700_000
    });
    expect(parseCompressionRequest("light trim this set")).toMatchObject({
      compressionStrength: "gentle"
    });
    expect(parseCompressionRequest("aggressively cut this down")).toMatchObject({
      compressionStrength: "aggressive"
    });
  });

  it("does not mistake review prompts about naming weak tracks for compression", () => {
    expect(parseCompressionRequest("Review this playlist and name the two tracks that weaken its identity.")).toBeNull();
  });

  it("does not mistake per-track runtime preferences for playlist compression", () => {
    expect(parseCompressionRequest(
      "Repair only the transition from Firestarter into Roads. Recommend 3 bridge tracks. Prefer tracks under 5 minutes."
    )).toBeNull();
  });

  it("filters compression suggestions when the review was not explicitly about compression", () => {
    const suggestions: ReviewSuggestion[] = [{
      id: "compress-1",
      type: "compress_section",
      applicationMode: "remove_existing",
      affectedTrackIds: ["track-1"],
      rationale: "Tighten the middle.",
      intentPreservation: "Keeps anchors.",
      risk: null,
      confidence: "medium",
      suggestedPrompt: null
    }, {
      id: "bridge-1",
      type: "add_bridge",
      applicationMode: "verify_candidate",
      affectedTrackIds: ["track-1", "track-2"],
      rationale: "Bridge the gap.",
      intentPreservation: "Keeps both anchors.",
      risk: null,
      confidence: "medium",
      suggestedPrompt: "Find a bridge."
    }];

    expect(filterCompressionSuggestions(suggestions, null).map((suggestion) => suggestion.id)).toEqual(["bridge-1"]);
    expect(filterCompressionSuggestions(suggestions, {
      targetTrackCount: 12,
      targetTotalDurationMs: null,
      compressionStrength: "moderate",
      preserveExplicitRules: true
    })).toHaveLength(2);
  });
});
