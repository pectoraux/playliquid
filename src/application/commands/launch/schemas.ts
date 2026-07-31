/**
 * Zod schemas for all launch commands and queries.
 *
 * Each schema mirrors the corresponding command/query payload. The
 * composition root registers them with `registerCommandValidator` /
 * `registerQueryValidator` so the ValidationMiddleware enforces them
 * before the handler runs.
 *
 * Schemas are exported individually and aggregated in `LAUNCH_COMMAND_SCHEMAS`
 * / `LAUNCH_QUERY_SCHEMAS` for convenient bulk registration.
 */

import { z } from 'zod';

// ─── Beta Cohort Commands ───────────────────────────────────────────────────

export const CreateCohortSchema = z.object({
  name: z.string().min(1).max(200),
  phase: z.enum(['alpha', 'closed_beta', 'open_beta']),
  maxParticipants: z.number().int().min(1).max(100000),
  createdById: z.string().min(1),
});

export const InviteParticipantSchema = z.object({
  cohortId: z.string().min(1),
  userId: z.string().min(1),
  email: z.string().email().max(254),
  role: z.enum(['player', 'creator']),
  invitedBy: z.string().min(1),
  expiresAt: z.string().datetime(),
});

export const AcceptInvitationSchema = z.object({
  invitationId: z.string().min(1),
  userId: z.string().min(1),
});

export const RevokeInvitationSchema = z.object({
  invitationId: z.string().min(1),
  revokedBy: z.string().min(1),
  reason: z.string().min(1).max(1000),
});

// ─── Feedback Commands ──────────────────────────────────────────────────────

export const SubmitFeedbackSchema = z.object({
  cohortId: z.string().min(1),
  userId: z.string().min(1),
  category: z.enum(['bug', 'feature_request', 'experience', 'performance', 'other']),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(10000),
});

export const TriageFeedbackSchema = z.object({
  feedbackId: z.string().min(1),
  status: z.enum(['new', 'triaged', 'in_progress', 'resolved', 'wont_fix']),
  assignedTo: z.string().min(1),
  triagedBy: z.string().min(1),
  notes: z.string().max(2000).optional().default(''),
});

// ─── Validation Commands ────────────────────────────────────────────────────

export const StartValidationRunSchema = z.object({
  suite: z.string().min(1).max(100),
  triggeredBy: z.string().min(1),
});

export const CompleteValidationRunSchema = z.object({
  runId: z.string().min(1),
  status: z.enum(['running', 'passed', 'failed', 'partial']),
  totalChecks: z.number().int().min(0),
  passedChecks: z.number().int().min(0),
  failedChecks: z.number().int().min(0),
  durationMs: z.number().int().min(0),
  report: z.record(z.string(), z.unknown()),
});

// ─── Reconciliation Commands ────────────────────────────────────────────────

export const RunReconciliationSchema = z.object({
  period: z.string().min(1).max(100),
});

// ─── Bug Commands ───────────────────────────────────────────────────────────

export const ReportBugSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(10000),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  category: z.string().min(1).max(100),
  reportedBy: z.string().min(1),
  cohortId: z.string().min(1),
});

export const ResolveBugSchema = z.object({
  bugId: z.string().min(1),
  resolution: z.enum(['fixed', 'wont_fix', 'duplicate', 'invalid']),
  resolvedBy: z.string().min(1),
});

export const AssignBugSchema = z.object({
  bugId: z.string().min(1),
  assignedTo: z.string().min(1),
});

// ─── Performance Metric Commands ────────────────────────────────────────────

export const RecordMetricSchema = z.object({
  metric: z.string().min(1).max(200),
  value: z.number(),
  unit: z.string().min(1).max(50),
  threshold: z.number().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional().default({}),
});

// ─── Session Replay Commands ────────────────────────────────────────────────

export const RecordSessionSchema = z.object({
  sessionId: z.string().min(1),
  userId: z.string().min(1),
  cohortId: z.string().min(1),
  durationSeconds: z.number().int().min(0),
  eventCount: z.number().int().min(0),
  storageKey: z.string().min(1).max(500),
  metadata: z.record(z.string(), z.unknown()).optional().default({}),
});

// ─── Beta Cohort Queries ────────────────────────────────────────────────────

export const GetCohortSchema = z.object({
  cohortId: z.string().min(1),
});

export const ListCohortsSchema = z.object({
  phase: z.enum(['alpha', 'closed_beta', 'open_beta']).optional(),
  limit: z.number().int().min(1).max(100).optional().default(20),
  offset: z.number().int().min(0).optional().default(0),
});

export const GetCohortParticipantsSchema = z.object({
  cohortId: z.string().min(1),
  status: z.enum(['pending', 'accepted', 'revoked', 'expired']).optional(),
});

