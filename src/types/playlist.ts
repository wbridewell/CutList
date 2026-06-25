import type { z } from "zod";
import {
  AnalyzePlaylistRequestSchema,
  AnalyzePlaylistResponseSchema,
  AttemptedMatchSchema,
  BoundNamedTrackSchema,
  BoundTrackPlacementSchema,
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
  DeclaredTrackPlacementSchema,
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
  NormalizedInstructionIntentSchema,
  OperatorBoundEntitiesSchema,
  OperatorDeclaredEntitiesSchema,
  OperatorExecutionReceiptSchema,
  OperatorKindSchema,
  OperatorParameterHintsSchema,
  OperatorPlanNodeSchema,
  OperatorPlanTemplateSchema,
  RejectedCandidateSchema,
  ReplacementModeSchema,
  ResolvedOperatorPlanSchema,
  ResolvedUserRequestPlanSchema,
  ReviewConfidenceSchema,
  ReviewModeSchema,
  ReviewBasisSchema,
  ReviewSuggestionApplicationModeSchema,
  ReviewSuggestionSchema,
  ReviewSuggestionTypeSchema,
  SuppressedCandidateFingerprintSchema,
  SuppressedCandidateReasonCodeSchema,
  SuggestionBatchSchema,
  TrackSchema,
  TrackPlacementModeSchema,
  TrackRoleAssessmentSchema,
  TransitionAssessmentSchema,
  TransitionIssueTypeSchema,
  UserRequestExecutionPolicySchema,
  UserRequestOperationPlanKindSchema,
  UserRequestOperationPlanSchema,
  UserRequestPlanRequestSchema,
  UserRequestRouteFamilySchema,
  UserRequestRoutingConfidenceSchema,
  UserRequestRoutingNoteSchema,
  UserRequestDeterministicSignalsSchema,
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
export type NormalizedInstructionIntentSnapshot = z.infer<typeof NormalizedInstructionIntentSchema>;
export type ReviewConfidence = z.infer<typeof ReviewConfidenceSchema>;
export type ReviewMode = z.infer<typeof ReviewModeSchema>;
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
export type UserRequestRouteFamily = z.infer<typeof UserRequestRouteFamilySchema>;
export type UserRequestExecutionPolicy = z.infer<typeof UserRequestExecutionPolicySchema>;
export type UserRequestRoutingConfidence = z.infer<typeof UserRequestRoutingConfidenceSchema>;
export type UserRequestRoutingNote = z.infer<typeof UserRequestRoutingNoteSchema>;
export type UserRequestOperationPlanKind = z.infer<typeof UserRequestOperationPlanKindSchema>;
export type UserRequestOperationPlan = z.infer<typeof UserRequestOperationPlanSchema>;
export type UserRequestDeterministicSignals = z.infer<typeof UserRequestDeterministicSignalsSchema>;
export type UserRequestPlanRequest = z.infer<typeof UserRequestPlanRequestSchema>;
export type OperatorKind = z.infer<typeof OperatorKindSchema>;
export type OperatorPlanTemplate = z.infer<typeof OperatorPlanTemplateSchema>;
export type OperatorPlanNode = z.infer<typeof OperatorPlanNodeSchema>;
export type BoundNamedTrack = z.infer<typeof BoundNamedTrackSchema>;
export type ReplacementMode = z.infer<typeof ReplacementModeSchema>;
export type TrackPlacementMode = z.infer<typeof TrackPlacementModeSchema>;
export type DeclaredTrackPlacement = z.infer<typeof DeclaredTrackPlacementSchema>;
export type BoundTrackPlacement = z.infer<typeof BoundTrackPlacementSchema>;
export type OperatorDeclaredEntities = z.infer<typeof OperatorDeclaredEntitiesSchema>;
export type OperatorParameterHints = z.infer<typeof OperatorParameterHintsSchema>;
export type OperatorBoundEntities = z.infer<typeof OperatorBoundEntitiesSchema>;
export type ResolvedOperatorPlan = z.infer<typeof ResolvedOperatorPlanSchema>;
export type OperatorExecutionReceipt = z.infer<typeof OperatorExecutionReceiptSchema>;
export type ResolvedUserRequestPlan = z.infer<typeof ResolvedUserRequestPlanSchema>;
