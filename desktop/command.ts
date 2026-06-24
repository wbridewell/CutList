import {
  desktopAnalyzePlaylist,
  desktopExportPlaylist,
  desktopImportChat,
  desktopPlaylistMessage,
  desktopPlanUserRequest,
  desktopVerifyTracks,
  getDesktopLlmSetup,
  getDesktopWorkspaceState,
  saveDesktopLlmSetup,
  saveDesktopWorkspaceState,
  testDesktopLlmSetup
} from "@/lib/desktop/backend";
import { timeAsync } from "@/lib/debugTiming";

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
  error: string;
};

function writeLine(line: ProgressLine | ResultLine | ErrorLine): void {
  process.stdout.write(`${JSON.stringify(line)}\n`);
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
  const timed = <T>(operation: () => T | Promise<T>) => timeAsync("backend_command", operation, { command: envelope.command });
  try {
    switch (envelope.command) {
      case "getLlmSetup":
        writeLine({ type: "result", data: await timed(() => getDesktopLlmSetup()) });
        return;
      case "saveLlmSetup":
        writeLine({ type: "result", data: await timed(() => saveDesktopLlmSetup(envelope.payload as never)) });
        return;
      case "testLlmSetup":
        writeLine({ type: "result", data: await timed(() => testDesktopLlmSetup(envelope.payload as never)) });
        return;
      case "getWorkspaceState":
        writeLine({ type: "result", data: await timed(() => getDesktopWorkspaceState()) });
        return;
      case "saveWorkspaceState":
        writeLine({
          type: "result",
          data: await timed(() => saveDesktopWorkspaceState((envelope.payload as { state?: unknown } | undefined)?.state as never))
        });
        return;
      case "verifyTracks":
        writeLine({ type: "result", data: await timed(() => desktopVerifyTracks(envelope.payload as never)) });
        return;
      case "importChat":
        writeLine({ type: "result", data: await timed(() => desktopImportChat(envelope.payload as never)) });
        return;
      case "analyzePlaylist":
        writeLine({ type: "result", data: await timed(() => desktopAnalyzePlaylist(envelope.payload as never)) });
        return;
      case "planUserRequest":
        writeLine({ type: "result", data: await timed(() => desktopPlanUserRequest(envelope.payload as never)) });
        return;
      case "exportPlaylist":
        writeLine({ type: "result", data: await timed(() => desktopExportPlaylist(envelope.payload as never)) });
        return;
      case "playlistMessage":
        writeLine({
          type: "result",
          data: await timed(() => desktopPlaylistMessage(envelope.payload as never, {
            onProgress(event) {
              writeLine({ type: "progress", event });
            }
          }))
        });
        return;
      default:
        throw new Error(`Unknown desktop command: ${envelope.command}`);
    }
  } catch (error) {
    logCommandDebugError(envelope.command, error);
    throw error;
  }
}

main().catch((error) => {
  writeLine({
    type: "error",
    error: error instanceof Error ? error.message : "Unknown desktop command failure."
  });
  process.exitCode = 1;
});