// ─── Feedback Queries ───────────────────────────────────────────────────────

export const ListFeedbackSchema = z.object({
  cohortId: z.string().optional(),
  category: z
    .enum(['bug', 'feature_request', 'experience', 'performance', 'other'])
    .optional(),
  severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  status: z
    .enum(['new', 'triaged', 'in_progress', 'resolved', 'wont_fix'])
    .optional(),
  limit: z.number().int().min(1).max(100).optional().default(20),
  offset: z.number().int().min(0).optional().default(0),
});

export const GetFeedbackStatsSchema = z.object({
  cohortId: z.string().min(1),
});

// ─── Validation Queries ─────────────────────────────────────────────────────

export const GetValidationRunSchema = z.object({
  runId: z.string().min(1),
});

export const ListValidationRunsSchema = z.object({
  limit: z.number().int().min(1).max(100).optional().default(20),
});

export const GetLatestValidationSchema = z.object({
  suite: z.string().min(1),
});

// ─── Reconciliation Queries ─────────────────────────────────────────────────

export const GetReconciliationSchema = z.object({
  reconciliationId: z.string().min(1),
});

export const ListReconciliationsSchema = z.object({
  limit: z.number().int().min(1).max(100).optional().default(20),
});

export const GetLatestReconciliationSchema = z.object({}).optional();

// ─── Bug Queries ────────────────────────────────────────────────────────────

export const ListBugsSchema = z.object({
  severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  status: z
    .enum(['open', 'in_progress', 'fixed', 'wont_fix', 'duplicate', 'invalid'])
    .optional(),
  cohortId: z.string().optional(),
  limit: z.number().int().min(1).max(100).optional().default(20),
  offset: z.number().int().min(0).optional().default(0),
});

export const GetBugStatsSchema = z.object({
  cohortId: z.string().optional(),
});

// ─── Performance Queries ────────────────────────────────────────────────────

export const GetPerformanceSummarySchema = z.object({}).optional();

export const ListMetricsSchema = z.object({
  metrics: z.array(z.string().min(1).max(200)).max(100).optional().default([]),
  limit: z.number().int().min(1).max(500).optional().default(50),
});

// ─── Session Replay Queries ─────────────────────────────────────────────────

export const ListSessionReplaysSchema = z.object({
  cohortId: z.string().optional(),
  userId: z.string().optional(),
  limit: z.number().int().min(1).max(100).optional().default(20),
  offset: z.number().int().min(0).optional().default(0),
});

// ─── Bulk Registration Map ──────────────────────────────────────────────────

/**
 * Map of command type → Zod schema. The composition root iterates this map
 * and calls `registerCommandValidator` for each entry.
 */
export const LAUNCH_COMMAND_SCHEMAS: ReadonlyArray<readonly [string, z.ZodType]> = [
  ['CreateCohort', CreateCohortSchema],
  ['InviteParticipant', InviteParticipantSchema],
  ['AcceptInvitation', AcceptInvitationSchema],
  ['RevokeInvitation', RevokeInvitationSchema],
  ['SubmitFeedback', SubmitFeedbackSchema],
  ['TriageFeedback', TriageFeedbackSchema],
  ['StartValidationRun', StartValidationRunSchema],
  ['CompleteValidationRun', CompleteValidationRunSchema],
  ['RunReconciliation', RunReconciliationSchema],
  ['ReportBug', ReportBugSchema],
  ['ResolveBug', ResolveBugSchema],
  ['AssignBug', AssignBugSchema],
  ['RecordMetric', RecordMetricSchema],
  ['RecordSession', RecordSessionSchema],
];

/**
 * Map of query type → Zod schema. The composition root iterates this map
 * and calls `registerQueryValidator` for each entry.
 */
export const LAUNCH_QUERY_SCHEMAS: ReadonlyArray<readonly [string, z.ZodType]> = [
  ['GetCohort', GetCohortSchema],
  ['ListCohorts', ListCohortsSchema],
  ['GetCohortParticipants', GetCohortParticipantsSchema],
  ['ListFeedback', ListFeedbackSchema],
  ['GetFeedbackStats', GetFeedbackStatsSchema],
  ['GetValidationRun', GetValidationRunSchema],
  ['ListValidationRuns', ListValidationRunsSchema],
  ['GetLatestValidation', GetLatestValidationSchema],
  ['GetReconciliation', GetReconciliationSchema],
  ['ListReconciliations', ListReconciliationsSchema],
  ['GetLatestReconciliation', GetLatestReconciliationSchema],
  ['ListBugs', ListBugsSchema],
  ['GetBugStats', GetBugStatsSchema],
  ['GetPerformanceSummary', GetPerformanceSummarySchema],
  ['ListMetrics', ListMetricsSchema],
  ['ListSessionReplays', ListSessionReplaysSchema],
];
