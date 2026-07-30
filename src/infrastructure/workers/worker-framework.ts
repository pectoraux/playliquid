/**
 * Worker Framework — background workers with health metrics, concurrency,
 * and graceful shutdown.
 *
 * A `Worker` is a long-running background task that polls for work on a fixed
 * interval. Each worker:
 *   - Has a configurable poll interval
 *   - Supports graceful shutdown (stops polling, awaits the active batch)
 *   - Tracks per-run health metrics (last run, errors, total processed, avg duration)
 *   - Catches errors per-batch so a single failure never crashes the worker
 *   - Supports a concurrency option (max concurrent `processBatch` calls)
 *
 * The `WorkerRegistry` is the top-level lifecycle manager: it owns all workers
 * in the process, exposes their aggregate health, and orchestrates graceful
 * shutdown via registered hooks (used by SIGTERM handlers, etc.).
 *
 * Design notes:
 *   - Health metrics live in `WorkerMetrics`, keyed by worker name. A worker
 *     reports its own health by reading from its `WorkerMetrics` instance.
 *   - The polling loop is based on absolute timestamps + setTimeout: we record
 *     `lastRunAt` from `Date.now()` rather than relying on a monotonic counter
 *     so that clock adjustments surface as health signal rather than drift.
 *   - Shutdown is cooperative: `stop()` flips a flag and awaits in-flight
 *     batches. Workers MUST finish their current batch before resolving.
 */

import { logger } from '@/shared/logging';
import { sleep } from '@/shared/utils';

// ─── Public Interfaces ───────────────────────────────────────────────────

/** A long-running background worker that polls for work. */
export interface Worker {
  readonly name: string;
  readonly pollIntervalMs: number;
  /** Start the polling loop (resolves once the loop is launched). */
  start(): Promise<void>;
  /** Stop polling and wait for the active batch to finish. */
  stop(): Promise<void>;
  /** Whether the polling loop is currently running. */
  isRunning(): boolean;
  /** Snapshot of this worker's health metrics. */
  getHealth(): WorkerHealth;
  /** Execute a single batch and return the number of items processed. */
  processOnce(): Promise<number>;
}

/** Health snapshot for a worker — surfaced via /api/workers and metrics. */
export interface WorkerHealth {
  name: string;
  running: boolean;
  lastRunAt: number | null;
  lastError: string | null;
  totalProcessed: number;
  totalErrors: number;
  avgDurationMs: number;
}

/** Lifecycle hooks for graceful shutdown. */
export interface WorkerLifecycle {
  /** Register a function to run during shutdown (e.g. close connections). */
  registerShutdownHook(fn: () => Promise<void>): void;
  /** Stop all workers and run all shutdown hooks in registration order. */
  shutdown(): Promise<void>;
}

// ─── WorkerMetrics ────────────────────────────────────────────────────────

interface MetricCounters {
  runs: number;
  successes: number;
  failures: number;
  totalProcessed: number;
  totalDurationMs: number;
  lastRunAt: number | null;
  lastError: string | null;
}

/**
 * Per-worker metric aggregator.
 *
 * Tracks runs, successes, failures, items processed, and duration. Designed
 * for low-cardinality use: one instance per worker (or one shared instance
 * keyed by worker name across a registry).
 */
export class WorkerMetrics {
  private readonly countersByName = new Map<string, MetricCounters>();

  /** Register a worker so it always appears in snapshots, even before runs. */
  register(name: string): void {
    if (!this.countersByName.has(name)) {
      this.countersByName.set(name, this.fresh());
    }
  }

  /** Record the outcome of a single batch run. */
  recordRun(name: string, durationMs: number, processed: number, error: string | null): void {
    const counters = this.getOrCreate(name);
    counters.runs += 1;
    counters.totalDurationMs += durationMs;
    counters.totalProcessed += processed;
    counters.lastRunAt = Date.now();
    if (error === null) {
      counters.successes += 1;
      counters.lastError = null;
    } else {
      counters.failures += 1;
      counters.lastError = error;
    }
  }

  /** Snapshot for a single worker. Returns a fresh empty record if unknown. */
  snapshot(name: string): MetricCounters & { avgDurationMs: number } {
    const c = this.getOrCreate(name);
    return {
      ...c,
      avgDurationMs: c.runs > 0 ? c.totalDurationMs / c.runs : 0,
    };
  }

