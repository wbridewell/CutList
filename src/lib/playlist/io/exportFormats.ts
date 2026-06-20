export const playlistExportFormatIds = ["csv", "txt", "json", "migration_csv", "m3u", "m3u8", "apple_music_xml"] as const;

export type PlaylistExportFormat = typeof playlistExportFormatIds[number];
export type PlaylistExportFormatCategory = "primary" | "advanced";
