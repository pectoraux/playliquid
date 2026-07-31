/**
 * Event Store — append-only, optimistic concurrency, versioned streams.
 *
 * This is the canonical persistence mechanism for aggregates. Each aggregate
 * has a stream identified by `${aggregateType}-${aggregateId}`. Events are
 * appended with an expected version; if the current version doesn't match,
 * a ConcurrencyError is raised (optimistic concurrency control).
 *
 * Snapshots are supported to speed up rehydration: instead of replaying the
 * entire event stream, the aggregate is restored from the latest snapshot and
 * then only the events after the snapshot version are replayed.
 *
 * All operations participate in the active Unit of Work transaction (if any)
 * via the transaction context.
 */

import type { DomainEvent } from '@/domain/shared/event/domain-event';
import type { SerializedEvent } from '@/domain/shared/event/domain-event';
import type { EventStore } from '@/application/ports';
import type { SnapshotStore } from '@/domain/shared/repository';
import { ConcurrencyError, InfrastructureError } from '@/domain/shared/errors';
import { getClient } from '@/infrastructure/database/prisma';
import { streamId as makeStreamId } from '@/shared/ids';
import { logger } from '@/shared/logging';

export class PrismaEventStore implements EventStore {
  constructor(private readonly snapshotStore?: SnapshotStore) {}

  async append(events: DomainEvent[], expectedVersion: number): Promise<void> {
    if (events.length === 0) return;
    const streamIdValue = makeStreamId(events[0].aggregateType, events[0].aggregateId);
    const serialized = events.map((e) => e.serialize());
    await this.appendMany(streamIdValue, serialized, expectedVersion);
  }

  async appendMany(streamIdValue: string, events: SerializedEvent[], expectedVersion: number): Promise<void> {
    if (events.length === 0) return;
    const client = getClient();

    // Verify expected version (optimistic concurrency).
    const currentVersion = await this.loadVersion(streamIdValue);
    if (currentVersion !== expectedVersion) {
      throw new ConcurrencyError(
        `Stream ${streamIdValue}: expected version ${expectedVersion} but found ${currentVersion}`,
        expectedVersion,
        currentVersion,
      );
    }

    // Insert events. The unique constraint on (streamId, streamVersion)
    // provides a second line of defense against concurrent appends.
    try {
      await client.eventRecord.createMany({
        data: events.map((e) => ({
          eventId: e.id,
          streamId: streamIdValue,
          streamVersion: e.aggregateVersion,
          eventType: e.eventType,
          aggregateId: e.aggregateId,
          aggregateType: e.aggregateType,
          aggregateVersion: e.aggregateVersion,
          payload: JSON.stringify(e.payload),
          metadata: JSON.stringify(e.metadata),
          occurredAt: e.occurredAt,
          correlationId: e.correlationId || null,
          causationId: e.causationId || null,
        })),
      });
    } catch (e: any) {
      if (e?.code === 'P2002') {
        // Unique constraint violation — concurrent append.
        throw new ConcurrencyError(
          `Concurrent append detected on stream ${streamIdValue}`,
          expectedVersion,
          currentVersion,
        );
      }
      throw new InfrastructureError(
        `Failed to append events to stream ${streamIdValue}: ${e?.message ?? 'unknown error'}`,
        'EVENT_STORE_APPEND_FAILED',
      );
    }

    logger.event().debug('Events appended', {
      streamId: streamIdValue,
      count: events.length,
      fromVersion: expectedVersion + 1,
      toVersion: expectedVersion + events.length,
    });
  }

  async load(streamIdValue: string): Promise<SerializedEvent[]> {
    return this.loadFromVersion(streamIdValue, 0);
  }

  async loadFromVersion(streamIdValue: string, fromVersion: number): Promise<SerializedEvent[]> {
    const client = getClient();
    const records = await client.eventRecord.findMany({
      where: {
        streamId: streamIdValue,
        streamVersion: { gt: fromVersion },
      },
      orderBy: { streamVersion: 'asc' },
    });

    return records.map((r) => this.deserialize(r));
  }

  async loadVersion(streamIdValue: string): Promise<number> {
    const client = getClient();
    const latest = await client.eventRecord.findFirst({
      where: { streamId: streamIdValue },
      orderBy: { streamVersion: 'desc' },
      select: { streamVersion: true },
    });
    return latest?.streamVersion ?? 0;
  }

  async replay(fromRowId: number, limit: number): Promise<{ events: SerializedEvent[]; nextRowId: number }> {
    const client = getClient();
    const records = await client.eventRecord.findMany({
      where: { id: { gt: fromRowId } },
      orderBy: { id: 'asc' },
      take: limit,
    });

    const events = records.map((r) => this.deserialize(r));
    const nextRowId = records.length > 0 ? records[records.length - 1].id : fromRowId;

    return { events, nextRowId };
  }

  async exists(streamIdValue: string): Promise<boolean> {
    const client = getClient();
    const count = await client.eventRecord.count({ where: { streamId: streamIdValue } });
    return count > 0;
  }

  private deserialize(r: {
    eventId: string;
    streamId: string;
    streamVersion: number;
    eventType: string;
    aggregateId: string;
    aggregateType: string;
    aggregateVersion: number;
    payload: string;
    metadata: string;
    occurredAt: string;
    correlationId: string | null;
    causationId: string | null;
  }): SerializedEvent {
    return {
      id: r.eventId,
      eventType: r.eventType,
      aggregateId: r.aggregateId,
      aggregateType: r.aggregateType,
      aggregateVersion: r.aggregateVersion,
      occurredAt: r.occurredAt,
      correlationId: r.correlationId ?? '',
      causationId: r.causationId ?? undefined,
      metadata: JSON.parse(r.metadata),
      payload: JSON.parse(r.payload),
    };
  }
}
