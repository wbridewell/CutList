import { candidatePrompt } from "@/lib/ai/prompts";
import { consumeRequiredGenreAdditions, persistableConstraintsAfterRequest } from "@/lib/ai/services/constraintLifecycle";
import { activeRequestScopedConstraints } from "@/lib/ai/services/constraintLifecycle";
import { attemptLlmContract } from "@/lib/ai/services/llmService";
import { enforceNewTracks, evaluatePlaylistConstraints } from "@/lib/playlist/constraints";
import { filteredSuppressedCandidates, promptSuppressedCandidateEntries } from "@/lib/playlist/candidateSuppression";
import { normalizeText } from "@/lib/music/normalize";
import { verifyTrack } from "@/lib/music/verifyTrack";
import type { CuratorRunOptions } from "@/lib/ai/curatorTypes";
import type { CandidateExecutionResult, ResolvedCuratorRequestPlan } from "@/lib/ai/services/workflowTypes";
import type { CuratorResponse, RejectedCandidate, Track } from "@/types/playlist";

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException("Request interrupted.", "AbortError");
  }
}

function candidateKey(candidate: { artist: string; title: string }): string {
  return `${normalizeText(candidate.artist)}::${normalizeText(candidate.title)}`;
}

function rejectedCandidateKey(candidate: RejectedCandidate): string {
  return [
    candidateKey(candidate),
    normalizeText(candidate.reason),
    candidate.violatedConstraint ?? "",
    candidate.rejectionCode ?? ""
  ].join("::");
}

function mergeAttemptedMatches(
  first: RejectedCandidate["attemptedMatches"],
  second: RejectedCandidate["attemptedMatches"]
): RejectedCandidate["attemptedMatches"] {
  if (!first?.length) {
    return second;
  }
  if (!second?.length) {
    return first;
  }

  const seen = new Set<string>();
  const merged = [...first, ...second].filter((match) => {
    const key = [
      match.source,
      match.sourceId ?? "",
      normalizeText(match.artist),
      normalizeText(match.title),
      normalizeText(match.album ?? "")
    ].join("::");
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });

  return merged;
}

function mergeRejectedCandidateDetails(
  existing: RejectedCandidate,
  incoming: RejectedCandidate
): RejectedCandidate {
  return {
    ...existing,
    attemptedMatches: mergeAttemptedMatches(existing.attemptedMatches, incoming.attemptedMatches),
    rejectionCode: existing.rejectionCode ?? incoming.rejectionCode,
    llmReviewed: existing.llmReviewed ?? incoming.llmReviewed,
    prunedMatchCount: existing.prunedMatchCount ?? incoming.prunedMatchCount,
    reviewSummary: existing.reviewSummary ?? incoming.reviewSummary
  };
}

function pushUniqueRejectedCandidate(
  rejectedCandidates: RejectedCandidate[],
  candidate: RejectedCandidate
): void {
  const existingIndex = rejectedCandidates.findIndex((entry) => rejectedCandidateKey(entry) === rejectedCandidateKey(candidate));
  if (existingIndex === -1) {
    rejectedCandidates.push(candidate);
    return;
  }

  rejectedCandidates[existingIndex] = mergeRejectedCandidateDetails(rejectedCandidates[existingIndex], candidate);
}

function rejectionSummaryForRetry(rejectedCandidates: RejectedCandidate[]): string | null {
  if (rejectedCandidates.length === 0) {
    return null;
  }

  const grouped = new Map<string, string[]>();
  for (const candidate of rejectedCandidates) {
    const items = grouped.get(candidate.reason) ?? [];
    items.push(`${candidate.artist} - ${candidate.title}`);
    grouped.set(candidate.reason, items);
  }

  const lines = [...grouped].slice(0, 6).flatMap(([reason, candidates]) => [
    `Rejected because ${reason}`,
    ...candidates.slice(0, 8).map((candidate) => `- ${candidate}`)
  ]);
  return ["Previous rejected candidates in this request:", ...lines].join("\n");
}

