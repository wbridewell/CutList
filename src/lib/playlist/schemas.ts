import { z } from "zod";
import { playlistExportFormatIds } from "@/lib/playlist/io/exportFormats";

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

const verifiedRuleConstraintFields = new Set<keyof z.infer<typeof PlaylistConstraintsSchema>>([
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

const curatorGuidanceConstraintFields = new Set<keyof z.infer<typeof PlaylistConstraintsSchema>>([
  "requiredArtists",
  "preferredGenres",
  "requiredGenreAdditions",
  "vocalProfile",
  "energyTrajectory",
  "notes"
]);

function pickConstraintFields(
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

function constraintFieldKeys(
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

export const InstructionIntentOperationTypeSchema = z.enum(["add", "remove", "replace", "reorder", "analyze", "import", "other"]);
export const InstructionIntentConfidenceSchema = z.enum(["high", "medium", "low"]);
export const InstructionIntentConstraintFieldSchema = z.enum(playlistConstraintFieldNames);

const InstructionIntentOperationSchema = z.object({
  type: InstructionIntentOperationTypeSchema,
  requestedTrackCount: z.number().int().positive().max(20).nullable(),
  targetTotalTrackCount: z.number().int().positive().max(20).nullable().default(null),
  replaceCount: z.number().int().positive().max(20).nullable().default(null),
  confidence: InstructionIntentConfidenceSchema.default("medium")
});

const InstructionIntentScopeSchema = z.object({
  persistentVerifiedRuleFields: z.array(InstructionIntentConstraintFieldSchema).default([]),
  persistentGuidanceFields: z.array(InstructionIntentConstraintFieldSchema).default([]),
  requestScopedVerifiedRuleFields: z.array(InstructionIntentConstraintFieldSchema).default([]),
  requestScopedGuidanceFields: z.array(InstructionIntentConstraintFieldSchema).default([])
});

function normalizeInstructionIntentInput(input: unknown): unknown {
  if (input == null || typeof input !== "object" || Array.isArray(input)) {
    return input;
  }

  const record = input as Record<string, unknown>;
  if ("operationIntent" in record || "verifiedRules" in record || "curatorGuidance" in record || "scopeIntent" in record) {
    const verifiedRules = pickConstraintFields(record.verifiedRules, verifiedRuleConstraintFields);
    const curatorGuidance = pickConstraintFields(record.curatorGuidance, curatorGuidanceConstraintFields);

    return {
      operationIntent: {
        type: record.operationIntent && typeof record.operationIntent === "object" && !Array.isArray(record.operationIntent)
          ? (record.operationIntent as Record<string, unknown>).type
          : "other",
        requestedTrackCount: record.operationIntent && typeof record.operationIntent === "object" && !Array.isArray(record.operationIntent)
          ? (record.operationIntent as Record<string, unknown>).requestedTrackCount ?? null
          : null,
        targetTotalTrackCount: record.operationIntent && typeof record.operationIntent === "object" && !Array.isArray(record.operationIntent)
          ? (record.operationIntent as Record<string, unknown>).targetTotalTrackCount ?? null
          : null,
        replaceCount: record.operationIntent && typeof record.operationIntent === "object" && !Array.isArray(record.operationIntent)
          ? (record.operationIntent as Record<string, unknown>).replaceCount ?? null
          : null,
        confidence: record.operationIntent && typeof record.operationIntent === "object" && !Array.isArray(record.operationIntent)
          ? (record.operationIntent as Record<string, unknown>).confidence ?? "medium"
          : "medium"
      },
      verifiedRules,
      curatorGuidance,
      scopeIntent: record.scopeIntent,
      notes: Array.isArray(record.notes) ? record.notes : []
    };
  }

  const persistentConstraints = PlaylistConstraintsSchema.parse(record.persistentConstraints ?? {});
  const requestScopedConstraints = PlaylistConstraintsSchema.parse(record.requestScopedConstraints ?? {});
  const persistentVerifiedRules = pickConstraintFields(persistentConstraints, verifiedRuleConstraintFields);
  const persistentGuidance = pickConstraintFields(persistentConstraints, curatorGuidanceConstraintFields);
  const requestScopedVerifiedRules = pickConstraintFields(requestScopedConstraints, verifiedRuleConstraintFields);
  const requestScopedGuidance = pickConstraintFields(requestScopedConstraints, curatorGuidanceConstraintFields);

  return {
    operationIntent: {
      type: record.action ?? "other",
      requestedTrackCount: record.requestedTrackCount ?? null,
      targetTotalTrackCount: null,
      replaceCount: null,
      confidence: "medium"
    },
    verifiedRules: {
      ...persistentVerifiedRules,
      ...requestScopedVerifiedRules
    },
    curatorGuidance: {
      ...persistentGuidance,
      ...requestScopedGuidance
    },
    scopeIntent: {
      persistentVerifiedRuleFields: constraintFieldKeys(persistentVerifiedRules),
      persistentGuidanceFields: constraintFieldKeys(persistentGuidance),
      requestScopedVerifiedRuleFields: constraintFieldKeys(requestScopedVerifiedRules),
      requestScopedGuidanceFields: constraintFieldKeys(requestScopedGuidance)
    },
    notes: Array.isArray(record.notes) ? record.notes : []
  };
}

export const InstructionIntentSchema = z.preprocess(normalizeInstructionIntentInput, z.object({
  operationIntent: InstructionIntentOperationSchema,
  verifiedRules: PlaylistConstraintsSchema,
  curatorGuidance: PlaylistConstraintsSchema,
  scopeIntent: InstructionIntentScopeSchema,
  notes: z.array(z.string()).default([])
}));

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

export const ConstraintViolationSchema = z.object({
  type: z.string(),
  message: z.string(),
  trackId: z.string().optional()
});

export const ConstraintEvidenceWarningSchema = z.object({
  type: z.string(),
  message: z.string(),
  trackId: z.string().optional()
});

export const ConstraintFindingSchema = z.object({
  ruleId: z.string(),
  status: z.enum(["failed", "unknown", "guidance"]),
  subject: z.object({
    kind: z.enum(["track", "playlist", "sequence"]),
    trackId: z.string().optional()
  }),
  summary: z.string(),
  detail: z.string().nullable().optional(),
  actionable: z.boolean()
});

export const EvidenceFieldKeySchema = z.enum([
  "title",
  "artist",
  "durationMs",
  "explicit",
  "genreTags",
  "bpm",
  "sourceIdentity"
]);

export const ConstraintCoverageStatusSchema = z.enum(["healthy", "partial", "missing"]);

export const ConstraintCoverageFieldReportSchema = z.object({
  field: EvidenceFieldKeySchema,
  activeRuleIds: z.array(z.string()).default([]),
  status: ConstraintCoverageStatusSchema,
  availableTrackCount: z.number().int().nonnegative(),
  missingTrackCount: z.number().int().nonnegative(),
  totalTrackCount: z.number().int().nonnegative(),
  coverageRatio: z.number().min(0).max(1),
  summary: z.string()
});

export const ConstraintCoverageReportSchema = z.object({
  activeVerifiedRuleIds: z.array(z.string()).default([]),
  fields: z.array(ConstraintCoverageFieldReportSchema).default([]),
  summary: z.array(z.string()).default([])
});

export const ConstraintReportSchema = z.object({
  passed: z.boolean(),
  totalDurationMs: z.number().int().nonnegative(),
  violations: z.array(ConstraintViolationSchema),
  evidenceWarnings: z.array(ConstraintEvidenceWarningSchema).default([]).optional(),
  findings: z.array(ConstraintFindingSchema).default([]).optional(),
  coverage: ConstraintCoverageReportSchema.optional()
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

export const ConversationContextSchema = z.object({
  recentMessages: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().min(1).max(1600)
  })).max(8)
});

export const PlaylistMessageRequestSchema = z.object({
  playlist: PlaylistStateSchema,
  userMessage: z.string().min(1).max(8000),
  conversationContext: ConversationContextSchema.optional()
});

export const VerifyRequestSchema = z.object({
  tracks: z.array(z.object({
    title: z.string().min(1),
    artist: z.string().min(1),
    album: z.string().nullable().optional()
  })).min(1).max(50)
});

export const VerifyResponseSchema = z.object({
  verified: z.array(TrackSchema),
  rejected: z.array(RejectedCandidateSchema)
});

export const ExportRequestSchema = z.object({
  playlist: PlaylistStateSchema,
  format: z.enum(playlistExportFormatIds)
});

export const ExportResponseSchema = z.object({
  filename: z.string(),
  mimeType: z.string(),
  content: z.string()
});

export const ImportChatRequestSchema = z.object({
  text: z.string().min(1).max(30000)
});

export const ImportChatExtractionSchema = z.object({
  extractedVibeBrief: z.string().nullable(),
  extractedConstraints: PlaylistConstraintsSchema,
  tracks: z.array(z.object({
    title: z.string().min(1),
    artist: z.string().min(1),
    album: z.string().nullable().optional()
  })).max(80),
  unresolvedNotes: z.array(z.string()).default([]),
  suggestedNextPrompt: z.string().nullable()
});

export const ImportChatResponseSchema = z.object({
  extractedVibeBrief: z.string().nullable(),
  extractedConstraints: PlaylistConstraintsSchema,
  verifiedTracks: z.array(TrackSchema),
  rejectedCandidates: z.array(RejectedCandidateSchema),
  unresolvedNotes: z.array(z.string()),
  suggestedNextPrompt: z.string().nullable()
});

export const AnalyzePlaylistRequestSchema = z.object({
  playlist: PlaylistStateSchema,
  userQuestion: z.string().max(4000).optional(),
  conversationContext: ConversationContextSchema.optional()
});

export const AnalyzePlaylistResponseSchema = z.object({
  curatorTake: z.string().optional(),
  message: z.string(),
  strengths: z.array(z.string()),
  weakLinks: z.array(z.object({
    trackId: z.string(),
    reason: z.string()
  })),
  sequencingNotes: z.array(z.string()),
  constraintReport: ConstraintReportSchema,
  suggestedEdits: z.array(z.object({
    type: z.enum(["remove", "move", "replace", "add"]),
    reason: z.string(),
    trackId: z.string().optional(),
    candidate: CandidateTrackSchema.optional()
  })),
  intentSummary: IntentSummarySchema.optional(),
  trackRoles: z.array(TrackRoleAssessmentSchema).default([]),
  transitionReview: z.array(TransitionAssessmentSchema).default([]),
  reviewSuggestions: z.array(ReviewSuggestionSchema).default([]),
  debug: z.object({
    modelRawOutput: z.unknown().optional(),
    validationError: z.string().optional()
  }).optional()
});
