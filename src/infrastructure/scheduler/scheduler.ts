/**
 * Scheduler — time-based job execution with distributed-lock coordination.
 *
 * Supports three schedule kinds:
 *   - `cron`:        standard 5-field cron expressions (minute hour dom month dow)
 *   - `fixed_rate`:  recurring at a fixed interval (ms)
 *   - `one_time`:    runs once at a specific timestamp
 *
 * Key properties:
 *   - **Clock-drift safe**: all scheduling decisions use absolute timestamps
 *     (`Date.now()`) compared against `nextRunAt`. We never rely on a
 *     monotonic counter or a single `setTimeout(intervalMs)`.
 *   - **Multi-instance safe**: each job execution is guarded by a distributed
 *     lock (`scheduler:job:<id>`). If another instance holds the lock, the
 *     job is skipped on this tick and retried on the next.
 *   - **Priority-ordered**: when multiple jobs are due simultaneously, higher
 *     `priority` values run first.
 *   - **Persisted state**: job state (nextRunAt, lastRunAt, run/error counts)
 *     is persisted via `ScheduledJobStore` so jobs survive restarts.
 *   - **Graceful shutdown**: `stop()` waits for in-flight handlers to finish.
 */

import type { Lock, LockProvider } from '@/infrastructure/locking/lock-provider';
import type {
  JobRunUpdate,
  ScheduledJobRecord,
  ScheduledJobStore,
} from '@/infrastructure/scheduler/scheduled-job-model';
import { InMemoryScheduledJobStore } from '@/infrastructure/scheduler/scheduled-job-model';
import { logger } from '@/shared/logging';
import { sleep } from '@/shared/utils';

// ─── Public Types ────────────────────────────────────────────────────────

export type JobSchedule =
  | { kind: 'cron'; expression: string }
  | { kind: 'fixed_rate'; intervalMs: number }
  | { kind: 'one_time'; runAt: number };

export interface ScheduledJob {
  id: string;
  name: string;
  schedule: JobSchedule;
  handler: () => Promise<void>;
  /** Higher priority runs first when multiple jobs are due. Default: 0. */
  priority: number;
  enabled: boolean;
}

export interface Scheduler {
  schedule(job: ScheduledJob): void;
  unschedule(jobId: string): void;
  start(): void;
  stop(): Promise<void>;
  listJobs(): ScheduledJob[];
}

export interface SchedulerOptions {
  /** How often the scheduler checks for due jobs. Default: 1000ms. */
  tickIntervalMs?: number;
  /** TTL for the per-job execution lock. Default: 60s. */
  lockTtlSeconds?: number;
  /** Persistence backend. Default: in-memory. */
  store?: ScheduledJobStore;
  /** Distributed lock provider. Required for multi-instance safety. */
  lockProvider: LockProvider;
}

// ─── Cron Parser ──────────────────────────────────────────────────────────

/**
 * Minimal 5-field cron parser supporting:
 *   - wildcard (`*`)
 *   - single values (`5`)
 *   - ranges (`1-5`)
 *   - lists (`1,3,5`)
 *   - step values (wildcard/15, 1-30/5)
 *
 * Day-of-week uses 0 = Sunday, 6 = Saturday (standard cron).
 *
 * NOTE: When both day-of-month and day-of-week are restricted (not wildcard), cron
 * semantics use OR — a match on either field is sufficient. This matches the
 * behavior of standard cron implementations.
 */
class CronField {
  private readonly allowed: ReadonlySet<number>;

  constructor(
    private readonly field: string,
    private readonly min: number,
    private readonly max: number,
  ) {
    this.allowed = this.parse(field, min, max);
  }

  matches(value: number): boolean {
    return this.allowed.has(value);
  }

  private parse(field: string, min: number, max: number): Set<number> {
    const result = new Set<number>();
    for (const part of field.split(',')) {
      this.parsePart(part.trim(), min, max, result);
    }
    return result;
  }

