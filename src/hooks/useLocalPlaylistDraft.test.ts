import { describe, expect, it } from "vitest";
import { autosaveFailureMessage, decideWorkspaceLoad, recoveryNoticeMessage, workspaceLoadOutcomeAfterQuarantine } from "@/hooks/useLocalPlaylistDraft";
import { buildPlaylist } from "@/lib/testing/builders";
import type { DesktopWorkspaceStateReadResult } from "@/lib/desktop/contracts";

const playlist = buildPlaylist({ id: "test", title: "Draft", updatedAt: "2026-05-27T00:00:00Z" });

const validState = {
  version: 1 as const,
  draft: {
    version: 1 as const,
    playlist,
    messages: [],
    history: [],
    savedAt: "2026-05-27T00:00:00Z"
  },
  sessions: [],
  activeSessionId: null
};

function readResult(overrides: Partial<DesktopWorkspaceStateReadResult>): DesktopWorkspaceStateReadResult {
  return { status: "ok", state: null, recoveredPath: null, ...overrides };
}

describe("recoveryNoticeMessage", () => {
  it("names the backup path when one is available", () => {
    expect(recoveryNoticeMessage("/data/workspace-state.damaged-123.json")).toContain(
      "/data/workspace-state.damaged-123.json"
    );
  });

  it("falls back to a generic message without a path", () => {
    expect(recoveryNoticeMessage(null)).toBe("Your saved workspace could not be read. Starting from an empty workspace.");
  });
});

describe("decideWorkspaceLoad", () => {
  it("uses the parsed state directly when the file is empty", () => {
    const decision = decideWorkspaceLoad(readResult({ status: "empty", state: null }));

    expect(decision).toEqual({ kind: "use-empty", notice: null });
  });

  it("surfaces a recovery notice when Rust already quarantined an unreadable file", () => {
    const decision = decideWorkspaceLoad(readResult({
      status: "unreadable",
      recoveredPath: "/data/workspace-state.damaged-123.json"
    }));

    expect(decision.kind).toBe("use-empty");
    expect(decision.kind === "use-empty" ? decision.notice : null).toContain("damaged-123.json");
  });

  it("uses the validated workspace when the state matches the schema", () => {
    const decision = decideWorkspaceLoad(readResult({ status: "ok", state: validState }));

    expect(decision.kind).toBe("use");
    expect(decision.kind === "use" ? decision.workspace.draft?.playlist.id : null).toBe("test");
  });

  it("asks the caller to quarantine when the JSON parses but fails the schema", () => {
    const decision = decideWorkspaceLoad(readResult({ status: "ok", state: { unexpected: "shape" } }));

    expect(decision).toEqual({ kind: "quarantine-then-use-empty" });
  });
});

describe("workspaceLoadOutcomeAfterQuarantine", () => {
  it("does not block persistence once the damaged file was actually backed up", () => {
    const outcome = workspaceLoadOutcomeAfterQuarantine({ status: "success", recoveredPath: "/data/workspace-state.damaged-123.json" });

    expect(outcome.persistenceBlocked).toBe(false);
    expect(outcome.notice).toContain("damaged-123.json");
  });

  it("does not block persistence when there was nothing left to quarantine", () => {
    const outcome = workspaceLoadOutcomeAfterQuarantine({ status: "success", recoveredPath: null });

    expect(outcome.persistenceBlocked).toBe(false);
  });

  it("blocks persistence when the quarantine call itself fails, so autosave cannot overwrite the damaged file", () => {
    const outcome = workspaceLoadOutcomeAfterQuarantine({ status: "failed" });

    expect(outcome.persistenceBlocked).toBe(true);
    expect(outcome.notice).toContain("Autosave is paused");
  });
});

describe("autosaveFailureMessage", () => {
  it("includes the underlying error so the user can report it", () => {
    const message = autosaveFailureMessage(new Error("EACCES: permission denied"));

    expect(message).toContain("Autosave failed (EACCES: permission denied)");
    expect(message).toContain("not saved to disk yet");
  });

  it("stays readable when the failure carries no message", () => {
    expect(autosaveFailureMessage(undefined)).toBe(
      "Autosave failed. Your latest changes are not saved to disk yet; CutList will retry on the next change."
    );
  });
});
