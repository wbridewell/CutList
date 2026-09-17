import { getLlmContract, returnJsonShapeGuidance } from "@/lib/ai/contracts";
import { buildPromptEnvelope } from "@/lib/ai/prompts/promptBuilder";
import type { CompressionRequest } from "@/lib/playlist/analysis/compression";
import type { ConversationContext, PlaylistState, ReviewMode } from "@/types/playlist";
import { conversationContextGuidance, strongContinuityGuidance } from "./guidance";
import { curatorVoiceGuidance } from "./persona";

export function critiquePrompt(
  playlist: PlaylistState,
  userQuestion?: string,
  options: { compressionRequest?: CompressionRequest | null; conversationContext?: ConversationContext; reviewMode?: ReviewMode } = {}
): string {
  const contract = getLlmContract("playlistCritique");
  const reviewMode = options.reviewMode ?? "full_critique";
  const compressionGuidance = options.compressionRequest
    ? [
      "The user is explicitly asking for playlist compression. Treat this as editing the current playlist, not as replacement or fresh generation.",
      "Prefer section-level compress_section suggestions that remove existing tracks while preserving identity, anchor moments, and the ending feel.",
      "For compress_section, include only existing removable track ids in affectedTrackIds and compressionPlan.removeTrackIds. Do not invent new tracks inside compression suggestions.",
      "If compression alone would damage flow, emit a separate add_bridge or replace suggestion instead of overloading compress_section.",
      options.compressionRequest.targetTrackCount != null ? `Aim toward ${options.compressionRequest.targetTrackCount} total tracks.` : null,
      options.compressionRequest.targetTotalDurationMs != null ? `Aim toward about ${Math.round(options.compressionRequest.targetTotalDurationMs / 60_000)} total minutes.` : null
    ].filter(Boolean)
    : [];
  const reviewModeGuidance = reviewMode === "focused_transition_repair"
    ? [
      "Focused review mode: focused_transition_repair.",
      "Discuss only the named transition or handoff. Do not widen the scope to the rest of the playlist.",
      "Return transition-specific diagnosis and bridge-style repairs only.",
      "reviewSuggestions may include only add_bridge suggestions in this mode.",
      "Do not emit compress_section, remove, replace, reorder, or improve_ending suggestions in this mode.",
      "When the user asks for a specific number of bridge tracks, return exactly that many bridge options."
    ]
    : reviewMode === "bridge_options_only"
      ? [
        "Focused review mode: bridge_options_only.",
        "Center the weakest or named transition and propose bridge-track options only.",
        "reviewSuggestions may include only add_bridge suggestions in this mode.",
        "Do not emit compress_section, remove, replace, reorder, or improve_ending suggestions in this mode."
      ]
      : reviewMode === "diagnose_only"
        ? [
          "Focused review mode: diagnose_only.",
          "Name the biggest problem clearly and support it with evidence, but do not widen into a rewrite plan.",
          "reviewSuggestions must be [] unless the user explicitly asks for follow-up options.",
          "Do not emit bridge, compression, reorder, remove, replace, or add suggestions by default in this mode."
        ]
        : reviewMode === "weak_links_only"
          ? [
            "Focused review mode: weak_links_only.",
            "Identify only the weakest tracks or fit failures and explain why they weaken the identity.",
            "reviewSuggestions may include only remove suggestions in this mode.",
            "Do not emit bridge, compression, reorder, ending, or broad sequencing suggestions in this mode."
          ]
          : reviewMode === "compression_review"
            ? [
              "Focused review mode: compression_review.",
              "Evaluate overbuilt sections, pacing drag, and cuts/compression only.",
              "reviewSuggestions may include compress_section and remove suggestions in this mode."
            ]
            : reviewMode === "ending_repair"
              ? [
                "Focused review mode: ending_repair.",
                "Discuss only the ending, closer, or landing of the playlist.",
                "reviewSuggestions may include only improve_ending or add_bridge suggestions in this mode."
              ]
              : reviewMode === "sequencing_only"
                ? [
                  "Focused review mode: sequencing_only.",
                  "Discuss order, flow, pacing, and transitions only.",
                  "Do not suggest new tracks or removals in this mode unless the user explicitly asks for them."
                ]
                : [
                  "Review mode: full_critique.",
                  "You may discuss the whole playlist and use the full critique scaffold."
                ];
  return buildPromptEnvelope([
    "Critique this verified playlist without mutating it.",
    ...curatorVoiceGuidance(),
    returnJsonShapeGuidance(contract),
    ...(contract.outputGuidance ?? []),
    "Return one JSON object only. Do not add any prose, headings, or commentary before or after it.",
    "Review the playlist as a curation workbench: identify the governing identity, what role each track plays inside that identity, where transitions work or fail, and what repairs would improve the listening experience.",
    "Treat intentSummary.playlistIdentity as the critique's thesis line. Make it a concrete curator reading of this playlist's world, tension, or social-musical identity, not a bland genre label and not a restatement of playlist mood or arc metadata.",
    "Use curatorTake as the compact voice burst. It should name what kind of set this is, what force holds it together, and where the main pressure point is.",
    "Let strengths describe what is identity-defining, not merely what is good.",
    "Let sequencingNotes describe pressure, drag, release, escalation, collapse, or dead air in playlist terms.",
    "Let transitionReview.summary explain why the handoff works or fails in the playlist's own language, not only in generic technical terms.",
    "Let reviewSuggestions.rationale and intentPreservation tie the proposed edit back to the playlist's specific identity and what must survive the change.",
    "Prefer sensory, scene, or tension language over generic filler such as cohesive, good energy, works well, or fits the vibe unless you immediately make it specific.",
    "Treat back-to-back tracks by the same artist as a likely sequencing weakness unless the user explicitly wants artist clustering or the playlist is too constrained to avoid it.",
    "Treat roles, transition quality, and intent preservation as interpretive judgments. Use confidence levels and risk notes instead of claiming objective truth.",
    "Return curatorTake as the Curator's compact human read of the playlist before the more structured sections.",
    "curatorTake should sound like a living musical intelligence speaking directly to the user, not a report heading.",
    "Keep every structured section inside the returned object. reviewSuggestions must be [] when you have no safe suggestion to make.",
    "Review mode is non-mutating. Every reviewSuggestion must use applicationMode = informational, even when you are naming a specific cut, reorder, bridge, compression, or replacement idea.",
    "Use reviewSuggestions to capture focused follow-up ideas the user could copy into a later curator prompt, not direct actions the app should apply now.",
    "When a transition clearly needs connective tissue, prefer an add_bridge suggestion as an informational note with a suggestedPrompt over vague filler prose.",
    "If you identify an abrupt energy jump or weak bridge between two tracks and no safe reorder fully solves it, emit add_bridge as informational.",
    ...reviewModeGuidance,
    ...compressionGuidance,
    ...conversationContextGuidance(options.conversationContext),
    ...strongContinuityGuidance(),
    contract.safetyGuidance[1],
    "",
    `Playlist JSON: ${JSON.stringify(playlist)}`,
    `User question: ${userQuestion ?? "What is working, what is weak, and what should happen next?"}`
  ]);
}

