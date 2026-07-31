/**
 * Event Bus — publish/subscribe for domain events.
 *
 * The InMemoryEventBus is the reference implementation. The interface is
 * designed so that Redis, Kafka, RabbitMQ, or NATS can be swapped in without
 * changing application code.
 *
 * NOTE: In the PlayLiquid architecture, the OutboxPublisher reads from the
 * outbox table and publishes to the EventBus. Direct publishing from
 * handlers is intentionally avoided to guarantee at-least-once delivery.
 */

import type { EventBus, EventHandler } from '@/application/ports';
import type { SerializedEvent } from '@/domain/shared/event/domain-event';
import { logger } from '@/shared/logging';

export class InMemoryEventBus implements EventBus {
  private readonly handlers = new Map<string, Set<EventHandler>>();
  private readonly wildcardHandlers = new Set<EventHandler>();

  publish(event: SerializedEvent): Promise<void> {
    return this.publishMany([event]);
  }

  async publishMany(events: SerializedEvent[]): Promise<void> {
    for (const serialized of events) {
      const handlers = this.handlers.get(serialized.eventType);
      const allHandlers = [...(handlers ?? []), ...this.wildcardHandlers];

      for (const handler of allHandlers) {
        try {
          // Rehydrate for the handler so it receives a typed event.
          const { rehydrateEvent } = await import('@/domain/shared/event/event-registry');
          const event = rehydrateEvent(serialized);
          await handler(event);
        } catch (e) {
          logger.event().error('Event handler failed', {
            eventType: serialized.eventType,
            eventId: serialized.id,
          }, e);
        }
      }
    }
  }

  subscribe(eventType: string, handler: EventHandler): void {
    if (eventType === '*') {
      this.wildcardHandlers.add(handler);
      return;
    }
    let set = this.handlers.get(eventType);
    if (!set) {
      set = new Set();
      this.handlers.set(eventType, set);
    }
    set.add(handler);
  }

  unsubscribe(eventType: string, handler: EventHandler): void {
    if (eventType === '*') {
      this.wildcardHandlers.delete(handler);
      return;
    }
    this.handlers.get(eventType)?.delete(handler);
  }
}
