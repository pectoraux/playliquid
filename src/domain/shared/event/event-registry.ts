/**
 * Domain Event Registry.
 *
 * Maps event type names to constructor functions so that serialized events
 * can be rehydrated back into typed DomainEvent instances. Every concrete
 * event class MUST be registered at startup.
 */

import { DomainEvent, type DomainEventPayload, type SerializedEvent } from './domain-event';
import { ConfigurationError } from '@/domain/shared/errors';

type EventConstructor<TPayload extends DomainEventPayload = DomainEventPayload> =
  new (params: {
    id?: string;
    aggregateId: string;
    aggregateType: string;
    aggregateVersion: number;
    occurredAt?: string;
    correlationId?: string;
    causationId?: string | null;
    metadata?: Record<string, unknown>;
    payload: TPayload;
  }) => DomainEvent<TPayload>;

const registry = new Map<string, EventConstructor<any>>();
const typeByName = new Map<string, string>();

/** Register an event class. */
export function registerEvent<TPayload extends DomainEventPayload>(
  eventType: string,
  constructor: EventConstructor<TPayload>,
): void {
  if (registry.has(eventType)) {
    throw new ConfigurationError(`Event type "${eventType}" is already registered`);
  }
  registry.set(eventType, constructor);
  typeByName.set(constructor.name, eventType);
}

/** Look up an event constructor by its registered type name. */
export function getEventConstructor(eventType: string): EventConstructor {
  const ctor = registry.get(eventType);
  if (!ctor) {
    throw new ConfigurationError(`Unknown event type: ${eventType}`);
  }
  return ctor;
}

/** Rehydrate a serialized event back into a typed DomainEvent. */
export function rehydrateEvent(serialized: SerializedEvent): DomainEvent {
  const ctor = getEventConstructor(serialized.eventType);
  return new ctor({
    id: serialized.id,
    aggregateId: serialized.aggregateId,
    aggregateType: serialized.aggregateType,
    aggregateVersion: serialized.aggregateVersion,
    occurredAt: serialized.occurredAt,
    correlationId: serialized.correlationId,
    causationId: serialized.causationId,
    metadata: serialized.metadata,
    payload: serialized.payload as any,
  });
}

/** List all registered event types. */
export function getRegisteredEventTypes(): string[] {
  return Array.from(registry.keys());
}

/** Check if an event type is registered. */
export function isRegisteredEventType(eventType: string): boolean {
  return registry.has(eventType);
}

/** Clear the registry (for testing). */
export function clearEventRegistry(): void {
  registry.clear();
  typeByName.clear();
}
