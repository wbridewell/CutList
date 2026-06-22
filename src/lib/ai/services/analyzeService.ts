import {
  openAIUnavailableMessage
} from "@/lib/ai/errors";
import {
  shouldExposeModelDebug,
  summarizeModelError
} from "@/lib/ai/modelErrors";
import { emitReviewRoutingTrace, summarizeReviewSuggestions } from "@/lib/debug/reviewRouting";
import { critiquePrompt } from "@/lib/ai/prompts";
import { attemptLlmContract } from "@/lib/ai/services/llmService";
import type { CompressionRequest } from "@/lib/playlist/analysis/compression";
import { filterCompressionSuggestions, parseCompressionRequest } from "@/lib/playlist/analysis/compression";
import { evaluatePlaylistConstraints } from "@/lib/playlist/constraints";
import { deterministicAnalyzePlaylist } from "@/lib/playlist/analysis/deterministicAnalyze";
import type { AnalyzePlaylistResponse, ConversationContext, PlaylistState, ReviewSuggestion } from "@/types/playlist";

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

function normalizeReviewSuggestions(
  playlist: PlaylistState,
  suggestions: ReviewSuggestion[],
  compressionRequest: CompressionRequest | null,
  userQuestion?: string
): ReviewSuggestion[] {
  const weakLinkOnly = isWeakLinkIdentificationRequest(userQuestion);
  return suggestions.flatMap((suggestion) => {
    if (weakLinkOnly && suggestion.type !== "remove") {
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
          applicationMode: "informational",
          risk: suggestion.risk ?? "This compression pass is too destructive to apply directly from review; treat it as a note, not an issue action."
        }];
      }
    }

    if (suggestion.applicationMode !== "reorder_existing" || hasValidCompleteOrder(playlist, suggestion)) {
      return [suggestion];
    }

    return [{
      ...suggestion,
      applicationMode: "informational",
      risk: suggestion.risk ?? "This is a curator note only because the review did not provide a complete safe reorder."
    }];
  });
}

function mergeDeterministicBridgeSuggestions(
  playlist: PlaylistState,
  critique: Omit<AnalyzePlaylistResponse, "constraintReport">,
  suggestions: ReviewSuggestion[]
): ReviewSuggestion[] {
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
  return hasActionableBridge ? suggestions : [...suggestions, ...fallbackBridgeSuggestions];
}

export async function handleAnalyzePlaylist(
  playlist: PlaylistState,
  userQuestion?: string,
  options: { conversationContext?: ConversationContext; requestId?: string } = {}
): Promise<AnalyzePlaylistResponse> {
  const constraintReport = evaluatePlaylistConstraints(playlist.tracks, playlist.constraints);
  const compressionRequest = parseCompressionRequest(userQuestion);
  emitReviewRoutingTrace("backend.handleAnalyzePlaylist.start", {
    compressionRequestMatched: Boolean(compressionRequest),
    requestId: options.requestId ?? null,
    userQuestion: userQuestion ?? null
  });
  const attempt = await attemptLlmContract<Omit<AnalyzePlaylistResponse, "constraintReport">>(
    "playlistCritique",
    critiquePrompt(playlist, userQuestion, {
      compressionRequest,
      conversationContext: options.conversationContext
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
      userQuestion
    );
    const bridgeAwareSuggestions = mergeDeterministicBridgeSuggestions(playlist, attempt.parsed, reviewSuggestions);
    const fallbackCompression = compressionRequest
      ? deterministicAnalyzePlaylist(playlist, undefined, { compressionRequest }).reviewSuggestions.filter((suggestion) => suggestion.type === "compress_section")
      : [];
    emitReviewRoutingTrace("backend.handleAnalyzePlaylist.success", {
      requestId: options.requestId ?? null,
      finalSuggestions: summarizeReviewSuggestions(
        bridgeAwareSuggestions.some((suggestion) => suggestion.type === "compress_section")
          ? bridgeAwareSuggestions
          : [...bridgeAwareSuggestions, ...fallbackCompression]
      )
    });
    return {
      ...attempt.parsed,
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
    };
  }

  const message = attempt.reason === "quota"
    ? openAIUnavailableMessage()
    : attempt.reason === "disabled"
      ? "LLM provider is disabled, so I ran a deterministic playlist check instead."
      : "The local model did not return the expected critique JSON, so I ran a deterministic playlist check instead.";
  const fallback = deterministicAnalyzePlaylist(playlist, message, { compressionRequest });
  emitReviewRoutingTrace("backend.handleAnalyzePlaylist.fallback", {
    requestId: options.requestId ?? null,
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
