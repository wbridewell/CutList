import type { ConversationContext, DiscoveryRadius, PlaylistState, SuppressedCandidateFingerprint } from "@/types/playlist";
import { getCuratorPersona } from "./persona";

const maxCandidateSuggestions = 12;

export function playlistIdentitySummary(playlist: PlaylistState): string {
  const genreCenter = [...new Set(playlist.tracks.flatMap((track) => track.genreTags).filter(Boolean))].slice(0, 4);
  const parts = [
    playlist.title && playlist.title !== "The CutList" ? `Title: ${playlist.title}` : null,
    playlist.mood ? `Mood: ${playlist.mood}` : null,
    playlist.arc ? `Arc: ${playlist.arc}` : null,
    genreCenter.length > 0 ? `Genre center: ${genreCenter.join(", ")}` : null
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" | ") : "No established playlist identity yet; use the user request as the main anchor.";
}

export function discoveryRadiusGuidance(discoveryRadius: DiscoveryRadius): string[] {
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

export function conversationContextGuidance(context?: ConversationContext): string[] {
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

export function suppressedCandidateGuidance(
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

export function candidateCountGuidance(requestedTrackCount?: number | null): string[] {
  if (requestedTrackCount == null) {
    return [`Suggest a useful candidate pool, but no more than ${maxCandidateSuggestions}.`];
  }

  const targetCandidateCount = Math.min(maxCandidateSuggestions, Math.max(requestedTrackCount, requestedTrackCount * 2));
  return [
    `The user needs ${requestedTrackCount} accepted track${requestedTrackCount === 1 ? "" : "s"}; propose about ${targetCandidateCount} candidates so backend verification can trim the list.`,
    `Return no more than ${maxCandidateSuggestions} candidates.`
  ];
}

export function strongContinuityGuidance(persona = getCuratorPersona()): string[] {
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
