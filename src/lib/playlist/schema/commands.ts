import { z } from "zod";
import { playlistExportFormatIds } from "@/lib/playlist/io/exportFormats";
import { PlaylistConstraintsSchema, PlaylistStateSchema, TrackSchema } from "./playlist";
import { CandidateTrackSchema, RejectedCandidateSchema } from "./curator";
import { IntentSummarySchema, ReviewModeSchema, ReviewSuggestionSchema, TrackRoleAssessmentSchema, TransitionAssessmentSchema } from "./review";
import { ConstraintReportSchema } from "./constraintReport";
import { PrecomputedOperatorPlanSchema } from "./planning";

export const ConversationContextSchema = z.object({
  recentMessages: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().min(1).max(1600)
  })).max(8)
});

export const UserRequestPlanRequestSchema = z.object({
  playlist: PlaylistStateSchema,
  requestId: z.string().min(1).max(120).optional(),
  userMessage: z.string().min(1).max(8000),
  conversationContext: ConversationContextSchema.optional(),
  forceReadOnly: z.boolean().default(false)
});

export const PlaylistMessageRequestSchema = z.object({
  playlist: PlaylistStateSchema,
  requestId: z.string().min(1).max(120).optional(),
  userMessage: z.string().min(1).max(8000),
  conversationContext: ConversationContextSchema.optional(),
  precomputedPlan: PrecomputedOperatorPlanSchema.optional()
});

export const VerifyRequestSchema = z.object({
  tracks: z.array(z.object({
    title: z.string().min(1),
    artist: z.string().min(1),
    album: z.string().nullable().optional()
  })).min(1).max(50)
});

export const VerifyResponseSchema = z.object({
  verified: z.array(TrackSchema),
  rejected: z.array(RejectedCandidateSchema)
});

export const ExportRequestSchema = z.object({
  playlist: PlaylistStateSchema,
  format: z.enum(playlistExportFormatIds)
});

export const ExportResponseSchema = z.object({
  filename: z.string(),
  mimeType: z.string(),
  content: z.string()
});

export const ImportChatRequestSchema = z.object({
  text: z.string().min(1).max(30000)
});

export const ImportChatExtractionSchema = z.object({
  extractedVibeBrief: z.string().nullable(),
  extractedConstraints: PlaylistConstraintsSchema,
  tracks: z.array(z.object({
    title: z.string().min(1),
    artist: z.string().min(1),
    album: z.string().nullable().optional()
  })).max(80),
  unresolvedNotes: z.array(z.string()).default([]),
  suggestedNextPrompt: z.string().nullable()
});

export const ImportChatResponseSchema = z.object({
  extractedVibeBrief: z.string().nullable(),
  extractedConstraints: PlaylistConstraintsSchema,
  verifiedTracks: z.array(TrackSchema),
  rejectedCandidates: z.array(RejectedCandidateSchema),
  unresolvedNotes: z.array(z.string()),
  suggestedNextPrompt: z.string().nullable()
});

export const AnalyzePlaylistRequestSchema = z.object({
  playlist: PlaylistStateSchema,
  requestId: z.string().min(1).max(120).optional(),
  userQuestion: z.string().max(4000).optional(),
  reviewMode: ReviewModeSchema.optional(),
  conversationContext: ConversationContextSchema.optional()
});

export const AnalyzePlaylistResponseSchema = z.object({
  reviewMode: ReviewModeSchema.default("full_critique"),
  curatorTake: z.string().optional(),
  message: z.string(),
  strengths: z.array(z.string()),
  weakLinks: z.array(z.object({
    trackId: z.string(),
    reason: z.string()
  })),
  sequencingNotes: z.array(z.string()),
  constraintReport: ConstraintReportSchema,
  suggestedEdits: z.array(z.object({
    type: z.enum(["remove", "move", "replace", "add"]),
    reason: z.string(),
    trackId: z.string().optional(),
    candidate: CandidateTrackSchema.optional()
  })),
  intentSummary: IntentSummarySchema.optional(),
  trackRoles: z.array(TrackRoleAssessmentSchema).default([]),
  transitionReview: z.array(TransitionAssessmentSchema).default([]),
  reviewSuggestions: z.array(ReviewSuggestionSchema).default([]),
  debug: z.object({
    modelRawOutput: z.unknown().optional(),
    validationError: z.string().optional()
  }).optional()
});
