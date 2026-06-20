import { describe, expect, it } from "vitest";
import { playlistExportFormatIds } from "@/lib/playlist/io/exportFormats";
import { exportFormatRegistry, exportPlaylist } from "@/lib/playlist/io/exports";
import { ExportRequestSchema } from "@/lib/playlist/schemas";
import type { PlaylistState } from "@/types/playlist";

const playlist: PlaylistState = {
  id: "test",
  title: "Export Test",
  mood: "A mood",
  arc: "An arc",
  constraints: {},
  discoveryRadius: "moderate",
  conversationSummary: null,
  updatedAt: "2026-05-27T00:00:00Z",
  tracks: [{
    id: "itunes:1",
    title: "Pink Moon",
    artist: "Nick Drake",
    album: "Pink Moon, Deluxe",
    durationMs: 121000,
    runtime: "2:01",
    verified: true,
    source: "itunes",
    sourceId: "1",
    sourceUrl: "https://example.com",
    isrcs: ["GBAYE7200011"],
    artworkUrl: null,
    explicit: false,
    releaseDate: null,
    vibeTags: ["haunted folk"],
    genreTags: ["singer songwriter"],
    rationale: "Fits.",
    fitNotes: "Short and spectral.",
    energy: 2,
    verificationNote: "Verified."
  }]
};

describe("playlist exports", () => {
  it("accepts import-friendly export formats in the request schema", () => {
    for (const format of playlistExportFormatIds) {
      expect(ExportRequestSchema.safeParse({ playlist, format }).success).toBe(true);
    }
    expect(ExportRequestSchema.safeParse({ playlist, format: "spotify" }).success).toBe(false);
  });

  it("defines export format metadata in one registry", () => {
    expect(exportFormatRegistry.map((format) => format.id)).toEqual([
      "migration_csv",
      "m3u8",
      "csv",
      "txt",
      "json",
      "apple_music_xml",
      "m3u"
    ]);
    expect([...playlistExportFormatIds].sort()).toEqual([...new Set(exportFormatRegistry.map((format) => format.id))].sort());
    expect(exportFormatRegistry.find((format) => format.id === "m3u8")).toMatchObject({
      label: "M3U8",
      extension: "m3u8",
      mimeType: "application/vnd.apple.mpegurl",
      category: "primary"
    });
  });

  it("exports CSV with expected columns", () => {
    const result = exportPlaylist(playlist, "csv");

    expect(result.filename).toBe("export-test.csv");
    expect(result.content).toContain("Position,Title,Artist,Album");
    expect(result.content).toContain("FitNotes");
    expect(result.content).toContain("Short and spectral.");
    expect(result.content).toContain("Pink Moon");
  });

  it("exports plain text track order", () => {
    const result = exportPlaylist(playlist, "txt");

    expect(result.content).toContain("1. Nick Drake - Pink Moon");
  });

  it("exports complete JSON state", () => {
    const result = exportPlaylist(playlist, "json");

    expect(JSON.parse(result.content).tracks[0].source).toBe("itunes");
  });

  it("exports migration CSV with matching columns and escaped values", () => {
    const result = exportPlaylist(playlist, "migration_csv");

    expect(result.filename).toBe("export-test-migration.csv");
    expect(result.content).toContain("Position,Title,Artist,Album,DurationMs,Runtime,BPM,BPMConfidence,VocalProfile,VocalProfileConfidence,EvidenceNotes,ISRC,Source,SourceId,SourceUrl,SearchQuery");
    expect(result.content).toContain("GBAYE7200011");
    expect(result.content).toContain("\"Pink Moon, Deluxe\"");
    expect(result.content).toContain("\"Nick Drake Pink Moon Pink Moon, Deluxe\"");
  });

  it("exports M3U and M3U8 extended playlist files", () => {
    const m3u = exportPlaylist(playlist, "m3u");
    const m3u8 = exportPlaylist(playlist, "m3u8");

    expect(m3u.filename).toBe("export-test.m3u");
    expect(m3u.mimeType).toBe("audio/x-mpegurl");
    expect(m3u.content).toContain("#EXTM3U");
    expect(m3u.content).toContain("#EXTINF:121,Nick Drake - Pink Moon");
    expect(m3u.content).toContain("https://example.com");
    expect(m3u8.filename).toBe("export-test.m3u8");
    expect(m3u8.mimeType).toBe("application/vnd.apple.mpegurl");
  });

  it("falls back to artist-title references in M3U when no source URL exists", () => {
    const result = exportPlaylist({
      ...playlist,
      tracks: [{ ...playlist.tracks[0], sourceUrl: null }]
    }, "m3u8");

    expect(result.content).toContain("Nick Drake - Pink Moon");
  });

  it("exports Apple Music XML-style playlist text", () => {
    const result = exportPlaylist(playlist, "apple_music_xml");

    expect(result.filename).toBe("export-test-apple-music.xml");
    expect(result.mimeType).toBe("application/xml");
    expect(result.content).toContain("<?xml version=\"1.0\" encoding=\"UTF-8\"?>");
    expect(result.content).toContain("<key>Tracks</key>");
    expect(result.content).toContain("<key>Playlists</key>");
    expect(result.content).toContain("<key>Name</key><string>Pink Moon</string>");
    expect(result.content).toContain("<key>Album</key><string>Pink Moon, Deluxe</string>");
    expect(result.content).toContain("<key>ISRC</key><string>GBAYE7200011</string>");
  });

  it("exports valid empty import-friendly files", () => {
    const empty = { ...playlist, tracks: [] };

    expect(exportPlaylist(empty, "migration_csv").content).toContain("Position,Title,Artist,Album");
    expect(exportPlaylist(empty, "m3u8").content).toBe("#EXTM3U");
    expect(exportPlaylist(empty, "apple_music_xml").content).toContain("<key>Tracks</key>");
  });
});
