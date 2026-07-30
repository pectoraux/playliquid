/**
 * Disaster Recovery — mode coordination, startup recovery, projection replay,
 * and graceful shutdown orchestration.
 *
 * Complements `production-operations.ts` (which provides the lower-level
 * `MaintenanceMode`, `GracefulShutdownManager`, `ReadinessGate`, and
 * `ProductionStartupValidator` primitives). This module wires those concepts
 * into a single service that an operator can drive via API endpoints or a
 * CLI:
 *
 *   - Mode coordination (`enterRecoveryMode` / `enterMaintenanceMode`):
 *     flips file-based flags in the project root AND optionally writes a
 *     Redis key so every instance in a cluster observes the mode change.
 *     Maintenance takes precedence over recovery when both are active.
 *
 *   - `runStartupRecovery()`: runs at boot to resolve state left behind by
 *     an unclean shutdown. Resets stuck outbox messages, detects projection
 *     lag (and triggers replay), purges expired idempotency records (the
 *     closest analog to "expired sessions" — auth session storage is not
 *     modelled here), and releases stale distributed locks held in Redis.
 *
 *   - `replayProjections()`: delegates to `ProjectionEngine.rebuild()` to
 *     regenerate every materialised read model from the event store.
 *
 *   - `gracefulShutdown(timeoutMs)`: drains workers via `WorkerRegistry`,
 *     then closes the database connection. Honours a hard timeout so a
 *     stuck worker cannot keep the process alive past Kubernetes'
 *     `terminationGracePeriodSeconds`.
 *
 * Mode flag file format (UTF-8):
 *   Line 1: ISO timestamp when the mode was entered.
 *   Line 2: the human-readable reason supplied by the operator.
 */

