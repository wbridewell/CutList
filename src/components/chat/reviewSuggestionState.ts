import type { AnalyzePlaylistResponse, ReviewSuggestion } from "@/types/playlist";

export function getActionableReviewSuggestions(
  review: AnalyzePlaylistResponse | null | undefined,
  appliedSuggestionIds: Set<string>,
  dismissedSuggestionIds: Set<string>,
  ignoredSuggestionIds: Set<string>,
  sentSuggestionIds: Set<string>
): ReviewSuggestion[] {
  void review;
  void appliedSuggestionIds;
  void dismissedSuggestionIds;
  void ignoredSuggestionIds;
  void sentSuggestionIds;
  return [];
}
