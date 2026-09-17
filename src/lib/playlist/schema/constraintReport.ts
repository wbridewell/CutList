import { z } from "zod";

export const ConstraintViolationSchema = z.object({
  type: z.string(),
  message: z.string(),
  trackId: z.string().optional()
});

export const ConstraintEvidenceWarningSchema = z.object({
  type: z.string(),
  message: z.string(),
  trackId: z.string().optional()
});

export const ConstraintFindingSchema = z.object({
  ruleId: z.string(),
  status: z.enum(["failed", "unknown", "guidance"]),
  subject: z.object({
    kind: z.enum(["track", "playlist", "sequence"]),
    trackId: z.string().optional()
  }),
  summary: z.string(),
  detail: z.string().nullable().optional(),
  actionable: z.boolean()
});

export const EvidenceFieldKeySchema = z.enum([
  "title",
  "artist",
  "durationMs",
  "explicit",
  "genreTags",
  "bpm",
  "sourceIdentity"
]);

export const ConstraintCoverageStatusSchema = z.enum(["healthy", "partial", "missing"]);

export const ConstraintCoverageFieldReportSchema = z.object({
  field: EvidenceFieldKeySchema,
  activeRuleIds: z.array(z.string()).default([]),
  status: ConstraintCoverageStatusSchema,
  availableTrackCount: z.number().int().nonnegative(),
  missingTrackCount: z.number().int().nonnegative(),
  totalTrackCount: z.number().int().nonnegative(),
  coverageRatio: z.number().min(0).max(1),
  summary: z.string()
});

export const ConstraintCoverageReportSchema = z.object({
  activeVerifiedRuleIds: z.array(z.string()).default([]),
  fields: z.array(ConstraintCoverageFieldReportSchema).default([]),
  summary: z.array(z.string()).default([])
});

export const ConstraintReportSchema = z.object({
  passed: z.boolean(),
  totalDurationMs: z.number().int().nonnegative(),
  violations: z.array(ConstraintViolationSchema),
  evidenceWarnings: z.array(ConstraintEvidenceWarningSchema).default([]).optional(),
  findings: z.array(ConstraintFindingSchema).default([]).optional(),
  coverage: ConstraintCoverageReportSchema.optional()
});
