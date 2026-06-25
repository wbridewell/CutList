import { beforeEach, describe, expect, it, vi } from "vitest";
import { scoreTrackMatch } from "@/lib/music/matchScore";
import { verifyTrack } from "@/lib/music/verifyTrack";
import { ItunesProvider } from "@/lib/music/providers/itunesProvider";
import { MetadataProviderError } from "@/lib/music/providers/providerTypes";
import type { MusicMetadataProvider } from "@/lib/music/providers/providerTypes";
import { verificationPolicy } from "@/lib/music/verificationPolicy";

vi.mock("@/lib/music/llmMatchReview", () => ({
  reviewAttemptedMatchesWithLLM: vi.fn(async () => null)
}));

const { reviewAttemptedMatchesWithLLM } = await import("@/lib/music/llmMatchReview");

const provider: MusicMetadataProvider = {
  name: "itunes",
  async searchTrack() {
    return [{
      source: "itunes",
      sourceId: "123",
      title: "Pink Moon",
      artist: "Nick Drake",
      album: "Pink Moon",
      durationMs: 121000,
      sourceUrl: "https://example.com/pink-moon",
      artworkUrl: null,
      explicit: false,
      releaseDate: "1972-01-01T00:00:00Z",
      primaryGenreName: "Singer/Songwriter"
    }];
  },
  async lookupTrack() {
    return null;
  }
};