import type { RedisClient } from '@/infrastructure/redis/redis-client';
import type { LockProvider } from '@/infrastructure/locking/lock-provider';
import type { ProjectionEngine } from '@/infrastructure/projections/projection-engine';
import type { WorkerRegistry } from '@/infrastructure/workers/worker-framework';
import { getClient, prisma } from '@/infrastructure/database/prisma';
import { logger } from '@/shared/logging';
import { existsSync, readFileSync } from 'node:fs';
import { unlink, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

// ─── Public types (exactly per task spec) ────────────────────────────────

export type RecoveryMode = 'normal' | 'recovery' | 'maintenance';

export interface StartupRecoveryReport {
  incompleteOutboxMessages: number;
  stuckProjections: number;
  expiredSessions: number;
  staleLocks: number;
  actions: string[];
}

export interface DisasterRecoveryService {
  enterRecoveryMode(reason: string): Promise<void>;
  exitRecoveryMode(): Promise<void>;
  enterMaintenanceMode(reason: string): Promise<void>;
  exitMaintenanceMode(): Promise<void>;
  getMode(): RecoveryMode;
  getReason(): string | null;

  /** Checks for incomplete operations and resolves them. Run at boot. */
  runStartupRecovery(): Promise<StartupRecoveryReport>;

  /** Rebuilds read models from the event store. */
  replayProjections(): Promise<void>;

  /** Drains workers and closes connections. Honours a hard timeout. */
  gracefulShutdown(timeoutMs: number): Promise<void>;
}

// ─── Implementation constants ────────────────────────────────────────────

/** Redis key namespace for mode flags. */
const REDIS_KEY_RECOVERY = 'dr:mode:recovery';
const REDIS_KEY_MAINTENANCE = 'dr:mode:maintenance';
/** TTL for the Redis mode keys — refresh on every `enter*` call. */
const MODE_REDIS_TTL_SECONDS = 24 * 60 * 60;

/** Outbox messages pending for longer than this are considered stuck. */
const DEFAULT_OUTBOX_STALE_MS = 5 * 60 * 1000;
/** Projections lagging by more than this many events trigger a replay. */
const DEFAULT_PROJECTION_LAG = 1000;

/** Filename for the recovery-mode flag file. */
const RECOVERY_FLAG_FILE = '.recovery-mode';
/** Filename for the maintenance-mode flag file. */
const MAINTENANCE_FLAG_FILE = '.maintenance-mode';

export interface DefaultDisasterRecoveryServiceOptions {
  /** Directory for the mode-flag files. Default: process.cwd(). */
  modeDir?: string;
  /** Optional Redis client for cluster-wide mode propagation + lock cleanup. */
  redisClient?: RedisClient;
  /** Optional lock provider — unused for in-memory providers (cannot introspect). */
  lockProvider?: LockProvider;
  /** Required: used by `replayProjections()`. */
  projectionEngine: ProjectionEngine;
  /** Required: drained by `gracefulShutdown()`. */
  workerRegistry: WorkerRegistry;
  /** Outbox message staleness threshold. Default: 5 min. */
  outboxStaleMs?: number;
  /** Projection lag threshold (in events). Default: 1000. */
  projectionLagThreshold?: number;
}

/**
 * Default disaster-recovery service. Coordinates mode flags, runs startup
 * recovery, replays projections on demand, and orchestrates graceful shutdown.
 */
export class DefaultDisasterRecoveryService implements DisasterRecoveryService {
  private readonly modeDir: string;
  private readonly redisClient: RedisClient | undefined;
  private readonly lockProvider: LockProvider | undefined;
  private readonly projectionEngine: ProjectionEngine;
  private readonly workerRegistry: WorkerRegistry;
  private readonly outboxStaleMs: number;
  private readonly projectionLagThreshold: number;

  constructor(options: DefaultDisasterRecoveryServiceOptions) {
    this.modeDir = resolve(options.modeDir ?? process.cwd());
    this.redisClient = options.redisClient;
    this.lockProvider = options.lockProvider;
    this.projectionEngine = options.projectionEngine;
    this.workerRegistry = options.workerRegistry;
    this.outboxStaleMs = options.outboxStaleMs ?? DEFAULT_OUTBOX_STALE_MS;
    this.projectionLagThreshold = options.projectionLagThreshold ?? DEFAULT_PROJECTION_LAG;
  }

  // ─── Mode coordination ───────────────────────────────────────────────

  async enterRecoveryMode(reason: string): Promise<void> {
    await this.writeModeFlag(RECOVERY_FLAG_FILE, reason);
    if (this.redisClient) {
      await this.redisClient.set(REDIS_KEY_RECOVERY, reason, MODE_REDIS_TTL_SECONDS);
    }
    logger.system().warn('Entered RECOVERY mode', { reason });
  }

  async exitRecoveryMode(): Promise<void> {
    await this.clearModeFlag(RECOVERY_FLAG_FILE);
    if (this.redisClient) {
      await this.redisClient.del(REDIS_KEY_RECOVERY);
    }
    logger.system().info('Exited RECOVERY mode');
  }

  async enterMaintenanceMode(reason: string): Promise<void> {
    await this.writeModeFlag(MAINTENANCE_FLAG_FILE, reason);
    if (this.redisClient) {
      await this.redisClient.set(REDIS_KEY_MAINTENANCE, reason, MODE_REDIS_TTL_SECONDS);
    }
    logger.system().warn('Entered MAINTENANCE mode', { reason });
  }

  async exitMaintenanceMode(): Promise<void> {
    await this.clearModeFlag(MAINTENANCE_FLAG_FILE);
    if (this.redisClient) {
      await this.redisClient.del(REDIS_KEY_MAINTENANCE);
    }
    logger.system().info('Exited MAINTENANCE mode');
  }

  /**
   * Returns the current mode. Maintenance takes precedence over recovery
   * (you can't be "just recovering" if you're also in maintenance).
   *
   * Synchronous: checks the on-disk flag files only. Redis is async and
   * cannot be consulted from a sync getter; instances that observe a mode
   * change via Redis should call `enter*Mode()` locally to materialise the
   * flag file so subsequent `getMode()` calls return the correct value.
   */
  getMode(): RecoveryMode {
    if (existsSync(join(this.modeDir, MAINTENANCE_FLAG_FILE))) return 'maintenance';
    if (existsSync(join(this.modeDir, RECOVERY_FLAG_FILE))) return 'recovery';
    return 'normal';
  }

  /**
   * Returns the reason for the active mode, or null if no mode is active.
   * Maintenance reason takes precedence over recovery reason.
   *
   * Synchronous: reads from the on-disk flag file only. Redis-stored reasons
   * (set by another instance) are NOT visible here — use `getReasonAsync()`
   * if you need cluster-wide authority.
   */
  getReason(): string | null {
    const maintReason = this.readModeFlagSync(MAINTENANCE_FLAG_FILE);
    if (maintReason !== null) return maintReason;
    return this.readModeFlagSync(RECOVERY_FLAG_FILE);
  }

  /**
   * Async reason lookup that also checks Redis. Use when you need
   * cluster-wide authority (the mode may have been set on another instance
   * and the local flag file may not yet exist).
   */
  async getReasonAsync(): Promise<string | null> {
    const local = this.getReason();
    if (local !== null) return local;
    if (this.redisClient) {
      const maint = await this.redisClient.get(REDIS_KEY_MAINTENANCE);
      if (maint) return maint;
      const recovery = await this.redisClient.get(REDIS_KEY_RECOVERY);
      if (recovery) return recovery;
    }
    return null;
  }

  // ─── Startup recovery ────────────────────────────────────────────────

  async runStartupRecovery(): Promise<StartupRecoveryReport> {
    const actions: string[] = [];
    logger.system().info('Startup recovery starting');

    // 1. Reset stuck outbox messages.
    const incompleteOutbox = await this.resetStuckOutboxMessages(actions);

    // 2. Detect projection lag and replay if necessary.
    const stuckProjections = await this.detectAndReplayStuckProjections(actions);

    // 3. Purge expired idempotency records (closest analog to expired sessions).
    const expiredSessions = await this.purgeExpiredIdempotencyRecords(actions);

    // 4. Release stale distributed locks (Redis-backed only).
    const staleLocks = await this.releaseStaleLocks(actions);

    const report: StartupRecoveryReport = {
      incompleteOutboxMessages: incompleteOutbox,
      stuckProjections,
      expiredSessions,
      staleLocks,
      actions,
    };
    logger.system().info('Startup recovery complete', { ...report });
    return report;
  }

  // ─── Projection replay ───────────────────────────────────────────────

  async replayProjections(): Promise<void> {
    logger.system().warn('Replaying all projections from the event store');
    await this.projectionEngine.rebuild();
    logger.system().info('Projection replay complete');
  }

  // ─── Graceful shutdown ───────────────────────────────────────────────

  async gracefulShutdown(timeoutMs: number): Promise<void> {
    logger.system().warn('Graceful shutdown initiated', { timeoutMs });

    // Race the shutdown against a hard timeout. If the timeout fires first,
    // log loudly and force-exit so the orchestrator (Kubernetes) can restart
    // us — a partially-drained process is worse than a clean restart.
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      logger.system().error('Graceful shutdown timed out — force-exiting', { timeoutMs });
      process.exit(1);
    }, timeoutMs);

    try {
      // 1. Drain workers + run shutdown hooks (closes queues, etc.).
      await this.workerRegistry.shutdown();

      // 2. Close the Prisma connection pool.
      try {
        await prisma.$disconnect();
        logger.system().info('Prisma disconnected');
      } catch (e: unknown) {
        logger.system().error('Prisma disconnect failed during shutdown', {}, e);
      }

      // 3. Close Redis if we own a connection. We only call flush() if the
      // caller explicitly asks — destroying shared state would be bad.
      // (Left as a no-op: the redis-client module manages its own lifecycle.)
    } finally {
      clearTimeout(timeout);
    }

    if (timedOut) return; // process.exit already called
    logger.system().info('Graceful shutdown complete');
  }

  // ─── Internals: mode flag files ──────────────────────────────────────

  private async writeModeFlag(filename: string, reason: string): Promise<void> {
    const path = join(this.modeDir, filename);
    await mkdir(dirname(path), { recursive: true });
    const content = `${new Date().toISOString()}\n${reason}\n`;
    await writeFile(path, content, 'utf8');
  }

  private async clearModeFlag(filename: string): Promise<void> {
    const path = join(this.modeDir, filename);
    try {
      await unlink(path);
    } catch {
      // Already absent — fine.
      logger.system().debug('Mode flag file already absent', { path });
    }
  }

  /**
   * Synchronously read the reason from a mode flag file. Returns null if
   * the file does not exist or cannot be parsed.
   *
   * Used by the sync `getReason()` getter. The file format is:
   *   Line 1: ISO timestamp
   *   Line 2: reason
   */
  private readModeFlagSync(filename: string): string | null {
    const path = join(this.modeDir, filename);
    try {
      const content = readFileSync(path, 'utf8');
      const lines = content.split('\n');
      return lines[1]?.trim() || null;
    } catch {
      return null;
    }
  }

  // ─── Internals: startup recovery steps ───────────────────────────────

  /**
   * Find outbox messages that have been `pending` for longer than the
   * staleness threshold AND have at least one prior retry (i.e. they have
   * been attempted and failed before). Reset their retryCount/error so the
   * publisher will pick them up again cleanly.
   *
   * Messages with retryCount=0 that are simply waiting their turn are NOT
   * considered stuck — they will be picked up on the next poll.
   */
  private async resetStuckOutboxMessages(actions: string[]): Promise<number> {
    const cutoff = new Date(Date.now() - this.outboxStaleMs);
    try {
      const client = getClient();
      const stuck = await client.outboxMessage.findMany({
        where: {
          status: 'pending',
          retryCount: { gt: 0 },
          updatedAt: { lt: cutoff },
        },
        select: { eventId: true },
      });
      if (stuck.length === 0) return 0;

      const eventIds = stuck.map((s) => s.eventId);
      await client.outboxMessage.updateMany({
        where: { eventId: { in: eventIds } },
        data: { retryCount: 0, error: null, updatedAt: new Date() },
      });
      const action = `Reset ${stuck.length} stuck outbox message(s) older than ${this.outboxStaleMs}ms`;
      actions.push(action);
      logger.system().warn('Reset stuck outbox messages', { count: stuck.length });
      return stuck.length;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      actions.push(`Failed to reset stuck outbox messages: ${msg}`);
      logger.system().error('Outbox staleness check failed', {}, e);
      return 0;
    }
  }

  /**
   * Compare each projector's checkpoint to the latest EventRecord row id.
   * If the lag exceeds the threshold, count the projector as stuck and
   * trigger a full rebuild.
   *
   * Returns the number of stuck projectors found (before the rebuild — the
   * rebuild itself runs once if any projector is stuck).
   */
  private async detectAndReplayStuckProjections(actions: string[]): Promise<number> {
    try {
      const client = getClient();
      // Find the highest autoincrement id in the event store — that's the
      // "head" of the log.
      const latest = await client.eventRecord.findFirst({
        orderBy: { id: 'desc' },
        select: { id: true },
      });
      const headRowId = latest?.id ?? 0;

      const checkpoints = await client.projectionCheckpoint.findMany({
        select: { projectionName: true, lastEventRowId: true },
      });
      const stuck = checkpoints.filter(
        (c) => headRowId - c.lastEventRowId > this.projectionLagThreshold,
      );

      if (stuck.length === 0) return 0;

      const names = stuck.map((s) => s.projectionName).join(', ');
      const action = `Projections lagging > ${this.projectionLagThreshold} events (head=${headRowId}): ${names}. Triggering replay.`;
      actions.push(action);
      logger.system().warn('Projection lag detected — triggering replay', {
        headRowId,
        stuck: stuck.map((s) => ({
          projection: s.projectionName,
          lastRowId: s.lastEventRowId,
          lag: headRowId - s.lastEventRowId,
        })),
      });

      // Replay once — `rebuild()` resets every projector and replays from 0.
      await this.replayProjections();
      return stuck.length;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      actions.push(`Failed to detect projection lag: ${msg}`);
      logger.system().error('Projection lag check failed', {}, e);
      return 0;
    }
  }

  /**
   * Purge expired idempotency records. The schema has no Session table for
   * auth sessions — IdempotencyRecord.expiresAt is the closest analog to a
   * "session that should be cleaned up after expiry". Counts as
   * `expiredSessions` in the report.
   */
  private async purgeExpiredIdempotencyRecords(actions: string[]): Promise<number> {
    try {
      const client = getClient();
      const now = new Date();
      // count first, then delete — gives a stable number for the report.
      const expired = await client.idempotencyRecord.count({
        where: { expiresAt: { lt: now } },
      });
      if (expired === 0) return 0;

      await client.idempotencyRecord.deleteMany({
        where: { expiresAt: { lt: now } },
      });
      const action = `Purged ${expired} expired idempotency record(s) (session analog)`;
      actions.push(action);
      logger.system().info('Purged expired idempotency records', { count: expired });
      return expired;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      actions.push(`Failed to purge expired idempotency records: ${msg}`);
      logger.system().error('Idempotency purge failed', {}, e);
      return 0;
    }
  }

  /**
   * Release stale distributed locks. Requires a RedisClient — in-memory
   * locks cannot be introspected without modifying the LockProvider
   * interface, so they are skipped (and logged).
   *
   * A lock is "stale" if:
   *   - It exists in Redis but has no TTL (TTL = -1) — these were never
   *     given an expiry and may have been abandoned.
   *   - The TTL is non-positive (-2 means the key doesn't exist; -1 means
   *     no expiry). We only delete keys with TTL = -1.
   *
   * Locks with a positive TTL will expire on their own — we don't touch them.
   */
  private async releaseStaleLocks(actions: string[]): Promise<number> {
    if (!this.redisClient) {
      actions.push('Stale-lock cleanup skipped: no RedisClient configured');
      return 0;
    }

    try {
      const keys = await this.redisClient.keys('lock:*');
      let staleCount = 0;
      for (const key of keys) {
        const ttl = await this.redisClient.ttl(key);
        // TTL = -1 means the key exists but has no expiry — likely abandoned.
        if (ttl === -1) {
          await this.redisClient.del(key);
          staleCount++;
        }
      }
      if (staleCount > 0) {
        const action = `Released ${staleCount} stale Redis lock(s) (no expiry)`;
        actions.push(action);
        logger.system().warn('Released stale Redis locks', { count: staleCount });
      }
      return staleCount;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      actions.push(`Failed to release stale locks: ${msg}`);
      logger.system().error('Stale-lock cleanup failed', {}, e);
      return 0;
    }
  }
}
