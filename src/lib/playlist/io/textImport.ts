import type { PlaylistConstraints } from "@/types/playlist";
import { parseExplicitRequestedTracks as parseExplicitRequestedTracksFromDeterministicParser } from "@/lib/ai/services/deterministicRequestParser";

export type ParsedTrackLine = {
  title: string;
  artist: string;
  album?: string | null;
};

type ParseTrackRowsOptions = {
  allowHeaderlessCommaRows?: boolean;
};

const TITLE_HEADERS = new Set(["name", "title", "track", "song"]);
const ARTIST_HEADERS = new Set(["artist", "artists", "artist name"]);
const ALBUM_HEADERS = new Set(["album", "release"]);

function cleanCell(value: string): string {
  return value.trim().replace(/^"|"$/g, "").trim();
}

function splitDelimitedLine(line: string): string[] {
  if (line.includes("\t")) {
    return line.split("\t").map(cleanCell);
  }

  if (line.includes(",")) {
    return line.split(",").map(cleanCell);
  }

  return [];
}

function headerIndex(headers: string[], accepted: Set<string>): number {
  return headers.findIndex((header) => accepted.has(header.toLowerCase().trim()));
}

function wordCount(value: string): number {
  return value.split(/\s+/).filter(Boolean).length;
}

function looksLikeTransitionProse(line: string): boolean {
  return /\b(?:into|between|transition|bridge)\b/i.test(line);
}

function looksLikeHeaderlessCommaTrack(columns: string[]): boolean {
  if (columns.length < 2 || columns.length > 3) {
    return false;
  }

  const [title, artist] = columns;
  return Boolean(title && artist && wordCount(title) <= 12 && wordCount(artist) <= 8);
}

export function parseTrackRowsFromText(text: string, options: ParseTrackRowsOptions = {}): ParsedTrackLine[] {
  const allowHeaderlessCommaRows = options.allowHeaderlessCommaRows ?? true;
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) {
    return [];
  }

  const firstColumns = splitDelimitedLine(lines[0]);
  if (firstColumns.length >= 2) {
    const titleIndex = headerIndex(firstColumns, TITLE_HEADERS);
    const artistIndex = headerIndex(firstColumns, ARTIST_HEADERS);
    const albumIndex = headerIndex(firstColumns, ALBUM_HEADERS);

    if (titleIndex >= 0 && artistIndex >= 0) {
      const parsed: Array<ParsedTrackLine | null> = lines.slice(1).map((line) => {
        const columns = splitDelimitedLine(line);
        const title = cleanCell(columns[titleIndex] ?? "");
        const artist = cleanCell(columns[artistIndex] ?? "");
        const album = albumIndex >= 0 ? cleanCell(columns[albumIndex] ?? "") : "";
        return title && artist ? { title, artist, album: album || null } : null;
      });
      return parsed.filter((track): track is ParsedTrackLine => track !== null);
    }
  }

  const parsed: Array<ParsedTrackLine | null> = lines.map((line) => {
    const columns = splitDelimitedLine(line);
    if (columns.length >= 2 && columns.length <= 3) {
      if (line.includes(",") && !line.includes("\t") && (!allowHeaderlessCommaRows || !looksLikeHeaderlessCommaTrack(columns))) {
        return null;
      }
      const [first, second, third] = columns;
      return first && second ? { title: first, artist: second, album: third || null } : null;
    }

    const dashParts = line.split(/\s+-\s+/);
    if (dashParts.length >= 2 && !looksLikeTransitionProse(line)) {
      const [artist, title] = dashParts;
      return artist && title ? { artist: artist.trim(), title: title.trim(), album: null } : null;
    }

    return null;
  });
  return parsed.filter((track): track is ParsedTrackLine => track !== null);
}

export function parseExplicitRequestedTracks(text: string): ParsedTrackLine[] {
  return parseExplicitRequestedTracksFromDeterministicParser(text);
}

export function emptyConstraints(): PlaylistConstraints {
  return {};
}
