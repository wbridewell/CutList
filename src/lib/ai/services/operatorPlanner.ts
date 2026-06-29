import { attemptLlmContract } from "@/lib/ai/services/llmService";
import { operatorPlanPrompt } from "@/lib/ai/prompts";
import { normalizeInstructionIntentLayers, parseInstructionIntentDetailed } from "@/lib/ai/services/instructionIntent";
import { parseDeterministicRequest } from "@/lib/ai/services/deterministicRequestParser";
import { parseTrackRowsFromText } from "@/lib/playlist/io/textImport";
import { bindDeclaredTrackPlacement, detectCanonicalReplacementTargetQuery, detectDeclaredTrackPlacement, resolveNamedTrack } from "@/lib/playlist/requestPlacement";
import {
  extractNamedTransitionPair,
  hasCuratorSignals,
  hasNonModificationDirective,
  hasSequencingReviewCue,
  hasReviewSignals,
  isPlainConversationalMessage,
  parseReplacementIntent,
  parseRequestedTrackCount,
  parseTrackLevelDurationLimitMs
} from "@/lib/playlist/requestLexing";
import { determineReviewModeDeterministically } from "@/lib/ai/services/reviewMode";
import type { CuratorRunOptions } from "@/lib/ai/curatorTypes";
import type {
  OperatorBoundEntities,
  OperatorDeclaredEntities,
  OperatorParameterHints,
  OperatorPlanNode,
  PlaylistState,
  ReplacementMode,
  ResolvedOperatorPlan,
  ReviewMode,
  UserRequestDeterministicSignals
} from "@/types/playlist";

function parseListAfterLabel(userMessage: string, label: "Preserve" | "Avoid"): string[] {
  const match = userMessage.match(new RegExp(`${label}:([\\s\\S]+?)(?:\\n\\s*\\w+:|$)`, "i"));
  if (!match?.[1]) {
    return [];
  }
  return match[1]
    .split(/\n| - /)
    .map((item) => item.replace(/^[\s:-]+/, "").trim())
    .filter(Boolean);
}

function extractNamedTransition(userMessage: string): { fromText: string; toText: string } | null {
  return extractNamedTransitionPair(userMessage);
}

function inferReviewModeFromTemplate(planTemplate: ResolvedOperatorPlan["planTemplate"]): ReviewMode | null {
  switch (planTemplate) {
    case "focused_transition_review":
      return "focused_transition_repair";
    case "bridge_options_review":
      return "bridge_options_only";
    case "diagnosis_review":
      return "diagnose_only";
    case "weak_links_review":
      return "weak_links_only";
    case "compression_review":
      return "compression_review";
    case "sequencing_review":
      return "sequencing_only";
    default:
      return null;
  }
}

function detectReplacementMode(userMessage: string, deterministicSignals: UserRequestDeterministicSignals): ReplacementMode {
  if (!deterministicSignals.replacement) {
    return "generic";
  }
  return parseReplacementIntent(userMessage)?.mode ?? "generic";
}

function defaultOperatorsForTemplate(
  planTemplate: ResolvedOperatorPlan["planTemplate"],
  declaredEntities: OperatorDeclaredEntities,
  parameterHints: OperatorParameterHints
): OperatorPlanNode[] {
  switch (planTemplate) {
    case "focused_transition_review":
      return declaredEntities.transition
        ? [
          { kind: "resolve_named_tracks", ...declaredEntities.transition },
          { kind: "analyze_transition" },
          { kind: "generate_bridge_options", requestedCount: parameterHints.requestedCount },
          { kind: "summarize_for_user" }
        ]
        : [
          { kind: "analyze_transition" },
          { kind: "generate_bridge_options", requestedCount: parameterHints.requestedCount },
          { kind: "summarize_for_user" }
        ];
    case "bridge_options_review":
      return [
        { kind: "analyze_transition" },
        { kind: "generate_bridge_options", requestedCount: parameterHints.requestedCount },
        { kind: "summarize_for_user" }
      ];
    case "diagnosis_review":
      return [
        { kind: "diagnose_identity" },
        { kind: "summarize_for_user" }
      ];
    case "weak_links_review":
      return [
        { kind: "identify_weak_links", requestedCount: parameterHints.requestedCount },
        { kind: "summarize_for_user" }
      ];
    case "compression_review":
      return [
        { kind: "compress_review" },
        { kind: "summarize_for_user" }
      ];
    case "sequencing_review":
      return [
        { kind: "resolve_playlist_scope" },
        { kind: "summarize_for_user" }
      ];
    case "import_request":
      return [
        { kind: "import_tracks" },
        { kind: "summarize_for_user" }
      ];
    case "conversational_reply":
      return [
        { kind: "conversational_reply" }
      ];
    case "curator_mutation":
    default:
      return [
        { kind: "summarize_for_user" }
      ];
  }
}

