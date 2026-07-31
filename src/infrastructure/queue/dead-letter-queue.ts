/**
 * Dead Letter Queue (DLQ)
 *
 * Persistent storage for messages that have exhausted their retry attempts or
 * have been classified as poison. The DLQ retains the original payload,
 * headers, and full error history so that messages can be inspected, replayed,
 * or expired.
 *
 * Poison message detection:
 *   A message is "poison" if it has been retried maxAttempts times AND the
 *   same error message appears 3+ times in its error history. Poison messages
 *   are candidates for immediate DLQ routing (before exhausting all attempts).
 *
 * Status flow: pending → replayed | expired
 */

import type { MessageQueue, QueueMessage } from '@/infrastructure/queue/message-queue';
import { ERROR_HISTORY_HEADER } from '@/infrastructure/queue/message-queue';
import { getClient } from '@/infrastructure/database/prisma';
import { createId } from '@/shared/ids';
import { logger } from '@/shared/logging';

// ─── Public Interfaces ────────────────────────────────────────────────────

export interface DlqErrorEntry {
  attempt: number;
  error: string;
  timestamp: number;
}

export interface DeadLetterMessage {
  id: string;
  originalQueue: string;
  originalMessageId: string;
  payload: unknown;
  headers: Record<string, string>;
  errorHistory: DlqErrorEntry[];
  attempts: number;
  firstFailedAt: number;
  lastFailedAt: number;
  expiresAt: number;
  status: 'pending' | 'replayed' | 'expired';
}

export interface DeadLetterQueue {
  send(
    entry: Omit<DeadLetterMessage, 'id' | 'firstFailedAt' | 'lastFailedAt' | 'status'>,
  ): Promise<string>;
  get(id: string): Promise<DeadLetterMessage | null>;
  list(limit: number): Promise<DeadLetterMessage[]>;
  replay(id: string, queue: MessageQueue): Promise<void>;
  replayAll(queue: string, mq: MessageQueue): Promise<number>;
  expire(): Promise<number>;
  count(): Promise<number>;
  isPoison(message: QueueMessage): boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────

/** Default TTL for DLQ entries: 7 days. */
export const DEFAULT_DLQ_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Number of times the same error must repeat for a message to be poison. */
export const POISON_REPEAT_THRESHOLD = 3;

// ─── Prisma Model Interface ───────────────────────────────────────────────

/**
 * Shape of a DeadLetterMessage row in Prisma. Defined here so the DLQ module
 * is self-documenting and decoupled from Prisma code generation. The actual
 * Prisma model is declared in prisma/schema.prisma.
 */
interface DeadLetterMessageRecord {
  id: string;
  originalQueue: string;
  originalMessageId: string;
  payload: string;
  headers: string;
  errorHistory: string;
  attempts: number;
  firstFailedAt: bigint;
  lastFailedAt: bigint;
  expiresAt: bigint;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

// ─── PrismaDeadLetterQueue ────────────────────────────────────────────────

/**
 * Prisma-backed Dead Letter Queue.
 *
 * Persists dead-letter entries to the DeadLetterMessage table. Entries expire
 * after their expiresAt timestamp; the expire() method marks them as expired.
 * Pending entries can be replayed back to their original queue.
 */
export class PrismaDeadLetterQueue implements DeadLetterQueue {
  async send(
    entry: Omit<DeadLetterMessage, 'id' | 'firstFailedAt' | 'lastFailedAt' | 'status'>,
  ): Promise<string> {
    const id = createId('dlq');
    const now = Date.now();
    const client = getClient();

    await client.deadLetterMessage.create({
      data: {
        id,
        originalQueue: entry.originalQueue,
        originalMessageId: entry.originalMessageId,
        payload: JSON.stringify(entry.payload),
        headers: JSON.stringify(entry.headers),
        errorHistory: JSON.stringify(entry.errorHistory),
        attempts: entry.attempts,
        firstFailedAt: BigInt(now),
        lastFailedAt: BigInt(now),
        expiresAt: BigInt(entry.expiresAt),
        status: 'pending',
      },
    });

    logger.worker().warn('Message sent to DLQ', {
      dlqId: id,
      originalQueue: entry.originalQueue,
      originalMessageId: entry.originalMessageId,
      attempts: entry.attempts,
      errorCount: entry.errorHistory.length,
    });

    return id;
  }

