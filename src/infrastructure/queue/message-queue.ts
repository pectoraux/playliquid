/**
 * Message Queue Abstraction
 *
 * Provides a unified interface for publishing and consuming messages across
 * different backends. Supports priority queues, delayed delivery, at-least-once
 * delivery with visibility timeouts, and dead-letter queue integration.
 *
 * Backends:
 *   - InMemoryQueue: development / single-instance (uses arrays + setTimeout)
 *   - RedisQueue: production / multi-instance (uses RedisClient)
 *
 * Semantics:
 *   - publish(): store message with attempts=0
 *   - consume(): register a consumer; the queue dispatches available messages
 *   - ack(): remove from in-flight (success)
 *   - nack(requeue=true): increment attempts, re-queue with optional delay
 *   - nack(requeue=false): drop the message
 *   - retry(): increment attempts, re-queue immediately (shorthand for nack)
 *   - delay(): re-queue with delay, no attempts increment
 *   - Visibility timeout: if a consumer doesn't ack/nack within the timeout,
 *     the message is re-queued automatically.
 */

import type { RedisClient } from '@/infrastructure/redis/redis-client';
import { createId } from '@/shared/ids';
import { logger } from '@/shared/logging';

// ─── Public Interfaces ────────────────────────────────────────────────────

export interface QueueMessage<T = unknown> {
  id: string;
  queue: string;
  payload: T;
  attempts: number;
  maxAttempts: number;
  availableAt: number;
  createdAt: number;
  headers: Record<string, string>;
}

export interface MessageConsumer<T = unknown> {
  (message: QueueMessage<T>): Promise<void>;
}

export interface PublishOptions {
  delayMs?: number;
  maxAttempts?: number;
  headers?: Record<string, string>;
  priority?: number;
}

export interface NackOptions {
  requeue?: boolean;
  delayMs?: number;
}

export interface MessageQueue {
  publish<T>(queue: string, payload: T, options?: PublishOptions): Promise<string>;
  consume<T>(queue: string, consumer: MessageConsumer<T>): Promise<void>;
  ack(queue: string, messageId: string): Promise<void>;
  nack(queue: string, messageId: string, options?: NackOptions): Promise<void>;
  delay(queue: string, messageId: string, delayMs: number): Promise<void>;
  retry(queue: string, messageId: string): Promise<void>;
  getQueueDepth(queue: string): Promise<number>;
  purge(queue: string): Promise<void>;
}

// ─── Constants ────────────────────────────────────────────────────────────

/** Header key used to store the priority value (higher = processed first). */
export const PRIORITY_HEADER = 'x-priority';

/** Header key used to track per-message error history (JSON-encoded DlqErrorEntry[]). */
export const ERROR_HISTORY_HEADER = 'x-error-history';

export const MAX_ATTEMPTS_DEFAULT = 5;
export const VISIBILITY_TIMEOUT_MS = 30_000;
export const POLL_INTERVAL_MS = 100;
export const MAX_ERROR_HISTORY_ENTRIES = 10;

// ─── Internal Types ───────────────────────────────────────────────────────

interface MessageMetadata {
  id: string;
  priority: number;
  createdAt: number;
  availableAt: number;
}

interface InflightEntry {
  message: QueueMessage;
  expiresAt: number;
}

// ─── InMemoryQueue ────────────────────────────────────────────────────────

/**
 * In-memory message queue backed by arrays with priority sorting.
 *
 * Delayed delivery is handled by the polling loop: messages with `availableAt`
 * in the future are skipped until their time arrives. The poll interval is
 * implemented via setTimeout so the event loop is not blocked.
 *
 * Suitable for development and single-instance deployments. For multi-instance
 * deployments, use RedisQueue.
 */
export class InMemoryQueue implements MessageQueue {
  private readonly queues = new Map<string, QueueMessage[]>();
  private readonly consumers = new Map<string, Set<MessageConsumer>>();
  private readonly inflight = new Map<string, Map<string, InflightEntry>>();
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();
  private readonly visibilityTimeoutMs: number;
  private readonly pollIntervalMs: number;
  private dispatchRunning = false;

