import type { CuratorResponse, PlaylistState, Track } from "@/types/playlist";

export type PlaylistOperationId = NonNullable<CuratorResponse["playlistUpdate"]>["action"];
export type PlaylistUpdate = NonNullable<CuratorResponse["playlistUpdate"]>;
export type PlaylistOperationPayloadKind = "trackDelta" | "fullTrackList";

export type PlaylistOperationLabelContext = {
  count?: number;
  qualifier?: string;
  track?: Pick<Track, "artist" | "title">;
};

export type PlaylistOperationSummary = {
  movedTrackCount?: number;
  movedTrackSummary?: string[];
  orderRationale?: string | null;
};

export type RemovedTrackSnapshot = {
  index: number;
  track: Track;
};

export type PlaylistOperationUndoPayload = {
  operationId: "remove";
  qualifier?: string;
  removedTracks: RemovedTrackSnapshot[];
} | {
  operationId: "set";
  qualifier?: string;
  previousTracks: Track[];
};

export type PlaylistOperationDefinition = {
  acceptedCount: (update: PlaylistUpdate) => number;
  applyTracks: (currentTracks: Track[], update: PlaylistUpdate) => Track[];
  destructive: boolean;
  destructiveLabel: (context?: PlaylistOperationLabelContext) => string;
  id: PlaylistOperationId;
  payloadKind: PlaylistOperationPayloadKind;
  promptGuidance: string[];
  summary: (update: PlaylistUpdate, before?: Pick<PlaylistState, "tracks">) => PlaylistOperationSummary | null;
  undoLabel: string | null;
  undoSummary: (payload: PlaylistOperationUndoPayload) => string | null;
};

function trackLabel(track: Pick<Track, "artist" | "title">): string {
  return `${track.title} by ${track.artist}`;
}

function trackCountLabel(count = 1, qualifier?: string): string {
  return `${count} ${qualifier ? `${qualifier} ` : ""}track${count === 1 ? "" : "s"}`;
}

function removeLabel(context: PlaylistOperationLabelContext = {}): string {
  if (context.track) {
    return `Remove ${context.track.title}`;
  }
  return `Remove ${trackCountLabel(context.count ?? 1, context.qualifier)}`;
}

function removeUndoSummary(payload: PlaylistOperationUndoPayload): string {
  if (payload.operationId !== "remove") {
    return payload.previousTracks.length === 0
      ? "Replaced the full playlist."
      : `Replaced the full playlist with ${payload.previousTracks.length} earlier track${payload.previousTracks.length === 1 ? "" : "s"}.`;
  }
  if (payload.removedTracks.length === 1) {
    const track = payload.removedTracks[0]?.track;
    return track ? `Removed ${track.artist} - ${track.title}.` : "Removed 1 track.";
  }
  return `Removed ${trackCountLabel(payload.removedTracks.length, payload.qualifier)}.`;
}

function summarizeReorderUpdate(
  update: PlaylistUpdate,
  before?: Pick<PlaylistState, "tracks">
): PlaylistOperationSummary | null {
  if (!before || update.action !== "reorder") {
    return null;
  }

  const beforePositions = new Map(before.tracks.map((track, index) => [track.id, index]));
  const moved = update.tracks
    .map((track, index) => {
      const beforeIndex = beforePositions.get(track.id);
      return beforeIndex == null || beforeIndex === index
        ? null
        : `${beforeIndex + 1} -> ${index + 1} · ${trackLabel(track)}`;
    })
    .filter((item): item is string => item != null);

  return {
    movedTrackCount: moved.length,
    movedTrackSummary: moved.slice(0, 5),
    orderRationale: update.orderRationale
  };
}