function retryUserMessage(
  userMessage: string,
  remainingCount: number,
  blockedCandidates: Set<string>,
  rejectedCandidates: RejectedCandidate[],
  suppressedCount: number
): string {
  const blocked = [...blockedCandidates].slice(0, 80).join(", ");
  return [
    userMessage,
    "",
    `Retry instruction: propose at least ${remainingCount} additional real tracks that satisfy the existing playlist constraints.`,
    "Do not repeat tracks already in the playlist, already accepted, or previously rejected in this request.",
    "Prefer canonical, widely released studio tracks by the requested artist and closely related artists.",
    "Use only known released recordings that should appear in iTunes, Apple Music, MusicBrainz, Spotify, or similar catalogs.",
    "If the request is vibe-based, map the vibe to real catalog tracks instead of inventing atmospheric artist/title pairs.",
    "Avoid live versions, remasters, alternate mixes, covers, soundtrack outliers, joke guesses, and obscure deep cuts unless the user explicitly asks for them.",
    suppressedCount > 0 ? `Avoid ${suppressedCount} artist/title pair${suppressedCount === 1 ? "" : "s"} that were already rejected as non-credible earlier in this session.` : null,
    rejectionSummaryForRetry(rejectedCandidates),
    blocked ? `Avoid these artist/title pairs: ${blocked}` : null
  ].filter(Boolean).join("\n");
}

function summarizeTracks(tracks: Track[], limit = 4): string {
  return tracks.slice(0, limit).map((track) => `${track.artist} - ${track.title}`).join("; ");
}

function composeCuratorSummary(input: {
  acceptedTracks: Track[];
  acceptedCount: number;
  batchMessages: string[];
  constraintRemovedTracks: Track[];
  effectiveRequestedCount: number | null;
  operation: ResolvedCuratorRequestPlan["operation"];
  replacementRemovedTracks: Track[];
  rejectedCount: number;
  versionCleanup: ResolvedCuratorRequestPlan["preGenerationRemovalPlan"]["versionCleanup"];
}): string {
  const targetText = input.effectiveRequestedCount != null ? ` toward the requested ${input.effectiveRequestedCount}` : "";
  const versionRemovalText = input.versionCleanup && input.versionCleanup.removedTracks.length > 0
    ? `I kept the best versions and removed ${input.versionCleanup.removedTracks.length} alternate version${input.versionCleanup.removedTracks.length === 1 ? "" : "s"}.`
    : null;
  const constraintRemovalText = input.constraintRemovedTracks.length > 0
    ? `Removed ${input.constraintRemovedTracks.length} track${input.constraintRemovedTracks.length === 1 ? "" : "s"} to satisfy existing playlist constraints before adding replacements.`
    : null;
  const factualReplacementText = input.operation === "replace" && input.replacementRemovedTracks.length > 0
    ? [
      `Removed ${input.replacementRemovedTracks.length} track${input.replacementRemovedTracks.length === 1 ? "" : "s"} for replacement: ${summarizeTracks(input.replacementRemovedTracks)}.`,
      input.acceptedTracks.length > 0 ? `Added ${input.acceptedTracks.length} replacement track${input.acceptedTracks.length === 1 ? "" : "s"}: ${summarizeTracks(input.acceptedTracks)}.` : null
    ].filter(Boolean).join(" ")
    : null;
  const curatedMessageText = input.operation === "replace" ? null : input.batchMessages.join(" ");

  return [
    versionRemovalText,
    constraintRemovalText,
    factualReplacementText,
    curatedMessageText,
    input.acceptedCount > 0 ? `I verified and accepted ${input.acceptedCount} track${input.acceptedCount === 1 ? "" : "s"}${targetText}.` : "I could not accept any new tracks from this pass.",
    input.rejectedCount > 0 ? `I rejected ${input.rejectedCount} candidate${input.rejectedCount === 1 ? "" : "s"} because verification or constraints did not hold.` : null
  ].filter(Boolean).join(" ");
}

