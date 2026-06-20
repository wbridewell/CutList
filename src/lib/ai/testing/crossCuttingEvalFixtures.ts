import { z } from "zod";
import { PlaylistStateSchema } from "@/lib/playlist/schemas";
import type { DiscoveryRadius, PlaylistConstraints } from "@/types/playlist";

export const CrossCuttingWorkflowKindSchema = z.enum([
  "generate",
  "review",
  "replace",
  "compress",
  "discovery_compare"
]);

const ConstraintFieldNameSchema = z.custom<keyof PlaylistConstraints>((value) => typeof value === "string");

const DiscoveryRadiusPairSchema = z.object({
  safeRadius: z.custom<DiscoveryRadius>((value) => value === "safe"),
  experimentalRadius: z.custom<DiscoveryRadius>((value) => value === "highly_experimental"),
  minimumDistinctCandidateKeys: z.number().int().min(1)
});

export const CrossCuttingEvalFixtureSchema = z.object({
  id: z.string().min(1),
  cohort: z.string().min(1),
  title: z.string().min(1),
  rationale: z.string().min(1),
  workflowKind: CrossCuttingWorkflowKindSchema,
  playlist: PlaylistStateSchema,
  userMessage: z.string().min(1),
  promptFixtureId: z.string().optional(),
  reviewFixtureId: z.string().optional(),
  expectedOperation: z.enum(["generate", "replace", "reorder", "remove", "conversational", "import_tracks"]).optional(),
  expectedRequestedAddCount: z.number().int().nullable().optional(),
  expectedTargetTotalTrackCount: z.number().int().nullable().optional(),
  expectedReplacementCount: z.number().int().nullable().optional(),
  requiredPersistentVerifiedRuleFields: z.array(ConstraintFieldNameSchema).default([]),
  requiredPersistentGuidanceFields: z.array(ConstraintFieldNameSchema).default([]),
  requiredRequestScopedVerifiedRuleFields: z.array(ConstraintFieldNameSchema).default([]),
  requiredRequestScopedGuidanceFields: z.array(ConstraintFieldNameSchema).default([]),
  requiredReviewSuggestionTypes: z.array(z.string()).default([]),
  requiredReviewApplicationModes: z.array(z.string()).default([]),
  requireActionableReviewSuggestion: z.boolean().default(false),
  forbidInformationalOnlyReorder: z.boolean().default(false),
  discoveryRadiusPair: DiscoveryRadiusPairSchema.optional()
}).superRefine((fixture, ctx) => {
  if ((fixture.workflowKind === "generate" || fixture.workflowKind === "replace" || fixture.workflowKind === "discovery_compare") && !fixture.promptFixtureId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "promptFixtureId is required for generate, replace, and discovery_compare fixtures.",
      path: ["promptFixtureId"]
    });
  }

  if ((fixture.workflowKind === "review" || fixture.workflowKind === "compress") && !fixture.reviewFixtureId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "reviewFixtureId is required for review and compress fixtures.",
      path: ["reviewFixtureId"]
    });
  }

  if (fixture.workflowKind === "discovery_compare" && !fixture.discoveryRadiusPair) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "discoveryRadiusPair is required for discovery_compare fixtures.",
      path: ["discoveryRadiusPair"]
    });
  }

  if (fixture.workflowKind !== "discovery_compare" && fixture.discoveryRadiusPair) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "discoveryRadiusPair is only valid for discovery_compare fixtures.",
      path: ["discoveryRadiusPair"]
    });
  }
});

export type CrossCuttingEvalFixture = z.infer<typeof CrossCuttingEvalFixtureSchema>;

const now = "2026-06-15T00:00:00.000Z";

function basePlaylist(overrides: Partial<CrossCuttingEvalFixture["playlist"]>): CrossCuttingEvalFixture["playlist"] {
  return PlaylistStateSchema.parse({
    id: overrides.id ?? "cross-eval-playlist",
    title: overrides.title ?? "Cross Eval Playlist",
    mood: overrides.mood ?? null,
    arc: overrides.arc ?? null,
    tracks: overrides.tracks ?? [],
    constraints: overrides.constraints ?? {},
    discoveryRadius: overrides.discoveryRadius ?? "moderate",
    conversationSummary: overrides.conversationSummary ?? null,
    updatedAt: overrides.updatedAt ?? now
  });
}

