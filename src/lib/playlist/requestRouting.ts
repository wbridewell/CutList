export type LegacyComposerRequestKind = "review_only" | "curator_only" | "mixed_review_and_curator";

export type MixedComposerRequestPrompts = {
  reviewPrompt: string;
  curatorPrompt: string;
};

export function hasReviewSignals(userMessage: string): boolean {
  return /\b(review|analy[sz]e|critique|diagnos(?:e|is)|what(?:'s| is) working|what should happen next|which tracks? weaken|what weakens|what doesn'?t fit)\b/i.test(userMessage) ||
    /\b(?:identify|name|tell me)\b.{0,60}\b(?:single biggest|biggest|main|primary)\b.{0,40}\b(?:structural\s+problem|problem|issue|weakness)\b/i.test(userMessage) ||
    /\b(?:focused|focus on)\b.{0,80}\b(?:identity|pacing|transitions?|version risks?)\b/i.test(userMessage);
}

export function hasNonModificationDirective(userMessage: string): boolean {
  return /\b(?:do not|don't|dont|without)\b.{0,40}\b(?:modify|change|edit|mutate|touch|reorder|resequence|reorganize|rearrange|remove|add|replace|swap|cut)\b/i.test(userMessage) ||
    /\bnon[- ]mutating\b/i.test(userMessage) ||
    /\bno\b.{0,10}\bmodifications?\b/i.test(userMessage);
}

export function hasCuratorSignals(userMessage: string): boolean {
  return /\b(add|adding|find|give me|recommend|suggest\b.*\b(?:songs?|tracks?)|replace|replacing|swap|substitute|remove|removing|delete|drop|cut|re-?order|reorganize|resequence|sequence|arrange|rearrange)\b/i.test(userMessage);
}

function cleanComposerClause(clause: string): string {
  return clause
    .replace(/^(?:and|then|and then|after that|afterwards|next)\b[\s,:-]*/i, "")
    .trim();
}

export function splitComposerIntentClauses(userMessage: string): string[] {
  const normalized = userMessage.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return [];
  }

  const signalStart = "(?:review|analy[sz]e|critique|diagnos(?:e|is)|identify|name|tell me|focus on|what(?:'s| is) working|what should happen next|which tracks? weaken|what weakens|what doesn'?t fit|add|adding|find|give me|recommend|suggest\\b|replace|replacing|swap|substitute|remove|removing|delete|drop|cut|re-?order|reorganize|resequence|sequence|arrange|rearrange)";
  const clauseDelimited = normalized
    .replace(/([.!?;])\s+/g, "$1\n")
    .replace(/\s*,\s*(?=(?:then|and then|after that|afterwards|next)\b)/gi, "\n")
    .replace(new RegExp(`\\b(?:and|then|and then|after that|afterwards|next)\\b\\s+(?=${signalStart})`, "gi"), "\n");

  return clauseDelimited
    .split("\n")
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
