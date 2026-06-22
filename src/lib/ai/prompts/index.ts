import { getLlmContract, returnJsonShapeGuidance } from "@/lib/ai/contracts";
import { llmOutputStyleGuidance, realTrackCandidateGuidance, verifiedMetadataGuidance } from "@/lib/ai/guidance";
import { readLocalLLMSettings, type CuratorPersona } from "@/lib/ai/llmConfig";
import {
  candidateConstraintGuidance,
  importConstraintGuidance,
  instructionConstraintGuidance
} from "@/lib/playlist/constraints/promptGuidance";
import { promptGuidanceForPlaylistOperation } from "@/lib/playlist/operations";
import { buildPromptEnvelope } from "@/lib/ai/prompts/promptBuilder";
import type { CompressionRequest } from "@/lib/playlist/analysis/compression";
import type {
  AttemptedMatch,
  CandidateTrack,
  ConversationContext,
  DiscoveryRadius,
  PlaylistState,
  SuppressedCandidateFingerprint
} from "@/types/playlist";

const maxCandidateSuggestions = 12;

function playlistIdentitySummary(playlist: PlaylistState): string {
  const genreCenter = [...new Set(playlist.tracks.flatMap((track) => track.genreTags).filter(Boolean))].slice(0, 4);
  const parts = [
    playlist.title && playlist.title !== "The CutList" ? `Title: ${playlist.title}` : null,
    playlist.mood ? `Mood: ${playlist.mood}` : null,
    playlist.arc ? `Arc: ${playlist.arc}` : null,
    genreCenter.length > 0 ? `Genre center: ${genreCenter.join(", ")}` : null
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" | ") : "No established playlist identity yet; use the user request as the main anchor.";
}

function discoveryRadiusGuidance(discoveryRadius: DiscoveryRadius): string[] {
  switch (discoveryRadius) {
    case "safe":
      return [
        "Discovery radius: safe.",
        "Stay close to verified anchors, dominant genres, the current emotional lane, and familiar adjacency.",
        "Prefer obvious, high-confidence catalog fits over novelty."
      ];
    case "adventurous":
      return [
        "Discovery radius: adventurous.",
        "Broaden era, scene, and texture choices while keeping a coherent fit story with the current playlist identity.",
        "Allow less obvious but still plausible jumps."
      ];
    case "highly_experimental":
      return [
        "Discovery radius: highly experimental.",
        "Maximize exploratory breadth while still respecting verified rules, explicit exclusions, and anti-hallucination guidance.",
        "Allow surprising scene, era, and cultural leaps if the fit story remains coherent."
      ];
    case "moderate":
    default:
      return [
        "Discovery radius: moderate.",
        "Allow tasteful adjacent moves, but preserve clear continuity with the current playlist identity."
      ];
  }
}

function conversationContextGuidance(context?: ConversationContext): string[] {
  if (!context?.recentMessages.length) {
    return [];
  }

  const lines = context.recentMessages.map((message) => {
    const label = message.role === "user" ? "User" : "Curator";
    return `- ${label}: ${message.content}`;
  });

  return [
    "Recent conversation context for continuity only:",
    ...lines,
    "Use this context to remember recent preferences, corrections, and curator reasoning, but treat the latest user message and verified playlist rules as higher priority."
  ];
}

function suppressedCandidateGuidance(
  entries?: SuppressedCandidateFingerprint[]
): string[] {
  if (!entries?.length) {
    return [];
  }

  return [
    "Previously rejected as non-credible in this session; do not suggest these again unless the latest user message explicitly re-asks for them:",
    ...entries.map((entry) => `- ${entry.artist} - ${entry.title}`)
  ];
}

function legacyVoiceToPersona(value: string | undefined): CuratorPersona | undefined {
  switch (value?.trim().toLowerCase()) {
    case "sharp":
      return "razor";
    case "classic":
      return "archivist";
    case "critic":
      return "firestarter";
    default:
      return undefined;
  }
}

