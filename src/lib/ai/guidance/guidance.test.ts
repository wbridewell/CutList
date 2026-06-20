import { describe, expect, it } from "vitest";
import { antiHallucinationGuidance, realTrackCandidateGuidance } from "@/lib/ai/guidance";
import {
  candidateConstraintGuidance,
  instructionConstraintGuidance
} from "@/lib/playlist/constraints/promptGuidance";
import { promptGuidanceForPlaylistOperation } from "@/lib/playlist/operations";

describe("LLM domain guidance", () => {
  it("centralizes anti-hallucination rules", () => {
    expect(antiHallucinationGuidance.knownRealTracks).toContain("Never invent artists");
    expect(antiHallucinationGuidance.noVerificationClaims).toContain("Never claim verification");
    expect(realTrackCandidateGuidance.join("\n")).toContain("Do not literalize invented vibe phrases");
  });

  it("keeps constraint interpretation guidance near the constraint domain", () => {
    const guidance = instructionConstraintGuidance.join("\n");

    expect(guidance).toContain("verifiedRules.maxTracksPerArtist = 1");
    expect(guidance).toContain("curatorGuidance.requiredGenreAdditions");
    expect(guidance).toContain("curatorGuidance.vocalProfile");
    expect(guidance).toContain("scopeIntent.requestScopedGuidanceFields");
    expect(candidateConstraintGuidance.join("\n")).toContain("backend code will enforce");
    expect(guidance).toContain("curator guidance");
  });

  it("keeps operation boundary guidance in the playlist domain", () => {
    expect(promptGuidanceForPlaylistOperation("reorder").join("\n")).toContain("still present and need a removal action");
    expect(promptGuidanceForPlaylistOperation("remove").join("\n")).toContain("removeTrackIds must contain only track ids");
  });
});
