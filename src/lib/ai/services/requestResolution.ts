import {
  collectCuratorHeuristics,
  replacementCountForVersionCleanup,
  scopeAdditiveVocalProfileIntent,
  scopeAdditiveVocalProfileNormalizedIntent
} from "@/lib/ai/services/curatorRequestIntent";
import { buildConstraintExecutionState } from "@/lib/ai/services/constraintLifecycle";
import { parseDeterministicRequest } from "@/lib/ai/services/deterministicRequestParser";
import { normalizeInstructionIntentLayers, parseInstructionIntentDetailed, type NormalizedInstructionIntent } from "@/lib/ai/services/instructionIntent";
import { buildCuratorStepPlan } from "@/lib/ai/services/stepPlanner";
import type { CuratorRunOptions } from "@/lib/ai/curatorTypes";
import type { ResolvedCuratorRequestPlan, PreGenerationRemovalPlan } from "@/lib/ai/services/workflowTypes";
import { evaluatePlaylistConstraints } from "@/lib/playlist/constraints";
import { parseTrackRowsFromText } from "@/lib/playlist/io/textImport";
import { removeAlternateTrackVersions } from "@/lib/playlist/analysis/versionCleanup";
import { explicitlyRequestedSuppressionFingerprints } from "@/lib/playlist/candidateSuppression";
import { normalizeText } from "@/lib/music/normalize";
import { parseReplacementIntent } from "@/lib/playlist/requestLexing";
import { bindDeclaredTrackPlacement, detectDeclaredTrackPlacement } from "@/lib/playlist/requestPlacement";
import type { PlaylistConstraints, PlaylistState, ResolvedOperatorPlan, Track } from "@/types/playlist";
import type { ConstraintExecutionState } from "@/lib/ai/services/workflowTypes";

