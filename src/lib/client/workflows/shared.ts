import { analyzePlaylist, importDraftOrChat, sendPlaylistMessageStream, type VerifySeedsResponse } from "@/lib/client/desktopPlaylistBridge";
import { DesktopCommandError } from "@/lib/client/desktopApi";
import type { DesktopErrorCode } from "@/lib/desktop/contracts";
import { parseDiscoveryRadiusOverride } from "@/lib/playlist/discoveryRadius";
import { createErrorHistoryEntry, type ChatMessage, type RequestHistoryEntry } from "@/lib/playlist/collaboration";
import type { ParsedTrackLine } from "@/lib/playlist/io/textImport";
import { classifyComposerRequestFromCues, type ComposerRequestKind } from "@/lib/playlist/requestRouting";
import type { AnalyzePlaylistResponse, ConversationContext, CuratorResponse, DiscoveryRadius, PlaylistState } from "@/types/playlist";

export type { ComposerRequestKind };
export { reviewPromptForComposerRequest, splitMixedComposerRequest } from "@/lib/playlist/requestRouting";
export type { MixedComposerRequestPrompts } from "@/lib/playlist/requestRouting";

export type ClientWorkflowResult = {
  assistantMessage: ChatMessage;
  clearInput?: boolean;
  historyEntry?: RequestHistoryEntry;
  nextPlaylist?: PlaylistState;
  review?: AnalyzePlaylistResponse;
  suppressAssistantMessage?: boolean;
};

export type CuratorRequestWorkflowResult = ClientWorkflowResult & {
  data?: CuratorResponse;
  messages: ChatMessage[];
};

export type MixedReviewAndCuratorWorkflowResult = {
  assistantMessage: ChatMessage;
  clearInput?: boolean;
  curatorHistoryEntry?: RequestHistoryEntry;
  messages: ChatMessage[];
  nextPlaylist?: PlaylistState;
  review?: AnalyzePlaylistResponse;
  reviewHistoryEntry?: RequestHistoryEntry;
};

export type CuratorRequestDependencies = {
  onProgress: (message: string) => void;
  sendMessage?: typeof sendPlaylistMessageStream;
  signal?: AbortSignal;
};

const maxConversationContextMessages = 8;

const maxConversationContextContentLength = 1200;

export type SeedVerificationDependencies = {
  verifySeeds?: (tracks: ParsedTrackLine[]) => Promise<VerifySeedsResponse>;
};

export type ImportWorkflowDependencies = {
  importText?: typeof importDraftOrChat;
};

export type AnalyzeWorkflowDependencies = {
  analyze?: typeof analyzePlaylist;
};

export type MixedReviewAndCuratorWorkflowDependencies = CuratorRequestDependencies & AnalyzeWorkflowDependencies;

export function effectiveDiscoveryRadiusForRequest(
  playlist: PlaylistState,
  userMessage: string
): DiscoveryRadius {
  return parseDiscoveryRadiusOverride(userMessage) ?? playlist.discoveryRadius ?? "moderate";
}

export function classifyComposerRequest(userMessage: string, playlist: PlaylistState): ComposerRequestKind {
  return classifyComposerRequestFromCues(userMessage, playlist.tracks.length > 0);
}

export function createRequestMessageList(messages: ChatMessage[], outgoing: string): ChatMessage[] {
  return [...messages, { role: "user", content: outgoing }];
}

export function createCompletedRequestMessages(requestMessages: ChatMessage[], assistantMessage: string): ChatMessage[] {
  return [...requestMessages, { role: "assistant", content: assistantMessage }];
}

export function playlistChangedMeaningfully(before: PlaylistState, after: PlaylistState): boolean {
  const { updatedAt: _beforeUpdatedAt, ...beforeComparable } = before;
  const { updatedAt: _afterUpdatedAt, ...afterComparable } = after;
  return JSON.stringify(beforeComparable) !== JSON.stringify(afterComparable);
}

export function buildConversationContext(messages: ChatMessage[]): ConversationContext | undefined {
  const recentMessages = messages
    .map((message) => ({
      role: message.role,
      content: message.content.trim().slice(0, maxConversationContextContentLength)
    }))
    .filter((message) => message.content.length > 0)
    .slice(-maxConversationContextMessages);

  return recentMessages.length > 0 ? { recentMessages } : undefined;
}

function messageForDesktopErrorCode(code: DesktopErrorCode): string | null {
  switch (code) {
    case "cancelled":
      return "Stopped.";
    case "llm_unconfigured":
      return "LLM setup is incomplete or unavailable. Open LLM setup in the top-right, choose a provider, save it, and run Save and test. Your playlist is unchanged.";
    case "llm_timeout":
      return "The model took too long to respond. Your playlist is unchanged. Try again or raise the timeout in LLM setup.";
    case "llm_malformed_response":
      return "The model returned something CutList could not safely use. Your playlist is unchanged. Try again.";
    case "provider_unreachable":
      return "CutList could not reach the provider. Check your internet connection or local Ollama server, then try again. Your playlist is unchanged.";
    case "runtime_missing":
      return "The CutList desktop runtime is missing required files. Reinstall the app from the DMG, then try again.";
    case "spawn_failed":
    case "backend_protocol":
      return "CutList could not reach its local backend. Restart the app and try again.";
    case "export_failed":
      return "CutList could not save the exported file. Try again or choose a different location.";
    case "invalid_payload":
    case "workspace_unreadable":
    case "unknown":
      return null;
  }
}

export function errorMessageForWorkflow(error: unknown, fallbackMessage: string): string {
  const message = error instanceof Error
    ? error.message
    : typeof error === "string"
      ? error
      : "";

  if (typeof error === "string") {
    return error;
  }
  if (error instanceof Error && error.name === "AbortError") {
    return "Stopped.";
  }
  // Classification happens once, in the backend (classifyBackendError); a code with no
  // canned message and any other Error show their own text, which for the Ollama
  // errors and RequestResolutionError is already the remediation the user needs.
  if (error instanceof DesktopCommandError) {
    const codeMessage = messageForDesktopErrorCode(error.code);
    if (codeMessage) {
      return codeMessage;
    }
  }
  if (error instanceof Error && message.trim()) {
    return message;
  }
  return `${fallbackMessage} Your playlist is unchanged.`;
}

export function workflowErrorResult(
  action: string,
  error: unknown,
  fallbackMessage: string
): Pick<ClientWorkflowResult, "assistantMessage" | "historyEntry"> {
  let assistantContent = errorMessageForWorkflow(error, fallbackMessage);
  const debugTimingEnabled = process.env.NODE_ENV === "development" && process.env.CUTLIST_DEBUG_TIMING === "1";
  if (debugTimingEnabled) {
    const details = [
      `type=${typeof error}`,
      `is_error=${String(error instanceof Error)}`,
      `name=${error instanceof Error ? error.name : "n/a"}`,
      `message=${JSON.stringify(error instanceof Error ? error.message : assistantContent)}`,
      `fallback_used=${String(assistantContent === fallbackMessage)}`
    ].join(" ");
    console.error(`[cutlist:timing] workflow_error_result ${details}`);
    if (assistantContent === fallbackMessage) {
      assistantContent = `${fallbackMessage}\n[debug ${details}]`;
    }
  }
  return {
    assistantMessage: { role: "assistant", content: assistantContent },
    historyEntry: createErrorHistoryEntry(action, assistantContent)
  };
}
