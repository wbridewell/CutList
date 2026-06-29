import { attemptLlmContract } from "@/lib/ai/services/llmService";
import { curatorStepPlanPrompt } from "@/lib/ai/prompts";
import type { DeterministicClause } from "@/lib/ai/services/deterministicRequestParser";
import { getLLMProvider } from "@/lib/ai/llmClient";
import type { CuratorRunOptions } from "@/lib/ai/curatorTypes";
import type { CuratorHeuristicSignals } from "@/lib/ai/services/curatorRequestIntent";
import type { NormalizedInstructionIntent } from "@/lib/ai/services/instructionIntent";
import { resolveNamedTrack } from "@/lib/playlist/requestPlacement";
import {
  containsAddIntent,
  inferLexedClauseOperations,
  parsePlacementSubjectQuery,
  splitOrderedClauses
} from "@/lib/playlist/requestLexing";
import type { CuratorPlannedStep, ParsedTrackRows, ResolvedOperation } from "@/lib/ai/services/workflowTypes";
import type { PlaylistState } from "@/types/playlist";

type Clause = {
  text: string;
  start: number;
};

function trimClause(text: string): string {
  return text.replace(/^[,\s]+|[,\s]+$/g, "").trim();
}

function splitClauses(userMessage: string): Clause[] {
  return splitOrderedClauses(userMessage).map((clause) => ({
    text: trimClause(clause.text),
    start: clause.sourceOrder
  }));
}

function containsImportText(parsedTracks: ParsedTrackRows): boolean {
  return parsedTracks.length > 0;
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
  return inferLexedClauseOperations(clause) as Array<Exclude<CuratorPlannedStep["kind"], "update_rules" | "metadata" | "import">>;
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
    const placementSubject = parsePlacementSubjectQuery(clause.text);
    const placementSubjectMatch = placementSubject ? resolveNamedTrack(input.playlist, placementSubject) : null;
    if (kinds.length === 0) {
      continue;
    }
    for (const kind of kinds) {
      if (kind === "reorder" && containsAddIntent(clause.text) && !/\bthen\b/i.test(input.userMessage) && clauses.length === 1) {
        continue;
      }
      const effectiveKind = kind === "add" &&
        placementSubjectMatch?.trackId &&
        (placementSubjectMatch.resolution === "exact" || placementSubjectMatch.resolution === "fuzzy")
        ? "reorder"
        : kind;
      steps.push({
        id: `step-${order + 1}-${effectiveKind}`,
        kind: effectiveKind,
        sourceOrder: order++,
        originText: clause.text,
        dependsOnStepIds: [],
        planningNotes: effectiveKind === "reorder" && kind === "add"
          ? [`Directed placement matched existing track "${placementSubjectMatch?.artist} - ${placementSubjectMatch?.title}", so the step was treated as a reorder.`]
          : [],
        requestedAddCount: effectiveKind === "add" ? input.requestedAddCount : null,
        targetTotalTrackCount: effectiveKind === "add" ? input.targetTotalTrackCount : null,
        replacementCount: effectiveKind === "replace" ? input.replacementCount : null
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
