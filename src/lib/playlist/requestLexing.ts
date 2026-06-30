import type { DeclaredTrackPlacement, ReplacementMode } from "@/types/playlist";

const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  couple: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10
};

export type LexedReplacementIntent = {
  mode: ReplacementMode;
  targetQuery: string | null;
  requestedAlbum: string | null;
};

export type LexedRequest = {
  hasReviewSignals: boolean;
  hasCuratorSignals: boolean;
  hasNonModificationDirective: boolean;
  requestedTrackCount: number | null;
  replacementCount: number | null;
  targetTotalTrackCount: number | null;
  shapeStrength: "none" | "advisory" | "strong";
  placement: DeclaredTrackPlacement | null;
  replacementIntent: LexedReplacementIntent | null;
};

export type LexedOperationKind = "analyze" | "remove" | "replace" | "add" | "reorder";

function parseNumber(value: string): number | null {
  const normalized = value.toLowerCase();
  const parsed = NUMBER_WORDS[normalized] ?? Number.parseInt(normalized, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeClauseText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function trimClause(text: string): string {
  return text.replace(/^[,\s]+|[,\s]+$/g, "").trim();
}

function cleanCapturedTrackFragment(value: string): string {
  return value.trim().replace(/^["']|["']$/g, "").replace(/^[,.;:!?]+|[,.;:!?]+$/g, "").trim();
}

function captureNamedValue(match: RegExpMatchArray | null): string | null {
  for (const group of match?.slice(1) ?? []) {
    if (group?.trim()) {
      return cleanCapturedTrackFragment(group);
    }
  }
  return null;
}

function captureNamedGroups(...groups: Array<string | undefined>): string | null {
  for (const group of groups) {
    if (group?.trim()) {
      return cleanCapturedTrackFragment(group);
    }
  }
  return null;
}

export function extractNamedTransitionPair(userMessage: string): { fromText: string; toText: string } | null {
  const quotedMatch = userMessage.match(
    /\b(?:repair|fix)?\b[\s\S]{0,120}\btransition\b[\s\S]{0,120}\bfrom\b\s+(?:"([^"\n]+)"|'([^'\n]+)')\s+\binto\b\s+(?:"([^"\n]+)"|'([^'\n]+)')/i
  ) ?? userMessage.match(
    /\b(?:repair|fix)\b[\s\S]{0,120}\bfrom\b\s+(?:"([^"\n]+)"|'([^'\n]+)')\s+\binto\b\s+(?:"([^"\n]+)"|'([^'\n]+)')/i
  ) ?? userMessage.match(
    /\bbridge(?:\s+tracks?)?\b[\s\S]{0,120}\bbetween\b\s+(?:"([^"\n]+)"|'([^'\n]+)')\s+\band\b\s+(?:"([^"\n]+)"|'([^'\n]+)')/i
  ) ?? userMessage.match(
    /\b(?:add|adding|insert|place|put|slot|drop in|bring in|queue|find|give me|recommend|suggest)\b[\s\S]{0,120}\bbetween\b\s+(?:"([^"\n]+)"|'([^'\n]+)')\s+\band\b\s+(?:"([^"\n]+)"|'([^'\n]+)')/i
  );
  if (quotedMatch) {
    const fromText = captureNamedGroups(quotedMatch[1], quotedMatch[2]);
    const toText = captureNamedGroups(quotedMatch[3], quotedMatch[4]);
    if (fromText && toText) {
      return { fromText, toText };
    }
  }

  const bareMatch = userMessage.match(/\b(?:repair|fix)?\b[\s\S]{0,120}\btransition\b[\s\S]{0,120}\bfrom\b\s+([^.\n]+?)\s+\binto\b\s+([^.\n]+?)(?=[.!?\n]|$)/i)
    ?? userMessage.match(/\b(?:repair|fix)\b[\s\S]{0,120}\bfrom\b\s+([^.\n]+?)\s+\binto\b\s+([^.\n]+?)(?=[.!?\n]|$)/i)
    ?? userMessage.match(/\bbridge(?:\s+tracks?)?\b[\s\S]{0,120}\bbetween\b\s+([^.\n]+?)\s+\band\b\s+([^.\n]+?)(?=[.!?\n]|$)/i)
    ?? userMessage.match(/\b(?:add|adding|insert|place|put|slot|drop in|bring in|queue|find|give me|recommend|suggest)\b[\s\S]{0,120}\bbetween\b\s+([^.\n]+?)\s+\band\b\s+([^.\n]+?)(?=[.!?\n]|$)/i);
  if (!bareMatch) {
    return null;
  }
  const fromText = captureNamedGroups(bareMatch[1]);
  const toText = captureNamedGroups(bareMatch[2]);
  return fromText && toText ? { fromText, toText } : null;
}

