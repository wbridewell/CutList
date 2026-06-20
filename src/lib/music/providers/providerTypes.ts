import type { VerificationSource } from "@/types/playlist";

export type TrackSearchQuery = {
  title: string;
  artist: string;
  album?: string | null;
};

export type TrackSearchResult = {
  source: VerificationSource;
  sourceId: string;
  title: string;
  artist: string;
  album: string | null;
  durationMs: number | null;
  sourceUrl: string | null;
  isrcs?: string[];
  artworkUrl: string | null;
  explicit: boolean | null;
  releaseDate: string | null;
  primaryGenreName: string | null;
};

export class MetadataProviderError extends Error {
  provider: VerificationSource;
  status: number | null;

  constructor(provider: VerificationSource, message: string, status: number | null = null) {
    super(message);
    this.name = "MetadataProviderError";
    this.provider = provider;
    this.status = status;
  }
}

export interface MusicMetadataProvider {
  name: VerificationSource;
  searchTrack(query: TrackSearchQuery): Promise<TrackSearchResult[]>;
  lookupTrack(sourceId: string): Promise<TrackSearchResult | null>;
}
