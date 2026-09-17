import {
  desktopAnalyzePlaylist,
  desktopExportPlaylist,
  desktopImportChat,
  desktopPlaylistMessage,
  desktopPlanUserRequest,
  desktopVerifyTracks,
  getDesktopLlmSetup,
  saveDesktopLlmSetup,
  saveDesktopWorkspaceState,
  testDesktopLlmSetup
} from "@/lib/desktop/backend";
import type { DesktopBackendPayloadMap, DesktopBackendResultMap, DesktopError } from "@/lib/desktop/contracts";
import { classifyBackendError } from "@/lib/desktop/errors";
import { timeAsync } from "@/lib/debugTiming";
import type { ExportResponse } from "@/types/playlist";

type CommandEnvelope = {
  command: string;
  payload?: unknown;
};

type ProgressLine = {
  type: "progress";
  event: unknown;
};

type ResultLine = {
  type: "result";
  data: unknown;
};

type ErrorLine = {
  type: "error";
  error: DesktopError;
};

// The commands this Node process serves. Everything else in desktopCommandNames is
// handled natively by Rust and never reaches stdin here.
type BackendCommand =
  | "analyzePlaylist"
  | "exportPlaylist"
  | "getLlmSetup"
  | "importChat"
  | "planUserRequest"
  | "playlistMessage"
  | "saveLlmSetup"
  | "saveWorkspaceState"
  | "testLlmSetup"
  | "verifyTracks";

// Rust turns the raw export into a saved/cancelled result after the native dialog, so
// the Node side of exportPlaylist returns the content itself, not DesktopExportResult.
type BackendResult<K extends BackendCommand> = K extends "exportPlaylist" ? ExportResponse : DesktopBackendResultMap[K];

type BackendHandlers = {
  [K in BackendCommand]: (payload: DesktopBackendPayloadMap[K]) => BackendResult<K> | Promise<BackendResult<K>>;
};

function writeLine(line: ProgressLine | ResultLine | ErrorLine): void {
  process.stdout.write(`${JSON.stringify(line)}\n`);
}

const handlers: BackendHandlers = {
  analyzePlaylist: (payload) => desktopAnalyzePlaylist(payload),
  exportPlaylist: (payload) => desktopExportPlaylist(payload),
  getLlmSetup: () => getDesktopLlmSetup(),
  importChat: (payload) => desktopImportChat(payload),
  planUserRequest: (payload) => desktopPlanUserRequest(payload),
  playlistMessage: (payload) => desktopPlaylistMessage(payload, {
    onProgress(event) {
      writeLine({ type: "progress", event });
    }
  }),
  saveLlmSetup: (payload) => saveDesktopLlmSetup(payload),
  saveWorkspaceState: (payload) => saveDesktopWorkspaceState(payload?.state ?? null),
  testLlmSetup: (payload) => testDesktopLlmSetup(payload),
  verifyTracks: (payload) => desktopVerifyTracks(payload)
};

function isBackendCommand(name: string): name is BackendCommand {
  return name in handlers;
}

function logCommandDebugError(command: string, error: unknown): void {
  if (process.env.CUTLIST_DEBUG_TIMING !== "1") {
    return;
  }
  const timingId = process.env.CUTLIST_TIMING_ID?.trim() || "unknown";
  const errorName = error instanceof Error ? error.name : typeof error;
  const errorMessage = error instanceof Error ? error.message : String(error);
  console.error(`[cutlist:timing] command_error id=${timingId} command=${command} error_name=${errorName} error_message=${JSON.stringify(errorMessage)}`);
}

async function main(): Promise<void> {
  const raw = await new Promise<string>((resolve, reject) => {
    let input = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      input += chunk;
    });
    process.stdin.on("end", () => resolve(input));
    process.stdin.on("error", reject);
  });

  const envelope = JSON.parse(raw) as CommandEnvelope;
  try {
    if (!isBackendCommand(envelope.command)) {
      throw new Error(`Unknown desktop command: ${envelope.command}`);
    }
    // The payload is untrusted JSON from stdin. Every backend function validates it with
    // Zod before use, so this is the single cast at the process boundary.
    const handler = handlers[envelope.command] as (payload: unknown) => unknown;
    const data = await timeAsync("backend_command", () => handler(envelope.payload), { command: envelope.command });
    writeLine({ type: "result", data });
  } catch (error) {
    logCommandDebugError(envelope.command, error);
    throw error;
  }
}

main().catch((error) => {
  writeLine({
    type: "error",
    error: classifyBackendError(error)
  });
  process.exitCode = 1;
});