const clauseSignalStart = "(?:review|analy[sz]e|critique|diagnos(?:e|is)|identify|name|tell me|focus on|what(?:'s| is) working|what should happen next|which tracks? weaken|what weakens|what doesn'?t fit|add|adding|insert|place|put|slot|drop in|bring in|queue|find|give me|recommend|suggest|fill|round out|build|pump|extend|grow|remove|removing|delete|drop|cut|prune|clear|trim|tighten|compress|reduce|replace|replacing|swap|substitute|re-?order|reorganize|resequence|sequence|sequencing|arrange|rearrange)";
const clauseSplitPattern = new RegExp(
  String.raw`\b(?:and then|then|after that|afterward|afterwards|once that's done|once that is done|once done|finally)\b|[;\n]+|[.!?]+(?=\s+${clauseSignalStart})`,
  "i"
);
const conjunctionClausePattern = new RegExp(
  String.raw`\b(?:and|then|and then|after that|afterwards|next)\b\s+(?=${clauseSignalStart})`,
  "gi"
);

export function splitOrderedClauses(userMessage: string): Array<{ text: string; sourceOrder: number }> {
  const clauses: Array<{ text: string; sourceOrder: number }> = [];
  let remaining = userMessage.replace(/\s*,\s*(?=(?:then|and then|after that|afterwards|next)\b)/gi, "\n")
    .replace(conjunctionClausePattern, "\n");

  while (remaining.length > 0) {
    const match = remaining.match(clauseSplitPattern);
    if (!match || match.index == null) {
      const text = trimClause(remaining);
      if (text) {
        clauses.push({ text, sourceOrder: clauses.length });
      }
      break;
    }

    const delimiter = match[0];
    const beforeSlice = /^[.!?]+$/.test(delimiter)
      ? remaining.slice(0, match.index) + delimiter
      : remaining.slice(0, match.index);
    const before = trimClause(beforeSlice);
    if (before) {
      clauses.push({ text: before, sourceOrder: clauses.length });
    }
    remaining = remaining.slice(match.index + match[0].length);
  }

  return clauses.length > 0 ? clauses : [{ text: userMessage.trim(), sourceOrder: 0 }];
}

function isConstraintDeclaration(userMessage: string): boolean {
  return /\badd(?:ing)?\s+(?:a\s+)?(?:constraint|rule)\b/i.test(userMessage) ||
    /\b(?:make|set)\s+(?:a\s+)?(?:constraint|rule)\b/i.test(userMessage);
}

function isEditSuggestionRequest(userMessage: string): boolean {
  return /\bsuggest\s+(?:cuts?|removals?|deletions?|drops?|edits?)\b/i.test(userMessage);
}

export function isPlainConversationalMessage(userMessage: string): boolean {
  return /^(?:hi|hello|hey|yo|sup|thanks|thank you|ok|okay)[\s!.?]*$/i.test(userMessage.trim());
}

export function parseRequestedTrackCount(userMessage: string): number | null {
  const match = userMessage.match(/\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:\w+\s+){0,3}(?:songs?|tracks?)\b/i);
  if (!match) {
    return null;
  }
  const value = parseNumber(match[1]);
  return value != null ? Math.min(Math.max(value, 1), 20) : null;
}

