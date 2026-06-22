import { attemptLlmContract } from "@/lib/ai/services/llmService";
import { curatorStepPlanPrompt } from "@/lib/ai/prompts";
import type { DeterministicClause } from "@/lib/ai/services/deterministicRequestParser";
import { getLLMProvider } from "@/lib/ai/llmClient";
import type { CuratorRunOptions } from "@/lib/ai/curatorTypes";
import type { CuratorHeuristicSignals } from "@/lib/ai/services/curatorRequestIntent";
import type { NormalizedInstructionIntent } from "@/lib/ai/services/instructionIntent";
import type { CuratorPlannedStep, ParsedTrackRows, ResolvedOperation } from "@/lib/ai/services/workflowTypes";
import type { PlaylistState } from "@/types/playlist";

const clauseSplitPattern = /\b(?:and then|then|after that|afterward|afterwards|once that's done|once that is done|once done|finally)\b|[.;\n]+/i;

type Clause = {
  text: string;
  start: number;
};

function trimClause(text: string): string {
  return text.replace(/^[,\s]+|[,\s]+$/g, "").trim();
}

function splitClauses(userMessage: string): Clause[] {
  const clauses: Clause[] = [];
  let start = 0;
  let remaining = userMessage;
  let baseOffset = 0;

  while (remaining.length > 0) {
    const match = remaining.match(clauseSplitPattern);
    if (!match || match.index == null) {
      const text = trimClause(remaining);
      if (text) {
        clauses.push({ text, start: baseOffset });
      }
      break;
    }

    const before = trimClause(remaining.slice(0, match.index));
    if (before) {
      clauses.push({ text: before, start: baseOffset });
    }
    const consumed = match.index + match[0].length;
    baseOffset += consumed;
    remaining = remaining.slice(consumed);
    start += consumed;
  }

  return clauses.length > 0 ? clauses : [{ text: userMessage.trim(), start: 0 }];
}

function containsImportText(parsedTracks: ParsedTrackRows): boolean {
  return parsedTracks.length > 0;
}

function containsAnalyzeIntent(text: string): boolean {
  return /\b(review|analy[sz]e|critique|what(?:'s| is) working|what should happen next)\b/i.test(text);
}

function containsExplicitReorderIntent(text: string): boolean {
  return /\b(re-?order|reorganize|resequence|sequence|sequencing|arrange|rearrange|spread out|separate|cluster|group|move .*?(?:earlier|later|around))\b/i.test(text);
}

function containsAddIntent(text: string): boolean {
  if (/\b(?:too|bit|little)\s+hard\s+to\s+find\b/i.test(text) || /\beasier\s+to\s+find\b/i.test(text)) {
    return false;
  }
  if (/\b(?:without\b(?:.{0,40})?\badd(?:ing)?|not\s+add(?:ing)?|don't\s+add|do not\s+add|never\s+add)\b/i.test(text)) {
    return false;
  }
  return !/\badd(?:ing)?\s+(?:a\s+)?(?:constraint|rule)\b/i.test(text) &&
    !/\bsuggest\s+(?:cuts?|removals?|deletions?|drops?|edits?)\b/i.test(text) && (
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

function summarizeIntent(intent: NormalizedInstructionIntent, heuristics: CuratorHeuristicSignals): string {
  return JSON.stringify({
    operationType: intent.operationType,
    requestedAddCount: intent.requestedAddCount ?? heuristics.counts.requestedAddCount,
    targetTotalTrackCount: intent.targetTotalTrackCount ?? heuristics.counts.targetTotalTrackCount,
    replacementCount: intent.replacementCount ?? heuristics.counts.replacementCount,
    persistentVerifiedRules: intent.persistentVerifiedRules,
    requestScopedVerifiedRules: intent.requestScopedVerifiedRules,
    persistentGuidance: intent.persistentGuidance,
    requestScopedGuidance: intent.requestScopedGuidance
  });
}

function inferClauseOperations(clause: string): Array<Exclude<CuratorPlannedStep["kind"], "update_rules" | "metadata" | "import">> {
  const matches: Array<{ index: number; kind: Exclude<CuratorPlannedStep["kind"], "update_rules" | "metadata" | "import"> }> = [];

  const patterns: Array<[Exclude<CuratorPlannedStep["kind"], "update_rules" | "metadata" | "import">, RegExp]> = [
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

function sortAndNormalizeSteps(steps: CuratorPlannedStep[]): CuratorPlannedStep[] {
  return steps
    .sort((first, second) => first.sourceOrder - second.sourceOrder)
    .map((step, index) => ({
      ...step,
      id: `step-${index + 1}-${step.kind}`,
      sourceOrder: index
    }));
}

function heuristicStepPlan(input: {
  playlist: PlaylistState;
  userMessage: string;
  parsedTracks: ParsedTrackRows;
  deterministicClauseHints?: DeterministicClause[];
  normalizedIntent: NormalizedInstructionIntent;
  heuristics: CuratorHeuristicSignals;
  requestedAddCount: number | null;
  targetTotalTrackCount: number | null;
  replacementCount: number | null;
  hasRuleChanges: boolean;
}): CuratorPlannedStep[] {
  if (containsImportText(input.parsedTracks)) {
    return [{
      id: "step-1-import",
      kind: "import",
      sourceOrder: 0,
      originText: input.userMessage,
      dependsOnStepIds: [],
      planningNotes: ["Detected pasted track rows."]
    }];
  }

  const clauses = input.deterministicClauseHints?.length
    ? input.deterministicClauseHints.map((clause) => ({ text: clause.text, start: clause.sourceOrder }))
    : splitClauses(input.userMessage);
  const steps: CuratorPlannedStep[] = [];
  let order = 0;

  if (input.hasRuleChanges) {
    steps.push({
      id: "step-rules",
      kind: "update_rules",
      sourceOrder: order++,
      originText: input.userMessage,
      dependsOnStepIds: [],
      planningNotes: ["Apply extracted verified rules and curator guidance before dependent execution."]
    });
  }

  for (const clause of clauses) {
    const hintedKinds = input.deterministicClauseHints?.find((hint) => hint.text === clause.text)?.operations;
    const kinds = (hintedKinds?.length ? hintedKinds : inferClauseOperations(clause.text)) as Array<Exclude<CuratorPlannedStep["kind"], "update_rules" | "metadata" | "import">>;
    if (kinds.length === 0) {
      continue;
    }
    for (const kind of kinds) {
      if (kind === "reorder" && containsAddIntent(clause.text) && !/\bthen\b/i.test(input.userMessage) && clauses.length === 1) {
        continue;
      }
      steps.push({
        id: `step-${order + 1}-${kind}`,
        kind,
        sourceOrder: order++,
        originText: clause.text,
        dependsOnStepIds: [],
        planningNotes: [],
        requestedAddCount: kind === "add" ? input.requestedAddCount : null,
        targetTotalTrackCount: kind === "add" ? input.targetTotalTrackCount : null,
        replacementCount: kind === "replace" ? input.replacementCount : null
      });
    }
  }

  if (!steps.some((step) => step.kind !== "update_rules")) {
    const looksRuleOnly = input.hasRuleChanges &&
      input.normalizedIntent.operationType === "other" &&
      !input.heuristics.operation.addition &&
      !input.heuristics.operation.removal &&
      !input.heuristics.operation.replacement &&
      input.heuristics.operation.shapeStrength === "none";
    if (looksRuleOnly) {
      return sortAndNormalizeSteps(steps);
    }
    const fallbackKind: CuratorPlannedStep["kind"] = input.normalizedIntent.operationType === "replace" || input.heuristics.operation.replacement
      ? "replace"
      : input.normalizedIntent.operationType === "remove" || input.heuristics.operation.removal
        ? "remove"
        : input.normalizedIntent.operationType === "reorder"
          ? "reorder"
          : input.normalizedIntent.operationType === "analyze"
            ? "analyze"
            : "add";
    steps.push({
      id: "step-1-fallback",
      kind: fallbackKind,
      sourceOrder: order,
      originText: input.userMessage,
      dependsOnStepIds: input.hasRuleChanges ? ["step-rules"] : [],
      planningNotes: ["Heuristic fallback plan."],
      requestedAddCount: fallbackKind === "add" ? input.requestedAddCount : null,
      targetTotalTrackCount: fallbackKind === "add" ? input.targetTotalTrackCount : null,
      replacementCount: fallbackKind === "replace" ? input.replacementCount : null
    });
  }

  return sortAndNormalizeSteps(steps);
}

function requiresLlmPlanner(steps: CuratorPlannedStep[], userMessage: string): boolean {
  const nonRuleSteps = steps.filter((step) => step.kind !== "update_rules");
  if (nonRuleSteps.length <= 2) {
    return false;
  }
  if (splitClauses(userMessage).length > 1) {
    return false;
  }
  if (/\b(?:then|after that|afterward|afterwards|before|finally|once that's done)\b/i.test(userMessage)) {
    return false;
  }
  return true;
}

function allowedOperationForStepKind(kind: CuratorPlannedStep["kind"]): ResolvedOperation {
  switch (kind) {
    case "remove":
      return "remove";
    case "replace":
      return "replace";
    case "reorder":
      return "reorder";
    case "import":
      return "import_tracks";
    case "analyze":
      return "conversational";
    case "update_rules":
    case "metadata":
    case "add":
    default:
      return "generate";
  }
}

export async function buildCuratorStepPlan(input: {
  playlist: PlaylistState;
  userMessage: string;
  parsedTracks: ParsedTrackRows;
  deterministicClauseHints?: DeterministicClause[];
  normalizedIntent: NormalizedInstructionIntent;
  heuristics: CuratorHeuristicSignals;
  requestedAddCount: number | null;
  targetTotalTrackCount: number | null;
  replacementCount: number | null;
  hasRuleChanges: boolean;
  conversationContext?: CuratorRunOptions["conversationContext"];
}, options: CuratorRunOptions = {}): Promise<{
  steps: CuratorPlannedStep[];
  primaryOperation: ResolvedOperation;
  debugNotes: string[];
}> {
  const heuristicSteps = heuristicStepPlan(input);
  const debugNotes = [`Heuristic plan produced ${heuristicSteps.length} step(s).`];

  if (getLLMProvider() !== "none" && requiresLlmPlanner(heuristicSteps, input.userMessage)) {
    options.onProgress?.({ stage: "resolving", message: "Planning the ordered workflow." });
    const attempt = await attemptLlmContract<{ steps: CuratorPlannedStep[] }>(
      "curatorStepPlan",
      curatorStepPlanPrompt(input.playlist, input.userMessage, {
        conversationContext: input.conversationContext,
        normalizedIntentSummary: summarizeIntent(input.normalizedIntent, input.heuristics)
      }),
      { signal: options.signal }
    );
    if (attempt.status !== "fallback" && attempt.parsed.steps.length > 0) {
      const normalized = sortAndNormalizeSteps(attempt.parsed.steps);
      const primaryStep = normalized.find((step) => step.kind !== "update_rules");
      debugNotes.push(`LLM planner produced ${normalized.length} step(s).`);
      return {
        steps: normalized,
        primaryOperation: primaryStep ? allowedOperationForStepKind(primaryStep.kind) : "conversational",
        debugNotes
      };
    }
    if (attempt.status === "fallback") {
      debugNotes.push(`LLM planner fallback: ${attempt.reason}.`);
    }
  }

  return {
    steps: heuristicSteps,
    primaryOperation: heuristicSteps.find((step) => step.kind !== "update_rules")
      ? allowedOperationForStepKind(heuristicSteps.find((step) => step.kind !== "update_rules")!.kind)
      : "conversational",
    debugNotes
  };
}