  constructor(options?: { visibilityTimeoutMs?: number; pollIntervalMs?: number }) {
    this.visibilityTimeoutMs = options?.visibilityTimeoutMs ?? VISIBILITY_TIMEOUT_MS;
    this.pollIntervalMs = options?.pollIntervalMs ?? POLL_INTERVAL_MS;
  }

  async publish<T>(queue: string, payload: T, options?: PublishOptions): Promise<string> {
    const id = createId('msg');
    const now = Date.now();
    const priority = options?.priority ?? 0;
    const headers: Record<string, string> = {
      ...(options?.headers ?? {}),
      [PRIORITY_HEADER]: String(priority),
    };
    const message: QueueMessage<T> = {
      id,
      queue,
      payload,
      attempts: 0,
      maxAttempts: options?.maxAttempts ?? MAX_ATTEMPTS_DEFAULT,
      availableAt: now + (options?.delayMs ?? 0),
      createdAt: now,
      headers,
    };

    const list = this.queues.get(queue) ?? [];
    list.push(message as QueueMessage);
    this.sortByPriority(list);
    this.queues.set(queue, list);

    return id;
  }

  async consume<T>(queue: string, consumer: MessageConsumer<T>): Promise<void> {
    let set = this.consumers.get(queue);
    if (!set) {
      set = new Set();
      this.consumers.set(queue, set);
    }
    set.add(consumer as MessageConsumer);

    if (!this.dispatchRunning) {
      this.dispatchRunning = true;
      void this.runDispatchLoop();
    }
  }

  async ack(queue: string, messageId: string): Promise<void> {
    this.inflight.get(queue)?.delete(messageId);
  }

  async nack(queue: string, messageId: string, options?: NackOptions): Promise<void> {
    const map = this.inflight.get(queue);
    const entry = map?.get(messageId);
    if (!entry) return;
    map?.delete(messageId);

    if (options?.requeue === false) return;

    const message = entry.message;
    message.attempts += 1;
    message.availableAt = Date.now() + (options?.delayMs ?? 0);

    const list = this.queues.get(queue) ?? [];
    list.push(message);
    this.sortByPriority(list);
    this.queues.set(queue, list);
  }

  async delay(queue: string, messageId: string, delayMs: number): Promise<void> {
    const map = this.inflight.get(queue);
    const entry = map?.get(messageId);
    if (!entry) return;
    map?.delete(messageId);

    const message = entry.message;
    message.availableAt = Date.now() + delayMs;

    const list = this.queues.get(queue) ?? [];
    list.push(message);
    this.sortByPriority(list);
    this.queues.set(queue, list);
  }

  async retry(queue: string, messageId: string): Promise<void> {
    await this.nack(queue, messageId, { requeue: true, delayMs: 0 });
  }

  async getQueueDepth(queue: string): Promise<number> {
    const pending = this.queues.get(queue)?.length ?? 0;
    const inflight = this.inflight.get(queue)?.size ?? 0;
    return pending + inflight;
  }

  async purge(queue: string): Promise<void> {
    this.queues.set(queue, []);
    this.inflight.set(queue, new Map());
  }

  /** Stop the dispatch loop and clear pending timers (for graceful shutdown). */
  stop(): void {
    this.dispatchRunning = false;
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
  }

  private sortByPriority(list: QueueMessage[]): void {
    list.sort((a, b) => {
      const pa = parseInt(a.headers[PRIORITY_HEADER] ?? '0', 10);
      const pb = parseInt(b.headers[PRIORITY_HEADER] ?? '0', 10);
      if (pb !== pa) return pb - pa; // higher priority first
      return a.createdAt - b.createdAt; // FIFO within same priority
    });
  }

  private async runDispatchLoop(): Promise<void> {
    while (this.dispatchRunning) {
      try {
        this.dispatchOnce();
        this.checkVisibilityTimeouts();
      } catch (e) {
        logger.worker().error('In-memory queue dispatch loop error', {}, e);
      }
      await this.sleep(this.pollIntervalMs);
    }
  }