export async function executeCandidateGeneration(
  plan: ResolvedCuratorRequestPlan,
  options: CuratorRunOptions,
  input: {
    baseTracks: Track[];
    replacementRemovedTracks: Track[];
    effectiveRequestedCount: number | null;
  }
): Promise<CandidateExecutionResult | CuratorResponse> {
  const explicitRequestedTracks = plan.explicitTrackRequests;
  if (explicitRequestedTracks.length > 0) {
    const acceptedTracks: Track[] = [];
    const rejectedCandidates: RejectedCandidate[] = [];
    let activeConstraints = plan.constraintState.activeConstraints;

    for (const requestedTrack of explicitRequestedTracks) {
      throwIfAborted(options.signal);
      options.onProgress?.({
        stage: "verifying",
        message: `Verifying ${requestedTrack.artist} - ${requestedTrack.title}.`,
        acceptedCount: acceptedTracks.length,
        rejectedCount: rejectedCandidates.length
      });
      const outcome = await verifyTrack(requestedTrack);
      if (outcome.status === "verified") {
        const enforcement = enforceNewTracks([...input.baseTracks, ...acceptedTracks], [outcome.track], activeConstraints);
        acceptedTracks.push(...enforcement.accepted);
        for (const rejected of enforcement.rejected) {
          pushUniqueRejectedCandidate(rejectedCandidates, rejected);
        }
        activeConstraints = consumeRequiredGenreAdditions(activeConstraints, enforcement.accepted);
      } else {
        pushUniqueRejectedCandidate(rejectedCandidates, outcome.rejected);
      }
    }

    return {
      acceptedTracks,
      rejectedCandidates,
      playlistMeta: null,
      activeConstraints,
      batchMessages: []
    };
  }

  const maxAttempts = input.effectiveRequestedCount != null ? 3 : 1;
  const acceptedTracks: Track[] = [];
  const rejectedCandidates: RejectedCandidate[] = [];
  const batchMessages: string[] = [];
  const blockedCandidates = new Set(plan.playlist.tracks.map(candidateKey));
  let filteredSuppressedCandidateCount = 0;
  let playlistMeta: CuratorResponse["playlistMeta"] = null;
  let activeConstraints = plan.constraintState.activeConstraints;

  for (let attemptIndex = 0; attemptIndex < maxAttempts; attemptIndex += 1) {
    throwIfAborted(options.signal);
    const remainingCount = input.effectiveRequestedCount == null ? 0 : input.effectiveRequestedCount - acceptedTracks.length;
    if (input.effectiveRequestedCount != null && remainingCount <= 0) {
      break;
    }

    const promptPlaylist = {
      ...plan.playlist,
      tracks: [...input.baseTracks, ...acceptedTracks],
      constraints: activeConstraints
    };
    const promptMessage = attemptIndex === 0
      ? plan.userMessage
      : retryUserMessage(plan.userMessage, remainingCount, blockedCandidates, rejectedCandidates, filteredSuppressedCandidateCount);
    options.onProgress?.({
      stage: attemptIndex === 0 ? "generating" : "retrying",
      message: attemptIndex === 0
        ? "Asking the curator for candidate tracks."
        : `Running extra query ${attemptIndex + 1} because only ${acceptedTracks.length}${input.effectiveRequestedCount == null ? "" : ` of ${input.effectiveRequestedCount}`} tracks were accepted.`,
      attempt: attemptIndex + 1,
      acceptedCount: acceptedTracks.length,
      rejectedCount: rejectedCandidates.length
    });

    const attempt = await attemptLlmContract<{
      message: string;
      playlistMeta: CuratorResponse["playlistMeta"];
      candidates: Array<{
        title: string;
        artist: string;
        album: string | null;
        reason: string;
        vibeTags: string[];
        expectedFitNotes: string;
        energy: number | null;
      }>;
    }>(
      "candidateBatch",
      candidatePrompt(promptPlaylist, promptMessage, {
        requestedTrackCount: remainingCount || input.effectiveRequestedCount,
        discoveryRadius: plan.effectiveDiscoveryRadius,
        conversationContext: plan.conversationContext,
        suppressedCandidates: promptSuppressedCandidateEntries(
          plan.suppressionState.entries,
          plan.suppressionState.overriddenFingerprints
        )
      }),
      { signal: options.signal }
    );

    if (attempt.status === "fallback") {
      if (attempt.reason === "disabled") {
        const persisted = persistableConstraintsAfterRequest(
          plan.playlist.constraints,
          activeConstraints,
          activeRequestScopedConstraints(plan.constraintState)
        );
        return {
          message: "LLM provider is disabled. Pasted track-list import, verification, export, and deterministic critique still work; set LLM_PROVIDER=ollama, LLM_PROVIDER=openai, or LLM_PROVIDER=gemini for natural-language generation.",
          playlistUpdate: null,
          playlistMeta: null,
          updatedConstraints: persisted,
          constraintReport: evaluatePlaylistConstraints(plan.playlist.tracks, persisted),
          rejectedCandidates
        };
      }
      throw attempt.error;
    }

    if (batchMessages.length === 0) {
      batchMessages.push(attempt.parsed.message);
    }
    playlistMeta = playlistMeta ?? attempt.parsed.playlistMeta ?? null;
    const suppressionFiltered = filteredSuppressedCandidates(
      attempt.parsed.candidates,
      plan.suppressionState.entries,
      plan.suppressionState.overriddenFingerprints
    );
    filteredSuppressedCandidateCount += suppressionFiltered.filtered.length;

    for (const candidate of suppressionFiltered.filtered) {
      blockedCandidates.add(candidateKey(candidate));
    }

    for (const candidate of suppressionFiltered.allowed) {
      throwIfAborted(options.signal);
      if (input.effectiveRequestedCount != null && acceptedTracks.length >= input.effectiveRequestedCount) {
        break;
      }

      if (blockedCandidates.has(candidateKey(candidate))) {
        continue;
      }

      blockedCandidates.add(candidateKey(candidate));
      options.onProgress?.({
        stage: "verifying",
        message: `Verifying ${candidate.artist} - ${candidate.title}.`,
        attempt: attemptIndex + 1,
        acceptedCount: acceptedTracks.length,
        rejectedCount: rejectedCandidates.length
      });
      const outcome = await verifyTrack(
        { title: candidate.title, artist: candidate.artist, album: candidate.album },
        candidate
      );
      if (outcome.status === "verified") {
        const enforcement = enforceNewTracks([...input.baseTracks, ...acceptedTracks], [outcome.track], activeConstraints);
        acceptedTracks.push(...enforcement.accepted);
        for (const track of enforcement.accepted) {
          blockedCandidates.add(candidateKey(track));
        }
        for (const rejected of enforcement.rejected) {
          blockedCandidates.add(candidateKey(rejected));
          pushUniqueRejectedCandidate(rejectedCandidates, rejected);
        }
        activeConstraints = consumeRequiredGenreAdditions(activeConstraints, enforcement.accepted);
      } else {
        blockedCandidates.add(candidateKey(outcome.rejected));
        pushUniqueRejectedCandidate(rejectedCandidates, outcome.rejected);
      }
    }

    if (attempt.parsed.candidates.length === 0) {
      break;
    }
  }

  if (resultedInOnlySuppressedCandidates(acceptedTracks.length, filteredSuppressedCandidateCount, rejectedCandidates.length)) {
    batchMessages.push("I skipped a few previously rejected non-credible tracks from this session instead of sending them back through verification.");
  }

  return {
    acceptedTracks,
    rejectedCandidates,
    playlistMeta,
    activeConstraints,
    batchMessages
  };
}

