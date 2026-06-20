import { getConstraintRuleChips, type ConstraintRuleChip } from "@/lib/playlist/constraints/registry";
import type { ConstraintCoverageFieldReport, ConstraintFinding, ConstraintReport, PlaylistConstraints, Track } from "@/types/playlist";

export type ConstraintChipView = ConstraintRuleChip;

export type ConstraintFindingView = {
  key: string;
  message: string;
  summary: string;
  trackId: string | null;
  trackTitle: string | null;
};

export type ConstraintPresentation = {
  ruleChips: ConstraintChipView[];
  verifiedRuleChips: ConstraintChipView[];
  curatorGuidanceChips: ConstraintChipView[];
  primaryRuleChips: ConstraintChipView[];
  overflowRuleChips: ConstraintChipView[];
  guidance: string[];
  primaryGuidance: string[];
  overflowGuidance: string[];
  violationViews: ConstraintFindingView[];
  evidenceWarningViews: ConstraintFindingView[];
  evidenceCoverageViews: ConstraintCoverageFieldReport[];
  evidenceCoverageSummary: string[];
  violationMessagesByTrackId: Map<string, string[]>;
  violationTrackCount: number;
  evidenceWarningTrackCount: number;
};

function messageWithoutTrackTitle(message: string, track: Track): string {
  const titlePrefix = `${track.title} `;
  const artistTitlePrefix = `${track.artist} - ${track.title} `;

  if (message.startsWith(artistTitlePrefix)) {
    return message.slice(artistTitlePrefix.length);
  }

  if (message.startsWith(titlePrefix)) {
    return message.slice(titlePrefix.length);
  }

  return message;
}

export function getConstraintChips(constraints: PlaylistConstraints): ConstraintChipView[] {
  return getConstraintRuleChips(constraints, { enforcementLevel: "verified_rule" });
}

export function getConstraintGuidance(constraints: PlaylistConstraints): string[] {
  return getConstraintRuleChips(constraints, { enforcementLevel: "curator_guidance" }).map((chip) => chip.label);
}

function createFindingViews(
  findings: Array<{ type: string; message: string; trackId?: string }>,
  tracksById: Map<string, Track>
): ConstraintFindingView[] {
  return findings.map((finding, index) => {
    const track = finding.trackId ? tracksById.get(finding.trackId) : null;
    return {
      key: `${finding.type}-${finding.trackId ?? "playlist"}-${index}`,
      message: finding.message,
      summary: track ? messageWithoutTrackTitle(finding.message, track) : finding.message,
      trackId: finding.trackId ?? null,
      trackTitle: track?.title ?? null
    };
  });
}

function createFindingViewsFromStructuredFindings(
  findings: ConstraintFinding[],
  tracksById: Map<string, Track>
): ConstraintFindingView[] {
  return findings.map((finding, index) => {
    const trackId = finding.subject.trackId ?? null;
    const track = trackId ? tracksById.get(trackId) : null;
    const rawSummary = finding.detail ? `${finding.summary} ${finding.detail}` : finding.summary;
    const summary = track ? messageWithoutTrackTitle(rawSummary, track) : rawSummary;
    return {
      key: `${finding.ruleId}-${trackId ?? finding.subject.kind}-${index}`,
      message: track ? `${track.title} ${summary}` : summary,
      summary,
      trackId,
      trackTitle: track?.title ?? null
    };
  });
}

function groupViolationMessagesByTrackId(violationViews: ConstraintFindingView[]): Map<string, string[]> {
  const result = new Map<string, string[]>();
  for (const view of violationViews) {
    if (!view.trackId) {
      continue;
    }
    const messages = result.get(view.trackId) ?? [];
    messages.push(view.message);
    result.set(view.trackId, messages);
  }
  return result;
}

export function createConstraintPresentation(
  tracks: Track[],
  constraints: PlaylistConstraints,
  report: ConstraintReport
): ConstraintPresentation {
  const tracksById = new Map(tracks.map((track) => [track.id, track]));
  const verifiedRuleChips = getConstraintChips(constraints);
  const curatorGuidanceChips = getConstraintRuleChips(constraints, { enforcementLevel: "curator_guidance" });
  const ruleChips = verifiedRuleChips;
  const guidance = getConstraintGuidance(constraints);
  const structuredFindings = report.findings ?? [];
  const failedFindings = structuredFindings.filter((finding) => finding.status === "failed");
  const unknownFindings = structuredFindings.filter((finding) => finding.status === "unknown");
  const violationViews = failedFindings.length > 0
    ? createFindingViewsFromStructuredFindings(failedFindings, tracksById)
    : createFindingViews(report.violations, tracksById);
  const evidenceWarningViews = unknownFindings.length > 0
    ? createFindingViewsFromStructuredFindings(unknownFindings, tracksById)
    : createFindingViews(report.evidenceWarnings ?? [], tracksById);
  const violationTrackIds = new Set(violationViews.map((view) => view.trackId).filter((trackId): trackId is string => trackId != null));
  const evidenceWarningTrackIds = new Set(evidenceWarningViews.map((view) => view.trackId).filter((trackId): trackId is string => trackId != null));

  return {
    ruleChips,
    verifiedRuleChips,
    curatorGuidanceChips,
    primaryRuleChips: ruleChips.slice(0, 4),
    overflowRuleChips: ruleChips.slice(4),
    guidance,
    primaryGuidance: guidance.slice(0, 2),
    overflowGuidance: guidance.slice(2),
    violationViews,
    evidenceWarningViews,
    evidenceCoverageViews: report.coverage?.fields ?? [],
    evidenceCoverageSummary: report.coverage?.summary ?? [],
    violationMessagesByTrackId: groupViolationMessagesByTrackId(violationViews),
    violationTrackCount: violationTrackIds.size,
    evidenceWarningTrackCount: evidenceWarningTrackIds.size
  };
}