export const playlistOperationRegistry: PlaylistOperationDefinition[] = [
  {
    id: "set",
    payloadKind: "fullTrackList",
    destructive: true,
    destructiveLabel: () => "Replace playlist",
    promptGuidance: [
      "The set operation replaces the full playlist track list."
    ],
    applyTracks: (_currentTracks, update) => update.tracks,
    acceptedCount: () => 0,
    summary: () => null,
    undoLabel: "Undo edit",
    undoSummary: removeUndoSummary
  },
  {
    id: "add",
    payloadKind: "trackDelta",
    destructive: false,
    destructiveLabel: () => "Add tracks",
    promptGuidance: [
      "The add operation appends verified new tracks to the existing playlist."
    ],
    applyTracks: (currentTracks, update) => [...currentTracks, ...update.tracks],
    acceptedCount: (update) => update.tracks.length,
    summary: () => null,
    undoLabel: null,
    undoSummary: () => null
  },
  {
    id: "remove",
    payloadKind: "trackDelta",
    destructive: true,
    destructiveLabel: removeLabel,
    promptGuidance: [
      "removeTrackIds must contain only track ids from the provided playlist JSON.",
      "Use an empty removeTrackIds array when the request is too ambiguous, the playlist is too short, or no existing track clearly matches the removal instruction.",
      "For subjective requests such as 'remove tracks that bring down the mood', treat your judgment as an interpretation. Explain the interpretation briefly in message and give track-specific rationale in rationaleByTrackId."
    ],
    applyTracks: (currentTracks, update) => {
      const removed = new Set(update.tracks.map((track) => track.id));
      return currentTracks.filter((track) => !removed.has(track.id));
    },
    acceptedCount: () => 0,
    summary: () => null,
    undoLabel: "Undo removal",
    undoSummary: removeUndoSummary
  },
  {
    id: "reorder",
    payloadKind: "fullTrackList",
    destructive: false,
    destructiveLabel: () => "Reorder playlist",
    promptGuidance: [
      "If the user asks for removals while shaping, say the matching tracks are still present and need a removal action.",
      "orderedTrackIds must contain only track ids from the provided playlist. Include every current track id exactly once unless the user explicitly asks for a partial sequence.",
      "Create a strong playlist title, concise mood description, and sequencing arc when the playlist is coherent enough to support them.",
      "Honor specific sequencing guidance: group or separate genres when requested, smooth transitions, build or release energy deliberately, and place narrative beats such as tension, rupture, redemption, or a high-energy fourth act where the user asks.",
      "Avoid putting two tracks by the same artist back to back unless the user explicitly wants that clustering or the playlist is too constrained to avoid it cleanly.",
      "If the playlist is too short or too incoherent, keep the current order and explain what is missing in message."
    ],
    applyTracks: (_currentTracks, update) => update.tracks,
    acceptedCount: () => 0,
    summary: summarizeReorderUpdate,
    undoLabel: null,
    undoSummary: () => null
  }
];

export function getPlaylistOperationDefinition(id: PlaylistOperationId): PlaylistOperationDefinition {
  const definition = playlistOperationRegistry.find((item) => item.id === id);
  if (!definition) {
    throw new Error(`Unknown playlist operation: ${id}`);
  }
  return definition;
}

export function applyPlaylistUpdateTracks(currentTracks: Track[], update: PlaylistUpdate): Track[] {
  return getPlaylistOperationDefinition(update.action).applyTracks(currentTracks, update);
}

export function acceptedCountForPlaylistUpdate(update: PlaylistUpdate | null | undefined): number {
  return update ? getPlaylistOperationDefinition(update.action).acceptedCount(update) : 0;
}

export function summarizePlaylistUpdate(
  update: PlaylistUpdate | null | undefined,
  before?: Pick<PlaylistState, "tracks">
): PlaylistOperationSummary | null {
  return update ? getPlaylistOperationDefinition(update.action).summary(update, before) : null;
}

export function promptGuidanceForPlaylistOperation(id: PlaylistOperationId): string[] {
  return getPlaylistOperationDefinition(id).promptGuidance;
}

export function destructiveLabelForPlaylistOperation(
  id: PlaylistOperationId,
  context?: PlaylistOperationLabelContext
): string {
  return getPlaylistOperationDefinition(id).destructiveLabel(context);
}

export function undoLabelForPlaylistOperation(id: PlaylistOperationId): string | null {
  return getPlaylistOperationDefinition(id).undoLabel;
}

export function createRemoveOperationUndoPayload(
  playlist: Pick<PlaylistState, "tracks">,
  trackIds: string[],
  options: { qualifier?: string } = {}
): PlaylistOperationUndoPayload | null {
  const ids = new Set(trackIds);
  if (ids.size === 0) {
    return null;
  }

  const removedTracks = playlist.tracks
    .map((track, index) => ids.has(track.id) ? { index, track } : null)
    .filter((item): item is RemovedTrackSnapshot => item != null);
  return removedTracks.length > 0
    ? { operationId: "remove", qualifier: options.qualifier, removedTracks }
    : null;
}

export function createSetOperationUndoPayload(
  playlist: Pick<PlaylistState, "tracks">,
  options: { qualifier?: string } = {}
): PlaylistOperationUndoPayload | null {
  return {
    operationId: "set",
    qualifier: options.qualifier,
    previousTracks: [...playlist.tracks]
  };
}

export function applyPlaylistOperationUndo(
  playlist: PlaylistState,
  payload: PlaylistOperationUndoPayload,
  updatedAt: string
): PlaylistState {
  if (payload.operationId === "set") {
    return { ...playlist, tracks: payload.previousTracks, updatedAt };
  }
  const tracks = [...playlist.tracks];
  for (const removed of [...payload.removedTracks].sort((a, b) => a.index - b.index)) {
    tracks.splice(Math.min(removed.index, tracks.length), 0, removed.track);
  }
  return { ...playlist, tracks, updatedAt };
}

export function undoSummaryForPlaylistOperation(payload: PlaylistOperationUndoPayload): string | null {
  return getPlaylistOperationDefinition(payload.operationId).undoSummary(payload);
}
