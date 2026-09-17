import { getLlmContract, returnJsonShapeGuidance } from "@/lib/ai/contracts";
import { realTrackCandidateGuidance, verifiedMetadataGuidance } from "@/lib/ai/guidance";
import { candidateConstraintGuidance, importConstraintGuidance } from "@/lib/playlist/constraints/promptGuidance";
import { promptGuidanceForPlaylistOperation } from "@/lib/playlist/operations";
import { buildPromptEnvelope } from "@/lib/ai/prompts/promptBuilder";
import type { AttemptedMatch, CandidateTrack, ConversationContext, DiscoveryRadius, PlaylistState, SuppressedCandidateFingerprint } from "@/types/playlist";
import { candidateCountGuidance, conversationContextGuidance, discoveryRadiusGuidance, playlistIdentitySummary, strongContinuityGuidance, suppressedCandidateGuidance } from "./guidance";
import { curatorVoiceGuidance } from "./persona";

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
