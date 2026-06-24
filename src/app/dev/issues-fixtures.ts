import {
  createPlaylistReviewHistoryEntry,
  createRejectedCandidateIssueStatuses,
  reviewSuggestionStatusForEntry,
  type HistoryIssueStatus,
  type RequestHistoryEntry
} from "@/lib/playlist/collaboration";
import { evaluatePlaylistConstraints } from "@/lib/playlist/constraints";
import type { AnalyzePlaylistResponse, PlaylistState, RejectedCandidate, ReviewSuggestion, Track } from "@/types/playlist";

export const baseTracks: Track[] = [
  {
    id: "track-1",
    title: "Neon Weather",
    artist: "Signal Bloom",
    album: "City Heat",
    durationMs: 242000,
    runtime: "4:02",
    verified: true,
    source: "itunes",
    sourceId: "itunes-track-1",
    sourceUrl: null,
    artworkUrl: null,
    explicit: false,
    vibeTags: ["sleek", "night drive"],
    genreTags: ["indie pop", "synthpop"],
    rationale: null,
    fitNotes: "Clean opener with forward motion.",
    energy: 5,
    bpm: 116,
    bpmConfidence: "high",
    vocalProfile: "mixed_vocals",
    vocalProfileConfidence: "medium",
    evidenceNotes: [],
    verificationNote: null,
    verificationConfidence: "high"
  },
  {
    id: "track-2",
    title: "Street Static",
    artist: "Signal Bloom",
    album: "City Heat",
    durationMs: 238000,
    runtime: "3:58",
    verified: true,
    source: "itunes",
    sourceId: "itunes-track-2",
    sourceUrl: null,
    artworkUrl: null,
    explicit: true,
    vibeTags: ["tension", "late-night"],
    genreTags: ["indie pop", "synthpop"],
    rationale: null,
    fitNotes: "Breaks the no-explicit rule and doubles the same artist too early.",
    energy: 6,
    bpm: null,
    bpmConfidence: null,
    vocalProfile: "mixed_vocals",
    vocalProfileConfidence: "medium",
    evidenceNotes: ["No BPM found in current metadata."],
    verificationNote: null,
    verificationConfidence: "high"
  },
  {
    id: "track-3",
    title: "Glass Harbor",
    artist: "Midnight Almanac",
    album: "Coastline Errors",
    durationMs: 287000,
    runtime: "4:47",
    verified: true,
    source: "itunes",
    sourceId: "itunes-track-3",
    sourceUrl: null,
    artworkUrl: null,
    explicit: false,
    vibeTags: ["dreamy", "cool air"],
    genreTags: ["dream pop"],
    rationale: null,
    fitNotes: "Expands the palette but softens the pulse.",
    energy: 4,
    bpm: 109,
    bpmConfidence: "medium",
    vocalProfile: "female_vocals",
    vocalProfileConfidence: "medium",
    evidenceNotes: [],
    verificationNote: null,
    verificationConfidence: "high"
  },
  {
    id: "track-4",
    title: "Oil and Smoke",
    artist: "Harbor Unit",
    album: "Afterimages",
    durationMs: 301000,
    runtime: "5:01",
    verified: true,
    source: "itunes",
    sourceId: "itunes-track-4",
    sourceUrl: null,
    artworkUrl: null,
    explicit: false,
    vibeTags: ["pressure", "mechanical"],
    genreTags: ["post-punk"],
    rationale: null,
    fitNotes: "Pushes the middle harder, slightly over the runtime cap.",
    energy: 7,
    bpm: 124,
    bpmConfidence: "high",
    vocalProfile: "male_vocals",
    vocalProfileConfidence: "medium",
    evidenceNotes: [],
    verificationNote: null,
    verificationConfidence: "high"
  }
];

