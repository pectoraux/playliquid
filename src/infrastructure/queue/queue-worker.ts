/**
 * Queue Worker
 *
 * Polls a message queue, dispatches messages to registered handlers, and
 * manages the full retry lifecycle:
 *
 *   1. Each message is processed with the withRetry framework for short-term
 *      transient retries (within a single delivery).
 *   2. If all short-term retries are exhausted, the message is nacked with
 *      exponential backoff for a delayed retry across deliveries.
 *   3. When a message's attempt count reaches maxAttempts, or the DLQ
 *      classifies it as poison, the message is routed to the Dead Letter Queue
 *      and acked out of the main queue.
 *
 * Features:
 *   - Configurable concurrency (process N messages simultaneously)
 *   - Graceful shutdown (stops accepting new work, waits for in-flight)
 *   - Error history tracking per message (for poison detection)
 */

import type {
  MessageConsumer,
  MessageQueue,
  QueueMessage,
} from '@/infrastructure/queue/message-queue';
import { ERROR_HISTORY_HEADER } from '@/infrastructure/queue/message-queue';
import type { DeadLetterQueue, DlqErrorEntry } from '@/infrastructure/queue/dead-letter-queue';
import { DEFAULT_DLQ_TTL_MS } from '@/infrastructure/queue/dead-letter-queue';
import { withRetry } from '@/infrastructure/retry/retry';
import { logger } from '@/shared/logging';
import { sleep } from '@/shared/utils';

// ─── Public Interfaces ────────────────────────────────────────────────────

export interface QueueWorkerOptions {
  /** Max number of messages processed concurrently (default: 1). */
  concurrency?: number;
  /** Short-term retries within a single delivery (default: 3). */
  maxRetries?: number;
  /** Base delay for exponential backoff in ms (default: 100). */
  baseDelayMs?: number;
  /** Max delay for exponential backoff in ms (default: 5000). */
  maxDelayMs?: number;
  /** Graceful shutdown timeout in ms (default: 30000). */
  shutdownTimeoutMs?: number;
}

export interface QueueHandlerRegistration<T = unknown> {
  queue: string;
  handler: MessageConsumer<T>;
}

// ─── Constants ────────────────────────────────────────────────────────────

/** Max error-history entries retained per message. */
const MAX_ERROR_HISTORY_ENTRIES = 10;

/** Default graceful shutdown timeout. */
const DEFAULT_SHUTDOWN_TIMEOUT_MS = 30_000;

// ─── QueueWorker ──────────────────────────────────────────────────────────

export class QueueWorker {
  private running = false;
  private readonly concurrency: number;
  private readonly maxRetries: number;
  private readonly baseDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly shutdownTimeoutMs: number;
  private activeCount = 0;
  private readonly registrations: QueueHandlerRegistration[] = [];
  /** Per-message error history (in-memory; would use Redis in multi-instance). */
  private readonly errorHistory = new Map<string, DlqErrorEntry[]>();

  constructor(
    private readonly mq: MessageQueue,
    private readonly dlq: DeadLetterQueue,
    options: QueueWorkerOptions = {},
  ) {
    this.concurrency = options.concurrency ?? 1;
    this.maxRetries = options.maxRetries ?? 3;
    this.baseDelayMs = options.baseDelayMs ?? 100;
    this.maxDelayMs = options.maxDelayMs ?? 5000;
    this.shutdownTimeoutMs = options.shutdownTimeoutMs ?? DEFAULT_SHUTDOWN_TIMEOUT_MS;
  }

  /**
   * Register a handler for a queue. Must be called before start().
   * Multiple handlers can be registered for different queues.
   */
  register<T>(queue: string, handler: MessageConsumer<T>): void {
    this.registrations.push({ queue, handler: handler as MessageConsumer });
  }

  /** Start the worker: registers wrapped consumers with the message queue. */
  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    for (const reg of this.registrations) {
      await this.mq.consume(reg.queue, this.wrapHandler(reg));
    }

