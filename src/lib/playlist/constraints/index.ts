import { normalizedTrackKey, normalizeText } from "@/lib/music/normalize";
import {
  getActiveConstraintRules,
  evaluateRegisteredPlaylistConstraintRules,
  evaluateRegisteredTrackConstraintRules
} from "@/lib/playlist/constraints/registry";
import { sumDurations } from "@/lib/playlist/runtime";
import type {
  ConstraintCoverageFieldReport,
  ConstraintCoverageReport,
  ConstraintFinding,
  ConstraintReport,
  EvidenceFieldKey,
  PlaylistConstraints,
  RejectedCandidate,
  Track
} from "@/types/playlist";

type EnforcementResult = {
  accepted: Track[];
  rejected: RejectedCandidate[];
  report: ConstraintReport;
};

function fieldAvailable(track: Track, field: EvidenceFieldKey): boolean {
  switch (field) {
    case "title":
      return track.title.trim().length > 0;
    case "artist":
      return track.artist.trim().length > 0;
    case "durationMs":
      return track.durationMs != null;
    case "explicit":
      return typeof track.explicit === "boolean";
    case "genreTags":
      return track.genreTags.length > 0;
    case "bpm":
      return track.bpm != null;
    case "sourceIdentity":
      return Boolean(track.source && track.sourceId);
    default:
      return false;
  }
}

function coverageSummary(field: EvidenceFieldKey, availableTrackCount: number, totalTrackCount: number): string {
  const missingTrackCount = Math.max(0, totalTrackCount - availableTrackCount);
  if (field === "bpm") {
    return `BPM data is missing for ${missingTrackCount} of ${totalTrackCount} tracks, so BPM rules could only be partially verified.`;
  }
  if (field === "genreTags") {
    return `Genre tags are sparse for ${missingTrackCount} of ${totalTrackCount} tracks; genre-based rules rely on broad provider tagging.`;
  }
  if (field === "explicit") {
    return `Explicitness is unknown for ${missingTrackCount} of ${totalTrackCount} tracks.`;
  }
  if (field === "durationMs") {
    return `Runtime metadata is missing for ${missingTrackCount} of ${totalTrackCount} tracks, so duration rules could not be fully verified.`;
  }
  if (field === "sourceIdentity") {
    return `Provider identity is missing for ${missingTrackCount} of ${totalTrackCount} tracks, so duplicate evidence is weaker than usual.`;
  }
  return `${field} metadata is missing for ${missingTrackCount} of ${totalTrackCount} tracks.`;
}

function createCoverageReport(tracks: Track[], constraints: PlaylistConstraints): ConstraintCoverageReport | undefined {
  const activeRules = getActiveConstraintRules(constraints, { enforcementLevel: "verified_rule" });
  const activeVerifiedRuleIds = activeRules
    .filter((rule) => rule.id !== "bpmEvidence")
    .map((rule) => rule.id);
  const dependencies = new Map<EvidenceFieldKey, string[]>();

  for (const rule of activeRules) {
    if (rule.evidenceBehavior === "none" || !rule.evidenceDependencies?.length) {
      continue;
    }
    if (rule.category === "evidence" && rule.id === "bpmEvidence") {
      continue;
    }
    for (const field of rule.evidenceDependencies) {
      const existing = dependencies.get(field) ?? [];
      if (!existing.includes(rule.id)) {
        existing.push(rule.id);
      }
      dependencies.set(field, existing);
    }
  }

  const fields: ConstraintCoverageFieldReport[] = [...dependencies.entries()].map(([field, ruleIds]) => {
    const totalTrackCount = tracks.length;
    const availableTrackCount = tracks.filter((track) => fieldAvailable(track, field)).length;
    const missingTrackCount = Math.max(0, totalTrackCount - availableTrackCount);
    const coverageRatio = totalTrackCount === 0 ? 1 : availableTrackCount / totalTrackCount;
    const status: ConstraintCoverageFieldReport["status"] = missingTrackCount === 0
      ? "healthy"
      : availableTrackCount === 0
        ? "missing"
        : "partial";

    return {
      field,
      activeRuleIds: ruleIds,
      status,
      availableTrackCount,
      missingTrackCount,
      totalTrackCount,
      coverageRatio,
      summary: coverageSummary(field, availableTrackCount, totalTrackCount)
    };
  }).filter((report) => report.status !== "healthy");

  if (fields.length === 0 && activeVerifiedRuleIds.length === 0) {
    return undefined;
  }

  return {
    activeVerifiedRuleIds,
    fields,
    summary: fields.map((field) => field.summary)
  };
}

