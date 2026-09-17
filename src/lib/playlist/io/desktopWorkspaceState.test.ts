import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeDesktopWorkspaceState } from "@/lib/playlist/io/desktopWorkspaceState";
import { buildPlaylist } from "@/lib/testing/builders";
import { materializeLocalSessionSnapshot, parsePersistedWorkspaceState } from "@/lib/playlist/io/localDraft";
import type { PersistedWorkspaceStateV1 } from "@/lib/playlist/io/localDraft";

let tempDir: string;
let statePath: string;

const playlist = buildPlaylist({ id: "test", title: "Draft", updatedAt: "2026-05-27T00:00:00Z" });

function sampleState(): PersistedWorkspaceStateV1 {
  const savedAt = "2026-05-27T00:00:00Z";
  return {
    version: 1,
    draft: {
      version: 1,
      playlist,
      messages: [{ role: "user", content: "add something" }],
      history: [],
      savedAt
    },
    sessions: [
      materializeLocalSessionSnapshot({ name: "Session A", playlist, messages: [], history: [], savedAt }),
      materializeLocalSessionSnapshot({ name: "Session B", playlist, messages: [], history: [], savedAt })
    ],
    activeSessionId: null
  };
}

function readStateFile(): PersistedWorkspaceStateV1 | null {
  return parsePersistedWorkspaceState(readFileSync(statePath, "utf8"));
}

describe("desktop workspace state persistence", () => {
  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "cutlist-workspace-state-"));
    statePath = join(tempDir, "workspace-state.json");
    vi.stubEnv("CUTLIST_DESKTOP_WORKSPACE_STATE_PATH", statePath);
    vi.stubEnv("CUTLIST_DESKTOP_DATA_DIR", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("writes a workspace with a draft and sessions that can be read back", () => {
    const state = sampleState();
    writeDesktopWorkspaceState(state);

    const restored = readStateFile();

    expect(restored?.draft?.playlist.id).toBe("test");
    expect(restored?.sessions).toHaveLength(2);
    expect(restored?.sessions.map((session) => session.name)).toEqual(["Session A", "Session B"]);
  });

  it("removes the file when writing null", () => {
    writeDesktopWorkspaceState(sampleState());
    expect(existsSync(statePath)).toBe(true);

    writeDesktopWorkspaceState(null);

    expect(existsSync(statePath)).toBe(false);
  });

  it("overwrites an existing corrupt file instead of failing", () => {
    writeFileSync(statePath, "{\"version\":1,\"draft\":", "utf8");

    writeDesktopWorkspaceState(sampleState());

    expect(readStateFile()?.draft?.playlist.id).toBe("test");
  });

  it("honors CUTLIST_DESKTOP_WORKSPACE_STATE_PATH over CUTLIST_DESKTOP_DATA_DIR", () => {
    const dataDir = mkdtempSync(join(tmpdir(), "cutlist-workspace-data-dir-"));
    vi.stubEnv("CUTLIST_DESKTOP_DATA_DIR", dataDir);

    writeDesktopWorkspaceState(sampleState());

    expect(existsSync(statePath)).toBe(true);
    expect(existsSync(join(dataDir, "workspace-state.json"))).toBe(false);
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("falls back to CUTLIST_DESKTOP_DATA_DIR when no explicit path is set", () => {
    vi.stubEnv("CUTLIST_DESKTOP_WORKSPACE_STATE_PATH", "");
    const dataDir = mkdtempSync(join(tmpdir(), "cutlist-workspace-data-dir-"));
    vi.stubEnv("CUTLIST_DESKTOP_DATA_DIR", dataDir);

    writeDesktopWorkspaceState(sampleState());

    const dataDirStatePath = join(dataDir, "workspace-state.json");
    expect(existsSync(dataDirStatePath)).toBe(true);
    expect(JSON.parse(readFileSync(dataDirStatePath, "utf8")).draft.playlist.id).toBe("test");
    rmSync(dataDir, { recursive: true, force: true });
  });
});