function buildDeterministicSignals(playlist: PlaylistState, userMessage: string): UserRequestDeterministicSignals {
  const deterministicParse = parseDeterministicRequest(userMessage, playlist.constraints);
  const parsedTracks = parseTrackRowsFromText(userMessage, { allowHeaderlessCommaRows: false });
  return {
    hasReviewSignals: hasReviewSignals(userMessage),
    hasCuratorSignals: hasCuratorSignals(userMessage),
    hasNonModificationDirective: hasNonModificationDirective(userMessage),
    hasPastedTracks: parsedTracks.length > 0,
    hasMixedIntent: hasReviewSignals(userMessage) && hasCuratorSignals(userMessage),
    trackCount: playlist.tracks.length,
    addition: deterministicParse.operationSignals.addition,
    removal: deterministicParse.operationSignals.removal,
    replacement: deterministicParse.operationSignals.replacement,
    shapeStrength: deterministicParse.operationSignals.shapeStrength
  };
}

function fallbackReadOnlyReviewPlan(userMessage: string, parameterHints: OperatorParameterHints): Pick<ResolvedOperatorPlan, "routeFamily" | "executionPolicy" | "planTemplate" | "replacementMode" | "reviewMode" | "operators" | "declaredEntities" | "parameterHints" | "confidence" | "planningNotes"> {
  const transitionMatch = extractNamedTransition(userMessage);
  const reviewMode = determineReviewModeDeterministically(userMessage);
  if (transitionMatch) {
    const declaredEntities = {
      namedTracks: [transitionMatch.fromText, transitionMatch.toText],
      transition: {
        fromText: transitionMatch.fromText,
        toText: transitionMatch.toText
      },
      placement: null,
      replacementTarget: null,
      targetSpan: null
    } satisfies OperatorDeclaredEntities;
    return {
      routeFamily: "review",
      executionPolicy: "read_only",
      planTemplate: "focused_transition_review",
      replacementMode: "generic",
      reviewMode: "focused_transition_repair",
      operators: defaultOperatorsForTemplate("focused_transition_review", declaredEntities, parameterHints),
      declaredEntities,
      parameterHints,
      confidence: "medium",
      planningNotes: ["Read-only override converted a mutating or mixed request into a focused review plan."]
    };
  }

  const reviewTemplate = reviewMode === "weak_links_only"
    ? "weak_links_review"
    : reviewMode === "compression_review"
      ? "compression_review"
      : reviewMode === "sequencing_only"
        ? "sequencing_review"
      : reviewMode === "bridge_options_only"
          ? "bridge_options_review"
          : hasSequencingReviewCue(userMessage)
            ? "sequencing_review"
            : "diagnosis_review";

  return {
    routeFamily: "review",
    executionPolicy: "read_only",
    planTemplate: reviewTemplate,
    replacementMode: "generic",
    reviewMode: reviewTemplate === "weak_links_review"
      ? "weak_links_only"
      : reviewTemplate === "compression_review"
        ? "compression_review"
        : reviewTemplate === "sequencing_review"
          ? "sequencing_only"
          : reviewTemplate === "bridge_options_review"
            ? "bridge_options_only"
            : "diagnose_only",
    operators: defaultOperatorsForTemplate(reviewTemplate, {
      namedTracks: [],
      transition: null,
      placement: null,
      replacementTarget: null,
      targetSpan: null
    }, parameterHints),
    declaredEntities: {
      namedTracks: [],
      transition: null,
      placement: null,
      replacementTarget: null,
      targetSpan: null
    },
    parameterHints,
    confidence: "medium",
    planningNotes: ["Read-only override converted a mutating or mixed request into a scoped review plan."]
  };
}

