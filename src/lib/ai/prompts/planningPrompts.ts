import { getLlmContract, returnJsonShapeGuidance } from "@/lib/ai/contracts";
import { instructionConstraintGuidance } from "@/lib/playlist/constraints/promptGuidance";
import { buildPromptEnvelope } from "@/lib/ai/prompts/promptBuilder";
import type { ConversationContext, PlaylistState } from "@/types/playlist";
import { conversationContextGuidance, strongContinuityGuidance } from "./guidance";
import { curatorVoiceGuidance } from "./persona";

export function instructionIntentPrompt(
  playlist: PlaylistState,
  userMessage: string,
  options: { conversationContext?: ConversationContext } = {}
): string {
  const contract = getLlmContract("instructionIntent");
  return buildPromptEnvelope([
    "Parse this playlist chat instruction into structured intent for The CutList.",
    returnJsonShapeGuidance(contract),
    ...contract.safetyGuidance,
    "Return every top-level key exactly once. Do not omit operationIntent, verifiedRules, curatorGuidance, routingIntent, scopeIntent, or notes.",
    "When a branch has no values, return an empty object for it. When a scope list has no fields, return [].",
    "Use operationIntent.type = \"reorder\" when the user asks to sequence, order, reorder, retitle, name, describe, or create an arc for the existing playlist without asking for new songs.",
    "Also use operationIntent.type = \"reorder\" for existing-playlist shaping requests such as grouping similar tracks, clustering genres, improving flow, smoothing transitions, changing pacing, shaping an energy curve, or placing high-energy/release/redemption moments in a narrative act.",
    "Use operationIntent.type = \"replace\" when the user wants existing tracks swapped out and replaced with new verified additions.",
    "When the user combines shaping language with additions, removals, or replacements, prefer add, remove, or replace as operationIntent.type and leave sequencing needs in notes instead of collapsing the whole request into reorder.",
    "Use routingIntent.routeFamily = \"review\" for diagnosis, critique, structural-problem, or non-mutating editorial requests about an existing playlist.",
    "Use routingIntent.routeFamily = \"curator\" for mutating add/remove/replace/reorder requests, \"import\" for pasted track lists, and \"conversational\" for non-execution chat that should not change the playlist.",
    "Set routingIntent.allowMutation = false when the user explicitly says not to modify, change, edit, or mutate the playlist, even if they also mention sequencing or other edit language.",
    "Set routingIntent.diagnosisOnly = true for focused review requests that should diagnose a problem without carrying out edits.",
    "Set routingIntent.hypotheticalOnly = true when edit language is being discussed as advice or diagnosis rather than as an instruction to execute.",
    "When routingIntent.routeFamily = \"review\", set routingIntent.reviewMode to the narrowest fitting review output: full_critique, diagnose_only, weak_links_only, focused_transition_repair, bridge_options_only, compression_review, ending_repair, or sequencing_only.",
    "Use routingIntent.reviewMode = focused_transition_repair when the user names a specific transition or handoff to repair, especially when they ask for bridge tracks without removing or reordering.",
    "Use routingIntent.reviewMode = weak_links_only when the user asks which tracks weaken, dilute, fracture, or undermine the playlist.",
    "Use routingIntent.reviewMode = diagnose_only when the user asks for the single biggest problem or a focused diagnosis rather than a rewrite.",
    "Use routingIntent.reviewMode = compression_review only for explicit compression or cutting requests framed as review rather than execution.",
    "Separate verified backend-checkable rules into verifiedRules and softer preference language into curatorGuidance.",
    "Use scopeIntent to mark which verifiedRules or curatorGuidance fields should persist after this request versus apply only for this request.",
    "requestedTrackCount means how many tracks to add now. targetTotalTrackCount means the desired playlist length after the request. replaceCount means how many existing tracks should be swapped out.",
    "Examples:",
    "- \"add 3 warm songs, but keep no explicit tracks as a lasting rule\" => operationIntent.type = \"add\"; operationIntent.requestedTrackCount = 3; put allowExplicit in verifiedRules; put allowExplicit in scopeIntent.persistentVerifiedRuleFields; keep warmth language in curatorGuidance and scopeIntent.requestScopedGuidanceFields unless the user says it should last.",
    "- \"for this batch, use female vocals and end more hopefully\" => operationIntent.type = \"add\" or \"replace\" if new tracks are requested; put vocalProfile and energyTrajectory in curatorGuidance; mark them request-scoped.",
    "- \"replace the weakest 3 tracks\" => operationIntent.type = \"replace\"; replaceCount = 3; requestedTrackCount is null unless the user separately asks for a different addition count.",
    "- \"bring this to 15 total\" => operationIntent.type = \"add\"; targetTotalTrackCount = 15; requestedTrackCount is null unless the user also gives an explicit add count.",
    "- \"only covers are allowed\" => keep operationIntent driven by the rest of the request; put the covers-only preference in curatorGuidance.notes and mark it persistent unless the user says 'for this pass' or similar.",
    ...instructionConstraintGuidance,
    "Do not invent candidate tracks. Do not claim verification.",
    ...conversationContextGuidance(options.conversationContext),
    ...strongContinuityGuidance(),
    "",
    `Current playlist constraints JSON: ${JSON.stringify(playlist.constraints)}`,
    `User message: ${userMessage}`
  ]);
}

