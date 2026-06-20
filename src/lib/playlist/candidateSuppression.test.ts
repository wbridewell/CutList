import { describe, expect, it } from "vitest";
import {
  explicitlyRequestedSuppressionFingerprints,
  filteredSuppressedCandidates,
  mergeAutoSuppressedRejectedCandidates,
  suppressionFingerprintFromRejectedCandidate
} from "@/lib/playlist/candidateSuppression";

describe("candidate suppression", () => {
  it("creates suppression entries only for no-credible-match rejections", () => {
    expect(suppressionFingerprintFromRejectedCandidate({
      artist: "Ghost Artist",
      title: "Imaginary Song",
      reason: "No credible metadata match was found.",
      rejectionCode: "noCredibleMatch"
    }, { createdAt: "2026-06-14T00:00:00.000Z" })).toMatchObject({
      artist: "Ghost Artist",
      title: "Imaginary Song",
      reasonCode: "noCredibleMatch"
    });

    expect(suppressionFingerprintFromRejectedCandidate({
      artist: "Real Artist",
      title: "Main Title",
      reason: "The best metadata match was ambiguous and needs review.",
      rejectionCode: "ambiguousMatch"
    })).toBeNull();
  });

  it("deduplicates repeated no-credible rejections by normalized fingerprint", () => {
    const merged = mergeAutoSuppressedRejectedCandidates(undefined, [
      {
        artist: "Ghost Artist",
        title: "Imaginary Song",
        reason: "No credible metadata match was found.",
        rejectionCode: "noCredibleMatch"
      },
      {
        artist: "ghost artist",
        title: "Imaginary Song",
        reason: "No credible metadata match was found.",
        rejectionCode: "noCredibleMatch"
      }
    ], { createdAt: "2026-06-14T00:00:00.000Z" });

    expect(merged).toHaveLength(1);
    expect(merged[0]?.fingerprint).toBe("ghost artist::imaginary song");
  });

  it("detects explicit override requests and filters suppressed candidates otherwise", () => {
    const entries = mergeAutoSuppressedRejectedCandidates(undefined, [{
      artist: "Ghost Artist",
      title: "Imaginary Song",
      reason: "No credible metadata match was found.",
      rejectionCode: "noCredibleMatch"
    }], { createdAt: "2026-06-14T00:00:00.000Z" });

    const overrides = explicitlyRequestedSuppressionFingerprints(
      "please add Ghost Artist - Imaginary Song again if you can find it",
      entries
    );
    expect(overrides.size).toBe(1);

    const filtered = filteredSuppressedCandidates([
      { artist: "Ghost Artist", title: "Imaginary Song", album: null, reason: "Fits.", vibeTags: [], expectedFitNotes: "", energy: null },
      { artist: "Real Artist", title: "Findable Song", album: null, reason: "Fits.", vibeTags: [], expectedFitNotes: "", energy: null }
    ], entries);
    expect(filtered.filtered.map((candidate) => candidate.title)).toEqual(["Imaginary Song"]);
    expect(filtered.allowed.map((candidate) => candidate.title)).toEqual(["Findable Song"]);
  });
});
