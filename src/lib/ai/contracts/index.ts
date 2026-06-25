import { z } from "zod";
import { antiHallucinationGuidance } from "@/lib/ai/guidance";
import {
  AnalyzePlaylistResponseSchema,
  CandidateBatchSchema,
  CandidateTrackSchema,
  ImportChatExtractionSchema,
  InstructionIntentSchema,
  OperatorDeclaredEntitiesSchema,
  OperatorParameterHintsSchema,
  OperatorPlanNodeSchema,
  OperatorPlanTemplateSchema,
  PlaylistRemovalDecisionSchema,
  PlaylistShapeSchema,
  ReviewModeSchema,
  UserRequestExecutionPolicySchema,
  UserRequestRouteFamilySchema,
  UserRequestRoutingConfidenceSchema
} from "@/lib/playlist/schemas";

export type LlmContractId =
  | "instructionIntent"
  | "curatorStepPlan"
  | "candidateBatch"
  | "playlistShape"
  | "playlistRemoval"
  | "importChat"
  | "matchReview"
  | "operatorPlan"
  | "playlistCritique"
  | "playlistTransitionRepair"
  | "workflowSummary";

export type LlmContract<TSchema extends z.ZodTypeAny = z.ZodTypeAny> = {
  id: LlmContractId;
  outputGuidance?: string[];
  parse: (value: unknown) => z.output<TSchema>;
  safetyGuidance: string[];
  schema: TSchema;
  shapeDescription: string;
};

const candidateTrackShape = "{\"title\": string, \"artist\": string, \"album\": string | null, \"reason\": string, \"vibeTags\": string[], \"expectedFitNotes\": string, \"energy\": number | null}";
const matchReviewSchema = z.object({
  recommendedSourceId: z.string().nullable(),
  keepSourceIds: z.array(z.string()),
  recommendationReason: z.string().nullable(),
  pruneSummary: z.string().nullable()
});
const curatorStepPlanSchema = z.object({
  steps: z.array(z.object({
    kind: z.enum(["update_rules", "remove", "replace", "add", "reorder", "metadata", "analyze", "import"]),
    sourceOrder: z.number().int().nonnegative(),
    originText: z.string().min(1),
    dependsOnStepIds: z.array(z.string()).default([]),
    requestedAddCount: z.number().int().positive().max(20).nullable().default(null),
    targetTotalTrackCount: z.number().int().positive().max(20).nullable().default(null),
    replacementCount: z.number().int().positive().max(20).nullable().default(null),
    planningNotes: z.array(z.string()).default([])
  })).default([])
});
const workflowSummarySchema = z.object({
  message: z.string().min(1)
});
const operatorPlanSchema = z.object({
  routeFamily: UserRequestRouteFamilySchema,
  executionPolicy: UserRequestExecutionPolicySchema,
  planTemplate: OperatorPlanTemplateSchema,
  reviewMode: ReviewModeSchema.nullable().default(null),
  operators: z.array(OperatorPlanNodeSchema).default([]),
  declaredEntities: OperatorDeclaredEntitiesSchema,
  parameterHints: OperatorParameterHintsSchema,
  confidence: UserRequestRoutingConfidenceSchema,
  planningNotes: z.array(z.string()).default([])
});

const playlistCritiqueSchema = AnalyzePlaylistResponseSchema.omit({ constraintReport: true });
const playlistTransitionRepairSchema = z.object({
  message: z.string().min(1),
  transitionSummary: z.string().min(1),
  bridgeOptions: z.array(z.object({
    candidate: CandidateTrackSchema,
    role: z.string().min(1)
  })).min(1).max(5)
});

