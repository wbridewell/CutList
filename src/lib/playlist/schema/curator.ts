import { z } from "zod";
import { PlaylistConstraintsSchema, TrackSchema, VerificationSourceSchema } from "./playlist";
import { ConstraintReportSchema } from "./constraintReport";

function normalizeCandidateTrackInput(input: unknown): unknown {
  if (input == null || typeof input !== "object" || Array.isArray(input)) {
    return input;
  }

  const record = input as Record<string, unknown>;
  return {
    ...record,
    reason: record.reason ?? record.rationale,
    energy: record.energy ?? null
  };
}

export const CandidateTrackSchema = z.preprocess(normalizeCandidateTrackInput, z.object({
  title: z.string().min(1),
  artist: z.string().min(1),
  album: z.string().nullable().optional(),
  reason: z.string().min(1),
  vibeTags: z.array(z.string()).default([]),
  expectedFitNotes: z.string().default(""),
  energy: z.number().min(1).max(10).nullable()
}));

export const PlaylistMetaSchema = z.object({
  title: z.string().nullable(),
  mood: z.string().nullable(),
  arc: z.string().nullable()
});

export const CandidateBatchSchema = z.object({
  message: z.string().min(1),
  candidates: z.array(CandidateTrackSchema).max(20),
  playlistMeta: PlaylistMetaSchema.nullable().optional()
});

export const PlaylistShapeSchema = z.object({
  message: z.string().min(1),
  playlistMeta: PlaylistMetaSchema,
  orderedTrackIds: z.array(z.string().min(1)).max(200),
  orderRationale: z.string().nullable()
});

export const PlaylistRemovalDecisionSchema = z.object({
  message: z.string().min(1),
  removeTrackIds: z.array(z.string().min(1)).max(200),
  rationaleByTrackId: z.record(z.string()).default({})
});

export const AttemptedMatchSchema = z.object({
  sourceId: z.string().optional(),
  title: z.string(),
  artist: z.string(),
  album: z.string().nullable().optional(),
  durationMs: z.number().int().nonnegative().nullable(),
  runtime: z.string().nullable(),
  source: VerificationSourceSchema,
  sourceUrl: z.string().url().nullable().optional(),
  isrcs: z.array(z.string()).optional(),
  artworkUrl: z.string().url().nullable().optional(),
  explicit: z.boolean().nullable().optional(),
  releaseDate: z.string().nullable().optional(),
  primaryGenreName: z.string().nullable().optional(),
  score: z.number().min(0).max(1).optional(),
  confidence: z.enum(["high", "medium", "low"]).optional(),
  isRecommended: z.boolean().optional(),
  recommendationReason: z.string().nullable().optional()
});

export const RejectedCandidateSchema = z.object({
  title: z.string(),
  artist: z.string(),
  reason: z.string(),
  violatedConstraint: z.string().nullable().optional(),
  attemptedMatches: z.array(AttemptedMatchSchema).optional(),
  rejectionCode: z.enum(["noCredibleMatch", "ambiguousMatch", "albumMismatch"]).optional(),
  llmReviewed: z.boolean().optional(),
  prunedMatchCount: z.number().int().nonnegative().optional(),
  reviewSummary: z.string().nullable().optional()
});

export const SuggestionBatchSchema = z.object({
  id: z.string(),
  userRequest: z.string(),
  candidates: z.array(CandidateTrackSchema),
  acceptedTracks: z.array(TrackSchema),
  rejectedCandidates: z.array(RejectedCandidateSchema),
  createdAt: z.string(),
  summary: z.string()
});

export const PlaylistUpdateActionSchema = z.enum(["set", "add", "remove", "reorder"]);

export const PlaylistUpdateSchema = z.object({
  action: PlaylistUpdateActionSchema,
  tracks: z.array(TrackSchema),
  orderRationale: z.string().nullable()
});

export const CuratorResponseSchema = z.object({
  message: z.string(),
  playlistUpdate: PlaylistUpdateSchema.nullable(),
  playlistMeta: PlaylistMetaSchema.nullable(),
  updatedConstraints: PlaylistConstraintsSchema.optional(),
  constraintReport: ConstraintReportSchema,
  rejectedCandidates: z.array(RejectedCandidateSchema)
});

export const CuratorProgressEventSchema = z.object({
  stage: z.enum(["parsing", "resolving", "generating", "verifying", "retrying", "complete"]),
  message: z.string(),
  attempt: z.number().int().positive().optional(),
  acceptedCount: z.number().int().nonnegative().optional(),
  rejectedCount: z.number().int().nonnegative().optional()
});

export const CuratorStreamEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("progress"),
    event: CuratorProgressEventSchema
  }),
  z.object({
    type: z.literal("done"),
    response: CuratorResponseSchema
  }),
  z.object({
    type: z.literal("error"),
    error: z.string()
  }),
  z.object({
    type: z.literal("aborted"),
    message: z.string()
  })
]);
