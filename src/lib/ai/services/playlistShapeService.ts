import { isLLMDisabledError } from "@/lib/ai/errors";
import { playlistShapePrompt } from "@/lib/ai/prompts";
import { attemptLlmContract } from "@/lib/ai/services/llmService";
import { evaluatePlaylistConstraints } from "@/lib/playlist/constraints";
import type { CuratorRunOptions } from "@/lib/ai/curatorTypes";
import type { CuratorResponse, PlaylistShape, PlaylistState, Track } from "@/types/playlist";

function orderedTracksFromShape(playlist: PlaylistState, shape: PlaylistShape): Track[] {
  const tracksById = new Map(playlist.tracks.map((track) => [track.id, track]));
  const seen = new Set<string>();
  const ordered: Track[] = [];

  for (const trackId of shape.orderedTrackIds) {
    const track = tracksById.get(trackId);
    if (track && !seen.has(trackId)) {
      ordered.push(track);
      seen.add(trackId);
    }
  }

  for (const track of playlist.tracks) {
    if (!seen.has(track.id)) {
      ordered.push(track);
    }
  }

  return ordered;
}

export type PlaylistShapeResult = {
  message: string;
  playlistMeta: CuratorResponse["playlistMeta"];
  tracks: Track[];
  orderRationale: string | null;
};

export async function requestPlaylistShape(
  playlist: PlaylistState,
  userMessage: string,
  options: CuratorRunOptions & { postEditShape?: boolean } = {}
): Promise<PlaylistShapeResult | null> {
  const attempt = await attemptLlmContract<PlaylistShape>(
    "playlistShape",
    playlistShapePrompt(playlist, userMessage, {
      conversationContext: options.conversationContext,
      postEditShape: options.postEditShape
    }),
    { signal: options.signal }
  );
  if (attempt.status === "fallback") {
    if (attempt.reason === "disabled") {
      return null;
    }
    throw attempt.error;
  }

  return {
    message: attempt.parsed.message,
    playlistMeta: attempt.parsed.playlistMeta,
    tracks: orderedTracksFromShape(playlist, attempt.parsed),
    orderRationale: attempt.parsed.orderRationale
  };
}

export async function handlePlaylistShapeRequest(
  playlist: PlaylistState,
  userMessage: string,
  options: CuratorRunOptions = {}
): Promise<CuratorResponse> {
  options.onProgress?.({ stage: "generating", message: "Asking the curator for playlist sequencing and shape." });

  if (playlist.tracks.length < 2) {
    return {
      message: "I need at least two verified tracks before I can make a meaningful sequencing pass.",
      playlistUpdate: null,
      playlistMeta: null,
      updatedConstraints: playlist.constraints,
      constraintReport: evaluatePlaylistConstraints(playlist.tracks, playlist.constraints),
      rejectedCandidates: []
    };
  }

  const shape = await requestPlaylistShape(playlist, userMessage, options);
  if (!shape) {
    return {
      message: "LLM provider is disabled, so I cannot generate a sequencing arc or playlist title right now.",
      playlistUpdate: null,
      playlistMeta: null,
      updatedConstraints: playlist.constraints,
      constraintReport: evaluatePlaylistConstraints(playlist.tracks, playlist.constraints),
      rejectedCandidates: []
    };
  }

  options.onProgress?.({ stage: "complete", message: "Finished playlist sequencing and description." });

  return {
    message: shape.message,
    playlistUpdate: {
      action: "reorder",
      tracks: shape.tracks,
      orderRationale: shape.orderRationale
    },
    playlistMeta: shape.playlistMeta,
    updatedConstraints: playlist.constraints,
    constraintReport: evaluatePlaylistConstraints(shape.tracks, playlist.constraints),
    rejectedCandidates: []
  };
}
