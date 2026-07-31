/**
 * Prisma Idempotency Store — persists command results for deduplication.
 */

import type { IdempotencyRecord, IdempotencyStore } from '@/application/pipelines/idempotency-store';
import { getClient } from '@/infrastructure/database/prisma';

export class PrismaIdempotencyStore implements IdempotencyStore {
  async get(key: string): Promise<IdempotencyRecord | null> {
    const client = getClient();
    const record = await client.idempotencyRecord.findUnique({ where: { key } });
    if (!record) return null;
    if (new Date(record.expiresAt) < new Date()) {
      await client.idempotencyRecord.delete({ where: { key } }).catch(() => {});
      return null;
    }
    return {
      key: record.key,
      result: JSON.parse(record.result),
      expiresAt: record.expiresAt.toISOString(),
    };
  }

  async set(key: string, result: unknown, ttlSeconds: number): Promise<void> {
    const client = getClient();
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    await client.idempotencyRecord.upsert({
      where: { key },
      create: {
        key,
        result: JSON.stringify(result),
        expiresAt,
      },
      update: {
        result: JSON.stringify(result),
        expiresAt,
      },
    });
  }

  async delete(key: string): Promise<void> {
    const client = getClient();
    await client.idempotencyRecord.delete({ where: { key } }).catch(() => {});
  }

  /** Purge expired records (housekeeping). */
  async purgeExpired(): Promise<number> {
    const client = getClient();
    const result = await client.idempotencyRecord.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    return result.count;
  }
}
