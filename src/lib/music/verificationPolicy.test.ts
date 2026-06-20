import { describe, expect, it } from "vitest";
import { createDefaultMetadataProviders, verificationPolicy } from "@/lib/music/verificationPolicy";

describe("verification policy", () => {
  it("centralizes score thresholds and confidence mapping", () => {
    expect(verificationPolicy.autoAcceptScore).toBe(0.85);
    expect(verificationPolicy.ambiguousScore).toBe(0.65);
    expect(verificationPolicy.closeMatchMargin).toBe(0.08);
    expect(verificationPolicy.confidenceForScore(0.9)).toBe("high");
    expect(verificationPolicy.confidenceForScore(0.7)).toBe("medium");
    expect(verificationPolicy.confidenceForScore(0.4)).toBe("low");
  });

  it("defines stable default provider order", () => {
    expect(verificationPolicy.providerFactories.map((provider) => provider.name)).toEqual(["itunes", "musicbrainz"]);
    expect(createDefaultMetadataProviders().map((provider) => provider.name)).toEqual(["itunes", "musicbrainz"]);
  });

  it("derives rejection messages from named codes", () => {
    expect(verificationPolicy.rejectionMessage("ambiguousMatch")).toBe("The best metadata match was ambiguous and needs review.");
    expect(verificationPolicy.rejectionMessage("albumMismatch")).toContain("requested album");
    expect(verificationPolicy.rejectionMessage("noCredibleMatch", { providerErrors: ["itunes 429"] }))
      .toBe("No credible metadata match was found. Provider errors: itunes 429.");
  });

  it("defines swapped title and artist fallback as policy", () => {
    const fallback = verificationPolicy.fallbackStrategies.find((strategy) => strategy.id === "swappedTitleArtist");

    expect(fallback?.query({ title: "Bon Jovi", artist: "You Give Love a Bad Name" })).toEqual({
      title: "You Give Love a Bad Name",
      artist: "Bon Jovi",
      album: undefined
    });
    expect(fallback?.verificationNote).toContain("swapping");
  });
});

