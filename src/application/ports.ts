/**
 * Application Ports — interfaces that the application layer depends on.
 *
 * These are the "hexagonal ports" through which the application interacts
 * with the outside world. Infrastructure provides the "adapters" (implementations).
 *
 * The application layer NEVER imports infrastructure. It only imports these
 * port interfaces. This enforces the dependency inversion principle.
 */

import type { DomainEvent } from '@/domain/shared/event/domain-event';
import type { SerializedEvent } from '@/domain/shared/event/domain-event';
import type { AggregateSnapshot } from '@/domain/shared/aggregate/aggregate-root';
import type { Result } from '@/shared/types/result';

// ─── Event Store Port ──────────────────────────────────────────────────────

export interface EventStore {
  append(events: DomainEvent[], expectedVersion: number): Promise<void>;
  appendMany(streamId: string, events: SerializedEvent[], expectedVersion: number): Promise<void>;
  load(streamId: string): Promise<SerializedEvent[]>;
  loadFromVersion(streamId: string, fromVersion: number): Promise<SerializedEvent[]>;
  loadVersion(streamId: string): Promise<number>;
  replay(fromRowId: number, limit: number): Promise<{ events: SerializedEvent[]; nextRowId: number }>;
  exists(streamId: string): Promise<boolean>;
}

// ─── Snapshot Store Port ───────────────────────────────────────────────────
// (Re-exported from domain for convenience — the contract lives in domain.)

export type { SnapshotStore } from '@/domain/shared/repository';

// ─── Outbox Port ────────────────────────────────────────────────────────────

export interface OutboxRepository {
  append(event: SerializedEvent): Promise<void>;
  appendMany(events: SerializedEvent[]): Promise<void>;
  countByStatus(): Promise<{ pending: number; published: number; failed: number }>;
}

// ─── Event Bus Port ─────────────────────────────────────────────────────────

export type EventHandler = (event: DomainEvent) => Promise<void>;

export interface EventBus {
  publish(event: SerializedEvent): Promise<void>;
  publishMany(events: SerializedEvent[]): Promise<void>;
  subscribe(eventType: string, handler: EventHandler): void;
  unsubscribe(eventType: string, handler: EventHandler): void;
}

// ─── Metrics Port ────────────────────────────────────────────────────────────

export interface CommandMetric {
  readonly commandType: string;
  readonly count: number;
  readonly successCount: number;
  readonly failureCount: number;
  readonly totalDurationMs: number;
  readonly avgDurationMs: number;
}

export interface QueryMetric {
  readonly queryType: string;
  readonly count: number;
  readonly successCount: number;
  readonly failureCount: number;
  readonly totalDurationMs: number;
  readonly avgDurationMs: number;
}

export interface MetricsRecorder {
  recordCommand(commandType: string, durationMs: number, success: boolean): void;
  recordQuery(queryType: string, durationMs: number, success: boolean): void;
  getCommandMetrics(): CommandMetric[];
  getQueryMetrics(): QueryMetric[];
  reset(): void;
}

// ─── Cache Port ────────────────────────────────────────────────────────────────

export interface Cache {
  get<T>(key: string): T | null;
  set<T>(key: string, value: T, ttlSeconds: number): void;
  delete(key: string): void;
  clear(): void;
  size(): number;
}

// ─── Read Model Store Port (for query handlers) ─────────────────────────────

export interface GameReadModelStore {
  findById(gameId: string): Promise<{
    gameId: string;
    title: string;
    creatorId: string;
    status: string;
    publishedAt: string | null;
  } | null>;
}

// ─── Unit of Work Port (re-exported) ──────────────────────────────────────

export type { UnitOfWork, UnitOfWorkFactory } from '@/application/unit-of-work/unit-of-work';

// ─── Idempotency Store Port (re-exported) ───────────────────────────────────

export type { IdempotencyStore, IdempotencyRecord } from '@/application/pipelines/idempotency-store';