  private dispatchOnce(): void {
    const now = Date.now();
    for (const [queue, consumerSet] of this.consumers) {
      const list = this.queues.get(queue);
      if (!list || list.length === 0) continue;

      const inflightMap = this.inflight.get(queue) ?? new Map();
      this.inflight.set(queue, inflightMap);

      const available: QueueMessage[] = [];
      const remaining: QueueMessage[] = [];
      for (const msg of list) {
        if (msg.availableAt <= now) {
          available.push(msg);
        } else {
          remaining.push(msg);
        }
      }
      this.queues.set(queue, remaining);

      if (available.length === 0) continue;

      const consumers = Array.from(consumerSet);
      if (consumers.length === 0) {
        remaining.push(...available);
        continue;
      }

      for (const msg of available) {
        inflightMap.set(msg.id, { message: msg, expiresAt: now + this.visibilityTimeoutMs });
        void this.invokeConsumer(queue, msg, consumers[0]);
      }
    }
  }

  private async invokeConsumer(
    queue: string,
    message: QueueMessage,
    consumer: MessageConsumer,
  ): Promise<void> {
    try {
      await consumer(message);
    } catch (e) {
      logger.worker().error(
        'Consumer threw unexpectedly, auto-nacking',
        { queue, messageId: message.id },
        e,
      );
      const map = this.inflight.get(queue);
      if (map?.has(message.id)) {
        await this.nack(queue, message.id, { requeue: true, delayMs: 0 });
      }
    }
  }

  private checkVisibilityTimeouts(): void {
    const now = Date.now();
    for (const [queue, inflightMap] of this.inflight) {
      const expired: string[] = [];
      for (const [id, entry] of inflightMap) {
        if (now > entry.expiresAt) expired.push(id);
      }
      if (expired.length === 0) continue;

      const list = this.queues.get(queue) ?? [];
      for (const id of expired) {
        const entry = inflightMap.get(id);
        if (entry) {
          inflightMap.delete(id);
          list.push(entry.message);
        }
      }
      this.sortByPriority(list);
      this.queues.set(queue, list);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const t = setTimeout(resolve, ms);
      this.timers.add(t);
    });
  }
}

// ─── RedisQueue ───────────────────────────────────────────────────────────

/**
 * Redis-backed message queue.
 *
 * Uses the RedisClient abstraction (which works with both real Redis and the
 * in-memory fallback). Since the RedisClient interface exposes only basic KV
 * operations, priority ordering and in-flight tracking are simulated using
 * JSON-encoded data structures:
 *
 *   - queue:{name}:messages  → JSON array of MessageMetadata (sorted set simulation)
 *   - queue:{name}:msg:{id}  → JSON-encoded QueueMessage (hash simulation)
 *   - queue:{name}:inflight  → JSON map of messageId → InflightEntry
 *
 * For high-throughput production deployments, this would be re-implemented with
 * native Redis commands (ZADD/ZRANGEBYSCORE for priority, HSET/HGET for
 * messages, and Lua scripts for atomicity).
 */
export class RedisQueue implements MessageQueue {
  private readonly consumers = new Map<string, Set<MessageConsumer>>();
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();
  private readonly visibilityTimeoutMs: number;
  private readonly pollIntervalMs: number;
  private dispatchRunning = false;

  constructor(
    private readonly redis: RedisClient,
    options?: { visibilityTimeoutMs?: number; pollIntervalMs?: number },
  ) {
    this.visibilityTimeoutMs = options?.visibilityTimeoutMs ?? VISIBILITY_TIMEOUT_MS;
    this.pollIntervalMs = options?.pollIntervalMs ?? POLL_INTERVAL_MS;
  }

  private messagesKey(queue: string): string {
    return `queue:${queue}:messages`;
  }

  private msgKey(queue: string, id: string): string {
    return `queue:${queue}:msg:${id}`;
  }

  private inflightKey(queue: string): string {
    return `queue:${queue}:inflight`;
  }