  private parsePart(part: string, min: number, max: number, out: Set<number>): void {
    if (part.length === 0) return;

    const [rangePart, stepPart] = part.split('/');
    const step = stepPart ? this.parseIntStrict(stepPart) : 1;
    if (step <= 0) throw new Error(`Invalid step in cron field: ${part}`);

    let start: number;
    let end: number;

    if (rangePart === '*' || rangePart === '') {
      start = min;
      end = max;
    } else if (rangePart.includes('-')) {
      const [s, e] = rangePart.split('-');
      start = this.parseIntStrict(s);
      end = this.parseIntStrict(e);
      if (start < min || end > max || start > end) {
        throw new Error(`Range out of bounds in cron field: ${part}`);
      }
    } else {
      start = this.parseIntStrict(rangePart);
      end = max; // for `N/step` semantics, run from N to end of range
      if (start < min || start > max) {
        throw new Error(`Value out of bounds in cron field: ${part}`);
      }
    }

    for (let v = start; v <= end; v += step) {
      out.add(v);
    }
  }

  private parseIntStrict(s: string): number {
    const trimmed = s.trim();
    if (!/^\d+$/.test(trimmed)) {
      throw new Error(`Invalid integer in cron field: ${s}`);
    }
    return parseInt(trimmed, 10);
  }
}

/** Parsed 5-field cron expression. */
export class CronExpression {
  private readonly minute: CronField;
  private readonly hour: CronField;
  private readonly dayOfMonth: CronField;
  private readonly month: CronField;
  private readonly dayOfWeek: CronField;
  private readonly domRestricted: boolean;
  private readonly dowRestricted: boolean;

  constructor(expression: string) {
    const parts = expression.trim().split(/\s+/);
    if (parts.length !== 5) {
      throw new Error(
        `Invalid cron expression "${expression}": expected 5 fields, got ${parts.length}`,
      );
    }
    this.minute = new CronField(parts[0], 0, 59);
    this.hour = new CronField(parts[1], 0, 23);
    this.dayOfMonth = new CronField(parts[2], 1, 31);
    this.month = new CronField(parts[3], 1, 12);
    this.dayOfWeek = new CronField(parts[4], 0, 6);
    this.domRestricted = parts[2] !== '*';
    this.dowRestricted = parts[4] !== '*';
  }

  /** Whether the given date matches this cron expression. */
  matches(date: Date): boolean {
    const m = date.getUTCMinutes();
    const h = date.getUTCHours();
    const dom = date.getUTCDate();
    const mon = date.getUTCMonth() + 1;
    const dow = date.getUTCDay();

    if (!this.minute.matches(m)) return false;
    if (!this.hour.matches(h)) return false;
    if (!this.month.matches(mon)) return false;

    // Standard cron OR semantics when both DoM and DoW are restricted.
    if (this.domRestricted && this.dowRestricted) {
      return this.dayOfMonth.matches(dom) || this.dayOfWeek.matches(dow);
    }
    if (this.domRestricted) return this.dayOfMonth.matches(dom);
    if (this.dowRestricted) return this.dayOfWeek.matches(dow);
    return true;
  }

  /**
   * Compute the next match strictly after `fromMs` (epoch ms).
   * Iterates minute-by-minute up to 4 years (~2.1M iterations max) to handle
   * leap-day expressions like "0 0 29 2 *".
   */
  nextRunAfter(fromMs: number): number {
    // Start at the next minute boundary after `fromMs`.
    const start = new Date(fromMs);
    start.setUTCSeconds(0, 0);
    start.setUTCMinutes(start.getUTCMinutes() + 1);

    const maxIterations = 4 * 366 * 24 * 60; // ~4 years
    for (let i = 0; i < maxIterations; i++) {
      if (this.matches(start)) {
        return start.getTime();
      }
      start.setUTCMinutes(start.getUTCMinutes() + 1);
    }
    throw new Error(
      `No cron match found within 4 years — expression may be unsatisfiable`,
    );
  }
}

// ─── InMemoryScheduler ────────────────────────────────────────────────────

/**
 * In-memory scheduler with optional persistent state and distributed-lock
 * coordination.
 *
 * Usage:
 *   const scheduler = new InMemoryScheduler({ lockProvider });
 *   scheduler.schedule({ id: 'tick', name: 'Tick', schedule: { kind: 'fixed_rate', intervalMs: 5000 }, handler: async () => {...}, priority: 0, enabled: true });
 *   scheduler.start();
 *   // ... later
 *   await scheduler.stop();
 */
