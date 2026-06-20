import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { desktopCommandNames, desktopProgressEventName } from "@/lib/desktop/contracts";
import { downloadPlaylistExport, sendPlaylistMessageStream } from "@/lib/client/playlistApi";
import type { CuratorResponse } from "@/types/playlist";

const invokeMock = vi.fn();
const listenMock = vi.fn();
const cancelMock = vi.fn();

vi.mock("@/lib/client/tauriRuntime", () => ({
  getTauriCore: async () => ({
    invoke: (command: string, args?: Record<string, unknown>) => {
      if (command === desktopCommandNames.cancelRequest) {
        return cancelMock(command, args);
      }
      return invokeMock(command, args);
    }
  }),
  getTauriEvent: async () => ({
    listen: (eventName: string, callback: (event: { payload: unknown }) => void) => listenMock(eventName, callback)
  }),
  getTauriMenu: async () => ({}),
  isTauriApp: () => Boolean((globalThis as { window?: { __TAURI_INTERNALS__?: unknown } }).window?.__TAURI_INTERNALS__)
}));

const curatorResponse: CuratorResponse = {
  message: "Done.",
  playlistUpdate: null,
  playlistMeta: null,
  updatedConstraints: {},
  constraintReport: { passed: true, totalDurationMs: 0, violations: [] },
  rejectedCandidates: []
};

const playlist = {
  id: "playlist",
  title: "Test",
  mood: null,
  arc: null,
  tracks: [],
  constraints: {},
  discoveryRadius: "moderate" as const,
  conversationSummary: null,
  updatedAt: "2026-06-18T00:00:00.000Z"
};

describe("desktop playlist API transport", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    listenMock.mockReset();
    cancelMock.mockReset();
    cancelMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("subscribes to progress events and returns the final response", async () => {
    const progress: string[] = [];
    let handler: ((event: { payload: { requestId: string; event: { message: string } } }) => void) | undefined;

    listenMock.mockImplementation(async (eventName, callback) => {
      expect(eventName).toBe(desktopProgressEventName);
      handler = callback;
      return () => undefined;
    });

    invokeMock.mockImplementation(async (_command, args) => {
      const requestId = args?.requestId as string;
      handler?.({ payload: { requestId, event: { message: "Understanding your request." } } });
      handler?.({ payload: { requestId, event: { message: "Checking intent with the curator model." } } });
      return curatorResponse;
    });

    const response = await sendPlaylistMessageStream({
      playlist,
      userMessage: "Hello."
    }, { onProgress: (message) => progress.push(message) });

    expect(progress).toEqual(["Understanding your request.", "Checking intent with the curator model."]);
    expect(response).toEqual(curatorResponse);
    expect(invokeMock).toHaveBeenCalledWith(desktopCommandNames.playlistMessage, expect.objectContaining({
      payload: expect.objectContaining({ userMessage: "Hello." }),
      requestId: expect.any(String)
    }));
  });

  it("turns aborted native requests into AbortError", async () => {
    listenMock.mockResolvedValue(() => undefined);
    invokeMock.mockRejectedValue(new Error("Request interrupted."));
    const controller = new AbortController();
    controller.abort();

    await expect(sendPlaylistMessageStream({
      playlist,
      userMessage: "Hello."
    }, { onProgress: () => undefined, signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
  });

  it("uses the desktop export command in Tauri mode", async () => {
    vi.stubGlobal("window", { __TAURI_INTERNALS__: {} });
    invokeMock.mockResolvedValue({ status: "cancelled" });

    await expect(downloadPlaylistExport(playlist, "json")).resolves.toEqual({ status: "cancelled" });
    expect(invokeMock).toHaveBeenCalledWith(desktopCommandNames.exportPlaylist, {
      payload: { format: "json", playlist }
    });
  });

  it("uses blob download outside Tauri", async () => {
    const click = vi.fn();
    const createObjectURL = vi.fn(() => "blob:cutlist");
    const revokeObjectURL = vi.fn();

    vi.stubGlobal("window", {});
    vi.stubGlobal("document", {
      createElement: vi.fn(() => ({
        click,
        download: "",
        href: ""
      }))
    });
    vi.stubGlobal("URL", {
      createObjectURL,
      revokeObjectURL
    });

    await expect(downloadPlaylistExport(playlist, "json")).resolves.toEqual({ status: "saved" });
    expect(invokeMock).not.toHaveBeenCalledWith(desktopCommandNames.exportPlaylist, expect.anything());
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
  });
});
