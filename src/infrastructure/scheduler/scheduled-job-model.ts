/**
 * Scheduled Job Persistence Model
 *
 * Defines the persistence contract for scheduled jobs. The scheduler uses a
 * `ScheduledJobStore` to persist next-run times, last-run state, and run/error
 * counters so that:
 *
 *   - Jobs survive process restarts (nextRunAt is recovered from the store).
 *   - Multiple instances can coordinate: only the instance that holds the
 *     distributed lock for a job at its nextRunAt moment actually executes it.
 *   - The actual storage backend is swappable: in-memory for dev/tests,
 *     Prisma for production (model to be added to schema.prisma by the main
 *     agent — see the `ScheduledJobRecord` shape below for the contract).
 *
 * PRISMA SCHEMA (to be added by main agent):
 *
 *   model ScheduledJob {
 *     id            String   @id
 *     name          String
 *     scheduleKind  String   // 'cron' | 'fixed_rate' | 'one_time'
 *     scheduleValue String   // cron expr | intervalMs (as string) | runAt (ISO)
 *     priority      Int      @default(0)
 *     enabled       Boolean  @default(true)
 *     nextRunAt     DateTime
 *     lastRunAt     DateTime?
 *     lastError     String?
 *     runCount      Int      @default(0)
 *     errorCount    Int      @default(0)
 *     createdAt     DateTime @default(now())
 *     updatedAt     DateTime @updatedAt
 *
 *     @@index([enabled, nextRunAt])
 *   }
 */

import { logger } from '@/shared/logging';

/** The kind of schedule. */
export type JobScheduleKind = 'cron' | 'fixed_rate' | 'one_time';

/**
 * Persisted representation of a scheduled job. The `scheduleValue` field
 * encodes the schedule in a single string:
 *   - cron:        the cron expression (e.g. "0,5,10,15,20,25,30,35,40,45,50,55 * * * *")
 *   - fixed_rate:  the interval in milliseconds, as a string (e.g. "60000")
 *   - one_time:    the runAt timestamp as an ISO string
 */
export interface ScheduledJobRecord {
  readonly id: string;
  readonly name: string;
  readonly scheduleKind: JobScheduleKind;
  readonly scheduleValue: string;
  readonly priority: number;
  readonly enabled: boolean;
  /** Epoch milliseconds. The scheduler picks up jobs where nextRunAt <= now. */
  readonly nextRunAt: number;
  readonly lastRunAt: number | null;
  readonly lastError: string | null;
  readonly runCount: number;
  readonly errorCount: number;
  readonly createdAt: number;
  readonly updatedAt: number;
}

/** Patch applied after a job run. */
export interface JobRunUpdate {
  nextRunAt: number;
  lastRunAt: number;
  lastError: string | null;
  runCount: number;
  errorCount: number;
}

/**
 * Persistence port for scheduled jobs. Implementations:
 *   - `InMemoryScheduledJobStore` (below) — single-instance dev/test
 *   - `PrismaScheduledJobStore` (to be added by main agent) — production
 *
 * The contract is intentionally minimal: the scheduler handles all schedule
 * arithmetic (computing nextRunAt, parsing cron, etc.); the store only
 * persists and retrieves records.
 */
export interface ScheduledJobStore {
  /** Upsert a record by id. */
  save(record: ScheduledJobRecord): Promise<void>;
  /** Load a single record by id. */
  load(id: string): Promise<ScheduledJobRecord | null>;
  /** Load all records (used for `listJobs()` and crash recovery). */
  loadAll(): Promise<ScheduledJobRecord[]>;
  /** Load all enabled jobs whose nextRunAt <= `now`. */
  loadDue(now: number): Promise<ScheduledJobRecord[]>;
  /** Patch run state after a job execution. */
  updateRunState(id: string, update: JobRunUpdate): Promise<void>;
  /** Delete a record (used when one-time jobs complete). */
  delete(id: string): Promise<void>;
}

// ─── In-Memory Implementation ─────────────────────────────────────────────

/**
 * In-memory scheduled job store. Suitable for single-instance deployments
 * and tests. Not safe for multi-instance coordination (use a database-backed
 * store in production).
 */
export class InMemoryScheduledJobStore implements ScheduledJobStore {
  private readonly records = new Map<string, ScheduledJobRecord>();

  async save(record: ScheduledJobRecord): Promise<void> {
    this.records.set(record.id, { ...record });
  }

  async load(id: string): Promise<ScheduledJobRecord | null> {
    const r = this.records.get(id);
    return r ? { ...r } : null;
  }

  async loadAll(): Promise<ScheduledJobRecord[]> {
    return Array.from(this.records.values()).map((r) => ({ ...r }));
  }

  async loadDue(now: number): Promise<ScheduledJobRecord[]> {
    const due: ScheduledJobRecord[] = [];
    for (const r of this.records.values()) {
      if (r.enabled && r.nextRunAt <= now) {
        due.push({ ...r });
      }
    }
    // Higher priority first, then earliest nextRunAt for stable ordering.
    due.sort((a, b) => {
      if (a.priority !== b.priority) return b.priority - a.priority;
      return a.nextRunAt - b.nextRunAt;
    });
    return due;
  }

  async updateRunState(id: string, update: JobRunUpdate): Promise<void> {
    const existing = this.records.get(id);
    if (!existing) {
      logger.worker().warn('Cannot update run state for unknown job', { jobId: id });
      return;
    }
    this.records.set(id, {
      ...existing,
      nextRunAt: update.nextRunAt,
      lastRunAt: update.lastRunAt,
      lastError: update.lastError,
      runCount: update.runCount,
      errorCount: update.errorCount,
      updatedAt: Date.now(),
    });
  }

  async delete(id: string): Promise<void> {
    this.records.delete(id);
  }
}
