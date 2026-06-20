import "server-only";

import { z } from "zod";
import { getJsonFromLLM } from "@/lib/ai/llmClient";
import {
  llmSetupStatus,
  mergeLocalLLMSettings,
  readLocalLLMSettings,
  type LocalLLMSettings
} from "@/lib/ai/llmConfig";
import { handleAnalyzePlaylist, handleImportChat, handlePlaylistMessage, type CuratorProgressEvent } from "@/lib/ai/curator";
import type { CuratorRunOptions } from "@/lib/ai/curatorTypes";
import {
  CuratorResponseSchema,
  AnalyzePlaylistRequestSchema,
  AnalyzePlaylistResponseSchema,
  ExportRequestSchema,
  ExportResponseSchema,
  ImportChatRequestSchema,
  ImportChatResponseSchema,
  PlaylistMessageRequestSchema,
  VerifyRequestSchema,
  VerifyResponseSchema
} from "@/lib/playlist/schemas";
import { exportPlaylist } from "@/lib/playlist/io/exports";
import { parsePersistedWorkspaceState, type PersistedWorkspaceStateV1 } from "@/lib/playlist/io/localDraft";
import {
  readDesktopWorkspaceState,
  writeDesktopWorkspaceState
} from "@/lib/playlist/io/desktopWorkspaceState";
import { verifyTracks } from "@/lib/music/verifyTrack";
import type {
  DesktopAnalyzePayload,
  DesktopExportPayload,
  DesktopImportPayload,
  DesktopPlaylistMessagePayload,
  DesktopVerifyPayload,
  DesktopWorkspaceStateResponse,
  LLMSetupPayload,
  LLMSetupResponse,
  LLMSetupTestResponse
} from "@/lib/desktop/contracts";

const SaveLLMSettingsSchema = z.object({
  provider: z.enum(["gemini", "openai", "ollama", "none"]).optional(),
  apiKey: z.string().trim().optional(),
  model: z.string().trim().min(1).max(120).optional(),
  timeoutMs: z.number().int().min(10_000).max(600_000).optional(),
  ollamaBaseUrl: z.string().trim().url().optional(),
  llmAssistedMatchReviewEnabled: z.boolean().optional(),
  curatorPersona: z.enum(["razor", "archivist", "firestarter"]).optional()
});

function localSettingsForPayload(input: z.infer<typeof SaveLLMSettingsSchema>): LocalLLMSettings {
  const update: LocalLLMSettings = {
    provider: input.provider,
    timeoutMs: input.timeoutMs,
    llmAssistedMatchReviewEnabled: input.llmAssistedMatchReviewEnabled,
    curatorPersona: input.curatorPersona
  };
  if (input.provider === "gemini") {
    update.geminiModel = input.model;
    if (input.apiKey) {
      update.geminiApiKey = input.apiKey;
    }
  }
  if (input.provider === "openai") {
    update.openaiModel = input.model;
    if (input.apiKey) {
      update.openaiApiKey = input.apiKey;
    }
  }
  if (input.provider === "ollama") {
    update.ollamaModel = input.model;
    update.ollamaBaseUrl = input.ollamaBaseUrl;
  }
  return update;
}

export function getDesktopLlmSetup(): LLMSetupResponse {
  return {
    status: llmSetupStatus(),
    localSettingsPresent: Object.keys(readLocalLLMSettings()).length > 0
  };
}

export function saveDesktopLlmSetup(payload: LLMSetupPayload): LLMSetupResponse {
  const input = SaveLLMSettingsSchema.parse(payload);
  mergeLocalLLMSettings(localSettingsForPayload(input));
  return {
    status: llmSetupStatus(),
    localSettingsPresent: true
  };
}

export async function testDesktopLlmSetup(payload: LLMSetupPayload): Promise<LLMSetupTestResponse> {
  try {
    const input = SaveLLMSettingsSchema.partial().optional().parse(payload);
    if (input?.provider) {
      mergeLocalLLMSettings(localSettingsForPayload(input as z.infer<typeof SaveLLMSettingsSchema>));
    }
    await getJsonFromLLM("Return {\"ok\":true} as strict JSON.");
    return {
      ok: true,
      message: "LLM connection works. The Curator is ready to build playlists.",
      status: llmSetupStatus()
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "LLM setup test failed.",
      status: llmSetupStatus()
    };
  }
}

export async function desktopPlaylistMessage(
  payload: DesktopPlaylistMessagePayload,
  options: CuratorRunOptions = {}
) {
  const input = PlaylistMessageRequestSchema.parse(payload);
  const response = await handlePlaylistMessage(input.playlist, input.userMessage, {
    ...options,
    conversationContext: input.conversationContext
  });
  return CuratorResponseSchema.parse(response);
}

export async function desktopVerifyTracks(payload: DesktopVerifyPayload) {
  const input = VerifyRequestSchema.parse(payload);
  return VerifyResponseSchema.parse(await verifyTracks(input.tracks));
}

export async function desktopImportChat(payload: DesktopImportPayload) {
  const input = ImportChatRequestSchema.parse(payload);
  return ImportChatResponseSchema.parse(await handleImportChat(input.text));
}

export async function desktopAnalyzePlaylist(payload: DesktopAnalyzePayload) {
  const input = AnalyzePlaylistRequestSchema.parse(payload);
  return AnalyzePlaylistResponseSchema.parse(await handleAnalyzePlaylist(
    input.playlist,
    input.userQuestion,
    { conversationContext: input.conversationContext }
  ));
}

export function desktopExportPlaylist(payload: DesktopExportPayload) {
  const input = ExportRequestSchema.parse(payload);
  return ExportResponseSchema.parse(exportPlaylist(input.playlist, input.format));
}

export function getDesktopWorkspaceState(): DesktopWorkspaceStateResponse {
  return {
    state: readDesktopWorkspaceState()
  };
}

function normalizeWorkspaceState(input: PersistedWorkspaceStateV1 | null): PersistedWorkspaceStateV1 | null {
  if (!input) {
    return null;
  }
  return parsePersistedWorkspaceState(JSON.stringify(input));
}

export function saveDesktopWorkspaceState(state: PersistedWorkspaceStateV1 | null): DesktopWorkspaceStateResponse {
  return {
    state: writeDesktopWorkspaceState(normalizeWorkspaceState(state))
  };
}

export type DesktopProgressCallback = (event: CuratorProgressEvent) => void;
