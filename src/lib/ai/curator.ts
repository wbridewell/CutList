import {
  isLLMDisabledError,
  isLLMTimeoutError,
  isOllamaUnavailableError,
  isOpenAIQuotaError,
  RequestResolutionError
} from "@/lib/ai/errors";
import { handleAnalyzePlaylist } from "@/lib/ai/services/analyzeService";
import { handleImportChat } from "@/lib/ai/services/importChatService";
import type { CuratorRunOptions } from "@/lib/ai/curatorTypes";
import { executeResolvedCuratorPlan } from "@/lib/ai/services/curatorWorkflow";
import { resolveCuratorRequestPlan } from "@/lib/ai/services/requestResolution";
import type { CuratorResponse, PlaylistState } from "@/types/playlist";

export type { CuratorProgressEvent } from "@/lib/ai/curatorTypes";
export { handleAnalyzePlaylist, handleImportChat };

function logCuratorDebugError(stage: "request_resolution" | "workflow_execution", error: unknown): void {
  if (process.env.CUTLIST_DEBUG_TIMING !== "1") {
    return;
  }
  const timingId = process.env.CUTLIST_TIMING_ID?.trim() || "unknown";
  const errorName = error instanceof Error ? error.name : typeof error;
  const errorMessage = error instanceof Error ? error.message : String(error);
  console.error(`[cutlist:timing] ${stage}_error id=${timingId} error_name=${errorName} error_message=${JSON.stringify(errorMessage)}`);
}

export async function handlePlaylistMessage(
  playlist: PlaylistState,
  userMessage: string,
  options: CuratorRunOptions = {}
): Promise<CuratorResponse> {
  options.onProgress?.({ stage: "parsing", message: "Understanding your request and active rules." });
  let plan;
  try {
    plan = await resolveCuratorRequestPlan(playlist, userMessage, options);
  } catch (error) {
    logCuratorDebugError("request_resolution", error);
    if (
      isLLMDisabledError(error) ||
      isLLMTimeoutError(error) ||
      isOpenAIQuotaError(error) ||
      isOllamaUnavailableError(error) ||
      (error instanceof Error && /GEMINI_API_KEY|OPENAI_API_KEY/i.test(error.message))
    ) {
      throw error;
    }
    throw new RequestResolutionError();
  }

  try {
    return await executeResolvedCuratorPlan(plan, options);
  } catch (error) {
    logCuratorDebugError("workflow_execution", error);
    throw error;
  }
}