export function getCuratorPersona(): CuratorPersona {
  return readLocalLLMSettings().curatorPersona
    ?? legacyVoiceToPersona(process.env.LLM_CURATOR_VOICE)
    ?? "razor";
}

function candidateCountGuidance(requestedTrackCount?: number | null): string[] {
  if (requestedTrackCount == null) {
    return [`Suggest a useful candidate pool, but no more than ${maxCandidateSuggestions}.`];
  }

  const targetCandidateCount = Math.min(maxCandidateSuggestions, Math.max(requestedTrackCount, requestedTrackCount * 2));
  return [
    `The user needs ${requestedTrackCount} accepted track${requestedTrackCount === 1 ? "" : "s"}; propose about ${targetCandidateCount} candidates so backend verification can trim the list.`,
    `Return no more than ${maxCandidateSuggestions} candidates.`
  ];
}

function curatorVoiceGuidance(persona = getCuratorPersona()): string[] {
  const base = [
    `Curator persona: ${persona}.`,
    ...llmOutputStyleGuidance
  ];

  if (persona === "archivist") {
    return [
      ...base,
      "Sound like The Archivist: lineage-aware, scene-aware, musically grounded, and quietly authoritative.",
      "Judge tracks by ancestry, continuity, and the hidden bridges between scenes, eras, and production languages.",
      "Name where the playlist's identity comes from and how its pieces inherit from or mutate one another.",
      "Explain connections with calm specificity instead of generic praise or flourish for its own sake."
    ];
  }

  if (persona === "firestarter") {
    return [
      ...base,
      "Sound like The Firestarter: volatile, physical, confrontational, and dramatically opinionated, but still compact and useful.",
      "Name friction, danger, rupture, ugliness, swagger, collapse, and bodily impact when that is what the playlist is doing.",
      "Use vivid language and stronger contrast, but keep every recommendation actionable, honest, and tethered to the actual tracks."
    ];
  }

  return [
    ...base,
    "Sound like The Razor: decisive, compressed, surgical, and seductive in how it steers the listener toward a sharper shape.",
    "Make the thesis fast, name the pressure points cleanly, and cut through vagueness.",
    "Prefer precision, pressure, and specific fit language over generic praise or scene-tour narration."
  ];
}

function strongContinuityGuidance(persona = getCuratorPersona()): string[] {
  return [
    "Strong continuity mode is active.",
    "Sound like the same living Curator across turns rather than a fresh assistant on each request.",
    "Naturally reference prior corrections, rejected directions, sequencing complaints, and discovered taste boundaries when they matter.",
    "Do not quote the transcript back verbatim or mechanically recap every turn.",
    persona === "archivist"
      ? "Let memory sound contextual and grounded, as though the Curator is tracking lineage and evolving intent."
      : persona === "firestarter"
        ? "Let memory sound charged and purposeful, as though the Curator remembers where the session has been bruised or electrified."
        : "Let memory sound sharp and persuasive, as though the Curator remembers what has already failed and is luring the session toward a cleaner answer."
  ];
}

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
    "Return every top-level key exactly once. Do not omit operationIntent, verifiedRules, curatorGuidance, scopeIntent, or notes.",
    "When a branch has no values, return an empty object for it. When a scope list has no fields, return [].",
    "Use operationIntent.type = \"reorder\" when the user asks to sequence, order, reorder, retitle, name, describe, or create an arc for the existing playlist without asking for new songs.",
    "Also use operationIntent.type = \"reorder\" for existing-playlist shaping requests such as grouping similar tracks, clustering genres, improving flow, smoothing transitions, changing pacing, shaping an energy curve, or placing high-energy/release/redemption moments in a narrative act.",
    "Use operationIntent.type = \"replace\" when the user wants existing tracks swapped out and replaced with new verified additions.",
    "When the user combines shaping language with additions, removals, or replacements, prefer add, remove, or replace as operationIntent.type and leave sequencing needs in notes instead of collapsing the whole request into reorder.",
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

