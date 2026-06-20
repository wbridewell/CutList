import { normalizeText } from "@/lib/music/normalize";
import { formatRuntime, sumDurations } from "@/lib/playlist/runtime";
import type { ConstraintFinding, EvidenceFieldKey, PlaylistConstraints, Track } from "@/types/playlist";

export type ConstraintRuleCategory = "hard" | "evidence" | "guidance" | "sequence";
export type ConstraintRuleEnforcementLevel = "verified_rule" | "curator_guidance";
export type ConstraintRuleScope = "track" | "playlist" | "sequence" | "candidate";
export type ConstraintMergeStrategy = "replace" | "appendUnique" | "minLimit" | "maxRequirement";
export type ConstraintEvidenceBehavior = "none" | "required" | "best_effort";

export type ConstraintRuleDefinition = {
  id: string;
  fields: Array<keyof PlaylistConstraints>;
  category: ConstraintRuleCategory;
  enforcementLevel: ConstraintRuleEnforcementLevel;
  evidenceBehavior?: ConstraintEvidenceBehavior;
  evidenceDependencies?: EvidenceFieldKey[];
  scope: ConstraintRuleScope;
  merge: ConstraintMergeStrategy;
  labels: (constraints: PlaylistConstraints) => string[];
  evaluatePlaylist?: (context: ConstraintPlaylistEvaluationContext) => ConstraintRuleEvaluation[];
  evaluateTrack?: (context: ConstraintTrackEvaluationContext) => ConstraintRuleEvaluation[];
};

export type ConstraintRuleChip = {
  key: string;
  label: string;
  ruleId: string;
};

export const constraintFieldMergeStrategies: Partial<Record<keyof PlaylistConstraints, ConstraintMergeStrategy>> = {
  allowExplicit: "replace",
  artistLimits: "minLimit",
  energyTrajectory: "replace",
  excludedArtists: "appendUnique",
  excludedGenres: "appendUnique",
  excludedTerms: "appendUnique",
  genreLimits: "minLimit",
  maxBpm: "replace",
  maxTrackDurationMs: "replace",
  maxTracks: "replace",
  maxTracksPerArtist: "minLimit",
  minBpm: "replace",
  minTrackDurationMs: "replace",
  minTracks: "replace",
  noMoreFromArtists: "appendUnique",
  noMoreFromGenres: "appendUnique",
  notes: "appendUnique",
  preferredGenres: "appendUnique",
  requiredArtists: "appendUnique",
  requiredGenreAdditions: "maxRequirement",
  targetBpm: "replace",
  targetBpmTolerance: "replace",
  targetTotalDurationMs: "replace",
  totalDurationToleranceMs: "replace",
  vocalProfile: "replace"
};

export type ConstraintTrackEvaluationContext = {
  artistCountBeforeTrack: number;
  constraints: PlaylistConstraints;
  track: Track;
};

export type ConstraintPlaylistEvaluationContext = {
  artistCounts: Map<string, number>;
  constraints: PlaylistConstraints;
  genreCounts: Map<string, number>;
  totalDurationMs: number;
  tracks: Track[];
};

export type ConstraintRuleEvaluation = {
  actionable?: boolean;
  detail?: string | null;
  message: string;
  ruleId: string;
  status: Extract<ConstraintFinding["status"], "failed" | "unknown">;
  subjectKind?: ConstraintFinding["subject"]["kind"];
  summary?: string;
  trackId?: string;
};

function vocalProfileLabel(value: NonNullable<PlaylistConstraints["vocalProfile"]>): string {
  switch (value) {
    case "female_vocals":
      return "Female vocals";
    case "male_vocals":
      return "Male vocals";
    case "mixed_vocals":
      return "Mixed vocals";
    case "instrumental":
      return "Instrumental";
    case "unspecified":
    default:
      return "Unspecified vocals";
  }
}

function bpmOutsideTarget(track: Track, target: number, tolerance: number): boolean {
  return track.bpm != null && Math.abs(track.bpm - target) > tolerance;
}

function artistMatches(trackArtist: string, ruleArtist: string): boolean {
  const track = normalizeText(trackArtist);
  const rule = normalizeText(ruleArtist);
  return track === rule || track.includes(rule) || rule.includes(track);
}

function normalizedGenreKeys(genre: string): string[] {
  const normalized = normalizeText(genre);
  const compact = normalized.replace(/\s+/g, "");
  return [normalized, compact];
}

