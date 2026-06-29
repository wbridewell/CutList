import {
  hasCuratorSignals as sharedHasCuratorSignals,
  hasNonModificationDirective as sharedHasNonModificationDirective,
  hasReviewSignals as sharedHasReviewSignals,
  splitOrderedClauses
} from "@/lib/playlist/requestLexing";

export type LegacyComposerRequestKind = "review_only" | "curator_only" | "mixed_review_and_curator";

export type MixedComposerRequestPrompts = {
  reviewPrompt: string;
  curatorPrompt: string;
};

export function hasReviewSignals(userMessage: string): boolean {
  return sharedHasReviewSignals(userMessage);
}

export function hasNonModificationDirective(userMessage: string): boolean {
  return sharedHasNonModificationDirective(userMessage);
}

export function hasCuratorSignals(userMessage: string): boolean {
  return sharedHasCuratorSignals(userMessage);
}

function cleanComposerClause(clause: string): string {
  return clause
    .replace(/^(?:and|then|and then|after that|afterwards|next)\b[\s,:-]*/i, "")
    .trim();
}

export function splitComposerIntentClauses(userMessage: string): string[] {
  if (!userMessage.trim()) {
    return [];
  }
  return splitOrderedClauses(userMessage)
    .map((clause) => clause.text)
    .map(cleanComposerClause)
    .filter((clause) => clause.length > 0);
}

export function splitMixedComposerRequest(userMessage: string): MixedComposerRequestPrompts {
  const clauses = splitComposerIntentClauses(userMessage);
  if (clauses.length === 0) {
    const fallback = userMessage.trim();
    return { reviewPrompt: fallback, curatorPrompt: fallback };
  }

  const reviewClauses = clauses.filter((clause) => hasReviewSignals(clause) && !hasCuratorSignals(clause));
  const curatorClauses = clauses.filter((clause) => hasCuratorSignals(clause) && !hasReviewSignals(clause));

  if (reviewClauses.length === 0 || curatorClauses.length === 0) {
    const fallback = userMessage.trim();
    return { reviewPrompt: fallback, curatorPrompt: fallback };
  }

  return {
    reviewPrompt: reviewClauses.join(" "),
    curatorPrompt: curatorClauses.join(" ")
  };
}

export function reviewPromptForComposerRequest(userMessage: string): string {
  const trimmed = userMessage.trim();
  if (!trimmed) {
    return "Review this playlist.";
  }

  if (hasReviewSignals(trimmed) && hasCuratorSignals(trimmed)) {
    return splitMixedComposerRequest(trimmed).reviewPrompt;
  }

  return trimmed;
}

export function classifyComposerRequestLegacy(userMessage: string, hasTracks: boolean): LegacyComposerRequestKind | "curator_only" {
  if (!hasTracks) {
    return "curator_only";
  }

  if (hasNonModificationDirective(userMessage)) {
    return "review_only";
  }

  const review = hasReviewSignals(userMessage);
  const curator = hasCuratorSignals(userMessage);

  if (review && curator) {
    return "mixed_review_and_curator";
  }
  if (review) {
    return "review_only";
  }
  return "curator_only";
}