export function parseTargetTotalTrackCount(userMessage: string): number | null {
  const match = userMessage.match(/\b(?:fill|round|bring|build|pump|extend|grow).{0,40}\b(?:to|out to|up to)\s*(\d+)\s*(?:total\s*)?(?:songs?|tracks?)?\b/i)
    ?? userMessage.match(/\b(?:to|at)\s*(\d+)\s*total\s*(?:songs?|tracks?)?\b/i)
    ?? userMessage.match(/\btotal\s+(?:of\s+)?(\d+)\s*(?:songs?|tracks?)\b/i);
  if (!match) {
    return null;
  }
  const value = Number.parseInt(match[1], 10);
  return Number.isFinite(value) ? Math.min(Math.max(value, 1), 20) : null;
}

export function parseReplacementCount(userMessage: string): number | null {
  const explicit = userMessage.match(/\b(?:replace|swap out|swap|substitute)\b(?:\s+\w+){0,6}?\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:\w+\s+){0,3}(?:songs?|tracks?)\b/i)
    ?? userMessage.match(/\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:\w+\s+){0,3}(?:songs?|tracks?)\s+\b(?:to|for)\s+\breplace\b/i)
    ?? userMessage.match(/\b(?:replace|swap out|swap|substitute)\b\s+the\s+weakest\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b/i);
  if (explicit) {
    return parseRequestedTrackCount(`${explicit[1]} tracks`);
  }

  if (/\bthe opener\b/i.test(userMessage) || /\bthe closer\b/i.test(userMessage) || /\bweakest\b/i.test(userMessage)) {
    return 1;
  }

  return null;
}

export function parseTrackLevelDurationLimitMs(userMessage: string): number | null {
  const match = userMessage.match(/\b(?:tracks?|songs?)\b.{0,20}\b(?:under|below|at most|no longer than)\b.{0,10}(\d+)\s*(?:min|minutes?)\b/i)
    ?? userMessage.match(/\b(?:under|below|at most|no longer than)\b.{0,10}(\d+)\s*(?:min|minutes?)\b.{0,20}\b(?:tracks?|songs?)\b/i);
  if (!match) {
    return null;
  }
  const minutes = Number.parseInt(match[1], 10);
  return Number.isFinite(minutes) ? Math.max(minutes, 1) * 60_000 : null;
}

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