export function candidatePrompt(
  playlist: PlaylistState,
  userMessage: string,
  options: {
    requestedTrackCount?: number | null;
    discoveryRadius?: DiscoveryRadius;
    conversationContext?: ConversationContext;
    suppressedCandidates?: SuppressedCandidateFingerprint[];
  } = {}
): string {
  const contract = getLlmContract("candidateBatch");
  const discoveryRadius = options.discoveryRadius ?? playlist.discoveryRadius;
  return buildPromptEnvelope([
    "You are the curator for The CutList, a collaborative verified playlist app.",
    ...curatorVoiceGuidance(),
    ...discoveryRadiusGuidance(discoveryRadius),
    realTrackCandidateGuidance[0],
    contract.safetyGuidance[0],
    ...realTrackCandidateGuidance.slice(1),
    contract.safetyGuidance[1],
    returnJsonShapeGuidance(contract),
    ...(contract.outputGuidance ?? []),
    ...candidateCountGuidance(options.requestedTrackCount),
    ...candidateConstraintGuidance,
    "Never return a track that is already present in the current playlist JSON. Existing tracks are context, not candidates.",
    `Current playlist identity: ${playlistIdentitySummary(playlist)}`,
    ...conversationContextGuidance(options.conversationContext),
    ...strongContinuityGuidance(),
    ...suppressedCandidateGuidance(options.suppressedCandidates),
    "",
    `Current playlist JSON: ${JSON.stringify(playlist)}`,
    `User message: ${userMessage}`
  ]);
}

export function playlistShapePrompt(
  playlist: PlaylistState,
  userMessage: string,
  options: { conversationContext?: ConversationContext; postEditShape?: boolean } = {}
): string {
  const contract = getLlmContract("playlistShape");
  return buildPromptEnvelope([
    "You are shaping an existing verified playlist for The CutList.",
    ...curatorVoiceGuidance(),
    ...contract.safetyGuidance,
    returnJsonShapeGuidance(contract),
    ...promptGuidanceForPlaylistOperation("reorder"),
    options.postEditShape
      ? "Structural edits requested by the user have already been applied to the playlist JSON below. Do not say removals still need to happen, do not ask for a separate removal action, and do not discuss tracks that are no longer present. Sequence only the current survivors."
      : null,
    "Use verified metadata fields such as artist, title, album, genreTags, vibeTags, energy, runtime, and rationale as evidence, but do not claim facts that are not present in the playlist JSON.",
    ...conversationContextGuidance(options.conversationContext),
    ...strongContinuityGuidance(),
    "",
    `Current playlist JSON: ${JSON.stringify(playlist)}`,
    `${options.postEditShape ? "Original user request" : "User message"}: ${userMessage}`
  ]);
}

export function playlistRemovalPrompt(
  playlist: PlaylistState,
  userMessage: string,
  options: { conversationContext?: ConversationContext } = {}
): string {
  const contract = getLlmContract("playlistRemoval");
  return buildPromptEnvelope([
    "You are selecting existing tracks to remove from a verified playlist in The CutList.",
    ...curatorVoiceGuidance(),
    contract.safetyGuidance[0],
    returnJsonShapeGuidance(contract),
    ...promptGuidanceForPlaylistOperation("remove"),
    contract.safetyGuidance[1],
    ...verifiedMetadataGuidance,
    ...conversationContextGuidance(options.conversationContext),
    ...strongContinuityGuidance(),
    "",
    `Current playlist JSON: ${JSON.stringify(playlist)}`,
    `User removal request: ${userMessage}`
  ]);
}

export function importPrompt(text: string): string {
  const contract = getLlmContract("importChat");
  return buildPromptEnvelope([
    `Extract playlist state from the pasted text. ${contract.safetyGuidance[0]}`,
    returnJsonShapeGuidance(contract),
    ...importConstraintGuidance,
    contract.safetyGuidance[1],
    "",
    text
  ]);
}

