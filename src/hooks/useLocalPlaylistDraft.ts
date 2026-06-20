"use client";

import { useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { getDesktopWorkspaceState, saveDesktopWorkspaceState } from "@/lib/client/workspaceStateApi";
import type { CuratorPersona, LocalSessionSnapshot, LocalSessionSummary, PersistedWorkspaceStateV1 } from "@/lib/playlist/io/localDraft";
import { materializeLocalSessionSnapshot } from "@/lib/playlist/io/localDraft";
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
  const skipNextPersist = useRef(false);

  async function loadDesktopWorkspace() {
    let lastError: unknown = null;
    for (let attempt = 0; attempt < DESKTOP_RESTORE_ATTEMPTS; attempt += 1) {
      try {
        const response = await getDesktopWorkspaceState();
        return response.state ?? emptyWorkspaceState();
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

  async function persistWorkspaceState(state: PersistedWorkspaceStateV1): Promise<void> {
    await saveDesktopWorkspaceState(state);
  }

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
      applyWorkspaceState(workspace, false);
      setRestored(true);
    }

    void restore();
    return () => {
      cancelled = true;
    };
  }, [initialHistory, initialMessages, options.disablePersistence, options.ignoreStoredDraft]);

  useEffect(() => {
    if (!restored || options.disablePersistence) {
      return;
    }
    if (skipNextPersist.current) {
      skipNextPersist.current = false;
      return;
    }
    const handle = window.setTimeout(() => {
      const nextSavedAt = new Date().toISOString();
      const draft = { playlist, messages, history, curatorPersona: options.curatorPersona, savedAt: nextSavedAt, version: 1 as const };
      void persistWorkspaceState({
        version: 1,
        draft,
        sessions: sessionSnapshots,
        activeSessionId
      });
      setSavedAt(nextSavedAt);
    }, 500);

    return () => {
      window.clearTimeout(handle);
    };
  }, [activeSessionId, history, messages, options.curatorPersona, options.disablePersistence, playlist, restored, sessionSnapshots]);

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
    setPlaylist
  };
}