function deterministicFallbackPlan(
  playlist: PlaylistState,
  userMessage: string,
  deterministicSignals: UserRequestDeterministicSignals,
  parameterHints: OperatorParameterHints,
  forceReadOnly: boolean,
  placement: OperatorDeclaredEntities["placement"]
): Pick<ResolvedOperatorPlan, "routeFamily" | "executionPolicy" | "planTemplate" | "replacementMode" | "reviewMode" | "operators" | "declaredEntities" | "parameterHints" | "confidence" | "planningNotes"> {
  if (deterministicSignals.hasPastedTracks) {
    return {
      routeFamily: "import",
      executionPolicy: "mutating",
      planTemplate: "import_request",
      replacementMode: "generic",
      reviewMode: null,
      operators: defaultOperatorsForTemplate("import_request", { namedTracks: [], transition: null, placement: null, replacementTarget: null, targetSpan: null }, parameterHints),
      declaredEntities: { namedTracks: [], transition: null, placement: null, replacementTarget: null, targetSpan: null },
      parameterHints,
      confidence: "high",
      planningNotes: ["Deterministic import fallback."]
    };
  }
  if (forceReadOnly || deterministicSignals.hasNonModificationDirective) {
    return fallbackReadOnlyReviewPlan(userMessage, parameterHints);
  }
  if (playlist.tracks.length === 0) {
    return {
      routeFamily: "curator",
      executionPolicy: "mutating",
      planTemplate: "curator_mutation",
      replacementMode: "generic",
      reviewMode: null,
      operators: [{ kind: "summarize_for_user" }],
      declaredEntities: { namedTracks: [], transition: null, placement, replacementTarget: null, targetSpan: null },
      parameterHints,
      confidence: "medium",
      planningNotes: ["Empty-playlist fallback routes to curator mutation."]
    };
  }
  if (deterministicSignals.hasReviewSignals) {
    return fallbackReadOnlyReviewPlan(userMessage, parameterHints);
  }
  return {
    routeFamily: "curator",
    executionPolicy: "mutating",
    planTemplate: "curator_mutation",
    replacementMode: "generic",
    reviewMode: null,
    operators: [{ kind: "summarize_for_user" }],
    declaredEntities: { namedTracks: [], transition: null, placement, replacementTarget: null, targetSpan: null },
    parameterHints,
    confidence: "medium",
    planningNotes: ["Deterministic curator fallback."]
  };
}

function shouldOverrideReviewPlanToCurator(
  plan: Pick<ResolvedOperatorPlan, "routeFamily" | "executionPolicy" | "planTemplate" | "reviewMode" | "operators" | "declaredEntities" | "parameterHints" | "confidence" | "planningNotes">,
  deterministicSignals: UserRequestDeterministicSignals,
  explicitReadOnly: boolean
): boolean {
  return !explicitReadOnly &&
    deterministicSignals.hasCuratorSignals &&
    !deterministicSignals.hasReviewSignals &&
    plan.routeFamily === "review";
}

function operatorPlanFromInstructionIntent(
  intent: Awaited<ReturnType<typeof parseInstructionIntentDetailed>>["intent"],
  parameterHints: OperatorParameterHints,
  placement: OperatorDeclaredEntities["placement"],
  replacementMode: ReplacementMode,
  replacementTarget: OperatorDeclaredEntities["replacementTarget"]
): Pick<ResolvedOperatorPlan, "routeFamily" | "executionPolicy" | "planTemplate" | "replacementMode" | "reviewMode" | "operators" | "declaredEntities" | "parameterHints" | "confidence" | "planningNotes"> | null {
  const routingIntent = intent?.routingIntent;
  if (!routingIntent) {
    return null;
  }

  const reviewMode = routingIntent.reviewMode ?? null;
  const planTemplate: ResolvedOperatorPlan["planTemplate"] = routingIntent.routeFamily === "review"
    ? reviewMode === "focused_transition_repair"
      ? "focused_transition_review"
      : reviewMode === "bridge_options_only"
        ? "bridge_options_review"
        : reviewMode === "weak_links_only"
          ? "weak_links_review"
          : reviewMode === "compression_review"
            ? "compression_review"
            : reviewMode === "sequencing_only"
              ? "sequencing_review"
              : "diagnosis_review"
    : routingIntent.routeFamily === "import"
      ? "import_request"
      : routingIntent.routeFamily === "conversational"
        ? "conversational_reply"
        : "curator_mutation";

  return {
    routeFamily: routingIntent.routeFamily,
    executionPolicy: routingIntent.allowMutation ? "mutating" : "read_only",
    planTemplate,
    replacementMode,
    reviewMode,
    operators: defaultOperatorsForTemplate(planTemplate, { namedTracks: [], transition: null, placement, replacementTarget, targetSpan: null }, parameterHints),
    declaredEntities: { namedTracks: [], transition: null, placement, replacementTarget, targetSpan: null },
    parameterHints,
    confidence: intent?.operationIntent.confidence ?? "medium",
    planningNotes: ["Instruction-intent router fallback."]
  };
}