export const basePlaylist: PlaylistState = {
  id: "issues-fixture-playlist",
  title: "Neon Fault Lines",
  mood: "A glossy nighttime set that keeps threatening to tilt into something meaner.",
  arc: "Start sleek, pressurize the middle, then land with a cooler release.",
  tracks: baseTracks,
  constraints: {
    maxTrackDurationMs: 300000,
    allowExplicit: false,
    maxTracksPerArtist: 1,
    minBpm: 110,
    vocalProfile: "female_vocals",
    energyTrajectory: {
      direction: "gradual_rise",
      ending: "cooldown"
    }
  },
  discoveryRadius: "moderate",
  conversationSummary: null,
  updatedAt: "2026-06-13T18:00:00.000Z"
};

export const baseRejectedCandidates: RejectedCandidate[] = [
  {
    artist: "Lumen Park",
    title: "Night Drive (Live)",
    reason: "Closest match is a live version and the timing is noticeably off.",
    violatedConstraint: null,
    attemptedMatches: [
      {
        artist: "Lumen Park",
        title: "Night Drive",
        album: "Midnight Sets",
        durationMs: 221000,
        runtime: "3:41",
        source: "itunes",
        sourceId: "match-1",
        sourceUrl: null,
        score: 0.87,
        confidence: "medium"
      },
      {
        artist: "Lumen Park",
        title: "Night Drive (Live)",
        album: "At Mercury Hall",
        durationMs: 287000,
        runtime: "4:47",
        source: "itunes",
        sourceId: "match-2",
        sourceUrl: null,
        score: 0.84,
        confidence: "medium"
      }
    ]
  },
  {
    artist: "Glass Arcade",
    title: "After the Fever",
    reason: "Candidate was blocked because it violates the no-explicit rule.",
    violatedConstraint: "allowExplicit",
    attemptedMatches: [
      {
        artist: "Glass Arcade",
        title: "After the Fever",
        album: "Exit Signs",
        durationMs: 232000,
        runtime: "3:52",
        source: "itunes",
        sourceId: "match-3",
        sourceUrl: null,
        explicit: true,
        score: 0.91,
        confidence: "high"
      }
    ]
  }
];

export const baseRejectedEntry: RequestHistoryEntry = {
  id: "issues-fixture-rejected-entry",
  userMessage: "Add two darker songs that still fit the drive.",
  assistantMessage: "Two candidates were blocked and need review.",
  acceptedCount: 0,
  rejectedCandidates: baseRejectedCandidates,
  createdAt: "2026-06-13T18:10:00.000Z",
  kind: "request",
  issueStatuses: createRejectedCandidateIssueStatuses(baseRejectedCandidates)
};

