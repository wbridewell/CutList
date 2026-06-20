import type { ChatMessage, RequestHistoryEntry } from "@/lib/playlist/collaboration";
import type { PlaylistState, Track } from "@/types/playlist";

function devTrack(input: {
  id: string;
  title: string;
  artist: string;
  album: string;
  runtime: string;
  durationMs: number;
  genreTags: string[];
  vibeTags: string[];
  energy: number;
  fitNotes: string;
  rationale: string;
}): Track {
  return {
    id: input.id,
    title: input.title,
    artist: input.artist,
    album: input.album,
    durationMs: input.durationMs,
    runtime: input.runtime,
    verified: true,
    source: "itunes",
    sourceId: input.id,
    sourceUrl: null,
    isrcs: [],
    artworkUrl: null,
    explicit: false,
    releaseDate: null,
    vibeTags: input.vibeTags,
    genreTags: input.genreTags,
    rationale: input.rationale,
    fitNotes: input.fitNotes,
    energy: input.energy,
    verificationNote: "Development fixture track.",
    verificationConfidence: "high"
  };
}

export const devPlaylistFixture: PlaylistState = {
  id: "dev-fixture-playlist",
  title: "Fixture: Redemption Arc",
  mood: "A UI-testing playlist that moves from pressure into bright, high-energy release.",
  arc: "Act I coils, Act II fractures, Act III searches, Act IV erupts, and Act V lands with earned relief.",
  tracks: [
    devTrack({
      id: "fixture:01",
      title: "Disorder",
      artist: "Joy Division",
      album: "Unknown Pleasures",
      runtime: "3:29",
      durationMs: 209000,
      genreTags: ["post-punk"],
      vibeTags: ["tension", "opening unease"],
      energy: 7,
      fitNotes: "Works as Act I because the tight, anxious pulse establishes pressure before the playlist starts opening up.",
      rationale: "A nervous opener that gives the sequence immediate forward motion without resolving too early."
    }),
    devTrack({
      id: "fixture:02",
      title: "This Must Be the Place",
      artist: "Talking Heads",
      album: "Speaking in Tongues",
      runtime: "4:56",
      durationMs: 296000,
      genreTags: ["new wave"],
      vibeTags: ["warmth", "human center"],
      energy: 6,
      fitNotes: "Keeps the emotional center visible while still feeling rhythmically strange enough to bridge into the rock block.",
      rationale: "Softens the edges while keeping an off-kilter pulse for transition testing."
    }),
    devTrack({
      id: "fixture:03",
      title: "The Chain",
      artist: "Fleetwood Mac",
      album: "Rumours",
      runtime: "4:28",
      durationMs: 268000,
      genreTags: ["rock"],
      vibeTags: ["rupture", "momentum"],
      energy: 8,
      fitNotes: "Anchors the darker middle section and gives the sequence a recognizable surge before the storm peaks.",
      rationale: "A clean rock anchor with a late surge, useful for checking grouped genre rows."
    }),
    devTrack({
      id: "fixture:04",
      title: "Gimme Shelter",
      artist: "The Rolling Stones",
      album: "Let It Bleed",
      runtime: "4:30",
      durationMs: 270000,
      genreTags: ["rock"],
      vibeTags: ["storm", "danger"],
      energy: 9,
      fitNotes: "Turns the rock cluster into a pressure point, making the later redemptive lift feel earned instead of decorative.",
      rationale: "Pushes the rock block darker before the sequence turns toward release."
    }),
    devTrack({
      id: "fixture:05",
      title: "Move On Up",
      artist: "Curtis Mayfield",
      album: "Curtis",
      runtime: "3:40",
      durationMs: 220000,
      genreTags: ["soul"],
      vibeTags: ["redemption", "lift"],
      energy: 10,
      fitNotes: "Delivers the high-energy fourth-act release the prompt asks for, shifting the story from survival into ascent.",
      rationale: "A fourth-act lift that makes high-energy placement visually and conceptually obvious."
    }),
    devTrack({
      id: "fixture:06",
      title: "Sweet Thing",
      artist: "Van Morrison",
      album: "Astral Weeks",
      runtime: "4:25",
      durationMs: 265000,
      genreTags: ["folk rock"],
      vibeTags: ["arrival", "release"],
      energy: 5,
      fitNotes: "Lets the playlist land softly after the peak, so the ending reads as relief rather than another escalation.",
      rationale: "A gentle landing point for expanded detail, long-title, and final-row spacing checks."
    })
  ],
  constraints: {
    maxTrackDurationMs: 300000,
    preferredGenres: ["rock", "soul"],
    notes: ["Keep tracks under 5 minutes for the fixture request."]
  },
  discoveryRadius: "moderate",
  conversationSummary: "Development fixture loaded from ?fixture=playlist.",
  updatedAt: "2026-06-02T00:00:00.000Z"
};

