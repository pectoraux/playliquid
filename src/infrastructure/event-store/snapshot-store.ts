/**
 * Prisma Snapshot Store — persists aggregate snapshots for fast rehydration.
 */

import type { AggregateSnapshot } from '@/domain/shared/aggregate/aggregate-root';
import type { SnapshotStore } from '@/domain/shared/repository';
import { getClient } from '@/infrastructure/database/prisma';

export class PrismaSnapshotStore implements SnapshotStore {
  async save(snapshot: AggregateSnapshot): Promise<void> {
    const client = getClient();
    await client.snapshot.upsert({
      where: {
        streamId_version: {
          streamId: this.streamIdFor(snapshot.aggregateType, snapshot.aggregateId),
          version: snapshot.version,
        },
      },
      create: {
        streamId: this.streamIdFor(snapshot.aggregateType, snapshot.aggregateId),
        version: snapshot.version,
        aggregateType: snapshot.aggregateType,
        state: JSON.stringify(snapshot.state),
      },
      update: {
        state: JSON.stringify(snapshot.state),
      },
    });
  }

  async load(aggregateType: string, aggregateId: string): Promise<AggregateSnapshot | null> {
    const client = getClient();
    const record = await client.snapshot.findFirst({
      where: { streamId: this.streamIdFor(aggregateType, aggregateId) },
      orderBy: { version: 'desc' },
    });
    if (!record) return null;
    return {
      aggregateId,
      aggregateType,
      version: record.version,
      state: JSON.parse(record.state),
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.createdAt.toISOString(),
    };
  }

  private streamIdFor(aggregateType: string, aggregateId: string): string {
    return `${aggregateType.toLowerCase()}-${aggregateId}`;
  }
}
