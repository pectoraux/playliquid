/**
 * Concrete workers — thin adapters that wrap existing infrastructure services
 * in the `BaseWorker` lifecycle (polling, health metrics, graceful shutdown,
 * concurrency).
 *
 * Each worker:
 *   - Delegates the actual work to an existing service (OutboxPublisher,
 *     ProjectionEngine, IdempotencyStore, EventStore)
 *   - Has a configurable poll interval (defaults pulled from `getConfig()`)
 *   - Tracks per-batch health metrics via the inherited `WorkerMetrics`
 *   - Catches per-batch errors so a single failure never crashes the worker
 *   - Supports a concurrency option (max concurrent batches in flight)
 *
 * Workers are wired into the DI container via the `WORKER_TOKENS` exported
 * at the bottom of this file. The composition root registers them with a
 * `WorkerRegistry` and starts them via `registry.startAll()`.
 */

import type { EventStore } from '@/application/ports';
import type { IdempotencyStore } from '@/application/pipelines/idempotency-store';
import type { OutboxPublisher } from '@/infrastructure/outbox/outbox';
import type { ProjectionEngine } from '@/infrastructure/projections/projection-engine';
import type { WorkerOptions } from '@/infrastructure/workers/worker-framework';
import { getClient } from '@/infrastructure/database/prisma';
import { getConfig } from '@/shared/config';
import { logger } from '@/shared/logging';
import { BaseWorker } from '@/infrastructure/workers/worker-framework';

// ─── OutboxWorker ────────────────────────────────────────────────────────

/**
 * Polls the transactional outbox and publishes pending messages to the
 * EventBus. Wraps `OutboxPublisher.processBatch`.
 *
 * Guarantees at-least-once delivery: a message is only marked `published`
 * after the EventBus publish call resolves successfully.
 */
export class OutboxWorker extends BaseWorker {
  readonly name = 'OutboxWorker';

  constructor(
    private readonly publisher: OutboxPublisher,
    options: WorkerOptions = {},
  ) {
    super(options);
  }

  protected defaultPollIntervalMs(): number {
    return getConfig().outbox.pollIntervalMs;
  }

  protected async processBatch(): Promise<number> {
    return this.publisher.processBatch();
  }
}

// ─── ProjectionWorker ─────────────────────────────────────────────────────

/**
 * Polls the event store and dispatches events to registered projectors,
 * advancing per-projector checkpoints. Wraps `ProjectionEngine.processBatch`.
 *
 * Because projectors are idempotent, this worker can safely run with
 * concurrency > 1 if the underlying projectors support parallel execution
 * (by default we keep concurrency = 1 to preserve ordering).
 */
export class ProjectionWorker extends BaseWorker {
  readonly name = 'ProjectionWorker';

  constructor(
    private readonly engine: ProjectionEngine,
    options: WorkerOptions = {},
  ) {
    super(options);
  }

  protected defaultPollIntervalMs(): number {
    return getConfig().projections.pollIntervalMs;
  }

  protected async processBatch(): Promise<number> {
    return this.engine.processBatch();
  }
}

// ─── CleanupWorker ────────────────────────────────────────────────────────

/** Options for the cleanup worker. */
export interface CleanupWorkerOptions extends WorkerOptions {
  /** Age (ms) after which published outbox messages are purged. Default: 7 days. */
  publishedOutboxRetentionMs?: number;
  /** Age (ms) after which failed outbox messages are purged. Default: 30 days. */
  failedOutboxRetentionMs?: number;
}

/**
 * Periodically purges:
 *   - Expired idempotency records (delegates to `IdempotencyStore.purgeExpired`
 *     when available; otherwise no-ops).
 *   - Old `published` outbox messages past the retention window.
 *   - Old `failed` outbox messages past the retention window.
 *
 * Runs at a longer interval than the outbox/projection workers (default
 * 5 minutes) since cleanup is non-urgent.
 */
export class CleanupWorker extends BaseWorker {
  readonly name = 'CleanupWorker';

  private readonly publishedOutboxRetentionMs: number;
  private readonly failedOutboxRetentionMs: number;

  constructor(
    private readonly idempotencyStore: IdempotencyStore & {
      purgeExpired?: () => Promise<number>;
    },
    options: CleanupWorkerOptions = {},
  ) {
    super(options);
    this.publishedOutboxRetentionMs = options.publishedOutboxRetentionMs ?? 7 * 24 * 60 * 60 * 1000;
    this.failedOutboxRetentionMs = options.failedOutboxRetentionMs ?? 30 * 24 * 60 * 60 * 1000;
  }