function reject(track: Track, type: string, message: string): RejectedCandidate {
  return {
    title: track.title,
    artist: track.artist,
    reason: message,
    violatedConstraint: type,
    attemptedMatches: [{
      title: track.title,
      artist: track.artist,
      durationMs: track.durationMs,
      runtime: track.runtime,
      source: track.source ?? "manual",
      sourceUrl: track.sourceUrl
    }]
  };
}

function findingSubject(trackId?: string, kind: ConstraintFinding["subject"]["kind"] = trackId ? "track" : "playlist"): ConstraintFinding["subject"] {
  return trackId ? { kind, trackId } : { kind };
}

function addViolation(
  violations: ConstraintReport["violations"],
  findings: ConstraintFinding[],
  type: string,
  message: string,
  options: {
    actionable?: boolean;
    detail?: string | null;
    subjectKind?: ConstraintFinding["subject"]["kind"];
    summary?: string;
    trackId?: string;
  } = {}
): void {
  legacyViolation(violations, type, message, options.trackId);
  findings.push({
    ruleId: type,
    status: "failed",
    subject: findingSubject(options.trackId, options.subjectKind),
    summary: options.summary ?? message,
    detail: options.detail,
    actionable: options.actionable ?? options.trackId != null
  });
}

function addUnknownFinding(
  warnings: NonNullable<ConstraintReport["evidenceWarnings"]>,
  findings: ConstraintFinding[],
  type: string,
  message: string,
  options: {
    detail?: string | null;
    subjectKind?: ConstraintFinding["subject"]["kind"];
    summary?: string;
    trackId?: string;
  } = {}
): void {
  warnings.push({ type, message, trackId: options.trackId });
  findings.push({
    ruleId: type,
    status: "unknown",
    subject: findingSubject(options.trackId, options.subjectKind),
    summary: options.summary ?? message,
    detail: options.detail,
    actionable: false
  });
}