export class InMemoryScheduler implements Scheduler {
  private readonly tickIntervalMs: number;
  private readonly lockTtlSeconds: number;
  private readonly store: ScheduledJobStore;
  private readonly lockProvider: LockProvider;
  private readonly handlers = new Map<string, () => Promise<void>>();
  private readonly schedules = new Map<string, JobSchedule>();

  private running = false;
  private loopPromise: Promise<void> | null = null;
  private readonly activeRuns = new Set<Promise<void>>();

  constructor(options: SchedulerOptions) {
    this.tickIntervalMs = options.tickIntervalMs ?? 1000;
    this.lockTtlSeconds = options.lockTtlSeconds ?? 60;
    this.store = options.store ?? new InMemoryScheduledJobStore();
    this.lockProvider = options.lockProvider;
  }

  // ─── Scheduler interface ──────────────────────────────────────────────

  schedule(job: ScheduledJob): void {
    if (this.handlers.has(job.id)) {
      logger.worker().warn('Overwriting existing scheduled job', { jobId: job.id });
    }
    this.handlers.set(job.id, job.handler);
    this.schedules.set(job.id, job.schedule);

    // Compute initial nextRunAt and persist synchronously (fire-and-forget
    // is fine — start() will recover from the store).
    const nextRunAt = this.computeInitialNextRunAt(job.schedule, Date.now());
    const record: ScheduledJobRecord = {
      id: job.id,
      name: job.name,
      scheduleKind: job.schedule.kind,
      scheduleValue: this.serializeSchedule(job.schedule),
      priority: job.priority,
      enabled: job.enabled,
      nextRunAt,
      lastRunAt: null,
      lastError: null,
      runCount: 0,
      errorCount: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    void this.store.save(record).catch((e: unknown) => {
      logger.worker().error('Failed to persist scheduled job', { jobId: job.id }, e);
    });

    logger.worker().info('Scheduled job registered', {
      jobId: job.id,
      name: job.name,
      kind: job.schedule.kind,
      priority: job.priority,
      nextRunAt: new Date(nextRunAt).toISOString(),
    });
  }

  unschedule(jobId: string): void {
    this.handlers.delete(jobId);
    this.schedules.delete(jobId);
    void this.store.delete(jobId).catch((e: unknown) => {
      logger.worker().error('Failed to delete scheduled job', { jobId }, e);
    });
    logger.worker().info('Scheduled job removed', { jobId });
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    logger.worker().info('Scheduler started', { tickIntervalMs: this.tickIntervalMs });
    this.loopPromise = this.loop().catch((e: unknown) => {
      logger.worker().error('Scheduler loop crashed', {}, e);
    });
  }

  async stop(): Promise<void> {
    if (!this.running) return;
    this.running = false;
    logger.worker().info('Scheduler stopping', { activeRuns: this.activeRuns.size });
    if (this.loopPromise) {
      await this.loopPromise;
    }
    if (this.activeRuns.size > 0) {
      await Promise.allSettled([...this.activeRuns]);
    }
    logger.worker().info('Scheduler stopped');
  }

  listJobs(): ScheduledJob[] {
    const result: ScheduledJob[] = [];
    for (const [id, handler] of this.handlers) {
      const schedule = this.schedules.get(id);
      if (!schedule) continue;
      result.push({
        id,
        name: id,
        schedule,
        handler,
        priority: 0,
        enabled: true,
      });
    }
    return result;
  }

  // ─── Internal: loop ───────────────────────────────────────────────────

  private async loop(): Promise<void> {
    while (this.running) {
      const cycleStartedAt = Date.now();
      try {
        await this.tick();
      } catch (e: unknown) {
        logger.worker().error('Scheduler tick failed', {}, e);
      }
      const elapsed = Date.now() - cycleStartedAt;
      const wait = Math.max(0, this.tickIntervalMs - elapsed);
      await sleep(wait);
    }
  }

  private async tick(): Promise<void> {
    const now = Date.now();
    const due = await this.store.loadDue(now);
    if (due.length === 0) return;

    // Priority is already applied by loadDue, but we re-sort defensively.
    due.sort((a, b) => {
      if (a.priority !== b.priority) return b.priority - a.priority;
      return a.nextRunAt - b.nextRunAt;
    });

    for (const record of due) {
      if (!this.running) break;
      const handler = this.handlers.get(record.id);
      if (!handler) {
        // Orphaned record (handler removed but store not yet updated). Skip.
        continue;
      }
      if (!record.enabled) continue;

      // Dispatch in the background — we never block the tick on a handler.
      this.dispatchRun(record, handler);
    }
  }

  private dispatchRun(
    record: ScheduledJobRecord,
    handler: () => Promise<void>,
  ): void {
    const runPromise = (async () => {
      const lockKey = `scheduler:job:${record.id}`;
      let lock: Lock | null = null;
      try {
        lock = await this.lockProvider.acquire(lockKey, this.lockTtlSeconds);
        if (lock === null) {
          // Another instance is running this job. Skip this tick.
          logger.worker().debug('Scheduler lock held by another instance', {
            jobId: record.id,
          });
          return;
        }

        const startedAt = Date.now();
        let error: string | null = null;
        try {
          await handler();
        } catch (e: unknown) {
          error = e instanceof Error ? e.message : String(e);
          logger.worker().error('Scheduled job handler failed', {
            jobId: record.id,
            jobName: record.name,
          }, e);
        }

        const now = Date.now();
        const schedule = this.schedules.get(record.id) ?? this.deserializeSchedule(record);
        const isOneTime = schedule.kind === 'one_time';

        const update: JobRunUpdate = {
          nextRunAt: isOneTime
            ? Number.MAX_SAFE_INTEGER // sentinel: record will be deleted below
            : this.computeNextRunAt(schedule, now),
          lastRunAt: now,
          lastError: error,
          runCount: record.runCount + 1,
          errorCount: error === null ? record.errorCount : record.errorCount + 1,
        };

        if (isOneTime) {
          await this.store.delete(record.id);
          this.handlers.delete(record.id);
          this.schedules.delete(record.id);
          logger.worker().info('One-time job completed and removed', {
            jobId: record.id,
            durationMs: Date.now() - startedAt,
            error,
          });
        } else {
          await this.store.updateRunState(record.id, update);
          logger.worker().debug('Scheduled job run recorded', {
            jobId: record.id,
            durationMs: Date.now() - startedAt,
            nextRunAt: new Date(update.nextRunAt).toISOString(),
            error,
          });
        }
      } catch (e: unknown) {
        logger.worker().error('Scheduler dispatch failed', { jobId: record.id }, e);
      } finally {
        if (lock) {
          try {
            await this.lockProvider.release(lock);
          } catch {
            // Ignore — the TTL will reclaim the lock if release fails.
          }
        }
      }
    })();

    this.activeRuns.add(runPromise);
    runPromise.finally(() => {
      this.activeRuns.delete(runPromise);
    });
  }

  // ─── Internal: schedule math ──────────────────────────────────────────

  private computeInitialNextRunAt(schedule: JobSchedule, now: number): number {
    switch (schedule.kind) {
      case 'cron':
        return new CronExpression(schedule.expression).nextRunAfter(now);
      case 'fixed_rate':
        return now + schedule.intervalMs;
      case 'one_time':
        return schedule.runAt;
    }
  }

  private computeNextRunAt(schedule: JobSchedule, after: number): number {
    switch (schedule.kind) {
      case 'cron':
        return new CronExpression(schedule.expression).nextRunAfter(after);
      case 'fixed_rate':
        return after + schedule.intervalMs;
      case 'one_time':
        return Number.MAX_SAFE_INTEGER;
    }
  }

  private serializeSchedule(schedule: JobSchedule): string {
    switch (schedule.kind) {
      case 'cron':
        return schedule.expression;
      case 'fixed_rate':
        return String(schedule.intervalMs);
      case 'one_time':
        return new Date(schedule.runAt).toISOString();
    }
  }

  private deserializeSchedule(record: ScheduledJobRecord): JobSchedule {
    switch (record.scheduleKind) {
      case 'cron':
        return { kind: 'cron', expression: record.scheduleValue };
      case 'fixed_rate':
        return { kind: 'fixed_rate', intervalMs: parseInt(record.scheduleValue, 10) };
      case 'one_time':
        return { kind: 'one_time', runAt: new Date(record.scheduleValue).getTime() };
    }
  }
}

// ─── DI Tokens ────────────────────────────────────────────────────────────

export const SCHEDULER_TOKENS = {
  Scheduler: 'Scheduler',
  ScheduledJobStore: 'ScheduledJobStore',
} as const;