    logger.worker().info('Queue worker started', {
      concurrency: this.concurrency,
      maxRetries: this.maxRetries,
      queues: this.registrations.map((r) => r.queue),
    });
  }

  /**
   * Graceful shutdown: stop accepting new work and wait for in-flight messages
   * to finish (up to shutdownTimeoutMs).
   */
  async stop(): Promise<void> {
    this.running = false;

    const start = Date.now();
    while (this.activeCount > 0 && Date.now() - start < this.shutdownTimeoutMs) {
      await sleep(100);
    }

    if (this.activeCount > 0) {
      logger.worker().warn('Queue worker stopped with in-flight messages', {
        activeCount: this.activeCount,
      });
    } else {
      logger.worker().info('Queue worker stopped gracefully');
    }
  }

  /** Returns the number of currently in-flight messages. */
  getActiveCount(): number {
    return this.activeCount;
  }

  // ─── Private Methods ───────────────────────────────────────────────────

  private wrapHandler(reg: QueueHandlerRegistration): MessageConsumer {
    return async (message: QueueMessage) => {
      if (!this.running) {
        // Worker is stopping — re-queue for later processing.
        await this.mq.nack(reg.queue, message.id, { requeue: true, delayMs: 1000 });
        return;
      }

      // Restore any previously tracked error history for this message.
      this.restoreErrorHistory(message);

      // Concurrency limiter (simple semaphore).
      await this.acquireSlot();
      try {
        await this.processMessage(reg, message);
      } finally {
        this.releaseSlot();
      }
    };
  }

  private async processMessage(
    reg: QueueHandlerRegistration,
    message: QueueMessage,
  ): Promise<void> {
    try {
      await withRetry(() => reg.handler(message), {
        maxRetries: this.maxRetries,
        strategy: 'exponential-jitter',
        baseDelayMs: this.baseDelayMs,
        maxDelayMs: this.maxDelayMs,
      });

      // Success — ack and clear error history.
      await this.mq.ack(reg.queue, message.id);
      this.errorHistory.delete(message.id);

      logger.worker().debug('Message processed successfully', {
        queue: reg.queue,
        messageId: message.id,
        attempts: message.attempts,
      });
    } catch (e) {
      await this.handleFailure(reg, message, e);
    }
  }

  private async handleFailure(
    reg: QueueHandlerRegistration,
    message: QueueMessage,
    error: unknown,
  ): Promise<void> {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const now = Date.now();

    // Append to error history.
    const history = this.errorHistory.get(message.id) ?? [];
    history.push({ attempt: message.attempts + 1, error: errorMessage, timestamp: now });
    if (history.length > MAX_ERROR_HISTORY_ENTRIES) {
      history.shift();
    }
    this.errorHistory.set(message.id, history);

    // Sync to message headers so the DLQ's isPoison check can inspect it.
    message.headers[ERROR_HISTORY_HEADER] = JSON.stringify(history);

    const nextAttempts = message.attempts + 1;

    logger.worker().warn('Message processing failed', {
      queue: reg.queue,
      messageId: message.id,
      attempts: message.attempts,
      nextAttempts,
      maxAttempts: message.maxAttempts,
      error: errorMessage,
    });

    // Decide: DLQ or retry with backoff.
    const shouldDlq =
      nextAttempts >= message.maxAttempts || this.dlq.isPoison(message);

    if (shouldDlq) {
      await this.sendToDlq(reg, message, history);
      await this.mq.ack(reg.queue, message.id);
      this.errorHistory.delete(message.id);
    } else {
      // Exponential backoff across deliveries.
      const delayMs = Math.min(
        this.baseDelayMs * Math.pow(2, message.attempts),
        this.maxDelayMs,
      );
      await this.mq.nack(reg.queue, message.id, { requeue: true, delayMs });
    }
  }

  private async sendToDlq(
    reg: QueueHandlerRegistration,
    message: QueueMessage,
    history: DlqErrorEntry[],
  ): Promise<void> {
    const now = Date.now();
    await this.dlq.send({
      originalQueue: reg.queue,
      originalMessageId: message.id,
      payload: message.payload,
      headers: { ...message.headers },
      errorHistory: history,
      attempts: message.attempts + 1,
      expiresAt: now + DEFAULT_DLQ_TTL_MS,
    });

    logger.worker().error('Message routed to DLQ after exhausting retries', {
      queue: reg.queue,
      messageId: message.id,
      attempts: message.attempts + 1,
      maxAttempts: message.maxAttempts,
      errorCount: history.length,
    });
  }

  private restoreErrorHistory(message: QueueMessage): void {
    const history = this.errorHistory.get(message.id);
    if (history && history.length > 0) {
      message.headers[ERROR_HISTORY_HEADER] = JSON.stringify(history);
    }
  }

  private async acquireSlot(): Promise<void> {
    while (this.activeCount >= this.concurrency) {
      await sleep(10);
    }
    this.activeCount++;
  }

  private releaseSlot(): void {
    this.activeCount--;
  }
}