  async publish<T>(queue: string, payload: T, options?: PublishOptions): Promise<string> {
    const id = createId('msg');
    const now = Date.now();
    const priority = options?.priority ?? 0;
    const headers: Record<string, string> = {
      ...(options?.headers ?? {}),
      [PRIORITY_HEADER]: String(priority),
    };
    const message: QueueMessage<T> = {
      id,
      queue,
      payload,
      attempts: 0,
      maxAttempts: options?.maxAttempts ?? MAX_ATTEMPTS_DEFAULT,
      availableAt: now + (options?.delayMs ?? 0),
      createdAt: now,
      headers,
    };

    await this.redis.set(this.msgKey(queue, id), JSON.stringify(message));

    const list = await this.readMessageList(queue);
    list.push({ id, priority, createdAt: now, availableAt: message.availableAt });
    this.sortMessageList(list);
    await this.redis.set(this.messagesKey(queue), JSON.stringify(list));

    return id;
  }

  async consume<T>(queue: string, consumer: MessageConsumer<T>): Promise<void> {
    let set = this.consumers.get(queue);
    if (!set) {
      set = new Set();
      this.consumers.set(queue, set);
    }
    set.add(consumer as MessageConsumer);

    if (!this.dispatchRunning) {
      this.dispatchRunning = true;
      void this.runDispatchLoop();
    }
  }

  async ack(queue: string, messageId: string): Promise<void> {
    const inflight = await this.readInflight(queue);
    delete inflight[messageId];
    await this.redis.set(this.inflightKey(queue), JSON.stringify(inflight));
    await this.redis.del(this.msgKey(queue, messageId));
  }

  async nack(queue: string, messageId: string, options?: NackOptions): Promise<void> {
    const inflight = await this.readInflight(queue);
    const entry = inflight[messageId];
    if (!entry) return;
    delete inflight[messageId];
    await this.redis.set(this.inflightKey(queue), JSON.stringify(inflight));

    if (options?.requeue === false) {
      await this.redis.del(this.msgKey(queue, messageId));
      return;
    }

    const message = entry.message;
    message.attempts += 1;
    message.availableAt = Date.now() + (options?.delayMs ?? 0);
    await this.redis.set(this.msgKey(queue, messageId), JSON.stringify(message));

    const list = await this.readMessageList(queue);
    const priority = parseInt(message.headers[PRIORITY_HEADER] ?? '0', 10);
    list.push({ id: messageId, priority, createdAt: message.createdAt, availableAt: message.availableAt });
    this.sortMessageList(list);
    await this.redis.set(this.messagesKey(queue), JSON.stringify(list));
  }

  async delay(queue: string, messageId: string, delayMs: number): Promise<void> {
    const inflight = await this.readInflight(queue);
    const entry = inflight[messageId];
    if (!entry) return;
    delete inflight[messageId];
    await this.redis.set(this.inflightKey(queue), JSON.stringify(inflight));

    const message = entry.message;
    message.availableAt = Date.now() + delayMs;
    await this.redis.set(this.msgKey(queue, messageId), JSON.stringify(message));

    const list = await this.readMessageList(queue);
    const priority = parseInt(message.headers[PRIORITY_HEADER] ?? '0', 10);
    list.push({ id: messageId, priority, createdAt: message.createdAt, availableAt: message.availableAt });
    this.sortMessageList(list);
    await this.redis.set(this.messagesKey(queue), JSON.stringify(list));
  }

  async retry(queue: string, messageId: string): Promise<void> {
    await this.nack(queue, messageId, { requeue: true, delayMs: 0 });
  }

  async getQueueDepth(queue: string): Promise<number> {
    const list = await this.readMessageList(queue);
    const inflight = await this.readInflight(queue);
    return list.length + Object.keys(inflight).length;
  }

  async purge(queue: string): Promise<void> {
    const list = await this.readMessageList(queue);
    for (const item of list) {
      await this.redis.del(this.msgKey(queue, item.id));
    }
    const inflight = await this.readInflight(queue);
    for (const id of Object.keys(inflight)) {
      await this.redis.del(this.msgKey(queue, id));
    }
    await this.redis.set(this.messagesKey(queue), '[]');
    await this.redis.set(this.inflightKey(queue), '{}');
  }

