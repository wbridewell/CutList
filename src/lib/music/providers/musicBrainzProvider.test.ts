import { afterEach, describe, expect, it, vi } from "vitest";
import { MusicBrainzProvider } from "@/lib/music/providers/musicBrainzProvider";

describe("MusicBrainzProvider", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("maps recording search results into normalized metadata", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      recordings: [{
        id: "recording-1",
        title: "Air on the G String",
        length: 302000,
        "artist-credit": [{ name: "Johann Sebastian Bach" }],
        releases: [{ title: "Bach: Orchestral Suites", date: "1998" }],
        tags: [{ name: "baroque", count: 6 }]
      }]
    }), { status: 200, headers: { "content-type": "application/json" } }));
    globalThis.fetch = fetchMock;

    const results = await new MusicBrainzProvider().searchTrack({
      artist: "Johann Sebastian Bach",
      title: "Air on the G String",
      album: "Bach: Orchestral Suites"
    });

    expect(results).toEqual([{
      source: "musicbrainz",
      sourceId: "recording-1",
      title: "Air on the G String",
      artist: "Johann Sebastian Bach",
      album: "Bach: Orchestral Suites",
      durationMs: 302000,
      sourceUrl: "https://musicbrainz.org/recording/recording-1",
      artworkUrl: null,
      explicit: null,
      releaseDate: "1998",
      primaryGenreName: "baroque"
    }]);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("musicbrainz.org/ws/2/recording"), expect.objectContaining({
      headers: expect.objectContaining({ "user-agent": expect.stringContaining("CutList") })
    }));
  });
});
