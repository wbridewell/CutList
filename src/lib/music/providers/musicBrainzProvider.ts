import { MetadataProviderError, type MusicMetadataProvider, type TrackSearchQuery, type TrackSearchResult } from "@/lib/music/providers/providerTypes";

type MusicBrainzArtistCredit = {
  name?: string;
  artist?: {
    name?: string;
  };
};

type MusicBrainzRelease = {
  title?: string;
  date?: string;
};

type MusicBrainzRecording = {
  id?: string;
  title?: string;
  length?: number;
  isrcs?: string[];
  "artist-credit"?: MusicBrainzArtistCredit[];
  releases?: MusicBrainzRelease[];
  tags?: Array<{ name?: string; count?: number }>;
};

type MusicBrainzSearchResponse = {
  recordings?: MusicBrainzRecording[];
};

const PROVIDER_TIMEOUT_MS = 8_000;

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
  try {
    return await fetch(url, {
      headers: {
        accept: "application/json",
        "user-agent": "CutList/0.1.0 (local development)"
      },
      signal: controller.signal
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new MetadataProviderError("musicbrainz", "MusicBrainz verification timed out", 504);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function artistName(recording: MusicBrainzRecording): string | null {
  const credits = recording["artist-credit"] ?? [];
  const names = credits
    .map((credit) => credit.name ?? credit.artist?.name ?? null)
    .filter((name): name is string => Boolean(name));
  return names.length > 0 ? names.join("") : null;
}

function mapRecording(recording: MusicBrainzRecording): TrackSearchResult | null {
  if (!recording.id || !recording.title) {
    return null;
  }

  const artist = artistName(recording);
  if (!artist) {
    return null;
  }

  const release = recording.releases?.[0];
  const primaryTag = [...(recording.tags ?? [])].sort((a, b) => (b.count ?? 0) - (a.count ?? 0))[0]?.name ?? null;

  return {
    source: "musicbrainz",
    sourceId: recording.id,
    title: recording.title,
    artist,
    album: release?.title ?? null,
    durationMs: recording.length ?? null,
    sourceUrl: `https://musicbrainz.org/recording/${recording.id}`,
    isrcs: recording.isrcs?.length ? recording.isrcs : undefined,
    artworkUrl: null,
    explicit: null,
    releaseDate: release?.date ?? null,
    primaryGenreName: primaryTag
  };
}

function quoted(value: string): string {
  return `"${value.replace(/"/g, "")}"`;
}

export class MusicBrainzProvider implements MusicMetadataProvider {
  name = "musicbrainz" as const;

  async searchTrack(query: TrackSearchQuery): Promise<TrackSearchResult[]> {
    const search = [`recording:${quoted(query.title)}`];
    if (query.artist.trim()) {
      search.push(`artist:${quoted(query.artist)}`);
    }
    if (query.album) {
      search.push(`release:${quoted(query.album)}`);
    }

    const params = new URLSearchParams({
      query: search.join(" AND "),
      fmt: "json",
      limit: "8"
    });
    const response = await fetchWithTimeout(`https://musicbrainz.org/ws/2/recording?${params.toString()}`);

    if (!response.ok) {
      throw new MetadataProviderError("musicbrainz", `MusicBrainz verification failed with ${response.status}`, response.status);
    }

    const body = (await response.json()) as MusicBrainzSearchResponse;
    return (body.recordings ?? []).map(mapRecording).filter((result): result is TrackSearchResult => result !== null);
  }

  async lookupTrack(sourceId: string): Promise<TrackSearchResult | null> {
    const params = new URLSearchParams({
      inc: "artist-credits+releases+tags+isrcs",
      fmt: "json"
    });
    const response = await fetchWithTimeout(`https://musicbrainz.org/ws/2/recording/${encodeURIComponent(sourceId)}?${params.toString()}`);

    if (!response.ok) {
      throw new MetadataProviderError("musicbrainz", `MusicBrainz lookup failed with ${response.status}`, response.status);
    }

    return mapRecording((await response.json()) as MusicBrainzRecording);
  }
}
