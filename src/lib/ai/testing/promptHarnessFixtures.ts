import type { PlaylistState, ReviewSuggestionApplicationMode, PlaylistTrackRole, Track, TransitionIssueType } from "@/types/playlist";

export type ConstraintExpectation = {
  field: string;
  scope: "persistent" | "requestScoped";
  value?: unknown;
  includes?: string;
  objectIncludes?: Record<string, unknown>;
};

export type PromptHarnessFixture = {
  id: string;
  userMessage: string;
  playlist: PlaylistState;
  expectedAction: "add" | "remove" | "replace" | "analyze" | "import" | "reorder" | "other";
  expectedRequestedTrackCount?: number | null;
  expectedConstraints?: ConstraintExpectation[];
  candidateCount?: {
    min: number;
    max: number;
  };
  candidateTextShouldInclude?: string[];
  candidateTextShouldAvoid?: string[];
};

export type ReviewHarnessFixture = {
  expectedApplicationModes?: ReviewSuggestionApplicationMode[];
  expectedRoleByTrackId?: Record<string, PlaylistTrackRole>;
  expectedSuggestionTypes?: string[];
  expectedTransitionIssueTypes?: TransitionIssueType[];
  id: string;
  playlist: PlaylistState;
  userQuestion?: string;
};

const now = "2026-05-31T00:00:00.000Z";

function track(
  id: string,
  title: string,
  artist: string,
  genreTags: string[] = [],
  overrides: Partial<Track> = {}
): Track {
  return {
    id,
    title,
    artist,
    album: overrides.album ?? null,
    durationMs: overrides.durationMs ?? 210000,
    runtime: overrides.runtime ?? "3:30",
    verified: true,
    source: overrides.source ?? "manual",
    sourceId: overrides.sourceId ?? null,
    sourceUrl: overrides.sourceUrl ?? null,
    artworkUrl: overrides.artworkUrl ?? null,
    vibeTags: [],
    genreTags,
    rationale: null,
    energy: overrides.energy ?? null,
    verificationNote: null
  };
}

function playlist(id: string, tracks: Track[] = [], overrides: Partial<PlaylistState> = {}): PlaylistState {
  return {
    id,
    title: overrides.title ?? null,
    mood: overrides.mood ?? null,
    arc: overrides.arc ?? null,
    tracks,
    constraints: overrides.constraints ?? {},
    discoveryRadius: overrides.discoveryRadius ?? "moderate",
    conversationSummary: null,
    updatedAt: now
  };
}

export const promptHarnessFixtures: PromptHarnessFixture[] = [
  {
    id: "simple-additions",
    userMessage: "Add three upbeat new wave songs for a bright commute.",
    playlist: playlist("fixture-simple", [
      track("seed-1", "Just What I Needed", "The Cars", ["Rock"])
    ]),
    expectedAction: "add",
    expectedRequestedTrackCount: 3,
    candidateCount: { min: 3, max: 12 },
    candidateTextShouldInclude: ["new wave"],
    candidateTextShouldAvoid: ["the cars::just what i needed"]
  },
  {
    id: "duration-and-count",
    userMessage: "Give me 5 hard rock tracks under 3 minutes. No Motley Crue.",
    playlist: playlist("fixture-duration"),
    expectedAction: "add",
    expectedRequestedTrackCount: 5,
    expectedConstraints: [
      { scope: "persistent", field: "maxTrackDurationMs", value: 180000 },
      { scope: "persistent", field: "excludedArtists", includes: "motley crue" },
      { scope: "requestScoped", field: "requiredGenreAdditions", objectIncludes: { genre: "hard rock" } }
    ],
    candidateCount: { min: 5, max: 12 },
    candidateTextShouldInclude: ["rock"],
    candidateTextShouldAvoid: ["motley crue"]
  },
  {
    id: "blocked-genre",
    userMessage: "Add four danceable songs, but keep country and bro-country out of it.",
    playlist: playlist("fixture-blocked-genre"),
    expectedAction: "add",
    expectedRequestedTrackCount: 4,
    expectedConstraints: [
      { scope: "persistent", field: "excludedGenres", includes: "country" }
    ],
    candidateCount: { min: 4, max: 12 },
    candidateTextShouldAvoid: ["country", "bro-country"]
  },
  {
    id: "weird-vibe-real-catalog",
    userMessage: "I want four dark Kansas metal songs: dusty, stormy, and real, not made-up bands.",
    playlist: playlist("fixture-weird-vibe"),
    expectedAction: "add",
    expectedRequestedTrackCount: 4,
    candidateCount: { min: 4, max: 12 },
    candidateTextShouldAvoid: [
      "dark kansas metal",
      "made-up",
      "fictional",
      "kansas stone",
      "midwest mourners",
      "wichita wind",
      "kansas city killers"
    ]
  },
  {
    id: "addition-not-reorder",
    userMessage: "Add three songs that will make the ending flow better after these tracks.",
    playlist: playlist("fixture-not-reorder", [
      track("seed-2", "Age of Consent", "New Order", ["Alternative"]),
      track("seed-3", "Disorder", "Joy Division", ["Post-punk"])
    ]),
    expectedAction: "add",
    expectedRequestedTrackCount: 3,
    candidateCount: { min: 3, max: 12 },
    candidateTextShouldAvoid: ["new order::age of consent", "joy division::disorder"]
  },
  {
    id: "replace-weakest-three",
    userMessage: "Replace the weakest 3 tracks with warmer soul cuts, but keep no explicit tracks as a lasting rule.",
    playlist: playlist("fixture-replace", [
      track("seed-4", "Bright Start", "A", ["soul"]),
      track("seed-5", "Grey Dip", "B", ["indie"]),
      track("seed-6", "Cold Drift", "C", ["indie"])
    ]),
    expectedAction: "replace",
    expectedRequestedTrackCount: null,
    expectedConstraints: [
      { scope: "persistent", field: "allowExplicit", value: false }
    ],
    candidateCount: { min: 3, max: 12 },
    candidateTextShouldInclude: ["soul"]
  },
  {
    id: "mixed-shaping-additions",
    userMessage: "Add three warm songs that make the ending flow better, but keep no explicit tracks as a lasting rule.",
    playlist: playlist("fixture-mixed-shaping", [
      track("seed-7", "Age of Consent", "New Order", ["Alternative"]),
      track("seed-8", "Disorder", "Joy Division", ["Post-punk"])
    ], {
      mood: "Smoky rise"
    }),
    expectedAction: "add",
    expectedRequestedTrackCount: 3,
    expectedConstraints: [
      { scope: "persistent", field: "allowExplicit", value: false }
    ],
    candidateCount: { min: 3, max: 12 },
    candidateTextShouldAvoid: ["new order::age of consent", "joy division::disorder"]
  },
  {
    id: "artist-quota",
    userMessage: "Add six glam metal songs, but no more than one total song from Def Leppard.",
    playlist: playlist("fixture-artist-quota", [
      track("seed-4", "Photograph", "Def Leppard", ["Rock"])
    ]),
    expectedAction: "add",
    expectedRequestedTrackCount: 6,
    expectedConstraints: [
      { scope: "persistent", field: "artistLimits", objectIncludes: { artist: "def leppard", maxTotalTracks: 1 } }
    ],
    candidateCount: { min: 6, max: 12 },
    candidateTextShouldInclude: ["glam"],
    candidateTextShouldAvoid: ["def leppard"]
  }
];