function bindEntities(
  playlist: PlaylistState,
  declaredEntities: OperatorDeclaredEntities,
  parameterHints: OperatorParameterHints
): OperatorBoundEntities {
  const namedTracks = declaredEntities.namedTracks.map((query) => resolveNamedTrack(playlist, query));
  const namedTransition = declaredEntities.transition
    ? (() => {
      const from = resolveNamedTrack(playlist, declaredEntities.transition!.fromText);
      const to = resolveNamedTrack(playlist, declaredEntities.transition!.toText);
      const resolution = from.resolution === "exact" && to.resolution === "exact"
        ? "exact"
        : from.resolution === "ambiguous" || to.resolution === "ambiguous"
          ? "ambiguous"
          : from.resolution === "unresolved" || to.resolution === "unresolved"
            ? "unresolved"
            : "fuzzy";
      return {
        fromQuery: declaredEntities.transition!.fromText,
        toQuery: declaredEntities.transition!.toText,
        fromTrackId: from.trackId,
        toTrackId: to.trackId,
        fromLabel: from.trackId ? `${from.artist} - ${from.title}` : null,
        toLabel: to.trackId ? `${to.artist} - ${to.title}` : null,
        resolution
      } as OperatorBoundEntities["namedTransition"];
    })()
    : null;
  const placement = bindDeclaredTrackPlacement(playlist, declaredEntities.placement);
  const replacementTarget = declaredEntities.replacementTarget
    ? resolveNamedTrack(playlist, declaredEntities.replacementTarget)
    : null;
  return {
    namedTracks,
    namedTransition,
    placement,
    replacementTarget,
    targetSpan: declaredEntities.targetSpan,
    candidateCount: parameterHints.requestedCount,
    maxTrackDurationMs: parameterHints.maxTrackDurationMs,
    avoidArtistRepeats: parameterHints.avoidArtistRepeats,
    preserve: parameterHints.preserve,
    avoid: parameterHints.avoid
  };
}

function validateOperators(
  userMessage: string,
  forceReadOnly: boolean,
  plan: Pick<ResolvedOperatorPlan, "routeFamily" | "executionPolicy" | "planTemplate" | "replacementMode" | "reviewMode" | "operators" | "declaredEntities" | "parameterHints" | "confidence" | "planningNotes">
): Pick<ResolvedOperatorPlan, "routeFamily" | "executionPolicy" | "planTemplate" | "replacementMode" | "reviewMode" | "operators" | "declaredEntities" | "parameterHints" | "confidence" | "planningNotes"> {
  const reviewMode = plan.reviewMode ?? inferReviewModeFromTemplate(plan.planTemplate);
  const operators = plan.operators.length > 0
    ? plan.operators
    : defaultOperatorsForTemplate(plan.planTemplate, plan.declaredEntities, plan.parameterHints);
  const hasMutatingOperator = operators.some((operator) => (
    operator.kind === "remove_tracks" ||
    operator.kind === "replace_tracks" ||
    operator.kind === "resequence_tracks" ||
    operator.kind === "import_tracks"
  ));
  if ((forceReadOnly || plan.executionPolicy === "read_only") && hasMutatingOperator) {
    return fallbackReadOnlyReviewPlan(userMessage, plan.parameterHints);
  }
  if (plan.routeFamily === "review") {
    return {
      ...plan,
      executionPolicy: "read_only",
      reviewMode,
      operators
    };
  }
  return {
    ...plan,
    reviewMode,
    operators
  };
}