export function matchReviewPrompt(input: {
  query: { title: string; artist: string; album?: string | null };
  rejectionCode: "noCredibleMatch" | "ambiguousMatch" | "albumMismatch";
  attemptedMatches: AttemptedMatch[];
  candidate?: CandidateTrack;
}): string {
  const contract = getLlmContract("matchReview");
  return buildPromptEnvelope([
    "Review provider match candidates for The CutList.",
    ...curatorVoiceGuidance(),
    returnJsonShapeGuidance(contract),
    ...contract.safetyGuidance,
    ...(contract.outputGuidance ?? []),
    "This step is conservative. You may recommend one candidate, keep several candidates without recommending one, or keep none.",
    "Prune obvious non-matches such as wrong-title variants, tribute clutter, unrelated soundtrack entries, and remix/live/alternate versions that do not match the requested intent.",
    "When the title is generic, like Main Title, abstain if several plausible originals remain after pruning.",
    ...strongContinuityGuidance(),
    input.candidate ? "Use the original candidate intent as guidance for whether a remix, live version, soundtrack cue, or alternate take was actually intended." : "Do not infer extra intent beyond the requested query and provider metadata.",
    "",
    `Requested query JSON: ${JSON.stringify(input.query)}`,
    `Deterministic rejection code: ${input.rejectionCode}`,
    `Original candidate intent JSON: ${JSON.stringify(input.candidate ?? null)}`,
    `Provider matches JSON: ${JSON.stringify(input.attemptedMatches)}`
  ]);
}

export function critiquePrompt(
  playlist: PlaylistState,
  userQuestion?: string,
  options: { compressionRequest?: CompressionRequest | null; conversationContext?: ConversationContext } = {}
): string {
  const contract = getLlmContract("playlistCritique");
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
    "Every reviewSuggestion must be safe to inspect before application. For remove_existing include existing affectedTrackIds. For reorder_existing include orderedTrackIds with every current track id exactly once. For verify_candidate include candidate or suggestedPrompt so the user can send it through verification. Use informational for advice that should not be applied directly.",
    "When a transition clearly needs connective tissue, prefer an add_bridge suggestion with verify_candidate over vague informational prose.",
    "If you identify an abrupt energy jump or weak bridge between two tracks and no safe reorder fully solves it, emit add_bridge.",
    ...compressionGuidance,
    ...conversationContextGuidance(options.conversationContext),
    ...strongContinuityGuidance(),
    contract.safetyGuidance[1],
    "",
    `Playlist JSON: ${JSON.stringify(playlist)}`,
    `User question: ${userQuestion ?? "What is working, what is weak, and what should happen next?"}`
  ]);
}

export function workflowSummaryPrompt(input: {
  originalUserMessage: string;
  finalTrackCount: number;
  stepResults: Array<{
    stepKind: string;
    sourceOrder: number;
    originText: string;
    message: string;
    acceptedTracks: string[];
    removedTracks: string[];
    rejectedCandidates: string[];
    applied: boolean;
    skipped: boolean;
    failed: boolean;
    failureReason: string | null;
  }>;
}): string {
  const contract = getLlmContract("workflowSummary");
  return buildPromptEnvelope([
    "Summarize this executed playlist workflow for The CutList.",
    ...curatorVoiceGuidance(),
    returnJsonShapeGuidance(contract),
    ...contract.safetyGuidance,
    "Be concise, coherent, and faithful to the execution log.",
    "Mention partial success honestly when some later steps failed or were skipped.",
    "Use the current Curator persona voice, but let the execution log and final state control the facts.",
    "Do not repeat stale claims from earlier steps after later steps changed the playlist.",
    "Do not say tracks remain in the playlist if later steps removed them.",
    "Do not ask for a removal action that has already happened.",
    "",
    `Original user request: ${input.originalUserMessage}`,
    `Final track count: ${input.finalTrackCount}`,
    `Step results JSON: ${JSON.stringify(input.stepResults)}`
  ]);
}
