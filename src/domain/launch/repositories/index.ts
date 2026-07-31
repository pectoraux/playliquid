/**
 * Launch domain repository interfaces.
 */

import type { BetaCohortAggregate } from '@/domain/launch/aggregates/beta-cohort-aggregate';

export interface BetaCohortRepository {
  getById(id: string): Promise<BetaCohortAggregate | null>;
  save(aggregate: BetaCohortAggregate, expectedVersion: number): Promise<void>;
  exists(id: string): Promise<boolean>;
}

/** Feedback record (not event-sourced — simple append-only). */
export interface FeedbackRecord {
  readonly id: string;
  readonly cohortId: string;
  readonly userId: string;
  readonly category: 'bug' | 'feature_request' | 'experience' | 'performance' | 'other';
  readonly severity: 'low' | 'medium' | 'high' | 'critical';
  readonly title: string;
  readonly description: string;
  readonly status: 'new' | 'triaged' | 'in_progress' | 'resolved' | 'wont_fix';
  readonly assignedTo: string | null;
  readonly triagedBy: string | null;
  readonly triagedAt: string | null;
  readonly triageNotes: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface FeedbackRepository {
  submit(record: Omit<FeedbackRecord, 'status' | 'assignedTo' | 'triagedBy' | 'triagedAt' | 'triageNotes' | 'updatedAt'>): Promise<void>;
  getById(id: string): Promise<FeedbackRecord | null>;
  list(filters: { cohortId?: string; category?: string; severity?: string; status?: string; limit?: number; offset?: number }): Promise<{ items: FeedbackRecord[]; total: number }>;
  triage(id: string, updates: { status: FeedbackRecord['status']; assignedTo: string; triagedBy: string; notes: string }): Promise<void>;
  countByStatus(cohortId: string): Promise<Record<string, number>>;
  countBySeverity(cohortId: string): Promise<Record<string, number>>;
}

/** Validation run record. */
export interface ValidationRunRecord {
  readonly id: string;
  readonly suite: string;
  readonly status: 'running' | 'passed' | 'failed' | 'partial';
  readonly totalChecks: number;
  readonly passedChecks: number;
  readonly failedChecks: number;
  readonly durationMs: number;
  readonly triggeredBy: string;
  readonly startedAt: string;
  readonly completedAt: string | null;
  readonly report: Record<string, unknown>;
}

export interface ValidationRunRepository {
  start(record: Omit<ValidationRunRecord, 'status' | 'totalChecks' | 'passedChecks' | 'failedChecks' | 'durationMs' | 'completedAt' | 'report'>): Promise<void>;
  complete(id: string, result: { status: ValidationRunRecord['status']; totalChecks: number; passedChecks: number; failedChecks: number; durationMs: number; report: Record<string, unknown> }): Promise<void>;
  getById(id: string): Promise<ValidationRunRecord | null>;
  list(limit: number): Promise<ValidationRunRecord[]>;
  getLatest(suite: string): Promise<ValidationRunRecord | null>;
}

/** Reconciliation report record. */
export interface ReconciliationRecord {
  readonly id: string;
  readonly period: string;
  readonly status: 'balanced' | 'discrepancy' | 'error';
  readonly expectedBalance: number;
  readonly actualBalance: number;
  readonly discrepancy: number;
  readonly totalTransactions: number;
  readonly matchedTransactions: number;
  readonly unmatchedTransactions: number;
  readonly completedAt: string;
  readonly details: Record<string, unknown>;
}

export interface ReconciliationRepository {
  save(record: ReconciliationRecord): Promise<void>;
  getById(id: string): Promise<ReconciliationRecord | null>;
  list(limit: number): Promise<ReconciliationRecord[]>;
  getLatest(): Promise<ReconciliationRecord | null>;
}

/** Session replay record. */
export interface SessionReplayRecord {
  readonly id: string;
  readonly sessionId: string;
  readonly userId: string;
  readonly cohortId: string;
  readonly durationSeconds: number;
  readonly eventCount: number;
  readonly recordedAt: string;
  readonly storageKey: string;
  readonly metadata: Record<string, unknown>;
}

export interface SessionReplayRepository {
  save(record: SessionReplayRecord): Promise<void>;
  getById(id: string): Promise<SessionReplayRecord | null>;
  list(filters: { cohortId?: string; userId?: string; limit?: number; offset?: number }): Promise<{ items: SessionReplayRecord[]; total: number }>;
}

/** Bug report record. */
export interface BugRecord {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly severity: 'low' | 'medium' | 'high' | 'critical';
  readonly category: string;
  readonly status: 'open' | 'in_progress' | 'fixed' | 'wont_fix' | 'duplicate' | 'invalid';
  readonly reportedBy: string;
  readonly cohortId: string;
  readonly assignedTo: string | null;
  readonly resolvedBy: string | null;
  readonly resolvedAt: string | null;
  readonly resolution: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface BugRepository {
  report(record: Omit<BugRecord, 'status' | 'assignedTo' | 'resolvedBy' | 'resolvedAt' | 'resolution' | 'updatedAt'>): Promise<void>;
  getById(id: string): Promise<BugRecord | null>;
  list(filters: { severity?: string; status?: string; cohortId?: string; limit?: number; offset?: number }): Promise<{ items: BugRecord[]; total: number }>;
  resolve(id: string, resolution: BugRecord['resolution'], resolvedBy: string): Promise<void>;
  assign(id: string, assignedTo: string): Promise<void>;
  countBySeverity(cohortId?: string): Promise<Record<string, number>>;
  countByStatus(cohortId?: string): Promise<Record<string, number>>;
}

/** Performance metric record. */
export interface PerformanceMetricRecord {
  readonly id: string;
  readonly metric: string;
  readonly value: number;
  readonly unit: string;
  readonly threshold: number | null;
  readonly status: 'ok' | 'warning' | 'critical';
  readonly timestamp: string;
  readonly metadata: Record<string, unknown>;
}

export interface PerformanceMetricRepository {
  record(metric: Omit<PerformanceMetricRecord, 'id' | 'status'>): Promise<void>;
  getLatest(metric: string): Promise<PerformanceMetricRecord | null>;
  list(metrics: string[], limit: number): Promise<PerformanceMetricRecord[]>;
  getSummary(): Promise<Record<string, { value: number; status: string; threshold: number | null }>>;
}
