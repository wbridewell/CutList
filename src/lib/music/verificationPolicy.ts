import { ItunesProvider } from "@/lib/music/providers/itunesProvider";
import { MusicBrainzProvider } from "@/lib/music/providers/musicBrainzProvider";
import type { MusicMetadataProvider, TrackSearchQuery } from "@/lib/music/providers/providerTypes";

export type MatchConfidence = "high" | "medium" | "low";

export type VerificationRejectionCode =
  | "noCredibleMatch"
  | "ambiguousMatch"
  | "albumMismatch"
  | "providerUnavailable";

export type VerificationRejectionContext = {
  providerErrors?: string[];
};

export type VerificationFallbackStrategy = {
  id: "swappedTitleArtist";
  query: (query: TrackSearchQuery) => TrackSearchQuery;
  verificationNote: string;
};

export type VerificationPolicy = {
  ambiguousScore: number;
  autoAcceptScore: number;
  closeMatchMargin: number;
  confidenceForScore: (score: number) => MatchConfidence;
  fallbackStrategies: VerificationFallbackStrategy[];
  providerFactories: Array<{
    name: MusicMetadataProvider["name"];
    create: () => MusicMetadataProvider;
  }>;
  rejectionMessage: (code: VerificationRejectionCode, context?: VerificationRejectionContext) => string;
};

export const verificationPolicy: VerificationPolicy = {
  autoAcceptScore: 0.85,
  ambiguousScore: 0.65,
  closeMatchMargin: 0.08,
  confidenceForScore(score) {
    if (score >= verificationPolicy.autoAcceptScore) {
      return "high";
    }
    if (score >= verificationPolicy.ambiguousScore) {
      return "medium";
    }
    return "low";
  },
  providerFactories: [
    { name: "itunes", create: () => new ItunesProvider() },
    { name: "musicbrainz", create: () => new MusicBrainzProvider() }
  ],
  fallbackStrategies: [{
    id: "swappedTitleArtist",
    query: (query) => ({
      title: query.artist,
      artist: query.title,
      album: query.album
    }),
    verificationNote: "Verified by provider after swapping the seed title and artist fields."
  }],
  rejectionMessage(code, context = {}) {
    if (code === "ambiguousMatch") {
      return "The best metadata match was ambiguous and needs review.";
    }
    if (code === "albumMismatch") {
      return "The best metadata match did not match the requested album and needs review.";
    }

    const providerErrorText = context.providerErrors?.length
      ? ` Provider errors: ${context.providerErrors.join(", ")}.`
      : "";
    return `No credible metadata match was found.${providerErrorText}`;
  }
};

export function createDefaultMetadataProviders(policy = verificationPolicy): MusicMetadataProvider[] {
  return policy.providerFactories.map((factory) => factory.create());
}