export async function resolveOperatorPlan(
  playlist: PlaylistState,
  userMessage: string,
  options: CuratorRunOptions & { forceReadOnly?: boolean } = {}
): Promise<ResolvedOperatorPlan> {
  const deterministicSignals = buildDeterministicSignals(playlist, userMessage);
  const explicitReadOnly = options.forceReadOnly || deterministicSignals.hasNonModificationDirective;
  const replacementMode = detectReplacementMode(userMessage, deterministicSignals);
  const detectedPlacement = replacementMode === "generic" && !deterministicSignals.replacement
    ? detectDeclaredTrackPlacement(userMessage)
    : null;
  const replacementTarget = replacementMode === "canonical_version"
    ? detectCanonicalReplacementTargetQuery(playlist, userMessage)
    : null;
  const parameterHints: OperatorParameterHints = {
    requestedCount: parseRequestedTrackCount(userMessage),
    targetTotalTrackCount: null,
    replacementCount: null,
    maxTrackDurationMs: parseTrackLevelDurationLimitMs(userMessage),
    avoidArtistRepeats: /\bavoid\b.{0,20}\bartist repeats?\b/i.test(userMessage) || /\bno\b.{0,10}\bartist repeats?\b/i.test(userMessage),
    preserve: parseListAfterLabel(userMessage, "Preserve"),
    avoid: parseListAfterLabel(userMessage, "Avoid")
  };

  if (deterministicSignals.hasPastedTracks) {
    const fallback = deterministicFallbackPlan(playlist, userMessage, deterministicSignals, parameterHints, explicitReadOnly, detectedPlacement);
    return {
      routeFamily: fallback.routeFamily,
      executionPolicy: fallback.executionPolicy,
      planTemplate: fallback.planTemplate,
      replacementMode: fallback.replacementMode,
      reviewMode: fallback.reviewMode,
      operators: fallback.operators,
      normalizedIntent: normalizeInstructionIntentLayers(null),
      boundEntities: bindEntities(playlist, fallback.declaredEntities, fallback.parameterHints),
      declaredEntities: fallback.declaredEntities,
      parameterHints: fallback.parameterHints,
      deterministicSignals,
      confidence: fallback.confidence,
      planningNotes: [...fallback.planningNotes, "Deterministic pre-planner import override."],
      instructionIntentStatus: "not_attempted"
    };
  }

  if (playlist.tracks.length === 0 && (deterministicSignals.hasReviewSignals || explicitReadOnly)) {
    const fallback = deterministicFallbackPlan(playlist, userMessage, deterministicSignals, parameterHints, explicitReadOnly, detectedPlacement);
    return {
      routeFamily: fallback.routeFamily,
      executionPolicy: fallback.executionPolicy,
      planTemplate: fallback.planTemplate,
      replacementMode: fallback.replacementMode,
      reviewMode: fallback.reviewMode,
      operators: fallback.operators,
      normalizedIntent: normalizeInstructionIntentLayers(null),
      boundEntities: bindEntities(playlist, fallback.declaredEntities, fallback.parameterHints),
      declaredEntities: fallback.declaredEntities,
      parameterHints: fallback.parameterHints,
      deterministicSignals,
      confidence: fallback.confidence,
      planningNotes: [...fallback.planningNotes, "Deterministic empty-playlist safeguard."],
      instructionIntentStatus: "not_attempted"
    };
  }

  if (explicitReadOnly) {
    const fallback = fallbackReadOnlyReviewPlan(userMessage, parameterHints);
    return {
      routeFamily: fallback.routeFamily,
      executionPolicy: fallback.executionPolicy,
      planTemplate: fallback.planTemplate,
      replacementMode: fallback.replacementMode,
      reviewMode: fallback.reviewMode,
      operators: fallback.operators,
      normalizedIntent: normalizeInstructionIntentLayers(null),
      boundEntities: bindEntities(playlist, fallback.declaredEntities, fallback.parameterHints),
      declaredEntities: fallback.declaredEntities,
      parameterHints: fallback.parameterHints,
      deterministicSignals,
      confidence: fallback.confidence,
      planningNotes: [...fallback.planningNotes, options.forceReadOnly ? "Review button forces read-only." : "Explicit non-modification directive."],
      instructionIntentStatus: "not_attempted"
    };
  }

  const intentResult = await parseInstructionIntentDetailed(playlist, userMessage, options);
  const normalizedIntent = normalizeInstructionIntentLayers(intentResult.intent);

  const attempt = await attemptLlmContract<{
    routeFamily: ResolvedOperatorPlan["routeFamily"];
    executionPolicy: ResolvedOperatorPlan["executionPolicy"];
    planTemplate: ResolvedOperatorPlan["planTemplate"];
    replacementMode: ResolvedOperatorPlan["replacementMode"];
    reviewMode: ResolvedOperatorPlan["reviewMode"];
    operators: ResolvedOperatorPlan["operators"];
    declaredEntities: OperatorDeclaredEntities;
    parameterHints: OperatorParameterHints;
    confidence: ResolvedOperatorPlan["confidence"];
    planningNotes: string[];
  }>(
    "operatorPlan",
    operatorPlanPrompt(playlist, userMessage, {
      conversationContext: options.conversationContext,
      forceReadOnly: explicitReadOnly,
      hasPastedTracks: deterministicSignals.hasPastedTracks,
      trackCount: playlist.tracks.length
    }),
    { signal: options.signal }
  );

  const candidatePlan = !attempt || attempt.status === "fallback"
    ? operatorPlanFromInstructionIntent(intentResult.intent, parameterHints, detectedPlacement, replacementMode, replacementTarget)
      ?? deterministicFallbackPlan(playlist, userMessage, deterministicSignals, parameterHints, explicitReadOnly, detectedPlacement)
    : {
      ...attempt.parsed,
      replacementMode: replacementMode === "canonical_version"
        ? "canonical_version"
        : attempt.parsed.replacementMode ?? replacementMode,
      declaredEntities: {
        ...attempt.parsed.declaredEntities,
        placement: replacementMode === "generic" && !deterministicSignals.replacement
          ? attempt.parsed.declaredEntities.placement ?? detectedPlacement
          : null,
        replacementTarget: attempt.parsed.declaredEntities.replacementTarget ?? replacementTarget
      },
      parameterHints: {
        ...attempt.parsed.parameterHints,
        requestedCount: attempt.parsed.parameterHints.requestedCount ?? parameterHints.requestedCount,
        maxTrackDurationMs: attempt.parsed.parameterHints.maxTrackDurationMs ?? parameterHints.maxTrackDurationMs,
        avoidArtistRepeats: attempt.parsed.parameterHints.avoidArtistRepeats || parameterHints.avoidArtistRepeats,
        preserve: attempt.parsed.parameterHints.preserve.length > 0 ? attempt.parsed.parameterHints.preserve : parameterHints.preserve,
        avoid: attempt.parsed.parameterHints.avoid.length > 0 ? attempt.parsed.parameterHints.avoid : parameterHints.avoid
      }
    };

  const routeCorrectedPlan = shouldOverrideReviewPlanToCurator(candidatePlan, deterministicSignals, explicitReadOnly)
    ? {
      routeFamily: "curator" as const,
      executionPolicy: "mutating" as const,
      planTemplate: "curator_mutation" as const,
      replacementMode,
      reviewMode: null,
      operators: defaultOperatorsForTemplate("curator_mutation", { namedTracks: [], transition: null, placement: detectedPlacement, replacementTarget, targetSpan: null }, candidatePlan.parameterHints),
      declaredEntities: { namedTracks: [], transition: null, placement: detectedPlacement, replacementTarget, targetSpan: null },
      parameterHints: candidatePlan.parameterHints,
      confidence: candidatePlan.confidence,
      planningNotes: [...candidatePlan.planningNotes, "Deterministic curator override for explicit mutating request."]
    }
    : candidatePlan;

  const nonGreetingConversationalOverride = routeCorrectedPlan.routeFamily === "conversational" &&
    !isPlainConversationalMessage(userMessage);
  const safeguardedPlan = nonGreetingConversationalOverride
    ? {
      ...deterministicFallbackPlan(
        playlist,
        userMessage,
        deterministicSignals,
        routeCorrectedPlan.parameterHints,
        explicitReadOnly,
        detectedPlacement
      ),
      planningNotes: [
        ...routeCorrectedPlan.planningNotes,
        "Deterministic override rejected conversational fallback for a non-greeting request."
      ]
    }
    : routeCorrectedPlan;

  const validatedPlan = validateOperators(userMessage, explicitReadOnly, safeguardedPlan);
  const boundEntities = bindEntities(playlist, validatedPlan.declaredEntities, validatedPlan.parameterHints);

  return {
    routeFamily: validatedPlan.routeFamily,
    executionPolicy: validatedPlan.executionPolicy,
    planTemplate: validatedPlan.planTemplate,
    replacementMode: validatedPlan.replacementMode,
    reviewMode: validatedPlan.reviewMode,
    operators: validatedPlan.operators,
    normalizedIntent,
    boundEntities,
    declaredEntities: validatedPlan.declaredEntities,
    parameterHints: validatedPlan.parameterHints,
    deterministicSignals,
    confidence: validatedPlan.confidence,
    planningNotes: [
      ...validatedPlan.planningNotes,
      !attempt || attempt.status === "fallback"
        ? `Operator planner fallback: ${attempt?.reason ?? "unknown"}.`
        : "Operator planner succeeded."
    ],
    instructionIntentStatus: intentResult.status
  };
}