export const devFixtureMessages: ChatMessage[] = [
  {
    role: "assistant",
    content: "Development fixture loaded. Try dragging from the grip, expanding track details, removing a row, reviewing rejected candidates in Conversation History, or asking me to improve the sequence."
  }
];

export const devFixtureHistory: RequestHistoryEntry[] = [
  {
    id: "fixture-history-reorder",
    userMessage: "Group the rock tracks together and make the fourth act feel like redemption.",
    assistantMessage: "I grouped the rock pressure point together, then used the soul lift as the high-energy fourth-act turn before landing gently.",
    acceptedCount: 0,
    rejectedCandidates: [],
    createdAt: "2026-06-02T12:04:00.000Z",
    kind: "request",
    movedTrackCount: 4,
    movedTrackSummary: [
      "3 -> 2 · The Chain by Fleetwood Mac",
      "4 -> 3 · Gimme Shelter by The Rolling Stones",
      "5 -> 4 · Move On Up by Curtis Mayfield",
      "2 -> 5 · This Must Be the Place by Talking Heads"
    ],
    orderRationale: "The sequence now bunches the darker rock material before the fourth-act lift, then eases into a warmer landing.",
    playlistAction: "reorder"
  },
  {
    id: "fixture-history-rejections",
    userMessage: "Add a few redemption-arc tracks, but keep the fourth act high energy and avoid long tracks.",
    assistantMessage: "I accepted two tracks that fit the lift into release. I rejected the rest because verification or constraints did not hold.",
    acceptedCount: 2,
    rejectedCandidates: [
      {
        artist: "The Imaginary Choir",
        title: "Harbor of Mercy",
        reason: "No credible metadata match was found.",
        attemptedMatches: [
          {
            artist: "The Choir",
            title: "Mercy Will Prevail",
            album: "Circle Slide",
            durationMs: 241000,
            runtime: "4:01",
            source: "itunes",
            sourceId: "fixture-match-1",
            sourceUrl: null,
            artworkUrl: null,
            confidence: "medium",
            score: 0.68,
            primaryGenreName: "alternative"
          },
          {
            artist: "Mercy Choir",
            title: "Harbor",
            album: null,
            durationMs: 198000,
            runtime: "3:18",
            source: "musicbrainz",
            sourceId: undefined,
            sourceUrl: null,
            artworkUrl: null,
            confidence: "low",
            score: 0.42
          }
        ]
      },
      {
        artist: "The Rolling Stones",
        title: "You Can't Always Get What You Want",
        reason: "Track would exceed the requested maximum duration.",
        violatedConstraint: "maxTrackDurationMs",
        attemptedMatches: [
          {
            artist: "The Rolling Stones",
            title: "You Can't Always Get What You Want",
            album: "Let It Bleed",
            durationMs: 449000,
            runtime: "7:29",
            source: "itunes",
            sourceId: "fixture-match-2",
            sourceUrl: null,
            artworkUrl: null,
            confidence: "high",
            score: 0.98,
            primaryGenreName: "rock"
          }
        ]
      }
    ],
    createdAt: "2026-06-02T12:00:00.000Z",
    kind: "request"
  }
];