function resultedInOnlySuppressedCandidates(
  acceptedCount: number,
  suppressedCount: number,
  rejectedCount: number
): boolean {
  return acceptedCount === 0 && suppressedCount > 0 && rejectedCount === 0;
}

export function composeGenerationResponse(
  plan: ResolvedCuratorRequestPlan,
  result: CandidateExecutionResult,
  input: {
    baseTracks: Track[];
    effectiveRequestedCount: number | null;
    preGenerationRemovedTracks: Track[];
  }
): CuratorResponse {
  const message = composeCuratorSummary({
    acceptedTracks: result.acceptedTracks,
    acceptedCount: result.acceptedTracks.length,
    batchMessages: result.batchMessages,
    constraintRemovedTracks: plan.preGenerationRemovalPlan.constraintRemovedTracks,
    effectiveRequestedCount: input.effectiveRequestedCount,
    operation: plan.operation,
    replacementRemovedTracks: input.preGenerationRemovedTracks,
    rejectedCount: result.rejectedCandidates.length,
    versionCleanup: plan.preGenerationRemovalPlan.versionCleanup
  });
  const persistedConstraints = persistableConstraintsAfterRequest(
    plan.playlist.constraints,
    result.activeConstraints,
    activeRequestScopedConstraints(plan.constraintState)
  );

  return {
    message,
    playlistUpdate: input.preGenerationRemovedTracks.length > 0 || result.acceptedTracks.length > 0
      ? {
        action: input.preGenerationRemovedTracks.length > 0 ? "set" : "add",
        tracks: input.preGenerationRemovedTracks.length > 0 ? [...input.baseTracks, ...result.acceptedTracks] : result.acceptedTracks,
        orderRationale: null
      }
      : null,
    playlistMeta: result.playlistMeta,
    updatedConstraints: persistedConstraints,
    constraintReport: evaluatePlaylistConstraints([...input.baseTracks, ...result.acceptedTracks], persistedConstraints),
    rejectedCandidates: result.rejectedCandidates
  };
}
