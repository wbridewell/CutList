import type { AnalyzePlaylistResponse, ReviewSuggestion } from "@/types/playlist";

export function getActionableReviewSuggestions(
  review: AnalyzePlaylistResponse | null | undefined,
  appliedSuggestionIds: Set<string>,
  dismissedSuggestionIds: Set<string>,
  ignoredSuggestionIds: Set<string>,
  sentSuggestionIds: Set<string>
): ReviewSuggestion[] {
  if (!review) {
    return [];
  }

  return review.reviewSuggestions.filter((suggestion) =>
    !dismissedSuggestionIds.has(suggestion.id) &&
    !ignoredSuggestionIds.has(suggestion.id) &&
    !appliedSuggestionIds.has(suggestion.id) &&
    !sentSuggestionIds.has(suggestion.id)
  );
}