  /** Reset metrics for a worker (e.g. on rebuild). */
  reset(name: string): void {
    this.countersByName.set(name, this.fresh());
  }

  /** Reset all metrics. */
  resetAll(): void {
    for (const name of this.countersByName.keys()) {
      this.reset(name);
    }
  }

  private getOrCreate(name: string): MetricCounters {
    let c = this.countersByName.get(name);
    if (!c) {
      c = this.fresh();
      this.countersByName.set(name, c);
    }
    return c;
  }

  private fresh(): MetricCounters {
    return {
      runs: 0,
      successes: 0,
      failures: 0,
      totalProcessed: 0,
      totalDurationMs: 0,
      lastRunAt: null,
      lastError: null,
    };
  }
}

// ─── BaseWorker ───────────────────────────────────────────────────────────

/** Options shared by every concrete worker. */
export interface WorkerOptions {
  /** Override the poll interval (ms). Defaults to the worker's declared value. */
  pollIntervalMs?: number;
  /** Max concurrent `processBatch` calls in flight. Default: 1. */
  concurrency?: number;
  /** Max batches to drain per poll cycle when work is available. Default: concurrency. */
  maxBatchesPerCycle?: number;
}

/**
 * Abstract base class implementing the polling loop, concurrency, health
 * tracking, and graceful shutdown. Subclasses implement `processBatch`.
 */
export abstract class BaseWorker implements Worker {
  abstract readonly name: string;

  readonly pollIntervalMs: number;
  protected readonly concurrency: number;
  protected readonly maxBatchesPerCycle: number;
  protected readonly metrics = new WorkerMetrics();

  private running = false;
  private readonly activeBatches = new Set<Promise<void>>();
  private loopPromise: Promise<void> | null = null;

  constructor(options: WorkerOptions = {}) {
    this.pollIntervalMs = options.pollIntervalMs ?? this.defaultPollIntervalMs();
    this.concurrency = Math.max(1, options.concurrency ?? 1);
    this.maxBatchesPerCycle = Math.max(1, options.maxBatchesPerCycle ?? this.concurrency);
    // Note: `this.name` is set by the subclass and isn't available here.
    // Metrics auto-register on first `recordRun` / `snapshot` call.
  }

  /** Default poll interval if not overridden via options. */
  protected abstract defaultPollIntervalMs(): number;

  /** Process a single batch and return the number of items processed. */
  protected abstract processBatch(): Promise<number>;

  // ─── Worker interface ──────────────────────────────────────────────────

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    logger.worker().info('Worker started', {
      worker: this.name,
      pollIntervalMs: this.pollIntervalMs,
      concurrency: this.concurrency,
    });
    // Fire-and-forget the loop. We resolve start() immediately so callers
    // (e.g. composition root) aren't blocked.
    this.loopPromise = this.loop().catch((e: unknown) => {
      logger.worker().error('Worker loop crashed', { worker: this.name }, e);
    });
  }

  async stop(): Promise<void> {
    if (!this.running) return;
    this.running = false;
    logger.worker().info('Worker stopping', {
      worker: this.name,
      activeBatches: this.activeBatches.size,
    });
    // Wait for any in-flight batches to complete before resolving.
    if (this.activeBatches.size > 0) {
      await Promise.allSettled([...this.activeBatches]);
    }
    // Allow the loop to finish its current sleep cycle.
    if (this.loopPromise) {
      await this.loopPromise;
    }
    logger.worker().info('Worker stopped', { worker: this.name });
  }

  isRunning(): boolean {
    return this.running;
  }

  getHealth(): WorkerHealth {
    const snap = this.metrics.snapshot(this.name);
    return {
      name: this.name,
      running: this.running,
      lastRunAt: snap.lastRunAt,
      lastError: snap.lastError,
      totalProcessed: snap.totalProcessed,
      totalErrors: snap.failures,
      avgDurationMs: snap.avgDurationMs,
    };
  }

  async processOnce(): Promise<number> {
    return this.processBatch();
  }

  // ─── Loop implementation ──────────────────────────────────────────────

  private async loop(): Promise<void> {
    while (this.running) {
      const cycleStartedAt = Date.now();

      // Kick off up to `maxBatchesPerCycle` batches, respecting the
      // `concurrency` cap on simultaneously in-flight batches.
      let dispatched = 0;
      while (
        this.running &&
        dispatched < this.maxBatchesPerCycle &&
        this.activeBatches.size < this.concurrency
      ) {
        this.dispatchBatch();
        dispatched++;
      }

      // Sleep for the poll interval (absolute end-of-cycle bound: we always
      // wait at least pollIntervalMs minus the time already spent in this
      // cycle, so a slow batch doesn't push the next poll out indefinitely).
      const elapsed = Date.now() - cycleStartedAt;
      const wait = Math.max(0, this.pollIntervalMs - elapsed);
      await sleep(wait);
    }

    // Drain any remaining in-flight batches on shutdown.
    if (this.activeBatches.size > 0) {
      await Promise.allSettled([...this.activeBatches]);
    }
  }

  /** Launch a single batch and track it in `activeBatches`. */
  private dispatchBatch(): void {
    const batchPromise = (async () => {
      const startedAt = Date.now();
      let processed = 0;
      let error: string | null = null;
      try {
        processed = await this.processBatch();
      } catch (e: unknown) {
        error = e instanceof Error ? e.message : String(e);
        logger.worker().error('Worker batch failed', { worker: this.name }, e);
      } finally {
        const durationMs = Date.now() - startedAt;
        this.metrics.recordRun(this.name, durationMs, processed, error);
        if (processed > 0 || error !== null) {
          logger.worker().debug('Worker batch complete', {
            worker: this.name,
            processed,
            durationMs,
            error,
          });
        }
      }
    })();

    this.activeBatches.add(batchPromise);
    batchPromise.finally(() => {
      this.activeBatches.delete(batchPromise);
    });
  }
}