  async get(id: string): Promise<DeadLetterMessage | null> {
    const client = getClient();
    const record = await client.deadLetterMessage.findUnique({ where: { id } });
    if (!record) return null;
    return this.toModel(record as DeadLetterMessageRecord);
  }

  async list(limit: number): Promise<DeadLetterMessage[]> {
    const client = getClient();
    const records = await client.deadLetterMessage.findMany({
      orderBy: { lastFailedAt: 'desc' },
      take: limit,
    });
    return records.map((r) => this.toModel(r as DeadLetterMessageRecord));
  }

  async replay(id: string, queue: MessageQueue): Promise<void> {
    const client = getClient();
    const record = await client.deadLetterMessage.findUnique({ where: { id } });
    if (!record) throw new Error(`DLQ entry not found: ${id}`);
    if (record.status !== 'pending') {
      throw new Error(`DLQ entry not replayable (status=${record.status}): ${id}`);
    }

    const payload = JSON.parse(record.payload) as unknown;
    const headers = JSON.parse(record.headers) as Record<string, string>;

    await queue.publish(record.originalQueue, payload, { headers });

    await client.deadLetterMessage.update({
      where: { id },
      data: { status: 'replayed' },
    });

    logger.worker().info('DLQ entry replayed', {
      dlqId: id,
      originalQueue: record.originalQueue,
      originalMessageId: record.originalMessageId,
    });
  }

  async replayAll(queue: string, mq: MessageQueue): Promise<number> {
    const client = getClient();
    const records = await client.deadLetterMessage.findMany({
      where: { status: 'pending', originalQueue: queue },
      orderBy: { firstFailedAt: 'asc' },
    });

    let count = 0;
    for (const record of records) {
      try {
        await this.replay(record.id, mq);
        count++;
      } catch (e) {
        logger.worker().error('Failed to replay DLQ entry', { dlqId: record.id }, e);
      }
    }

    logger.worker().info('DLQ replay-all complete', {
      queue,
      replayed: count,
      total: records.length,
    });

    return count;
  }

  async expire(): Promise<number> {
    const client = getClient();
    const now = Date.now();

    const result = await client.deadLetterMessage.updateMany({
      where: { status: 'pending', expiresAt: { lt: BigInt(now) } },
      data: { status: 'expired' },
    });

    if (result.count > 0) {
      logger.worker().info('DLQ entries expired', { count: result.count });
    }

    return result.count;
  }

  async count(): Promise<number> {
    const client = getClient();
    return client.deadLetterMessage.count({ where: { status: 'pending' } });
  }

  isPoison(message: QueueMessage): boolean {
    // Condition 1: message has been retried at least maxAttempts times.
    if (message.attempts < message.maxAttempts) {
      return false;
    }

    // Condition 2: the same error repeats POISON_REPEAT_THRESHOLD+ times.
    const historyRaw = message.headers[ERROR_HISTORY_HEADER];
    if (!historyRaw) return false;

    let history: DlqErrorEntry[] = [];
    try {
      history = JSON.parse(historyRaw) as DlqErrorEntry[];
    } catch {
      return false;
    }

    if (history.length < POISON_REPEAT_THRESHOLD) return false;

    const counts = new Map<string, number>();
    for (const entry of history) {
      counts.set(entry.error, (counts.get(entry.error) ?? 0) + 1);
    }

    return Array.from(counts.values()).some((c) => c >= POISON_REPEAT_THRESHOLD);
  }

  private toModel(r: DeadLetterMessageRecord): DeadLetterMessage {
    let payload: unknown = null;
    try {
      payload = JSON.parse(r.payload);
    } catch {
      payload = null;
    }

    let headers: Record<string, string> = {};
    try {
      headers = JSON.parse(r.headers) as Record<string, string>;
    } catch {
      headers = {};
    }

    let errorHistory: DlqErrorEntry[] = [];
    try {
      errorHistory = JSON.parse(r.errorHistory) as DlqErrorEntry[];
    } catch {
      errorHistory = [];
    }

    return {
      id: r.id,
      originalQueue: r.originalQueue,
      originalMessageId: r.originalMessageId,
      payload,
      headers,
      errorHistory,
      attempts: r.attempts,
      firstFailedAt: Number(r.firstFailedAt),
      lastFailedAt: Number(r.lastFailedAt),
      expiresAt: Number(r.expiresAt),
      status: r.status as 'pending' | 'replayed' | 'expired',
    };
  }
}
