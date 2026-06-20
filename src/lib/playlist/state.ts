import { normalizeText } from "@/lib/music/normalize";
import { applyPlaylistUpdateTracks } from "@/lib/playlist/operations";
import { updatePlaylistSuppressedCandidates } from "@/lib/playlist/candidateSuppression";
import type { CuratorResponse, DiscoveryRadius, PlaylistConstraints, PlaylistState, Track } from "@/types/playlist";

export type PlaylistTextField = "title" | "mood" | "arc";

export function nowIso(): string {
  return new Date().toISOString();
}

export function touchPlaylist(playlist: PlaylistState, updatedAt = nowIso()): PlaylistState {
  return { ...playlist, updatedAt };
}

export function applyCuratorResponse(
  playlist: PlaylistState,
  response: CuratorResponse,
  updatedAt = nowIso()
): PlaylistState {
  const update = response.playlistUpdate;
  const tracks = update == null ? playlist.tracks : applyPlaylistUpdateTracks(playlist.tracks, update);
  const playlistWithSuppression = updatePlaylistSuppressedCandidates(playlist, response.rejectedCandidates, { createdAt: updatedAt });

  return {
    ...playlistWithSuppression,
    title: response.playlistMeta?.title ?? playlist.title,
    mood: response.playlistMeta?.mood ?? playlist.mood,
    arc: response.playlistMeta?.arc ?? playlist.arc,
    constraints: response.updatedConstraints ?? playlist.constraints,
    tracks,
    updatedAt
  };
}

export function addTracksToPlaylist(playlist: PlaylistState, tracks: Track[], updatedAt = nowIso()): PlaylistState {
  return {
    ...playlist,
    tracks: [...playlist.tracks, ...tracks],
    updatedAt
  };
}

export function insertTracksAfterTrack(
  playlist: PlaylistState,
  afterTrackId: string,
  tracks: Track[],
  updatedAt = nowIso()
): PlaylistState {
  if (tracks.length === 0) {
    return playlist;
  }

  const index = playlist.tracks.findIndex((track) => track.id === afterTrackId);
  if (index < 0) {
    return addTracksToPlaylist(playlist, tracks, updatedAt);
  }

  return {
    ...playlist,
    tracks: [
      ...playlist.tracks.slice(0, index + 1),
      ...tracks,
      ...playlist.tracks.slice(index + 1)
    ],
    updatedAt
  };
}

export function removeTrackFromPlaylist(playlist: PlaylistState, trackId: string, updatedAt = nowIso()): PlaylistState {
  return {
    ...playlist,
    tracks: playlist.tracks.filter((track) => track.id !== trackId),
    updatedAt
  };
}

export function removeTracksFromPlaylist(playlist: PlaylistState, trackIds: string[], updatedAt = nowIso()): PlaylistState {
  const removed = new Set(trackIds);
  if (removed.size === 0) {
    return playlist;
  }

  const tracks = playlist.tracks.filter((track) => !removed.has(track.id));
  return tracks.length === playlist.tracks.length ? playlist : { ...playlist, tracks, updatedAt };
}

export function moveTrackInPlaylist(
  playlist: PlaylistState,
  fromIndex: number,
  direction: -1 | 1,
  updatedAt = nowIso()
): PlaylistState {
  const nextIndex = fromIndex + direction;
  if (fromIndex < 0 || fromIndex >= playlist.tracks.length || nextIndex < 0 || nextIndex >= playlist.tracks.length) {
    return playlist;
  }

  const tracks = [...playlist.tracks];
  const [track] = tracks.splice(fromIndex, 1);
  tracks.splice(nextIndex, 0, track);
  return { ...playlist, tracks, updatedAt };
}

export function reorderTrackInPlaylist(
  playlist: PlaylistState,
  fromIndex: number,
  toIndex: number,
  updatedAt = nowIso()
): PlaylistState {
  if (
    fromIndex < 0 ||
    fromIndex >= playlist.tracks.length ||
    toIndex < 0 ||
    toIndex >= playlist.tracks.length ||
    fromIndex === toIndex
  ) {
    return playlist;
  }

  const tracks = [...playlist.tracks];
  const [track] = tracks.splice(fromIndex, 1);
  tracks.splice(toIndex, 0, track);
  return { ...playlist, tracks, updatedAt };
}

export function updatePlaylistTextField(
  playlist: PlaylistState,
  field: PlaylistTextField,
  value: string,
  updatedAt = nowIso()
): PlaylistState {
  return {
    ...playlist,
    [field]: value.trim() ? value : null,
    updatedAt
  };
}

export function updatePlaylistDiscoveryRadius(
  playlist: PlaylistState,
  discoveryRadius: DiscoveryRadius,
  updatedAt = nowIso()
): PlaylistState {
  return {
    ...playlist,
    discoveryRadius,
    updatedAt
  };
}

export function removePlaylistConstraint(
  playlist: PlaylistState,
  key: string,
  updatedAt = nowIso()
): PlaylistState {
  const constraints = removeConstraintByKey(playlist.constraints, key);
  return constraints === playlist.constraints ? playlist : { ...playlist, constraints, updatedAt };
}

export function removeConstraintByKey(constraints: PlaylistConstraints, key: string): PlaylistConstraints {
  const [field, indexText] = key.split(":");
  const next = { ...constraints };

  if (indexText == null) {
    if (!(field in next)) {
      return constraints;
    }
    delete next[field as keyof PlaylistConstraints];
    return next;
  }

  const index = Number.parseInt(indexText, 10);
  if (Number.isNaN(index)) {
    return constraints;
  }

  const listField = field as keyof PlaylistConstraints;
  const value = next[listField];
  if (!Array.isArray(value)) {
    return constraints;
  }

  const nextValue = value.filter((_, itemIndex) => itemIndex !== index);
  if (nextValue.length === value.length) {
    return constraints;
  }
  if (nextValue.length === 0) {
    delete next[listField];
  } else {
    Object.assign(next, { [listField]: nextValue });
  }
  return next;
}

export function isDuplicateTrack(playlist: PlaylistState, track: Track): boolean {
  return playlist.tracks.some((existing) => (
    (existing.sourceId != null && track.sourceId != null && existing.source === track.source && existing.sourceId === track.sourceId) ||
    (normalizeText(existing.artist) === normalizeText(track.artist) && normalizeText(existing.title) === normalizeText(track.title))
  ));
}
