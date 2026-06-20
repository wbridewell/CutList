"use client";

import { exportFormatRegistry } from "@/lib/playlist/io/exports";
import type { PlaylistExportFormat } from "@/lib/playlist/io/exportFormats";
import type { PlaylistState } from "@/types/playlist";

export function ExportMenu({
  playlist,
  selectedFormat,
  onExport,
  onSelectedFormatChange
}: {
  playlist: PlaylistState;
  selectedFormat: PlaylistExportFormat;
  onExport: () => void;
  onSelectedFormatChange: (format: PlaylistExportFormat) => void;
}) {
  return (
    <div className="playlist-export-menu">
      <label className="playlist-export-format">
        <span>Format</span>
        <select
          value={selectedFormat}
          disabled={playlist.tracks.length === 0}
          onChange={(event) => onSelectedFormatChange(event.target.value as PlaylistExportFormat)}
        >
          {exportFormatRegistry.map((format) => (
            <option key={format.id} value={format.id}>
              {format.label}
            </option>
          ))}
        </select>
      </label>
      <button
        className="button-primary button-compact"
        type="button"
        disabled={playlist.tracks.length === 0}
        onClick={onExport}
      >
        Export...
      </button>
    </div>
  );
}
