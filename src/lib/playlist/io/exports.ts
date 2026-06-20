import type { ExportResponse, PlaylistState } from "@/types/playlist";
import type { PlaylistExportFormat, PlaylistExportFormatCategory } from "@/lib/playlist/io/exportFormats";

export type PlaylistExportFormatDefinition = {
  category: PlaylistExportFormatCategory;
  extension: string;
  id: PlaylistExportFormat;
  label: string;
  mimeType: string;
  render: (playlist: PlaylistState, baseFilename: string) => ExportResponse;
};

function escapeCsv(value: unknown): string {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, "\"\"")}"` : text;
}

function escapeXml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function safeFilename(value: string | null): string {
  return (value ?? "the-cutlist-playlist").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "the-cutlist-playlist";
}

function searchQuery(track: PlaylistState["tracks"][number]): string {
  return [track.artist, track.title, track.album].filter(Boolean).join(" ");
}

function durationSeconds(durationMs: number | null | undefined): number {
  return typeof durationMs === "number" ? Math.round(durationMs / 1000) : -1;
}

function m3uReference(track: PlaylistState["tracks"][number]): string {
  return track.sourceUrl ?? `${track.artist} - ${track.title}`;
}

function stablePositiveInt(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash * 31) + value.charCodeAt(index)) >>> 0;
  }
  return hash || 1;
}

function stablePersistentId(value: string): string {
  return stablePositiveInt(value).toString(16).toUpperCase().padStart(8, "0");
}

function plistString(key: string, value: unknown): string {
  return `\t\t<key>${escapeXml(key)}</key><string>${escapeXml(value)}</string>`;
}

function plistInteger(key: string, value: number): string {
  return `\t\t<key>${escapeXml(key)}</key><integer>${value}</integer>`;
}

function plistTrack(track: PlaylistState["tracks"][number], index: number): string {
  const trackId = index + 1;
  const lines = [
    `\t<key>${trackId}</key>`,
    "\t<dict>",
    plistInteger("Track ID", trackId),
    plistString("Name", track.title),
    plistString("Artist", track.artist),
    track.album ? plistString("Album", track.album) : null,
    typeof track.durationMs === "number" ? plistInteger("Total Time", track.durationMs) : null,
    track.genreTags[0] ? plistString("Genre", track.genreTags[0]) : null,
    track.sourceUrl ? plistString("Location", track.sourceUrl) : null,
    plistString("Persistent ID", stablePersistentId(track.id)),
    track.isrcs?.[0] ? plistString("ISRC", track.isrcs[0]) : null,
    "\t</dict>"
  ].filter((line): line is string => line !== null);
  return lines.join("\n");
}

export function exportPlaylist(playlist: PlaylistState, format: PlaylistExportFormat): ExportResponse {
  const base = safeFilename(playlist.title);
  const definition = getPlaylistExportFormat(format);
  return definition.render(playlist, base);
}

function renderJson(playlist: PlaylistState, base: string): ExportResponse {
    return {
      filename: `${base}.json`,
      mimeType: "application/json",
      content: JSON.stringify(playlist, null, 2)
    };
}

function renderText(playlist: PlaylistState, base: string): ExportResponse {
    const header = [
      playlist.title ?? "The CutList Playlist",
      playlist.mood ? `Mood: ${playlist.mood}` : null,
      playlist.arc ? `Arc: ${playlist.arc}` : null
    ].filter(Boolean).join("\n");
    const tracks = playlist.tracks.map((track, index) => {
      const album = track.album ? `, ${track.album}` : "";
      const runtime = track.runtime ? `, ${track.runtime}` : "";
      return `${index + 1}. ${track.artist} - ${track.title}${album || runtime ? ` (${`${track.album ?? ""}${runtime}`.replace(/^, /, "")})` : ""}`;
    }).join("\n");

    return {
      filename: `${base}.txt`,
      mimeType: "text/plain",
      content: `${header}\n\n${tracks}`.trim()
    };
}

function renderMigrationCsv(playlist: PlaylistState, base: string): ExportResponse {
    const columns = ["Position", "Title", "Artist", "Album", "DurationMs", "Runtime", "BPM", "BPMConfidence", "VocalProfile", "VocalProfileConfidence", "EvidenceNotes", "ISRC", "Source", "SourceId", "SourceUrl", "SearchQuery"];
    const rows = playlist.tracks.map((track, index) => [
      index + 1,
      track.title,
      track.artist,
      track.album,
      track.durationMs,
      track.runtime,
      track.bpm,
      track.bpmConfidence,
      track.vocalProfile,
      track.vocalProfileConfidence,
      track.evidenceNotes?.join("; ") ?? "",
      track.isrcs?.[0] ?? "",
      track.source,
      track.sourceId,
      track.sourceUrl,
      searchQuery(track)
    ]);

    return {
      filename: `${base}-migration.csv`,
      mimeType: "text/csv",
      content: [columns, ...rows].map((row) => row.map(escapeCsv).join(",")).join("\n")
    };
}

