"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { getDesktopWorkspaceState, quarantineDesktopWorkspaceState, saveDesktopWorkspaceState } from "@/lib/client/workspaceStateApi";
import type { DesktopWorkspaceStateReadResult } from "@/lib/desktop/contracts";
import type { CuratorPersona, LocalSessionSnapshot, LocalSessionSummary, PersistedWorkspaceStateV1 } from "@/lib/playlist/io/localDraft";
import { materializeLocalSessionSnapshot, validatePersistedWorkspaceStateValue } from "@/lib/playlist/io/localDraft";
import type { ChatMessage, RequestHistoryEntry } from "@/lib/playlist/collaboration";
import type { PlaylistState } from "@/types/playlist";

type LocalPlaylistDraftState = {
  history: RequestHistoryEntry[];
  messages: ChatMessage[];
  playlist: PlaylistState;
  savedAt: string | null;
  sessions: LocalSessionSummary[];
  activeSessionId: string | null;
  deleteSession: (id: string) => void;
  loadSession: (id: string) => void;
  reloadWorkspace: () => Promise<void>;
  resetDraft: () => void;
  saveSession: (name?: string, options?: { forceNew?: boolean }) => void;
  setHistory: Dispatch<SetStateAction<RequestHistoryEntry[]>>;
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  setPlaylist: (playlist: PlaylistState) => void;
  workspaceRecoveryNotice: string | null;
  autosaveError: string | null;
  flushPendingSave: () => Promise<void>;
};

type LocalPlaylistDraftOptions = {
  curatorPersona?: CuratorPersona;
  disablePersistence?: boolean;
  ignoreStoredDraft?: boolean;
  onCuratorPersonaChange?: (persona: CuratorPersona, persist: boolean) => void;
};

const emptyInitialHistory: RequestHistoryEntry[] = [];
const DESKTOP_RESTORE_ATTEMPTS = 5;
const DESKTOP_RESTORE_DELAY_MS = 250;
const AUTOSAVE_DEBOUNCE_MS = 500;

type PendingSave = {
  state: PersistedWorkspaceStateV1;
  savedAt: string;
};

