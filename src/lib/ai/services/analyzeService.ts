import {
  openAIUnavailableMessage
} from "@/lib/ai/errors";
import {
  shouldExposeModelDebug,
  summarizeModelError
} from "@/lib/ai/modelErrors";
import { emitReviewRoutingTrace, summarizeReviewSuggestions } from "@/lib/debug/reviewRouting";
import { critiquePrompt, transitionRepairPrompt } from "@/lib/ai/prompts";
import { attemptLlmContract } from "@/lib/ai/services/llmService";
import { parseRequestedTrackCount } from "@/lib/ai/services/instructionIntent";
import { determineReviewModeDeterministically } from "@/lib/ai/services/reviewMode";
import type { CompressionRequest } from "@/lib/playlist/analysis/compression";
import { filterCompressionSuggestions, parseCompressionRequest } from "@/lib/playlist/analysis/compression";
import { evaluatePlaylistConstraints } from "@/lib/playlist/constraints";
import { deterministicAnalyzePlaylist } from "@/lib/playlist/analysis/deterministicAnalyze";
import type { AnalyzePlaylistResponse, CandidateTrack, ConversationContext, OperatorBoundEntities, PlaylistState, ReviewMode, ReviewSuggestion } from "@/types/playlist";

function isWeakLinkIdentificationRequest(userQuestion?: string | null): boolean {
  if (!userQuestion?.trim()) {
    return false;
  }
  return /\b(?:name|identify|list|tell me)\b.{0,30}\b(?:one|two|three|\d+)\b.{0,20}\btracks?\b.{0,40}\b(?:weaken|hurt|dilute|break|fracture|undermine|don't fit|doesn't fit|soften)\b/i.test(userQuestion) ||
    /\bwhich\s+tracks?\b.{0,40}\b(?:weaken|hurt|dilute|break|fracture|undermine|don't fit|doesn't fit|soften)\b/i.test(userQuestion);
}

function hasValidCompleteOrder(playlist: PlaylistState, suggestion: ReviewSuggestion): boolean {
  if (suggestion.applicationMode !== "reorder_existing") {
    return true;
  }
  if (!suggestion.orderedTrackIds || suggestion.orderedTrackIds.length !== playlist.tracks.length) {
    return false;
  }
  const currentIds = new Set(playlist.tracks.map((track) => track.id));
  return new Set(suggestion.orderedTrackIds).size === currentIds.size &&
    suggestion.orderedTrackIds.every((trackId) => currentIds.has(trackId));
}

function allowedSuggestionTypes(reviewMode: ReviewMode): Set<ReviewSuggestion["type"]> | null {
  switch (reviewMode) {
    case "diagnose_only":
      return new Set();
    case "weak_links_only":
      return new Set(["remove"]);
    case "focused_transition_repair":
    case "bridge_options_only":
      return new Set(["add_bridge"]);
    case "compression_review":
      return new Set(["compress_section", "remove"]);
    case "ending_repair":
      return new Set(["improve_ending", "add_bridge"]);
    case "sequencing_only":
      return new Set(["reorder"]);
    case "full_critique":
    default:
      return null;
  }
}

function shapeResponseForReviewMode(
  critique: AnalyzePlaylistResponse,
  reviewMode: ReviewMode
): AnalyzePlaylistResponse {
  switch (reviewMode) {
    case "focused_transition_repair":
    case "bridge_options_only":
      return {
        ...critique,
        reviewMode,
        strengths: [],
        weakLinks: [],
        suggestedEdits: [],
        trackRoles: []
      };
    case "diagnose_only":
      return {
        ...critique,
        reviewMode,
        suggestedEdits: [],
        trackRoles: [],
        reviewSuggestions: []
      };
    case "weak_links_only":
      return {
        ...critique,
        reviewMode,
        strengths: [],
        sequencingNotes: [],
        suggestedEdits: [],
        trackRoles: [],
        transitionReview: []
      };
    case "compression_review":
      return {
        ...critique,
        reviewMode,
        trackRoles: []
      };
    case "ending_repair":
      return {
        ...critique,
        reviewMode,
        strengths: [],
        weakLinks: [],
        suggestedEdits: [],
        trackRoles: []
      };
    case "sequencing_only":
      return {
        ...critique,
        reviewMode,
        weakLinks: [],
        suggestedEdits: [],
        trackRoles: []
      };
    case "full_critique":
    default:
      return {
        ...critique,
        reviewMode
      };
  }
}

