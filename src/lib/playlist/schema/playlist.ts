import { z } from "zod";

export const VerificationSourceSchema = z.enum([
  "itunes",
  "musicbrainz",
  "spotify",
  "apple_music",
  "manual"
]);

export const TrackSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  artist: z.string().min(1),
  album: z.string().nullable(),
  durationMs: z.number().int().nonnegative().nullable(),
  runtime: z.string().nullable(),
  verified: z.boolean(),
  source: VerificationSourceSchema.nullable(),
  sourceId: z.string().nullable(),
  sourceUrl: z.string().url().nullable(),
  isrcs: z.array(z.string()).optional(),
  artworkUrl: z.string().url().nullable(),
  explicit: z.boolean().nullable().optional(),
  releaseDate: z.string().nullable().optional(),
  vibeTags: z.array(z.string()).default([]),
  genreTags: z.array(z.string()).default([]),
  rationale: z.string().nullable(),
  fitNotes: z.string().nullable().optional(),
  energy: z.number().min(1).max(10).nullable(),
  bpm: z.number().positive().nullable().optional(),
  bpmConfidence: z.enum(["high", "medium", "low"]).nullable().optional(),
  vocalProfile: z.enum(["female_vocals", "male_vocals", "mixed_vocals", "instrumental", "unspecified"]).nullable().optional(),
  vocalProfileConfidence: z.enum(["high", "medium", "low"]).nullable().optional(),
  evidenceNotes: z.array(z.string()).default([]).optional(),
  verificationNote: z.string().nullable(),
  verificationConfidence: z.enum(["high", "medium", "manual"]).optional()
});

export const VocalProfileSchema = z.enum(["female_vocals", "male_vocals", "mixed_vocals", "instrumental", "unspecified"]);

export const EnergyTrajectorySchema = z.object({
  direction: z.enum(["gradual_rise", "gradual_fall", "steady", "arc", "unspecified"]).optional(),
  peakTrackNumber: z.number().int().positive().nullable().optional(),
  ending: z.enum(["hopeful", "cathartic", "cooldown", "unresolved", "unspecified"]).optional()
});

export const DiscoveryRadiusSchema = z.enum(["safe", "moderate", "adventurous", "highly_experimental"]);

export const SuppressedCandidateReasonCodeSchema = z.enum(["noCredibleMatch"]);

export const SuppressedCandidateFingerprintSchema = z.object({
  fingerprint: z.string().min(1),
  artist: z.string().min(1),
  title: z.string().min(1),
  reasonCode: SuppressedCandidateReasonCodeSchema,
  createdAt: z.string(),
  sourceRequestId: z.string().min(1).optional()
});

export const PlaylistConstraintsSchema = z.object({
  maxTrackDurationMs: z.number().int().positive().nullable().optional(),
  minTrackDurationMs: z.number().int().nonnegative().nullable().optional(),
  minBpm: z.number().positive().nullable().optional(),
  maxBpm: z.number().positive().nullable().optional(),
  targetBpm: z.number().positive().nullable().optional(),
  targetBpmTolerance: z.number().positive().nullable().optional(),
  targetTotalDurationMs: z.number().int().positive().nullable().optional(),
  totalDurationToleranceMs: z.number().int().nonnegative().nullable().optional(),
  maxTracks: z.number().int().positive().nullable().optional(),
  minTracks: z.number().int().nonnegative().nullable().optional(),
  excludedArtists: z.array(z.string()).optional(),
  requiredArtists: z.array(z.string()).optional(),
  artistLimits: z.array(z.object({
    artist: z.string().min(1),
    maxTotalTracks: z.number().int().nonnegative()
  })).optional(),
  maxTracksPerArtist: z.number().int().positive().nullable().optional(),
  noMoreFromArtists: z.array(z.string()).optional(),
  preferredGenres: z.array(z.string()).optional(),
  requiredGenreAdditions: z.array(z.object({
    genre: z.string().min(1),
    count: z.number().int().positive()
  })).optional(),
  excludedGenres: z.array(z.string()).optional(),
  genreLimits: z.array(z.object({
    genre: z.string().min(1),
    maxTotalTracks: z.number().int().nonnegative()
  })).optional(),
  noMoreFromGenres: z.array(z.string()).optional(),
  excludedTerms: z.array(z.string()).optional(),
  allowExplicit: z.boolean().nullable().optional(),
  vocalProfile: VocalProfileSchema.nullable().optional(),
  energyTrajectory: EnergyTrajectorySchema.nullable().optional(),
  notes: z.array(z.string()).optional()
}).default({});

