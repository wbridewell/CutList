import { describe, expect, it } from "vitest";
import {
  acceptedCountForPlaylistUpdate,
  applyPlaylistOperationUndo,
  applyPlaylistUpdateTracks,
  createRemoveOperationUndoPayload,
  createSetOperationUndoPayload,
  destructiveLabelForPlaylistOperation,
  getPlaylistOperationDefinition,
  playlistOperationRegistry,
  summarizePlaylistUpdate,
  undoLabelForPlaylistOperation,
  undoSummaryForPlaylistOperation
} from "@/lib/playlist/operations";
import type { PlaylistState, PlaylistUpdate, Track } from "@/types/playlist";

const trackA: Track = {
  id: "itunes:1",
  title: "Song A",
  artist: "Artist A",
  album: null,
  durationMs: 120000,
  runtime: "2:00",
  verified: true,
  source: "itunes",
  sourceId: "1",
  sourceUrl: null,
  artworkUrl: null,
  explicit: false,
  releaseDate: null,
  vibeTags: [],
  genreTags: [],
  rationale: null,
  energy: null,
  verificationNote: null
};

const trackB: Track = {
  ...trackA,
  id: "itunes:2",
  title: "Song B",
  artist: "Artist B",
  sourceId: "2"
};

const trackC: Track = {
  ...trackA,
  id: "itunes:3",
  title: "Song C",
  artist: "Artist C",
  sourceId: "3"
};

const playlistBefore: PlaylistState = {
  id: "playlist",
  title: "Playlist",
  mood: null,
  arc: null,
  tracks: [trackA, trackB],
  constraints: {},
  discoveryRadius: "moderate",
  conversationSummary: null,
  updatedAt: "before"
};

function update(action: PlaylistUpdate["action"], tracks: Track[]): PlaylistUpdate {
  return { action, tracks, orderRationale: action === "reorder" ? "Better flow." : null };
}

describe("playlist operation registry", () => {
  it("defines the current playlist operation language", () => {
    expect(playlistOperationRegistry.map((operation) => operation.id)).toEqual(["set", "add", "remove", "reorder"]);
    expect(getPlaylistOperationDefinition("add")).toMatchObject({
      payloadKind: "trackDelta",
      destructive: false
    });
    expect(getPlaylistOperationDefinition("remove")).toMatchObject({
      payloadKind: "trackDelta",
      destructive: true
    });
    expect(getPlaylistOperationDefinition("reorder")).toMatchObject({
      payloadKind: "fullTrackList",
      destructive: false
    });
    expect(getPlaylistOperationDefinition("reorder").promptGuidance.join("\n")).toContain("need a removal action");
    expect(getPlaylistOperationDefinition("remove").promptGuidance.join("\n")).toContain("removeTrackIds");
    expect(getPlaylistOperationDefinition("remove").undoLabel).toBe("Undo removal");
    expect(getPlaylistOperationDefinition("set").undoLabel).toBe("Undo edit");
  });

  it("applies track payload semantics for every operation", () => {
    expect(applyPlaylistUpdateTracks(playlistBefore.tracks, update("add", [trackC]))).toEqual([trackA, trackB, trackC]);
    expect(applyPlaylistUpdateTracks(playlistBefore.tracks, update("remove", [trackA]))).toEqual([trackB]);
    expect(applyPlaylistUpdateTracks(playlistBefore.tracks, update("set", [trackC]))).toEqual([trackC]);
    expect(applyPlaylistUpdateTracks(playlistBefore.tracks, update("reorder", [trackB, trackA]))).toEqual([trackB, trackA]);
  });

  it("centralizes accepted-count behavior", () => {
    expect(acceptedCountForPlaylistUpdate(update("add", [trackC]))).toBe(1);
    expect(acceptedCountForPlaylistUpdate(update("remove", [trackA]))).toBe(0);
    expect(acceptedCountForPlaylistUpdate(update("set", [trackA, trackB, trackC]))).toBe(0);
    expect(acceptedCountForPlaylistUpdate(null)).toBe(0);
  });

  it("summarizes reorder movement from the registry", () => {
    const summary = summarizePlaylistUpdate(update("reorder", [trackB, trackA]), playlistBefore);

    expect(summary).toEqual({
      movedTrackCount: 2,
      movedTrackSummary: [
        "2 -> 1 · Song B by Artist B",
        "1 -> 2 · Song A by Artist A"
      ],
      orderRationale: "Better flow."
    });
    expect(summarizePlaylistUpdate(update("add", [trackC]), playlistBefore)).toBeNull();
  });

  it("standardizes destructive labels and remove undo payloads", () => {
    const payload = createRemoveOperationUndoPayload(playlistBefore, [trackA.id, trackB.id], { qualifier: "flagged" });

    expect(destructiveLabelForPlaylistOperation("remove", { count: 2, qualifier: "flagged" })).toBe("Remove 2 flagged tracks");
    expect(destructiveLabelForPlaylistOperation("remove", { track: trackA })).toBe("Remove Song A");
    expect(payload?.operationId).toBe("remove");
    if (payload?.operationId === "remove") {
      expect(payload.removedTracks.map((item) => [item.index, item.track.id])).toEqual([[0, trackA.id], [1, trackB.id]]);
    }
    expect(undoSummaryForPlaylistOperation(payload!)).toBe("Removed 2 flagged tracks.");
    expect(undoLabelForPlaylistOperation("remove")).toBe("Undo removal");
    expect(applyPlaylistOperationUndo({ ...playlistBefore, tracks: [] }, payload!, "after-undo")).toMatchObject({
      tracks: [trackA, trackB],
      updatedAt: "after-undo"
    });
    expect(createRemoveOperationUndoPayload(playlistBefore, ["missing"])).toBeNull();
  });

  it("supports full-playlist undo payloads for compression-style edits", () => {
    const payload = createSetOperationUndoPayload(playlistBefore, { qualifier: "compressed" });

    expect(undoLabelForPlaylistOperation("set")).toBe("Undo edit");
    expect(undoSummaryForPlaylistOperation(payload!)).toContain("Replaced the full playlist");
    expect(applyPlaylistOperationUndo({ ...playlistBefore, tracks: [trackC] }, payload!, "after-undo")).toMatchObject({
      tracks: [trackA, trackB],
      updatedAt: "after-undo"
    });
  });
});
