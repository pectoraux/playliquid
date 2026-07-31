/**
 * AggregateRoot base class.
 *
 * The aggregate root is the entry point to a consistency boundary. It is the
 * only object that external code may hold a reference to. It enforces
 * invariants, raises domain events, and supports event-sourced rehydration.
 *
 * Event sourcing protocol:
 *   1. Command handler loads the aggregate from the EventStore (replay or snapshot).
 *   2. Command handler invokes a domain method that mutates state + raises events.
 *   3. Command handler pulls uncommitted events and appends them to the EventStore.
 *   4. Events are written to the Outbox within the same transaction.
 */

import { DomainEvent, type DomainEventMetadata, type AnyPayload } from '@/domain/shared/event/domain-event';
import { ConcurrencyError } from '@/domain/shared/errors';

export interface AggregateSnapshot {
  readonly aggregateId: string;
  readonly aggregateType: string;
  readonly version: number;
  readonly state: Record<string, unknown>;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export abstract class AggregateRoot<TId = string> {
  readonly id: TId;
  protected _version: number = 0;
  protected _createdAt: string = new Date().toISOString();
  protected _updatedAt: string = new Date().toISOString();
  private readonly _uncommittedEvents: DomainEvent[] = [];

  constructor(id: TId) {
    this.id = id;
  }

  /** The current version of the aggregate (monotonically increasing). */
  get version(): number {
    return this._version;
  }

  /** When the aggregate was first created. */
  get createdAt(): string {
    return this._createdAt;
  }

  /** When the aggregate was last modified. */
  get updatedAt(): string {
    return this._updatedAt;
  }

  /** The aggregate type name (used for stream naming). */
  get aggregateType(): string {
    return this.constructor.name;
  }

  /** Raise a domain event and apply it to the current state. */
  protected raiseEvent<TPayload extends AnyPayload>(
    eventType: new (params: {
      aggregateId: string;
      aggregateType: string;
      aggregateVersion: number;
      payload: TPayload;
      occurredAt?: string;
      correlationId?: string;
      causationId?: string | null;
      metadata?: DomainEventMetadata;
    }) => DomainEvent<TPayload>,
    payload: TPayload,
    metadata?: DomainEventMetadata,
  ): void {
    const event = new eventType({
      aggregateId: String(this.id),
      aggregateType: this.aggregateType,
      aggregateVersion: this._version + 1,
      payload,
      occurredAt: new Date().toISOString(),
      metadata,
    });
    this.applyEvent(event);
    this._uncommittedEvents.push(event);
  }

  /** Apply an event to mutate state (used during rehydration and raising). */
  applyEvent(event: DomainEvent): void {
    this._version = event.aggregateVersion;
    this._updatedAt = event.occurredAt;
    if (this._version === 1) {
      this._createdAt = event.occurredAt;
    }
    const handler = this.resolveHandler(event);
    handler.call(this, event);
  }

  /** Pull uncommitted events (for persistence). */
  pullEvents(): DomainEvent[] {
    return [...this._uncommittedEvents];
  }

  /** Clear uncommitted events (after successful persistence). */
  clearEvents(): void {
    this._uncommittedEvents.length = 0;
  }

  /** Rehydrate the aggregate from a stream of events. */
  rehydrate(events: DomainEvent[]): void {
    if (events.length === 0) return;
    // Sort by version to ensure correct order
    const sorted = [...events].sort((a, b) => a.aggregateVersion - b.aggregateVersion);
    for (const event of sorted) {
      this.applyEvent(event);
    }
  }

  /** Create a snapshot of the current state for fast rehydration. */
  snapshot(): AggregateSnapshot {
    return {
      aggregateId: String(this.id),
      aggregateType: this.aggregateType,
      version: this._version,
      state: this.toSnapshotState(),
      createdAt: this._createdAt,
      updatedAt: this._updatedAt,
    };
  }

  /** Restore from a snapshot. */
  restoreFromSnapshot(snapshot: AggregateSnapshot): void {
    this._version = snapshot.version;
    this._createdAt = snapshot.createdAt;
    this._updatedAt = snapshot.updatedAt;
    this.fromSnapshotState(snapshot.state);
  }

  /** Mark the aggregate as new (version 0, no events). */
  protected markNew(): void {
    this._version = 0;
  }

  /** Enforce the expected version for optimistic concurrency. */
  assertVersion(expectedVersion: number): void {
    if (this._version !== expectedVersion) {
      throw new ConcurrencyError(
        `Expected version ${expectedVersion} but aggregate is at version ${this._version}`,
        expectedVersion,
        this._version,
      );
    }
  }

  /** Validate aggregate invariants. Throws on violation. */
  abstract validate(): void;

  /** Serialize internal state for snapshotting. */
  protected abstract toSnapshotState(): Record<string, unknown>;

  /** Restore internal state from a snapshot. */
  protected abstract fromSnapshotState(state: Record<string, unknown>): void;

  /** Resolve the apply handler method for an event type. */
  private resolveHandler(event: DomainEvent): (event: DomainEvent) => void {
    const eventName = event.eventType;
    const handlerName = `apply${eventName}`;
    const handler = (this as unknown as Record<string, unknown>)[handlerName];
    if (typeof handler !== 'function') {
      throw new Error(
        `Aggregate ${this.aggregateType} has no handler "${handlerName}" for event ${eventName}`,
      );
    }
    return handler as (event: DomainEvent) => void;
  }
}
