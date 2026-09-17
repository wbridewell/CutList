import { z } from "zod";
import { PlaylistConstraintsSchema, constraintFieldKeys, curatorGuidanceConstraintFields, pickConstraintFields, playlistConstraintFieldNames, verifiedRuleConstraintFields } from "./playlist";
import { CandidateTrackSchema } from "./curator";
import { ReviewModeSchema } from "./review";

export const InstructionIntentOperationTypeSchema = z.enum(["add", "remove", "replace", "reorder", "analyze", "import", "other"]);

export const InstructionIntentConfidenceSchema = z.enum(["high", "medium", "low"]);

export const UserRequestRouteFamilySchema = z.enum(["review", "curator", "import", "conversational"]);

export const UserRequestExecutionPolicySchema = z.enum(["read_only", "mutating"]);

export const UserRequestRoutingConfidenceSchema = z.enum(["high", "medium", "low"]);

export const UserRequestOperationPlanKindSchema = z.enum([
  "review_only",
  "curator_only",
  "mixed_review_and_curator",
  "import_only",
  "conversational_only"
]);

export const ReplacementModeSchema = z.enum(["generic", "canonical_version"]);

export const UserRequestRoutingNoteSchema = z.enum([
  "explicit_non_modification_directive",
  "review_button_forces_read_only",
  "pasted_tracks_detected",
  "empty_playlist_requires_curator",
  "llm_router_fallback",
  "llm_router_succeeded",
  "lexical_review_request",
  "lexical_curator_request",
  "lexical_mixed_request",
  "lexical_conversational_request"
]);

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

const InstructionIntentRoutingSchema = z.object({
  routeFamily: UserRequestRouteFamilySchema.default("curator"),
  allowMutation: z.boolean().default(true),
  diagnosisOnly: z.boolean().default(false),
  hypotheticalOnly: z.boolean().default(false),
  reviewMode: ReviewModeSchema.nullable().default(null)
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
      routingIntent: record.routingIntent,
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
    routingIntent: {
      routeFamily: "curator",
      allowMutation: true,
      diagnosisOnly: false,
      hypotheticalOnly: false,
      reviewMode: null
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
  routingIntent: InstructionIntentRoutingSchema.default({
    routeFamily: "curator",
    allowMutation: true,
    diagnosisOnly: false,
    hypotheticalOnly: false,
    reviewMode: null
  }),
  scopeIntent: InstructionIntentScopeSchema,
  notes: z.array(z.string()).default([])
}));

export const NormalizedInstructionIntentSchema = z.object({
  operationType: InstructionIntentOperationTypeSchema,
  operationConfidence: InstructionIntentConfidenceSchema,
  requestedAddCount: z.number().int().positive().max(20).nullable(),
  targetTotalTrackCount: z.number().int().positive().max(20).nullable(),
  replacementCount: z.number().int().positive().max(20).nullable(),
  verifiedRules: PlaylistConstraintsSchema,
  curatorGuidance: PlaylistConstraintsSchema,
  persistentVerifiedRules: PlaylistConstraintsSchema,
  persistentGuidance: PlaylistConstraintsSchema,
  requestScopedVerifiedRules: PlaylistConstraintsSchema,
  requestScopedGuidance: PlaylistConstraintsSchema,
  persistentConstraints: PlaylistConstraintsSchema,
  requestScopedConstraints: PlaylistConstraintsSchema,
  activeConstraints: PlaylistConstraintsSchema,
  notes: z.array(z.string()).default([]),
  raw: InstructionIntentSchema.nullable()
});

export const UserRequestDeterministicSignalsSchema = z.object({
  hasReviewSignals: z.boolean(),
  hasCuratorSignals: z.boolean(),
  hasNonModificationDirective: z.boolean(),
  hasPastedTracks: z.boolean(),
  hasMixedIntent: z.boolean(),
  trackCount: z.number().int().nonnegative(),
  addition: z.boolean(),
  removal: z.boolean(),
  replacement: z.boolean(),
  shapeStrength: z.enum(["none", "advisory", "strong"])
});

export const OperatorPlanTemplateSchema = z.enum([
  "focused_transition_review",
  "bridge_options_review",
  "diagnosis_review",
  "weak_links_review",
  "compression_review",
  "sequencing_review",
  "curator_mutation",
  "import_request",
  "conversational_reply"
]);

