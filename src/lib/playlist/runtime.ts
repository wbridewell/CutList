export function formatRuntime(durationMs: number | null | undefined): string | null {
  if (durationMs == null || !Number.isFinite(durationMs) || durationMs < 0) {
    return null;
  }

  const totalSeconds = Math.round(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function sumDurations(tracks: Array<{ durationMs: number | null }>): number {
  return tracks.reduce((total, track) => total + (track.durationMs ?? 0), 0);
}
