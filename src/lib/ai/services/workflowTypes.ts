import type { NormalizedInstructionIntent } from "@/lib/ai/services/instructionIntent";
import type { InstructionIntentParseStatus } from "@/lib/ai/services/instructionIntent";
import type { ConversationContext, CuratorResponse, DiscoveryRadius, PlaylistConstraints, PlaylistState, Track } from "@/types/playlist";
import type { parseTrackRowsFromText } from "@/lib/playlist/io/textImport";
import type { removeAlternateTrackVersions } from "@/lib/playlist/analysis/versionCleanup";
import type { SuppressedCandidateFingerprint } from "@/types/playlist";
import type { ParsedTrackLine } from "@/lib/playlist/io/textImport";

export type ResolvedOperation =
  | "conversational"
  | "import_tracks"
  | "reorder"
  | "remove"
  | "replace"
  | "generate";

export type CuratorStepKind =
  | "update_rules"
  | "remove"
  | "replace"
  | "add"
  | "reorder"
  | "metadata"
  | "analyze"
  | "import";

export type ParsedTrackRows = ReturnType<typeof parseTrackRowsFromText>;
export type VersionCleanupResult = ReturnType<typeof removeAlternateTrackVersions>;

export type PreGenerationRemovalPlan = {
  baseTracks: Track[];
  constraintRemovedTracks: Track[];
  removedTracks: Track[];
  versionCleanup: VersionCleanupResult | null;
};

export type ConstraintExecutionState = {
  deterministicConstraints: PlaylistConstraints;
  deterministicPersistentConstraints: PlaylistConstraints;
  deterministicRequestScopedConstraints: PlaylistConstraints;
  persistentVerifiedRules: PlaylistConstraints;
  persistentGuidance: PlaylistConstraints;
  requestScopedVerifiedRules: PlaylistConstraints;
  requestScopedGuidance: PlaylistConstraints;
  effectiveVerifiedRules: PlaylistConstraints;
  effectiveGuidance: PlaylistConstraints;
  activeConstraints: PlaylistConstraints;
  persistedConstraintsAfterSuccess: PlaylistConstraints;
};

export type SuppressionExecutionState = {
  entries: SuppressedCandidateFingerprint[];
  overriddenFingerprints: Set<string>;
};

export type CuratorPlannedStep = {
  id: string;
  kind: CuratorStepKind;
  sourceOrder: number;
  originText: string;
  dependsOnStepIds: string[];
  planningNotes: string[];
  requestedAddCount?: number | null;
  targetTotalTrackCount?: number | null;
  replacementCount?: number | null;
};

export type StepExecutionResult = {
  stepId: string;
  stepKind: CuratorStepKind;
  sourceOrder: number;
  originText: string;
  acceptedTracks: Track[];
  removedTracks: Track[];
  rejectedCandidates: CuratorResponse["rejectedCandidates"];
  playlistAction: NonNullable<CuratorResponse["playlistUpdate"]>["action"] | null;
  orderRationale: string | null;
  ruleChanges: PlaylistConstraints | null;
  message: string;
  applied: boolean;
  skipped: boolean;
  skipReason: string | null;
  failed: boolean;
  failureReason: string | null;
};

export type ResolvedCuratorRequestPlan = {
  playlist: PlaylistState;
  userMessage: string;
  conversationContext?: ConversationContext;
  operation: ResolvedOperation;
  postOperationShape: boolean;
  normalizedIntent: NormalizedInstructionIntent;
  parsedTracks: ParsedTrackRows;
  explicitTrackRequests: ParsedTrackLine[];
  requestedAddCount: number | null;
  targetTotalTrackCount: number | null;
  replacementCount: number | null;
  instructionIntentStatus: InstructionIntentParseStatus | "not_attempted";
  effectiveDiscoveryRadius: DiscoveryRadius;
  constraintState: ConstraintExecutionState;
  suppressionState: SuppressionExecutionState;
  preGenerationRemovalPlan: PreGenerationRemovalPlan;
  steps: CuratorPlannedStep[];
  debugNotes: string[];
};

export type CandidateExecutionResult = {
  acceptedTracks: Track[];
  rejectedCandidates: CuratorResponse["rejectedCandidates"];
  playlistMeta: CuratorResponse["playlistMeta"];
  activeConstraints: PlaylistConstraints;
  batchMessages: string[];
};

export type WorkflowExecutionResult = {
  finalResponse: CuratorResponse;
  finalPlaylist: PlaylistState;
  finalActiveConstraints: PlaylistConstraints;
  finalPersistedConstraints: PlaylistConstraints;
  stepResults: StepExecutionResult[];
};
