import { isLLMDisabledError, isLLMTimeoutError } from "@/lib/ai/errors";
import { isModelShapeError } from "@/lib/ai/modelErrors";
import { getLLMProvider } from "@/lib/ai/llmClient";
import { instructionIntentPrompt } from "@/lib/ai/prompts";
import { attemptLlmContract } from "@/lib/ai/services/llmService";
import { parseRequestedTrackCount as parseRequestedTrackCountFromLexing } from "@/lib/playlist/requestLexing";
import { mergeConstraintLayersWithRegistry } from "@/lib/playlist/constraints/registry";
import { playlistConstraintFieldNames } from "@/lib/playlist/schemas";
import type { CuratorRunOptions } from "@/lib/ai/curatorTypes";
import type { InstructionIntent, PlaylistConstraints, PlaylistState } from "@/types/playlist";

export const verifiedRuleConstraintFields = new Set<keyof PlaylistConstraints>([
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

export const curatorGuidanceConstraintFields = new Set<keyof PlaylistConstraints>([
  "requiredArtists",
  "preferredGenres",
  "requiredGenreAdditions",
  "vocalProfile",
  "energyTrajectory",
  "notes"
]);

type InstructionConstraintField = (typeof playlistConstraintFieldNames)[number];

export type ConstraintDomainModel = {
  verifiedRules: PlaylistConstraints;
  curatorGuidance: PlaylistConstraints;
  persistentVerifiedRules: PlaylistConstraints;
  persistentGuidance: PlaylistConstraints;
  requestScopedVerifiedRules: PlaylistConstraints;
  requestScopedGuidance: PlaylistConstraints;
  persistentConstraints: PlaylistConstraints;
  requestScopedConstraints: PlaylistConstraints;
  activeConstraints: PlaylistConstraints;
};

export type NormalizedInstructionIntent = ConstraintDomainModel & {
  operationType: InstructionIntent["operationIntent"]["type"];
  operationConfidence: InstructionIntent["operationIntent"]["confidence"];
  requestedAddCount: number | null;
  targetTotalTrackCount: number | null;
  replacementCount: number | null;
  notes: string[];
  raw: InstructionIntent | null;
};

export type InstructionIntentParseStatus =
  | "success"
  | "success_repaired"
  | "disabled"
  | "timeout"
  | "shape_error"
  | "json_extraction_error";

export type InstructionIntentParseResult = {
  intent: InstructionIntent | null;
  status: InstructionIntentParseStatus;
};

export function parseRequestedTrackCount(userMessage: string): number | null {
  return parseRequestedTrackCountFromLexing(userMessage);
}

export function reconcileDurationPolarity(
  constraints: PlaylistConstraints,
  deterministicConstraints: PlaylistConstraints
): PlaylistConstraints {
  if (
    deterministicConstraints.minTrackDurationMs != null &&
    deterministicConstraints.maxTrackDurationMs == null &&
    constraints.maxTrackDurationMs === deterministicConstraints.minTrackDurationMs
  ) {
    const { maxTrackDurationMs, ...rest } = constraints;
    return rest;
  }

  if (
    deterministicConstraints.maxTrackDurationMs != null &&
    deterministicConstraints.minTrackDurationMs == null &&
    constraints.minTrackDurationMs === deterministicConstraints.maxTrackDurationMs
  ) {
    const { minTrackDurationMs, ...rest } = constraints;
    return rest;
  }

  return constraints;
}

export function mergeConstraintLayers(...layers: Array<PlaylistConstraints | undefined>): PlaylistConstraints {
  return mergeConstraintLayersWithRegistry(...layers);
}

export function pickConstraintFields(
  constraints: PlaylistConstraints | undefined,
  allowedFields: Set<keyof PlaylistConstraints>,
  scopedFields?: InstructionConstraintField[]
): PlaylistConstraints {
  if (!constraints) {
    return {};
  }

  const allowedScopedFields = scopedFields ? new Set(scopedFields) : null;
  const result: PlaylistConstraints = {};
  for (const fieldName of playlistConstraintFieldNames) {
    if (!allowedFields.has(fieldName)) {
      continue;
    }
    if (allowedScopedFields && !allowedScopedFields.has(fieldName)) {
      continue;
    }
    const value = constraints[fieldName];
    if (value != null) {
      Object.assign(result, { [fieldName]: value });
    }
  }
  return result;
}

export function pickVerifiedRuleConstraints(
  constraints: PlaylistConstraints | undefined,
  scopedFields?: InstructionConstraintField[]
): PlaylistConstraints {
  return pickConstraintFields(constraints, verifiedRuleConstraintFields, scopedFields);
}

export function pickCuratorGuidanceConstraints(
  constraints: PlaylistConstraints | undefined,
  scopedFields?: InstructionConstraintField[]
): PlaylistConstraints {
  return pickConstraintFields(constraints, curatorGuidanceConstraintFields, scopedFields);
}

function uniqueScopeFields(fields: InstructionConstraintField[]): InstructionConstraintField[] {
  return [...new Set(fields)];
}

export function scopeFieldsForConstraints(
  constraints: PlaylistConstraints,
  allowedFields: Set<keyof PlaylistConstraints>
): InstructionConstraintField[] {
  return uniqueScopeFields(
    playlistConstraintFieldNames.filter((fieldName) => allowedFields.has(fieldName) && constraints[fieldName] != null)
  );
}

export function buildConstraintDomainModel(input: {
  persistentVerifiedRules?: PlaylistConstraints;
  persistentGuidance?: PlaylistConstraints;
  requestScopedVerifiedRules?: PlaylistConstraints;
  requestScopedGuidance?: PlaylistConstraints;
}): ConstraintDomainModel {
  const persistentVerifiedRules = input.persistentVerifiedRules ?? {};
  const persistentGuidance = input.persistentGuidance ?? {};
  const requestScopedVerifiedRules = input.requestScopedVerifiedRules ?? {};
  const requestScopedGuidance = input.requestScopedGuidance ?? {};
  const verifiedRules = mergeConstraintLayers(persistentVerifiedRules, requestScopedVerifiedRules);
  const curatorGuidance = mergeConstraintLayers(persistentGuidance, requestScopedGuidance);
  const persistentConstraints = mergeConstraintLayers(persistentVerifiedRules, persistentGuidance);
  const requestScopedConstraints = mergeConstraintLayers(requestScopedVerifiedRules, requestScopedGuidance);

  return {
    verifiedRules,
    curatorGuidance,
    persistentVerifiedRules,
    persistentGuidance,
    requestScopedVerifiedRules,
    requestScopedGuidance,
    persistentConstraints,
    requestScopedConstraints,
    activeConstraints: mergeConstraintLayers(persistentConstraints, requestScopedConstraints)
  };
}

export function normalizeInstructionIntentLayers(intent: InstructionIntent | null): NormalizedInstructionIntent {
  if (!intent) {
    return {
      operationType: "other",
      operationConfidence: "low",
    requestedAddCount: null,
    targetTotalTrackCount: null,
    replacementCount: null,
      ...buildConstraintDomainModel({}),
      notes: [],
    raw: null
  };
  }

  const constraintDomain = buildConstraintDomainModel({
    persistentVerifiedRules: pickConstraintFields(
      intent.verifiedRules,
      verifiedRuleConstraintFields,
      intent.scopeIntent.persistentVerifiedRuleFields
    ),
    requestScopedVerifiedRules: pickConstraintFields(
      intent.verifiedRules,
      verifiedRuleConstraintFields,
      intent.scopeIntent.requestScopedVerifiedRuleFields
    ),
    persistentGuidance: pickConstraintFields(
      intent.curatorGuidance,
      curatorGuidanceConstraintFields,
      intent.scopeIntent.persistentGuidanceFields
    ),
    requestScopedGuidance: pickConstraintFields(
      intent.curatorGuidance,
      curatorGuidanceConstraintFields,
      intent.scopeIntent.requestScopedGuidanceFields
    )
  });

  return {
    operationType: intent.operationIntent.type,
    operationConfidence: intent.operationIntent.confidence,
    requestedAddCount: intent.operationIntent.requestedTrackCount,
    targetTotalTrackCount: intent.operationIntent.targetTotalTrackCount,
    replacementCount: intent.operationIntent.replaceCount,
    ...constraintDomain,
    notes: intent.notes,
    raw: intent
  };
}

export async function parseInstructionIntentDetailed(
  playlist: PlaylistState,
  userMessage: string,
  options: CuratorRunOptions = {}
): Promise<InstructionIntentParseResult> {
  if (getLLMProvider() === "none") {
    return { intent: null, status: "disabled" };
  }

  options.onProgress?.({
    stage: "resolving",
    message: "Checking intent with the curator model."
  });

  const attempt = await attemptLlmContract<InstructionIntent>(
    "instructionIntent",
    instructionIntentPrompt(playlist, userMessage, { conversationContext: options.conversationContext }),
    { signal: options.signal }
  );
  if (attempt.status === "fallback") {
    if (
      attempt.reason === "disabled" ||
      attempt.reason === "timeout" ||
      attempt.reason === "shape_error" ||
      attempt.reason === "json_extraction_error"
    ) {
      return { intent: null, status: attempt.reason };
    }
    throw attempt.error;
  }
  return { intent: attempt.parsed, status: attempt.status };
}

export async function parseInstructionIntent(
  playlist: PlaylistState,
  userMessage: string,
  options: CuratorRunOptions = {}
): Promise<InstructionIntent | null> {
  const result = await parseInstructionIntentDetailed(playlist, userMessage, options);
  return result.intent;
}

export function withNormalizedInstructionScope(
  intent: InstructionIntent,
  update: Partial<Pick<NormalizedInstructionIntent, "persistentVerifiedRules" | "persistentGuidance" | "requestScopedVerifiedRules" | "requestScopedGuidance">>
): InstructionIntent {
  const normalized = normalizeInstructionIntentLayers(intent);
  const constraintDomain = buildConstraintDomainModel({
    persistentVerifiedRules: update.persistentVerifiedRules ?? normalized.persistentVerifiedRules,
    persistentGuidance: update.persistentGuidance ?? normalized.persistentGuidance,
    requestScopedVerifiedRules: update.requestScopedVerifiedRules ?? normalized.requestScopedVerifiedRules,
    requestScopedGuidance: update.requestScopedGuidance ?? normalized.requestScopedGuidance
  });

  return {
    operationIntent: intent.operationIntent,
    verifiedRules: constraintDomain.verifiedRules,
    curatorGuidance: constraintDomain.curatorGuidance,
    routingIntent: intent.routingIntent,
    scopeIntent: {
      persistentVerifiedRuleFields: scopeFieldsForConstraints(constraintDomain.persistentVerifiedRules, verifiedRuleConstraintFields),
      persistentGuidanceFields: scopeFieldsForConstraints(constraintDomain.persistentGuidance, curatorGuidanceConstraintFields),
      requestScopedVerifiedRuleFields: scopeFieldsForConstraints(constraintDomain.requestScopedVerifiedRules, verifiedRuleConstraintFields),
      requestScopedGuidanceFields: scopeFieldsForConstraints(constraintDomain.requestScopedGuidance, curatorGuidanceConstraintFields)
    },
    notes: intent.notes
  };
}

export function applyRequestedCountToGlobalGenreRequirements(
  constraints: PlaylistConstraints,
  userMessage: string,
  requestedCount: number | null
): PlaylistConstraints {
  if (requestedCount == null || !constraints.requiredGenreAdditions?.length) {
    return constraints;
  }

  const hasGlobalGenreLanguage = /\b(?:songs?|tracks?)\s+(?:should|must|need to|have to)\s+be\b/i.test(userMessage);
  if (!hasGlobalGenreLanguage) {
    return constraints;
  }

  return {
    ...constraints,
    requiredGenreAdditions: constraints.requiredGenreAdditions.map((requirement) => (
      requirement.count === 1 ? { ...requirement, count: requestedCount } : requirement
    ))
  };
}