function transitionRepairResponse(
  playlist: PlaylistState,
  reviewMode: ReviewMode,
  constraintReport: AnalyzePlaylistResponse["constraintReport"],
  message: string,
  transitionSummary: string,
  bridgeOptions: Array<{ candidate: CandidateTrack; role: string }>,
  boundEntities: OperatorBoundEntities
): AnalyzePlaylistResponse {
  const base = deterministicAnalyzePlaylist(playlist, message);
  const transitionReview = boundEntities.namedTransition?.fromTrackId && boundEntities.namedTransition?.toTrackId
    ? base.transitionReview.filter((item) => item.fromTrackId === boundEntities.namedTransition?.fromTrackId && item.toTrackId === boundEntities.namedTransition?.toTrackId)
    : base.transitionReview.slice(0, 1);
  return shapeResponseForReviewMode({
    ...base,
    reviewMode,
    curatorTake: transitionSummary,
    message,
    strengths: [],
    weakLinks: [],
    sequencingNotes: [transitionSummary],
    constraintReport,
    suggestedEdits: [],
    trackRoles: [],
    transitionReview,
    reviewSuggestions: bridgeOptions.map((option, index) => ({
      id: `bridge-option-${index + 1}`,
      type: "add_bridge" as const,
      applicationMode: "informational" as const,
      affectedTrackIds: transitionReview[0]
        ? [transitionReview[0].fromTrackId, transitionReview[0].toTrackId]
        : [],
      rationale: `${option.candidate.artist} - ${option.candidate.title}: ${option.role}`,
      intentPreservation: "Keeps the existing tracks in place while adding connective tissue only as a later option.",
      risk: "Bridge fit is interpretive; verify before acting on it.",
      confidence: "medium" as const,
      basis: "model_judgment" as const,
      candidate: option.candidate,
      suggestedPrompt: `Add ${option.candidate.artist} - ${option.candidate.title} as a bridge between the named tracks.`
    }))
  }, reviewMode);
}

function transitionRepairFallbackMessage(reason: "disabled" | "timeout" | "quota" | "shape_error" | "json_extraction_error"): string {
  switch (reason) {
    case "quota":
      return openAIUnavailableMessage();
    case "disabled":
      return "LLM provider is disabled, so I kept this to a deterministic transition review.";
    case "timeout":
      return "The model timed out, so I kept this to a deterministic transition review.";
    case "json_extraction_error":
    case "shape_error":
    default:
      return "The model missed the focused bridge-track format, so I kept this to a deterministic transition review.";
  }
}

function transitionRepairFallbackResponse(
  playlist: PlaylistState,
  reviewMode: ReviewMode,
  constraintReport: AnalyzePlaylistResponse["constraintReport"],
  reason: "disabled" | "timeout" | "quota" | "shape_error" | "json_extraction_error",
  userQuestion: string | undefined,
  boundEntities: OperatorBoundEntities
): AnalyzePlaylistResponse {
  const base = deterministicAnalyzePlaylist(playlist, transitionRepairFallbackMessage(reason));
  const requestedCount = parseRequestedTrackCount(userQuestion ?? "");
  const reviewSuggestions = normalizeReviewSuggestions(
    playlist,
    base.reviewSuggestions,
    null,
    userQuestion,
    reviewMode
  );
  const bridgeSuggestions = requestedCount != null
    ? reviewSuggestions.filter((suggestion) => suggestion.type === "add_bridge").slice(0, requestedCount)
    : reviewSuggestions.filter((suggestion) => suggestion.type === "add_bridge");
  const transitionReview = boundEntities.namedTransition?.fromTrackId && boundEntities.namedTransition?.toTrackId
    ? base.transitionReview.filter((item) => item.fromTrackId === boundEntities.namedTransition?.fromTrackId && item.toTrackId === boundEntities.namedTransition?.toTrackId)
    : base.transitionReview.slice(0, 1);

  return shapeResponseForReviewMode({
    ...base,
    reviewMode,
    constraintReport,
    transitionReview,
    reviewSuggestions: bridgeSuggestions
  }, reviewMode);
}

