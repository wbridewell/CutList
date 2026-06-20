import { MetadataProviderError, type MusicMetadataProvider, type TrackSearchQuery, type TrackSearchResult } from "@/lib/music/providers/providerTypes";

type ItunesResult = {
  trackId?: number;
  trackName?: string;
  artistName?: string;
  collectionName?: string;
  trackTimeMillis?: number;
  trackViewUrl?: string;
  artworkUrl100?: string;
  trackExplicitness?: string;
  releaseDate?: string;
  primaryGenreName?: string;
};

type ItunesResponse = {
  resultCount: number;
  results: ItunesResult[];
};

const PROVIDER_TIMEOUT_MS = 8_000;

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
  try {
    return await fetch(url, {
      headers: { accept: "application/json" },
      signal: controller.signal
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new MetadataProviderError("itunes", "iTunes verification timed out", 504);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function mapItunesResult(result: ItunesResult): TrackSearchResult | null {
  if (!result.trackId || !result.trackName || !result.artistName) {
    return null;
  }

  return {
    source: "itunes",
    sourceId: String(result.trackId),
    title: result.trackName,
    artist: result.artistName,
    album: result.collectionName ?? null,
    durationMs: result.trackTimeMillis ?? null,
    sourceUrl: result.trackViewUrl ?? null,
    artworkUrl: result.artworkUrl100?.replace("100x100bb", "600x600bb") ?? null,
    explicit: result.trackExplicitness ? result.trackExplicitness === "explicit" : null,
    releaseDate: result.releaseDate ?? null,
    primaryGenreName: result.primaryGenreName ?? null
  };
}

export class ItunesProvider implements MusicMetadataProvider {
  name = "itunes" as const;

  async searchTrack(query: TrackSearchQuery): Promise<TrackSearchResult[]> {
    const params = new URLSearchParams({
      term: `${query.artist} ${query.title}`,
      entity: "song",
      limit: "5",
      country: "US"
    });
    const response = await fetchWithTimeout(`https://itunes.apple.com/search?${params.toString()}`);

    if (!response.ok) {
      throw new MetadataProviderError("itunes", `iTunes verification failed with ${response.status}`, response.status);
    }

    const body = (await response.json()) as ItunesResponse;
    return body.results.map(mapItunesResult).filter((result): result is TrackSearchResult => result !== null);
  }

  async lookupTrack(sourceId: string): Promise<TrackSearchResult | null> {
    const params = new URLSearchParams({ id: sourceId, entity: "song" });
    const response = await fetchWithTimeout(`https://itunes.apple.com/lookup?${params.toString()}`);

    if (!response.ok) {
      throw new MetadataProviderError("itunes", `iTunes lookup failed with ${response.status}`, response.status);
    }

    const body = (await response.json()) as ItunesResponse;
    return mapItunesResult(body.results[0] ?? {});
  }
}