describe("track verification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("scores exact artist and title matches high enough to auto-accept", () => {
    const score = scoreTrackMatch(
      { artist: "Nick Drake", title: "Pink Moon" },
      {
        source: "itunes",
        sourceId: "123",
        title: "Pink Moon",
        artist: "Nick Drake",
        album: "Pink Moon",
        durationMs: 121000,
        sourceUrl: null,
        artworkUrl: null,
        explicit: false,
        releaseDate: null,
        primaryGenreName: "Singer/Songwriter"
      }
    );

    expect(score).toBeGreaterThanOrEqual(verificationPolicy.autoAcceptScore);
  });

  it("scores remastered title variants high enough when artist and album match", () => {
    const score = scoreTrackMatch(
      { artist: "The Clash", title: "White Riot", album: "The Clash" },
      {
        source: "itunes",
        sourceId: "clash-1",
        title: "White Riot (2013 Remastered)",
        artist: "The Clash",
        album: "The Clash (2013 Remastered)",
        durationMs: 119000,
        sourceUrl: null,
        artworkUrl: null,
        explicit: false,
        releaseDate: null,
        primaryGenreName: "Punk"
      }
    );

    expect(score).toBeGreaterThanOrEqual(verificationPolicy.autoAcceptScore);
  });

  it("scores leading-article artist variants as high confidence", () => {
    const score = scoreTrackMatch(
      { artist: "Charlie Daniels Band", title: "The Devil Went Down to Georgia" },
      {
        source: "itunes",
        sourceId: "charlie-1",
        title: "The Devil Went Down to Georgia",
        artist: "The Charlie Daniels Band",
        album: "Million Mile Reflections",
        durationMs: 215000,
        sourceUrl: null,
        artworkUrl: null,
        explicit: false,
        releaseDate: null,
        primaryGenreName: "Country"
      }
    );

    expect(score).toBeGreaterThanOrEqual(verificationPolicy.autoAcceptScore);
  });

  it("scores backing-band artist variants as plausible but not high without stronger album evidence", () => {
    const score = scoreTrackMatch(
      { artist: "Ralph Stanley", title: "Man of Constant Sorrow" },
      {
        source: "itunes",
        sourceId: "ralph-1",
        title: "Man of Constant Sorrow",
        artist: "Ralph Stanley & The Clinch Mountain Boys",
        album: "Ralph Stanley & The Clinch Mountain Boys 1971-1973",
        durationMs: 170000,
        sourceUrl: null,
        artworkUrl: null,
        explicit: false,
        releaseDate: null,
        primaryGenreName: "Bluegrass"
      }
    );

    expect(score).toBeGreaterThanOrEqual(0.75);
    expect(score).toBeLessThan(verificationPolicy.autoAcceptScore);
  });

  it("scores backing-band artist variants as high when album evidence also matches", () => {
    const score = scoreTrackMatch(
      { artist: "Ralph Stanley", title: "Man of Constant Sorrow", album: "Man of Constant Sorrow" },
      {
        source: "itunes",
        sourceId: "ralph-2",
        title: "Man of Constant Sorrow",
        artist: "Ralph Stanley & The Clinch Mountain Boys",
        album: "Man of Constant Sorrow",
        durationMs: 170000,
        sourceUrl: null,
        artworkUrl: null,
        explicit: false,
        releaseDate: null,
        primaryGenreName: "Bluegrass"
      }
    );

    expect(score).toBeGreaterThanOrEqual(verificationPolicy.autoAcceptScore);
  });

  it("keeps tribute and karaoke matches below auto-accept confidence", () => {
    const score = scoreTrackMatch(
      { artist: "Nick Drake", title: "Pink Moon", album: "Pink Moon" },
      {
        source: "itunes",
        sourceId: "tribute-1",
        title: "Pink Moon (Karaoke Version)",
        artist: "Nick Drake Tribute",
        album: "Pink Moon Tribute",
        durationMs: 121000,
        sourceUrl: null,
        artworkUrl: null,
        explicit: false,
        releaseDate: null,
        primaryGenreName: "Singer/Songwriter"
      }
    );

    expect(score).toBeLessThan(verificationPolicy.ambiguousScore);
  });

  it("returns verified provider metadata instead of candidate claims", async () => {
    const outcome = await verifyTrack(
      { artist: "Nick Drake", title: "Pink Moon" },
      {
        artist: "Nick Drake",
        title: "Pink Moon",
        album: null,
        reason: "Fits the fragile mood.",
        vibeTags: ["haunted folk"],
        expectedFitNotes: "Short and spectral.",
        energy: 2
      },
      provider
    );

    expect(outcome.status).toBe("verified");
    if (outcome.status === "verified") {
      expect(outcome.track.durationMs).toBe(121000);
      expect(outcome.track.source).toBe("itunes");
      expect(outcome.track.verified).toBe(true);
      expect(outcome.track.fitNotes).toBe("Short and spectral.");
    }
  });

  it("can exclude the exact current recording when verifying a same-song replacement", async () => {
    const dualProvider: MusicMetadataProvider = {
      name: "itunes",
      async searchTrack() {
        return [
          {
            source: "itunes",
            sourceId: "old",
            title: "Blue Monday",
            artist: "New Order",
            album: "iTunes Originals",
            durationMs: 450000,
            sourceUrl: null,
            artworkUrl: null,
            explicit: false,
            releaseDate: null,
            primaryGenreName: "Alternative"
          },
          {
            source: "itunes",
            sourceId: "new",
            title: "Blue Monday",
            artist: "New Order",
            album: "Substance",
            durationMs: 450000,
            sourceUrl: null,
            artworkUrl: null,
            explicit: false,
            releaseDate: null,
            primaryGenreName: "Alternative"
          }
        ];
      },
      async lookupTrack() {
        return null;
      }
    };

    const outcome = await verifyTrack(
      { artist: "New Order", title: "Blue Monday" },
      undefined,
      dualProvider,
      {
        excludeSourceIdentity: {
          source: "itunes",
          sourceId: "old"
        }
      }
    );

    expect(outcome.status).toBe("verified");
    if (outcome.status === "verified") {
      expect(outcome.track.sourceId).toBe("new");
      expect(outcome.track.album).toBe("Substance");
    }
  });

  it("rejects ambiguous or nonexistent matches", async () => {
    const emptyProvider: MusicMetadataProvider = {
      name: "itunes",
      async searchTrack() {
        return [];
      },
      async lookupTrack() {
        return null;
      }
    };
    const outcome = await verifyTrack({ artist: "Fake Artist", title: "Fake Song" }, undefined, emptyProvider);

    expect(outcome.status).toBe("rejected");
  });

  it("falls back to a second metadata provider", async () => {
    const emptyProvider: MusicMetadataProvider = {
      name: "itunes",
      async searchTrack() {
        return [];
      },
      async lookupTrack() {
        return null;
      }
    };
    const fallbackProvider: MusicMetadataProvider = {
      name: "musicbrainz",
      async searchTrack() {
        return [{
          source: "musicbrainz",
          sourceId: "mb-1",
          title: "Carcass",
          artist: "Siouxsie and the Banshees",
          album: "The Scream",
          durationMs: 228000,
          sourceUrl: "https://musicbrainz.org/recording/mb-1",
          artworkUrl: null,
          explicit: null,
          releaseDate: "1978",
          primaryGenreName: "post-punk"
        }];
      },
      async lookupTrack() {
        return null;
      }
    };

    const outcome = await verifyTrack(
      { artist: "Siouxsie and The Banshees", title: "Carcass", album: "The Scream" },
      undefined,
      [emptyProvider, fallbackProvider]
    );

    expect(outcome.status).toBe("verified");
    if (outcome.status === "verified") {
      expect(outcome.track.source).toBe("musicbrainz");
      expect(outcome.track.verificationConfidence).toBe("high");
    }
  });

  it("does not call fallback providers after a high-confidence first match", async () => {
    let fallbackCalls = 0;
    const fallbackProvider: MusicMetadataProvider = {
      name: "musicbrainz",
      async searchTrack() {
        fallbackCalls += 1;
        return [];
      },
      async lookupTrack() {
        return null;
      }
    };

    const outcome = await verifyTrack(
      { artist: "Nick Drake", title: "Pink Moon", album: "Pink Moon" },
      undefined,
      [provider, fallbackProvider]
    );

    expect(outcome.status).toBe("verified");
    expect(fallbackCalls).toBe(0);
  });

  it("continues to fallback providers when a high-confidence match misses the requested album", async () => {
    let fallbackCalls = 0;
    const remixProvider: MusicMetadataProvider = {
      name: "itunes",
      async searchTrack() {
        return [{
          source: "itunes",
          sourceId: "vision-remix",
          title: "Vision Thing (Canadian Club Remix)",
          artist: "The Sisters of Mercy",
          album: "Some Girls Wander by Mistake",
          durationMs: 438000,
          sourceUrl: "https://example.com/vision-remix",
          artworkUrl: null,
          explicit: false,
          releaseDate: null,
          primaryGenreName: "Rock"
        }];
      },
      async lookupTrack() {
        return null;
      }
    };
    const albumProvider: MusicMetadataProvider = {
      name: "musicbrainz",
      async searchTrack() {
        fallbackCalls += 1;
        return [{
          source: "musicbrainz",
          sourceId: "vision-album",
          title: "Vision Thing",
          artist: "The Sisters of Mercy",
          album: "Vision Thing",
          durationMs: 275000,
          sourceUrl: "https://example.com/vision-album",
          artworkUrl: null,
          explicit: false,
          releaseDate: "1990",
          primaryGenreName: "Rock"
        }];
      },
      async lookupTrack() {
        return null;
      }
    };

    const outcome = await verifyTrack(
      { artist: "The Sisters of Mercy", title: "Vision Thing", album: "Vision Thing" },
      undefined,
      [remixProvider, albumProvider]
    );

    expect(fallbackCalls).toBe(1);
    expect(outcome.status).toBe("verified");
    if (outcome.status === "verified") {
      expect(outcome.track.sourceId).toBe("vision-album");
      expect(outcome.track.album).toBe("Vision Thing");
    }
  });

  it("rejects a high-confidence title and artist match when the requested album does not match", async () => {
    const wrongAlbumProvider: MusicMetadataProvider = {
      name: "itunes",
      async searchTrack() {
        return [{
          source: "itunes",
          sourceId: "vision-remix",
          title: "Vision Thing (Canadian Club Remix)",
          artist: "The Sisters of Mercy",
          album: "Some Girls Wander by Mistake",
          durationMs: 438000,
          sourceUrl: "https://example.com/vision-remix",
          artworkUrl: null,
          explicit: false,
          releaseDate: null,
          primaryGenreName: "Rock"
        }];
      },
      async lookupTrack() {
        return null;
      }
    };

    const outcome = await verifyTrack(
      { artist: "The Sisters of Mercy", title: "Vision Thing", album: "Vision Thing" },
      undefined,
      wrongAlbumProvider
    );

    expect(outcome.status).toBe("rejected");
    if (outcome.status === "rejected") {
      expect(outcome.rejected.reason).toContain("requested album");
      expect(outcome.rejected.attemptedMatches?.[0]).toMatchObject({
        sourceId: "vision-remix",
        album: "Some Girls Wander by Mistake"
      });
    }
  });

  it("auto-accepts a high-confidence match when close alternatives are equivalent versions", async () => {
    const charlieProvider: MusicMetadataProvider = {
      name: "itunes",
      async searchTrack() {
        return [
          {
            source: "itunes",
            sourceId: "charlie-1",
            title: "The Devil Went Down to Georgia",
            artist: "The Charlie Daniels Band",
            album: "Million Mile Reflections",
            durationMs: 215000,
            sourceUrl: "https://example.com/charlie-1",
            artworkUrl: null,
            explicit: false,
            releaseDate: null,
            primaryGenreName: "Country"
          },
          {
            source: "itunes",
            sourceId: "charlie-2",
            title: "The Devil Went Down to Georgia",
            artist: "The Charlie Daniels Band",
            album: "A Decade of Hits",
            durationMs: 215000,
            sourceUrl: "https://example.com/charlie-2",
            artworkUrl: null,
            explicit: false,
            releaseDate: null,
            primaryGenreName: "Country"
          }
        ];
      },
      async lookupTrack() {
        return null;
      }
    };

    const outcome = await verifyTrack(
      { artist: "Charlie Daniels Band", title: "The Devil Went Down to Georgia" },
      undefined,
      charlieProvider
    );

    expect(outcome.status).toBe("verified");
  });

  it("keeps high-scoring close distinct alternatives in manual review", async () => {
    const closeAlternativeProvider: MusicMetadataProvider = {
      name: "itunes",
      async searchTrack() {
        return [
          {
            source: "itunes",
            sourceId: "nick-1",
            title: "Pink Moon",
            artist: "Nick Drake",
            album: "Pink Moon",
            durationMs: 121000,
            sourceUrl: "https://example.com/nick",
            artworkUrl: null,
            explicit: false,
            releaseDate: null,
            primaryGenreName: "Singer/Songwriter"
          },
          {
            source: "musicbrainz",
            sourceId: "ensemble-1",
            title: "Pink Moon",
            artist: "Nick Drake Ensemble",
            album: "Pink Moon",
            durationMs: 121000,
            sourceUrl: "https://example.com/ensemble",
            artworkUrl: null,
            explicit: false,
            releaseDate: null,
            primaryGenreName: "Singer/Songwriter"
          }
        ];
      },
      async lookupTrack() {
        return null;
      }
    };

    const outcome = await verifyTrack(
      { artist: "Nick Drake", title: "Pink Moon", album: "Pink Moon" },
      undefined,
      closeAlternativeProvider
    );

    expect(outcome.status).toBe("rejected");
    if (outcome.status === "rejected") {
      expect(outcome.rejected.reason).toContain("ambiguous");
    }
  });

  it("includes scored provider candidates when a match needs review", async () => {
    const ambiguousProvider: MusicMetadataProvider = {
      name: "itunes",
      async searchTrack() {
        return [{
          source: "itunes",
          sourceId: "maybe-1",
          title: "Pink Moon Live",
          artist: "Nick Drake Tribute",
          album: "A Tribute",
          durationMs: 121000,
          sourceUrl: "https://example.com/maybe",
          artworkUrl: null,
          explicit: false,
          releaseDate: null,
          primaryGenreName: "Singer/Songwriter"
        }];
      },
      async lookupTrack() {
        return null;
      }
    };

    const outcome = await verifyTrack({ artist: "Nick Drake", title: "Pink Moon" }, undefined, ambiguousProvider);

    expect(outcome.status).toBe("rejected");
    if (outcome.status === "rejected") {
      expect(outcome.rejected.attemptedMatches?.[0]).toMatchObject({
        sourceId: "maybe-1",
        source: "itunes",
        confidence: expect.any(String),
        score: expect.any(Number)
      });
    }
  });

  it("applies LLM-assisted pruning and recommendation when review data is returned", async () => {
    vi.mocked(reviewAttemptedMatchesWithLLM).mockResolvedValueOnce({
      attemptedMatches: [{
        sourceId: "nick-1",
        title: "Pink Moon",
        artist: "Nick Drake",
        album: "Pink Moon",
        durationMs: 121000,
        runtime: "2:01",
        source: "itunes",
        sourceUrl: "https://example.com/nick",
        isRecommended: true,
        recommendationReason: "Closest clean original release.",
        score: 0.83,
        confidence: "medium"
      }],
      prunedMatchCount: 1,
      reviewSummary: "Filtered out the ensemble false positive.",
      llmReviewed: true
    });

    const closeAlternativeProvider: MusicMetadataProvider = {
      name: "itunes",
      async searchTrack() {
        return [
          {
            source: "itunes",
            sourceId: "nick-1",
            title: "Pink Moon",
            artist: "Nick Drake",
            album: "Pink Moon",
            durationMs: 121000,
            sourceUrl: "https://example.com/nick",
            artworkUrl: null,
            explicit: false,
            releaseDate: null,
            primaryGenreName: "Singer/Songwriter"
          },
          {
            source: "musicbrainz",
            sourceId: "ensemble-1",
            title: "Pink Moon",
            artist: "Nick Drake Ensemble",
            album: "Pink Moon",
            durationMs: 121000,
            sourceUrl: "https://example.com/ensemble",
            artworkUrl: null,
            explicit: false,
            releaseDate: null,
            primaryGenreName: "Singer/Songwriter"
          }
        ];
      },
      async lookupTrack() {
        return null;
      }
    };

    const outcome = await verifyTrack(
      { artist: "Nick Drake", title: "Pink Moon", album: "Pink Moon" },
      undefined,
      closeAlternativeProvider
    );

    expect(outcome.status).toBe("rejected");
    if (outcome.status === "rejected") {
      expect(outcome.rejected.llmReviewed).toBe(true);
      expect(outcome.rejected.prunedMatchCount).toBe(1);
      expect(outcome.rejected.reviewSummary).toContain("false positive");
      expect(outcome.rejected.attemptedMatches).toHaveLength(1);
      expect(outcome.rejected.attemptedMatches?.[0].isRecommended).toBe(true);
    }
  });

  it("recovers seed lines entered as title dash artist", async () => {
    const swappedProvider: MusicMetadataProvider = {
      name: "itunes",
      async searchTrack(query) {
        if (query.artist === "Bon Jovi" && query.title === "You Give Love a Bad Name") {
          return [{
            source: "itunes",
            sourceId: "bon-jovi-1",
            title: "You Give Love a Bad Name",
            artist: "Bon Jovi",
            album: "Slippery When Wet",
            durationMs: 223000,
            sourceUrl: "https://example.com/bon-jovi",
            artworkUrl: null,
            explicit: false,
            releaseDate: "1986-01-01T00:00:00Z",
            primaryGenreName: "Rock"
          }];
        }
        return [];
      },
      async lookupTrack() {
        return null;
      }
    };

    const outcome = await verifyTrack(
      { title: "Bon Jovi", artist: "You Give Love a Bad Name" },
      undefined,
      swappedProvider
    );

    expect(outcome.status).toBe("verified");
    if (outcome.status === "verified") {
      expect(outcome.track.artist).toBe("Bon Jovi");
      expect(outcome.track.title).toBe("You Give Love a Bad Name");
      expect(outcome.track.verificationNote).toContain("swapping");
    }
  });

  it("aggregates attempted matches from swapped-field fallback rejection", async () => {
    const fallbackProvider: MusicMetadataProvider = {
      name: "itunes",
      async searchTrack(query) {
        if (query.artist === "Alpha" && query.title === "Beta") {
          return [{
            source: "itunes",
            sourceId: "first-attempt",
            title: "Beta Live",
            artist: "Alpha Tribute",
            album: null,
            durationMs: 180000,
            sourceUrl: null,
            artworkUrl: null,
            explicit: false,
            releaseDate: null,
            primaryGenreName: null
          }];
        }
        return [{
          source: "itunes",
          sourceId: "swapped-attempt",
          title: "Alpha Live",
          artist: "Beta Tribute",
          album: null,
          durationMs: 180000,
          sourceUrl: null,
          artworkUrl: null,
          explicit: false,
          releaseDate: null,
          primaryGenreName: null
        }];
      },
      async lookupTrack() {
        return null;
      }
    };

    const outcome = await verifyTrack({ artist: "Alpha", title: "Beta" }, undefined, fallbackProvider);

    expect(outcome.status).toBe("rejected");
    if (outcome.status === "rejected") {
      expect(outcome.rejected.attemptedMatches?.map((match) => match.sourceId)).toEqual([
        "first-attempt",
        "swapped-attempt"
      ]);
    }
  });

  it("surfaces iTunes rate limits as metadata provider errors", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response("Too Many Requests", { status: 429 });

    try {
      await expect(new ItunesProvider().searchTrack({ artist: "A", title: "B" }))
        .rejects.toMatchObject({ provider: "itunes", status: 429 });
      await expect(new ItunesProvider().searchTrack({ artist: "A", title: "B" }))
        .rejects.toBeInstanceOf(MetadataProviderError);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