  protected defaultPollIntervalMs(): number {
    // Cleanup is non-urgent: default to 5 minutes.
    return 5 * 60 * 1000;
  }

  protected async processBatch(): Promise<number> {
    let purged = 0;

    // 1. Expired idempotency records.
    if (typeof this.idempotencyStore.purgeExpired === 'function') {
      try {
        purged += await this.idempotencyStore.purgeExpired();
      } catch (e: unknown) {
        // purgeExpired is best-effort; log and continue with outbox cleanup.
        logger.worker().warn('Idempotency purge failed', {
          worker: this.name,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    // 2. Old published outbox messages.
    const now = Date.now();
    const publishedCutoff = new Date(now - this.publishedOutboxRetentionMs);
    const failedCutoff = new Date(now - this.failedOutboxRetentionMs);
    const client = getClient();

    const publishedResult = await client.outboxMessage.deleteMany({
      where: { status: 'published', publishedAt: { lt: publishedCutoff } },
    });
    purged += publishedResult.count;

    // 3. Old failed outbox messages (past their retention window).
    const failedResult = await client.outboxMessage.deleteMany({
      where: { status: 'failed', updatedAt: { lt: failedCutoff } },
    });
    purged += failedResult.count;

    if (purged > 0) {
      logger.worker().info('Cleanup batch complete', {
        worker: this.name,
        purged,
        publishedPurged: publishedResult.count,
        failedPurged: failedResult.count,
      });
    }

    return purged;
  }
}

// ─── AnalyticsWorker ──────────────────────────────────────────────────────

/**
 * Aggregates statistics from the event stream. This is a placeholder that
 * counts events by type and maintains a running in-memory tally. Future
 * milestones will replace the in-memory tally with a proper analytics sink
 * (warehouse, time-series DB, etc.).
 *
 * The worker uses a checkpoint (`lastRowId`) so it never re-counts an event
 * across restarts — the tally is rebuilt from the event store on each start.
 */
export class AnalyticsWorker extends BaseWorker {
  readonly name = 'AnalyticsWorker';

  private lastRowId = 0;
  private readonly countsByEventType = new Map<string, number>();
  private readonly batchSize: number;

  constructor(
    private readonly eventStore: EventStore,
    options: WorkerOptions = {},
  ) {
    super(options);
    this.batchSize = getConfig().projections.batchSize;
  }

  protected defaultPollIntervalMs(): number {
    // Analytics is non-urgent: default to 30 seconds.
    return 30 * 1000;
  }

  protected async processBatch(): Promise<number> {
    const { events, nextRowId } = await this.eventStore.replay(this.lastRowId, this.batchSize);
    if (events.length === 0) return 0;

    for (const event of events) {
      const current = this.countsByEventType.get(event.eventType) ?? 0;
      this.countsByEventType.set(event.eventType, current + 1);
    }
    this.lastRowId = nextRowId;

    logger.worker().debug('Analytics batch aggregated', {
      worker: this.name,
      processed: events.length,
      lastRowId: this.lastRowId,
      distinctEventTypes: this.countsByEventType.size,
    });

    return events.length;
  }

  /** Read-only snapshot of the running tally (for /api/workers/analytics). */
  getEventCounts(): Record<string, number> {
    const result: Record<string, number> = {};
    for (const [eventType, count] of this.countsByEventType) {
      result[eventType] = count;
    }
    return result;
  }

  /** Total events observed since worker start. */
  getTotalEvents(): number {
    let total = 0;
    for (const count of this.countsByEventType.values()) {
      total += count;
    }
    return total;
  }
}

// ─── DI Tokens ────────────────────────────────────────────────────────────

/**
 * String tokens for the worker framework. Bind these in the composition root
 * so workers can be resolved and registered with the `WorkerRegistry`.
 */
export const WORKER_TOKENS = {
  WorkerRegistry: 'WorkerRegistry',
  OutboxWorker: 'OutboxWorker',
  ProjectionWorker: 'ProjectionWorker',
  CleanupWorker: 'CleanupWorker',
  AnalyticsWorker: 'AnalyticsWorker',
} as const;
