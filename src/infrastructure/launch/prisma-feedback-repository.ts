/**
 * Prisma-backed FeedbackRepository — beta-cohort feedback pipeline.
 *
 * Feedback is a CRUD-only record (NOT event-sourced — the `FeedbackSubmitted`
 * / `FeedbackTriaged` events exist for audit and projection purposes, but
 * the canonical read/write surface is this Prisma table). Submitted feedback
 * starts as `status='new'`; triage moves it to `triaged`, `in_progress`,
 * `resolved`, or `wont_fix` and stamps the triager + notes.
 *
 * Aggregations (`countByStatus`, `countBySeverity`) back the cohort
 * dashboard widgets so admins can see the feedback backlog at a glance.
 */

import type {
  FeedbackRecord,
  FeedbackRepository,
} from '@/domain/launch/repositories';
import { getClient } from '@/infrastructure/database/prisma';
import { logger } from '@/shared/logging';

type FeedbackStatus = FeedbackRecord['status'];
type FeedbackSeverity = FeedbackRecord['severity'];
type FeedbackCategory = FeedbackRecord['category'];

interface FeedbackRow {
  id: string;
  cohortId: string;
  userId: string;
  category: string;
  severity: string;
  title: string;
  description: string;
  status: string;
  assignedTo: string | null;
  triagedBy: string | null;
  triagedAt: string | null;
  triageNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

const VALID_STATUSES = new Set<string>([
  'new',
  'triaged',
  'in_progress',
  'resolved',
  'wont_fix',
]);

const VALID_SEVERITIES = new Set<string>(['low', 'medium', 'high', 'critical']);
const VALID_CATEGORIES = new Set<string>([
  'bug',
  'feature_request',
  'experience',
  'performance',
  'other',
]);

function toRecord(r: FeedbackRow): FeedbackRecord {
  const status = VALID_STATUSES.has(r.status) ? (r.status as FeedbackStatus) : 'new';
  const severity = VALID_SEVERITIES.has(r.severity)
    ? (r.severity as FeedbackSeverity)
    : 'medium';
  const category = VALID_CATEGORIES.has(r.category)
    ? (r.category as FeedbackCategory)
    : 'other';
  return {
    id: r.id,
    cohortId: r.cohortId,
    userId: r.userId,
    category,
    severity,
    title: r.title,
    description: r.description,
    status,
    assignedTo: r.assignedTo,
    triagedBy: r.triagedBy,
    triagedAt: r.triagedAt,
    triageNotes: r.triageNotes,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

export class PrismaFeedbackRepository implements FeedbackRepository {
  async submit(
    record: Omit<
      FeedbackRecord,
      | 'status'
      | 'assignedTo'
      | 'triagedBy'
      | 'triagedAt'
      | 'triageNotes'
      | 'updatedAt'
    >,
  ): Promise<void> {
    const client = getClient();
    const now = new Date().toISOString();
    await client.feedbackRecord.create({
      data: {
        id: record.id,
        cohortId: record.cohortId,
        userId: record.userId,
        category: record.category,
        severity: record.severity,
        title: record.title,
        description: record.description,
        status: 'new',
        assignedTo: null,
        triagedBy: null,
        triagedAt: null,
        triageNotes: null,
        createdAt: record.createdAt,
        updatedAt: now,
      },
    });
    logger.database().debug('Feedback submitted', {
      feedbackId: record.id,
      cohortId: record.cohortId,
      category: record.category,
      severity: record.severity,
    });
  }

  async getById(id: string): Promise<FeedbackRecord | null> {
    const client = getClient();
    const record = await client.feedbackRecord.findUnique({ where: { id } });
    return record ? toRecord(record) : null;
  }

  async list(filters: {
    cohortId?: string;
    category?: string;
    severity?: string;
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ items: FeedbackRecord[]; total: number }> {
    const client = getClient();
    const where: Record<string, unknown> = {};
    if (filters.cohortId) where['cohortId'] = filters.cohortId;
    if (filters.category) where['category'] = filters.category;
    if (filters.severity) where['severity'] = filters.severity;
    if (filters.status) where['status'] = filters.status;

    const [records, total] = await Promise.all([
      client.feedbackRecord.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: filters.limit ?? 50,
        skip: filters.offset ?? 0,
      }),
      client.feedbackRecord.count({ where }),
    ]);

    return {
      items: records.map((r: FeedbackRow) => toRecord(r)),
      total,
    };
  }

  async triage(
    id: string,
    updates: {
      status: FeedbackRecord['status'];
      assignedTo: string;
      triagedBy: string;
      notes: string;
    },
  ): Promise<void> {
    const client = getClient();
    const now = new Date().toISOString();
    await client.feedbackRecord.update({
      where: { id },
      data: {
        status: updates.status,
        assignedTo: updates.assignedTo,
        triagedBy: updates.triagedBy,
        triagedAt: now,
        triageNotes: updates.notes,
        updatedAt: now,
      },
    });
    logger.database().debug('Feedback triaged', {
      feedbackId: id,
      status: updates.status,
      assignedTo: updates.assignedTo,
      triagedBy: updates.triagedBy,
    });
  }

  async countByStatus(cohortId: string): Promise<Record<string, number>> {
    const client = getClient();
    const grouped = await client.feedbackRecord.groupBy({
      by: ['status'],
      where: { cohortId },
      _count: { _all: true },
    });
    const out: Record<string, number> = {};
    for (const g of grouped) {
      out[g.status] = g._count._all;
    }
    return out;
  }

  async countBySeverity(cohortId: string): Promise<Record<string, number>> {
    const client = getClient();
    const grouped = await client.feedbackRecord.groupBy({
      by: ['severity'],
      where: { cohortId },
      _count: { _all: true },
    });
    const out: Record<string, number> = {};
    for (const g of grouped) {
      out[g.severity] = g._count._all;
    }
    return out;
  }
}