export function hasAddIntent(userMessage: string): boolean {
  if (/\b(?:do not|don't|never)\s+add\b/i.test(userMessage)) {
    return false;
  }
  return /\b(?:add|adding|insert|place|put|slot|drop in|bring in|queue|find|give me|recommend|suggest)\b/i.test(userMessage);
}

export function hasCuratorSignals(userMessage: string): boolean {
  return hasAddIntent(userMessage) ||
    containsReplaceIntent(userMessage) ||
    containsRemoveIntent(userMessage) ||
    containsExplicitReorderIntent(userMessage);
}

export function containsAddIntent(text: string): boolean {
  if (/\b(?:too|bit|little)\s+hard\s+to\s+find\b/i.test(text) || /\beasier\s+to\s+find\b/i.test(text)) {
    return false;
  }
  if (/\b(?:without\b(?:.{0,40})?\badd(?:ing)?|not\s+add(?:ing)?|don't\s+add|do not\s+add|never\s+add)\b/i.test(text)) {
    return false;
  }
  return !isConstraintDeclaration(text) &&
    !isEditSuggestionRequest(text) && (
      /\b(?:add|adding|insert|place|put|slot|drop in|bring in|queue|find|give me|recommend|suggest|fill|round out|build|pump|extend|grow)\b/i.test(text) ||
      /\bbring\b.{0,30}\b(?:to|up to)\s*\d+/i.test(text)
    );
}

export function containsReplaceIntent(text: string): boolean {
  return /\b(replace|replacing|replacement|replacements|swap out|swap|trade out|substitute)\b/i.test(text);
}

function hasStandaloneReplacementNoun(text: string): boolean {
  return /\breplacements?\b/i.test(text) && !/\b(replace|replacing|swap out|swap|trade out|substitute)\b/i.test(text);
}

export function containsRemoveIntent(text: string): boolean {
  if (/\b(?:without\b(?:.{0,40})?\bremov(?:e|ing)|not\s+remov(?:e|ing)|don't\s+remove|do not\s+remove|never\s+remove)\b/i.test(text)) {
    return false;
  }
  if (/\bdrop\s+in\b/i.test(text)) {
    return false;
  }
  return /\b(remove|removing|delete|drop|cut|cuts|prune|clear|trim|tighten|compress|reduce)\b/i.test(text) || /\bget rid of\b/i.test(text);
}

export function containsAnalyzeIntent(text: string): boolean {
  return hasReviewSignals(text);
}

export function containsExplicitReorderIntent(text: string): boolean {
  return /\b(re-?order|reorganize|resequence|sequence|sequencing|arrange|rearrange|spread out|separate|cluster|group|move .*?(?:earlier|later|around))\b/i.test(text);
}

export function inferLexedClauseOperations(clause: string): LexedOperationKind[] {
  const matches: Array<{ index: number; kind: LexedOperationKind }> = [];
  const addOnlyReplacementNoun = containsAddIntent(clause) && hasStandaloneReplacementNoun(clause);
  const patterns: Array<[LexedOperationKind, RegExp]> = [
    ["analyze", /\b(review|analy[sz]e|critique|what(?:'s| is) working|what should happen next)\b/i],
    ["replace", /\b(replace|replacing|replacement|replacements|swap out|swap|trade out|substitute)\b/i],
    ["remove", /\b(remove|removing|delete|drop|cut|cuts|prune|clear|trim|tighten|compress|reduce|get rid of)\b/i],
    ["add", /\b(?:add|adding|insert|place|put|slot|drop in|bring in|queue|find|give me|recommend|suggest|fill|round out|build|pump|extend|grow)\b/i],
    ["reorder", /\b(re-?order|reorganize|resequence|sequence|sequencing|arrange|rearrange|spread out|separate|cluster|group|move .*?(?:earlier|later|around))\b/i]
  ];

  for (const [kind, pattern] of patterns) {
    if (kind === "add" && !containsAddIntent(clause)) {
      continue;
    }
    if (kind === "remove" && !containsRemoveIntent(clause)) {
      continue;
    }
    if (kind === "replace" && !containsReplaceIntent(clause)) {
      continue;
    }
    if (kind === "replace" && addOnlyReplacementNoun) {
      continue;
    }
    if (kind === "reorder" && !containsExplicitReorderIntent(clause)) {
      continue;
    }
    if (kind === "analyze" && !containsAnalyzeIntent(clause)) {
      continue;
    }
    const match = clause.match(pattern);
    if (match?.index != null) {
      matches.push({ index: match.index, kind });
    }
  }

  const ordered = matches
    .sort((first, second) => first.index - second.index)
    .filter((item, index, items) => items.findIndex((other) => other.kind === item.kind) === index)
    .map((item) => item.kind);

  if (ordered.includes("replace")) {
    return ordered.filter((kind) => kind !== "remove" && kind !== "add");
  }

  return ordered;
}

export function parseShapeIntentStrength(userMessage: string): "none" | "advisory" | "strong" {
  const matchesShape = /\b(re-?order|reorganize|resequence|sequence|sequencing|flow|arc|act|acts|transition|transitions|group|cluster|arrange|rearrange|pace|pacing|energy curve|journey|narrative|retitle|title|name|describe|description|separate)\b/i.test(userMessage);
  if (!matchesShape) {
    return "none";
  }
  return /\b(re-?order|reorganize|resequence|sequence|sequencing|retitle|title|name|describe|description|separate|rearrange)\b/i.test(userMessage) ? "strong" : "advisory";
}

export function hasSequencingReviewCue(userMessage: string): boolean {
  return parseShapeIntentStrength(userMessage) !== "none" ||
    /\b(?:sequencing only|sequence only|reorder only|resequence only)\b/i.test(userMessage);
}

export function parseDeclaredTrackPlacement(userMessage: string): DeclaredTrackPlacement | null {
  if (!hasAddIntent(userMessage)) {
    return null;
  }

  const afterValue = captureNamedValue(
    userMessage.match(/\bafter\s+(?:"([^"\n]+)"|'([^'\n]+)'|([^.!?\n]+?))(?=$|[.!?\n]|,\s*(?:and|then)\b)/i)
  );
  if (afterValue) {
    return {
      mode: "after_track",
      anchorQuery: afterValue
    };
  }

  const beforeValue = captureNamedValue(
    userMessage.match(/\bbefore\s+(?:"([^"\n]+)"|'([^'\n]+)'|([^.!?\n]+?))(?=$|[.!?\n]|,\s*(?:and|then)\b)/i)
  );
  if (beforeValue) {
    return {
      mode: "before_track",
      anchorQuery: beforeValue
    };
  }

  const namedTransition = extractNamedTransitionPair(userMessage);
  if (namedTransition) {
    return {
      mode: "after_track",
      anchorQuery: namedTransition.fromText
    };
  }

  if (/\bat\s+the\s+(?:beginning|start)\b|\bto\s+the\s+(?:beginning|start)\b/i.test(userMessage)) {
    return {
      mode: "prepend",
      anchorQuery: null
    };
  }

  if (/\bat\s+the\s+end\b|\bto\s+the\s+end\b/i.test(userMessage)) {
    return {
      mode: "append",
      anchorQuery: null
    };
  }

  return null;
}

export function parsePlacementSubjectQuery(userMessage: string): string | null {
  if (!hasAddIntent(userMessage)) {
    return null;
  }

  const directionalValue = captureNamedValue(userMessage.match(
    /\b(?:add|adding|insert|place|put|slot|drop in|bring in|queue)\s+(?:"([^"\n]+)"|'([^'\n]+)'|([^\n]+?))\s+\b(?:after|before)\b/i
  ));
  if (directionalValue) {
    return directionalValue;
  }

  const edgeValue = captureNamedValue(userMessage.match(
    /\b(?:add|adding|insert|place|put|slot|drop in|bring in|queue)\s+(?:"([^"\n]+)"|'([^'\n]+)'|([^\n]+?))\s+\bat\s+the\s+(?:beginning|start|end)\b/i
  ));
  if (edgeValue) {
    return edgeValue;
  }

  return null;
}

export function parseReplacementIntent(userMessage: string): LexedReplacementIntent | null {
  if (!containsReplaceIntent(userMessage)) {
    return null;
  }

  const canonicalMode = /\b(?:canonical|proper|real|original|studio)\b/i.test(userMessage) ||
    /\balbum\s+cut\b/i.test(userMessage) ||
    /\b(?:album|lp|record)\s+version\b/i.test(userMessage) ||
    /\bitunes originals?\b/i.test(userMessage);
  const mode: ReplacementMode = canonicalMode ? "canonical_version" : "generic";

  const targetQuery = captureNamedValue(
    userMessage.match(/\bversion\s+of\s+(?:"([^"\n]+)"|'([^'\n]+)'|([^.!?\n]+?))(?=$|[.!?\n]|\s+\b(?:with|for|and|then|in)\b|,\s*(?:with|for|and|then|in)\b)/i)
  );

  const requestedAlbum = captureNamedValue(
    userMessage.match(/\b(?:album cut|album version|studio version|record version|lp version|cut)\s+from\s+(?:"([^"\n]+)"|'([^'\n]+)'|([^.!?\n]+?))(?=$|[.!?\n]|,\s*(?:and|then)\b)/i)
  ) ?? captureNamedValue(
    userMessage.match(/\b(?:album cut|album version|studio version|record version|lp version|cut)\s+(?:on|off)\s+(?:"([^"\n]+)"|'([^'\n]+)'|([^.!?\n]+?))(?=$|[.!?\n]|,\s*(?:and|then)\b)/i)
  );

  return {
    mode,
    targetQuery,
    requestedAlbum
  };
}

export function lexRequest(userMessage: string): LexedRequest {
  const replacementIntent = parseReplacementIntent(userMessage);
  return {
    hasReviewSignals: hasReviewSignals(userMessage),
    hasCuratorSignals: hasCuratorSignals(userMessage),
    hasNonModificationDirective: hasNonModificationDirective(userMessage),
    requestedTrackCount: parseRequestedTrackCount(userMessage),
    replacementCount: parseReplacementCount(userMessage),
    targetTotalTrackCount: parseTargetTotalTrackCount(userMessage),
    shapeStrength: parseShapeIntentStrength(userMessage),
    placement: parseDeclaredTrackPlacement(userMessage),
    replacementIntent
  };
}