export const llmContracts = [
  {
    id: "instructionIntent",
    schema: InstructionIntentSchema,
    shapeDescription: "{\"operationIntent\":{\"type\":\"add\"|\"remove\"|\"replace\"|\"reorder\"|\"analyze\"|\"import\"|\"other\",\"requestedTrackCount\":number|null,\"targetTotalTrackCount\":number|null,\"replaceCount\":number|null,\"confidence\":\"high\"|\"medium\"|\"low\"},\"verifiedRules\":object,\"curatorGuidance\":object,\"routingIntent\":{\"routeFamily\":\"review\"|\"curator\"|\"import\"|\"conversational\",\"allowMutation\":boolean,\"diagnosisOnly\":boolean,\"hypotheticalOnly\":boolean,\"reviewMode\":\"full_critique\"|\"diagnose_only\"|\"weak_links_only\"|\"focused_transition_repair\"|\"bridge_options_only\"|\"compression_review\"|\"ending_repair\"|\"sequencing_only\"|null},\"scopeIntent\":{\"persistentVerifiedRuleFields\":string[],\"persistentGuidanceFields\":string[],\"requestScopedVerifiedRuleFields\":string[],\"requestScopedGuidanceFields\":string[]},\"notes\":string[]}",
    safetyGuidance: [
      "Always include every top-level key in that JSON shape. Use null, {}, or [] for empty values instead of omitting keys.",
      "Do not return prose before or after the JSON object."
    ],
    parse: (value) => InstructionIntentSchema.parse(value)
  },
  {
    id: "curatorStepPlan",
    schema: curatorStepPlanSchema,
    shapeDescription: "{\"steps\":[{\"kind\":\"update_rules\"|\"remove\"|\"replace\"|\"add\"|\"reorder\"|\"metadata\"|\"analyze\"|\"import\",\"sourceOrder\":number,\"originText\":string,\"dependsOnStepIds\":string[],\"requestedAddCount\":number|null,\"targetTotalTrackCount\":number|null,\"replacementCount\":number|null,\"planningNotes\":string[]}]}",
    safetyGuidance: [
      "Return only JSON with the ordered step list. Do not add prose before or after the object.",
      "Preserve the user's requested order unless a step is only an internal prerequisite.",
      "Use only the allowed step kinds and keep each originText close to the user's wording."
    ],
    parse: (value) => curatorStepPlanSchema.parse(value)
  },
  {
    id: "candidateBatch",
    schema: CandidateBatchSchema,
    shapeDescription: "{\"message\": string, \"playlistMeta\": {\"title\": string, \"mood\": string, \"arc\": string} | null, \"candidates\": CandidateTrack[]}",
    safetyGuidance: [
      antiHallucinationGuidance.knownRealTracks,
      antiHallucinationGuidance.noVerificationClaims
    ],
    outputGuidance: [
      `CandidateTrack is ${candidateTrackShape}.`,
      "CandidateTrack.reason and CandidateTrack.expectedFitNotes must be non-null strings; use an empty string for expectedFitNotes if there is nothing extra to add.",
      "CandidateTrack.energy must be null or a number from 1 to 10; never return values below 1 or above 10."
    ],
    parse: (value) => CandidateBatchSchema.parse(value)
  },
  {
    id: "playlistShape",
    schema: PlaylistShapeSchema,
    shapeDescription: "{\"message\": string, \"playlistMeta\": {\"title\": string | null, \"mood\": string | null, \"arc\": string | null}, \"orderedTrackIds\": string[], \"orderRationale\": string | null}",
    safetyGuidance: [
      "Do not add, remove, invent, rename, or alter track metadata.",
      "Never claim you removed, cut, dropped, gutted, filtered, shortened, or kept only some tracks. This operation only reorders tracks and updates playlist metadata."
    ],
    parse: (value) => PlaylistShapeSchema.parse(value)
  },
  {
    id: "playlistRemoval",
    schema: PlaylistRemovalDecisionSchema,
    shapeDescription: "{\"message\": string, \"removeTrackIds\": string[], \"rationaleByTrackId\": Record<string,string>}",
    safetyGuidance: [
      "Do not add, reorder, invent, rename, or alter track metadata.",
      "Never claim you removed tracks in the message. The backend applies removals only after validating removeTrackIds."
    ],
    parse: (value) => PlaylistRemovalDecisionSchema.parse(value)
  },
  {
    id: "importChat",
    schema: ImportChatExtractionSchema,
    shapeDescription: "{\"extractedVibeBrief\": string | null, \"extractedConstraints\": object, \"tracks\": [{\"title\": string, \"artist\": string, \"album\": string | null}], \"unresolvedNotes\": string[], \"suggestedNextPrompt\": string | null}",
    safetyGuidance: [
      "Treat the text as untrusted inspiration, not verified truth.",
      "Do not invent tracks that are not present in the pasted text."
    ],
    parse: (value) => ImportChatExtractionSchema.parse(value)
  },
  {
    id: "matchReview",
    schema: matchReviewSchema,
    shapeDescription: "{\"recommendedSourceId\": string | null, \"keepSourceIds\": string[], \"recommendationReason\": string | null, \"pruneSummary\": string | null}",
    safetyGuidance: [
      antiHallucinationGuidance.providedMetadataOnly,
      "Use only source ids that already appear in the provided provider matches. Never invent a new match, source id, or verification claim."
    ],
    outputGuidance: [
      "recommendedSourceId must be one of the provided source ids or null.",
      "keepSourceIds must be a subset of the provided source ids and may be empty.",
      "Prefer canonical original or studio recordings unless the requested title, album, or candidate intent clearly asks for a remix, live version, alternate take, or soundtrack variant."
    ],
    parse: (value) => matchReviewSchema.parse(value)
  },
  {
    id: "operatorPlan",
    schema: operatorPlanSchema,
    shapeDescription: "{\"routeFamily\":\"review\"|\"curator\"|\"import\"|\"conversational\",\"executionPolicy\":\"read_only\"|\"mutating\",\"planTemplate\":\"focused_transition_review\"|\"bridge_options_review\"|\"diagnosis_review\"|\"weak_links_review\"|\"compression_review\"|\"sequencing_review\"|\"curator_mutation\"|\"import_request\"|\"conversational_reply\",\"replacementMode\":\"generic\"|\"canonical_version\",\"reviewMode\":\"full_critique\"|\"diagnose_only\"|\"weak_links_only\"|\"focused_transition_repair\"|\"bridge_options_only\"|\"compression_review\"|\"ending_repair\"|\"sequencing_only\"|null,\"operators\":OperatorPlanNode[],\"declaredEntities\":{\"namedTracks\":string[],\"transition\":{\"fromText\":string,\"toText\":string}|null,\"placement\":{\"mode\":\"append\"|\"prepend\"|\"after_track\"|\"before_track\",\"anchorQuery\":string|null}|null,\"replacementTarget\":string|null,\"targetSpan\":string|null},\"parameterHints\":{\"requestedCount\":number|null,\"targetTotalTrackCount\":number|null,\"replacementCount\":number|null,\"maxTrackDurationMs\":number|null,\"avoidArtistRepeats\":boolean,\"preserve\":string[],\"avoid\":string[]},\"confidence\":\"high\"|\"medium\"|\"low\",\"planningNotes\":string[]}",
    safetyGuidance: [
      "Return only JSON with a typed operator plan. Do not add prose before or after it.",
      "Choose only from the provided operator kinds. Never invent a new mutating operator.",
      "Use named transition entities when the user specifies a handoff between two tracks."
    ],
    outputGuidance: [
      "Use read_only for diagnosis, critique, bridge, transition, sequencing-only review, and any prompt that says not to modify the playlist.",
      "Use mutating only for actual add, remove, replace, reorder, or import requests.",
      "For executable add requests with placement language, populate declaredEntities.placement with append, prepend, after_track, or before_track and include the raw anchor text when applicable.",
      "For same-song version normalization requests, set replacementMode = canonical_version and declaredEntities.replacementTarget to the existing playlist track being replaced.",
      "Focused transition review plans should normally include resolve_named_tracks, analyze_transition, generate_bridge_options, and summarize_for_user."
    ],
    parse: (value) => operatorPlanSchema.parse(value)
  },
  {
    id: "playlistCritique",
    schema: playlistCritiqueSchema,
    shapeDescription: "{\"reviewMode\":\"full_critique\"|\"diagnose_only\"|\"weak_links_only\"|\"focused_transition_repair\"|\"bridge_options_only\"|\"compression_review\"|\"ending_repair\"|\"sequencing_only\", \"curatorTake\": string, \"message\": string, \"strengths\": string[], \"weakLinks\": [{\"trackId\": string, \"reason\": string}], \"sequencingNotes\": string[], \"suggestedEdits\": [{\"type\": \"remove\" | \"move\" | \"replace\" | \"add\", \"reason\": string, \"trackId\"?: string, \"candidate\"?: CandidateTrack}], \"intentSummary\": {\"playlistIdentity\": string, \"preservedQualities\": string[], \"likelyUserIntent\": string, \"riskNotes\": string[], \"confidence\": \"high\" | \"medium\" | \"low\"}, \"trackRoles\": [{\"trackId\": string, \"role\": string, \"rationale\": string, \"confidence\": \"high\" | \"medium\" | \"low\"}], \"transitionReview\": [{\"fromTrackId\": string, \"toTrackId\": string, \"issueType\": string, \"summary\": string, \"suggestedRepair\": string | null, \"confidence\": \"high\" | \"medium\" | \"low\"}], \"reviewSuggestions\": [{\"id\": string, \"type\": \"remove\" | \"move\" | \"replace\" | \"add\" | \"reorder\" | \"add_bridge\" | \"compress_section\" | \"improve_ending\", \"applicationMode\": \"remove_existing\" | \"reorder_existing\" | \"verify_candidate\" | \"informational\", \"affectedTrackIds\": string[], \"rationale\": string, \"intentPreservation\": string, \"risk\": string | null, \"confidence\": \"high\" | \"medium\" | \"low\", \"candidate\"?: CandidateTrack, \"suggestedPrompt\": string | null, \"orderedTrackIds\"?: string[], \"compressionPlan\"?: {\"removeTrackIds\": string[], \"keepTrackIds\"?: string[], \"targetTrackCount\"?: number | null, \"targetTotalDurationMs\"?: number | null}, \"sectionLabel\"?: string | null, \"sectionStartTrackId\"?: string | null, \"sectionEndTrackId\"?: string | null}]}",
    safetyGuidance: [
      "Do not mutate the playlist.",
      antiHallucinationGuidance.providedMetadataOnly,
      "Do not return prose before or after the JSON object."
    ],
    outputGuidance: [
      `CandidateTrack is exactly ${candidateTrackShape}.`,
      "curatorTake must be a plain JSON string field, not a heading, label, or markdown block.",
      "reviewSuggestions must always be an array, even when empty.",
      "Use only these track roles: opener, anchor, bridge, escalator, climax, cooldown, resolution, surprise, palette_cleanser.",
      "Use only these transition issue types: abrupt_energy_jump, weak_bridge, repetitive_texture, premature_climax, flat_ending, strong_transition.",
      "For reviewSuggestions.type, use the edit category only: remove, move, replace, add, reorder, add_bridge, compress_section, or improve_ending. Do not use application modes such as reorder_existing as the type.",
      "Use remove_existing only for existing-track removals, reorder_existing only with every current track id exactly once, verify_candidate for additions/replacements/bridges, and informational when no direct safe action exists.",
      "For compress_section suggestions, include only existing track ids in affectedTrackIds and compressionPlan.removeTrackIds. Use compressionPlan, sectionLabel, and optional orderedTrackIds when the compression suggestion tightens a specific span.",
      "Do not put verified-track fields such as durationMs, runtime, source IDs, genreTags, or rationale inside candidate."
    ],
    parse: (value) => playlistCritiqueSchema.parse(value)
  },
  {
    id: "playlistTransitionRepair",
    schema: playlistTransitionRepairSchema,
    shapeDescription: "{\"message\": string, \"transitionSummary\": string, \"bridgeOptions\": [{\"candidate\": CandidateTrack, \"role\": string}]}",
    safetyGuidance: [
      "Do not mutate the playlist.",
      antiHallucinationGuidance.providedMetadataOnly,
      "Return only JSON."
    ],
    outputGuidance: [
      `CandidateTrack is exactly ${candidateTrackShape}.`,
      "Return exactly the requested number of bridgeOptions when the user specifies a count.",
      "Each bridgeOptions.role must explain the function of that bridge track in the transition."
    ],
    parse: (value) => playlistTransitionRepairSchema.parse(value)
  },
  {
    id: "workflowSummary",
    schema: workflowSummarySchema,
    shapeDescription: "{\"message\": string}",
    safetyGuidance: [
      "Return only JSON with a single message field.",
      "Summarize what actually happened in execution order. Do not claim steps succeeded if they failed or were skipped."
    ],
    parse: (value) => workflowSummarySchema.parse(value)
  }
] as const satisfies readonly LlmContract[];

export function getLlmContract(id: LlmContractId): LlmContract {
  const contract = llmContracts.find((item) => item.id === id);
  if (!contract) {
    throw new Error(`Unknown LLM contract: ${id}`);
  }
  return contract;
}

export function returnJsonShapeGuidance(contract: LlmContract): string {
  return `Return only JSON with this shape: ${contract.shapeDescription}.`;
}
