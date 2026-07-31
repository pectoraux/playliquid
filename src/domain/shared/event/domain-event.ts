/**
 * Domain Event model.
 *
 * A domain event represents something that happened in the domain that domain
 * experts care about. Events are immutable, timestamped, and carry metadata
 * for correlation and causation tracing.
 */

import type { Metadata } from '@/shared/types';
import { eventId } from '@/shared/ids';

export interface DomainEventPayload {
  readonly [key: string]: unknown;
}

// Use a looser type for the constraint so concrete payload interfaces
// (which have specific readonly fields) are accepted.
export type AnyPayload = object;

export interface DomainEventMetadata {
  readonly correlationId?: string;
  readonly causationId?: string;
  readonly userId?: string;
  readonly source?: string;
  readonly [key: string]: unknown;
}

export abstract class DomainEvent<TPayload extends AnyPayload = AnyPayload> {
  readonly id: string;
  readonly aggregateId: string;
  readonly aggregateType: string;
  readonly aggregateVersion: number;
  readonly occurredAt: string;
  readonly correlationId: string;
  readonly causationId: string | undefined;
  readonly metadata: DomainEventMetadata;
  readonly payload: TPayload;

  constructor(params: {
    id?: string;
    aggregateId: string;
    aggregateType: string;
    aggregateVersion: number;
    occurredAt?: string;
    correlationId?: string;
    causationId?: string | null;
    metadata?: DomainEventMetadata;
    payload: TPayload;
  }) {
    this.id = params.id ?? eventId();
    this.aggregateId = params.aggregateId;
    this.aggregateType = params.aggregateType;
    this.aggregateVersion = params.aggregateVersion;
    this.occurredAt = params.occurredAt ?? new Date().toISOString();
    this.correlationId = params.correlationId ?? params.metadata?.correlationId ?? '';
    this.causationId = params.causationId ?? params.metadata?.causationId ?? undefined;
    this.metadata = {
      ...params.metadata,
      correlationId: this.correlationId,
      causationId: this.causationId,
    };
    this.payload = Object.freeze({ ...params.payload });
  }

  /** The event type name, used for registry / serialization. */
  get eventType(): string {
    return this.constructor.name;
  }

  /** Serialize for storage in the event store. */
  serialize(): SerializedEvent {
    return {
      id: this.id,
      eventType: this.eventType,
      aggregateId: this.aggregateId,
      aggregateType: this.aggregateType,
      aggregateVersion: this.aggregateVersion,
      occurredAt: this.occurredAt,
      correlationId: this.correlationId,
      causationId: this.causationId,
      metadata: this.metadata as Metadata,
      payload: this.payload as unknown as Metadata,
    };
  }

  toString(): string {
    return `${this.eventType}{aggregate=${this.aggregateId}, version=${this.aggregateVersion}}`;
  }
}

/** Serialized representation of a domain event (for storage). */
export interface SerializedEvent {
  readonly id: string;
  readonly eventType: string;
  readonly aggregateId: string;
  readonly aggregateType: string;
  readonly aggregateVersion: number;
  readonly occurredAt: string;
  readonly correlationId: string;
  readonly causationId: string | undefined;
  readonly metadata: Metadata;
  readonly payload: Metadata;
}