export const reviewHarnessFixtures: ReviewHarnessFixture[] = [
  {
    id: "review-abrupt-bridge",
    playlist: playlist("review-abrupt-bridge", [
      track("soft-opener", "Soft Opener", "A", ["dream pop"], { energy: 2 }),
      track("hard-climax", "Hard Climax", "B", ["industrial"], { energy: 9 }),
      track("afterglow", "Afterglow", "C", ["dream pop"], { energy: 4 })
    ], {
      mood: "Starts intimate, then detonates."
    }),
    expectedRoleByTrackId: { "soft-opener": "opener" },
    expectedTransitionIssueTypes: ["abrupt_energy_jump"],
    expectedApplicationModes: ["verify_candidate"],
    expectedSuggestionTypes: ["add_bridge"]
  },
  {
    id: "review-flat-ending",
    playlist: playlist("review-flat-ending", [
      track("start", "Start", "A", ["alt"], { energy: 3 }),
      track("middle", "Middle", "B", ["alt"], { energy: 5 }),
      track("blast-ending", "Blast Ending", "C", ["alt"], { energy: 9 })
    ], {
      arc: "Needs to resolve after the climb."
    }),
    expectedTransitionIssueTypes: ["flat_ending"],
    expectedApplicationModes: ["informational"]
  },
  {
    id: "review-repetitive-texture",
    playlist: playlist("review-repetitive-texture", [
      track("first", "First", "Same Artist", ["post-punk"], { energy: 4 }),
      track("second", "Second", "Same Artist", ["post-punk"], { energy: 5 }),
      track("third", "Third", "Other Artist", ["post-punk"], { energy: 6 })
    ]),
    expectedTransitionIssueTypes: ["repetitive_texture"],
    expectedRoleByTrackId: { second: "palette_cleanser" }
  },
  {
    id: "review-constraint-removal",
    playlist: playlist("review-constraint-removal", [
      track("too-long", "Too Long", "A", ["folk"], { durationMs: 420000, runtime: "7:00", energy: 3 }),
      track("keeper", "Keeper", "B", ["folk"], { durationMs: 180000, runtime: "3:00", energy: 4 })
    ], {
      constraints: { maxTrackDurationMs: 240000 }
    }),
    expectedApplicationModes: ["remove_existing"],
    expectedSuggestionTypes: ["remove"]
  },
  {
    id: "review-strong-sequence",
    playlist: playlist("review-strong-sequence", [
      track("open", "Open", "A", ["soul"], { energy: 2 }),
      track("rise", "Rise", "B", ["soul"], { energy: 4 }),
      track("peak", "Peak", "C", ["soul"], { energy: 7 }),
      track("resolve", "Resolve", "D", ["soul"], { energy: 3 })
    ], {
      mood: "Warm, coherent rise and release."
    }),
    expectedRoleByTrackId: { open: "opener" },
    expectedTransitionIssueTypes: ["strong_transition"]
  },
  {
    id: "review-compress-overbuilt",
    playlist: playlist("review-compress-overbuilt", [
      track("track-1", "Open", "A", ["soul"], { energy: null, durationMs: 240000, runtime: "4:00" }),
      track("track-2", "Middle Drift", "B", ["soul"], { energy: null, durationMs: 300000, runtime: "5:00" }),
      track("track-3", "Middle Echo", "C", ["soul"], { energy: null, durationMs: 300000, runtime: "5:00" }),
      track("track-4", "Peak", "D", ["soul"], { energy: null, durationMs: 270000, runtime: "4:30" }),
      track("track-5", "Resolve", "E", ["soul"], { energy: null, durationMs: 240000, runtime: "4:00" })
    ], {
      title: "Overbuilt Night Drive",
      mood: "Warm nocturnal climb."
    }),
    userQuestion: "Compress this to 4 tracks.",
    expectedSuggestionTypes: ["compress_section"],
    expectedApplicationModes: ["remove_existing"]
  }
];