function renderM3u(playlist: PlaylistState, base: string, format: Extract<PlaylistExportFormat, "m3u" | "m3u8">): ExportResponse {
    const lines = [
      "#EXTM3U",
      ...playlist.tracks.flatMap((track) => [
        `#EXTINF:${durationSeconds(track.durationMs)},${track.artist} - ${track.title}`,
        m3uReference(track)
      ])
    ];

    return {
      filename: `${base}.${format}`,
      mimeType: format === "m3u8" ? "application/vnd.apple.mpegurl" : "audio/x-mpegurl",
      content: lines.join("\n")
    };
}

function renderAppleMusicXml(playlist: PlaylistState, base: string): ExportResponse {
    const tracks = playlist.tracks.map(plistTrack).join("\n");
    const playlistItems = playlist.tracks.map((_, index) => [
      "\t\t\t<dict>",
      plistInteger("Track ID", index + 1),
      "\t\t\t</dict>"
    ].join("\n")).join("\n");
    const content = [
      "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
      "<!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">",
      "<plist version=\"1.0\">",
      "<dict>",
      "\t<key>Major Version</key><integer>1</integer>",
      "\t<key>Minor Version</key><integer>1</integer>",
      "\t<key>Application Version</key><string>The CutList</string>",
      "\t<key>Tracks</key>",
      "\t<dict>",
      tracks,
      "\t</dict>",
      "\t<key>Playlists</key>",
      "\t<array>",
      "\t\t<dict>",
      plistString("Name", playlist.title ?? "The CutList Playlist"),
      "\t\t<key>Playlist Items</key>",
      "\t\t<array>",
      playlistItems,
      "\t\t</array>",
      "\t\t</dict>",
      "\t</array>",
      "</dict>",
      "</plist>"
    ].join("\n");

    return {
      filename: `${base}-apple-music.xml`,
      mimeType: "application/xml",
      content
    };
}

function renderCsv(playlist: PlaylistState, base: string): ExportResponse {
  const columns = ["Position", "Title", "Artist", "Album", "Runtime", "DurationMs", "BPM", "BPMConfidence", "VocalProfile", "VocalProfileConfidence", "EvidenceNotes", "Verified", "Source", "SourceId", "SourceUrl", "VibeTags", "FitNotes", "Rationale"];
  const rows = playlist.tracks.map((track, index) => [
    index + 1,
    track.title,
    track.artist,
    track.album,
    track.runtime,
    track.durationMs,
    track.bpm,
    track.bpmConfidence,
    track.vocalProfile,
    track.vocalProfileConfidence,
    track.evidenceNotes?.join("; ") ?? "",
    track.verified,
    track.source,
    track.sourceId,
    track.sourceUrl,
    track.vibeTags.join("; "),
    track.fitNotes,
    track.rationale
  ]);

  return {
    filename: `${base}.csv`,
    mimeType: "text/csv",
    content: [columns, ...rows].map((row) => row.map(escapeCsv).join(",")).join("\n")
  };
}

export const exportFormatRegistry: PlaylistExportFormatDefinition[] = [
  {
    id: "migration_csv",
    label: "Migration CSV",
    extension: "csv",
    mimeType: "text/csv",
    category: "primary",
    render: renderMigrationCsv
  },
  {
    id: "m3u8",
    label: "M3U8",
    extension: "m3u8",
    mimeType: "application/vnd.apple.mpegurl",
    category: "primary",
    render: (playlist, base) => renderM3u(playlist, base, "m3u8")
  },
  {
    id: "csv",
    label: "CSV backup",
    extension: "csv",
    mimeType: "text/csv",
    category: "advanced",
    render: renderCsv
  },
  {
    id: "txt",
    label: "Text",
    extension: "txt",
    mimeType: "text/plain",
    category: "advanced",
    render: renderText
  },
  {
    id: "json",
    label: "JSON",
    extension: "json",
    mimeType: "application/json",
    category: "advanced",
    render: renderJson
  },
  {
    id: "apple_music_xml",
    label: "Apple Music XML",
    extension: "xml",
    mimeType: "application/xml",
    category: "advanced",
    render: renderAppleMusicXml
  },
  {
    id: "m3u",
    label: "M3U",
    extension: "m3u",
    mimeType: "audio/x-mpegurl",
    category: "advanced",
    render: (playlist, base) => renderM3u(playlist, base, "m3u")
  }
];

export function getPlaylistExportFormat(format: PlaylistExportFormat): PlaylistExportFormatDefinition {
  const definition = exportFormatRegistry.find((item) => item.id === format);
  if (!definition) {
    throw new Error(`Unknown playlist export format: ${format}`);
  }
  return definition;
}
