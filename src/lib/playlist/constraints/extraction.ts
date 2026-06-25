import type { PlaylistConstraints } from "@/types/playlist";
import { parseDeterministicRequest } from "@/lib/ai/services/deterministicRequestParser";

const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  couple: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10
};

const GENERIC_ADDITION_WORDS = new Set([
  "any",
  "assorted",
  "different",
  "diverse",
  "eclectic",
  "fresh",
  "good",
  "misc",
  "miscellaneous",
  "new",
  "random",
  "some",
  "varied",
  "various"
]);

function parseNumber(value: string): number | null {
  const normalized = value.toLowerCase();
  const parsed = NUMBER_WORDS[normalized] ?? Number.parseInt(normalized, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function toDurationMs(value: string, unit: string): number {
  const numeric = Number.parseFloat(value);
  if (unit.startsWith("second")) {
    return Math.round(numeric * 1000);
  }
  return Math.round(numeric * 60 * 1000);
}

function defaultTotalDurationToleranceMs(targetMs: number): number {
  return Math.max(60_000, Math.round(targetMs * 0.15));
}

function defaultBpmTolerance(targetBpm: number): number {
  return targetBpm < 80 ? 4 : 5;
}

function unique(values: string[] = []): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function isUsableGenreQuotaLabel(value: string): boolean {
  const normalized = value.toLowerCase().trim();
  return Boolean(normalized) &&
    !GENERIC_ADDITION_WORDS.has(normalized) &&
    !/\b(?:per artist|same artist|from each artist|by the same artist|exists?|exist|add|fill|round|bring|build|pump|extend|grow|total)\b/i.test(normalized) &&
    !/^than\b/i.test(normalized);
}

function hasPersistentVocalProfileLanguage(text: string): boolean {
  return /\b(?:only|all|exclusively|must be|should be)\b.{0,24}\b(?:female|women|woman|girl|male|men|man|boy|mixed|duet|instrumental|no vocals|without vocals|no singing)\b/i.test(text) ||
    /\b(?:female|women|woman|girl|male|men|man|boy|mixed|duet)\s+(?:vocals?|vocalists?|singers?|voices?)\b.{0,24}\b(?:only|exclusively)\b/i.test(text) ||
    /\b(?:instrumental|no vocals|without vocals|no singing)\s+only\b/i.test(text);
}

type ConstraintExtractionScope = "persistent" | "requestScoped";

type ConstraintExtractionContext = {
  draft: PlaylistConstraints;
  text: string;
  userMessage: string;
};

export type ConstraintExtractionPattern = {
  apply: (context: ConstraintExtractionContext) => void;
  id: string;
  ruleId: string;
  scope: ConstraintExtractionScope;
};

export const constraintExtractionPatterns: ConstraintExtractionPattern[] = [
  {
    id: "bpm-range-target-and-bounds",
    ruleId: "bpm",
    scope: "persistent",
    apply: ({ draft, text }) => {
      const bpmRange = text.match(/\b(?:between|from)?\s*(\d{2,3})\s*(?:-|to|through|and)\s*(\d{2,3})\s*bpm\b/i)
        ?? text.match(/\bbpm\s*(?:between|from)?\s*(\d{2,3})\s*(?:-|to|through|and)\s*(\d{2,3})\b/i);
      if (bpmRange) {
        const first = Number.parseInt(bpmRange[1], 10);
        const second = Number.parseInt(bpmRange[2], 10);
        draft.minBpm = Math.min(first, second);
        draft.maxBpm = Math.max(first, second);
      } else {
        const targetBpm = text.match(/\b(?:around|about|roughly|approximately|approx(?:\.)?)\s*(\d{2,3})\s*bpm\b/i)
          ?? text.match(/\b(?:target|aim for)\s*(?:around|about|roughly|approximately|approx(?:\.)?)?\s*(\d{2,3})\s*bpm\b/i);
        if (targetBpm) {
          draft.targetBpm = Number.parseInt(targetBpm[1], 10);
          draft.targetBpmTolerance = defaultBpmTolerance(draft.targetBpm);
        }
      }

      const minBpm = text.match(/\b(?:at least|minimum|min(?:imum)?|over|above|more than)\s*(\d{2,3})\s*bpm\b/i);
      if (minBpm) {
        draft.minBpm = Number.parseInt(minBpm[1], 10);
      }

      const maxBpm = text.match(/\b(?:under|below|less than|no(?:thing)? over|no(?:thing)? above|maximum|max(?:imum)?)\s*(\d{2,3})\s*bpm\b/i);
      if (maxBpm) {
        draft.maxBpm = Number.parseInt(maxBpm[1], 10);
      }
    }
  },
  {
    id: "persistent-vocal-profile",
    ruleId: "vocalProfile",
    scope: "persistent",
    apply: ({ draft, text }) => {
      if (!hasPersistentVocalProfileLanguage(text)) {
        return;
      }
      if (/\b(?:female|women|woman|girl)\b/i.test(text)) {
        draft.vocalProfile = "female_vocals";
      } else if (/\b(?:male|men|man|boy)\b/i.test(text)) {
        draft.vocalProfile = "male_vocals";
      } else if (/\b(?:mixed|duet|male and female|female and male)\b/i.test(text)) {
        draft.vocalProfile = "mixed_vocals";
      } else if (/\b(?:instrumental|no vocals|without vocals|no singing)\b/i.test(text)) {
        draft.vocalProfile = "instrumental";
      }
    }
  },
  {
    id: "energy-trajectory",
    ruleId: "energyTrajectory",
    scope: "persistent",
    apply: ({ draft, text }) => {
      if (/\b(?:gradually|steadily)\s+(?:increase|increases|rise|rises|build|builds|climb|climbs)\s+(?:energy|intensity|momentum)\b/i.test(text) || /\b(?:energy|intensity|momentum)\s+(?:should|must|needs to)?\s*(?:gradually|steadily)?\s*(?:increase|increases|rise|rises|build|builds|climb|climbs)\b/i.test(text)) {
        draft.energyTrajectory = { ...(draft.energyTrajectory ?? {}), direction: "gradual_rise" };
      } else if (/\b(?:gradually|steadily)\s+(?:decrease|fall|cool|wind down)\s+(?:energy|intensity|momentum)\b/i.test(text)) {
        draft.energyTrajectory = { ...(draft.energyTrajectory ?? {}), direction: "gradual_fall" };
      }

      const peakTrack = text.match(/\bpeak(?:s|ing)?\s+(?:before|by|around|at)\s+track\s+(\d{1,3})\b/i)
        ?? text.match(/\b(?:climax|highest energy)\s+(?:before|by|around|at)\s+track\s+(\d{1,3})\b/i);
      if (peakTrack) {
        draft.energyTrajectory = {
          ...(draft.energyTrajectory ?? {}),
          peakTrackNumber: Number.parseInt(peakTrack[1], 10)
        };
      }

      if (/\b(?:hopeful|optimistic)\s+ending\b/i.test(text) || /\bend(?:s|ing)?\s+(?:hopeful|optimistic)\b/i.test(text)) {
        draft.energyTrajectory = { ...(draft.energyTrajectory ?? {}), ending: "hopeful" };
      } else if (/\b(?:cathartic|release)\s+ending\b/i.test(text) || /\bend(?:s|ing)?\s+(?:cathartic|with release)\b/i.test(text)) {
        draft.energyTrajectory = { ...(draft.energyTrajectory ?? {}), ending: "cathartic" };
      } else if (/\b(?:cooldown|cool down|soft landing)\s+ending\b/i.test(text)) {
        draft.energyTrajectory = { ...(draft.energyTrajectory ?? {}), ending: "cooldown" };
      }
    }
  },
  {
    id: "covers-only-guidance",
    ruleId: "notes",
    scope: "persistent",
    apply: ({ draft, userMessage }) => {
      if (
        /\bcovers?\s+only\b/i.test(userMessage) ||
        /\bonly\s+covers?\s+(?:are\s+)?allowed\b/i.test(userMessage) ||
        /\b(?:all|strictly|exclusively|nothing but)\s+covers?\b/i.test(userMessage) ||
        /\bonly\s+cover\s+(?:songs?|tracks?)\b/i.test(userMessage)
      ) {
        draft.notes?.push("Only covers are allowed.");
      }
    }
  },
  {
    id: "track-duration-bounds",
    ruleId: "trackDuration",
    scope: "persistent",
    apply: ({ draft, text }) => {
      const shorterThanMeansMinimum = /\b(?:no|nothing)\b.{0,30}\bshorter than\b/i.test(text);
      const maxDuration = text.match(/(?:(?:no|nothing|remove|delete|drop|cut|prune|clear).{0,40}(?:over|longer than|above|exceed(?:ing)?|more than)|(?:under|below|less than))\s*(\d+(?:\.\d+)?)\s*(minutes?|mins?|seconds?|secs?)/i)
        ?? (shorterThanMeansMinimum ? null : text.match(/\bshorter than\s*(\d+(?:\.\d+)?)\s*(minutes?|mins?|seconds?|secs?)/i));
      if (maxDuration) {
        draft.maxTrackDurationMs = toDurationMs(maxDuration[1], maxDuration[2]);
      }

      const negatedUpperBound = /\b(?:no|nothing|remove|delete|drop|cut|prune|clear)\b.{0,40}\b(?:over|longer than|above|more than|exceed(?:ing)?)\b/i.test(text);
      const minDuration = text.match(/(?:(?:at least|minimum|min(?:imum)?|no shorter than)|(?:no|nothing).{0,30}shorter than).{0,12}(\d+(?:\.\d+)?)\s*(minutes?|mins?|seconds?|secs?)/i)
        ?? (negatedUpperBound ? null : text.match(/\b(?:over|longer than|above|more than|exceed(?:ing)?)\s*(\d+(?:\.\d+)?)\s*(minutes?|mins?|seconds?|secs?)/i));
      if (minDuration) {
        draft.minTrackDurationMs = toDurationMs(minDuration[1], minDuration[2]);
      }
    }
  },
  {
    id: "playlist-total-duration",
    ruleId: "targetTotalDurationMs",
    scope: "persistent",
    apply: ({ draft, text }) => {
      const totalDuration = text.match(/\b(?:about|around|roughly|approximately|approx(?:\.)?)?\s*(\d+(?:\.\d+)?)\s*(minutes?|mins?|seconds?|secs?)\s+(?:playlist|mix|set)\b/i)
        ?? text.match(/\b(?:playlist|mix|set)\s+(?:of|around|about|roughly|approximately|approx(?:\.)?)\s*(\d+(?:\.\d+)?)\s*(minutes?|mins?|seconds?|secs?)\b/i);
      if (totalDuration) {
        draft.targetTotalDurationMs = toDurationMs(totalDuration[1], totalDuration[2]);
        draft.totalDurationToleranceMs = defaultTotalDurationToleranceMs(draft.targetTotalDurationMs);
      }
    }
  },
  {
    id: "artist-rules",
    ruleId: "artistLimits",
    scope: "persistent",
    apply: ({ draft, userMessage }) => {
      for (const match of userMessage.matchAll(/no more (?:songs?|tracks?) (?:by|from)\s+([A-Z0-9][\w '&.-]{1,60})/gi)) {
        draft.noMoreFromArtists?.push(match[1].trim());
      }

      for (const match of userMessage.matchAll(/(?:exclude|block)\s+([A-Z0-9][\w '&.-]{1,60})/gi)) {
        const artist = match[1].replace(/\s+(?:songs?|tracks?)$/i, "").trim();
        if (artist.split(/\s+/).length <= 5) {
          draft.excludedArtists?.push(artist);
        }
      }

      for (const match of userMessage.matchAll(/only\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:total\s+)?(?:songs?|tracks?)\s+by\s+([A-Z0-9][\w '&.-]{1,60})/gi)) {
        const count = parseNumber(match[1]);
        if (count != null) {
          draft.artistLimits?.push({ artist: match[2].trim(), maxTotalTracks: count });
        }
      }
    }
  },
  {
    id: "per-artist-limit",
    ruleId: "maxTracksPerArtist",
    scope: "persistent",
    apply: ({ draft, userMessage }) => {
      const perArtistLimit = userMessage.matchAll(/(?:only|at most|no more than|max(?:imum)?)\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:total\s+)?(?:songs?|tracks?)?\s*per artist/gi);
      for (const match of perArtistLimit) {
        const count = parseNumber(match[1]);
        if (count != null) {
          draft.maxTracksPerArtist = count;
        }
      }

      const sameArtistLimit = userMessage.matchAll(/(?:only|at most|no more than|max(?:imum)?)\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:total\s+)?(?:songs?|tracks?)?\s+by\s+the\s+same\s+artist\b/gi);
      for (const match of sameArtistLimit) {
        const count = parseNumber(match[1]);
        if (count != null) {
          draft.maxTracksPerArtist = count;
        }
      }

      const limitThisToPerArtist = userMessage.matchAll(/(?:limit|cap)\s+(?:this|it|the playlist)?\s*(?:to\s+)?(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:total\s+)?(?:songs?|tracks?)?\s*(?:per artist|from each artist)/gi);
      for (const match of limitThisToPerArtist) {
        const count = parseNumber(match[1]);
        if (count != null) {
          draft.maxTracksPerArtist = count;
        }
      }

      if (/\b(?:one|1)\s+(?:song|track)\s+per artist\b/i.test(userMessage) || /\bno\s+(?:artist\s+)?repeats\b/i.test(userMessage) || /\bno repeated artists\b/i.test(userMessage)) {
        draft.maxTracksPerArtist = 1;
      }
    }
  },
  {
    id: "genre-addition-guidance",
    ruleId: "requiredGenreAdditions",
    scope: "requestScoped",
    apply: ({ draft, userMessage }) => {
      for (const match of userMessage.matchAll(/add\s+(?:a\s+)?(\d+|one|two|couple|three|four|five)?\s*(?:more\s+)?([\w -]{2,40})\s+(?:songs?|tracks?)/gi)) {
        const count = parseNumber(match[1] || "one") ?? 1;
        const genre = match[2].replace(/\bmore\b/gi, "").trim();
        if (genre && !GENERIC_ADDITION_WORDS.has(genre.toLowerCase())) {
          draft.requiredGenreAdditions?.push({ genre, count });
        }
      }

      for (const match of userMessage.matchAll(/(?:songs?|tracks?)\s+(?:should|must|need to|have to)\s+be\s+([a-z0-9 /&'.-]{2,40}?)(?=\s+(?:and|but|under|over|with|for)\b|[,.!?]|$)/gi)) {
        const genre = match[1].trim();
        if (genre && !GENERIC_ADDITION_WORDS.has(genre.toLowerCase())) {
          draft.requiredGenreAdditions?.push({ genre, count: 1 });
        }
      }
    }
  },
  {
    id: "genre-blocks-and-quotas",
    ruleId: "genreLimits",
    scope: "persistent",
    apply: ({ draft, userMessage }) => {
      for (const match of userMessage.matchAll(/no more\s+([\w -]{2,40})(?:\s+songs?|\s+tracks?)?/gi)) {
        const genre = match[1].trim();
        if (genre && !/songs? by|tracks? by/i.test(match[0]) && isUsableGenreQuotaLabel(genre)) {
          draft.noMoreFromGenres?.push(genre);
        }
      }

      for (const match of userMessage.matchAll(/only\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:total\s+)?([\w -]{2,40})\s+(?:songs?|tracks?)/gi)) {
        const count = parseNumber(match[1]);
        const genre = match[2].trim();
        if (count != null && isUsableGenreQuotaLabel(genre)) {
          draft.genreLimits?.push({ genre, maxTotalTracks: count });
        }
      }

      for (const match of userMessage.matchAll(/(?:there\s+should\s+)?only\s+be\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+([\w -]{2,40})\s+(?:songs?|tracks?)/gi)) {
        const count = parseNumber(match[1]);
        const genre = match[2].trim();
        if (count != null && isUsableGenreQuotaLabel(genre)) {
          draft.genreLimits?.push({ genre, maxTotalTracks: count });
        }
      }
    }
  }
];

export function mergeExtractedConstraints(current: PlaylistConstraints, userMessage: string): PlaylistConstraints {
  return parseDeterministicRequest(userMessage, current).deterministicConstraints;
}
