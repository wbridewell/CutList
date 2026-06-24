"use client";

import {
  desktopCommandNames,
  desktopProgressEventName,
  type DesktopBackendResultMap,
  type DesktopExportResult,
  type DesktopProgressPayload,
  type DesktopPlaylistMessagePayload,
  type DesktopRevealPathPayload
} from "@/lib/desktop/contracts";
import { emitReviewRoutingTrace } from "@/lib/debug/reviewRouting";
import { getTauriCore, getTauriEvent } from "@/lib/client/tauriRuntime";
import type {
  AnalyzePlaylistRequest,
  CuratorResponse,
  ExportRequest,
  ImportChatRequest,
  UserRequestPlanRequest,
  VerifyRequest
} from "@/types/playlist";

function requestId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `cutlist-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

async function invokeDesktop<T>(command: string, payload?: unknown): Promise<T> {
  const { invoke } = await getTauriCore();
  return invoke<T>(command, payload === undefined ? { payload: null } : { payload });
}

export async function invokeDesktopMessage(
  payload: Omit<DesktopPlaylistMessagePayload, "requestId"> & { requestId?: string },
  options: { onProgress: (message: string) => void; signal?: AbortSignal }
): Promise<CuratorResponse> {
  const id = payload.requestId ?? requestId();
  emitReviewRoutingTrace("desktop.invoke.playlistMessage", {
    requestId: id,
    userMessage: payload.userMessage
  });
  const { listen } = await getTauriEvent();
  const { invoke } = await getTauriCore();
  const unlisten = await listen<DesktopProgressPayload>(desktopProgressEventName, (event) => {
    if (event.payload.requestId === id) {
      options.onProgress(event.payload.event.message);
    }
  });

  const abort = () => invoke<void>(desktopCommandNames.cancelRequest, { requestId: id }).catch(() => undefined);
  if (options.signal?.aborted) {
    unlisten();
    await abort();
    throw new DOMException("Request interrupted.", "AbortError");
  }

  options.signal?.addEventListener("abort", abort, { once: true });
  try {
    return await invoke<CuratorResponse>(desktopCommandNames.playlistMessage, {
      requestId: id,
      payload: { ...payload, requestId: id }
    });
  } catch (error) {
    if (options.signal?.aborted) {
      throw new DOMException("Request interrupted.", "AbortError");
    }
    throw error;
  } finally {
    options.signal?.removeEventListener("abort", abort);
    unlisten();
  }
}

export function invokeDesktopAnalyze(payload: AnalyzePlaylistRequest) {
  emitReviewRoutingTrace("desktop.invoke.analyzePlaylist", {
    requestId: payload.requestId ?? null,
    userQuestion: payload.userQuestion ?? null
  });
  return invokeDesktop<DesktopBackendResultMap["analyzePlaylist"]>(desktopCommandNames.analyzePlaylist, payload);
}

export function invokeDesktopVerify(payload: VerifyRequest) {
  return invokeDesktop<DesktopBackendResultMap["verifyTracks"]>(desktopCommandNames.verifyTracks, payload);
}

export function invokeDesktopImport(payload: ImportChatRequest) {
  return invokeDesktop<DesktopBackendResultMap["importChat"]>(desktopCommandNames.importChat, payload);
}

export function invokeDesktopPlanUserRequest(payload: UserRequestPlanRequest) {
  return invokeDesktop<DesktopBackendResultMap["planUserRequest"]>(desktopCommandNames.planUserRequest, payload);
}

export function invokeDesktopExport(payload: ExportRequest) {
  return invokeDesktop<DesktopExportResult>(desktopCommandNames.exportPlaylist, payload);
}

export function invokeDesktopGet<T extends DesktopBackendResultMap["getLlmSetup"] | DesktopBackendResultMap["getWorkspaceState"]>(
  command: typeof desktopCommandNames.getLlmSetup | typeof desktopCommandNames.getWorkspaceState
) {
  return invokeDesktop<T>(command);
}

export function invokeDesktopSave<T>(
  command:
    | typeof desktopCommandNames.saveLlmSetup
    | typeof desktopCommandNames.testLlmSetup
    | typeof desktopCommandNames.saveWorkspaceState,
  payload: unknown
) {
  return invokeDesktop<T>(command, payload);
}

export function revealDesktopPath(payload: DesktopRevealPathPayload) {
  return getTauriCore().then(({ invoke }) =>
    invoke<DesktopBackendResultMap["revealInFileManager"]>(desktopCommandNames.revealInFileManager, payload)
  );
}
