import { describe, expect, it } from "vitest";
import { buildCuratorResponse, buildHistoryEntry, buildPlaylist, buildTrack, buildVerifiedTrack } from "@/lib/testing/builders";
import { CuratorResponseSchema, PlaylistStateSchema, TrackSchema } from "@/lib/playlist/schemas";

describe("fixture builders", () => {
  it("produce values the runtime schemas accept", () => {
    expect(TrackSchema.safeParse(buildTrack()).success).toBe(true);
    expect(TrackSchema.safeParse(buildVerifiedTrack()).success).toBe(true);
    expect(PlaylistStateSchema.safeParse(buildPlaylist({ tracks: [buildTrack(), buildVerifiedTrack({ id: "itunes:2" })] })).success).toBe(true);
    expect(CuratorResponseSchema.safeParse(buildCuratorResponse()).success).toBe(true);
  });

  it("apply overrides last and derive sourceId from id", () => {
    expect(buildTrack({ id: "track-9", energy: 7 })).toMatchObject({ id: "track-9", sourceId: "track-9", energy: 7 });
    expect(buildVerifiedTrack({ id: "itunes:42" })).toMatchObject({ source: "itunes", sourceId: "42" });
    expect(buildHistoryEntry({ kind: "review" }).kind).toBe("review");
  });
});