export const OperatorKindSchema = z.enum([
  "resolve_named_tracks",
  "resolve_playlist_scope",
  "analyze_transition",
  "generate_bridge_options",
  "diagnose_identity",
  "identify_weak_links",
  "compress_review",
  "remove_tracks",
  "replace_tracks",
  "resequence_tracks",
  "import_tracks",
  "summarize_for_user",
  "conversational_reply"
]);

export const OperatorDeclaredTransitionSchema = z.object({
  fromText: z.string().min(1),
  toText: z.string().min(1)
});

export const TrackPlacementModeSchema = z.enum([
  "append",
  "prepend",
  "after_track",
  "before_track"
]);

export const DeclaredTrackPlacementSchema = z.object({
  mode: TrackPlacementModeSchema,
  anchorQuery: z.string().nullable().default(null)
});

export const OperatorDeclaredEntitiesSchema = z.object({
  namedTracks: z.array(z.string().min(1)).default([]),
  transition: OperatorDeclaredTransitionSchema.nullable().default(null),
  placement: DeclaredTrackPlacementSchema.nullable().default(null),
  replacementTarget: z.string().nullable().default(null),
  targetSpan: z.string().nullable().default(null)
});

export const OperatorParameterHintsSchema = z.object({
  requestedCount: z.number().int().positive().max(20).nullable().default(null),
  targetTotalTrackCount: z.number().int().positive().max(20).nullable().default(null),
  replacementCount: z.number().int().positive().max(20).nullable().default(null),
  maxTrackDurationMs: z.number().int().positive().nullable().default(null),
  avoidArtistRepeats: z.boolean().default(false),
  preserve: z.array(z.string()).default([]),
  avoid: z.array(z.string()).default([])
});

export const OperatorPlanNodeSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("resolve_named_tracks"),
    fromText: z.string().min(1),
    toText: z.string().min(1)
  }),
  z.object({
    kind: z.literal("resolve_playlist_scope")
  }),
  z.object({
    kind: z.literal("analyze_transition")
  }),
  z.object({
    kind: z.literal("generate_bridge_options"),
    requestedCount: z.number().int().positive().max(20).nullable().default(null)
  }),
  z.object({
    kind: z.literal("diagnose_identity")
  }),
  z.object({
    kind: z.literal("identify_weak_links"),
    requestedCount: z.number().int().positive().max(20).nullable().default(null)
  }),
  z.object({
    kind: z.literal("compress_review")
  }),
  z.object({
    kind: z.literal("remove_tracks")
  }),
  z.object({
    kind: z.literal("replace_tracks")
  }),
  z.object({
    kind: z.literal("resequence_tracks")
  }),
  z.object({
    kind: z.literal("import_tracks")
  }),
  z.object({
    kind: z.literal("summarize_for_user")
  }),
  z.object({
    kind: z.literal("conversational_reply")
  })
]);

export const BoundNamedTrackSchema = z.object({
  query: z.string().min(1),
  trackId: z.string().nullable().default(null),
  title: z.string().nullable().default(null),
  artist: z.string().nullable().default(null),
  resolution: z.enum(["exact", "fuzzy", "ambiguous", "unresolved"]).default("unresolved")
});

export const BoundNamedTransitionSchema = z.object({
  fromQuery: z.string().min(1),
  toQuery: z.string().min(1),
  fromTrackId: z.string().nullable().default(null),
  toTrackId: z.string().nullable().default(null),
  fromLabel: z.string().nullable().default(null),
  toLabel: z.string().nullable().default(null),
  resolution: z.enum(["exact", "fuzzy", "ambiguous", "unresolved"]).default("unresolved")
});

export const BoundTrackPlacementSchema = z.object({
  mode: TrackPlacementModeSchema,
  anchorQuery: z.string().nullable().default(null),
  anchorTrackId: z.string().nullable().default(null),
  anchorLabel: z.string().nullable().default(null),
  resolution: z.enum(["not_needed", "exact", "fuzzy", "ambiguous", "unresolved"]).default("not_needed")
});

