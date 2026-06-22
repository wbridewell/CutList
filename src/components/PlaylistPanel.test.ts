import { describe, expect, it } from "vitest";
import { advancePlaylistUndoRevisionState } from "@/components/PlaylistPanel";

describe("PlaylistPanel undo banner lifecycle", () => {
  it("keeps the undo banner through the removal update, then clears on the next playlist mutation", () => {
    const pendingState = {
      armedUpdatedAt: null,
      sourceUpdatedAt: "2026-06-21T00:00:00.000Z"
    };

    expect(advancePlaylistUndoRevisionState(pendingState, "2026-06-21T00:00:00.000Z")).toEqual(pendingState);
    expect(advancePlaylistUndoRevisionState(pendingState, "2026-06-21T00:01:00.000Z")).toEqual({
      armedUpdatedAt: "2026-06-21T00:01:00.000Z",
      sourceUpdatedAt: "2026-06-21T00:00:00.000Z"
    });
    expect(advancePlaylistUndoRevisionState({
      armedUpdatedAt: "2026-06-21T00:01:00.000Z",
      sourceUpdatedAt: "2026-06-21T00:00:00.000Z"
    }, "2026-06-21T00:02:00.000Z")).toBeNull();
  });

  it("clears after a later parent-driven playlist update such as a curator resequence", () => {
    const armedState = {
      armedUpdatedAt: "2026-06-21T00:01:00.000Z",
      sourceUpdatedAt: "2026-06-21T00:00:00.000Z"
    };

    expect(advancePlaylistUndoRevisionState(armedState, "2026-06-21T00:05:00.000Z")).toBeNull();
  });

  it("keeps the banner available while the playlist revision stays unchanged so immediate undo can still work", () => {
    const armedState = {
      armedUpdatedAt: "2026-06-21T00:01:00.000Z",
      sourceUpdatedAt: "2026-06-21T00:00:00.000Z"
    };

    expect(advancePlaylistUndoRevisionState(armedState, "2026-06-21T00:01:00.000Z")).toEqual(armedState);
  });
});
