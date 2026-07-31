/**
 * Prisma-backed SessionReplayRepository — beta-test session recordings.
 *
 * Each replay stores a `storageKey` (the path in the configured
 * StorageProvider where the rrweb event stream lives) plus summary
 * metadata (duration, event count, recording timestamp). The full event
 * stream is fetched separately via the StorageProvider when a developer
 * hits "play" on a replay — only the summary lives in the database so
 * listings stay cheap.
 *
 * `list({ cohortId, userId, limit, offset })` supports the cohort dashboard
 * (most-recent replays for a cohort) and the user-debug view (all replays
 * for a specific tester).
 */

import type {
  SessionReplayRecord,
  SessionReplayRepository,
} from '@/domain/launch/repositories';
import { getClient } from '@/infrastructure/database/prisma';
import { logger } from '@/shared/logging';

interface SessionReplayRow {
  id: string;
  sessionId: string;
  userId: string;
  cohortId: string;
  durationSeconds: number;
  eventCount: number;
  recordedAt: string;
  storageKey: string;
  metadata: string;
}

function parseMetadata(raw: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    /* fall through */
  }
  return {};
}

function toRecord(r: SessionReplayRow): SessionReplayRecord {
  return {
    id: r.id,
    sessionId: r.sessionId,
    userId: r.userId,
    cohortId: r.cohortId,
    durationSeconds: r.durationSeconds,
    eventCount: r.eventCount,
    recordedAt: r.recordedAt,
    storageKey: r.storageKey,
    metadata: parseMetadata(r.metadata),
  };
}

export class PrismaSessionReplayRepository implements SessionReplayRepository {
  async save(record: SessionReplayRecord): Promise<void> {
    const client = getClient();
    await client.sessionReplay.upsert({
      where: { id: record.id },
      create: {
        id: record.id,
        sessionId: record.sessionId,
        userId: record.userId,
        cohortId: record.cohortId,
        durationSeconds: record.durationSeconds,
        eventCount: record.eventCount,
        recordedAt: record.recordedAt,
        storageKey: record.storageKey,
        metadata: JSON.stringify(record.metadata),
      },
      update: {
        sessionId: record.sessionId,
        userId: record.userId,
        cohortId: record.cohortId,
        durationSeconds: record.durationSeconds,
        eventCount: record.eventCount,
        recordedAt: record.recordedAt,
        storageKey: record.storageKey,
        metadata: JSON.stringify(record.metadata),
      },
    });
    logger.database().debug('Session replay saved', {
      replayId: record.id,
      sessionId: record.sessionId,
      cohortId: record.cohortId,
      eventCount: record.eventCount,
      durationSeconds: record.durationSeconds,
    });
  }

  async getById(id: string): Promise<SessionReplayRecord | null> {
    const client = getClient();
    const record = await client.sessionReplay.findUnique({ where: { id } });
    return record ? toRecord(record) : null;
  }

  async list(filters: {
    cohortId?: string;
    userId?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ items: SessionReplayRecord[]; total: number }> {
    const client = getClient();
    const where: Record<string, unknown> = {};
    if (filters.cohortId) where['cohortId'] = filters.cohortId;
    if (filters.userId) where['userId'] = filters.userId;

    const [records, total] = await Promise.all([
      client.sessionReplay.findMany({
        where,
        orderBy: { recordedAt: 'desc' },
        take: filters.limit ?? 50,
        skip: filters.offset ?? 0,
      }),
      client.sessionReplay.count({ where }),
    ]);

    return {
      items: records.map((r: SessionReplayRow) => toRecord(r)),
      total,
    };
  }
}
