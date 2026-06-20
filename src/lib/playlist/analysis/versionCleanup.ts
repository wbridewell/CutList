import { normalizeArtist, normalizeText, normalizeVersionlessText } from "@/lib/music/normalize";
import type { Track } from "@/types/playlist";

type VersionCleanupResult = {
  keptTracks: Track[];
  removedTracks: Track[];
};

const VERSION_PENALTY = /\b(live|demo|acoustic|instrumental|remaster(?:ed)?|remix|mono|stereo|deluxe|anniversary|version|edit|mix|karaoke|tribute|cover|sped up|slowed|reverb)\b/i;

function versionGroupKey(track: Track): string | null {
  const artist = normalizeArtist(track.artist);
  const title = normalizeVersionlessText(track.title);
  if (!artist || !title) {
    return null;
  }
  return `${artist}::${title}`;
}

function versionQualityScore(track: Track): number {
  const title = normalizeText(track.title);
  const album = normalizeText(track.album ?? "");
  let score = 0;

  if (track.verified) {
    score += 20;
  }
  if (track.verificationConfidence === "high") {
    score += 8;
  } else if (track.verificationConfidence === "medium") {
    score += 4;
  }
  if (track.source === "itunes") {
    score += 3;
  }
  if (!VERSION_PENALTY.test(title)) {
    score += 12;
  }
  if (!VERSION_PENALTY.test(album)) {
    score += 3;
  }
  if (track.sourceUrl) {
    score += 1;
  }

  return score;
}

function bestVersion(tracks: Track[]): Track {
  return [...tracks].sort((a, b) => versionQualityScore(b) - versionQualityScore(a))[0];
}

export function removeAlternateTrackVersions(tracks: Track[]): VersionCleanupResult {
  const groups = new Map<string, Track[]>();
  const ungrouped: Track[] = [];

  for (const track of tracks) {
    const key = versionGroupKey(track);
    if (!key) {
      ungrouped.push(track);
      continue;
    }
    groups.set(key, [...(groups.get(key) ?? []), track]);
  }

  const keepIds = new Set<string>(ungrouped.map((track) => track.id));
  const removedIds = new Set<string>();

  for (const group of groups.values()) {
    if (group.length === 1) {
      keepIds.add(group[0].id);
      continue;
    }
    const keep = bestVersion(group);
    keepIds.add(keep.id);
    for (const track of group) {
      if (track.id !== keep.id) {
        removedIds.add(track.id);
      }
    }
  }

  return {
    keptTracks: tracks.filter((track) => keepIds.has(track.id)),
    removedTracks: tracks.filter((track) => removedIds.has(track.id))
  };
}
