import { z } from "zod";
import {
  BoundTrackPlacementSchema,
  CuratorResponseSchema,
  PlaylistStateSchema,
  RejectedCandidateSchema,
  ReplacementModeSchema,
  ReviewSuggestionSchema
} from "@/lib/playlist/schemas";
import type { CuratorResponse, PlaylistState } from "@/types/playlist";
export {
  createCuratorUndoHistoryEntry,
  createErrorHistoryEntry,
  createRequestHistoryEntry,
  type ChatMessage,
  type HistoryIssueStatus,
  type RequestHistoryEntry
} from "@/lib/playlist/collaboration";
import type { ChatMessage, HistoryIssueStatus, RequestHistoryEntry } from "@/lib/playlist/collaboration";

export const LOCAL_DRAFT_VERSION = 1;
export const PERSISTED_WORKSPACE_STATE_VERSION = 1;
const CuratorPersonaSchema = z.enum(["razor", "archivist", "firestarter"]);
export type CuratorPersona = z.infer<typeof CuratorPersonaSchema>;

export type LocalDraftV1 = {
  version: typeof LOCAL_DRAFT_VERSION;
  playlist: PlaylistState;
  messages: ChatMessage[];
  history: RequestHistoryEntry[];
  curatorPersona?: CuratorPersona;
  savedAt: string;
};

type DraftInput = {
  playlist: PlaylistState;
  messages: ChatMessage[];
  history: RequestHistoryEntry[];
  curatorPersona?: CuratorPersona;
  savedAt?: string;
};

export type LocalSessionSummary = {
  id: string;
  name: string;
  savedAt: string;
  playlistTitle: string | null;
  trackCount: number;
};

export type LocalSessionSnapshot = LocalDraftV1 & {
  id: string;
  name: string;
};

export type PersistedWorkspaceStateV1 = {
  version: typeof PERSISTED_WORKSPACE_STATE_VERSION;
  draft: LocalDraftV1 | null;
  sessions: LocalSessionSnapshot[];
  activeSessionId: string | null;
};

type SessionInput = DraftInput & {
  id?: string;
  name?: string;
};

const ChatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string()
});

const HistoryIssueStatusSchema = z.object({
  issueId: z.string().min(1),
  issueKind: z.enum(["rejected_candidate", "review_suggestion"]),
  status: z.enum(["rejected", "accepted", "dismissed", "blocked", "open", "applied", "requested", "ignored"]),
  actedAt: z.string().nullable()
});

const PendingEditContextSchema = z.object({
  kind: z.enum(["add", "replace"]),
  placement: BoundTrackPlacementSchema.nullable().default(null),
  replacementMode: ReplacementModeSchema.default("generic"),
  replacementTargetTrackId: z.string().nullable().default(null),
  replacementTargetLabel: z.string().nullable().default(null),
  replacementSlotIndex: z.number().int().nonnegative().nullable().default(null)
});

const RequestHistoryEntrySchema = z.object({
  id: z.string().min(1),
  userMessage: z.string(),
  assistantMessage: z.string(),
  acceptedCount: z.number().int().nonnegative(),
  rejectedCandidates: z.array(RejectedCandidateSchema),
  createdAt: z.string(),
  kind: z.enum(["request", "seed", "import", "review", "manual-match", "error", "undo"]).optional(),
  error: z.string().optional(),
  movedTrackCount: z.number().int().nonnegative().optional(),
  movedTrackSummary: z.array(z.string()).optional(),
  orderRationale: z.string().nullable().optional(),
  playlistAction: z.enum(["set", "add", "remove", "reorder"]).optional(),
  playlistBefore: PlaylistStateSchema.optional(),
  resultingPlaylistUpdatedAt: z.string().optional(),
  pendingEditContext: PendingEditContextSchema.optional(),
  reviewSuggestions: z.array(ReviewSuggestionSchema).optional(),
  issueStatuses: z.array(HistoryIssueStatusSchema).optional()
});

const LocalDraftSchema = z.object({
  version: z.literal(LOCAL_DRAFT_VERSION),
  playlist: PlaylistStateSchema,
  messages: z.array(z.unknown()).default([]),
  history: z.array(z.unknown()).default([]),
  curatorPersona: CuratorPersonaSchema.optional(),
  savedAt: z.string()
});

