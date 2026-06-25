import { parseDiscoveryRadiusOverride } from "@/lib/playlist/discoveryRadius";
import type { ParsedTrackLine } from "@/lib/playlist/io/textImport";
import type { DiscoveryRadius, PlaylistConstraints } from "@/types/playlist";

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

const GENERIC_ADDITION_WORDS = new Set([
  "any",
  "assorted",
  "different",
  "diverse",
  "eclectic",
  "fresh",
  "good",
  "misc",
  "miscellaneous",
  "new",
  "random",
  "some",
  "varied",
  "various"
]);

type ConstraintScope = "persistent" | "requestScoped";

export type DeterministicOperationKind = "analyze" | "remove" | "replace" | "add" | "reorder";
export type DeterministicShapeIntentStrength = "none" | "advisory" | "strong";

export type DeterministicClause = {
  text: string;
  sourceOrder: number;
  operations: DeterministicOperationKind[];
};

export type DeterministicOperationSignals = {
  addition: boolean;
  removal: boolean;
  replacement: boolean;
  reorder: boolean;
  analyze: boolean;
  shapeStrength: DeterministicShapeIntentStrength;
  mixedEditAndGeneration: boolean;
};

export type DeterministicRequestParse = {
  constraintUpdates: PlaylistConstraints;
  guidanceUpdates: PlaylistConstraints;
  deterministicConstraints: PlaylistConstraints;
  deterministicPersistentConstraints: PlaylistConstraints;
  deterministicRequestScopedConstraints: PlaylistConstraints;
  explicitTrackRequests: ParsedTrackLine[];
  operationSignals: DeterministicOperationSignals;
  countSignals: {
    requestedAddCount: number | null;
    replacementCount: number | null;
    targetTotalTrackCount: number | null;
  };
  scopeSignals: {
    persistent: boolean;
    requestScoped: boolean;
  };
  sequencingSignals: {
    clauses: DeterministicClause[];
  };
  cleanupSignals: {
    conversationalOnly: boolean;
    versionCleanup: boolean;
    shouldPruneExistingForConstraints: boolean;
  };
  discoveryRadiusOverride: DiscoveryRadius | null;
  matchedRules: string[];
};

