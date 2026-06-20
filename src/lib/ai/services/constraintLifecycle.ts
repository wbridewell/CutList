import {
  applyRequestedCountToGlobalGenreRequirements,
  buildConstraintDomainModel,
  curatorGuidanceConstraintFields,
  mergeConstraintLayers,
  pickCuratorGuidanceConstraints,
  pickVerifiedRuleConstraints,
  reconcileDurationPolarity
} from "@/lib/ai/services/instructionIntent";
import type { ConstraintExecutionState } from "@/lib/ai/services/workflowTypes";
import type { NormalizedInstructionIntent } from "@/lib/ai/services/instructionIntent";
import type { PlaylistConstraints, PlaylistState, Track } from "@/types/playlist";
import { normalizeText } from "@/lib/music/normalize";

function compactConstraints(constraints: PlaylistConstraints): PlaylistConstraints {
  const next: PlaylistConstraints = {};
  for (const [key, value] of Object.entries(constraints) as Array<[keyof PlaylistConstraints, PlaylistConstraints[keyof PlaylistConstraints]]>) {
    if (value == null) {
      continue;
    }
    if (Array.isArray(value) && value.length === 0) {
      continue;
    }
    Object.assign(next, { [key]: value });
  }
  return next;
}

function hasExplicitRequestScopeLanguage(userMessage: string): boolean {
  return /\b(?:for this (?:pass|batch|request|round|one)|this (?:pass|batch|time|request|round) only|only this time|just for now|for now|temporarily|temporary|not permanently|don't keep this|do not keep this)\b/i.test(userMessage);
}

export function persistableConstraintsAfterRequest(
  current: PlaylistConstraints,
  active: PlaylistConstraints,
  requestScoped: PlaylistConstraints = {}
): PlaylistConstraints {
  const next: PlaylistConstraints = {
    ...active,
    requiredGenreAdditions: current.requiredGenreAdditions ?? []
  };

  for (const key of Object.keys(requestScoped) as Array<keyof PlaylistConstraints>) {
    if (key === "requiredGenreAdditions") {
      continue;
    }
    delete next[key];
    if (current[key] !== undefined) {
      Object.assign(next, { [key]: current[key] });
    }
  }

  return next;
}

export function consumeRequiredGenreAdditions(constraints: PlaylistConstraints, accepted: Track[]): PlaylistConstraints {
  if (!constraints.requiredGenreAdditions?.length) {
    return constraints;
  }

  const remaining = constraints.requiredGenreAdditions
    .map((requirement) => {
      const acceptedCount = accepted.filter((track) => {
        const genre = normalizeText(requirement.genre);
        return track.genreTags.some((tag) => normalizeText(tag) === genre || normalizeText(tag).includes(genre));
      }).length;
      return { ...requirement, count: Math.max(0, requirement.count - acceptedCount) };
    })
    .filter((requirement) => requirement.count > 0);

  return { ...constraints, requiredGenreAdditions: remaining };
}

export function buildConstraintExecutionState(input: {
  playlist: PlaylistState;
  deterministicConstraints: PlaylistConstraints;
  deterministicPersistentConstraints?: PlaylistConstraints;
  deterministicRequestScopedConstraints?: PlaylistConstraints;
  normalizedIntent: NormalizedInstructionIntent;
  userMessage: string;
  requestedAddCount: number | null;
}): ConstraintExecutionState {
  const {
    playlist,
    deterministicConstraints,
    deterministicPersistentConstraints: explicitDeterministicPersistentConstraints,
    deterministicRequestScopedConstraints: explicitDeterministicRequestScopedConstraints,
    normalizedIntent,
    userMessage,
    requestedAddCount
  } = input;
  const deterministicPersistentConstraints = explicitDeterministicPersistentConstraints
    ?? (normalizedIntent.raw
      ? { ...deterministicConstraints, requiredGenreAdditions: playlist.constraints.requiredGenreAdditions ?? [] }
      : deterministicConstraints);
  const deterministicRequestScopedConstraints = explicitDeterministicRequestScopedConstraints ?? {};
  const requestScopedVerifiedKeys = new Set(Object.keys(normalizedIntent.requestScopedVerifiedRules) as Array<keyof PlaylistConstraints>);
  const requestScopedGuidanceKeys = new Set(Object.keys(normalizedIntent.requestScopedGuidance) as Array<keyof PlaylistConstraints>);
  const maySubtractDeterministicFields = hasExplicitRequestScopeLanguage(userMessage);
  const scopeAdjustedDeterministicPersistentConstraints = normalizedIntent.raw
    ? Object.fromEntries(
      Object.entries(deterministicPersistentConstraints).filter(([key]) => (
        !maySubtractDeterministicFields ||
        (!requestScopedVerifiedKeys.has(key as keyof PlaylistConstraints) && !requestScopedGuidanceKeys.has(key as keyof PlaylistConstraints))
      ))
    ) as PlaylistConstraints
    : deterministicPersistentConstraints;

  const deterministicVerifiedRules = pickVerifiedRuleConstraints(scopeAdjustedDeterministicPersistentConstraints);
  const deterministicGuidance = pickCuratorGuidanceConstraints(scopeAdjustedDeterministicPersistentConstraints);
  const persistentVerifiedRules = mergeConstraintLayers(deterministicVerifiedRules, normalizedIntent.persistentVerifiedRules);
  const persistentGuidance = mergeConstraintLayers(deterministicGuidance, normalizedIntent.persistentGuidance);
  const requestScopedVerifiedRules = compactConstraints(mergeConstraintLayers(
    pickVerifiedRuleConstraints(deterministicRequestScopedConstraints),
    normalizedIntent.requestScopedVerifiedRules
  ));
  const requestScopedGuidance = compactConstraints(mergeConstraintLayers(
    pickCuratorGuidanceConstraints(deterministicRequestScopedConstraints),
    normalizedIntent.requestScopedGuidance
  ));
  const constraintDomain = buildConstraintDomainModel({
    persistentVerifiedRules,
    persistentGuidance,
    requestScopedVerifiedRules,
    requestScopedGuidance
  });
  const activeConstraints = reconcileDurationPolarity(
    applyRequestedCountToGlobalGenreRequirements(
      constraintDomain.activeConstraints,
      userMessage,
      requestedAddCount
    ),
    deterministicConstraints
  );
  const activeRequestScopedConstraints = compactConstraints(constraintDomain.requestScopedConstraints);

  return {
    deterministicConstraints,
    deterministicPersistentConstraints,
    deterministicRequestScopedConstraints,
    persistentVerifiedRules,
    persistentGuidance,
    requestScopedVerifiedRules,
    requestScopedGuidance,
    effectiveVerifiedRules: constraintDomain.verifiedRules,
    effectiveGuidance: constraintDomain.curatorGuidance,
    activeConstraints,
    persistedConstraintsAfterSuccess: persistableConstraintsAfterRequest(
      playlist.constraints,
      activeConstraints,
      activeRequestScopedConstraints
    )
  };
}

export function activeRequestScopedConstraints(state: ConstraintExecutionState): PlaylistConstraints {
  return mergeConstraintLayers(state.requestScopedVerifiedRules, state.requestScopedGuidance);
}

export function activePersistentConstraints(state: ConstraintExecutionState): PlaylistConstraints {
  return mergeConstraintLayers(state.persistentVerifiedRules, state.persistentGuidance);
}

export function isGuidanceField(field: keyof PlaylistConstraints): boolean {
  return curatorGuidanceConstraintFields.has(field);
}
