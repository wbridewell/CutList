import type { ConversationContext, PlaylistState } from "@/types/playlist";

export type RequestPlanFingerprintInput = {
  playlist: PlaylistState;
  userMessage: string;
  conversationContext?: ConversationContext;
  forceReadOnly?: boolean;
};

// FNV-1a, 32-bit. Not cryptographic: it only has to notice that the message, the playlist,
// or the conversation changed between the plan preview and the message that reuses it.
function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

// Identifies the inputs the operator planner read when it produced a plan. The plan
// preview command returns this next to the plan; the message command recomputes it from
// its own payload and reuses the plan only when the two agree, so a stale preview can
// never drive a mutation against a playlist it was not planned for. Both sides compute
// it after Zod parsing, which is what keeps key order stable.
export function requestPlanFingerprint(input: RequestPlanFingerprintInput): string {
  const canonical = JSON.stringify({
    userMessage: input.userMessage,
    forceReadOnly: input.forceReadOnly ?? false,
    tracks: input.playlist.tracks.map((track) => [track.id, track.artist, track.title, track.album]),
    constraints: input.playlist.constraints,
    discoveryRadius: input.playlist.discoveryRadius,
    suppressed: (input.playlist.suppressedCandidateFingerprints ?? []).map((entry) => entry.fingerprint),
    conversation: input.conversationContext?.recentMessages ?? []
  });
  return `${fnv1a(canonical)}-${canonical.length.toString(16)}`;
}