export const playlistConstraintFieldNames = [
  "maxTrackDurationMs",
  "minTrackDurationMs",
  "minBpm",
  "maxBpm",
  "targetBpm",
  "targetBpmTolerance",
  "targetTotalDurationMs",
  "totalDurationToleranceMs",
  "maxTracks",
  "minTracks",
  "excludedArtists",
  "requiredArtists",
  "artistLimits",
  "maxTracksPerArtist",
  "noMoreFromArtists",
  "preferredGenres",
  "requiredGenreAdditions",
  "excludedGenres",
  "genreLimits",
  "noMoreFromGenres",
  "excludedTerms",
  "allowExplicit",
  "vocalProfile",
  "energyTrajectory",
  "notes"
] as const satisfies readonly (keyof z.infer<typeof PlaylistConstraintsSchema>)[];

export const verifiedRuleConstraintFields = new Set<keyof z.infer<typeof PlaylistConstraintsSchema>>([
  "maxTrackDurationMs",
  "minTrackDurationMs",
  "minBpm",
  "maxBpm",
  "targetBpm",
  "targetBpmTolerance",
  "targetTotalDurationMs",
  "totalDurationToleranceMs",
  "maxTracks",
  "minTracks",
  "excludedArtists",
  "artistLimits",
  "maxTracksPerArtist",
  "noMoreFromArtists",
  "excludedGenres",
  "genreLimits",
  "noMoreFromGenres",
  "excludedTerms",
  "allowExplicit"
]);

export const curatorGuidanceConstraintFields = new Set<keyof z.infer<typeof PlaylistConstraintsSchema>>([
  "requiredArtists",
  "preferredGenres",
  "requiredGenreAdditions",
  "vocalProfile",
  "energyTrajectory",
  "notes"
]);

export function pickConstraintFields(
  input: unknown,
  allowedFields: Set<keyof z.infer<typeof PlaylistConstraintsSchema>>
): z.infer<typeof PlaylistConstraintsSchema> {
  if (input == null || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }

  const record = input as Record<string, unknown>;
  const picked: Record<string, unknown> = {};
  for (const fieldName of playlistConstraintFieldNames) {
    if (!allowedFields.has(fieldName) || !(fieldName in record)) {
      continue;
    }
    picked[fieldName] = record[fieldName];
  }
  return PlaylistConstraintsSchema.parse(picked);
}

export function constraintFieldKeys(
  constraints: z.infer<typeof PlaylistConstraintsSchema>
): Array<(typeof playlistConstraintFieldNames)[number]> {
  return playlistConstraintFieldNames.filter((fieldName) => constraints[fieldName] != null);
}

export const PlaylistStateSchema = z.object({
  id: z.string().min(1),
  title: z.string().nullable(),
  mood: z.string().nullable(),
  arc: z.string().nullable(),
  tracks: z.array(TrackSchema).max(200),
  constraints: PlaylistConstraintsSchema,
  discoveryRadius: DiscoveryRadiusSchema.default("moderate"),
  suppressedCandidateFingerprints: z.array(SuppressedCandidateFingerprintSchema).optional(),
  conversationSummary: z.string().nullable(),
  updatedAt: z.string()
});
