import {
  openAIUnavailableMessage
} from "@/lib/ai/errors";
import {
  shouldExposeModelDebug,
  summarizeModelError
} from "@/lib/ai/modelErrors";
import { critiquePrompt } from "@/lib/ai/prompts";
import { attemptLlmContract } from "@/lib/ai/services/llmService";
import { filterCompressionSuggestions, parseCompressionRequest } from "@/lib/playlist/analysis/compression";
import { evaluatePlaylistConstraints } from "@/lib/playlist/constraints";
import { deterministicAnalyzePlaylist } from "@/lib/playlist/analysis/deterministicAnalyze";
import type { AnalyzePlaylistResponse, ConversationContext, PlaylistState, ReviewSuggestion } from "@/types/playlist";

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
  suggestions: ReviewSuggestion[]
): ReviewSuggestion[] {
  return suggestions.map((suggestion) => {
    if (suggestion.applicationMode !== "reorder_existing" || hasValidCompleteOrder(playlist, suggestion)) {
      return suggestion;
    }

    return {
      ...suggestion,
      applicationMode: "informational",
      risk: suggestion.risk ?? "This is a curator note only because the review did not provide a complete safe reorder."
    };
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
  options: { conversationContext?: ConversationContext } = {}
): Promise<AnalyzePlaylistResponse> {
  const constraintReport = evaluatePlaylistConstraints(playlist.tracks, playlist.constraints);
  const compressionRequest = parseCompressionRequest(userQuestion);
  const attempt = await attemptLlmContract<Omit<AnalyzePlaylistResponse, "constraintReport">>(
    "playlistCritique",
    critiquePrompt(playlist, userQuestion, {
      compressionRequest,
      conversationContext: options.conversationContext
    })
  );
  if (attempt.status !== "fallback") {
    const reviewSuggestions = normalizeReviewSuggestions(
      playlist,
      filterCompressionSuggestions(attempt.parsed.reviewSuggestions, compressionRequest)
    );
    const bridgeAwareSuggestions = mergeDeterministicBridgeSuggestions(playlist, attempt.parsed, reviewSuggestions);
    const fallbackCompression = compressionRequest
      ? deterministicAnalyzePlaylist(playlist, undefined, { compressionRequest }).reviewSuggestions.filter((suggestion) => suggestion.type === "compress_section")
      : [];
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