export function autosaveFailureMessage(error: unknown): string {
  const detail = error instanceof Error && error.message.trim() ? ` (${error.message.trim()})` : "";
  return `Autosave failed${detail}. Your latest changes are not saved to disk yet; CutList will retry on the next change.`;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function sessionSummariesFromSnapshots(sessions: LocalSessionSnapshot[]): LocalSessionSummary[] {
  return [...sessions]
    .map((session) => ({
      id: session.id,
      name: session.name,
      savedAt: session.savedAt,
      playlistTitle: session.playlist.title || null,
      trackCount: session.playlist.tracks.length
    }))
    .sort((left, right) => right.savedAt.localeCompare(left.savedAt));
}

function emptyWorkspaceState(): PersistedWorkspaceStateV1 {
  return {
    version: 1,
    draft: null,
    sessions: [],
    activeSessionId: null
  };
}

export function recoveryNoticeMessage(recoveredPath: string | null): string {
  return recoveredPath
    ? `Your saved workspace could not be read and was backed up to ${recoveredPath}. Starting from an empty workspace.`
    : "Your saved workspace could not be read. Starting from an empty workspace.";
}

export type WorkspaceLoadDecision =
  | { kind: "use"; workspace: PersistedWorkspaceStateV1 }
  | { kind: "use-empty"; notice: string | null }
  | { kind: "quarantine-then-use-empty" };

export type QuarantineOutcome =
  | { status: "success"; recoveredPath: string | null }
  | { status: "failed" };

// A failed quarantine call means the damaged file is still sitting at the path autosave
// writes to, so autosave must stay off for the rest of this session rather than silently
// overwriting the very file recovery was supposed to preserve for the user or support.
export function workspaceLoadOutcomeAfterQuarantine(
  outcome: QuarantineOutcome
): { notice: string; persistenceBlocked: boolean } {
  if (outcome.status === "failed") {
    return {
      notice: "Your saved workspace could not be read and the damaged copy could not be safely backed up. Autosave is paused for this session so nothing gets overwritten; restart CutList to try again.",
      persistenceBlocked: true
    };
  }
  return { notice: recoveryNoticeMessage(outcome.recoveredPath), persistenceBlocked: false };
}

// Rust reads the workspace file directly (see desktop_get_workspace_state) rather than
// spawning the Node backend, so JSON that parses but fails our schema only gets caught
// here, as "ok" with a state value that fails validatePersistedWorkspaceStateValue. In that
// case the caller must quarantine the file itself so the next autosave doesn't silently
// overwrite it before anyone has a chance to recover it.
export function decideWorkspaceLoad(response: DesktopWorkspaceStateReadResult): WorkspaceLoadDecision {
  if (response.status === "empty") {
    return { kind: "use-empty", notice: null };
  }

  if (response.status === "unreadable") {
    return { kind: "use-empty", notice: recoveryNoticeMessage(response.recoveredPath) };
  }

  const validated = validatePersistedWorkspaceStateValue(response.state);
  if (validated.status === "ok") {
    return { kind: "use", workspace: validated.state };
  }

  return { kind: "quarantine-then-use-empty" };
}

async function resolveDesktopWorkspaceState(): Promise<{
  workspace: PersistedWorkspaceStateV1;
  notice: string | null;
  persistenceBlocked: boolean;
}> {
  const decision = decideWorkspaceLoad(await getDesktopWorkspaceState());

  if (decision.kind === "use") {
    return { workspace: decision.workspace, notice: null, persistenceBlocked: false };
  }

  if (decision.kind === "use-empty") {
    return { workspace: emptyWorkspaceState(), notice: decision.notice, persistenceBlocked: false };
  }

  let quarantineOutcome: QuarantineOutcome;
  try {
    const { recoveredPath } = await quarantineDesktopWorkspaceState();
    quarantineOutcome = { status: "success", recoveredPath };
  } catch {
    quarantineOutcome = { status: "failed" };
  }
  const { notice, persistenceBlocked } = workspaceLoadOutcomeAfterQuarantine(quarantineOutcome);
  return { workspace: emptyWorkspaceState(), notice, persistenceBlocked };
}

export function useLocalPlaylistDraft(
  initialPlaylist: PlaylistState,
  initialMessages: ChatMessage[],
  initialHistory: RequestHistoryEntry[] = emptyInitialHistory,
  options: LocalPlaylistDraftOptions = {}
): LocalPlaylistDraftState {
  const [playlist, setPlaylist] = useState<PlaylistState>(initialPlaylist);
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [history, setHistory] = useState<RequestHistoryEntry[]>(initialHistory);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [sessions, setSessions] = useState<LocalSessionSummary[]>([]);
  const [sessionSnapshots, setSessionSnapshots] = useState<LocalSessionSnapshot[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);
  const [workspaceRecoveryNotice, setWorkspaceRecoveryNotice] = useState<string | null>(null);
  const [persistenceBlockedByQuarantineFailure, setPersistenceBlockedByQuarantineFailure] = useState(false);
  const [autosaveError, setAutosaveError] = useState<string | null>(null);
  const skipNextPersist = useRef(false);
  const pendingSave = useRef<PendingSave | null>(null);
  const pendingSaveTimer = useRef<number | null>(null);

  async function loadDesktopWorkspace(): Promise<PersistedWorkspaceStateV1> {
    let lastError: unknown = null;
    for (let attempt = 0; attempt < DESKTOP_RESTORE_ATTEMPTS; attempt += 1) {
      try {
        const { workspace, notice, persistenceBlocked } = await resolveDesktopWorkspaceState();
        if (notice) {
          setWorkspaceRecoveryNotice(notice);
        }
        if (persistenceBlocked) {
          setPersistenceBlockedByQuarantineFailure(true);
        }
        return workspace;
      } catch (error) {
        lastError = error;
        if (attempt < DESKTOP_RESTORE_ATTEMPTS - 1) {
          await wait(DESKTOP_RESTORE_DELAY_MS);
        }
      }
    }

    throw lastError instanceof Error ? lastError : new Error("Could not load desktop workspace state.");
  }

  function applyWorkspaceState(workspace: {
    draft: {
      playlist: PlaylistState;
      messages: ChatMessage[];
      history: RequestHistoryEntry[];
      curatorPersona?: CuratorPersona;
      savedAt: string;
    } | null;
    sessions: LocalSessionSnapshot[];
    activeSessionId: string | null;
  }, persistPersona: boolean) {
    setSessionSnapshots(workspace.sessions);
    setSessions(sessionSummariesFromSnapshots(workspace.sessions));
    setActiveSessionId(workspace.activeSessionId);

    if (workspace.draft) {
      if (workspace.draft.curatorPersona) {
        options.onCuratorPersonaChange?.(workspace.draft.curatorPersona, persistPersona);
      }
      setPlaylist(workspace.draft.playlist);
      setMessages(workspace.draft.messages.length > 0 ? workspace.draft.messages : initialMessages);
      setHistory(workspace.draft.history);
      setSavedAt(workspace.draft.savedAt);
      return;
    }

    setHistory(initialHistory);
  }

  // The restore effect runs once per persistence mode, not on every render, so it reads
  // the latest applyWorkspaceState through a ref instead of listing it as a dependency.
  const applyWorkspaceStateRef = useRef(applyWorkspaceState);
  applyWorkspaceStateRef.current = applyWorkspaceState;

  // Writes whatever autosave has queued, right now. The debounce normally does this half
  // a second after the last change; the window close and Quit handlers call it directly
  // so the last edit before quitting is not lost. savedAt only advances once the write
  // has actually succeeded, and a failure is surfaced instead of swallowed.
  const flushPendingSave = useCallback(async (): Promise<void> => {
    if (pendingSaveTimer.current != null) {
      window.clearTimeout(pendingSaveTimer.current);
      pendingSaveTimer.current = null;
    }
    const pending = pendingSave.current;
    if (!pending) {
      return;
    }
    pendingSave.current = null;
    try {
      await saveDesktopWorkspaceState(pending.state);
      setSavedAt(pending.savedAt);
      setAutosaveError(null);
    } catch (error) {
      setAutosaveError(autosaveFailureMessage(error));
      throw error;
    }
  }, []);

  async function reloadWorkspace() {
    if (options.disablePersistence || options.ignoreStoredDraft) {
      return;
    }

    skipNextPersist.current = true;
    applyWorkspaceState(await loadDesktopWorkspace(), false);
  }

  useEffect(() => {
    let cancelled = false;

    async function restore() {
      if (options.disablePersistence) {
        if (!cancelled) {
          setSessions([]);
          setSessionSnapshots([]);
          setHistory(initialHistory);
          setRestored(true);
        }
        return;
      }

      const workspace = options.ignoreStoredDraft ? { draft: null, sessions: [], activeSessionId: null } : await loadDesktopWorkspace();
      if (cancelled) {
        return;
      }

      skipNextPersist.current = true;
      applyWorkspaceStateRef.current(workspace, false);
      setRestored(true);
    }

    void restore();
    return () => {
      cancelled = true;
    };
  }, [initialHistory, initialMessages, options.disablePersistence, options.ignoreStoredDraft]);

  useEffect(() => {
    if (!restored || options.disablePersistence || persistenceBlockedByQuarantineFailure) {
      return;
    }
    if (skipNextPersist.current) {
      skipNextPersist.current = false;
      return;
    }
    const nextSavedAt = new Date().toISOString();
    const draft = { playlist, messages, history, curatorPersona: options.curatorPersona, savedAt: nextSavedAt, version: 1 as const };
    pendingSave.current = {
      state: { version: 1, draft, sessions: sessionSnapshots, activeSessionId },
      savedAt: nextSavedAt
    };
    if (pendingSaveTimer.current != null) {
      window.clearTimeout(pendingSaveTimer.current);
    }
    pendingSaveTimer.current = window.setTimeout(() => {
      pendingSaveTimer.current = null;
      void flushPendingSave().catch(() => undefined);
    }, AUTOSAVE_DEBOUNCE_MS);
  }, [activeSessionId, flushPendingSave, history, messages, options.curatorPersona, options.disablePersistence, persistenceBlockedByQuarantineFailure, playlist, restored, sessionSnapshots]);

  useEffect(() => () => {
    if (pendingSaveTimer.current != null) {
      window.clearTimeout(pendingSaveTimer.current);
    }
  }, []);

  function resetDraft() {
    setPlaylist({ ...initialPlaylist, updatedAt: new Date().toISOString() });
    setMessages(initialMessages);
    setHistory(initialHistory);
    setSavedAt(null);
    setActiveSessionId(null);
  }

  function saveSession(name?: string, saveOptions?: { forceNew?: boolean }) {
    if (options.disablePersistence) {
      return;
    }

    const nextSavedAt = new Date().toISOString();
    const snapshot = materializeLocalSessionSnapshot({
      id: saveOptions?.forceNew ? undefined : activeSessionId ?? undefined,
      name,
      playlist,
      messages,
      history,
      curatorPersona: options.curatorPersona,
      savedAt: nextSavedAt
    });
    const nextSessions = [snapshot, ...sessionSnapshots.filter((session) => session.id !== snapshot.id)]
      .sort((left, right) => right.savedAt.localeCompare(left.savedAt));
    setSessionSnapshots(nextSessions);
    setSessions(sessionSummariesFromSnapshots(nextSessions));
    setActiveSessionId(snapshot.id);
    setSavedAt(nextSavedAt);
  }

  function loadSession(id: string) {
    const session = sessionSnapshots.find((item) => item.id === id);
    if (!session) {
      return;
    }

    setPlaylist(session.playlist);
    setMessages(session.messages.length > 0 ? session.messages : initialMessages);
    setHistory(session.history);
    options.onCuratorPersonaChange?.(session.curatorPersona ?? "razor", true);
    setSavedAt(session.savedAt);
    setActiveSessionId(session.id);
  }

  function deleteSession(id: string) {
    const nextSessions = sessionSnapshots.filter((session) => session.id !== id);
    setSessionSnapshots(nextSessions);
    setSessions(sessionSummariesFromSnapshots(nextSessions));
    if (activeSessionId === id) {
      setActiveSessionId(null);
    }
  }

  return {
    activeSessionId,
    deleteSession,
    history,
    loadSession,
    messages,
    playlist,
    reloadWorkspace,
    savedAt,
    saveSession,
    sessions,
    resetDraft,
    setHistory,
    setMessages,
    setPlaylist,
    workspaceRecoveryNotice,
    autosaveError,
    flushPendingSave
  };
}
