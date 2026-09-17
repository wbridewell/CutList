import { importDraftOrChat, verifySeedTracks } from "@/lib/client/desktopPlaylistBridge";
import { bindDeclaredTrackPlacement, detectDeclaredTrackPlacement } from "@/lib/playlist/requestPlacement";
import { createImportHistoryEntry, createManualMatchHistoryEntry, createSeedVerificationHistoryEntry, trackFromAttemptedMatch, type RequestHistoryEntry } from "@/lib/playlist/collaboration";
import { addTracksToPlaylist, insertTracksAfterTrack, insertTracksBeforeTrack, isDuplicateTrack, touchPlaylist } from "@/lib/playlist/state";
import { parseTrackRowsFromText } from "@/lib/playlist/io/textImport";
import type { AttemptedMatch, ImportChatResponse, PlaylistState } from "@/types/playlist";
import { workflowErrorResult } from "./shared";
import type { ClientWorkflowResult, ImportWorkflowDependencies, SeedVerificationDependencies } from "./shared";

export async function runSeedVerificationWorkflow(
  input: {
    playlist: PlaylistState;
    seedText: string;
  },
  dependencies: SeedVerificationDependencies = {}
): Promise<ClientWorkflowResult> {
  const tracks = parseTrackRowsFromText(input.seedText);
  if (tracks.length === 0) {
    return {
      assistantMessage: {
        role: "assistant",
        content: "I could not read any seed tracks. Use one track per line as Artist - Title, Title / Artist / Album separated by tabs, or Title, Artist, Album."
      }
    };
  }

  try {
    const verifySeeds = dependencies.verifySeeds ?? verifySeedTracks;
    const data = await verifySeeds(tracks);
    return {
      assistantMessage: {
        role: "assistant",
        content: `Verified ${data.verified.length} seed track${data.verified.length === 1 ? "" : "s"}. ${data.rejected.length ? `${data.rejected.length} could not be accepted.` : ""}`
      },
      clearInput: true,
      historyEntry: createSeedVerificationHistoryEntry(data.verified.length, data.rejected),
      nextPlaylist: addTracksToPlaylist(input.playlist, data.verified)
    };
  } catch (error) {
    return workflowErrorResult("Verify seed tracks", error, "Seed verification failed.");
  }
}

export async function runImportWorkflow(
  input: {
    importText: string;
    playlist: PlaylistState;
  },
  dependencies: ImportWorkflowDependencies = {}
): Promise<ClientWorkflowResult | null> {
  if (!input.importText.trim()) {
    return null;
  }

  try {
    const importText = dependencies.importText ?? importDraftOrChat;
    const data: ImportChatResponse = await importText(input.importText);
    return {
      assistantMessage: {
        role: "assistant",
        content: [
          data.extractedVibeBrief ? `Vibe brief: ${data.extractedVibeBrief}` : null,
          `Imported ${data.verifiedTracks.length} verified track${data.verifiedTracks.length === 1 ? "" : "s"} and rejected ${data.rejectedCandidates.length}.`,
          data.suggestedNextPrompt ? `Next: ${data.suggestedNextPrompt}` : null
        ].filter(Boolean).join("\n")
      },
      clearInput: true,
      historyEntry: createImportHistoryEntry(data.verifiedTracks.length, data.rejectedCandidates, data.extractedVibeBrief),
      nextPlaylist: {
        ...input.playlist,
        mood: data.extractedVibeBrief ?? input.playlist.mood,
        constraints: data.extractedConstraints,
        tracks: [...input.playlist.tracks, ...data.verifiedTracks],
        updatedAt: new Date().toISOString()
      }
    };
  } catch (error) {
    return workflowErrorResult("Import and verify", error, "Import failed.");
  }
}

export function shouldWarnAboutUnverifiedPastedTracks(userMessage: string, playlist: PlaylistState): boolean {
  return (
    userMessage.trim().length > 0 &&
    parseTrackRowsFromText(userMessage, { allowHeaderlessCommaRows: false }).length > 0 &&
    playlist.tracks.length === 0
  );
}

export function acceptManualMatchWorkflow(
  playlist: PlaylistState,
  match: AttemptedMatch,
  options: { historyEntry?: RequestHistoryEntry | null } = {}
): ClientWorkflowResult {
  const track = trackFromAttemptedMatch(match);
  if (!track) {
    return {
      assistantMessage: { role: "assistant", content: "That match is missing a provider id, so I cannot safely add it." }
    };
  }

  if (isDuplicateTrack(playlist, track)) {
    return {
      assistantMessage: { role: "assistant", content: `${track.artist} - ${track.title} is already in the playlist.` }
    };
  }

  const historyEntry = options.historyEntry;
  const nextPlaylist = (() => {
    const placement = historyEntry?.pendingEditContext?.kind === "add"
      ? historyEntry.pendingEditContext.placement
      : historyEntry?.userMessage
        ? bindDeclaredTrackPlacement(playlist, detectDeclaredTrackPlacement(historyEntry.userMessage))
        : null;
    if (placement?.mode === "prepend") {
      return touchPlaylist({
        ...playlist,
        tracks: [track, ...playlist.tracks]
      });
    }
    if (placement?.mode === "after_track" && placement.anchorTrackId) {
      return insertTracksAfterTrack(playlist, placement.anchorTrackId, [track]);
    }
    if (placement?.mode === "before_track" && placement.anchorTrackId) {
      return insertTracksBeforeTrack(playlist, placement.anchorTrackId, [track]);
    }

    if (historyEntry?.pendingEditContext?.kind === "replace" && historyEntry.pendingEditContext.replacementSlotIndex != null) {
      const insertAt = historyEntry.pendingEditContext.replacementSlotIndex;
      return touchPlaylist({
        ...playlist,
        tracks: [
          ...playlist.tracks.slice(0, insertAt),
          track,
          ...playlist.tracks.slice(insertAt)
        ]
      });
    }

    if (!historyEntry?.playlistBefore || historyEntry.playlistAction !== "set") {
      return addTracksToPlaylist(playlist, [track]);
    }

    const currentIds = new Set(playlist.tracks.map((item) => item.id));
    const missingIndexes = historyEntry.playlistBefore.tracks
      .map((item, index) => currentIds.has(item.id) ? null : index)
      .filter((index): index is number => index != null);

    if (missingIndexes.length !== 1) {
      return addTracksToPlaylist(playlist, [track]);
    }

    const insertAt = missingIndexes[0];
    return touchPlaylist({
      ...playlist,
      tracks: [
        ...playlist.tracks.slice(0, insertAt),
        track,
        ...playlist.tracks.slice(insertAt)
      ]
    });
  })();

  return {
    assistantMessage: {
      role: "assistant",
      content: `${match.isRecommended ? "Added recommended match" : "Added manually reviewed match"}: ${track.artist} - ${track.title}.`
    },
    historyEntry: createManualMatchHistoryEntry(track, { recommended: match.isRecommended }),
    nextPlaylist,
    suppressAssistantMessage: true
  };
}