// ─── WorkerRegistry ───────────────────────────────────────────────────────

/**
 * Registry + lifecycle manager for all workers in the process.
 *
 * Owns the worker set, exposes aggregate health, and orchestrates graceful
 * shutdown via `WorkerLifecycle`. Typically resolved from the DI container
 * and bound to a SIGTERM/SIGINT handler in the process entrypoint.
 */
export class WorkerRegistry implements WorkerLifecycle {
  private readonly workers = new Map<string, Worker>();
  private readonly shutdownHooks: Array<() => Promise<void>> = [];
  private started = false;

  /** Register a worker. Does not start it. */
  register(worker: Worker): void {
    if (this.workers.has(worker.name)) {
      logger.worker().warn('Duplicate worker registration, overwriting', { worker: worker.name });
    }
    this.workers.set(worker.name, worker);
  }

  /** Get a registered worker by name. */
  get(name: string): Worker | undefined {
    return this.workers.get(name);
  }

  /** Start all registered workers. Idempotent. */
  async startAll(): Promise<void> {
    if (this.started) return;
    this.started = true;
    logger.worker().info('Starting all workers', { count: this.workers.size });
    for (const worker of this.workers.values()) {
      await worker.start();
    }
  }

  /** Stop all registered workers (graceful). */
  async stopAll(): Promise<void> {
    logger.worker().info('Stopping all workers', { count: this.workers.size });
    await Promise.all(
      Array.from(this.workers.values()).map((w) =>
        w.stop().catch((e: unknown) => {
          logger.worker().error('Error stopping worker', { worker: w.name }, e);
        }),
      ),
    );
  }

  /** Snapshot health for every registered worker. */
  getHealth(): WorkerHealth[] {
    return Array.from(this.workers.values()).map((w) => w.getHealth());
  }

  /** List registered worker names. */
  list(): string[] {
    return Array.from(this.workers.keys());
  }

  // ─── WorkerLifecycle ──────────────────────────────────────────────────

  registerShutdownHook(fn: () => Promise<void>): void {
    this.shutdownHooks.push(fn);
  }

  async shutdown(): Promise<void> {
    logger.worker().info('Shutdown initiated', {
      workers: this.workers.size,
      hooks: this.shutdownHooks.length,
    });
    // 1. Stop polling all workers (they will finish their active batch).
    await this.stopAll();
    // 2. Run shutdown hooks in registration order.
    for (const hook of this.shutdownHooks) {
      try {
        await hook();
      } catch (e: unknown) {
        logger.worker().error('Shutdown hook failed', {}, e);
      }
    }
    logger.worker().info('Shutdown complete');
  }
}
