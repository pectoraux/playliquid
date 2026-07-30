/**
 * Repository interfaces.
 *
 * Repositories belong to the domain layer — they define the contract for
 * loading and saving aggregates. Infrastructure provides the implementations.
 *
 * IMPORTANT: A domain repository MUST NOT expose persistence concerns (tables,
 * rows, SQL, Prisma). It deals only in aggregates and domain types.
 */

import type { AggregateRoot } from '@/domain/shared/aggregate/aggregate-root';
import type { AggregateSnapshot } from '@/domain/shared/aggregate/aggregate-root';
import type { DomainEvent } from '@/domain/shared/event/domain-event';

/** Marker interface for aggregate repository contracts. */
export interface Repository<TAggregate extends AggregateRoot> {
  /** Load an aggregate by id (rehydrated from the event stream). */
  getById(id: string): Promise<TAggregate | null>;

  /** Save an aggregate's uncommitted events. */
  save(aggregate: TAggregate, expectedVersion: number): Promise<void>;
}

/**
 * Event-sourced repository contract.
 *
 * This is the canonical repository for aggregates that participate in event
 * sourcing. It collaborates with the EventStore and SnapshotStore.
 */
export interface EventSourcedRepository<TAggregate extends AggregateRoot>
  extends Repository<TAggregate> {
  /** Load with an explicit expected version (for optimistic concurrency). */
  getByIdAtVersion(id: string, version: number): Promise<TAggregate | null>;

  /** Load using a snapshot if available, then replay remaining events. */
  getByIdWithSnapshot(id: string): Promise<TAggregate | null>;

  /** Check existence. */
  exists(id: string): Promise<boolean>;
}

/** Snapshot store contract. */
export interface SnapshotStore {
  save(snapshot: AggregateSnapshot): Promise<void>;
  load(aggregateType: string, aggregateId: string): Promise<AggregateSnapshot | null>;
}

/** Generic read-side repository for read models (not event-sourced). */
export interface ReadModelRepository<T> {
  findById(id: string): Promise<T | null>;
  save(model: T): Promise<void>;
  delete(id: string): Promise<void>;
}