export const OperatorBoundEntitiesSchema = z.object({
  namedTracks: z.array(BoundNamedTrackSchema).default([]),
  namedTransition: BoundNamedTransitionSchema.nullable().default(null),
  placement: BoundTrackPlacementSchema.nullable().default(null),
  replacementTarget: BoundNamedTrackSchema.nullable().default(null),
  targetSpan: z.string().nullable().default(null),
  candidateCount: z.number().int().positive().max(20).nullable().default(null),
  maxTrackDurationMs: z.number().int().positive().nullable().default(null),
  avoidArtistRepeats: z.boolean().default(false),
  preserve: z.array(z.string()).default([]),
  avoid: z.array(z.string()).default([])
});

export const ResolvedOperatorPlanSchema = z.object({
  routeFamily: UserRequestRouteFamilySchema,
  executionPolicy: UserRequestExecutionPolicySchema,
  planTemplate: OperatorPlanTemplateSchema,
  replacementMode: ReplacementModeSchema.default("generic"),
  reviewMode: ReviewModeSchema.nullable().default(null),
  operators: z.array(OperatorPlanNodeSchema).default([]),
  normalizedIntent: NormalizedInstructionIntentSchema,
  boundEntities: OperatorBoundEntitiesSchema,
  declaredEntities: OperatorDeclaredEntitiesSchema,
  parameterHints: OperatorParameterHintsSchema,
  deterministicSignals: UserRequestDeterministicSignalsSchema,
  confidence: UserRequestRoutingConfidenceSchema,
  planningNotes: z.array(z.string()).default([]),
  instructionIntentStatus: z.enum(["success", "success_repaired", "disabled", "timeout", "shape_error", "json_extraction_error", "not_attempted"])
});

export const OperatorExecutionReceiptSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("named_transition_resolved"),
    transition: BoundNamedTransitionSchema
  }),
  z.object({
    kind: z.literal("transition_analysis"),
    summary: z.string(),
    fromTrackId: z.string().nullable().default(null),
    toTrackId: z.string().nullable().default(null)
  }),
  z.object({
    kind: z.literal("bridge_options_generated"),
    options: z.array(z.object({
      candidate: CandidateTrackSchema,
      role: z.string().min(1)
    })).default([])
  }),
  z.object({
    kind: z.literal("review_summary"),
    message: z.string()
  }),
  z.object({
    kind: z.literal("clarification_required"),
    message: z.string()
  }),
  z.object({
    kind: z.literal("delegated_curator_execution"),
    operation: z.string(),
    stepKinds: z.array(z.string()).default([])
  }),
  z.object({
    kind: z.literal("import_execution"),
    message: z.string()
  }),
  z.object({
    kind: z.literal("conversational_reply"),
    message: z.string()
  })
]);

export const UserRequestOperationPlanSchema = z.object({
  kind: UserRequestOperationPlanKindSchema,
  reviewPrompt: z.string().nullable().default(null),
  curatorPrompt: z.string().nullable().default(null)
});

export const ResolvedUserRequestPlanSchema = z.object({
  routeFamily: UserRequestRouteFamilySchema,
  executionPolicy: UserRequestExecutionPolicySchema,
  operation: z.enum(["review", "conversational", "import_tracks", "reorder", "remove", "replace", "generate"]),
  reviewMode: ReviewModeSchema.nullable().default(null),
  operationPlan: UserRequestOperationPlanSchema,
  normalizedIntent: NormalizedInstructionIntentSchema,
  deterministicSignals: UserRequestDeterministicSignalsSchema,
  confidence: UserRequestRoutingConfidenceSchema,
  routingNotes: z.array(UserRequestRoutingNoteSchema).default([]),
  instructionIntentStatus: z.enum(["success", "success_repaired", "disabled", "timeout", "shape_error", "json_extraction_error", "not_attempted"]),
  // The full plan this summary was derived from, plus a fingerprint of the inputs it was
  // planned against, so the message command can reuse it instead of planning twice.
  operatorPlan: ResolvedOperatorPlanSchema,
  fingerprint: z.string().min(1).max(64)
});

// A plan the client already obtained from the plan-preview command. handlePlaylistMessage
// reuses it only when the fingerprint still matches the message and playlist it receives.
export const PrecomputedOperatorPlanSchema = z.object({
  operatorPlan: ResolvedOperatorPlanSchema,
  fingerprint: z.string().min(1).max(64)
});