export function curatorStepPlanPrompt(
  playlist: PlaylistState,
  userMessage: string,
  options: {
    conversationContext?: ConversationContext;
    normalizedIntentSummary?: string | null;
  } = {}
): string {
  const contract = getLlmContract("curatorStepPlan");
  return buildPromptEnvelope([
    "Plan this playlist request as an ordered workflow for The CutList.",
    ...curatorVoiceGuidance(),
    returnJsonShapeGuidance(contract),
    ...contract.safetyGuidance,
    "Preserve the user's operation order when they state one explicitly using words like then, after, before, once that's done, and finally.",
    "Use update_rules only when the request changes verified rules or curator guidance that should affect later steps.",
    "Use add for verified candidate generation, replace when existing tracks must be removed and backfilled, remove for existing-track cuts, reorder for sequencing only, import for pasted track lists, analyze for critique/review requests, and metadata only for title/mood/arc edits.",
    "Do not collapse multiple user actions into one step when execution order matters.",
    options.normalizedIntentSummary ? `Grounding summary: ${options.normalizedIntentSummary}` : null,
    ...conversationContextGuidance(options.conversationContext),
    ...strongContinuityGuidance(),
    "",
    `Current playlist JSON: ${JSON.stringify(playlist)}`,
    `User message: ${userMessage}`
  ]);
}

export function operatorPlanPrompt(
  playlist: PlaylistState,
  userMessage: string,
  options: {
    conversationContext?: ConversationContext;
    forceReadOnly?: boolean;
    hasPastedTracks?: boolean;
    trackCount?: number;
  } = {}
): string {
  const contract = getLlmContract("operatorPlan");
  return buildPromptEnvelope([
    "Turn this playlist request into a typed operator plan for The CutList.",
    ...curatorVoiceGuidance(),
    returnJsonShapeGuidance(contract),
    ...contract.safetyGuidance,
    ...(contract.outputGuidance ?? []),
    "This is a planning task, not an execution task.",
    "Compose the request from a small operator library instead of describing a freeform workflow.",
    "Use review operators for read-only diagnosis and curator operators for playlist mutations.",
    "When the user names a specific transition or handoff, prefer a focused transition review plan and include the raw from/to text in both declaredEntities.transition and resolve_named_tracks.",
    "When the user asks to add a track after or before an existing track, or at the beginning or end, capture that in declaredEntities.placement instead of collapsing it into a generic append.",
    "When the user asks to replace a version of an existing track with the canonical or studio version, set replacementMode = canonical_version and bind the existing playlist track in declaredEntities.replacementTarget.",
    "Use per-track duration preferences such as tracks under 5 minutes as parameterHints.maxTrackDurationMs, not as playlist compression.",
    "If the request says not to modify or the caller forces read_only, keep executionPolicy = read_only even if the prompt mentions edit verbs.",
    options.forceReadOnly ? "Execution policy is forced to read_only for this request." : null,
    options.hasPastedTracks ? "Pasted tracks were detected; prefer an import_request plan unless the user is clearly doing something else." : null,
    options.trackCount === 0 ? "The playlist is empty; do not produce review-only plans that require existing transitions or weak-link analysis." : null,
    ...conversationContextGuidance(options.conversationContext),
    ...strongContinuityGuidance(),
    "",
    `Current playlist JSON: ${JSON.stringify(playlist)}`,
    `User message: ${userMessage}`
  ].filter(Boolean));
}
