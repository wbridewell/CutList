import type { z } from "zod";
import {
  AnalyzePlaylistRequestSchema,
  AnalyzePlaylistResponseSchema,
  AttemptedMatchSchema,
  CandidateTrackSchema,
  ConstraintFindingSchema,
  ConstraintCoverageFieldReportSchema,
  ConstraintCoverageReportSchema,
  ConstraintCoverageStatusSchema,
  ConstraintReportSchema,
  ConversationContextSchema,
  CuratorProgressEventSchema,
  CuratorResponseSchema,
  CuratorStreamEventSchema,
  DiscoveryRadiusSchema,
  ExportRequestSchema,
  ExportResponseSchema,
  ImportChatRequestSchema,
  ImportChatResponseSchema,
  InstructionIntentSchema,
  IntentSummarySchema,
  EvidenceFieldKeySchema,
  PlaylistConstraintsSchema,
  PlaylistMessageRequestSchema,
  PlaylistRemovalDecisionSchema,
  PlaylistShapeSchema,
  PlaylistStateSchema,
  PlaylistUpdateActionSchema,
  PlaylistUpdateSchema,
  PlaylistTrackRoleSchema,
  RejectedCandidateSchema,
  ReviewConfidenceSchema,
  ReviewBasisSchema,
  ReviewSuggestionApplicationModeSchema,
  ReviewSuggestionSchema,
  ReviewSuggestionTypeSchema,
  SuppressedCandidateFingerprintSchema,
  SuppressedCandidateReasonCodeSchema,
  SuggestionBatchSchema,
  TrackSchema,
  TrackRoleAssessmentSchema,
  TransitionAssessmentSchema,
  TransitionIssueTypeSchema,
  VerificationSourceSchema,
  VerifyRequestSchema,
  VerifyResponseSchema
} from "@/lib/playlist/schemas";

export type VerificationSource = z.infer<typeof VerificationSourceSchema>;
export type DiscoveryRadius = z.infer<typeof DiscoveryRadiusSchema>;
export type SuppressedCandidateReasonCode = z.infer<typeof SuppressedCandidateReasonCodeSchema>;
export type SuppressedCandidateFingerprint = z.infer<typeof SuppressedCandidateFingerprintSchema>;
export type Track = z.infer<typeof TrackSchema>;
export type PlaylistConstraints = z.infer<typeof PlaylistConstraintsSchema>;
export type PlaylistState = z.infer<typeof PlaylistStateSchema>;
export type PlaylistUpdateAction = z.infer<typeof PlaylistUpdateActionSchema>;
export type PlaylistUpdate = z.infer<typeof PlaylistUpdateSchema>;
export type CandidateTrack = z.infer<typeof CandidateTrackSchema>;
export type ConstraintFinding = z.infer<typeof ConstraintFindingSchema>;
export type EvidenceFieldKey = z.infer<typeof EvidenceFieldKeySchema>;
export type ConstraintCoverageStatus = z.infer<typeof ConstraintCoverageStatusSchema>;
export type ConstraintCoverageFieldReport = z.infer<typeof ConstraintCoverageFieldReportSchema>;
export type ConstraintCoverageReport = z.infer<typeof ConstraintCoverageReportSchema>;
export type ConstraintReport = z.infer<typeof ConstraintReportSchema>;
export type ConversationContext = z.infer<typeof ConversationContextSchema>;
export type CuratorProgressEvent = z.infer<typeof CuratorProgressEventSchema>;
export type CuratorStreamEvent = z.infer<typeof CuratorStreamEventSchema>;
export type RejectedCandidate = z.infer<typeof RejectedCandidateSchema>;
export type AttemptedMatch = z.infer<typeof AttemptedMatchSchema>;
export type SuggestionBatch = z.infer<typeof SuggestionBatchSchema>;
export type CuratorResponse = z.infer<typeof CuratorResponseSchema>;
export type PlaylistMessageRequest = z.infer<typeof PlaylistMessageRequestSchema>;
export type PlaylistShape = z.infer<typeof PlaylistShapeSchema>;
export type PlaylistRemovalDecision = z.infer<typeof PlaylistRemovalDecisionSchema>;
export type VerifyRequest = z.infer<typeof VerifyRequestSchema>;
export type VerifyResponse = z.infer<typeof VerifyResponseSchema>;
export type ExportRequest = z.infer<typeof ExportRequestSchema>;
export type ExportResponse = z.infer<typeof ExportResponseSchema>;
export type ImportChatRequest = z.infer<typeof ImportChatRequestSchema>;
export type ImportChatResponse = z.infer<typeof ImportChatResponseSchema>;
export type InstructionIntent = z.infer<typeof InstructionIntentSchema>;
export type ReviewConfidence = z.infer<typeof ReviewConfidenceSchema>;
export type ReviewBasis = z.infer<typeof ReviewBasisSchema>;
export type PlaylistTrackRole = z.infer<typeof PlaylistTrackRoleSchema>;
export type TransitionIssueType = z.infer<typeof TransitionIssueTypeSchema>;
export type ReviewSuggestionType = z.infer<typeof ReviewSuggestionTypeSchema>;
export type ReviewSuggestionApplicationMode = z.infer<typeof ReviewSuggestionApplicationModeSchema>;
export type IntentSummary = z.infer<typeof IntentSummarySchema>;
export type TrackRoleAssessment = z.infer<typeof TrackRoleAssessmentSchema>;
export type TransitionAssessment = z.infer<typeof TransitionAssessmentSchema>;
export type ReviewSuggestion = z.infer<typeof ReviewSuggestionSchema>;
export type AnalyzePlaylistRequest = z.infer<typeof AnalyzePlaylistRequestSchema>;
export type AnalyzePlaylistResponse = z.infer<typeof AnalyzePlaylistResponseSchema>;
