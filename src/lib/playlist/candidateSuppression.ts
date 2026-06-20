import { normalizedTrackKey, normalizeText } from "@/lib/music/normalize";
import type {
  CandidateTrack,
  PlaylistState,
  RejectedCandidate,
  SuppressedCandidateFingerprint
} from "@/types/playlist";

export type SuppressionDecision = {
  fingerprint: string;
  suppressed: boolean;
  overridden: boolean;
};

type CandidateIdentity = {
  artist: string;
  title: string;
};

const maxPromptEntries = 12;

export function candidateSuppressionFingerprint(identity: CandidateIdentity): string {
  return normalizedTrackKey(identity.artist, identity.title);
}

export function shouldAutoSuppressRejectedCandidate(candidate: RejectedCandidate): boolean {
  return candidate.rejectionCode === "noCredibleMatch" && !candidate.violatedConstraint;
}

export function suppressionFingerprintFromRejectedCandidate(
  candidate: RejectedCandidate,
  options: { createdAt?: string; sourceRequestId?: string } = {}
): SuppressedCandidateFingerprint | null {
  if (!shouldAutoSuppressRejectedCandidate(candidate)) {
    return null;
  }

  return {
    fingerprint: candidateSuppressionFingerprint(candidate),
    artist: candidate.artist,
    title: candidate.title,
    reasonCode: "noCredibleMatch",
    createdAt: options.createdAt ?? new Date().toISOString(),
    sourceRequestId: options.sourceRequestId
  };
}

export function mergeSuppressedCandidateFingerprints(
  existing: SuppressedCandidateFingerprint[] | undefined,
  additions: Array<SuppressedCandidateFingerprint | null | undefined>
): SuppressedCandidateFingerprint[] {
  const byFingerprint = new Map<string, SuppressedCandidateFingerprint>();

  for (const entry of existing ?? []) {
    byFingerprint.set(entry.fingerprint, entry);
  }
  for (const entry of additions) {
    if (!entry) {
      continue;
    }
    if (!byFingerprint.has(entry.fingerprint)) {
      byFingerprint.set(entry.fingerprint, entry);
    }
  }

  return [...byFingerprint.values()].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

export function mergeAutoSuppressedRejectedCandidates(
  existing: SuppressedCandidateFingerprint[] | undefined,
  rejectedCandidates: RejectedCandidate[],
  options: { createdAt?: string; sourceRequestId?: string } = {}
): SuppressedCandidateFingerprint[] {
  return mergeSuppressedCandidateFingerprints(
    existing,
    rejectedCandidates.map((candidate) => suppressionFingerprintFromRejectedCandidate(candidate, options))
  );
}

export function explicitlyRequestedSuppressionFingerprints(
  userMessage: string,
  entries: SuppressedCandidateFingerprint[] | undefined
): Set<string> {
  const normalizedMessage = normalizeText(userMessage);
  const fingerprints = new Set<string>();

  for (const entry of entries ?? []) {
    const normalizedArtist = normalizeText(entry.artist);
    const normalizedTitle = normalizeText(entry.title);
    if (!normalizedArtist || !normalizedTitle) {
      continue;
    }
    if (normalizedMessage.includes(normalizedArtist) && normalizedMessage.includes(normalizedTitle)) {
      fingerprints.add(entry.fingerprint);
    }
  }

  return fingerprints;
}

export function suppressionDecisionForCandidate(
  identity: CandidateIdentity,
  entries: SuppressedCandidateFingerprint[] | undefined,
  overriddenFingerprints: Set<string> = new Set()
): SuppressionDecision {
  const fingerprint = candidateSuppressionFingerprint(identity);
  const suppressed = (entries ?? []).some((entry) => entry.fingerprint === fingerprint);
  const overridden = overriddenFingerprints.has(fingerprint);

  return {
    fingerprint,
    suppressed: suppressed && !overridden,
    overridden
  };
}

export function isCandidateSuppressed(
  identity: CandidateIdentity,
  entries: SuppressedCandidateFingerprint[] | undefined,
  overriddenFingerprints: Set<string> = new Set()
): boolean {
  return suppressionDecisionForCandidate(identity, entries, overriddenFingerprints).suppressed;
}

export function promptSuppressedCandidateEntries(
  entries: SuppressedCandidateFingerprint[] | undefined,
  overriddenFingerprints: Set<string> = new Set(),
  limit = maxPromptEntries
): SuppressedCandidateFingerprint[] {
  return (entries ?? [])
    .filter((entry) => !overriddenFingerprints.has(entry.fingerprint))
    .slice(0, limit);
}

export function promptSuppressedCandidateLines(
  entries: SuppressedCandidateFingerprint[] | undefined,
  overriddenFingerprints: Set<string> = new Set(),
  limit = maxPromptEntries
): string[] {
  return promptSuppressedCandidateEntries(entries, overriddenFingerprints, limit)
    .map((entry) => `${entry.artist} - ${entry.title}`);
}

export function updatePlaylistSuppressedCandidates(
  playlist: PlaylistState,
  rejectedCandidates: RejectedCandidate[],
  options: { createdAt?: string; sourceRequestId?: string } = {}
): PlaylistState {
  const additions = rejectedCandidates
    .map((candidate) => suppressionFingerprintFromRejectedCandidate(candidate, options))
    .filter((entry): entry is SuppressedCandidateFingerprint => entry != null);
  if (additions.length === 0) {
    return playlist;
  }

  return {
    ...playlist,
    suppressedCandidateFingerprints: mergeSuppressedCandidateFingerprints(
      playlist.suppressedCandidateFingerprints,
      additions
    )
  };
}

export function filteredSuppressedCandidates(
  candidates: CandidateTrack[],
  entries: SuppressedCandidateFingerprint[] | undefined,
  overriddenFingerprints: Set<string> = new Set()
): { allowed: CandidateTrack[]; filtered: CandidateTrack[] } {
  const allowed: CandidateTrack[] = [];
  const filtered: CandidateTrack[] = [];

  for (const candidate of candidates) {
    if (isCandidateSuppressed(candidate, entries, overriddenFingerprints)) {
      filtered.push(candidate);
    } else {
      allowed.push(candidate);
    }
  }

  return { allowed, filtered };
}
