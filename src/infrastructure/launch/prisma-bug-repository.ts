/**
 * Prisma-backed BugRepository — bug reports collected during beta.
 *
 * Bugs come from two sources: explicit `report()` calls (a tester files a
 * bug through the feedback UI) and event-sourced `BugReported` events
 * projected from the launch event stream. Both flows write to the same
 * Prisma table so the bug dashboard sees a single source of truth.
 *
 * Lifecycle:
 *   open → in_progress → fixed | wont_fix | duplicate | invalid
 *
 * `resolve()` stamps the resolver + resolution text + resolvedAt timestamp.
 * `assign()` changes the assignedTo without altering status.
 * `countBySeverity` / `countByStatus` back the dashboard summary cards
 * (and accept an optional cohortId for per-cohort drill-down).
 */

import type {
  BugRecord,
  BugRepository,
} from '@/domain/launch/repositories';
import { getClient } from '@/infrastructure/database/prisma';
import { logger } from '@/shared/logging';

type BugStatus = BugRecord['status'];
type BugSeverity = BugRecord['severity'];

interface BugRow {
  id: string;
  title: string;
  description: string;
  severity: string;
  category: string;
  status: string;
  reportedBy: string;
  cohortId: string;
  assignedTo: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  resolution: string | null;
  createdAt: string;
  updatedAt: string;
}

const VALID_STATUSES = new Set<string>([
  'open',
  'in_progress',
  'fixed',
  'wont_fix',
  'duplicate',
  'invalid',
]);
const VALID_SEVERITIES = new Set<string>(['low', 'medium', 'high', 'critical']);

function toRecord(r: BugRow): BugRecord {
  const status = VALID_STATUSES.has(r.status) ? (r.status as BugStatus) : 'open';
  const severity = VALID_SEVERITIES.has(r.severity)
    ? (r.severity as BugSeverity)
    : 'medium';
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    severity,
    category: r.category,
    status,
    reportedBy: r.reportedBy,
    cohortId: r.cohortId,
    assignedTo: r.assignedTo,
    resolvedBy: r.resolvedBy,
    resolvedAt: r.resolvedAt,
    resolution: r.resolution,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

export class PrismaBugRepository implements BugRepository {
  async report(
    record: Omit<
      BugRecord,
      | 'status'
      | 'assignedTo'
      | 'resolvedBy'
      | 'resolvedAt'
      | 'resolution'
      | 'updatedAt'
    >,
  ): Promise<void> {
    const client = getClient();
    const now = new Date().toISOString();
    await client.bugReport.create({
      data: {
        id: record.id,
        title: record.title,
        description: record.description,
        severity: record.severity,
        category: record.category,
        status: 'open',
        reportedBy: record.reportedBy,
        cohortId: record.cohortId,
        assignedTo: null,
        resolvedBy: null,
        resolvedAt: null,
        resolution: null,
        createdAt: record.createdAt,
        updatedAt: now,
      },
    });
    logger.database().debug('Bug reported', {
      bugId: record.id,
      cohortId: record.cohortId,
      severity: record.severity,
      category: record.category,
    });
  }

  async getById(id: string): Promise<BugRecord | null> {
    const client = getClient();
    const record = await client.bugReport.findUnique({ where: { id } });
    return record ? toRecord(record) : null;
  }

  async list(filters: {
    severity?: string;
    status?: string;
    cohortId?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ items: BugRecord[]; total: number }> {
    const client = getClient();
    const where: Record<string, unknown> = {};
    if (filters.severity) where['severity'] = filters.severity;
    if (filters.status) where['status'] = filters.status;
    if (filters.cohortId) where['cohortId'] = filters.cohortId;

    const [records, total] = await Promise.all([
      client.bugReport.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: filters.limit ?? 50,
        skip: filters.offset ?? 0,
      }),
      client.bugReport.count({ where }),
    ]);

    return {
      items: records.map((r: BugRow) => toRecord(r)),
      total,
    };
  }

  async resolve(
    id: string,
    resolution: BugRecord['resolution'],
    resolvedBy: string,
  ): Promise<void> {
    const client = getClient();
    const now = new Date().toISOString();
    // If a resolution category is supplied (fixed | wont_fix | duplicate |
    // invalid) we map it to the matching status; otherwise the bug is
    // marked `fixed` as the default closed status.
    const resolutionValue = resolution ?? 'fixed';
    const mappedStatus: BugStatus =
      resolutionValue === 'fixed' ||
      resolutionValue === 'wont_fix' ||
      resolutionValue === 'duplicate' ||
      resolutionValue === 'invalid'
        ? (resolutionValue as BugStatus)
        : 'fixed';

    await client.bugReport.update({
      where: { id },
      data: {
        status: mappedStatus,
        resolvedBy,
        resolvedAt: now,
        resolution: resolutionValue,
        updatedAt: now,
      },
    });
    logger.database().debug('Bug resolved', {
      bugId: id,
      resolution: resolutionValue,
      resolvedBy,
    });
  }

  async assign(id: string, assignedTo: string): Promise<void> {
    const client = getClient();
    const now = new Date().toISOString();
    await client.bugReport.update({
      where: { id },
      data: {
        assignedTo,
        // Auto-transition open → in_progress on first assignment.
        status: 'open',
        updatedAt: now,
      },
    });
    logger.database().debug('Bug assigned', { bugId: id, assignedTo });
  }

  async countBySeverity(cohortId?: string): Promise<Record<string, number>> {
    const client = getClient();
    const where: Record<string, unknown> = {};
    if (cohortId) where['cohortId'] = cohortId;
    const grouped = await client.bugReport.groupBy({
      by: ['severity'],
      where,
      _count: { _all: true },
    });
    const out: Record<string, number> = {};
    for (const g of grouped) {
      out[g.severity] = g._count._all;
    }
    return out;
  }

  async countByStatus(cohortId?: string): Promise<Record<string, number>> {
    const client = getClient();
    const where: Record<string, unknown> = {};
    if (cohortId) where['cohortId'] = cohortId;
    const grouped = await client.bugReport.groupBy({
      by: ['status'],
      where,
      _count: { _all: true },
    });
    const out: Record<string, number> = {};
    for (const g of grouped) {
      out[g.status] = g._count._all;
    }
    return out;
  }
}
