import {
  normalizeInstructionIntentLayers,
  withNormalizedInstructionScope
} from "@/lib/ai/services/instructionIntent";
import {
  parseDeterministicRequest,
  parseReplacementCount,
  parseTargetTotalTrackCount
} from "@/lib/ai/services/deterministicRequestParser";
import type { DiscoveryRadius, InstructionIntent, PlaylistConstraints } from "@/types/playlist";

type ScopedInstructionIntent = InstructionIntent | null;
type ShapeIntentStrength = "none" | "advisory" | "strong";

export type OperationHeuristics = {
  addition: boolean;
  removal: boolean;
  replacement: boolean;
  shapeStrength: ShapeIntentStrength;
  mixedEditAndGeneration: boolean;
};

export type ScopeHeuristics = {
  persistent: boolean;
  requestScoped: boolean;
};

export type CountHeuristics = {
  requestedAddCount: number | null;
  replacementCount: number | null;
  targetTotalTrackCount: number | null;
};

export type SpecialCaseHeuristics = {
  conversationalOnly: boolean;
  versionCleanup: boolean;
  shouldPruneExistingForConstraints: boolean;
};

export type CuratorHeuristicSignals = {
  operation: OperationHeuristics;
  scope: ScopeHeuristics;
  counts: CountHeuristics;
  specialCases: SpecialCaseHeuristics;
  discoveryRadiusOverride: DiscoveryRadius | null;
};

function isAdditiveVocalProfileRequest(userMessage: string): boolean {
  return /\b(?:add|adding|find|give me|recommend|suggest|include|bring in)\b.{0,40}\b(?:female|women|woman|girl|male|men|man|boy|mixed|duet|instrumental)\s+(?:vocals?|vocalists?|singers?|voices?)\b/i.test(userMessage) &&
    !/\b(?:only|all|exclusively|must be|should be)\b/i.test(userMessage);
}

export function collectCuratorHeuristics(
  userMessage: string,
  constraints: PlaylistConstraints = {}
): CuratorHeuristicSignals {
  const parse = parseDeterministicRequest(userMessage, constraints);

  return {
    operation: {
      addition: parse.operationSignals.addition,
      removal: parse.operationSignals.removal,
      replacement: parse.operationSignals.replacement,
      shapeStrength: parse.operationSignals.shapeStrength,
      mixedEditAndGeneration: parse.operationSignals.mixedEditAndGeneration
    },
    scope: {
      persistent: parse.scopeSignals.persistent,
      requestScoped: parse.scopeSignals.requestScoped
    },
    counts: {
      requestedAddCount: parse.countSignals.requestedAddCount,
      replacementCount: parse.countSignals.replacementCount,
      targetTotalTrackCount: parse.countSignals.targetTotalTrackCount
    },
    specialCases: parse.cleanupSignals,
    discoveryRadiusOverride: parse.discoveryRadiusOverride
  };
}

export function scopeAdditiveVocalProfileIntent<TIntent extends ScopedInstructionIntent>(
  intent: TIntent,
  userMessage: string
): TIntent {
  if (!intent || !isAdditiveVocalProfileRequest(userMessage)) {
    return intent;
  }

  const normalized = normalizeInstructionIntentLayers(intent);
  const vocalProfile = normalized.persistentGuidance.vocalProfile ?? normalized.requestScopedGuidance.vocalProfile;
  if (!vocalProfile) {
    return intent;
  }

  const persistentGuidance = { ...normalized.persistentGuidance };
  delete persistentGuidance.vocalProfile;
  return withNormalizedInstructionScope(intent, {
    persistentGuidance,
    requestScopedGuidance: {
      ...normalized.requestScopedGuidance,
      vocalProfile
    }
  }) as TIntent;
}

export function isRemovalIntent(userMessage: string): boolean {
  return collectCuratorHeuristics(userMessage).operation.removal;
}

export function isVersionCleanupIntent(userMessage: string): boolean {
  return collectCuratorHeuristics(userMessage).specialCases.versionCleanup;
}

export function isReplacementIntent(userMessage: string): boolean {
  return collectCuratorHeuristics(userMessage).operation.replacement;
}

export function replacementCountForVersionCleanup(userMessage: string, removedCount: number): number | null {
  if (!/\b(add|replace|replacement|replacements)\b/i.test(userMessage)) {
    return null;
  }
  const explicit = parseDeterministicRequest(userMessage).countSignals.requestedAddCount;
  if (explicit != null) {
    return explicit;
  }
  if (/\b(few|couple|some)\b/i.test(userMessage)) {
    return Math.max(removedCount, 3);
  }
  return removedCount > 0 ? removedCount : null;
}

export { parseReplacementCount, parseTargetTotalTrackCount };

export function isAdditionIntent(userMessage: string): boolean {
  return collectCuratorHeuristics(userMessage).operation.addition;
}

export function hasPersistentScopeLanguage(userMessage: string): boolean {
  return collectCuratorHeuristics(userMessage).scope.persistent;
}

export function hasRequestScopedLanguage(userMessage: string): boolean {
  return collectCuratorHeuristics(userMessage).scope.requestScoped;
}

export function isMixedEditAndGenerationIntent(userMessage: string): boolean {
  return collectCuratorHeuristics(userMessage).operation.mixedEditAndGeneration;
}

export function shouldPruneExistingForConstraints(userMessage: string, constraints: PlaylistConstraints): boolean {
  return collectCuratorHeuristics(userMessage, constraints).specialCases.shouldPruneExistingForConstraints;
}

export function isConversationalOnly(userMessage: string): boolean {
  return collectCuratorHeuristics(userMessage).specialCases.conversationalOnly;
}

export function isPlaylistShapeIntent(userMessage: string): boolean {
  return collectCuratorHeuristics(userMessage).operation.shapeStrength !== "none";
}

export function isStrongPlaylistShapeIntent(userMessage: string): boolean {
  return collectCuratorHeuristics(userMessage).operation.shapeStrength === "strong";
}