const LocalSessionSchema = LocalDraftSchema.extend({
  id: z.string().min(1),
  name: z.string().min(1)
});

const PersistedWorkspaceStateSchema = z.object({
  version: z.literal(PERSISTED_WORKSPACE_STATE_VERSION),
  draft: LocalDraftSchema.nullable(),
  sessions: z.array(LocalSessionSchema).default([]),
  activeSessionId: z.string().min(1).nullable().default(null)
});

function validMessages(value: unknown[]): ChatMessage[] {
  return value
    .map((message) => ChatMessageSchema.safeParse(message))
    .filter((result): result is z.SafeParseSuccess<ChatMessage> => result.success)
    .map((result) => result.data);
}

function validHistory(value: unknown[]): RequestHistoryEntry[] {
  return value
    .map((entry) => RequestHistoryEntrySchema.safeParse(entry))
    .filter((result): result is z.SafeParseSuccess<RequestHistoryEntry> => result.success)
    .map((result) => result.data);
}

export function parseLocalDraft(raw: string | null): LocalDraftV1 | null {
  if (!raw) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  const result = LocalDraftSchema.safeParse(parsed);
  if (!result.success) {
    return null;
  }

  return {
    version: LOCAL_DRAFT_VERSION,
    playlist: result.data.playlist,
    messages: validMessages(result.data.messages),
    history: validHistory(result.data.history),
    curatorPersona: result.data.curatorPersona,
    savedAt: result.data.savedAt
  };
}

export function serializeLocalDraft(input: DraftInput): string {
  const draft: LocalDraftV1 = {
    version: LOCAL_DRAFT_VERSION,
    playlist: input.playlist,
    messages: input.messages,
    history: input.history,
    curatorPersona: input.curatorPersona,
    savedAt: input.savedAt ?? new Date().toISOString()
  };

  return JSON.stringify(draft);
}

export function createLocalSessionId(now = new Date()): string {
  return `session-${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function defaultLocalSessionName(playlist: PlaylistState, savedAt = new Date().toISOString()): string {
  const title = playlist.title?.trim() ?? "";
  if (title && title !== "The CutList") {
    return title;
  }

  const date = new Date(savedAt);
  if (Number.isNaN(date.getTime())) {
    return "Untitled session";
  }

  return `Session ${date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}
export function materializeLocalSessionSnapshot(input: SessionInput): LocalSessionSnapshot {
  const savedAt = input.savedAt ?? new Date().toISOString();
  return {
    version: LOCAL_DRAFT_VERSION,
    id: input.id ?? createLocalSessionId(),
    name: input.name?.trim() || defaultLocalSessionName(input.playlist, savedAt),
    playlist: input.playlist,
    messages: input.messages,
    history: input.history,
    curatorPersona: input.curatorPersona,
    savedAt
  };
}

export function parsePersistedWorkspaceState(raw: string | null): PersistedWorkspaceStateV1 | null {
  if (!raw) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  const result = PersistedWorkspaceStateSchema.safeParse(parsed);
  if (!result.success) {
    return null;
  }

  return {
    version: PERSISTED_WORKSPACE_STATE_VERSION,
    draft: result.data.draft ? {
      version: LOCAL_DRAFT_VERSION,
      playlist: result.data.draft.playlist,
      messages: validMessages(result.data.draft.messages),
      history: validHistory(result.data.draft.history),
      curatorPersona: result.data.draft.curatorPersona,
      savedAt: result.data.draft.savedAt
    } : null,
    sessions: result.data.sessions.map((session) => ({
      version: LOCAL_DRAFT_VERSION,
      id: session.id,
      name: session.name,
      playlist: session.playlist,
      messages: validMessages(session.messages),
      history: validHistory(session.history),
      curatorPersona: session.curatorPersona,
      savedAt: session.savedAt
    })),
    activeSessionId: result.data.activeSessionId
  };
}

export function serializePersistedWorkspaceState(input: PersistedWorkspaceStateV1): string {
  return `${JSON.stringify({
    version: PERSISTED_WORKSPACE_STATE_VERSION,
    draft: input.draft,
    sessions: input.sessions,
    activeSessionId: input.activeSessionId
  }, null, 2)}\n`;
}

export function parseCuratorResponseForHistory(value: unknown): CuratorResponse | null {
  const result = CuratorResponseSchema.safeParse(value);
  return result.success ? result.data : null;
}
