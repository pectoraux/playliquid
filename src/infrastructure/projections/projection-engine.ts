/**
 * Projection Engine — replays domain events into materialized read models.
 *
 * A Projector subscribes to specific event types and updates read models
 * accordingly. The ProjectionEngine polls the event store, dispatches events
 * to registered projectors, and tracks checkpoints so that replay is
 * idempotent and resumable.
 *
 * Supports:
 *   - rebuild(): reset all read models and replay from the beginning
 *   - replay(fromPosition): replay from a specific position
 *   - reset(): clear read models and checkpoints
 */

import type { DomainEvent } from '@/domain/shared/event/domain-event';
import type { SerializedEvent } from '@/domain/shared/event/domain-event';
import type { EventStore } from '@/application/ports';
import { rehydrateEvent } from '@/domain/shared/event/event-registry';
import { getClient } from '@/infrastructure/database/prisma';
import { getConfig } from '@/shared/config';
import { logger } from '@/shared/logging';
import { sleep } from '@/shared/utils';

/** A projector transforms domain events into read model updates. */
export abstract class Projector {
  abstract readonly name: string;
  abstract readonly handledEventTypes: readonly string[];

  /** Handle a single event. Must be idempotent. */
  abstract handle(event: DomainEvent): Promise<void>;

  /** Reset this projector's read models (for rebuild). */
  abstract reset(): Promise<void>;
}

/** Checkpoint manager — tracks the last processed event position per projector. */
export class CheckpointStore {
  async get(projectionName: string): Promise<number> {
    const client = getClient();
    const record = await client.projectionCheckpoint.findUnique({
      where: { projectionName },
    });
    return record?.lastEventRowId ?? 0;
  }

  async save(projectionName: string, lastEventRowId: number, lastEventId: string | null): Promise<void> {
    const client = getClient();
    await client.projectionCheckpoint.upsert({
      where: { projectionName },
      create: { projectionName, lastEventRowId, lastEventId },
      update: { lastEventRowId, lastEventId },
    });
  }

  async reset(projectionName: string): Promise<void> {
    const client = getClient();
    await client.projectionCheckpoint.delete({
      where: { projectionName },
    }).catch(() => {});
  }
}

/** The projection engine coordinates event polling and projector dispatch. */
export class ProjectionEngine {
  private readonly projectors: Projector[] = [];
  private readonly projectorByEventType = new Map<string, Projector[]>();
  private running = false;
  private readonly pollIntervalMs: number;
  private readonly batchSize: number;

  constructor(
    private readonly eventStore: EventStore,
    private readonly checkpointStore: CheckpointStore,
  ) {
    const config = getConfig();
    this.pollIntervalMs = config.projections.pollIntervalMs;
    this.batchSize = config.projections.batchSize;
  }

  register(projector: Projector): void {
    this.projectors.push(projector);
    for (const eventType of projector.handledEventTypes) {
      const list = this.projectorByEventType.get(eventType) ?? [];
      list.push(projector);
      this.projectorByEventType.set(eventType, list);
    }
    logger.projection().info('Projector registered', {
      name: projector.name,
      eventTypes: projector.handledEventTypes,
    });
  }

  /** Start the polling loop. */
  start(): void {
    if (this.running) return;
    this.running = true;
    logger.worker().info('Projection engine started', {
      pollIntervalMs: this.pollIntervalMs,
      batchSize: this.batchSize,
      projectors: this.projectors.map((p) => p.name),
    });
    this.loop();
  }

  stop(): void {
    this.running = false;
    logger.worker().info('Projection engine stopped');
  }

  /** Process one batch of events for all projectors. */
  async processBatch(): Promise<number> {
    let totalProcessed = 0;

    for (const projector of this.projectors) {
      const checkpoint = await this.checkpointStore.get(projector.name);
      const { events, nextRowId } = await this.eventStore.replay(checkpoint, this.batchSize);

      if (events.length === 0) continue;

      let processed = 0;
      let lastEventId: string | null = null;
      for (const serialized of events) {
        const projectors = this.projectorByEventType.get(serialized.eventType) ?? [];
        if (!projectors.includes(projector)) {
          processed++;
          lastEventId = serialized.id;
          continue;
        }
        try {
          const event = rehydrateEvent(serialized);
          await projector.handle(event);
          processed++;
          lastEventId = serialized.id;
        } catch (e) {
          logger.projection().error('Projection failed', {
            projector: projector.name,
            eventType: serialized.eventType,
            eventId: serialized.id,
          }, e);
          // Stop processing this projector on error — will retry next cycle.
          break;
        }
      }

      if (processed > 0) {
        await this.checkpointStore.save(projector.name, nextRowId, lastEventId);
        totalProcessed += processed;
      }
    }

    return totalProcessed;
  }

  /** Rebuild all read models: reset and replay from the beginning. */
  async rebuild(): Promise<void> {
    logger.projection().info('Starting full rebuild', {
      projectors: this.projectors.map((p) => p.name),
    });

    for (const projector of this.projectors) {
      await projector.reset();
      await this.checkpointStore.reset(projector.name);
    }

    let totalEvents = 0;
    for (const projector of this.projectors) {
      let position = 0;
      while (true) {
        const { events, nextRowId } = await this.eventStore.replay(position, this.batchSize);
        if (events.length === 0) break;
        for (const serialized of events) {
          const projectors = this.projectorByEventType.get(serialized.eventType) ?? [];
          if (!projectors.includes(projector)) continue;
          const event = rehydrateEvent(serialized);
          await projector.handle(event);
        }
        position = nextRowId;
        totalEvents += events.length;
        if (events.length < this.batchSize) break;
      }
      // Set checkpoint to the latest position.
      await this.checkpointStore.save(projector.name, position, null);
    }

    logger.projection().info('Full rebuild complete', { totalEvents });
  }

  /** Replay from a specific position. */
  async replay(fromRowId: number): Promise<void> {
    let position = fromRowId;
    while (true) {
      const { events, nextRowId } = await this.eventStore.replay(position, this.batchSize);
      if (events.length === 0) break;
      for (const serialized of events) {
        const projectors = this.projectorByEventType.get(serialized.eventType) ?? [];
        const event = rehydrateEvent(serialized);
        for (const p of projectors) {
          await p.handle(event);
        }
      }
      position = nextRowId;
      if (events.length < this.batchSize) break;
    }
  }

  /** Reset all projectors and checkpoints. */
  async reset(): Promise<void> {
    for (const projector of this.projectors) {
      await projector.reset();
      await this.checkpointStore.reset(projector.name);
    }
    logger.projection().info('All projections reset');
  }

  private async loop(): Promise<void> {
    while (this.running) {
      try {
        await this.processBatch();
      } catch (e) {
        logger.worker().error('Projection loop error', {}, e);
      }
      await sleep(this.pollIntervalMs);
    }
  }
}
