"use client";

import type { LocalSessionSummary } from "@/lib/playlist/io/localDraft";

function currentSessionLabel(activeSession: LocalSessionSummary | undefined): string {
  return activeSession?.name ?? "Local draft";
}

export function SessionStatusButton({
  activeSession,
  savedAt,
  onOpenSessions
}: {
  activeSession?: LocalSessionSummary;
  savedAt: string | null;
  onOpenSessions: () => void;
}) {
  return (
    <button className="terminal-status session-launcher" type="button" onClick={onOpenSessions} aria-label="Open sessions">
      <span className="session-launcher-title">{currentSessionLabel(activeSession)}</span>
      <span className="session-launcher-meta">{savedAt ? `Saved ${new Date(savedAt).toLocaleTimeString()}` : "Ready"}</span>
    </button>
  );
}
