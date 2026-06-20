"use client";

import { useEffect, useState } from "react";
import { ChatPanel } from "@/components/ChatPanel";
import { CuratorPersonaButton } from "@/components/CuratorPersonaButton";
import { LlmSetupButton } from "@/components/LlmSetupButton";
import { SessionStatusButton } from "@/components/SessionStatusButton";
import { PlaylistPanel } from "@/components/PlaylistPanel";
import { useLocalPlaylistDraft } from "@/hooks/useLocalPlaylistDraft";
import { dispatchAppCommand, registerAppCommand, setAppCommandReporter, appCommandIds } from "@/lib/client/appCommands";
import { ensureDesktopMenu } from "@/lib/client/desktopMenu";
import { saveLLMSetup, type CuratorPersona } from "@/lib/client/llmSetupApi";
import { useWorkspaceNavigation } from "@/hooks/useWorkspaceNavigation";
import { activeRejectedCandidateCount, type ChatMessage, type RequestHistoryEntry } from "@/lib/playlist/collaboration";
import { devFixtureHistory, devFixtureMessages, devPlaylistFixture } from "@/lib/playlist/fixtures/devFixtures";
import type { PlaylistState } from "@/types/playlist";

const initialPlaylist: PlaylistState = {
  id: "local-playlist",
  title: "The CutList",
  mood: "Verified playlists for weird, specific taste.",
  arc: null,
  tracks: [],
  constraints: {},
  discoveryRadius: "moderate",
  conversationSummary: null,
  updatedAt: new Date().toISOString()
};

const initialMessages: ChatMessage[] = [
  { role: "assistant", content: "Describe the playlist you want, paste a draft, or add a few known tracks. I only keep tracks after verification, so your playlist stays editable and trustworthy." }
];

const initialHistory: RequestHistoryEntry[] = [];

function latestRejectedCount(history: RequestHistoryEntry[]): number {
  const latestRejectedEntry = [...history].reverse().find((entry) => entry.rejectedCandidates.length > 0);
  return activeRejectedCandidateCount(latestRejectedEntry);
}

export default function Home() {
  const [useDevFixture, setUseDevFixture] = useState(false);

  useEffect(() => {
    setUseDevFixture(process.env.NODE_ENV === "development" && new URLSearchParams(window.location.search).get("fixture") === "playlist");
  }, []);

  return <Workspace key={useDevFixture ? "fixture" : "draft"} useDevFixture={useDevFixture} />;
}

