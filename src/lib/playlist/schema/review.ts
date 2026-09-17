import { z } from "zod";
import { CandidateTrackSchema } from "./curator";

export const ReviewConfidenceSchema = z.enum(["high", "medium", "low"]);

export const ReviewBasisSchema = z.enum(["constraint", "metadata_heuristic", "model_judgment", "mixed"]);

export const PlaylistTrackRoleSchema = z.enum([
  "opener",
  "anchor",
  "bridge",
  "escalator",
  "climax",
  "cooldown",
  "resolution",
  "surprise",
  "palette_cleanser"
]);

export const TransitionIssueTypeSchema = z.enum([
  "abrupt_energy_jump",
  "weak_bridge",
  "repetitive_texture",
  "premature_climax",
  "flat_ending",
  "strong_transition"
]);

export const ReviewSuggestionTypeSchema = z.enum([
  "remove",
  "move",
  "replace",
  "add",
  "reorder",
  "add_bridge",
  "compress_section",
  "improve_ending"
]);

export const ReviewSuggestionApplicationModeSchema = z.enum([
  "remove_existing",
  "reorder_existing",
  "verify_candidate",
  "informational"
]);

function normalizeReviewSuggestionInput(input: unknown): unknown {
  if (input == null || typeof input !== "object" || Array.isArray(input)) {
    return input;
  }

  const record = input as Record<string, unknown>;
  const normalizedTypeByMode: Record<string, z.infer<typeof ReviewSuggestionTypeSchema>> = {
    remove_existing: "remove",
    reorder_existing: "reorder"
  };
  const type = typeof record.type === "string" && record.type in normalizedTypeByMode
    ? normalizedTypeByMode[record.type]
    : record.type;
  return { ...record, type };
}

export const IntentSummarySchema = z.object({
  playlistIdentity: z.string(),
  preservedQualities: z.array(z.string()).default([]),
  likelyUserIntent: z.string(),
  riskNotes: z.array(z.string()).default([]),
  confidence: ReviewConfidenceSchema
});

export const TrackRoleAssessmentSchema = z.object({
  trackId: z.string(),
  role: PlaylistTrackRoleSchema,
  rationale: z.string(),
  confidence: ReviewConfidenceSchema,
  basis: ReviewBasisSchema.optional()
});

export const TransitionAssessmentSchema = z.object({
  fromTrackId: z.string(),
  toTrackId: z.string(),
  issueType: TransitionIssueTypeSchema,
  summary: z.string(),
  suggestedRepair: z.string().nullable().default(null),
  confidence: ReviewConfidenceSchema,
  basis: ReviewBasisSchema.optional()
});

export const ReviewSuggestionSchema = z.preprocess(normalizeReviewSuggestionInput, z.object({
  id: z.string().min(1),
  type: ReviewSuggestionTypeSchema,
  applicationMode: ReviewSuggestionApplicationModeSchema,
  affectedTrackIds: z.array(z.string()).default([]),
  rationale: z.string(),
  intentPreservation: z.string(),
  risk: z.string().nullable().default(null),
  confidence: ReviewConfidenceSchema,
  basis: ReviewBasisSchema.optional(),
  candidate: CandidateTrackSchema.optional(),
  suggestedPrompt: z.string().nullable().default(null),
  orderedTrackIds: z.array(z.string()).optional(),
  compressionPlan: z.object({
    removeTrackIds: z.array(z.string()).default([]),
    keepTrackIds: z.array(z.string()).default([]).optional(),
    targetTrackCount: z.number().int().positive().max(200).nullable().default(null),
    targetTotalDurationMs: z.number().int().positive().nullable().default(null)
  }).optional(),
  sectionLabel: z.string().nullable().optional(),
  sectionStartTrackId: z.string().nullable().optional(),
  sectionEndTrackId: z.string().nullable().optional()
}));

export const ReviewModeSchema = z.enum([
  "full_critique",
  "diagnose_only",
  "weak_links_only",
  "focused_transition_repair",
  "bridge_options_only",
  "compression_review",
  "ending_repair",
  "sequencing_only"
]);