function parseExplicitRequestedArtists(userMessage: string): string[] {
  const artists = new Set<string>();
  for (const match of userMessage.matchAll(/(?:add|adding|find|give me|recommend|suggest|include|bring in)\s+(?:me\s+)?(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|a|an|some|few|couple)?\s*(?:more\s+)?(?:songs?|tracks?)?\s*(?:by|from)\s+([A-Z0-9][\w '&.-]{1,60})/gi)) {
    artists.add(match[1].trim());
  }
  for (const match of userMessage.matchAll(/(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|some|few|couple)\s+(?:songs?|tracks?)\s+by\s+([A-Z0-9][\w '&.-]{1,60})/gi)) {
    artists.add(match[1].trim());
  }
  return [...artists];
}

function sanitizeConflictingArtistQuotaIntent(
  normalizedIntent: NormalizedInstructionIntent,
  playlist: PlaylistState,
  userMessage: string,
  requestedAddCount: number | null,
  matchedRules: string[]
): NormalizedInstructionIntent {
  const explicitRequestedArtists = parseExplicitRequestedArtists(userMessage);
  if (explicitRequestedArtists.length === 0 || requestedAddCount == null || requestedAddCount < 2) {
    return normalizedIntent;
  }
  if (playlist.constraints.maxTracksPerArtist != null) {
    return normalizedIntent;
  }
  if (matchedRules.some((rule) => rule.endsWith(":maxTracksPerArtist") || rule.endsWith(":artistLimits"))) {
    return normalizedIntent;
  }

  const normalizedArtists = new Set(explicitRequestedArtists.map((artist) => artist.trim().toLowerCase()));
  const sanitizeArtistLimits = (artistLimits: PlaylistConstraints["artistLimits"] | undefined) => (
    artistLimits?.filter((limit) => (
      limit.maxTotalTracks >= requestedAddCount ||
      !normalizedArtists.has(limit.artist.trim().toLowerCase()) ||
      (playlist.constraints.artistLimits ?? []).some((existing) => (
        existing.artist.trim().toLowerCase() === limit.artist.trim().toLowerCase()
      ))
    ))
  );

  return {
    ...normalizedIntent,
    persistentVerifiedRules: {
      ...normalizedIntent.persistentVerifiedRules,
      maxTracksPerArtist: normalizedIntent.persistentVerifiedRules.maxTracksPerArtist === 1 ? undefined : normalizedIntent.persistentVerifiedRules.maxTracksPerArtist,
      artistLimits: sanitizeArtistLimits(normalizedIntent.persistentVerifiedRules.artistLimits)
    },
    requestScopedVerifiedRules: {
      ...normalizedIntent.requestScopedVerifiedRules,
      maxTracksPerArtist: normalizedIntent.requestScopedVerifiedRules.maxTracksPerArtist === 1 ? undefined : normalizedIntent.requestScopedVerifiedRules.maxTracksPerArtist,
      artistLimits: sanitizeArtistLimits(normalizedIntent.requestScopedVerifiedRules.artistLimits)
    }
  };
}

function sanitizeNormalizedIntentWithDeterministicPlan(
  normalizedIntent: NormalizedInstructionIntent,
  userMessage: string,
  reorderClauseTexts: string[],
  matchedRules: string[]
): NormalizedInstructionIntent {
  const normalizedReorderClauses = reorderClauseTexts.map((text) => text.trim().toLowerCase());
  const filterNotes = (notes: string[] | undefined): string[] | undefined => {
    if (!notes?.length) {
      return notes;
    }
    const filtered = notes.filter((note) => !normalizedReorderClauses.includes(note.trim().toLowerCase()));
    return filtered.length > 0 ? filtered : undefined;
  };

  const hasDeterministicEnergyTrajectory = matchedRules.some((rule) => rule.endsWith(":energyTrajectory"));
  const hasExplicitEnergyTrajectoryLanguage = /\b(?:gradually|steadily)\s+(?:increase|decrease|rise|fall|build|climb|wind down)\b/i.test(userMessage) ||
    /\bpeak(?:s|ing)?\s+(?:before|by|around|at)\s+track\b/i.test(userMessage) ||
    /\b(?:hopeful|optimistic|cathartic|cooldown|soft landing)\s+ending\b/i.test(userMessage);
  const shouldDropEnergyTrajectory = reorderClauseTexts.length > 0 && !hasDeterministicEnergyTrajectory && !hasExplicitEnergyTrajectoryLanguage;

  const sanitizeGuidance = (guidance: PlaylistConstraints): PlaylistConstraints => {
    const next = { ...guidance };
    next.notes = filterNotes(guidance.notes);
    if (shouldDropEnergyTrajectory) {
      delete next.energyTrajectory;
    }
    return next;
  };

  return {
    ...normalizedIntent,
    persistentGuidance: sanitizeGuidance(normalizedIntent.persistentGuidance),
    requestScopedGuidance: sanitizeGuidance(normalizedIntent.requestScopedGuidance)
  };
}

function sanitizeConstraintStateWithDeterministicPlan(
  constraintState: ConstraintExecutionState,
  reorderClauseTexts: string[]
): ConstraintExecutionState {
  if (reorderClauseTexts.length === 0) {
    return constraintState;
  }

  const normalizedReorderClauses = new Set(reorderClauseTexts.map((text) => normalizeText(text)));
  const stripReorderNotes = (constraints: PlaylistConstraints): PlaylistConstraints => {
    if (!(constraints.notes?.length)) {
      return constraints;
    }
    const notes = constraints.notes.filter((note) => !normalizedReorderClauses.has(normalizeText(note)));
    return notes.length === constraints.notes.length
      ? constraints
      : { ...constraints, notes: notes.length > 0 ? notes : undefined };
  };

  return {
    ...constraintState,
    persistentGuidance: stripReorderNotes(constraintState.persistentGuidance),
    requestScopedGuidance: stripReorderNotes(constraintState.requestScopedGuidance),
    effectiveGuidance: stripReorderNotes(constraintState.effectiveGuidance),
    activeConstraints: stripReorderNotes(constraintState.activeConstraints),
    persistedConstraintsAfterSuccess: stripReorderNotes(constraintState.persistedConstraintsAfterSuccess)
  };
}

function tracksRemovedByConstraints(playlist: PlaylistState, constraints: PlaylistConstraints): Track[] {
  const report = evaluatePlaylistConstraints(playlist.tracks, constraints);
  const removedIds = new Set(report.violations
    .map((violation) => violation.trackId)
    .filter((trackId): trackId is string => trackId != null));

  return playlist.tracks.filter((track) => removedIds.has(track.id));
}

export function buildPreGenerationRemovalPlan(
  playlist: PlaylistState,
  userMessage: string,
  activeConstraints: PlaylistConstraints
): PreGenerationRemovalPlan {
  const heuristics = collectCuratorHeuristics(userMessage, activeConstraints);
  const versionCleanup = heuristics.specialCases.versionCleanup
    ? removeAlternateTrackVersions(playlist.tracks)
    : null;
  const versionBaseTracks = versionCleanup?.keptTracks ?? playlist.tracks;
  const constraintRemovedTracks = heuristics.specialCases.shouldPruneExistingForConstraints
    ? tracksRemovedByConstraints({ ...playlist, tracks: versionBaseTracks }, activeConstraints)
    : [];
  const baseTracks = constraintRemovedTracks.length > 0
    ? versionBaseTracks.filter((track) => !constraintRemovedTracks.some((removed) => removed.id === track.id))
    : versionBaseTracks;
  const removedTracks = [
    ...(versionCleanup?.removedTracks ?? []),
    ...constraintRemovedTracks.filter((track) => !(versionCleanup?.removedTracks ?? []).some((removed) => removed.id === track.id))
  ];

  return {
    baseTracks,
    constraintRemovedTracks,
    removedTracks,
    versionCleanup
  };
}

export async function resolveCuratorRequestPlan(
  playlist: PlaylistState,
  userMessage: string,
  options: CuratorRunOptions & { operatorPlan?: ResolvedOperatorPlan } = {}
): Promise<ResolvedCuratorRequestPlan> {
  const deterministicParse = parseDeterministicRequest(userMessage, playlist.constraints);
  const deterministicConstraints = deterministicParse.deterministicConstraints;
  const reorderClauseTexts = deterministicParse.sequencingSignals.clauses
    .filter((clause) => clause.operations.includes("reorder"))
    .map((clause) => clause.text);
  const parsedTracks = parseTrackRowsFromText(userMessage, { allowHeaderlessCommaRows: false });
  const operatorReplacementMode = options.operatorPlan?.replacementMode ?? "generic";
  const replacementTarget = options.operatorPlan?.boundEntities.replacementTarget ?? null;
  const requestedReplacementAlbum = parseReplacementIntent(userMessage)?.requestedAlbum ?? null;
  const detectedPlacement = options.operatorPlan?.boundEntities.placement
    ?? bindDeclaredTrackPlacement(playlist, detectDeclaredTrackPlacement(userMessage));
  const heuristics = collectCuratorHeuristics(userMessage, deterministicConstraints);
  const suppressionState = {
    entries: playlist.suppressedCandidateFingerprints ?? [],
    overriddenFingerprints: explicitlyRequestedSuppressionFingerprints(userMessage, playlist.suppressedCandidateFingerprints)
  };
  const buildHeuristicResolvedPlan = (
    operation: ResolvedCuratorRequestPlan["operation"],
    effectiveDiscoveryRadius: ResolvedCuratorRequestPlan["effectiveDiscoveryRadius"],
    step: ResolvedCuratorRequestPlan["steps"][number],
    debugNote: string
  ): ResolvedCuratorRequestPlan => {
    const normalizedIntent = normalizeInstructionIntentLayers(null);
    const constraintState = sanitizeConstraintStateWithDeterministicPlan(buildConstraintExecutionState({
      playlist,
      deterministicConstraints,
      deterministicPersistentConstraints: deterministicParse.deterministicPersistentConstraints,
      deterministicRequestScopedConstraints: deterministicParse.deterministicRequestScopedConstraints,
      normalizedIntent,
      userMessage,
      requestedAddCount: null
    }), reorderClauseTexts);

    return {
      playlist,
      userMessage,
      conversationContext: options.conversationContext,
      operation,
      postOperationShape: false,
      normalizedIntent,
      parsedTracks,
      explicitTrackRequests: deterministicParse.explicitTrackRequests,
      requestedAddCount: null,
      targetTotalTrackCount: null,
      replacementCount: null,
      instructionIntentStatus: "not_attempted",
      effectiveDiscoveryRadius,
      replacementMode: operatorReplacementMode,
      requestedReplacementAlbum,
      constraintState,
      suppressionState,
      preGenerationRemovalPlan: buildPreGenerationRemovalPlan(playlist, userMessage, constraintState.activeConstraints),
      addPlacement: operation === "replace" ? null : detectedPlacement,
      replacementTarget,
      steps: [step],
      debugNotes: [debugNote]
    };
  };

  if (heuristics.specialCases.conversationalOnly) {
    return buildHeuristicResolvedPlan(
      "conversational",
      playlist.discoveryRadius ?? "moderate",
      {
        id: "step-1-conversational",
        kind: "analyze",
        sourceOrder: 0,
        originText: userMessage,
        dependsOnStepIds: [],
        planningNotes: ["Conversational early exit."]
      },
      "Heuristic conversational early exit."
    );
  }

  if (parsedTracks.length > 0) {
    return buildHeuristicResolvedPlan(
      "import_tracks",
      playlist.discoveryRadius ?? "moderate",
      {
        id: "step-1-import",
        kind: "import",
        sourceOrder: 0,
        originText: userMessage,
        dependsOnStepIds: [],
        planningNotes: ["Detected pasted track rows."]
      },
      "Detected pasted track rows."
    );
  }

  const directShapeOperation = playlist.tracks.length >= 2 &&
    heuristics.operation.shapeStrength !== "none" &&
    !heuristics.operation.addition &&
    !heuristics.operation.removal &&
    !heuristics.operation.replacement;
  const directConstraintPruneOperation = heuristics.specialCases.shouldPruneExistingForConstraints &&
    !heuristics.operation.addition &&
    !heuristics.operation.replacement &&
    heuristics.operation.shapeStrength === "none" &&
    tracksRemovedByConstraints(playlist, deterministicConstraints).length > 0;
  const directRemovalOperation = heuristics.operation.removal &&
    !heuristics.operation.addition &&
    !heuristics.operation.replacement &&
    heuristics.operation.shapeStrength === "none";

  if (directShapeOperation || directRemovalOperation || directConstraintPruneOperation) {
    return buildHeuristicResolvedPlan(
      directShapeOperation ? "reorder" : "remove",
      heuristics.discoveryRadiusOverride ?? playlist.discoveryRadius ?? "moderate",
      {
        id: `step-1-${directShapeOperation ? "reorder" : "remove"}`,
        kind: directShapeOperation ? "reorder" : "remove",
        sourceOrder: 0,
        originText: userMessage,
        dependsOnStepIds: [],
        planningNotes: [directShapeOperation ? "Heuristic reorder route." : "Heuristic removal route."]
      },
      directShapeOperation ? "Heuristic reorder route." : "Heuristic removal route."
    );
  }

  const reusedOperatorIntent = options.operatorPlan && options.operatorPlan.instructionIntentStatus !== "not_attempted"
    ? {
      normalizedIntent: options.operatorPlan.normalizedIntent,
      status: options.operatorPlan.instructionIntentStatus
    }
    : null;
  const instructionIntentResult = reusedOperatorIntent
    ? null
    : await parseInstructionIntentDetailed(
      { ...playlist, constraints: deterministicConstraints },
      userMessage,
      options
    );
  const baseNormalizedIntent = sanitizeNormalizedIntentWithDeterministicPlan(
    reusedOperatorIntent
      ? scopeAdditiveVocalProfileNormalizedIntent(reusedOperatorIntent.normalizedIntent, userMessage)
      : normalizeInstructionIntentLayers(scopeAdditiveVocalProfileIntent(instructionIntentResult?.intent ?? null, userMessage)),
    userMessage,
    reorderClauseTexts,
    deterministicParse.matchedRules
  );
  const requestedAddCount = baseNormalizedIntent.requestedAddCount ?? heuristics.counts.requestedAddCount;
  const normalizedIntent = sanitizeConflictingArtistQuotaIntent(
    baseNormalizedIntent,
    playlist,
    userMessage,
    requestedAddCount,
    deterministicParse.matchedRules
  );
  const targetTotalTrackCount = normalizedIntent.targetTotalTrackCount ?? heuristics.counts.targetTotalTrackCount;
  const preliminaryReplacementCount = normalizedIntent.replacementCount ?? heuristics.counts.replacementCount;
  const constraintState = sanitizeConstraintStateWithDeterministicPlan(buildConstraintExecutionState({
    playlist,
    deterministicConstraints,
    deterministicPersistentConstraints: deterministicParse.deterministicPersistentConstraints,
    deterministicRequestScopedConstraints: deterministicParse.deterministicRequestScopedConstraints,
    normalizedIntent,
    userMessage,
    requestedAddCount
  }), reorderClauseTexts);
  const preGenerationRemovalPlan = buildPreGenerationRemovalPlan(playlist, userMessage, constraintState.activeConstraints);
  const replacementCount = preliminaryReplacementCount
    ?? (preGenerationRemovalPlan.versionCleanup
      ? replacementCountForVersionCleanup(userMessage, preGenerationRemovalPlan.versionCleanup.removedTracks.length)
      : null);
  const hasRuleChanges = JSON.stringify(constraintState.activeConstraints) !== JSON.stringify(playlist.constraints);
  const stepPlan = await buildCuratorStepPlan({
    playlist,
    userMessage,
    parsedTracks,
    normalizedIntent,
    heuristics,
    deterministicClauseHints: deterministicParse.sequencingSignals.clauses,
    requestedAddCount,
    targetTotalTrackCount,
    replacementCount,
    hasRuleChanges,
    conversationContext: options.conversationContext
  }, options);
  const operation = stepPlan.primaryOperation;
  const postOperationShape = false;

  return {
    playlist,
    userMessage,
    conversationContext: options.conversationContext,
    operation,
    postOperationShape,
    normalizedIntent,
    parsedTracks,
    explicitTrackRequests: deterministicParse.explicitTrackRequests,
    requestedAddCount,
    targetTotalTrackCount,
    replacementCount,
    instructionIntentStatus: reusedOperatorIntent?.status ?? instructionIntentResult?.status ?? "not_attempted",
    effectiveDiscoveryRadius: heuristics.discoveryRadiusOverride ?? playlist.discoveryRadius ?? "moderate",
    replacementMode: operatorReplacementMode,
    requestedReplacementAlbum,
    constraintState,
    suppressionState,
    preGenerationRemovalPlan,
    addPlacement: operation === "replace" ? null : detectedPlacement,
    replacementTarget,
    steps: stepPlan.steps,
    debugNotes: [
      ...stepPlan.debugNotes,
      `Resolved operation: ${operation}.`,
      postOperationShape ? "Will run a shaping pass after structural edits." : "No post-edit shaping pass requested.",
      normalizedIntent.raw
        ? (reusedOperatorIntent?.status ?? instructionIntentResult?.status) === "success_repaired"
          ? `LLM intent repaired successfully: ${normalizedIntent.operationType}.`
          : `LLM intent: ${normalizedIntent.operationType}.`
        : `No LLM intent available (${reusedOperatorIntent?.status ?? instructionIntentResult?.status ?? "not_attempted"}).`
    ]
  };
}