export const baseReview: AnalyzePlaylistResponse = {
  reviewMode: "full_critique",
  message: "The playlist has a strong front-half identity, but the middle gets congested and the ending does not fully resolve the pressure.",
  strengths: ["The opener and first transition are convincing.", "The tonal palette is coherent."],
  weakLinks: [{ trackId: "track-2", reason: "Breaks explicit preference and doubles the same artist too early." }],
  sequencingNotes: ["The middle act repeats texture without changing the story."],
  constraintReport: evaluatePlaylistConstraints(basePlaylist.tracks, basePlaylist.constraints),
  suggestedEdits: [],
  intentSummary: {
    playlistIdentity: "Sleek nocturnal pop edging toward post-punk tension.",
    preservedQualities: ["glossy propulsion", "night-drive atmosphere", "cool landing"],
    likelyUserIntent: "Keep the set sharp and immersive without letting it sprawl or get messy.",
    riskNotes: ["Too much cleanup could sand off the best friction."],
    confidence: "medium"
  },
  trackRoles: [
    { trackId: "track-1", role: "opener", rationale: "Establishes the lane fast.", confidence: "high" },
    { trackId: "track-4", role: "climax", rationale: "Carries the most pressure.", confidence: "medium" }
  ],
  transitionReview: [
    {
      fromTrackId: "track-2",
      toTrackId: "track-3",
      issueType: "weak_bridge",
      summary: "The energy drops before the palette has earned the cooldown.",
      suggestedRepair: "Either bridge this move or cut one of the redundant glossy tracks earlier.",
      confidence: "medium"
    }
  ],
  reviewSuggestions: [
    {
      id: "suggest-remove-duplicate",
      type: "remove",
      applicationMode: "remove_existing",
      affectedTrackIds: ["track-2"],
      rationale: "Removing the second Signal Bloom track solves both artist repetition and explicitness without damaging the opener.",
      intentPreservation: "Keeps the sleek opening identity while reducing obvious clutter.",
      risk: "You lose one of the set's more aggressive early jolts.",
      confidence: "high",
      suggestedPrompt: null
    },
    {
      id: "suggest-bridge-middle",
      type: "add",
      applicationMode: "verify_candidate",
      affectedTrackIds: ["track-2", "track-3"],
      rationale: "A bridge track could make the pivot into the dreamier stretch feel intentional instead of slack.",
      intentPreservation: "Preserves the arc while making the middle turn feel earned.",
      risk: "A weak bridge could feel like extra furniture.",
      confidence: "medium",
      suggestedPrompt: "Find one verified bridge track between Signal Bloom and Midnight Almanac."
    },
    {
      id: "suggest-compress-middle",
      type: "compress_section",
      applicationMode: "remove_existing",
      affectedTrackIds: ["track-2", "track-3"],
      rationale: "The center is overbuilt for a short, high-focus set.",
      intentPreservation: "Keeps the opener, the hardest push, and the cool landing.",
      risk: "Could make the final sequence feel a touch abrupt if no follow-up repair happens.",
      confidence: "medium",
      suggestedPrompt: null,
      sectionLabel: "Middle stretch",
      compressionPlan: {
        removeTrackIds: ["track-3"],
        keepTrackIds: ["track-1", "track-2", "track-4"],
        targetTrackCount: 3,
        targetTotalDurationMs: null
      }
    }
  ],
  debug: undefined
};

export const baseReviewHistoryEntry = createPlaylistReviewHistoryEntry(
  "The playlist review surfaced three suggested edits.",
  baseReview,
  "2026-06-13T18:12:00.000Z"
);

export function applyReviewStatuses(
  entry: RequestHistoryEntry,
  applied: Set<string>,
  dismissed: Set<string>,
  ignored: Set<string>,
  sent: Set<string>
): RequestHistoryEntry {
  let issueStatuses = entry.issueStatuses ?? [];
  for (const suggestion of entry.reviewSuggestions ?? []) {
    const nextStatus =
      dismissed.has(suggestion.id) ? "dismissed" :
      applied.has(suggestion.id) ? "applied" :
      ignored.has(suggestion.id) ? "ignored" :
      sent.has(suggestion.id) ? "requested" :
      "open";
    issueStatuses = issueStatuses.map((status) => (
      status.issueId === suggestion.id && status.issueKind === "review_suggestion"
        ? { ...status, status: nextStatus, actedAt: nextStatus === "open" ? null : "2026-06-13T18:20:00.000Z" }
        : status
    ));
  }
  return { ...entry, issueStatuses };
}

export function actionableSuggestionCount(
  review: AnalyzePlaylistResponse,
  applied: Set<string>,
  dismissed: Set<string>,
  ignored: Set<string>,
  sent: Set<string>
): number {
  return review.reviewSuggestions.filter((suggestion) =>
    !applied.has(suggestion.id) &&
    !dismissed.has(suggestion.id) &&
    !ignored.has(suggestion.id) &&
    !sent.has(suggestion.id)
  ).length;
}

export function reviewStatusSummary(
  entry: RequestHistoryEntry,
  suggestions: ReviewSuggestion[]
): Array<{ id: string; label: string; status: string }> {
  return suggestions.map((suggestion) => ({
    id: suggestion.id,
    label: suggestion.type.replace(/_/g, " "),
    status: reviewSuggestionStatusForEntry(entry, suggestion.id)
  }));
}

export function buildRejectedEntry(issueStatuses: HistoryIssueStatus[]): RequestHistoryEntry {
  return {
    ...baseRejectedEntry,
    issueStatuses
  };
}
