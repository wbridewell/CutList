import type {
  AnalyzePlaylistRequest,
  AnalyzePlaylistResponse,
  CuratorProgressEvent,
  CuratorResponse,
  ExportRequest,
  ImportChatRequest,
  ImportChatResponse,
  PlaylistMessageRequest,
  VerifyRequest,
  VerifyResponse
} from "@/types/playlist";
import type { PersistedWorkspaceStateV1 } from "@/lib/playlist/io/localDraft";

export const desktopCommandNames = {
  analyzePlaylist: "desktop_analyze_playlist",
  cancelRequest: "desktop_cancel_request",
  exportPlaylist: "desktop_export_playlist",
  getLlmSetup: "desktop_get_llm_setup",
  getWorkspaceState: "desktop_get_workspace_state",
  importChat: "desktop_import_chat",
  playlistMessage: "desktop_playlist_message",
  revealInFileManager: "desktop_reveal_in_file_manager",
  saveLlmSetup: "desktop_save_llm_setup",
  saveWorkspaceState: "desktop_save_workspace_state",
  testLlmSetup: "desktop_test_llm_setup",
  verifyTracks: "desktop_verify_tracks"
} as const;

export const desktopProgressEventName = "cutlist://curator-progress";

export type DesktopCommandName = (typeof desktopCommandNames)[keyof typeof desktopCommandNames];

export type LLMProvider = "ollama" | "openai" | "gemini" | "none";
export type CuratorPersona = "razor" | "archivist" | "firestarter";

export type LLMSetupStatus = {
  provider: LLMProvider;
  model: string;
  timeoutMs: number;
  curatorPersona: CuratorPersona;
  configured: boolean;
  keyPresent: boolean;
  llmAssistedMatchReviewEnabled: boolean;
  keySource: "env" | "local" | "not_required" | "missing";
  envOverrides: {
    provider: boolean;
    key: boolean;
    model: boolean;
    timeout: boolean;
  };
};

export type LLMSetupPayload = {
  provider?: LLMProvider;
  curatorPersona?: CuratorPersona;
  apiKey?: string;
  model?: string;
  timeoutMs?: number;
  ollamaBaseUrl?: string;
  llmAssistedMatchReviewEnabled?: boolean;
};

export type LLMSetupResponse = {
  status: LLMSetupStatus;
  localSettingsPresent: boolean;
};

export type LLMSetupTestResponse = {
  ok: boolean;
  message: string;
  status: LLMSetupStatus;
};

export type DesktopProgressPayload = {
  requestId: string;
  event: CuratorProgressEvent;
};

export type DesktopPlaylistMessagePayload = PlaylistMessageRequest & {
  requestId: string;
};

export type DesktopAnalyzePayload = AnalyzePlaylistRequest;
export type DesktopVerifyPayload = VerifyRequest;
export type DesktopImportPayload = ImportChatRequest;
export type DesktopExportPayload = ExportRequest;

export type DesktopExportResult =
  | {
    status: "saved";
    filename: string;
    path: string;
  }
  | {
    status: "cancelled";
  };

export type DesktopWorkspaceStatePayload = {
  state: PersistedWorkspaceStateV1 | null;
};

export type DesktopWorkspaceStateResponse = {
  state: PersistedWorkspaceStateV1 | null;
};

export type DesktopRevealPathPayload = {
  path: string;
};

export type DesktopBackendPayloadMap = {
  analyzePlaylist: DesktopAnalyzePayload;
  exportPlaylist: DesktopExportPayload;
  getLlmSetup: undefined;
  getWorkspaceState: undefined;
  importChat: DesktopImportPayload;
  playlistMessage: DesktopPlaylistMessagePayload;
  revealInFileManager: DesktopRevealPathPayload;
  saveLlmSetup: LLMSetupPayload;
  saveWorkspaceState: DesktopWorkspaceStatePayload;
  testLlmSetup: LLMSetupPayload;
  verifyTracks: DesktopVerifyPayload;
};

export type DesktopBackendResultMap = {
  analyzePlaylist: AnalyzePlaylistResponse;
  exportPlaylist: DesktopExportResult;
  getLlmSetup: LLMSetupResponse;
  getWorkspaceState: DesktopWorkspaceStateResponse;
  importChat: ImportChatResponse;
  playlistMessage: CuratorResponse;
  revealInFileManager: {
    ok: true;
  };
  saveLlmSetup: LLMSetupResponse;
  saveWorkspaceState: DesktopWorkspaceStateResponse;
  testLlmSetup: LLMSetupTestResponse;
  verifyTracks: VerifyResponse;
};