function Workspace({ useDevFixture }: { useDevFixture: boolean }) {
  const [curatorPersona, setCuratorPersona] = useState<CuratorPersona>("razor");
  const [commandNotice, setCommandNotice] = useState<{ tone: "bad" | "ok"; message: string } | null>(null);

  function changeCuratorPersona(persona: CuratorPersona, persist: boolean) {
    setCuratorPersona(persona);
    if (persist) {
      void saveLLMSetup({ curatorPersona: persona });
    }
  }

  const {
    activeSessionId,
    deleteSession,
    history,
    loadSession,
    messages,
    playlist,
    reloadWorkspace,
    resetDraft,
    saveSession,
    savedAt,
    sessions,
    setHistory,
    setMessages,
    setPlaylist
  } = useLocalPlaylistDraft(
    useDevFixture ? devPlaylistFixture : initialPlaylist,
    useDevFixture ? devFixtureMessages : initialMessages,
    useDevFixture ? devFixtureHistory : initialHistory,
    {
      curatorPersona,
      disablePersistence: useDevFixture,
      ignoreStoredDraft: useDevFixture,
      onCuratorPersonaChange: changeCuratorPersona
    }
  );
  const {
    chatMobileMode,
    chooseMobileView,
    mobileView,
    openIssuesFromPlaylist,
    requestUtilitySection,
    requestedUtilitySection,
    requestedUtilitySectionToken
  } = useWorkspaceNavigation(playlist.tracks.length > 0);

  const canResetDraft = useDevFixture || Boolean(savedAt) || playlist.tracks.length > 0 || messages.length > initialMessages.length || history.length > 0;
  const activeSession = sessions.find((session) => session.id === activeSessionId);

  useEffect(() => setAppCommandReporter((notice) => setCommandNotice(notice)), []);

  useEffect(() => {
    if (!commandNotice) {
      return;
    }
    const timeout = window.setTimeout(() => setCommandNotice(null), 4000);
    return () => window.clearTimeout(timeout);
  }, [commandNotice]);

  useEffect(() => {
    const unbind = [
      registerAppCommand(appCommandIds.openWorkspace, () => requestUtilitySection("session")),
      registerAppCommand(appCommandIds.importChat, () => {
        requestUtilitySection("inputs");
        chooseMobileView("ask");
      }),
      registerAppCommand(appCommandIds.saveWorkspace, () => saveSession(activeSession?.name)),
      registerAppCommand(appCommandIds.saveWorkspaceAs, () => {
        const nextName = window.prompt("Save workspace as", activeSession?.name ?? playlist.title ?? "Untitled session");
        if (nextName == null) {
          return;
        }
        saveSession(nextName, { forceNew: true });
      }),
      registerAppCommand(appCommandIds.commandPalette, () => {
        throw new Error("That shortcut is not available in this alpha yet. Use the menu bar for now.");
      }),
      registerAppCommand(appCommandIds.toggleDevTools, () => {
        throw new Error("Developer tools are only available in development builds, not in the normal alpha app.");
      }),
      registerAppCommand(appCommandIds.showHelp, () => {
        window.open("https://github.com/wbridewell/CutList#readme", "_blank", "noopener,noreferrer");
      }),
      registerAppCommand(appCommandIds.reportIssue, () => {
        window.open("https://github.com/wbridewell/CutList/issues/new", "_blank", "noopener,noreferrer");
      })
    ];
    return () => {
      for (const dispose of unbind) {
        dispose();
      }
    };
  }, [activeSession?.name, chooseMobileView, playlist.title, requestUtilitySection, saveSession]);

  useEffect(() => {
    void ensureDesktopMenu();
  }, []);

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand-lockup">
          <img className="brand-banner" src="/cutlist_banner_app.png" alt="CutList" />
          <div className="brand">
            <span className="status-kicker">AI summons. You listen.</span>
            <h1>CutList</h1>
            <p>Verified playlists for weird, specific taste.</p>
          </div>
        </div>
        <div className="topbar-actions">
          <LlmSetupButton />
          <CuratorPersonaButton curatorPersona={curatorPersona} onCuratorPersonaChange={setCuratorPersona} />
          <SessionStatusButton activeSession={activeSession} savedAt={savedAt} onOpenSessions={() => void dispatchAppCommand(appCommandIds.openWorkspace)} />
        </div>
      </header>
      {commandNotice ? <p className={commandNotice.tone}>{commandNotice.message}</p> : null}
      <nav className="mobile-switcher" aria-label="Workspace views">
        <button
          aria-pressed={mobileView === "playlist"}
          className={mobileView === "playlist" ? "is-active" : ""}
          type="button"
          onClick={() => chooseMobileView("playlist")}
        >
          Playlist
        </button>
        <button
          aria-pressed={mobileView === "ask"}
          className={mobileView === "ask" ? "is-active" : ""}
          type="button"
          onClick={() => chooseMobileView("ask")}
        >
          Curator
        </button>
        <button
          aria-pressed={mobileView === "history"}
          className={mobileView === "history" ? "is-active" : ""}
          type="button"
          onClick={() => chooseMobileView("history")}
        >
          History
        </button>
      </nav>
      <div className="workspace">
        <PlaylistPanel
          canResetDraft={canResetDraft}
          liveRejectedCount={latestRejectedCount(history)}
          mobileActive={mobileView === "playlist"}
          onOpenIssues={openIssuesFromPlaylist}
          playlist={playlist}
          onPlaylistChange={setPlaylist}
          onResetDraft={resetDraft}
        />
        <ChatPanel
          activeSessionId={activeSessionId}
          curatorPersona={curatorPersona}
          history={history}
          messages={messages}
          mobileMode={chatMobileMode}
          mobileActive={mobileView === "ask" || mobileView === "history"}
          requestedUtilitySection={requestedUtilitySection}
          requestedUtilitySectionToken={requestedUtilitySectionToken}
          sessions={sessions}
          sessionsEnabled={!useDevFixture}
          onDeleteSession={deleteSession}
          onHistoryChange={setHistory}
          onLoadSession={loadSession}
          onMessagesChange={setMessages}
          onSaveSession={saveSession}
          onPlaylistChange={setPlaylist}
          onReloadWorkspace={reloadWorkspace}
          playlist={playlist}
          showWelcomeGuide={playlist.tracks.length === 0 && !useDevFixture}
        />
      </div>
    </main>
  );
}
