/**
 * Prisma-backed AuditLogRepository — append-only audit trail.
 *
 * Audit entries are NEVER updated or deleted. The `append` method is the only
 * write surface; `list`/`listByActor`/`listByTarget` are read-only. The
 * underlying Prisma model does not expose update/delete through this repository.
 *
 * `metadata` is JSON-encoded (SQLite has no native JSON column type, but Prisma
 * treats it as a String). The repository round-trips it through JSON.parse /
 * JSON.stringify so callers see a structured object.
 */

import type {
  AuditLogEntry,
  AuditLogFilters,
  AuditLogRepository,
} from '@/domain/identity/repositories';
import { getClient } from '@/infrastructure/database/prisma';
import { logger } from '@/shared/logging';

interface AuditLogRecord {
  id: string;
  action: string;
  actorId: string;
  actorType: string;
  targetType: string;
  targetId: string;
  timestamp: string;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: string;
  correlationId: string | null;
  createdAt: Date;
}

function toEntry(r: AuditLogRecord): AuditLogEntry {
  let metadata: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(r.metadata);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      metadata = parsed as Record<string, unknown>;
    }
  } catch {
    metadata = {};
  }
  return {
    id: r.id,
    action: r.action,
    actorId: r.actorId,
    actorType: r.actorType as AuditLogEntry['actorType'],
    targetType: r.targetType,
    targetId: r.targetId,
    timestamp: r.timestamp,
    ipAddress: r.ipAddress,
    userAgent: r.userAgent,
    metadata,
    correlationId: r.correlationId,
  };
}

export class PrismaAuditLogRepository implements AuditLogRepository {
  async append(entry: AuditLogEntry): Promise<void> {
    const client = getClient();
    await client.auditLog.create({
      data: {
        id: entry.id,
        action: entry.action,
        actorId: entry.actorId,
        actorType: entry.actorType,
        targetType: entry.targetType,
        targetId: entry.targetId,
        timestamp: entry.timestamp,
        ipAddress: entry.ipAddress,
        userAgent: entry.userAgent,
        metadata: JSON.stringify(entry.metadata),
        correlationId: entry.correlationId,
      },
    });
    logger.database().debug('Audit entry appended', {
      auditId: entry.id,
      action: entry.action,
      actorId: entry.actorId,
    });
  }

  async getById(id: string): Promise<AuditLogEntry | null> {
    const client = getClient();
    const record = await client.auditLog.findUnique({ where: { id } });
    return record ? toEntry(record) : null;
  }

  async list(filters: AuditLogFilters): Promise<AuditLogEntry[]> {
    const client = getClient();
    const where: Record<string, unknown> = {};
    if (filters.actorId) where['actorId'] = filters.actorId;
    if (filters.targetType) where['targetType'] = filters.targetType;
    if (filters.targetId) where['targetId'] = filters.targetId;
    if (filters.action) where['action'] = filters.action;
    if (filters.fromTimestamp || filters.toTimestamp) {
      const ts: Record<string, unknown> = {};
      if (filters.fromTimestamp) ts['gte'] = filters.fromTimestamp;
      if (filters.toTimestamp) ts['lte'] = filters.toTimestamp;
      where['timestamp'] = ts;
    }

    const records = await client.auditLog.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: filters.limit ?? 100,
      skip: filters.offset ?? 0,
    });
    return records.map(toEntry);
  }

  async listByActor(actorId: string, limit: number): Promise<AuditLogEntry[]> {
    const client = getClient();
    const records = await client.auditLog.findMany({
      where: { actorId },
      orderBy: { timestamp: 'desc' },
      take: limit,
    });
    return records.map(toEntry);
  }

  async listByTarget(
    targetType: string,
    targetId: string,
    limit: number,
  ): Promise<AuditLogEntry[]> {
    const client = getClient();
    const records = await client.auditLog.findMany({
      where: { targetType, targetId },
      orderBy: { timestamp: 'desc' },
      take: limit,
    });
    return records.map(toEntry);
  }
}