function genreCompatibleWithRequest(tag: string, requestedGenre: string): boolean {
  const [tagText, tagCompact] = normalizedGenreKeys(tag);
  const [requestedText, requestedCompact] = normalizedGenreKeys(requestedGenre);
  return tagText === requestedText ||
    tagText.includes(requestedText) ||
    requestedText.includes(tagText) ||
    tagCompact === requestedCompact ||
    tagCompact.includes(requestedCompact) ||
    requestedCompact.includes(tagCompact);
}

function trackHasGenre(track: Track, genre: string): boolean {
  return track.genreTags.some((tag) => genreCompatibleWithRequest(tag, genre));
}

function normalizedKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function uniqueStrings(values: string[] | undefined): string[] | undefined {
  if (!values?.length) {
    return values;
  }

  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    const key = normalizedKey(trimmed);
    if (!trimmed || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

function uniqueArtistLimits(values: PlaylistConstraints["artistLimits"]): PlaylistConstraints["artistLimits"] {
  if (!values?.length) {
    return values;
  }

  const byArtist = new Map<string, NonNullable<PlaylistConstraints["artistLimits"]>[number]>();
  for (const value of values) {
    const key = normalizedKey(value.artist);
    const existing = byArtist.get(key);
    byArtist.set(key, existing
      ? { artist: existing.artist, maxTotalTracks: Math.min(existing.maxTotalTracks, value.maxTotalTracks) }
      : { artist: value.artist.trim(), maxTotalTracks: value.maxTotalTracks });
  }
  return [...byArtist.values()];
}

function uniqueGenreLimits(values: PlaylistConstraints["genreLimits"]): PlaylistConstraints["genreLimits"] {
  if (!values?.length) {
    return values;
  }

  const byGenre = new Map<string, NonNullable<PlaylistConstraints["genreLimits"]>[number]>();
  for (const value of values) {
    const key = normalizedKey(value.genre);
    const existing = byGenre.get(key);
    byGenre.set(key, existing
      ? { genre: existing.genre, maxTotalTracks: Math.min(existing.maxTotalTracks, value.maxTotalTracks) }
      : { genre: value.genre.trim(), maxTotalTracks: value.maxTotalTracks });
  }
  return [...byGenre.values()];
}

function uniqueRequiredGenreAdditions(values: PlaylistConstraints["requiredGenreAdditions"]): PlaylistConstraints["requiredGenreAdditions"] {
  if (!values?.length) {
    return values;
  }

  const byGenre = new Map<string, NonNullable<PlaylistConstraints["requiredGenreAdditions"]>[number]>();
  for (const value of values) {
    const key = normalizedKey(value.genre);
    const existing = byGenre.get(key);
    byGenre.set(key, existing
      ? { genre: existing.genre, count: Math.max(existing.count, value.count) }
      : { genre: value.genre.trim(), count: value.count });
  }
  return [...byGenre.values()];
}

function energyTrajectoryLabel(value: NonNullable<PlaylistConstraints["energyTrajectory"]>): string {
  const parts = [
    value.direction === "gradual_rise" ? "gradually increase energy" : null,
    value.direction === "gradual_fall" ? "gradually decrease energy" : null,
    value.direction === "steady" ? "keep energy steady" : null,
    value.direction === "arc" ? "shape an energy arc" : null,
    value.peakTrackNumber ? `peak by track ${value.peakTrackNumber}` : null,
    value.ending && value.ending !== "unspecified" ? `${value.ending} ending` : null
  ].filter(Boolean);
  return parts.length > 0 ? `Energy trajectory: ${parts.join(", ")}` : "Energy trajectory set";
}

function scalarRule(
  definition: Omit<ConstraintRuleDefinition, "labels"> & {
    label: (constraints: PlaylistConstraints) => string | null;
  }
): ConstraintRuleDefinition {
  return {
    ...definition,
    labels: (constraints) => {
      const label = definition.label(constraints);
      return label ? [label] : [];
    }
  };
}

export const constraintRuleRegistry: ConstraintRuleDefinition[] = [
  scalarRule({
    id: "maxTrackDurationMs",
    fields: ["maxTrackDurationMs"],
    category: "hard",
    enforcementLevel: "verified_rule",
    evidenceBehavior: "required",
    evidenceDependencies: ["durationMs"],
    scope: "track",
    merge: "replace",
    label: (constraints) => constraints.maxTrackDurationMs ? `Tracks must be ${formatRuntime(constraints.maxTrackDurationMs)} or shorter` : null,
    evaluateTrack: ({ constraints, track }) => (
      constraints.maxTrackDurationMs != null && track.durationMs != null && track.durationMs > constraints.maxTrackDurationMs
        ? [{
          ruleId: "maxTrackDurationMs",
          status: "failed",
          message: `${track.title} exceeds the maximum track runtime.`,
          summary: "exceeds the maximum track runtime.",
          trackId: track.id
        }]
        : []
    )
  }),
  scalarRule({
    id: "minTrackDurationMs",
    fields: ["minTrackDurationMs"],
    category: "hard",
    enforcementLevel: "verified_rule",
    evidenceBehavior: "required",
    evidenceDependencies: ["durationMs"],
    scope: "track",
    merge: "replace",
    label: (constraints) => constraints.minTrackDurationMs ? `Tracks must be at least ${formatRuntime(constraints.minTrackDurationMs)}` : null,
    evaluateTrack: ({ constraints, track }) => (
      constraints.minTrackDurationMs != null && track.durationMs != null && track.durationMs < constraints.minTrackDurationMs
        ? [{
          ruleId: "minTrackDurationMs",
          status: "failed",
          message: `${track.title} is below the minimum track runtime.`,
          summary: "is below the minimum track runtime.",
          trackId: track.id
        }]
        : []
    )
  }),
  {
    id: "bpmEvidence",
    fields: ["minBpm", "maxBpm", "targetBpm"],
    category: "evidence",
    enforcementLevel: "verified_rule",
    evidenceBehavior: "required",
    evidenceDependencies: ["bpm"],
    scope: "track",
    merge: "replace",
    labels: () => [],
    evaluateTrack: ({ constraints, track }) => (
      (constraints.minBpm != null || constraints.maxBpm != null || constraints.targetBpm != null) && track.bpm == null
        ? [{
          ruleId: "bpmEvidence",
          status: "unknown",
          message: `${track.title} does not have BPM evidence, so BPM constraints could not be fully verified.`,
          summary: "does not have BPM evidence, so BPM constraints could not be fully verified.",
          trackId: track.id
        }]
        : []
    )
  },
  scalarRule({
    id: "minBpm",
    fields: ["minBpm"],
    category: "evidence",
    enforcementLevel: "verified_rule",
    evidenceBehavior: "required",
    evidenceDependencies: ["bpm"],
    scope: "track",
    merge: "replace",
    label: (constraints) => constraints.minBpm ? `Tracks should be at least ${constraints.minBpm} BPM when known` : null,
    evaluateTrack: ({ constraints, track }) => (
      constraints.minBpm != null && track.bpm != null && track.bpm < constraints.minBpm
        ? [{
          ruleId: "minBpm",
          status: "failed",
          message: `${track.title} is below the minimum BPM.`,
          summary: "is below the minimum BPM.",
          trackId: track.id
        }]
        : []
    )
  }),
  scalarRule({
    id: "maxBpm",
    fields: ["maxBpm"],
    category: "evidence",
    enforcementLevel: "verified_rule",
    evidenceBehavior: "required",
    evidenceDependencies: ["bpm"],
    scope: "track",
    merge: "replace",
    label: (constraints) => constraints.maxBpm ? `Tracks should be ${constraints.maxBpm} BPM or lower when known` : null,
    evaluateTrack: ({ constraints, track }) => (
      constraints.maxBpm != null && track.bpm != null && track.bpm > constraints.maxBpm
        ? [{
          ruleId: "maxBpm",
          status: "failed",
          message: `${track.title} exceeds the maximum BPM.`,
          summary: "exceeds the maximum BPM.",
          trackId: track.id
        }]
        : []
    )
  }),
  scalarRule({
    id: "targetBpm",
    fields: ["targetBpm", "targetBpmTolerance"],
    category: "evidence",
    enforcementLevel: "verified_rule",
    evidenceBehavior: "required",
    evidenceDependencies: ["bpm"],
    scope: "track",
    merge: "replace",
    label: (constraints) => constraints.targetBpm ? `Target ${constraints.targetBpm} BPM ±${constraints.targetBpmTolerance ?? 5} when known` : null,
    evaluateTrack: ({ constraints, track }) => (
      constraints.targetBpm != null && bpmOutsideTarget(track, constraints.targetBpm, constraints.targetBpmTolerance ?? 5)
        ? [{
          ruleId: "targetBpm",
          status: "failed",
          message: `${track.title} is outside the target BPM tolerance.`,
          summary: "is outside the target BPM tolerance.",
          trackId: track.id
        }]
        : []
    )
  }),
  scalarRule({
    id: "maxTracks",
    fields: ["maxTracks"],
    category: "hard",
    enforcementLevel: "verified_rule",
    evidenceBehavior: "none",
    scope: "playlist",
    merge: "replace",
    label: (constraints) => constraints.maxTracks ? `Playlist can include at most ${constraints.maxTracks} tracks` : null,
    evaluatePlaylist: ({ constraints, tracks }) => (
      constraints.maxTracks != null && tracks.length > constraints.maxTracks
        ? [{
          ruleId: "maxTracks",
          status: "failed",
          message: `Playlist exceeds ${constraints.maxTracks} tracks.`
        }]
        : []
    )
  }),
  scalarRule({
    id: "minTracks",
    fields: ["minTracks"],
    category: "hard",
    enforcementLevel: "verified_rule",
    evidenceBehavior: "none",
    scope: "playlist",
    merge: "replace",
    label: (constraints) => constraints.minTracks ? `Playlist should include at least ${constraints.minTracks} tracks` : null,
    evaluatePlaylist: ({ constraints, tracks }) => (
      constraints.minTracks != null && tracks.length < constraints.minTracks
        ? [{
          ruleId: "minTracks",
          status: "failed",
          message: `Playlist has fewer than ${constraints.minTracks} tracks.`
        }]
        : []
    )
  }),
  scalarRule({
    id: "targetTotalDurationMs",
    fields: ["targetTotalDurationMs", "totalDurationToleranceMs"],
    category: "hard",
    enforcementLevel: "verified_rule",
    evidenceBehavior: "required",
    evidenceDependencies: ["durationMs"],
    scope: "playlist",
    merge: "replace",
    label: (constraints) => constraints.targetTotalDurationMs ? `Target playlist length ${formatRuntime(constraints.targetTotalDurationMs)}` : null,
    evaluatePlaylist: ({ constraints, totalDurationMs }) => {
      if (constraints.targetTotalDurationMs == null) {
        return [];
      }
      const tolerance = constraints.totalDurationToleranceMs ?? 0;
      const delta = Math.abs(totalDurationMs - constraints.targetTotalDurationMs);
      return delta > tolerance
        ? [{
          ruleId: "targetTotalDurationMs",
          status: "failed",
          message: "Playlist total runtime is outside the target tolerance."
        }]
        : [];
    }
  }),
  scalarRule({
    id: "allowExplicit",
    fields: ["allowExplicit"],
    category: "hard",
    enforcementLevel: "verified_rule",
    evidenceBehavior: "required",
    evidenceDependencies: ["explicit"],
    scope: "track",
    merge: "replace",
    label: (constraints) => constraints.allowExplicit === false ? "Explicit tracks are not allowed" : null,
    evaluateTrack: ({ constraints, track }) => (
      constraints.allowExplicit === false && track.explicit === true
        ? [{
          ruleId: "allowExplicit",
          status: "failed",
          message: `${track.title} is marked explicit.`,
          trackId: track.id
        }]
        : []
    )
  }),
  scalarRule({
    id: "maxTracksPerArtist",
    fields: ["maxTracksPerArtist"],
    category: "hard",
    enforcementLevel: "verified_rule",
    evidenceBehavior: "required",
    evidenceDependencies: ["artist"],
    scope: "playlist",
    merge: "minLimit",
    label: (constraints) => constraints.maxTracksPerArtist ? `No more than ${constraints.maxTracksPerArtist} track${constraints.maxTracksPerArtist === 1 ? "" : "s"} per artist` : null,
    evaluateTrack: ({ artistCountBeforeTrack, constraints, track }) => (
      constraints.maxTracksPerArtist != null && artistCountBeforeTrack >= constraints.maxTracksPerArtist
        ? [{
          ruleId: "maxTracksPerArtist",
          status: "failed",
          message: `${track.artist} already has ${constraints.maxTracksPerArtist} track${constraints.maxTracksPerArtist === 1 ? "" : "s"} in the playlist.`,
          summary: `${track.artist} already has ${constraints.maxTracksPerArtist} track${constraints.maxTracksPerArtist === 1 ? "" : "s"} in the playlist.`,
          trackId: track.id
        }]
        : []
    )
  }),
  scalarRule({
    id: "vocalProfile",
    fields: ["vocalProfile"],
    category: "guidance",
    enforcementLevel: "curator_guidance",
    evidenceBehavior: "none",
    scope: "track",
    merge: "replace",
    label: (constraints) => constraints.vocalProfile && constraints.vocalProfile !== "unspecified" ? `${vocalProfileLabel(constraints.vocalProfile)} requested` : null
  }),
  scalarRule({
    id: "energyTrajectory",
    fields: ["energyTrajectory"],
    category: "guidance",
    enforcementLevel: "curator_guidance",
    evidenceBehavior: "none",
    scope: "sequence",
    merge: "replace",
    label: (constraints) => constraints.energyTrajectory ? energyTrajectoryLabel(constraints.energyTrajectory) : null
  }),
  {
    id: "excludedArtists",
    fields: ["excludedArtists"],
    category: "hard",
    enforcementLevel: "verified_rule",
    evidenceBehavior: "required",
    evidenceDependencies: ["artist"],
    scope: "track",
    merge: "appendUnique",
    labels: (constraints) => (constraints.excludedArtists ?? []).map((artist) => `Exclude artist: ${artist}`),
    evaluateTrack: ({ constraints, track }) => (
      (constraints.excludedArtists ?? []).some((artist) => artistMatches(track.artist, artist))
        ? [{
          ruleId: "excludedArtists",
          status: "failed",
          message: `${track.artist} is blocked.`,
          trackId: track.id
        }]
        : []
    )
  },
  {
    id: "noMoreFromArtists",
    fields: ["noMoreFromArtists"],
    category: "hard",
    enforcementLevel: "verified_rule",
    evidenceBehavior: "required",
    evidenceDependencies: ["artist"],
    scope: "candidate",
    merge: "appendUnique",
    labels: (constraints) => (constraints.noMoreFromArtists ?? []).map((artist) => `No more tracks from ${artist}`),
    evaluateTrack: ({ constraints, track }) => (
      (constraints.noMoreFromArtists ?? []).some((artist) => artistMatches(track.artist, artist))
        ? [{
          ruleId: "noMoreFromArtists",
          status: "failed",
          message: `No more tracks from ${track.artist} are allowed.`,
          trackId: track.id
        }]
        : []
    )
  },
  {
    id: "artistLimits",
    fields: ["artistLimits"],
    category: "hard",
    enforcementLevel: "verified_rule",
    evidenceBehavior: "required",
    evidenceDependencies: ["artist"],
    scope: "playlist",
    merge: "minLimit",
    labels: (constraints) => (constraints.artistLimits ?? []).map((limit) => `${limit.artist}: no more than ${limit.maxTotalTracks} total`),
    evaluatePlaylist: ({ artistCounts, constraints }) => (constraints.artistLimits ?? []).flatMap((limit) => {
      const count = [...artistCounts].reduce((total, [artist, value]) => {
        return artistMatches(artist, limit.artist) ? total + value : total;
      }, 0);
      return count > limit.maxTotalTracks
        ? [{
          ruleId: "artistLimits",
          status: "failed" as const,
          message: `${limit.artist} exceeds the artist quota of ${limit.maxTotalTracks}.`
        }]
        : [];
    })
  },
  {
    id: "noMoreFromGenres",
    fields: ["noMoreFromGenres"],
    category: "hard",
    enforcementLevel: "verified_rule",
    evidenceBehavior: "best_effort",
    evidenceDependencies: ["genreTags"],
    scope: "candidate",
    merge: "appendUnique",
    labels: (constraints) => (constraints.noMoreFromGenres ?? []).map((genre) => `No more ${genre} tracks`),
    evaluateTrack: ({ constraints, track }) => (
      (constraints.noMoreFromGenres ?? []).some((genre) => trackHasGenre(track, genre))
        ? [{
          ruleId: "noMoreFromGenres",
          status: "failed",
          message: `${track.title} matches a genre with no more additions allowed.`,
          trackId: track.id
        }]
        : []
    )
  },
  {
    id: "excludedGenres",
    fields: ["excludedGenres"],
    category: "hard",
    enforcementLevel: "verified_rule",
    evidenceBehavior: "best_effort",
    evidenceDependencies: ["genreTags"],
    scope: "track",
    merge: "appendUnique",
    labels: (constraints) => (constraints.excludedGenres ?? []).map((genre) => `Exclude genre: ${genre}`),
    evaluateTrack: ({ constraints, track }) => (
      (constraints.excludedGenres ?? []).some((genre) => trackHasGenre(track, genre))
        ? [{
          ruleId: "excludedGenres",
          status: "failed",
          message: `${track.title} matches a blocked genre.`,
          trackId: track.id
        }]
        : []
    )
  },
  {
    id: "genreLimits",
    fields: ["genreLimits"],
    category: "hard",
    enforcementLevel: "verified_rule",
    evidenceBehavior: "best_effort",
    evidenceDependencies: ["genreTags"],
    scope: "playlist",
    merge: "minLimit",
    labels: (constraints) => (constraints.genreLimits ?? []).map((limit) => `${limit.genre}: no more than ${limit.maxTotalTracks} total`),
    evaluatePlaylist: ({ constraints, genreCounts }) => (constraints.genreLimits ?? []).flatMap((limit) => {
      const normalized = normalizeText(limit.genre);
      const count = [...genreCounts].reduce((total, [genre, value]) => {
        return genre === normalized || genre.includes(normalized) ? total + value : total;
      }, 0);
      return count > limit.maxTotalTracks
        ? [{
          ruleId: "genreLimits",
          status: "failed" as const,
          message: `${limit.genre} exceeds the genre quota of ${limit.maxTotalTracks}.`
        }]
        : [];
    })
  },
  {
    id: "requiredGenreAdditions",
    fields: ["requiredGenreAdditions"],
    category: "guidance",
    enforcementLevel: "curator_guidance",
    evidenceBehavior: "none",
    scope: "candidate",
    merge: "maxRequirement",
    labels: (constraints) => (constraints.requiredGenreAdditions ?? []).map((item) => `Need ${item.count} more ${item.genre} track${item.count === 1 ? "" : "s"}`)
  },
  {
    id: "requiredArtists",
    fields: ["requiredArtists"],
    category: "guidance",
    enforcementLevel: "curator_guidance",
    evidenceBehavior: "none",
    scope: "candidate",
    merge: "appendUnique",
    labels: (constraints) => (constraints.requiredArtists ?? []).map((artist) => `Need tracks from ${artist}`)
  },
  {
    id: "preferredGenres",
    fields: ["preferredGenres"],
    category: "guidance",
    enforcementLevel: "curator_guidance",
    evidenceBehavior: "none",
    scope: "candidate",
    merge: "appendUnique",
    labels: (constraints) => (constraints.preferredGenres ?? []).map((genre) => `Prefer ${genre}`)
  },
  {
    id: "notes",
    fields: ["notes"],
    category: "guidance",
    enforcementLevel: "curator_guidance",
    evidenceBehavior: "none",
    scope: "candidate",
    merge: "appendUnique",
    labels: (constraints) => constraints.notes ?? []
  },
  {
    id: "excludedTerms",
    fields: ["excludedTerms"],
    category: "hard",
    enforcementLevel: "verified_rule",
    evidenceBehavior: "required",
    evidenceDependencies: ["title", "artist"],
    scope: "track",
    merge: "appendUnique",
    labels: (constraints) => (constraints.excludedTerms ?? []).map((term) => `Exclude text: ${term}`),
    evaluateTrack: ({ constraints, track }) => (constraints.excludedTerms ?? []).flatMap((term) => {
      const text = normalizeText(`${track.title} ${track.artist} ${track.album ?? ""}`);
      return text.includes(normalizeText(term))
        ? [{
          ruleId: "excludedTerms",
          status: "failed" as const,
          message: `${track.title} contains excluded text "${term}".`,
          trackId: track.id
        }]
        : [];
    })
  }
];

function fieldIsActive(value: PlaylistConstraints[keyof PlaylistConstraints]): boolean {
  if (value == null) {
    return false;
  }
  if (typeof value === "string") {
    return value.trim().length > 0;
  }
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  return true;
}

export function isConstraintRuleActive(rule: ConstraintRuleDefinition, constraints: PlaylistConstraints): boolean {
  return rule.fields.some((field) => fieldIsActive(constraints[field]));
}

export function getConstraintRuleById(ruleId: string): ConstraintRuleDefinition | undefined {
  return constraintRuleRegistry.find((rule) => rule.id === ruleId);
}

export function getActiveConstraintRules(
  constraints: PlaylistConstraints,
  options: { enforcementLevel?: ConstraintRuleEnforcementLevel } = {}
): ConstraintRuleDefinition[] {
  return constraintRuleRegistry.filter((rule) => {
    if (options.enforcementLevel && rule.enforcementLevel !== options.enforcementLevel) {
      return false;
    }
    return isConstraintRuleActive(rule, constraints);
  });
}

export function getConstraintRuleChips(
  constraints: PlaylistConstraints,
  options: { enforcementLevel?: ConstraintRuleEnforcementLevel } = {}
): ConstraintRuleChip[] {
  return constraintRuleRegistry.flatMap((rule) => {
    if (options.enforcementLevel && rule.enforcementLevel !== options.enforcementLevel) {
      return [];
    }
    const labels = rule.labels(constraints);
    return labels.map((label, index) => ({
      key: labels.length === 1 ? rule.id : `${rule.id}:${index}`,
      label,
      ruleId: rule.id
    }));
  });
}

export function evaluateRegisteredTrackConstraintRules(context: ConstraintTrackEvaluationContext): ConstraintRuleEvaluation[] {
  return getActiveConstraintRules(context.constraints, { enforcementLevel: "verified_rule" })
    .flatMap((rule) => rule.evaluateTrack?.(context) ?? []);
}

export function evaluateRegisteredPlaylistConstraintRules(context: ConstraintPlaylistEvaluationContext): ConstraintRuleEvaluation[] {
  return getActiveConstraintRules(context.constraints, { enforcementLevel: "verified_rule" })
    .flatMap((rule) => rule.evaluatePlaylist?.(context) ?? []);
}

function mergeScalarMinLimit<T extends keyof PlaylistConstraints>(
  merged: PlaylistConstraints,
  field: T,
  incoming: PlaylistConstraints[T]
): void {
  const current = merged[field];
  if (incoming == null || typeof incoming !== "number") {
    Object.assign(merged, { [field]: incoming });
    return;
  }
  if (current == null || typeof current !== "number") {
    Object.assign(merged, { [field]: incoming });
    return;
  }
  Object.assign(merged, { [field]: Math.min(current, incoming) });
}

function mergeConstraintField<T extends keyof PlaylistConstraints>(
  merged: PlaylistConstraints,
  field: T,
  incoming: PlaylistConstraints[T]
): void {
  const strategy = constraintFieldMergeStrategies[field] ?? "replace";
  if (strategy === "appendUnique") {
    const current = Array.isArray(merged[field]) ? merged[field] : [];
    const next = Array.isArray(incoming) ? incoming : [];
    Object.assign(merged, { [field]: uniqueStrings([...(current as string[]), ...(next as string[])]) });
    return;
  }

  if (field === "artistLimits") {
    Object.assign(merged, {
      artistLimits: uniqueArtistLimits([
        ...(merged.artistLimits ?? []),
        ...(incoming as PlaylistConstraints["artistLimits"] ?? [])
      ])
    });
    return;
  }

  if (field === "genreLimits") {
    Object.assign(merged, {
      genreLimits: uniqueGenreLimits([
        ...(merged.genreLimits ?? []),
        ...(incoming as PlaylistConstraints["genreLimits"] ?? [])
      ])
    });
    return;
  }

  if (field === "requiredGenreAdditions") {
    Object.assign(merged, {
      requiredGenreAdditions: uniqueRequiredGenreAdditions([
        ...(merged.requiredGenreAdditions ?? []),
        ...(incoming as PlaylistConstraints["requiredGenreAdditions"] ?? [])
      ])
    });
    return;
  }

  if (strategy === "minLimit") {
    mergeScalarMinLimit(merged, field, incoming);
    return;
  }

  Object.assign(merged, { [field]: incoming });
}

export function mergeConstraintLayersWithRegistry(...layers: Array<PlaylistConstraints | undefined>): PlaylistConstraints {
  const merged: PlaylistConstraints = {};
  const fields = Object.keys(constraintFieldMergeStrategies) as Array<keyof PlaylistConstraints>;

  for (const layer of layers) {
    if (!layer) {
      continue;
    }

    for (const field of fields) {
      if (field in layer) {
        mergeConstraintField(merged, field, layer[field]);
      }
    }
  }

  return merged;
}