function transitionClarificationResponse(
  playlist: PlaylistState,
  reviewMode: ReviewMode,
  constraintReport: AnalyzePlaylistResponse["constraintReport"],
  boundEntities: OperatorBoundEntities
): AnalyzePlaylistResponse {
  const base = deterministicAnalyzePlaylist(playlist, "I could not bind that transition to one exact handoff in the current playlist, so I need a more exact track reference before suggesting bridges.");
  const fromText = boundEntities.namedTransition?.fromQuery ?? "the source track";
  const toText = boundEntities.namedTransition?.toQuery ?? "the destination track";
  return shapeResponseForReviewMode({
    ...base,
    reviewMode,
    curatorTake: `I need the exact handoff before I can repair it: ${fromText} -> ${toText}.`,
    message: "Name the exact two tracks as they appear in the playlist and I will keep the review scoped to that one transition.",
    strengths: [],
    weakLinks: [],
    sequencingNotes: [`The requested transition could not be resolved unambiguously: ${fromText} -> ${toText}.`],
    constraintReport,
    suggestedEdits: [],
    trackRoles: [],
    transitionReview: [],
    reviewSuggestions: []
  }, reviewMode);
}

function normalizeReviewSuggestions(
  playlist: PlaylistState,
  suggestions: ReviewSuggestion[],
  compressionRequest: CompressionRequest | null,
  userQuestion: string | undefined,
  reviewMode: ReviewMode
): ReviewSuggestion[] {
  const weakLinkOnly = isWeakLinkIdentificationRequest(userQuestion);
  const allowedTypes = allowedSuggestionTypes(reviewMode);
  const requestedCount = parseRequestedTrackCount(userQuestion ?? "");
  const normalized = suggestions.flatMap((suggestion) => {
    if (weakLinkOnly && suggestion.type !== "remove") {
      return [];
    }
    if (allowedTypes && !allowedTypes.has(suggestion.type)) {
      return [];
    }

    if (suggestion.type === "compress_section") {
      const removeCount = suggestion.compressionPlan?.removeTrackIds.length ?? suggestion.affectedTrackIds.length;
      const keptCount = suggestion.compressionPlan?.keepTrackIds?.length ?? Math.max(0, playlist.tracks.length - removeCount);
      const explicitTargetCount = compressionRequest?.targetTrackCount;
      const isOverbroad = removeCount >= Math.ceil(playlist.tracks.length * 0.5) || keptCount < Math.max(4, Math.ceil(playlist.tracks.length * 0.4));
      const matchesExplicitTarget = explicitTargetCount != null && keptCount <= explicitTargetCount;

    if (isOverbroad && !matchesExplicitTarget) {
      return [{
          ...suggestion,
          applicationMode: "informational" as const,
          risk: suggestion.risk ?? "This compression pass is too destructive to apply directly from review; treat it as a note, not an issue action."
        }];
      }
    }

    if (suggestion.applicationMode !== "reorder_existing" || hasValidCompleteOrder(playlist, suggestion)) {
      return [{
        ...suggestion,
        applicationMode: "informational" as const,
        risk: suggestion.risk ?? "Review mode does not apply playlist changes directly; reuse this as a follow-up prompt if you want to act on it."
      }];
    }

    return [{
      ...suggestion,
      applicationMode: "informational" as const,
      risk: suggestion.risk ?? "This is a curator note only because the review did not provide a complete safe reorder."
    }];
  });
  if (
    requestedCount != null &&
    (reviewMode === "focused_transition_repair" || reviewMode === "bridge_options_only")
  ) {
    return normalized.filter((suggestion) => suggestion.type === "add_bridge").slice(0, requestedCount);
  }
  return normalized;
}

function mergeDeterministicBridgeSuggestions(
  playlist: PlaylistState,
  critique: Omit<AnalyzePlaylistResponse, "constraintReport">,
  suggestions: ReviewSuggestion[],
  reviewMode: ReviewMode,
  requestedCount: number | null
): ReviewSuggestion[] {
  if (reviewMode !== "full_critique" && reviewMode !== "focused_transition_repair" && reviewMode !== "bridge_options_only") {
    return suggestions;
  }
  if (
    critique.transitionReview.length > 0 ||
    critique.sequencingNotes.length > 0 ||
    critique.weakLinks.length > 0 ||
    critique.strengths.length > 0
  ) {
    return suggestions;
  }

  const fallbackBridgeSuggestions = deterministicAnalyzePlaylist(playlist).reviewSuggestions
    .filter((suggestion) => suggestion.type === "add_bridge");
  if (fallbackBridgeSuggestions.length === 0) {
    return suggestions;
  }
  const hasActionableBridge = suggestions.some((suggestion) => suggestion.type === "add_bridge" && suggestion.applicationMode === "verify_candidate");
  const merged = hasActionableBridge ? suggestions : [...suggestions, ...fallbackBridgeSuggestions];
  return requestedCount != null ? merged.slice(0, requestedCount) : merged;
}

