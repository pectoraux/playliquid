/**
 * Event-sourced repository base.
 *
 * Combines the EventStore and SnapshotStore to load and save aggregates.
 * Concrete domain repositories extend this base, providing the aggregate
 * factory function.
 *
 * Loading strategy:
 *   1. Try to load the latest snapshot.
 *   2. If a snapshot exists, restore the aggregate from it and replay only
 *      the events after the snapshot version.
 *   3. If no snapshot, replay the entire event stream.
 *
 * Saving strategy:
 *   1. Pull uncommitted events from the aggregate.
 *   2. Append them to the event store with optimistic concurrency.
 *   3. Write them to the outbox within the same transaction.
 *   4. Periodically save a snapshot (every N events).
 */

import type { AggregateRoot } from '@/domain/shared/aggregate/aggregate-root';
import type { DomainEvent } from '@/domain/shared/event/domain-event';
import type { SerializedEvent } from '@/domain/shared/event/domain-event';
import type { EventStore, OutboxRepository } from '@/application/ports';
import type { SnapshotStore } from '@/domain/shared/repository';
import { rehydrateEvent } from '@/domain/shared/event/event-registry';
import { getClient } from '@/infrastructure/database/prisma';
import { streamId as makeStreamId } from '@/shared/ids';
import { getConfig } from '@/shared/config';
import { logger } from '@/shared/logging';

export abstract class EventSourcedRepositoryBase<TAggregate extends AggregateRoot> {
  protected constructor(
    private readonly eventStore: EventStore,
    private readonly snapshotStore: SnapshotStore | null,
    private readonly outbox: OutboxRepository | null,
    private readonly aggregateType: string,
    private readonly snapshotEvery: number = getConfig().eventStore.snapshotEvery,
  ) {}

  /** Subclasses provide the factory that creates an empty aggregate instance. */
  protected abstract createAggregate(id: string): TAggregate;

  async getById(id: string): Promise<TAggregate | null> {
    return this.getByIdWithSnapshot(id);
  }

  async getByIdWithSnapshot(id: string): Promise<TAggregate | null> {
    const streamIdValue = makeStreamId(this.aggregateType, id);
    const aggregate = this.createAggregate(id);

    // Try snapshot first.
    if (this.snapshotStore) {
      const snapshot = await this.snapshotStore.load(this.aggregateType, id);
      if (snapshot) {
        aggregate.restoreFromSnapshot(snapshot);
        const events = await this.eventStore.loadFromVersion(streamIdValue, snapshot.version);
        if (events.length === 0 && snapshot.version === 0) return null;
        aggregate.rehydrate(events.map((e) => rehydrateEvent(e)));
        return aggregate;
      }
    }

    // No snapshot — replay full stream.
    const events = await this.eventStore.load(streamIdValue);
    if (events.length === 0) return null;
    aggregate.rehydrate(events.map((e) => rehydrateEvent(e)));
    return aggregate;
  }

  async getByIdAtVersion(id: string, version: number): Promise<TAggregate | null> {
    const streamIdValue = makeStreamId(this.aggregateType, id);
    const aggregate = this.createAggregate(id);
    const events = await this.eventStore.loadFromVersion(streamIdValue, 0);
    const filtered = events.filter((e) => e.aggregateVersion <= version);
    if (filtered.length === 0) return null;
    aggregate.rehydrate(filtered.map((e) => rehydrateEvent(e)));
    return aggregate;
  }

  async exists(id: string): Promise<boolean> {
    const streamIdValue = makeStreamId(this.aggregateType, id);
    return this.eventStore.exists(streamIdValue);
  }

  async save(aggregate: TAggregate, expectedVersion: number): Promise<void> {
    const events = aggregate.pullEvents();
    if (events.length === 0) return;

    // The expected version is the stream version BEFORE these events are appended.
    // If the aggregate was just created (version = events.length), the stream
    // version is 0. If loaded from store (version = loadedVersion + events.length),
    // the stream version is loadedVersion = aggregate.version - events.length.
    const streamVersion = aggregate.version - events.length;

    // Append events + write to outbox in the same transaction.
    await this.eventStore.append(events, streamVersion);

    if (this.outbox) {
      await this.outbox.appendMany(events.map((e) => e.serialize()));
    }

    // Save snapshot if threshold reached.
    if (this.snapshotStore && aggregate.version % this.snapshotEvery === 0 && aggregate.version > 0) {
      await this.snapshotStore.save(aggregate.snapshot());
      logger.database().debug('Snapshot saved', {
        aggregateType: this.aggregateType,
        aggregateId: String(aggregate.id),
        version: aggregate.version,
      });
    }

    aggregate.clearEvents();
  }
}
