import type {
  AnalyzePlaylistResponse,
  ConversationContext,
  CuratorResponse,
  ImportChatResponse,
  PlaylistState,
  ReviewMode,
  ResolvedUserRequestPlan
} from "@/types/playlist";
import { exportPlaylist } from "@/lib/playlist/io/exports";
import type { PlaylistExportFormat } from "@/lib/playlist/io/exportFormats";
import type { ParsedTrackLine } from "@/lib/playlist/io/textImport";
import {
  invokeDesktopAnalyze,
  invokeDesktopExport,
  invokeDesktopImport,
  invokeDesktopMessage,
  invokeDesktopPlanUserRequest,
  invokeDesktopVerify
} from "@/lib/client/desktopApi";
import { isTauriApp } from "@/lib/client/tauriRuntime";

export type VerifySeedsResponse = Awaited<ReturnType<typeof invokeDesktopVerify>>;

export async function sendPlaylistMessageStream(
  input: { playlist: PlaylistState; requestId?: string; userMessage: string; conversationContext?: ConversationContext },
  callbacks: { onProgress: (message: string) => void; signal?: AbortSignal }
): Promise<CuratorResponse> {
  return invokeDesktopMessage(input, callbacks);
}

export async function verifySeedTracks(tracks: ParsedTrackLine[]): Promise<VerifySeedsResponse> {
  return invokeDesktopVerify({ tracks });
}

export async function importDraftOrChat(text: string): Promise<ImportChatResponse> {
  return invokeDesktopImport({ text });
}

export async function analyzePlaylist(
  playlist: PlaylistState,
  userQuestion?: string,
  conversationContext?: ConversationContext,
  requestId?: string,
  reviewMode?: ReviewMode
): Promise<AnalyzePlaylistResponse> {
  return invokeDesktopAnalyze({ playlist, requestId, userQuestion, reviewMode, conversationContext });
}

export async function planPlaylistRequest(
  playlist: PlaylistState,
  userMessage: string,
  conversationContext?: ConversationContext,
  requestId?: string,
  forceReadOnly = false
): Promise<ResolvedUserRequestPlan> {
  return invokeDesktopPlanUserRequest({ playlist, requestId, userMessage, conversationContext, forceReadOnly });
}

export async function downloadPlaylistExport(
  playlist: PlaylistState,
  format: PlaylistExportFormat
): Promise<{ path?: string; status: "saved" | "cancelled" }> {
  if (isTauriApp()) {
    return invokeDesktopExport({ playlist, format });
  }
  const result = exportPlaylist(playlist, format);
  const blob = new Blob([result.content], { type: result.mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = result.filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return { status: "saved" };
}
