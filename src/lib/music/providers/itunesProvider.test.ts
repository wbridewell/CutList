import { afterEach, describe, expect, it, vi } from "vitest";
import { ItunesProvider } from "@/lib/music/providers/itunesProvider";

function mockJsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init
  });
}

describe("ItunesProvider", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("maps search results into normalized metadata and filters incomplete rows", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(mockJsonResponse({
      resultCount: 2,
      results: [
        {
          trackId: 123,
          trackName: "Pink Moon",
          artistName: "Nick Drake",
          collectionName: "Pink Moon",
          trackTimeMillis: 121000,
          trackViewUrl: "https://music.apple.com/us/song/pink-moon/123",
          artworkUrl100: "https://example.com/100x100bb.jpg",
          trackExplicitness: "notExplicit",
          releaseDate: "1972-02-25T12:00:00Z",
          primaryGenreName: "Singer/Songwriter"
        },
        {
          trackId: 456,
          artistName: "Missing Title"
        }
      ]
    }));

    const results = await new ItunesProvider().searchTrack({ title: "Pink Moon", artist: "Nick Drake" });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://itunes.apple.com/search?term=Nick+Drake+Pink+Moon&entity=song&limit=5&country=US",
      expect.objectContaining({ headers: { accept: "application/json" } })
    );
    expect(results).toEqual([{
      source: "itunes",
      sourceId: "123",
      title: "Pink Moon",
      artist: "Nick Drake",
      album: "Pink Moon",
      durationMs: 121000,
      sourceUrl: "https://music.apple.com/us/song/pink-moon/123",
      artworkUrl: "https://example.com/600x600bb.jpg",
      explicit: false,
      releaseDate: "1972-02-25T12:00:00Z",
      primaryGenreName: "Singer/Songwriter"
    }]);
  });

  it("looks up a track by provider id", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(mockJsonResponse({
      resultCount: 1,
      results: [{
        trackId: 987,
        trackName: "Cellophane",
        artistName: "FKA twigs",
        trackExplicitness: "explicit"
      }]
    }));

    await expect(new ItunesProvider().lookupTrack("987")).resolves.toMatchObject({
      source: "itunes",
      sourceId: "987",
      title: "Cellophane",
      artist: "FKA twigs",
      explicit: true
    });
  });

  it("throws metadata provider errors for non-ok responses", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(mockJsonResponse({ error: "rate limit" }, { status: 429 }));

    await expect(new ItunesProvider().searchTrack({ title: "Nude", artist: "Radiohead" }))
      .rejects.toMatchObject({ provider: "itunes", status: 429 });
  });
});
