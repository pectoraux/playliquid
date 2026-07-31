/**
 * Outbox — transactional outbox pattern for reliable event publishing.
 *
 * Domain events are written to the OutboxMessage table in the SAME database
 * transaction as the event store append. A separate worker polls the outbox
 * and publishes messages to the EventBus. This guarantees at-least-once
 * delivery even if the EventBus is temporarily unavailable.
 *
 * Status flow: pending → published | failed
 */

import type { SerializedEvent } from '@/domain/shared/event/domain-event';
import type { EventBus, OutboxRepository as IOutboxRepository } from '@/application/ports';
import { getClient } from '@/infrastructure/database/prisma';
import { getConfig } from '@/shared/config';
import { logger } from '@/shared/logging';
import { sleep } from '@/shared/utils';

export interface OutboxMessage {
  readonly id: string;
  readonly eventId: string;
  readonly eventType: string;
  readonly payload: string;
  readonly headers: string;
  readonly status: 'pending' | 'published' | 'failed';
  readonly retryCount: number;
  readonly error: string | null;
  readonly publishedAt: Date | null;
  readonly createdAt: Date;
}

export class OutboxRepository implements IOutboxRepository {
  async append(event: SerializedEvent): Promise<void> {
    return this.appendMany([event]);
  }

  async appendMany(events: SerializedEvent[]): Promise<void> {
    if (events.length === 0) return;
    const client = getClient();
    await client.outboxMessage.createMany({
      data: events.map((e) => ({
        eventId: e.id,
        eventType: e.eventType,
        payload: JSON.stringify(e.payload),
        headers: JSON.stringify({
          aggregateId: e.aggregateId,
          aggregateType: e.aggregateType,
          aggregateVersion: e.aggregateVersion,
          occurredAt: e.occurredAt,
          correlationId: e.correlationId,
          causationId: e.causationId,
          metadata: e.metadata,
        }),
        status: 'pending',
        maxRetries: getConfig().outbox.maxRetries,
      })),
    });
  }

  async getPending(limit: number): Promise<OutboxMessage[]> {
    const client = getClient();
    const records = await client.outboxMessage.findMany({
      where: { status: 'pending' },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
    return records.map((r) => this.toModel(r));
  }

  async markPublished(eventId: string): Promise<void> {
    const client = getClient();
    await client.outboxMessage.update({
      where: { eventId },
      data: { status: 'published', publishedAt: new Date() },
    });
  }

  async markFailed(eventId: string, error: string): Promise<void> {
    const client = getClient();
    const existing = await client.outboxMessage.findUnique({ where: { eventId } });
    if (!existing) return;
    const retryCount = existing.retryCount + 1;
    const status = retryCount >= existing.maxRetries ? 'failed' : 'pending';
    await client.outboxMessage.update({
      where: { eventId },
      data: { status, retryCount, error },
    });
  }

  async countByStatus(): Promise<{ pending: number; published: number; failed: number }> {
    const client = getClient();
    const [pending, published, failed] = await Promise.all([
      client.outboxMessage.count({ where: { status: 'pending' } }),
      client.outboxMessage.count({ where: { status: 'published' } }),
      client.outboxMessage.count({ where: { status: 'failed' } }),
    ]);
    return { pending, published, failed };
  }

  private toModel(r: any): OutboxMessage {
    return {
      id: r.id,
      eventId: r.eventId,
      eventType: r.eventType,
      payload: r.payload,
      headers: r.headers,
      status: r.status,
      retryCount: r.retryCount,
      error: r.error,
      publishedAt: r.publishedAt,
      createdAt: r.createdAt,
    };
  }
}

/**
 * Outbox Publisher — background worker that polls the outbox and publishes
 * pending messages to the EventBus.
 */
export class OutboxPublisher {
  private running = false;
  private readonly pollIntervalMs: number;
  private readonly batchSize: number;

  constructor(
    private readonly outbox: OutboxRepository,
    private readonly eventBus: EventBus,
  ) {
    const config = getConfig();
    this.pollIntervalMs = config.outbox.pollIntervalMs;
    this.batchSize = config.outbox.batchSize;
  }

  /** Start the polling loop. */
  start(): void {
    if (this.running) return;
    this.running = true;
    logger.worker().info('Outbox publisher started', {
      pollIntervalMs: this.pollIntervalMs,
      batchSize: this.batchSize,
    });
    this.loop();
  }

  stop(): void {
    this.running = false;
    logger.worker().info('Outbox publisher stopped');
  }

  /** Process a single batch (for testing or manual triggers). */
  async processBatch(): Promise<number> {
    const messages = await this.outbox.getPending(this.batchSize);
    if (messages.length === 0) return 0;

    let published = 0;
    for (const msg of messages) {
      try {
        const serialized = this.parseMessage(msg);
        await this.eventBus.publish(serialized);
        await this.outbox.markPublished(msg.eventId);
        published++;
      } catch (e: any) {
        await this.outbox.markFailed(msg.eventId, e?.message ?? 'unknown error');
        logger.worker().error('Outbox publish failed', { eventId: msg.eventId }, e);
      }
    }

    if (published > 0) {
      logger.worker().debug('Outbox batch processed', { published, total: messages.length });
    }
    return published;
  }

  private async loop(): Promise<void> {
    while (this.running) {
      try {
        await this.processBatch();
      } catch (e) {
        logger.worker().error('Outbox loop error', {}, e);
      }
      await sleep(this.pollIntervalMs);
    }
  }

  private parseMessage(msg: OutboxMessage): SerializedEvent {
    const headers = JSON.parse(msg.headers);
    return {
      id: msg.eventId,
      eventType: msg.eventType,
      aggregateId: headers.aggregateId,
      aggregateType: headers.aggregateType,
      aggregateVersion: headers.aggregateVersion,
      occurredAt: headers.occurredAt,
      correlationId: headers.correlationId ?? '',
      causationId: headers.causationId ?? null,
      metadata: headers.metadata ?? {},
      payload: JSON.parse(msg.payload),
    };
  }
}