export const crossCuttingEvalFixtures: CrossCuttingEvalFixture[] = [
  CrossCuttingEvalFixtureSchema.parse({
    id: "2026-06-15-generate-straightforward",
    cohort: "2026-06-15",
    title: "Straight add request with verified rules and guidance",
    rationale: "Catches regressions where a normal add request loses persistent verified rules or request-scoped genre guidance.",
    workflowKind: "generate",
    playlist: basePlaylist({ id: "cross-generate-straightforward" }),
    userMessage: "Give me 5 hard rock tracks under 3 minutes. No Motley Crue.",
    promptFixtureId: "duration-and-count",
    expectedOperation: "generate",
    expectedRequestedAddCount: 5,
    requiredPersistentVerifiedRuleFields: ["maxTrackDurationMs", "excludedArtists"],
    requiredRequestScopedGuidanceFields: ["requiredGenreAdditions"]
  }),
  CrossCuttingEvalFixtureSchema.parse({
    id: "2026-06-15-generate-mixed-request",
    cohort: "2026-06-15",
    title: "Mixed shaping-plus-addition request",
    rationale: "Catches misroutes where a request that asks for additions plus shaping gets treated as reorder-only commentary.",
    workflowKind: "generate",
    playlist: basePlaylist({
      id: "cross-generate-mixed",
      mood: "Smoky rise",
      tracks: [{
        id: "seed-1",
        title: "Age of Consent",
        artist: "New Order",
        album: null,
        durationMs: 300000,
        runtime: "5:00",
        verified: true,
        source: "manual",
        sourceId: "seed-1",
        sourceUrl: null,
        artworkUrl: null,
        vibeTags: [],
        genreTags: ["Alternative"],
        rationale: null,
        energy: 6,
        verificationNote: null
      }, {
        id: "seed-2",
        title: "Disorder",
        artist: "Joy Division",
        album: null,
        durationMs: 230000,
        runtime: "3:50",
        verified: true,
        source: "manual",
        sourceId: "seed-2",
        sourceUrl: null,
        artworkUrl: null,
        vibeTags: [],
        genreTags: ["Post-punk"],
        rationale: null,
        energy: 7,
        verificationNote: null
      }]
    }),
    userMessage: "Add three warm songs that make the ending flow better, but keep no explicit tracks as a lasting rule.",
    promptFixtureId: "mixed-shaping-additions",
    expectedOperation: "generate",
    expectedRequestedAddCount: 3,
    requiredPersistentVerifiedRuleFields: ["allowExplicit"]
  }),
  CrossCuttingEvalFixtureSchema.parse({
    id: "2026-06-15-replace-weakest-three",
    cohort: "2026-06-15",
    title: "Replace weakest tracks while preserving a lasting verified rule",
    rationale: "Catches add-vs-replace regressions and verifies that lasting explicitness rules survive replacement requests.",
    workflowKind: "replace",
    playlist: basePlaylist({
      id: "cross-replace",
      tracks: [{
        id: "seed-4",
        title: "Bright Start",
        artist: "A",
        album: null,
        durationMs: 210000,
        runtime: "3:30",
        verified: true,
        source: "manual",
        sourceId: "seed-4",
        sourceUrl: null,
        artworkUrl: null,
        vibeTags: [],
        genreTags: ["soul"],
        rationale: null,
        energy: 6,
        verificationNote: null
      }, {
        id: "seed-5",
        title: "Grey Dip",
        artist: "B",
        album: null,
        durationMs: 210000,
        runtime: "3:30",
        verified: true,
        source: "manual",
        sourceId: "seed-5",
        sourceUrl: null,
        artworkUrl: null,
        vibeTags: [],
        genreTags: ["indie"],
        rationale: null,
        energy: 4,
        verificationNote: null
      }, {
        id: "seed-6",
        title: "Cold Drift",
        artist: "C",
        album: null,
        durationMs: 210000,
        runtime: "3:30",
        verified: true,
        source: "manual",
        sourceId: "seed-6",
        sourceUrl: null,
        artworkUrl: null,
        vibeTags: [],
        genreTags: ["indie"],
        rationale: null,
        energy: 3,
        verificationNote: null
      }]
    }),
    userMessage: "Replace the weakest 3 tracks with warmer soul cuts, but keep no explicit tracks as a lasting rule.",
    promptFixtureId: "replace-weakest-three",
    expectedOperation: "replace",
    expectedReplacementCount: 3,
    requiredPersistentVerifiedRuleFields: ["allowExplicit"]
  }),
  CrossCuttingEvalFixtureSchema.parse({
    id: "2026-06-15-review-actionable",
    cohort: "2026-06-15",
    title: "Actionable review with bridge repair",
    rationale: "Catches generic review drift by requiring a concrete, actionable repair suggestion.",
    workflowKind: "review",
    playlist: basePlaylist({
      id: "review-abrupt-bridge",
      mood: "Starts intimate, then detonates.",
      tracks: [{
        id: "soft-opener",
        title: "Soft Opener",
        artist: "A",
        album: null,
        durationMs: 210000,
        runtime: "3:30",
        verified: true,
        source: "manual",
        sourceId: "soft-opener",
        sourceUrl: null,
        artworkUrl: null,
        vibeTags: [],
        genreTags: ["dream pop"],
        rationale: null,
        energy: 2,
        verificationNote: null
      }, {
        id: "hard-climax",
        title: "Hard Climax",
        artist: "B",
        album: null,
        durationMs: 210000,
        runtime: "3:30",
        verified: true,
        source: "manual",
        sourceId: "hard-climax",
        sourceUrl: null,
        artworkUrl: null,
        vibeTags: [],
        genreTags: ["industrial"],
        rationale: null,
        energy: 9,
        verificationNote: null
      }, {
        id: "afterglow",
        title: "Afterglow",
        artist: "C",
        album: null,
        durationMs: 210000,
        runtime: "3:30",
        verified: true,
        source: "manual",
        sourceId: "afterglow",
        sourceUrl: null,
        artworkUrl: null,
        vibeTags: [],
        genreTags: ["dream pop"],
        rationale: null,
        energy: 4,
        verificationNote: null
      }]
    }),
    userMessage: "Review playlist",
    reviewFixtureId: "review-abrupt-bridge",
    requiredReviewSuggestionTypes: ["add_bridge"],
    requiredReviewApplicationModes: ["verify_candidate"],
    requireActionableReviewSuggestion: true,
    forbidInformationalOnlyReorder: true
  }),
  CrossCuttingEvalFixtureSchema.parse({
    id: "2026-06-15-compress-overbuilt",
    cohort: "2026-06-15",
    title: "Compression review on an overbuilt section",
    rationale: "Catches regressions where compression stops producing section-level non-mutating cut suggestions.",
    workflowKind: "compress",
    playlist: basePlaylist({
      id: "review-compress-overbuilt",
      title: "Overbuilt Night Drive",
      mood: "Warm nocturnal climb.",
      tracks: [{
        id: "track-1",
        title: "Open",
        artist: "A",
        album: null,
        durationMs: 240000,
        runtime: "4:00",
        verified: true,
        source: "manual",
        sourceId: "track-1",
        sourceUrl: null,
        artworkUrl: null,
        vibeTags: [],
        genreTags: ["soul"],
        rationale: null,
        energy: null,
        verificationNote: null
      }, {
        id: "track-2",
        title: "Middle Drift",
        artist: "B",
        album: null,
        durationMs: 300000,
        runtime: "5:00",
        verified: true,
        source: "manual",
        sourceId: "track-2",
        sourceUrl: null,
        artworkUrl: null,
        vibeTags: [],
        genreTags: ["soul"],
        rationale: null,
        energy: null,
        verificationNote: null
      }, {
        id: "track-3",
        title: "Middle Echo",
        artist: "C",
        album: null,
        durationMs: 300000,
        runtime: "5:00",
        verified: true,
        source: "manual",
        sourceId: "track-3",
        sourceUrl: null,
        artworkUrl: null,
        vibeTags: [],
        genreTags: ["soul"],
        rationale: null,
        energy: null,
        verificationNote: null
      }, {
        id: "track-4",
        title: "Peak",
        artist: "D",
        album: null,
        durationMs: 270000,
        runtime: "4:30",
        verified: true,
        source: "manual",
        sourceId: "track-4",
        sourceUrl: null,
        artworkUrl: null,
        vibeTags: [],
        genreTags: ["soul"],
        rationale: null,
        energy: null,
        verificationNote: null
      }, {
        id: "track-5",
        title: "Resolve",
        artist: "E",
        album: null,
        durationMs: 240000,
        runtime: "4:00",
        verified: true,
        source: "manual",
        sourceId: "track-5",
        sourceUrl: null,
        artworkUrl: null,
        vibeTags: [],
        genreTags: ["soul"],
        rationale: null,
        energy: null,
        verificationNote: null
      }]
    }),
    userMessage: "Compress this to 4 tracks.",
    reviewFixtureId: "review-compress-overbuilt",
    requiredReviewSuggestionTypes: ["compress_section"],
    requiredReviewApplicationModes: ["remove_existing"],
    requireActionableReviewSuggestion: true
  }),
  CrossCuttingEvalFixtureSchema.parse({
    id: "2026-06-15-discovery-radius-compare",
    cohort: "2026-06-15",
    title: "Safe versus highly experimental candidate divergence",
    rationale: "Checks that discovery radius actually changes the candidate set in a legible way without relaxing core prompt discipline.",
    workflowKind: "discovery_compare",
    playlist: basePlaylist({
      id: "cross-discovery",
      title: "Commute Spark",
      tracks: [{
        id: "seed-1",
        title: "Just What I Needed",
        artist: "The Cars",
        album: null,
        durationMs: 220000,
        runtime: "3:40",
        verified: true,
        source: "manual",
        sourceId: "seed-1",
        sourceUrl: null,
        artworkUrl: null,
        vibeTags: [],
        genreTags: ["Rock"],
        rationale: null,
        energy: 7,
        verificationNote: null
      }]
    }),
    userMessage: "Add three upbeat new wave songs for a bright commute.",
    promptFixtureId: "simple-additions",
    expectedOperation: "generate",
    expectedRequestedAddCount: 3,
    discoveryRadiusPair: {
      safeRadius: "safe",
      experimentalRadius: "highly_experimental",
      minimumDistinctCandidateKeys: 2
    }
  })
];
