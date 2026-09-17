import { sendPlaylistMessageStream } from "@/lib/client/desktopPlaylistBridge";
import { bindDeclaredTrackPlacement, detectCanonicalReplacementTargetQuery, detectDeclaredTrackPlacement, resolveNamedTrack } from "@/lib/playlist/requestPlacement";
import { createRequestHistoryEntry, rejectedCandidateSummary, reorderSummaryForMessage, type ChatMessage, type PendingEditContext } from "@/lib/playlist/collaboration";
import { emitReviewRoutingTrace } from "@/lib/debug/reviewRouting";
import { applyCuratorResponse } from "@/lib/playlist/state";
import type { CuratorResponse, PlaylistState, PrecomputedOperatorPlan } from "@/types/playlist";
import { buildConversationContext, createCompletedRequestMessages, createRequestMessageList, playlistChangedMeaningfully, workflowErrorResult } from "./shared";
import type { CuratorRequestDependencies, CuratorRequestWorkflowResult } from "./shared";

export function composeCuratorAssistantMessage(response: CuratorResponse, playlistBefore: PlaylistState): string {
  return [
    response.message,
    reorderSummaryForMessage(response, playlistBefore),
    rejectedCandidateSummary(response.rejectedCandidates)
  ].filter(Boolean).join("\n\n");
}

function derivePendingEditContext(
  userMessage: string,
  playlistBefore: PlaylistState,
  response: CuratorResponse
): PendingEditContext | undefined {
  const placement = bindDeclaredTrackPlacement(playlistBefore, detectDeclaredTrackPlacement(userMessage));
  if (placement) {
    return {
      kind: "add",
      placement,
      replacementMode: "generic",
      replacementTargetTrackId: null,
      replacementTargetLabel: null,
      replacementSlotIndex: null
    };
  }

  const replacementTargetQuery = detectCanonicalReplacementTargetQuery(playlistBefore, userMessage);
  if (replacementTargetQuery) {
    const boundTarget = resolveNamedTrack(playlistBefore, replacementTargetQuery);
    if (boundTarget.trackId) {
      return {
        kind: "replace",
        placement: null,
        replacementMode: "canonical_version",
        replacementTargetTrackId: boundTarget.trackId,
        replacementTargetLabel: boundTarget.title && boundTarget.artist ? `${boundTarget.artist} - ${boundTarget.title}` : null,
        replacementSlotIndex: playlistBefore.tracks.findIndex((track) => track.id === boundTarget.trackId)
      };
    }
  }

  if (response.playlistUpdate?.action !== "set" || !response.playlistUpdate.tracks) {
    return undefined;
  }
  const nextTrackIds = new Set(response.playlistUpdate.tracks.map((track) => track.id));
  const removedTracks = playlistBefore.tracks.filter((track) => !nextTrackIds.has(track.id));
  if (removedTracks.length !== 1) {
    return undefined;
  }

  const removedTrack = removedTracks[0];
  return {
    kind: "replace",
    placement: null,
    replacementMode: "generic",
    replacementTargetTrackId: removedTrack.id,
    replacementTargetLabel: `${removedTrack.artist} - ${removedTrack.title}`,
    replacementSlotIndex: playlistBefore.tracks.findIndex((track) => track.id === removedTrack.id)
  };
}

export async function runCuratorRequestWorkflow(
  input: {
    messages: ChatMessage[];
    outgoing: string;
    playlist: PlaylistState;
    requestId?: string;
    precomputedPlan?: PrecomputedOperatorPlan;
  },
  dependencies: CuratorRequestDependencies
): Promise<CuratorRequestWorkflowResult> {
  const requestMessages = createRequestMessageList(input.messages, input.outgoing);
  emitReviewRoutingTrace("workflow.runCuratorRequest.start", {
    requestId: input.requestId ?? null,
    outgoing: input.outgoing
  });

  try {
    const sendMessage = dependencies.sendMessage ?? sendPlaylistMessageStream;
    const data = await sendMessage(
      {
        playlist: input.playlist,
        requestId: input.requestId,
        userMessage: input.outgoing,
        conversationContext: buildConversationContext(input.messages),
        precomputedPlan: input.precomputedPlan
      },
      { onProgress: dependencies.onProgress, signal: dependencies.signal }
    );
    const nextPlaylist = data.playlistUpdate || data.updatedConstraints || data.playlistMeta
      ? applyCuratorResponse(input.playlist, data)
      : undefined;
    const assistantContent = composeCuratorAssistantMessage(data, input.playlist);
    emitReviewRoutingTrace("workflow.runCuratorRequest.result", {
      requestId: input.requestId ?? null,
      assistantContainsReordered: assistantContent.includes("Reordered "),
      playlistAction: data.playlistUpdate?.action ?? null
    });
    const historyEntry = createRequestHistoryEntry(
      input.outgoing,
      data.message,
      data,
      nextPlaylist && playlistChangedMeaningfully(input.playlist, nextPlaylist)
        ? {
          playlistBefore: input.playlist,
          resultingPlaylistUpdatedAt: nextPlaylist.updatedAt,
          pendingEditContext: derivePendingEditContext(input.outgoing, input.playlist, data)
        }
        : {
          pendingEditContext: derivePendingEditContext(input.outgoing, input.playlist, data)
        }
    );
    return {
      assistantMessage: { role: "assistant", content: assistantContent },
      data,
      historyEntry,
      messages: createCompletedRequestMessages(requestMessages, assistantContent),
      nextPlaylist
    };
  } catch (error) {
    const failure = workflowErrorResult(input.outgoing, error, "Something went wrong.");
    return {
      ...failure,
      messages: createCompletedRequestMessages(requestMessages, failure.assistantMessage.content)
    };
  }
}