function parseNumber(value: string): number | null {
  const normalized = value.toLowerCase();
  const parsed = NUMBER_WORDS[normalized] ?? Number.parseInt(normalized, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseRequestedTrackCount(userMessage: string): number | null {
  const match = userMessage.match(/\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:\w+\s+){0,3}(?:songs?|tracks?)\b/i);
  if (!match) {
    return null;
  }
  const value = parseNumber(match[1]);
  return value != null ? Math.min(Math.max(value, 1), 20) : null;
}

function toDurationMs(value: string, unit: string): number {
  const numeric = Number.parseFloat(value);
  if (unit.startsWith("second")) {
    return Math.round(numeric * 1000);
  }
  return Math.round(numeric * 60 * 1000);
}

function defaultTotalDurationToleranceMs(targetMs: number): number {
  return Math.max(60_000, Math.round(targetMs * 0.15));
}

function defaultBpmTolerance(targetBpm: number): number {
  return targetBpm < 80 ? 4 : 5;
}

function unique(values: string[] = []): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function compactConstraints(constraints: PlaylistConstraints): PlaylistConstraints {
  const next: PlaylistConstraints = {};
  for (const [key, value] of Object.entries(constraints) as Array<[keyof PlaylistConstraints, PlaylistConstraints[keyof PlaylistConstraints]]>) {
    if (value == null) {
      continue;
    }
    if (Array.isArray(value) && value.length === 0) {
      continue;
    }
    Object.assign(next, { [key]: value });
  }
  return next;
}

function isUsableGenreQuotaLabel(value: string): boolean {
  const normalized = value.toLowerCase().trim();
  return Boolean(normalized) &&
    !GENERIC_ADDITION_WORDS.has(normalized) &&
    !/\b(?:per artist|same artist|from each artist|by the same artist|exists?|exist|add|fill|round|bring|build|pump|extend|grow|total)\b/i.test(normalized) &&
    !/^than\b/i.test(normalized);
}

function cleanRequestedTrackFragment(value: string): string {
  return value.trim().replace(/^[,.;:!?]+|[,.;:!?]+$/g, "").trim();
}

function looksLikeRequestedCountPlaceholder(value: string): boolean {
  return /^(?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d+|some|few|couple)\s+(?:more\s+)?(?:songs?|tracks?)$/i.test(value.trim());
}

function normalizeClauseText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function trimClause(text: string): string {
  return text.replace(/^[,\s]+|[,\s]+$/g, "").trim();
}

const clauseSplitPattern = /\b(?:and then|then|after that|afterward|afterwards|once that's done|once that is done|once done|finally)\b|[.;\n]+/i;

function splitOrderedClauses(userMessage: string): DeterministicClause[] {
  const clauses: DeterministicClause[] = [];
  let remaining = userMessage;

  while (remaining.length > 0) {
    const match = remaining.match(clauseSplitPattern);
    if (!match || match.index == null) {
      const text = trimClause(remaining);
      if (text) {
        clauses.push({ text, sourceOrder: clauses.length, operations: [] });
      }
      break;
    }

    const before = trimClause(remaining.slice(0, match.index));
    if (before) {
      clauses.push({ text: before, sourceOrder: clauses.length, operations: [] });
    }
    remaining = remaining.slice(match.index + match[0].length);
  }

  return clauses.length > 0 ? clauses : [{ text: userMessage.trim(), sourceOrder: 0, operations: [] }];
}

function isConstraintDeclaration(userMessage: string): boolean {
  return /\badd(?:ing)?\s+(?:a\s+)?(?:constraint|rule)\b/i.test(userMessage) ||
    /\b(?:make|set)\s+(?:a\s+)?(?:constraint|rule)\b/i.test(userMessage);
}

function isEditSuggestionRequest(userMessage: string): boolean {
  return /\bsuggest\s+(?:cuts?|removals?|deletions?|drops?|edits?)\b/i.test(userMessage);
}

function parseShapeIntentStrength(userMessage: string): DeterministicShapeIntentStrength {
  const matchesShape = /\b(re-?order|reorganize|resequence|sequence|sequencing|flow|arc|act|acts|transition|transitions|group|cluster|arrange|rearrange|pace|pacing|energy curve|journey|narrative|retitle|title|name|describe|description|separate)\b/i.test(userMessage);
  if (!matchesShape) {
    return "none";
  }
  return /\b(re-?order|reorganize|resequence|sequence|sequencing|retitle|title|name|describe|description|separate|rearrange)\b/i.test(userMessage) ? "strong" : "advisory";
}

function parseTargetTotalTrackCount(userMessage: string): number | null {
  const match = userMessage.match(/\b(?:fill|round|bring|build|pump|extend|grow).{0,40}\b(?:to|out to|up to)\s*(\d+)\s*(?:total\s*)?(?:songs?|tracks?)?\b/i)
    ?? userMessage.match(/\b(?:to|at)\s*(\d+)\s*total\s*(?:songs?|tracks?)?\b/i)
    ?? userMessage.match(/\btotal\s+(?:of\s+)?(\d+)\s*(?:songs?|tracks?)\b/i);
  if (!match) {
    return null;
  }
  const value = Number.parseInt(match[1], 10);
  return Number.isFinite(value) ? Math.min(Math.max(value, 1), 20) : null;
}

function parseReplacementCount(userMessage: string): number | null {
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

function hasConstraintCleanupLanguage(userMessage: string): boolean {
  return /\b(remove|delete|drop|cut|prune|clear)\b/i.test(userMessage) ||
    /\bcuts\b/i.test(userMessage) ||
    /\btrim\b/i.test(userMessage) ||
    /\bget rid of\b/i.test(userMessage) ||
    /\b(?:keep|let'?s keep|lets keep|make sure|make|should be|must be|need(?:s)? to be)\b/i.test(userMessage);
}

function hasExistingTrackPrunableConstraint(constraints: PlaylistConstraints): boolean {
  return constraints.maxTracksPerArtist != null ||
    constraints.maxTrackDurationMs != null ||
    constraints.minTrackDurationMs != null ||
    constraints.allowExplicit === false ||
    (constraints.excludedArtists?.length ?? 0) > 0 ||
    (constraints.noMoreFromArtists?.length ?? 0) > 0 ||
    (constraints.excludedTerms?.length ?? 0) > 0 ||
    (constraints.excludedGenres?.length ?? 0) > 0 ||
    (constraints.noMoreFromGenres?.length ?? 0) > 0 ||
    (constraints.artistLimits?.length ?? 0) > 0 ||
    (constraints.genreLimits?.length ?? 0) > 0;
}

function hasPersistentVocalProfileLanguage(text: string): boolean {
  return /\b(?:only|all|exclusively|must be|should be)\b.{0,24}\b(?:female|women|woman|girl|male|men|man|boy|mixed|duet|instrumental|no vocals|without vocals|no singing)\b/i.test(text) ||
    /\b(?:female|women|woman|girl|male|men|man|boy|mixed|duet)\s+(?:vocals?|vocalists?|singers?|voices?)\b.{0,24}\b(?:only|exclusively)\b/i.test(text) ||
    /\b(?:instrumental|no vocals|without vocals|no singing)\s+only\b/i.test(text);
}

export function parseExplicitRequestedTracks(text: string): ParsedTrackLine[] {
  return splitOrderedClauses(text).flatMap((clause) => parseExplicitRequestedTrackClause(clause.text));
}

function parseExplicitRequestedTrackClause(text: string): ParsedTrackLine[] {
  const normalized = normalizeClauseText(text);
  if (!normalized || isConstraintDeclaration(normalized) || !/^add\b/i.test(normalized)) {
    return [];
  }

  // ponytail: exact-track parsing only applies to a single add clause, not a whole mixed prompt.
  if (containsRemoveIntent(normalized) || containsReplaceIntent(normalized) || containsExplicitReorderIntent(normalized) || containsAnalyzeIntent(normalized)) {
    return [];
  }

  const coveredByMatch = normalized.match(/\badd\s+(.+?)\s+covered by\s+(.+)$/i);
  if (coveredByMatch) {
    const title = cleanRequestedTrackFragment(coveredByMatch[1] ?? "");
    const artistSegments = (coveredByMatch[2] ?? "")
      .split(/\s+and\s+covered by\s+/i)
      .map((segment) => cleanRequestedTrackFragment(segment))
      .filter(Boolean);
    if (title && !looksLikeRequestedCountPlaceholder(title) && artistSegments.length > 0) {
      return artistSegments.map((artist) => ({ title, artist, album: null }));
    }
  }

  const byArtistMatch = normalized.match(/\badd\s+(.+?)\s+by\s+(.+)$/i);
  if (byArtistMatch) {
    const title = cleanRequestedTrackFragment(byArtistMatch[1] ?? "");
    const artist = cleanRequestedTrackFragment(byArtistMatch[2] ?? "");
    if (title && !looksLikeRequestedCountPlaceholder(title) && artist) {
      return [{ title, artist, album: null }];
    }
  }

  return [];
}

function containsAddIntent(text: string): boolean {
  if (/\b(?:too|bit|little)\s+hard\s+to\s+find\b/i.test(text) || /\beasier\s+to\s+find\b/i.test(text)) {
    return false;
  }
  if (/\b(?:without\b(?:.{0,40})?\badd(?:ing)?|not\s+add(?:ing)?|don't\s+add|do not\s+add|never\s+add)\b/i.test(text)) {
    return false;
  }
  return !isConstraintDeclaration(text) &&
    !isEditSuggestionRequest(text) && (
      /\b(?:add|adding|find|give me|recommend|suggest|fill|round out|build|pump|extend|grow)\b/i.test(text) ||
      /\bbring\b.{0,30}\b(?:to|up to)\s*\d+/i.test(text)
    );
}

function containsReplaceIntent(text: string): boolean {
  return /\b(replace|replacing|replacement|replacements|swap out|swap|trade out|substitute)\b/i.test(text);
}

function containsRemoveIntent(text: string): boolean {
  if (/\b(?:without\b(?:.{0,40})?\bremov(?:e|ing)|not\s+remov(?:e|ing)|don't\s+remove|do not\s+remove|never\s+remove)\b/i.test(text)) {
    return false;
  }
  return /\b(remove|removing|delete|drop|cut|cuts|prune|clear|trim)\b/i.test(text) || /\bget rid of\b/i.test(text);
}

function containsAnalyzeIntent(text: string): boolean {
  return /\b(review|analy[sz]e|critique|what(?:'s| is) working|what should happen next)\b/i.test(text);
}

function containsExplicitReorderIntent(text: string): boolean {
  return /\b(re-?order|reorganize|resequence|sequence|sequencing|arrange|rearrange|spread out|separate|cluster|group|move .*?(?:earlier|later|around))\b/i.test(text);
}

function inferClauseOperations(clause: string): DeterministicOperationKind[] {
  const matches: Array<{ index: number; kind: DeterministicOperationKind }> = [];
  const patterns: Array<[DeterministicOperationKind, RegExp]> = [
    ["analyze", /\b(review|analy[sz]e|critique|what(?:'s| is) working|what should happen next)\b/i],
    ["replace", /\b(replace|replacing|replacement|replacements|swap out|swap|trade out|substitute)\b/i],
    ["remove", /\b(remove|removing|delete|drop|cut|cuts|prune|clear|trim|get rid of)\b/i],
    ["add", /\b(?:add|adding|find|give me|recommend|suggest|fill|round out|build|pump|extend|grow)\b/i],
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

function emptyConstraintDraft(base: PlaylistConstraints = {}): PlaylistConstraints {
  return {
    ...base,
    excludedArtists: [...(base.excludedArtists ?? [])],
    noMoreFromArtists: [...(base.noMoreFromArtists ?? [])],
    artistLimits: [...(base.artistLimits ?? [])],
    requiredArtists: [...(base.requiredArtists ?? [])],
    requiredGenreAdditions: [...(base.requiredGenreAdditions ?? [])],
    excludedGenres: [...(base.excludedGenres ?? [])],
    noMoreFromGenres: [...(base.noMoreFromGenres ?? [])],
    genreLimits: [...(base.genreLimits ?? [])],
    notes: [...(base.notes ?? [])]
  };
}

function maybeAddRequiredGenreAddition(
  draft: PlaylistConstraints,
  matchedRules: Set<string>,
  scope: ConstraintScope,
  genre: string,
  count: number
): void {
  const normalizedGenre = genre.trim();
  if (!normalizedGenre || GENERIC_ADDITION_WORDS.has(normalizedGenre.toLowerCase())) {
    return;
  }
  if (parseNumber(normalizedGenre) != null) {
    return;
  }
  if (/\b(?:same artist|constraint|playlist|track(?:s)? that|song(?:s)? that|covered by|covers?\b|by\s+[a-z0-9])/i.test(normalizedGenre)) {
    return;
  }
  draft.requiredGenreAdditions?.push({ genre: normalizedGenre, count });
  matchedRules.add(`${scope}:requiredGenreAdditions`);
}

function extractConstraintsForScope(
  text: string,
  scope: ConstraintScope
): { constraints: PlaylistConstraints; matchedRules: string[] } {
  const draft = emptyConstraintDraft();
  const matchedRules = new Set<string>();
  const lowerText = text.toLowerCase();

  const bpmRange = lowerText.match(/\b(?:between|from)?\s*(\d{2,3})\s*(?:-|to|through|and)\s*(\d{2,3})\s*bpm\b/i)
    ?? lowerText.match(/\bbpm\s*(?:between|from)?\s*(\d{2,3})\s*(?:-|to|through|and)\s*(\d{2,3})\b/i);
  if (bpmRange) {
    const first = Number.parseInt(bpmRange[1], 10);
    const second = Number.parseInt(bpmRange[2], 10);
    draft.minBpm = Math.min(first, second);
    draft.maxBpm = Math.max(first, second);
    matchedRules.add(`${scope}:bpm`);
  } else {
    const targetBpm = lowerText.match(/\b(?:around|about|roughly|approximately|approx(?:\.)?)\s*(\d{2,3})\s*bpm\b/i)
      ?? lowerText.match(/\b(?:target|aim for)\s*(?:around|about|roughly|approximately|approx(?:\.)?)?\s*(\d{2,3})\s*bpm\b/i);
    if (targetBpm) {
      draft.targetBpm = Number.parseInt(targetBpm[1], 10);
      draft.targetBpmTolerance = defaultBpmTolerance(draft.targetBpm);
      matchedRules.add(`${scope}:bpm`);
    }
  }

  const minBpm = lowerText.match(/\b(?:at least|minimum|min(?:imum)?|over|above|more than)\s*(\d{2,3})\s*bpm\b/i);
  if (minBpm) {
    draft.minBpm = Number.parseInt(minBpm[1], 10);
    matchedRules.add(`${scope}:bpm`);
  }

  const maxBpm = lowerText.match(/\b(?:under|below|less than|no(?:thing)? over|no(?:thing)? above|maximum|max(?:imum)?)\s*(\d{2,3})\s*bpm\b/i);
  if (maxBpm) {
    draft.maxBpm = Number.parseInt(maxBpm[1], 10);
    matchedRules.add(`${scope}:bpm`);
  }

  if (hasPersistentVocalProfileLanguage(text)) {
    if (/\b(?:female|women|woman|girl)\b/i.test(text)) {
      draft.vocalProfile = "female_vocals";
    } else if (/\b(?:male|men|man|boy)\b/i.test(text)) {
      draft.vocalProfile = "male_vocals";
    } else if (/\b(?:mixed|duet|male and female|female and male)\b/i.test(text)) {
      draft.vocalProfile = "mixed_vocals";
    } else if (/\b(?:instrumental|no vocals|without vocals|no singing)\b/i.test(text)) {
      draft.vocalProfile = "instrumental";
    }
    if (draft.vocalProfile) {
      matchedRules.add(`${scope}:vocalProfile`);
    }
  }

  if (/\b(?:gradually|steadily)\s+(?:increase|increases|rise|rises|build|builds|climb|climbs)\s+(?:energy|intensity|momentum)\b/i.test(text) || /\b(?:energy|intensity|momentum)\s+(?:should|must|needs to)?\s*(?:gradually|steadily)?\s*(?:increase|increases|rise|rises|build|builds|climb|climbs)\b/i.test(text)) {
    draft.energyTrajectory = { ...(draft.energyTrajectory ?? {}), direction: "gradual_rise" };
  } else if (/\b(?:gradually|steadily)\s+(?:decrease|fall|cool|wind down)\s+(?:energy|intensity|momentum)\b/i.test(text)) {
    draft.energyTrajectory = { ...(draft.energyTrajectory ?? {}), direction: "gradual_fall" };
  }
  const peakTrack = text.match(/\bpeak(?:s|ing)?\s+(?:before|by|around|at)\s+track\s+(\d{1,3})\b/i)
    ?? text.match(/\b(?:climax|highest energy)\s+(?:before|by|around|at)\s+track\s+(\d{1,3})\b/i);
  if (peakTrack) {
    draft.energyTrajectory = { ...(draft.energyTrajectory ?? {}), peakTrackNumber: Number.parseInt(peakTrack[1], 10) };
  }
  if (/\b(?:hopeful|optimistic)\s+ending\b/i.test(text) || /\bend(?:s|ing)?\s+(?:hopeful|optimistic)\b/i.test(text)) {
    draft.energyTrajectory = { ...(draft.energyTrajectory ?? {}), ending: "hopeful" };
  } else if (/\b(?:cathartic|release)\s+ending\b/i.test(text) || /\bend(?:s|ing)?\s+(?:cathartic|with release)\b/i.test(text)) {
    draft.energyTrajectory = { ...(draft.energyTrajectory ?? {}), ending: "cathartic" };
  } else if (/\b(?:cooldown|cool down|soft landing)\s+ending\b/i.test(text)) {
    draft.energyTrajectory = { ...(draft.energyTrajectory ?? {}), ending: "cooldown" };
  }
  if (draft.energyTrajectory) {
    matchedRules.add(`${scope}:energyTrajectory`);
  }

  if (
    /\bcovers?\s+only\b/i.test(text) ||
    /\bonly\s+covers?\s+(?:are\s+)?allowed\b/i.test(text) ||
    /\b(?:all|strictly|exclusively|nothing but)\s+covers?\b/i.test(text) ||
    /\bonly\s+cover\s+(?:songs?|tracks?)\b/i.test(text)
  ) {
    draft.notes?.push("Only covers are allowed.");
    matchedRules.add(`${scope}:notes`);
  }

  const shorterThanMeansMinimum = /\b(?:no|nothing)\b.{0,30}\bshorter than\b/i.test(text);
  const maxDuration = text.match(/(?:(?:no|nothing|remove|delete|drop|cut|prune|clear).{0,40}(?:over|longer than|above|exceed(?:ing)?|more than)|(?:under|below|less than))\s*(\d+(?:\.\d+)?)\s*(minutes?|mins?|seconds?|secs?)/i)
    ?? (shorterThanMeansMinimum ? null : text.match(/\bshorter than\s*(\d+(?:\.\d+)?)\s*(minutes?|mins?|seconds?|secs?)/i));
  if (maxDuration) {
    draft.maxTrackDurationMs = toDurationMs(maxDuration[1], maxDuration[2]);
    matchedRules.add(`${scope}:trackDuration`);
  }
  const negatedUpperBound = /\b(?:no|nothing|remove|delete|drop|cut|prune|clear)\b.{0,40}\b(?:over|longer than|above|more than|exceed(?:ing)?)\b/i.test(text);
  const minDuration = text.match(/(?:(?:at least|minimum|min(?:imum)?|no shorter than)|(?:no|nothing).{0,30}shorter than).{0,12}(\d+(?:\.\d+)?)\s*(minutes?|mins?|seconds?|secs?)/i)
    ?? (negatedUpperBound ? null : text.match(/\b(?:over|longer than|above|more than|exceed(?:ing)?)\s*(\d+(?:\.\d+)?)\s*(minutes?|mins?|seconds?|secs?)/i));
  if (minDuration) {
    draft.minTrackDurationMs = toDurationMs(minDuration[1], minDuration[2]);
    matchedRules.add(`${scope}:trackDuration`);
  }

  const totalDuration = text.match(/\b(?:about|around|roughly|approximately|approx(?:\.)?)?\s*(\d+(?:\.\d+)?)\s*(minutes?|mins?|seconds?|secs?)\s+(?:playlist|mix|set)\b/i)
    ?? text.match(/\b(?:playlist|mix|set)\s+(?:of|around|about|roughly|approximately|approx(?:\.)?)\s*(\d+(?:\.\d+)?)\s*(minutes?|mins?|seconds?|secs?)\b/i);
  if (totalDuration) {
    draft.targetTotalDurationMs = toDurationMs(totalDuration[1], totalDuration[2]);
    draft.totalDurationToleranceMs = defaultTotalDurationToleranceMs(draft.targetTotalDurationMs);
    matchedRules.add(`${scope}:targetTotalDurationMs`);
  }

  for (const match of text.matchAll(/no more (?:songs?|tracks?) (?:by|from)\s+([A-Z0-9][\w '&.-]{1,60})/gi)) {
    draft.noMoreFromArtists?.push(match[1].trim());
    matchedRules.add(`${scope}:artistLimits`);
  }

  for (const match of text.matchAll(/(?:exclude|block|avoid|without|no)\s+([A-Z0-9][\w '&.-]{1,60})/gi)) {
    const artist = match[1]
      .replace(/\s+(?:songs?|tracks?)$/i, "")
      .replace(/\s+for this (?:pass|batch|request|round|one)$/i, "")
      .replace(/\s+(?:this (?:time|pass|batch|request|round) only)$/i, "")
      .trim();
    if (artist.split(/\s+/).length <= 5 && !/\b(?:more than|repeated|same artist|covers?)\b/i.test(artist)) {
      draft.excludedArtists?.push(artist);
      matchedRules.add(`${scope}:excludedArtists`);
    }
  }

  for (const match of text.matchAll(/only\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:total\s+)?(?:songs?|tracks?)\s+by\s+([A-Z0-9][\w '&.-]{1,60})/gi)) {
    const count = parseNumber(match[1]);
    if (count != null) {
      draft.artistLimits?.push({ artist: match[2].trim(), maxTotalTracks: count });
      matchedRules.add(`${scope}:artistLimits`);
    }
  }

  const perArtistLimit = text.matchAll(/(?:only|at most|no more than|max(?:imum)?)\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:total\s+)?(?:songs?|tracks?)?\s*per artist/gi);
  for (const match of perArtistLimit) {
    const count = parseNumber(match[1]);
    if (count != null) {
      draft.maxTracksPerArtist = count;
      matchedRules.add(`${scope}:maxTracksPerArtist`);
    }
  }
  const sameArtistLimit = text.matchAll(/(?:only|at most|no more than|max(?:imum)?)\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:total\s+)?(?:songs?|tracks?)?\s+by\s+the\s+same\s+artist\b/gi);
  for (const match of sameArtistLimit) {
    const count = parseNumber(match[1]);
    if (count != null) {
      draft.maxTracksPerArtist = count;
      matchedRules.add(`${scope}:maxTracksPerArtist`);
    }
  }
  const limitThisToPerArtist = text.matchAll(/(?:limit|cap)\s+(?:this|it|the playlist)?\s*(?:to\s+)?(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:total\s+)?(?:songs?|tracks?)?\s*(?:per artist|from each artist)/gi);
  for (const match of limitThisToPerArtist) {
    const count = parseNumber(match[1]);
    if (count != null) {
      draft.maxTracksPerArtist = count;
      matchedRules.add(`${scope}:maxTracksPerArtist`);
    }
  }
  if (/\b(?:one|1)\s+(?:song|track)\s+per artist\b/i.test(text) || /\bno\s+(?:artist\s+)?repeats\b/i.test(text) || /\bno repeated artists\b/i.test(text)) {
    draft.maxTracksPerArtist = 1;
    matchedRules.add(`${scope}:maxTracksPerArtist`);
  }

  for (const clause of splitOrderedClauses(text)) {
    for (const match of clause.text.matchAll(/(?:add|adding|find|give me|recommend|suggest|include|bring in)\s+(?:me\s+)?(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|a|an|some|few|couple)?\s*(?:more\s+)?(?:songs?|tracks?)?\s*(?:by|from)\s+([A-Z0-9][\w '&.-]{1,60})/gi)) {
      draft.requiredArtists?.push(match[1].trim());
      matchedRules.add(`${scope}:requiredArtists`);
    }

    for (const match of clause.text.matchAll(/(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|some|few|couple)\s+(?:songs?|tracks?)\s+by\s+([A-Z0-9][\w '&.-]{1,60})/gi)) {
      draft.requiredArtists?.push(match[1].trim());
      matchedRules.add(`${scope}:requiredArtists`);
    }

    if (containsAddIntent(clause.text) && parseExplicitRequestedTrackClause(clause.text).length === 0) {
      for (const match of clause.text.matchAll(/add\s+(?:a\s+)?(\d+|one|two|couple|three|four|five)?\s*(?:more\s+)?([\w -]{2,40})\s+(?:songs?|tracks?)\b/gi)) {
        const count = parseNumber(match[1] || "one") ?? 1;
        const genre = match[2].replace(/\bmore\b/gi, "").trim();
        maybeAddRequiredGenreAddition(draft, matchedRules, scope, genre, count);
      }
    }

    for (const match of clause.text.matchAll(/(?:songs?|tracks?)\s+(?:should|must|need to|have to)\s+be\s+([a-z0-9 /&'.-]{2,40}?)(?=\s+(?:and|but|under|over|with|for)\b|[,.!?]|$)/gi)) {
      maybeAddRequiredGenreAddition(draft, matchedRules, scope, match[1].trim(), 1);
    }
  }

  for (const match of text.matchAll(/no more\s+([\w -]{2,40})(?:\s+songs?|\s+tracks?)?/gi)) {
    const genre = match[1].trim();
    if (genre && !/songs? by|tracks? by/i.test(match[0]) && isUsableGenreQuotaLabel(genre)) {
      draft.noMoreFromGenres?.push(genre);
      matchedRules.add(`${scope}:genreLimits`);
    }
  }
  for (const match of text.matchAll(/only\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:total\s+)?([\w -]{2,40})\s+(?:songs?|tracks?)/gi)) {
    const count = parseNumber(match[1]);
    const genre = match[2].trim();
    if (count != null && isUsableGenreQuotaLabel(genre)) {
      draft.genreLimits?.push({ genre, maxTotalTracks: count });
      matchedRules.add(`${scope}:genreLimits`);
    }
  }
  for (const match of text.matchAll(/(?:there\s+should\s+)?only\s+be\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+([\w -]{2,40})\s+(?:songs?|tracks?)/gi)) {
    const count = parseNumber(match[1]);
    const genre = match[2].trim();
    if (count != null && isUsableGenreQuotaLabel(genre)) {
      draft.genreLimits?.push({ genre, maxTotalTracks: count });
      matchedRules.add(`${scope}:genreLimits`);
    }
  }

  draft.excludedArtists = unique(draft.excludedArtists);
  draft.noMoreFromArtists = unique(draft.noMoreFromArtists);
  draft.requiredArtists = unique(draft.requiredArtists);
  draft.excludedGenres = unique(draft.excludedGenres);
  draft.noMoreFromGenres = unique(draft.noMoreFromGenres);
  draft.notes = unique(draft.notes);

  return {
    constraints: compactConstraints(draft),
    matchedRules: [...matchedRules]
  };
}

function pickConstraintUpdates(constraints: PlaylistConstraints): PlaylistConstraints {
  return constraints;
}

function pickGuidanceUpdates(constraints: PlaylistConstraints): PlaylistConstraints {
  return constraints;
}

export function parseDeterministicRequest(
  userMessage: string,
  currentConstraints: PlaylistConstraints = {}
): DeterministicRequestParse {
  const normalizedMessage = normalizeClauseText(userMessage);
  const explicitTrackRequests = parseExplicitRequestedTracks(userMessage);
  const clauses = splitOrderedClauses(userMessage).map((clause) => ({
    ...clause,
    operations: inferClauseOperations(clause.text)
  }));
  const scopeSignals = {
    persistent: /\b(from here on|going forward|always|keep this rule|keep that rule|lasting rule|make that permanent|persist(?:ent)?)\b/i.test(userMessage),
    requestScoped: /\b(for this batch|this batch|this time|just for these|for now|for this pass|for these additions|one[- ]shot)\b/i.test(userMessage)
  };

  const scope: ConstraintScope = scopeSignals.requestScoped && !scopeSignals.persistent ? "requestScoped" : "persistent";
  const scopedExtraction = extractConstraintsForScope(userMessage, scope);
  const deterministicConstraints = emptyConstraintDraft(currentConstraints);
  Object.assign(deterministicConstraints, scopedExtraction.constraints);
  deterministicConstraints.excludedArtists = unique([...(currentConstraints.excludedArtists ?? []), ...(scopedExtraction.constraints.excludedArtists ?? [])]);
  deterministicConstraints.noMoreFromArtists = unique([...(currentConstraints.noMoreFromArtists ?? []), ...(scopedExtraction.constraints.noMoreFromArtists ?? [])]);
  deterministicConstraints.artistLimits = [...(currentConstraints.artistLimits ?? []), ...(scopedExtraction.constraints.artistLimits ?? [])];
  deterministicConstraints.requiredGenreAdditions = [...(currentConstraints.requiredGenreAdditions ?? []), ...(scopedExtraction.constraints.requiredGenreAdditions ?? [])];
  deterministicConstraints.excludedGenres = unique([...(currentConstraints.excludedGenres ?? []), ...(scopedExtraction.constraints.excludedGenres ?? [])]);
  deterministicConstraints.noMoreFromGenres = unique([...(currentConstraints.noMoreFromGenres ?? []), ...(scopedExtraction.constraints.noMoreFromGenres ?? [])]);
  deterministicConstraints.genreLimits = [...(currentConstraints.genreLimits ?? []), ...(scopedExtraction.constraints.genreLimits ?? [])];
  deterministicConstraints.notes = unique([...(currentConstraints.notes ?? []), ...(scopedExtraction.constraints.notes ?? [])]);

  const operationSignals: DeterministicOperationSignals = {
    addition: clauses.some((clause) => clause.operations.includes("add")) || explicitTrackRequests.length > 0,
    removal: clauses.some((clause) => clause.operations.includes("remove")) || /\bsuggest\s+cuts\b/i.test(userMessage),
    replacement: clauses.some((clause) => clause.operations.includes("replace")),
    reorder: clauses.some((clause) => clause.operations.includes("reorder")),
    analyze: clauses.some((clause) => clause.operations.includes("analyze")),
    shapeStrength: parseShapeIntentStrength(userMessage),
    mixedEditAndGeneration: false
  };
  operationSignals.mixedEditAndGeneration = (operationSignals.addition || operationSignals.replacement) &&
    (operationSignals.removal || operationSignals.reorder);

  const constraintsForPruning = deterministicConstraints;
  const cleanupSignals = {
    conversationalOnly: /^(?:hi|hello|hey|yo|sup|thanks|thank you|ok|okay)[\s!.?]*$/i.test(normalizedMessage),
    versionCleanup: /\b(version|versions|alternate|alternates|duplicate|duplicates|same track)\b/i.test(userMessage) &&
      /\b(keep|best|remove|replace|replacements)\b/i.test(userMessage),
    shouldPruneExistingForConstraints: constraintsForPruning.maxTracksPerArtist != null &&
      (/\b(?:make|only|one|1|per artist|no repeated artists|no artist repeats|no repeats)\b/i.test(userMessage) || operationSignals.addition) ||
      (!operationSignals.addition && !operationSignals.replacement && hasConstraintCleanupLanguage(userMessage) && hasExistingTrackPrunableConstraint(constraintsForPruning))
  };

  const persistentConstraints = scope === "persistent" ? scopedExtraction.constraints : {};
  const requestScopedConstraints = scope === "requestScoped" ? scopedExtraction.constraints : {};
  const shouldDefaultRequiredArtistsToRequestScope = !scopeSignals.persistent && !scopeSignals.requestScoped;

  if (shouldDefaultRequiredArtistsToRequestScope && scopedExtraction.constraints.requiredArtists?.length) {
    const requestScopedRequiredArtists = [...scopedExtraction.constraints.requiredArtists];
    delete persistentConstraints.requiredArtists;
    requestScopedConstraints.requiredArtists = requestScopedRequiredArtists;
  }

  return {
    constraintUpdates: pickConstraintUpdates(scopedExtraction.constraints),
    guidanceUpdates: pickGuidanceUpdates(scopedExtraction.constraints),
    deterministicConstraints,
    deterministicPersistentConstraints: persistentConstraints,
    deterministicRequestScopedConstraints: requestScopedConstraints,
    explicitTrackRequests,
    operationSignals,
    countSignals: {
      requestedAddCount: explicitTrackRequests.length > 0 ? explicitTrackRequests.length : parseRequestedTrackCount(userMessage),
      replacementCount: parseReplacementCount(userMessage),
      targetTotalTrackCount: parseTargetTotalTrackCount(userMessage)
    },
    scopeSignals,
    sequencingSignals: { clauses },
    cleanupSignals,
    discoveryRadiusOverride: parseDiscoveryRadiusOverride(userMessage),
    matchedRules: scopedExtraction.matchedRules
  };
}

export { parseReplacementCount, parseTargetTotalTrackCount };
