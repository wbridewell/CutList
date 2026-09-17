import type {
  AnalyzePlaylistRequest,
  AnalyzePlaylistResponse,
  CuratorProgressEvent,
  CuratorResponse,
  ExportRequest,
  ImportChatRequest,
  ImportChatResponse,
  PlaylistMessageRequest,
  ResolvedUserRequestPlan,
  UserRequestPlanRequest,
  VerifyRequest,
  VerifyResponse
} from "@/types/playlist";
import type { PersistedWorkspaceStateV1 } from "@/lib/playlist/io/localDraft";
import type { CuratorPersona, KeychainProvider, LLMProvider } from "@/lib/desktop/settingsSchemas";

// Reported by desktop commands that spawn the Node backend (see classifyBackendError in
// src/lib/desktop/errors.ts, which is where most of these are actually produced).
// runtime_missing/spawn_failed/backend_protocol/cancelled are classified by Rust itself
// at the process boundary; the rest come from the Node backend's own exception types.
export type DesktopErrorCode =
  | "runtime_missing"
  | "spawn_failed"
  | "backend_protocol"
  | "invalid_payload"
  | "cancelled"
  | "llm_unconfigured"
  | "llm_timeout"
  | "llm_malformed_response"
  | "provider_unreachable"
  | "export_failed"
  | "workspace_unreadable"
  | "unknown";

export type DesktopError = {
  code: DesktopErrorCode;
  message: string;
};

export const desktopCommandNames = {
  analyzePlaylist: "desktop_analyze_playlist",
  cancelRequest: "desktop_cancel_request",
  exportPlaylist: "desktop_export_playlist",
  getLlmSetup: "desktop_get_llm_setup",
  getLogPath: "desktop_get_log_path",
  getWorkspaceState: "desktop_get_workspace_state",
  importChat: "desktop_import_chat",
  openExternalUrl: "desktop_open_external_url",
  planUserRequest: "desktop_plan_user_request",
  playlistMessage: "desktop_playlist_message",
  quarantineWorkspaceState: "desktop_quarantine_workspace_state",
  quit: "desktop_quit",
  revealInFileManager: "desktop_reveal_in_file_manager",
  saveLlmSetup: "desktop_save_llm_setup",
  saveWorkspaceState: "desktop_save_workspace_state",
  setProviderSecret: "desktop_set_provider_secret",
  deleteProviderSecret: "desktop_delete_provider_secret",
  testLlmSetup: "desktop_test_llm_setup",
  toggleDevTools: "desktop_toggle_devtools",
  verifyTracks: "desktop_verify_tracks"
} as const;

export const desktopProgressEventName = "cutlist://curator-progress";

export type DesktopCommandName = (typeof desktopCommandNames)[keyof typeof desktopCommandNames];

export type { CuratorPersona, KeychainProvider, LLMProvider };

export type LLMSetupStatus = {
  provider: LLMProvider;
  model: string;
  timeoutMs: number;
  curatorPersona: CuratorPersona;
  configured: boolean;
  keyPresent: boolean;
  llmAssistedMatchReviewEnabled: boolean;
  keySource: "env" | "keychain" | "not_required" | "missing";
  envOverrides: {
    provider: boolean;
    key: boolean;
    model: boolean;
    timeout: boolean;
  };
};

// No apiKey field: provider keys go straight to the OS keychain via
// desktop_set_provider_secret, never through this payload or the local settings file.
export type LLMSetupPayload = {
  provider?: LLMProvider;
  curatorPersona?: CuratorPersona;
  model?: string;
  timeoutMs?: number;
  ollamaBaseUrl?: string;
  llmAssistedMatchReviewEnabled?: boolean;
};

export type SetProviderSecretPayload = {
  provider: KeychainProvider;
  secret: string;
};

export type DeleteProviderSecretPayload = {
  provider: KeychainProvider;
};

export type SetProviderSecretResult = {
  ok: true;
};

export type DeleteProviderSecretResult = {
  ok: true;
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
export type DesktopUserRequestPlanPayload = UserRequestPlanRequest;

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

// Reported by the native `desktop_get_workspace_state` Rust command, which reads the
// workspace file directly and does not run it through Zod. "unreadable" means the file's
// JSON could not even be parsed; Rust has already moved it aside to `recoveredPath`.
// A file that parses as JSON but fails our Zod schema still comes back as "ok" here —
// the client validates that with validatePersistedWorkspaceStateValue and, if invalid,
// calls quarantineWorkspaceState itself before treating the workspace as empty.
export type DesktopWorkspaceStateReadStatus = "ok" | "empty" | "unreadable";

export type DesktopWorkspaceStateReadResult = {
  status: DesktopWorkspaceStateReadStatus;
  state: unknown;
  recoveredPath: string | null;
};

export type DesktopQuarantineWorkspaceStateResult = {
  recoveredPath: string | null;
};

export type DesktopLogPathResult = {
  path: string;
};

export type DesktopRevealPathPayload = {
  path: string;
};

// Only URLs on the Rust-side allowlist (the project's GitHub pages) are accepted.
export type DesktopOpenExternalUrlPayload = {
  url: string;
};

export type DesktopBackendPayloadMap = {
  analyzePlaylist: DesktopAnalyzePayload;
  exportPlaylist: DesktopExportPayload;
  getLlmSetup: undefined;
  getLogPath: undefined;
  getWorkspaceState: undefined;
  importChat: DesktopImportPayload;
  openExternalUrl: DesktopOpenExternalUrlPayload;
  planUserRequest: DesktopUserRequestPlanPayload;
  playlistMessage: DesktopPlaylistMessagePayload;
  quarantineWorkspaceState: undefined;
  quit: undefined;
  revealInFileManager: DesktopRevealPathPayload;
  saveLlmSetup: LLMSetupPayload;
  saveWorkspaceState: DesktopWorkspaceStatePayload;
  setProviderSecret: SetProviderSecretPayload;
  deleteProviderSecret: DeleteProviderSecretPayload;
  testLlmSetup: LLMSetupPayload;
  toggleDevTools: undefined;
  verifyTracks: DesktopVerifyPayload;
};

export type DesktopBackendResultMap = {
  analyzePlaylist: AnalyzePlaylistResponse;
  exportPlaylist: DesktopExportResult;
  getLlmSetup: LLMSetupResponse;
  getLogPath: DesktopLogPathResult;
  getWorkspaceState: DesktopWorkspaceStateReadResult;
  importChat: ImportChatResponse;
  openExternalUrl: {
    ok: true;
  };
  planUserRequest: ResolvedUserRequestPlan;
  playlistMessage: CuratorResponse;
  quarantineWorkspaceState: DesktopQuarantineWorkspaceStateResult;
  quit: {
    ok: true;
  };
  revealInFileManager: {
    ok: true;
  };
  saveLlmSetup: LLMSetupResponse;
  saveWorkspaceState: DesktopWorkspaceStateResponse;
  setProviderSecret: SetProviderSecretResult;
  deleteProviderSecret: DeleteProviderSecretResult;
  testLlmSetup: LLMSetupTestResponse;
  toggleDevTools: {
    ok: true;
  };
  verifyTracks: VerifyResponse;
};
