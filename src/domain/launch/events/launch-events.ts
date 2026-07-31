/**
 * Launch domain events.
 *
 * Events for beta cohort management, invitations, feedback, validation runs,
 * and ledger reconciliation reports.
 */

import { DomainEvent } from '@/domain/shared/event/domain-event';

// ─── Beta Cohort Events ────────────────────────────────────────────────────

export interface BetaCohortCreatedPayload {
  readonly cohortId: string;
  readonly name: string;
  readonly phase: 'alpha' | 'closed_beta' | 'open_beta';
  readonly maxParticipants: number;
  readonly createdById: string;
  readonly createdAt: string;
}

export class BetaCohortCreated extends DomainEvent<BetaCohortCreatedPayload> {}

export interface ParticipantInvitedPayload {
  readonly cohortId: string;
  readonly invitationId: string;
  readonly userId: string;
  readonly email: string;
  readonly role: 'player' | 'creator';
  readonly invitedBy: string;
  readonly invitedAt: string;
  readonly expiresAt: string;
}

export class ParticipantInvited extends DomainEvent<ParticipantInvitedPayload> {}

export interface InvitationAcceptedPayload {
  readonly invitationId: string;
  readonly cohortId: string;
  readonly userId: string;
  readonly acceptedAt: string;
}

export class InvitationAccepted extends DomainEvent<InvitationAcceptedPayload> {}

export interface InvitationRevokedPayload {
  readonly invitationId: string;
  readonly cohortId: string;
  readonly revokedBy: string;
  readonly reason: string;
  readonly revokedAt: string;
}

export class InvitationRevoked extends DomainEvent<InvitationRevokedPayload> {}

// ─── Feedback Events ───────────────────────────────────────────────────────

export interface FeedbackSubmittedPayload {
  readonly feedbackId: string;
  readonly cohortId: string;
  readonly userId: string;
  readonly category: 'bug' | 'feature_request' | 'experience' | 'performance' | 'other';
  readonly severity: 'low' | 'medium' | 'high' | 'critical';
  readonly title: string;
  readonly description: string;
  readonly submittedAt: string;
}

export class FeedbackSubmitted extends DomainEvent<FeedbackSubmittedPayload> {}

export interface FeedbackTriagedPayload {
  readonly feedbackId: string;
  readonly status: 'new' | 'triaged' | 'in_progress' | 'resolved' | 'wont_fix';
  readonly assignedTo: string;
  readonly triagedBy: string;
  readonly triagedAt: string;
  readonly notes: string;
}

export class FeedbackTriaged extends DomainEvent<FeedbackTriagedPayload> {}

// ─── Validation Run Events ─────────────────────────────────────────────────

export interface ValidationRunStartedPayload {
  readonly runId: string;
  readonly suite: string;
  readonly triggeredBy: string;
  readonly startedAt: string;
}

export class ValidationRunStarted extends DomainEvent<ValidationRunStartedPayload> {}

export interface ValidationRunCompletedPayload {
  readonly runId: string;
  readonly suite: string;
  readonly status: 'passed' | 'failed' | 'partial';
  readonly totalChecks: number;
  readonly passedChecks: number;
  readonly failedChecks: number;
  readonly durationMs: number;
  readonly completedAt: string;
  readonly report: Record<string, unknown>;
}

export class ValidationRunCompleted extends DomainEvent<ValidationRunCompletedPayload> {}

// ─── Reconciliation Events ─────────────────────────────────────────────────

export interface ReconciliationCompletedPayload {
  readonly reconciliationId: string;
  readonly period: string;
  readonly status: 'balanced' | 'discrepancy' | 'error';
  readonly expectedBalance: number;
  readonly actualBalance: number;
  readonly discrepancy: number;
  readonly totalTransactions: number;
  readonly matchedTransactions: number;
  readonly unmatchedTransactions: number;
  readonly completedAt: string;
}

export class ReconciliationCompleted extends DomainEvent<ReconciliationCompletedPayload> {}

// ─── Session Replay Events ─────────────────────────────────────────────────

export interface SessionRecordedPayload {
  readonly replayId: string;
  readonly sessionId: string;
  readonly userId: string;
  readonly cohortId: string;
  readonly durationSeconds: number;
  readonly eventCount: number;
  readonly recordedAt: string;
}

export class SessionRecorded extends DomainEvent<SessionRecordedPayload> {}

// ─── Bug Report Events ─────────────────────────────────────────────────────

export interface BugReportedPayload {
  readonly bugId: string;
  readonly title: string;
  readonly severity: 'low' | 'medium' | 'high' | 'critical';
  readonly category: string;
  readonly reportedBy: string;
  readonly cohortId: string;
  readonly reportedAt: string;
}

export class BugReported extends DomainEvent<BugReportedPayload> {}

export interface BugResolvedPayload {
  readonly bugId: string;
  readonly resolution: 'fixed' | 'wont_fix' | 'duplicate' | 'invalid';
  readonly resolvedBy: string;
  readonly resolvedAt: string;
}

export class BugResolved extends DomainEvent<BugResolvedPayload> {}