function inferDeclaredTransitionFromQuestion(userQuestion?: string): { fromText: string; toText: string } | null {
  if (!userQuestion?.trim()) {
    return null;
  }
  const quotedMatch = userQuestion.match(/\b(?:repair|fix)?\b[\s\S]{0,120}\btransition\b[\s\S]{0,120}\bfrom\b\s+["']([^"'\n]+)["']\s+\binto\b\s+["']([^"'\n]+)["']/i)
    ?? userQuestion.match(/\b(?:repair|fix)\b[\s\S]{0,120}\bfrom\b\s+["']([^"'\n]+)["']\s+\binto\b\s+["']([^"'\n]+)["']/i);
  if (quotedMatch) {
    return {
      fromText: quotedMatch[1].trim(),
      toText: quotedMatch[2].trim()
    };
  }
  const bareMatch = userQuestion.match(/\b(?:repair|fix)?\b[\s\S]{0,120}\btransition\b[\s\S]{0,120}\bfrom\b\s+([^.\n]+?)\s+\binto\b\s+([^.\n]+?)(?=[.!?\n]|$)/i)
    ?? userQuestion.match(/\b(?:repair|fix)\b[\s\S]{0,120}\bfrom\b\s+([^.\n]+?)\s+\binto\b\s+([^.\n]+?)(?=[.!?\n]|$)/i);
  return bareMatch
    ? {
      fromText: bareMatch[1].trim().replace(/^["']|["']$/g, ""),
      toText: bareMatch[2].trim().replace(/^["']|["']$/g, "")
    }
    : null;
}

function normalizeTrackQuery(value: string): string {
  return value.trim().toLowerCase().replace(/["'.:,!?()[\]-]+/g, " ").replace(/\s+/g, " ").trim();
}

function bindTransitionLocally(playlist: PlaylistState, userQuestion?: string): OperatorBoundEntities {
  const declaredTransition = inferDeclaredTransitionFromQuestion(userQuestion);
  if (!declaredTransition) {
    return {
      namedTracks: [],
      namedTransition: null,
      placement: null,
      replacementTarget: null,
      targetSpan: null,
      candidateCount: parseRequestedTrackCount(userQuestion ?? ""),
      maxTrackDurationMs: null,
      avoidArtistRepeats: /\bavoid\b.{0,20}\bartist repeats?\b/i.test(userQuestion ?? "") || /\bno\b.{0,10}\bartist repeats?\b/i.test(userQuestion ?? ""),
      preserve: [],
      avoid: []
    };
  }

  const resolveTrackId = (query: string): { trackId: string | null; label: string | null; resolution: "exact" | "fuzzy" | "ambiguous" | "unresolved" } => {
    const normalized = normalizeTrackQuery(query);
    const exact = playlist.tracks.filter((track) => {
      const title = normalizeTrackQuery(track.title);
      const label = normalizeTrackQuery(`${track.artist} ${track.title}`);
      return normalized === title || normalized === label;
    });
    if (exact.length === 1) {
      return {
        trackId: exact[0].id,
        label: `${exact[0].artist} - ${exact[0].title}`,
        resolution: "exact"
      };
    }
    const tokens = normalized.split(" ").filter(Boolean);
    const fuzzy = playlist.tracks.filter((track) => tokens.every((token) => normalizeTrackQuery(`${track.artist} ${track.title}`).includes(token)));
    if (fuzzy.length === 1) {
      return {
        trackId: fuzzy[0].id,
        label: `${fuzzy[0].artist} - ${fuzzy[0].title}`,
        resolution: "fuzzy"
      };
    }
    return {
      trackId: null,
      label: null,
      resolution: exact.length > 1 || fuzzy.length > 1 ? "ambiguous" : "unresolved"
    };
  };

  const from = resolveTrackId(declaredTransition.fromText);
  const to = resolveTrackId(declaredTransition.toText);
  return {
    namedTracks: [],
    namedTransition: {
      fromQuery: declaredTransition.fromText,
      toQuery: declaredTransition.toText,
      fromTrackId: from.trackId,
      toTrackId: to.trackId,
      fromLabel: from.label,
      toLabel: to.label,
      resolution: from.resolution === "exact" && to.resolution === "exact"
        ? "exact"
        : from.resolution === "ambiguous" || to.resolution === "ambiguous"
          ? "ambiguous"
          : from.resolution === "unresolved" || to.resolution === "unresolved"
            ? "unresolved"
            : "fuzzy"
    },
    placement: null,
    replacementTarget: null,
    targetSpan: null,
    candidateCount: parseRequestedTrackCount(userQuestion ?? ""),
    maxTrackDurationMs: null,
    avoidArtistRepeats: /\bavoid\b.{0,20}\bartist repeats?\b/i.test(userQuestion ?? "") || /\bno\b.{0,10}\bartist repeats?\b/i.test(userQuestion ?? ""),
    preserve: [],
    avoid: []
  };
}

export async function handleAnalyzePlaylist(
  playlist: PlaylistState,
  userQuestion?: string,
  options: { conversationContext?: ConversationContext; requestId?: string; reviewMode?: ReviewMode } = {}
): Promise<AnalyzePlaylistResponse> {
  const constraintReport = evaluatePlaylistConstraints(playlist.tracks, playlist.constraints);
  const deterministicReviewMode = determineReviewModeDeterministically(userQuestion ?? "Review this playlist.");
  const reviewMode = options.reviewMode && options.reviewMode !== "full_critique"
    ? options.reviewMode
    : deterministicReviewMode;
  const operatorPlan = {
    boundEntities: bindTransitionLocally(playlist, userQuestion)
  };
  const compressionRequest = reviewMode === "compression_review" ? parseCompressionRequest(userQuestion) : null;
  const requestedBridgeCount = parseRequestedTrackCount(userQuestion ?? "");
  if (reviewMode === "focused_transition_repair" || reviewMode === "bridge_options_only") {
    if (
      operatorPlan.boundEntities.namedTransition &&
      operatorPlan.boundEntities.namedTransition.resolution === "ambiguous"
    ) {
      return transitionClarificationResponse(
        playlist,
        reviewMode,
        constraintReport,
        operatorPlan.boundEntities
      );
    }

    const attempt = await attemptLlmContract<{
      message: string;
      transitionSummary: string;
      bridgeOptions: Array<{ candidate: CandidateTrack; role: string }>;
    }>(
      "playlistTransitionRepair",
      transitionRepairPrompt(playlist, userQuestion ?? "Repair this transition.", {
        conversationContext: options.conversationContext,
        requestedCount: requestedBridgeCount,
        namedTransition: operatorPlan.boundEntities.namedTransition?.fromLabel && operatorPlan.boundEntities.namedTransition?.toLabel
          ? {
            fromLabel: operatorPlan.boundEntities.namedTransition.fromLabel,
            toLabel: operatorPlan.boundEntities.namedTransition.toLabel
          }
          : null
      })
    );

    if (attempt.status !== "fallback") {
      const filteredBridgeOptions = attempt.parsed.bridgeOptions.filter((option) => (
        !operatorPlan.boundEntities.avoidArtistRepeats ||
        !playlist.tracks.some((track) => track.artist.trim().toLowerCase() === option.candidate.artist.trim().toLowerCase())
      ));
      const exactBridgeOptions = requestedBridgeCount != null
        ? filteredBridgeOptions.slice(0, requestedBridgeCount)
        : filteredBridgeOptions;
      const response = transitionRepairResponse(
        playlist,
        reviewMode,
        constraintReport,
        attempt.parsed.message,
        attempt.parsed.transitionSummary,
        exactBridgeOptions,
        operatorPlan.boundEntities
      );
      emitReviewRoutingTrace("backend.handleAnalyzePlaylist.transitionRepair.success", {
        requestId: options.requestId ?? null,
        reviewMode,
        finalSuggestions: summarizeReviewSuggestions(response.reviewSuggestions)
      });
      return response;
    }

    return transitionRepairFallbackResponse(
      playlist,
      reviewMode,
      constraintReport,
      attempt.reason,
      userQuestion,
      operatorPlan.boundEntities
    );
  }

  emitReviewRoutingTrace("backend.handleAnalyzePlaylist.start", {
    compressionRequestMatched: Boolean(compressionRequest),
    requestId: options.requestId ?? null,
    reviewMode,
    userQuestion: userQuestion ?? null
  });
  const attempt = await attemptLlmContract<Omit<AnalyzePlaylistResponse, "constraintReport">>(
    "playlistCritique",
    critiquePrompt(playlist, userQuestion, {
      compressionRequest,
      conversationContext: options.conversationContext,
      reviewMode
    })
  );
  emitReviewRoutingTrace("backend.handleAnalyzePlaylist.attempt", {
    requestId: options.requestId ?? null,
    status: attempt.status,
    reason: attempt.status === "fallback" ? attempt.reason : null
  });
  if (attempt.status !== "fallback") {
    const reviewSuggestions = normalizeReviewSuggestions(
      playlist,
      filterCompressionSuggestions(attempt.parsed.reviewSuggestions, compressionRequest),
      compressionRequest,
      userQuestion,
      reviewMode
    );
    const bridgeAwareSuggestions = mergeDeterministicBridgeSuggestions(playlist, attempt.parsed, reviewSuggestions, reviewMode, requestedBridgeCount);
    const fallbackCompression = compressionRequest && reviewMode === "compression_review"
      ? deterministicAnalyzePlaylist(playlist, undefined, { compressionRequest }).reviewSuggestions.filter((suggestion) => suggestion.type === "compress_section")
      : [];
    const response = shapeResponseForReviewMode({
      ...attempt.parsed,
      reviewMode,
      reviewSuggestions: bridgeAwareSuggestions.some((suggestion) => suggestion.type === "compress_section")
        ? bridgeAwareSuggestions
        : [...bridgeAwareSuggestions, ...fallbackCompression],
      constraintReport,
      debug: attempt.status === "success_repaired" && shouldExposeModelDebug()
        ? {
          modelRawOutput: attempt.repairedFromRaw ?? attempt.raw,
          validationError: "The critique contract required one repair pass before it parsed cleanly."
        }
        : undefined
    }, reviewMode);
    emitReviewRoutingTrace("backend.handleAnalyzePlaylist.success", {
      requestId: options.requestId ?? null,
      reviewMode,
      finalSuggestions: summarizeReviewSuggestions(response.reviewSuggestions)
    });
    return response;
  }

  const message = attempt.reason === "quota"
    ? openAIUnavailableMessage()
    : attempt.reason === "disabled"
      ? "LLM provider is disabled, so I ran a deterministic playlist check instead."
      : "The local model did not return the expected critique JSON, so I ran a deterministic playlist check instead.";
  const fallback = shapeResponseForReviewMode({
    ...deterministicAnalyzePlaylist(playlist, message, { compressionRequest }),
    reviewMode,
    reviewSuggestions: normalizeReviewSuggestions(
      playlist,
      deterministicAnalyzePlaylist(playlist, message, { compressionRequest }).reviewSuggestions,
      compressionRequest,
      userQuestion,
      reviewMode
    )
  }, reviewMode);
  emitReviewRoutingTrace("backend.handleAnalyzePlaylist.fallback", {
    requestId: options.requestId ?? null,
    reviewMode,
    fallbackSuggestions: summarizeReviewSuggestions(fallback.reviewSuggestions),
    hasReorderSuggestion: fallback.reviewSuggestions.some((suggestion) => suggestion.type === "reorder" || suggestion.applicationMode === "reorder_existing")
  });
  if ((attempt.reason === "shape_error" || attempt.reason === "json_extraction_error") && shouldExposeModelDebug()) {
    return {
      ...fallback,
      debug: {
        modelRawOutput: attempt.raw,
        validationError: summarizeModelError(attempt.error)
      }
    };
  }
  if (attempt.reason === "timeout") {
    return {
      ...fallback,
      message: "The model timed out, so I ran a deterministic playlist check instead."
    };
  }
  if (
    attempt.reason !== "disabled" &&
    attempt.reason !== "shape_error" &&
    attempt.reason !== "json_extraction_error" &&
    attempt.reason !== "quota"
  ) {
    throw attempt.error;
  }
  return fallback;
}