function legacyViolation(
  violations: ConstraintReport["violations"],
  type: string,
  message: string,
  trackId?: string
): void {
  violations.push(trackId ? { type, message, trackId } : { type, message });
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

function genreCountForTracks(tracks: Track[], genre: string): number {
  return tracks.reduce((total, track) => {
    return track.genreTags.some((tag) => genreCompatibleWithRequest(tag, genre))
      ? total + 1
      : total;
  }, 0);
}

function playlistLevelViolationForCandidate(
  track: Track,
  existingTracks: Track[],
  proposed: Track[],
  constraints: PlaylistConstraints
): { message: string; type: string } | null {
  if (constraints.maxTracks != null && proposed.length > constraints.maxTracks) {
    return {
      type: "maxTracks",
      message: `Playlist exceeds ${constraints.maxTracks} tracks.`
    };
  }

  if (constraints.targetTotalDurationMs != null) {
    const target = constraints.targetTotalDurationMs + (constraints.totalDurationToleranceMs ?? 0);
    if (sumDurations(proposed) > target) {
      return {
        type: "targetTotalDurationMs",
        message: "Playlist total runtime is outside the target tolerance."
      };
    }
  }

  for (const limit of constraints.artistLimits ?? []) {
    const before = existingTracks.reduce((total, existingTrack) => {
      return artistMatches(existingTrack.artist, limit.artist) ? total + 1 : total;
    }, 0);
    const after = proposed.reduce((total, proposedTrack) => {
      return artistMatches(proposedTrack.artist, limit.artist) ? total + 1 : total;
    }, 0);
    const candidateMatches = artistMatches(track.artist, limit.artist);
    if (candidateMatches && after > limit.maxTotalTracks && after > before) {
      return {
        type: "artistLimits",
        message: `${limit.artist} exceeds the artist quota of ${limit.maxTotalTracks}.`
      };
    }
  }

  for (const limit of constraints.genreLimits ?? []) {
    const before = genreCountForTracks(existingTracks, limit.genre);
    const after = genreCountForTracks(proposed, limit.genre);
    const candidateMatches = track.genreTags.some((tag) => genreCompatibleWithRequest(tag, limit.genre));
    if (candidateMatches && after > limit.maxTotalTracks && after > before) {
      return {
        type: "genreLimits",
        message: `${limit.genre} exceeds the genre quota of ${limit.maxTotalTracks}.`
      };
    }
  }

  return null;
}

export function evaluatePlaylistConstraints(tracks: Track[], constraints: PlaylistConstraints): ConstraintReport {
  const violations: ConstraintReport["violations"] = [];
  const evidenceWarnings: NonNullable<ConstraintReport["evidenceWarnings"]> = [];
  const findings: ConstraintFinding[] = [];
  const seen = new Set<string>();
  const artistCounts = new Map<string, number>();
  const genreCounts = new Map<string, number>();

  tracks.forEach((track) => {
    const duplicateKey = track.sourceId ? `${track.source}:${track.sourceId}` : normalizedTrackKey(track.artist, track.title);
    if (seen.has(duplicateKey)) {
      addViolation(violations, findings, "duplicate", `${track.artist} - ${track.title} is duplicated.`, { trackId: track.id });
    }
    seen.add(duplicateKey);

    const artistKey = normalizeText(track.artist);
    const artistCount = artistCounts.get(artistKey) ?? 0;
    for (const evaluation of evaluateRegisteredTrackConstraintRules({ artistCountBeforeTrack: artistCount, constraints, track })) {
      if (evaluation.status === "failed") {
        addViolation(violations, findings, evaluation.ruleId, evaluation.message, {
          actionable: evaluation.actionable,
          detail: evaluation.detail,
          subjectKind: evaluation.subjectKind,
          summary: evaluation.summary,
          trackId: evaluation.trackId
        });
      } else {
        addUnknownFinding(evidenceWarnings, findings, evaluation.ruleId, evaluation.message, {
          detail: evaluation.detail,
          subjectKind: evaluation.subjectKind,
          summary: evaluation.summary,
          trackId: evaluation.trackId
        });
      }
    }
    artistCounts.set(artistKey, artistCount + 1);
    for (const genre of track.genreTags) {
      const genreKey = normalizeText(genre);
      genreCounts.set(genreKey, (genreCounts.get(genreKey) ?? 0) + 1);
    }
  });

  const totalDurationMs = sumDurations(tracks);

  for (const evaluation of evaluateRegisteredPlaylistConstraintRules({ artistCounts, constraints, genreCounts, totalDurationMs, tracks })) {
    if (evaluation.status === "failed") {
      addViolation(violations, findings, evaluation.ruleId, evaluation.message, {
        actionable: evaluation.actionable,
        detail: evaluation.detail,
        subjectKind: evaluation.subjectKind,
        summary: evaluation.summary,
        trackId: evaluation.trackId
      });
    } else {
      addUnknownFinding(evidenceWarnings, findings, evaluation.ruleId, evaluation.message, {
        detail: evaluation.detail,
        subjectKind: evaluation.subjectKind,
        summary: evaluation.summary,
        trackId: evaluation.trackId
      });
    }
  }

  return {
    passed: violations.length === 0,
    totalDurationMs,
    violations,
    evidenceWarnings,
    findings,
    coverage: createCoverageReport(tracks, constraints)
  };
}

export function enforceNewTracks(
  existingTracks: Track[],
  candidateTracks: Track[],
  constraints: PlaylistConstraints
): EnforcementResult {
  const accepted: Track[] = [];
  const rejected: RejectedCandidate[] = [];

  for (const track of candidateTracks) {
    const baseline = [...existingTracks, ...accepted];
    const proposed = [...baseline, track];
    const report = evaluatePlaylistConstraints(proposed, constraints);
    const trackViolation = report.violations.find((violation) => violation.trackId === track.id)
      ?? playlistLevelViolationForCandidate(track, baseline, proposed, constraints);

    if (trackViolation) {
      rejected.push(reject(track, trackViolation.type, trackViolation.message));
    } else {
      accepted.push(track);
    }
  }

  const report = evaluatePlaylistConstraints([...existingTracks, ...accepted], constraints);

  return {
    accepted,
    rejected,
    report
  };
}
