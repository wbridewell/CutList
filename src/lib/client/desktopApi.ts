"use client";

import {
  desktopCommandNames,
  desktopProgressEventName,
  type DeleteProviderSecretPayload,
  type DesktopBackendResultMap,
  type DesktopErrorCode,
  type DesktopExportResult,
  type DesktopOpenExternalUrlPayload,
  type DesktopProgressPayload,
  type DesktopPlaylistMessagePayload,
  type DesktopRevealPathPayload,
  type SetProviderSecretPayload
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

// Thrown when a Tauri command rejects with a {code, message} DesktopError (see
// src-tauri/src/main.rs and src/lib/desktop/errors.ts). Commands that don't spawn the
// Node backend can still reject with a plain string, which normalizeDesktopError
// leaves as an ordinary Error rather than forcing a code onto it.
export class DesktopCommandError extends Error {
  code: DesktopErrorCode;

  constructor(code: DesktopErrorCode, message: string) {
    super(message);
    this.name = "DesktopCommandError";
    this.code = code;
  }
}

function isDesktopErrorShape(value: unknown): value is { code: string; message: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { code?: unknown }).code === "string" &&
    typeof (value as { message?: unknown }).message === "string"
  );
}

export function normalizeDesktopError(error: unknown): Error {
  if (isDesktopErrorShape(error)) {
    return new DesktopCommandError(error.code as DesktopErrorCode, error.message);
  }
  if (error instanceof Error) {
    return error;
  }
  if (typeof error === "string") {
    return new Error(error);
  }
  return new Error("Desktop command failed.");
}

async function invokeDesktop<T>(command: string, payload?: unknown): Promise<T> {
  const { invoke } = await getTauriCore();
  try {
    return await invoke<T>(command, payload === undefined ? { payload: null } : { payload });
  } catch (error) {
    throw normalizeDesktopError(error);
  }
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
    throw normalizeDesktopError(error);
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

export function openDesktopExternalUrl(payload: DesktopOpenExternalUrlPayload) {
  return getTauriCore().then(({ invoke }) =>
    invoke<DesktopBackendResultMap["openExternalUrl"]>(desktopCommandNames.openExternalUrl, payload)
  );
}

export function toggleDesktopDevTools() {
  return getTauriCore().then(({ invoke }) =>
    invoke<DesktopBackendResultMap["toggleDevTools"]>(desktopCommandNames.toggleDevTools)
  );
}

// Exits the process. Callers flush autosave first; the predefined Quit menu item would
// have exited without giving the webview a chance to do that.
export function requestDesktopQuit() {
  return getTauriCore().then(({ invoke }) => invoke<DesktopBackendResultMap["quit"]>(desktopCommandNames.quit));
}

export function invokeDesktopQuarantineWorkspaceState() {
  return invokeDesktop<DesktopBackendResultMap["quarantineWorkspaceState"]>(desktopCommandNames.quarantineWorkspaceState);
}

export function invokeDesktopGetLogPath() {
  return invokeDesktop<DesktopBackendResultMap["getLogPath"]>(desktopCommandNames.getLogPath);
}

// Talks directly to the Rust keychain commands, bypassing the Node backend entirely -
// the secret never needs to reach a process that also writes JSON files to disk.
export async function setDesktopProviderSecret(payload: SetProviderSecretPayload) {
  const { invoke } = await getTauriCore();
  try {
    return await invoke<DesktopBackendResultMap["setProviderSecret"]>(desktopCommandNames.setProviderSecret, payload);
  } catch (error) {
    throw normalizeDesktopError(error);
  }
}

export async function deleteDesktopProviderSecret(payload: DeleteProviderSecretPayload) {
  const { invoke } = await getTauriCore();
  try {
    return await invoke<DesktopBackendResultMap["deleteProviderSecret"]>(desktopCommandNames.deleteProviderSecret, payload);
  } catch (error) {
    throw normalizeDesktopError(error);
  }
}