export function transitionRepairPrompt(
  playlist: PlaylistState,
  userQuestion: string,
  options: {
    conversationContext?: ConversationContext;
    requestedCount?: number | null;
    namedTransition?: { fromLabel: string; toLabel: string } | null;
  } = {}
): string {
  const contract = getLlmContract("playlistTransitionRepair");
  return buildPromptEnvelope([
    "Repair this playlist transition without mutating the playlist.",
    ...curatorVoiceGuidance(),
    returnJsonShapeGuidance(contract),
    ...(contract.outputGuidance ?? []),
    ...contract.safetyGuidance,
    "Return one JSON object only.",
    "Focus only on the named transition or handoff. Do not widen to full-playlist critique.",
    "Recommend bridge tracks only. Do not suggest removals, reorders, compression, or broad playlist surgery.",
    "Do not return critique scaffolds such as Curator judgment, Review note, What works, Sequencing, Transitions, Suggested follow-ups, or compress_section.",
    "If you mention any track removal, reorder, section compression, or playlist-wide fix, the response is invalid.",
    "Each bridgeOptions entry must contain a real CandidateTrack plus a role string that explains how it steps the listener from the source track into the destination track.",
    options.requestedCount != null ? `Return exactly ${options.requestedCount} bridgeOptions.` : null,
    options.namedTransition ? `Named transition to repair exactly: ${options.namedTransition.fromLabel} -> ${options.namedTransition.toLabel}. Do not analyze or repair any other handoff.` : null,
    ...conversationContextGuidance(options.conversationContext),
    ...strongContinuityGuidance(),
    "",
    `Playlist JSON: ${JSON.stringify(playlist)}`,
    `User question: ${userQuestion}`
  ].filter(Boolean));
}
