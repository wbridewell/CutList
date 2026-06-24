import { reviewPromptForComposerRequest, splitMixedComposerRequest } from "@/lib/playlist/requestRouting";
import { resolveOperatorPlan } from "@/lib/ai/services/operatorPlanner";
import type { CuratorRunOptions } from "@/lib/ai/curatorTypes";
import type { PlaylistState, ResolvedOperatorPlan, ResolvedUserRequestPlan } from "@/types/playlist";

function operationFromOperatorPlan(plan: ResolvedOperatorPlan): ResolvedUserRequestPlan["operation"] {
  if (plan.routeFamily === "review") {
    return "review";
  }
  if (plan.routeFamily === "import") {
    return "import_tracks";
  }
  if (plan.routeFamily === "conversational") {
    return "conversational";
  }
  if (plan.operators.some((operator) => operator.kind === "replace_tracks")) {
    return "replace";
  }
  if (plan.operators.some((operator) => operator.kind === "remove_tracks")) {
    return "remove";
  }
  if (plan.operators.some((operator) => operator.kind === "resequence_tracks")) {
    return "reorder";
  }
  return "generate";
}

function operationPlanKindFromOperatorPlan(plan: ResolvedOperatorPlan): ResolvedUserRequestPlan["operationPlan"]["kind"] {
  if (plan.routeFamily === "review") {
    return "review_only";
  }
  if (plan.routeFamily === "import") {
    return "import_only";
  }
  if (plan.routeFamily === "conversational") {
    return "conversational_only";
  }
  return "curator_only";
}

function adaptOperatorPlan(plan: ResolvedOperatorPlan, userMessage: string): ResolvedUserRequestPlan {
  const reviewPrompt = reviewPromptForComposerRequest(userMessage);
  const mixedPromptParts = splitMixedComposerRequest(userMessage);
  const isMixedCompatibilityCase = plan.routeFamily === "curator" &&
    plan.executionPolicy === "mutating" &&
    plan.deterministicSignals.hasMixedIntent &&
    mixedPromptParts.reviewPrompt.trim().length > 0 &&
    mixedPromptParts.curatorPrompt.trim().length > 0 &&
    mixedPromptParts.reviewPrompt.trim() !== mixedPromptParts.curatorPrompt.trim();
  const routingNotes: ResolvedUserRequestPlan["routingNotes"] = [];
  if (plan.deterministicSignals.hasPastedTracks) {
    routingNotes.push("pasted_tracks_detected");
  }
  if (plan.executionPolicy === "read_only" && plan.deterministicSignals.hasNonModificationDirective) {
    routingNotes.push("explicit_non_modification_directive");
  }
  if (plan.executionPolicy === "read_only" && plan.planningNotes.some((note) => note.includes("Review button forces read-only."))) {
    routingNotes.push("review_button_forces_read_only");
  }
  if (plan.routeFamily === "review" && plan.planningNotes.some((note) => note.includes("fallback"))) {
    routingNotes.push("lexical_review_request");
  }
  routingNotes.push(plan.planningNotes.some((note) => note.includes("fallback")) ? "llm_router_fallback" : "llm_router_succeeded");

  return {
    routeFamily: plan.routeFamily,
    executionPolicy: plan.executionPolicy,
    operation: operationFromOperatorPlan(plan),
    reviewMode: plan.reviewMode,
    operationPlan: {
      kind: isMixedCompatibilityCase ? "mixed_review_and_curator" : operationPlanKindFromOperatorPlan(plan),
      reviewPrompt: plan.routeFamily === "review"
        ? reviewPrompt
        : isMixedCompatibilityCase
          ? mixedPromptParts.reviewPrompt
          : null,
      curatorPrompt: plan.routeFamily === "curator"
        ? (isMixedCompatibilityCase ? mixedPromptParts.curatorPrompt : userMessage)
        : null
    },
    normalizedIntent: plan.normalizedIntent,
    deterministicSignals: plan.deterministicSignals,
    confidence: plan.confidence,
    routingNotes,
    instructionIntentStatus: plan.instructionIntentStatus
  };
}

export async function resolveUserRequestPlan(
  playlist: PlaylistState,
  userMessage: string,
  options: CuratorRunOptions & { forceReadOnly?: boolean } = {}
): Promise<ResolvedUserRequestPlan> {
  return adaptOperatorPlan(await resolveOperatorPlan(playlist, userMessage, options), userMessage);
}