  /** Stop the dispatch loop and clear pending timers. */
  stop(): void {
    this.dispatchRunning = false;
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
  }

  private async readMessageList(queue: string): Promise<MessageMetadata[]> {
    const raw = await this.redis.get(this.messagesKey(queue));
    if (!raw) return [];
    try {
      return JSON.parse(raw) as MessageMetadata[];
    } catch {
      return [];
    }
  }

  private async readInflight(queue: string): Promise<Record<string, InflightEntry>> {
    const raw = await this.redis.get(this.inflightKey(queue));
    if (!raw) return {};
    try {
      return JSON.parse(raw) as Record<string, InflightEntry>;
    } catch {
      return {};
    }
  }

  private sortMessageList(list: MessageMetadata[]): void {
    list.sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      return a.createdAt - b.createdAt;
    });
  }

  private async runDispatchLoop(): Promise<void> {
    while (this.dispatchRunning) {
      try {
        await this.dispatchOnce();
        await this.checkVisibilityTimeouts();
      } catch (e) {
        logger.worker().error('Redis queue dispatch loop error', {}, e);
      }
      await this.sleep(this.pollIntervalMs);
    }
  }

  private async dispatchOnce(): Promise<void> {
    const now = Date.now();
    for (const [queue, consumerSet] of this.consumers) {
      const list = await this.readMessageList(queue);
      if (list.length === 0) continue;

      const available: MessageMetadata[] = [];
      const remaining: MessageMetadata[] = [];
      for (const item of list) {
        if (item.availableAt <= now) {
          available.push(item);
        } else {
          remaining.push(item);
        }
      }
      await this.redis.set(this.messagesKey(queue), JSON.stringify(remaining));

      if (available.length === 0) continue;

      const consumers = Array.from(consumerSet);
      if (consumers.length === 0) {
        remaining.push(...available);
        await this.redis.set(this.messagesKey(queue), JSON.stringify(remaining));
        continue;
      }

      const inflight = await this.readInflight(queue);
      for (const item of available) {
        const msgRaw = await this.redis.get(this.msgKey(queue, item.id));
        if (!msgRaw) continue;
        let message: QueueMessage;
        try {
          message = JSON.parse(msgRaw) as QueueMessage;
        } catch {
          continue;
        }
        inflight[item.id] = { message, expiresAt: now + this.visibilityTimeoutMs };
        void this.invokeConsumer(queue, message, consumers[0]);
      }
      await this.redis.set(this.inflightKey(queue), JSON.stringify(inflight));
    }
  }

  private async invokeConsumer(
    queue: string,
    message: QueueMessage,
    consumer: MessageConsumer,
  ): Promise<void> {
    try {
      await consumer(message);
    } catch (e) {
      logger.worker().error(
        'Consumer threw unexpectedly, auto-nacking',
        { queue, messageId: message.id },
        e,
      );
      await this.nack(queue, message.id, { requeue: true, delayMs: 0 });
    }
  }

  private async checkVisibilityTimeouts(): Promise<void> {
    const now = Date.now();
    for (const [queue] of this.consumers) {
      const inflight = await this.readInflight(queue);
      const expired: string[] = [];
      for (const [id, entry] of Object.entries(inflight)) {
        if (now > entry.expiresAt) expired.push(id);
      }
      if (expired.length === 0) continue;

      const list = await this.readMessageList(queue);
      for (const id of expired) {
        const entry = inflight[id];
        delete inflight[id];
        if (entry) {
          const priority = parseInt(entry.message.headers[PRIORITY_HEADER] ?? '0', 10);
          list.push({
            id,
            priority,
            createdAt: entry.message.createdAt,
            availableAt: entry.message.availableAt,
          });
        }
      }
      this.sortMessageList(list);
      await this.redis.set(this.messagesKey(queue), JSON.stringify(list));
      await this.redis.set(this.inflightKey(queue), JSON.stringify(inflight));
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const t = setTimeout(resolve, ms);
      this.timers.add(t);
    });
  }
}
