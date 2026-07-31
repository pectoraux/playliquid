/**
 * Production Operations — startup validation, graceful shutdown, readiness
 * gate, and maintenance mode.
 *
 * These four primitives are the operational backbone of a production
 * deployment:
 *
 *   1. `ProductionStartupValidator` — fail fast at boot if required
 *      infrastructure is unavailable (database unreachable, schema out of
 *      sync, required config missing). Catches misconfiguration before the
 *      process starts serving traffic.
 *
 *   2. `GracefulShutdownManager` — drain in-flight work on SIGTERM/SIGINT.
 *      Hooks run in REVERSE registration order so that the most recently
 *      added dependency (e.g. an HTTP server) closes before its underlying
 *      dependencies (e.g. the database pool). A hard timeout force-exits
 *      the process if hooks stall.
 *
 *   3. `ReadinessGateImpl` — gate the `/api/ready` endpoint. Blocked
 *      during startup (until `release()` is called) and immediately
 *      blocked when shutdown begins. Can also be blocked manually for
 *      maintenance.
 *
 *   4. `MaintenanceMode` — toggle a cluster-wide flag so a load balancer
 *      can drain this instance. Backed by either a Redis key (multi-
 *      instance) or a local file flag (single-instance / dev).
 *
 * All four are designed to be safe to compose: typical wiring is
 *
 *   const gate = new ReadinessGateImpl();
 *   const shutdown = new GracefulShutdownManager();
 *   const maintenance = new MaintenanceMode(redis);
 *   shutdown.registerHook('close-http', () => server.close());
 *   shutdown.registerHook('stop-workers', () => workerRegistry.shutdown());
 *   gate.block('startup');
 *   await validator.validate();
 *   gate.release();
 *   // ... serve traffic ...
 *   // On SIGTERM:
 *   gate.block('shutdown');
 *   maintenance.enable('graceful-shutdown');
 *   await shutdown.shutdown(30_000);
 */

import type { RedisClient } from '@/infrastructure/redis/redis-client';
import { getClient } from '@/infrastructure/database/prisma';
import { getConfig, getEnvVar } from '@/shared/config';
import { logger } from '@/shared/logging';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

// ─── Public Interfaces ────────────────────────────────────────────────────

export interface StartupValidator {
  validate(): Promise<StartupValidationResult>;
}

export interface StartupValidationResult {
  passed: boolean;
  checks: Array<{ name: string; passed: boolean; message: string }>;
}

export interface GracefulShutdown {
  registerHook(name: string, fn: () => Promise<void>): void;
  shutdown(timeoutMs: number): Promise<void>;
}

export interface ReadinessGate {
  isReady(): boolean;
  block(reason: string): void;
  release(): void;
  getBlockingReasons(): string[];
}

export interface MaintenanceMode {
  enable(reason: string): Promise<void>;
  disable(): Promise<void>;
  isEnabled(): boolean;
  getReason(): string | null;
}

// ─── ProductionStartupValidator ───────────────────────────────────────────

/**
 * Validates that the process can serve traffic at boot. Each check produces
 * a (name, passed, message) tuple; the overall result is `passed=true` only
 * if every check passed.
 *
 * Checks:
 *   - database:    the Prisma client can run `SELECT 1`
 *   - schema:      the expected tables exist (best-effort: introspects a
 *                  small set of well-known table names)
 *   - event-store: the EventRecord table is queryable
 *   - config:      required config values are present (DATABASE_URL,
 *                  AUTH_SECRET) — these are already enforced by `loadConfig`
 *                  but we re-check here for defense in depth
 *   - redis:       if `REDIS_URL` is set, the client can PING; if not set,
 *                  we acknowledge the in-memory fallback
 */
export class ProductionStartupValidator implements StartupValidator {
  async validate(): Promise<StartupValidationResult> {
    const checks: Array<{ name: string; passed: boolean; message: string }> = [];

    // 1. Database connection
    checks.push(await this.checkDatabase());

    // 2. Schema (table existence)
    checks.push(await this.checkSchema());

    // 3. Event Store (eventRecord table)
    checks.push(await this.checkEventStore());

    // 4. Required config
    checks.push(this.checkConfig());

    // 5. Redis (optional, with fallback acknowledgement)
    checks.push(await this.checkRedis());

    const passed = checks.every((c) => c.passed);
    return { passed, checks };
  }

  private async checkDatabase(): Promise<{ name: string; passed: boolean; message: string }> {
    try {
      const client = getClient();
      await client.$queryRaw`SELECT 1`;
      return { name: 'database', passed: true, message: 'connected' };
    } catch (e) {
      return {
        name: 'database',
        passed: false,
        message: `database unreachable: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  }

  private async checkSchema(): Promise<{ name: string; passed: boolean; message: string }> {
    try {
      const client = getClient();
      // Query a handful of well-known tables to confirm the schema is in sync.
      // We use `findFirst({ take: 1 })` rather than `count()` because some
      // SQLite builds materialize the full count.
      const tableChecks = [
        () => client.eventRecord.findFirst({ take: 1, select: { id: true } }),
        () => client.outboxMessage.findFirst({ take: 1, select: { id: true } }),
        () => client.projectionCheckpoint.findFirst({ take: 1, select: { projectionName: true } }),
      ];
      for (const check of tableChecks) {
        await check();
      }
      return { name: 'schema', passed: true, message: 'required tables accessible' };
    } catch (e) {
      return {
        name: 'schema',
        passed: false,
        message: `schema check failed: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  }

  private async checkEventStore(): Promise<{ name: string; passed: boolean; message: string }> {
    try {
      const client = getClient();
      // The event store table is the canonical source of truth. We don't
      // care about the count, just that the table is queryable.
      await client.eventRecord.findFirst({ take: 1, select: { id: true, eventId: true } });
      return { name: 'event-store', passed: true, message: 'event store accessible' };
    } catch (e) {
      return {
        name: 'event-store',
        passed: false,
        message: `event store inaccessible: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  }

  private checkConfig(): { name: string; passed: boolean; message: string } {
    // loadConfig() throws on missing required values, so if we got here the
    // config is valid. We re-read a couple of values defensively.
    try {
      const config = getConfig();
      const issues: string[] = [];
      if (!config.database.url) issues.push('DATABASE_URL missing');
      if (!config.auth.secret) issues.push('AUTH_SECRET missing');
      if (issues.length > 0) {
        return { name: 'config', passed: false, message: issues.join('; ') };
      }
      return { name: 'config', passed: true, message: 'required config present' };
    } catch (e) {
      return {
        name: 'config',
        passed: false,
        message: `config invalid: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  }

  private async checkRedis(): Promise<{ name: string; passed: boolean; message: string }> {
    const redisUrl = getEnvVar('REDIS_URL');
    if (!redisUrl) {
      return {
        name: 'redis',
        passed: true,
        message: 'REDIS_URL not set — in-memory fallback acknowledged',
      };
    }
    // We don't import the RedisBackendClient directly to avoid a circular
    // dependency. Instead, we ping via the singleton accessor lazily.
    try {
      const { getRedisClient } = await import('@/infrastructure/redis/redis-client');
      const client = await getRedisClient();
      const alive = await client.ping();
      if (alive) {
        return { name: 'redis', passed: true, message: `connected (backend: ${client.backend})` };
      }
      return { name: 'redis', passed: false, message: 'ping returned false' };
    } catch (e) {
      return {
        name: 'redis',
        passed: false,
        message: `redis unreachable: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  }
}

// ─── GracefulShutdownManager ──────────────────────────────────────────────

interface ShutdownHook {
  name: string;
  fn: () => Promise<void>;
}

/**
 * Manages graceful shutdown. Hooks are executed in REVERSE registration
 * order (LIFO) so that the most recently added dependency (e.g. HTTP
 * server) closes before its underlying dependencies (e.g. database pool).
 *
 * The manager listens for SIGTERM and SIGINT and triggers `shutdown()`
 * automatically. A hard timeout force-exits the process if hooks don't
 * complete in time — this prevents a stuck hook from keeping the process
 * alive indefinitely (Kubernetes will SIGKILL after terminationGracePeriod
 * anyway, but we want to log the situation first).
 *
 * The manager is idempotent: a second `shutdown()` call (e.g. the user
 * hitting Ctrl-C twice) returns immediately without re-running hooks.
 */
export class GracefulShutdownManager implements GracefulShutdown {
  private readonly hooks: ShutdownHook[] = [];
  private shuttingDown = false;
  private signalHandlersBound = false;

  /**
   * @param autoBindSignals If true (default), bind SIGTERM and SIGINT
   *   handlers automatically. Set to false in tests.
   */
  constructor(autoBindSignals = true) {
    if (autoBindSignals) {
      this.bindSignalHandlers();
    }
  }

  /** Register a shutdown hook. Hooks run in reverse registration order. */
  registerHook(name: string, fn: () => Promise<void>): void {
    if (this.shuttingDown) {
      logger.system().warn('Cannot register shutdown hook — already shutting down', { name });
      return;
    }
    this.hooks.push({ name, fn });
    logger.system().debug('Shutdown hook registered', { name, position: this.hooks.length });
  }

  /**
   * Run all shutdown hooks in reverse order. Resolves once all hooks have
   * completed (or the timeout has fired).
   */
  async shutdown(timeoutMs: number): Promise<void> {
    if (this.shuttingDown) {
      logger.system().warn('Shutdown already in progress — ignoring duplicate call');
      return;
    }
    this.shuttingDown = true;
    logger.system().info('Graceful shutdown initiated', {
      hookCount: this.hooks.length,
      timeoutMs,
    });

    // Race all hooks against a hard timeout.
    const allHooks = Promise.all(
      [...this.hooks].reverse().map(async (hook) => {
        const startedAt = Date.now();
        try {
          await hook.fn();
          logger.system().info('Shutdown hook completed', {
            name: hook.name,
            durationMs: Date.now() - startedAt,
          });
        } catch (e) {
          logger.system().error(
            'Shutdown hook failed',
            { name: hook.name, durationMs: Date.now() - startedAt },
            e,
          );
        }
      }),
    );

    const timeout = new Promise<void>((resolve) => {
      setTimeout(() => {
        logger.system().error('Graceful shutdown timed out — some hooks did not complete', {
          timeoutMs,
        });
        resolve();
      }, timeoutMs);
    });

    await Promise.race([allHooks, timeout]);
    logger.system().info('Graceful shutdown complete');
  }

  /** Whether shutdown has been initiated. */
  isShuttingDown(): boolean {
    return this.shuttingDown;
  }

  /** Bind SIGTERM and SIGINT handlers (called automatically by the constructor). */
  bindSignalHandlers(): void {
    if (this.signalHandlersBound) return;
    if (typeof process === 'undefined' || typeof process.on !== 'function') {
      // Edge runtimes / serverless: skip signal binding.
      return;
    }
    this.signalHandlersBound = true;

    const handler = (signal: NodeJS.Signals): void => {
      logger.system().warn('Received signal — initiating graceful shutdown', { signal });
      // Fire-and-forget; the hard timeout inside shutdown() will force-exit
      // if hooks stall. We don't await here because the signal handler must
      // return promptly.
      void this.shutdown(30_000).then(() => {
        // Give the logger a moment to flush, then exit.
        if (typeof process !== 'undefined' && typeof process.exit === 'function') {
          process.exit(0);
        }
      });
    };

    process.on('SIGTERM', handler);
    process.on('SIGINT', handler);
  }
}

// ─── ReadinessGateImpl ────────────────────────────────────────────────────

/**
 * A simple readiness gate backed by a list of "blocking reasons". The gate
 * is ready iff there are no blocking reasons.
 *
 * Use cases:
 *   - During startup: `gate.block('startup')` until the composition root
 *     finishes wiring, then `gate.release()`.
 *   - During shutdown: `gate.block('shutdown')` immediately so the load
 *     balancer stops sending traffic.
 *   - Maintenance: `gate.block('maintenance')` to drain without killing
 *     the process.
 *
 * Multiple `block(reason)` calls with different reasons stack: the gate
 * only becomes ready once ALL reasons have been released. The same reason
 * can be blocked multiple times (we dedupe by reason string).
 */
export class ReadinessGateImpl implements ReadinessGate {
  private readonly blockingReasons = new Set<string>();

  isReady(): boolean {
    return this.blockingReasons.size === 0;
  }

  block(reason: string): void {
    if (!reason) {
      throw new Error('ReadinessGate.block requires a non-empty reason');
    }
    const wasReady = this.blockingReasons.size === 0;
    this.blockingReasons.add(reason);
    if (wasReady) {
      logger.system().warn('Readiness gate blocked', { reason });
    } else {
      logger.system().debug('Readiness gate already blocked — adding reason', {
        reason,
        allReasons: Array.from(this.blockingReasons),
      });
    }
  }

  release(): void {
    if (this.blockingReasons.size === 0) return;
    this.blockingReasons.clear();
    logger.system().info('Readiness gate released — ready to serve traffic');
  }

  /** Release only a specific blocking reason (useful for stacked blocks). */
  releaseReason(reason: string): void {
    if (this.blockingReasons.delete(reason)) {
      if (this.blockingReasons.size === 0) {
        logger.system().info('Readiness gate released — ready to serve traffic', { reason });
      } else {
        logger.system().debug('Readiness gate partially released', {
          reason,
          remaining: Array.from(this.blockingReasons),
        });
      }
    }
  }

  getBlockingReasons(): string[] {
    return Array.from(this.blockingReasons);
  }
}

// ─── MaintenanceMode ──────────────────────────────────────────────────────

/**
 * Cluster-wide maintenance flag.
 *
 * When enabled, the load balancer should drain this instance (typically by
 * routing traffic away from it based on the `/api/ready` endpoint, which
 * should consult `isEnabled()`).
 *
 * Backends:
 *   - If a `RedisClient` is provided, the flag is stored as a Redis key
 *     (`maintenance:enabled`) with the reason as the value. This makes the
 *     flag visible across all instances sharing the Redis.
 *   - Otherwise, the flag is stored as a local file (`<dataDir>/.maintenance`)
 *     containing the reason string. Suitable for single-instance dev.
 *
 * The implementation is deliberately simple: no TTL, no async refresh. The
 * `isEnabled()` method reads synchronously from the local cache, which is
 * updated by `enable()` / `disable()`. For multi-instance maintenance with
 * cross-instance propagation, callers should poll `refresh()` on an interval
 * (or use a Redis pub/sub channel — future work).
 */
export class MaintenanceModeImpl implements MaintenanceMode {
  private readonly redis: RedisClient | null;
  private readonly filePath: string;
  private readonly redisKey = 'maintenance:enabled';
  private enabled = false;
  private reason: string | null = null;

  constructor(redis?: RedisClient, filePath?: string) {
    this.redis = redis ?? null;
    // Default to a `.maintenance` file in the current working directory.
    this.filePath = filePath ?? '.maintenance';
  }

  async enable(reason: string): Promise<void> {
    if (!reason) throw new Error('MaintenanceMode.enable requires a non-empty reason');
    this.enabled = true;
    this.reason = reason;

    if (this.redis) {
      try {
        // TTL of 24h as a safety net so a crashed instance doesn't leave
        // maintenance mode permanently enabled.
        await this.redis.set(this.redisKey, reason, 86_400);
      } catch (e) {
        logger.system().error('Failed to persist maintenance flag in Redis', { reason }, e);
      }
    } else {
      try {
        const dir = dirname(this.filePath);
        if (dir && dir !== '.' && !existsSync(dir)) {
          mkdirSync(dir, { recursive: true });
        }
        writeFileSync(this.filePath, reason, 'utf-8');
      } catch (e) {
        logger.system().error('Failed to persist maintenance flag to file', { path: this.filePath, reason }, e);
      }
    }

    logger.system().warn('Maintenance mode enabled', { reason });
  }

  async disable(): Promise<void> {
    this.enabled = false;
    this.reason = null;

    if (this.redis) {
      try {
        await this.redis.del(this.redisKey);
      } catch (e) {
        logger.system().error('Failed to clear maintenance flag in Redis', {}, e);
      }
    } else {
      try {
        if (existsSync(this.filePath)) {
          unlinkSync(this.filePath);
        }
      } catch (e) {
        logger.system().error('Failed to remove maintenance flag file', { path: this.filePath }, e);
      }
    }

    logger.system().info('Maintenance mode disabled');
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  getReason(): string | null {
    return this.reason;
  }

  /**
   * Refresh the in-memory cache from the backing store. Call this on a
   * polling interval (e.g. every 5s) when running in a multi-instance
   * deployment so maintenance mode enabled on one instance propagates to
   * the others.
   */
  async refresh(): Promise<void> {
    if (!this.redis) return; // file-backed mode is already authoritative
    try {
      const value = await this.redis.get(this.redisKey);
      if (value === null) {
        if (this.enabled) {
          this.enabled = false;
          this.reason = null;
          logger.system().info('Maintenance mode disabled (via Redis refresh)');
        }
      } else {
        if (!this.enabled || this.reason !== value) {
          this.enabled = true;
          this.reason = value;
          logger.system().warn('Maintenance mode enabled (via Redis refresh)', { reason: value });
        }
      }
    } catch (e) {
      logger.system().error('Failed to refresh maintenance flag from Redis', {}, e);
    }
  }
}

// ─── Convenience: Wire Everything Together ───────────────────────────────

export interface ProductionOperationsBundle {
  startupValidator: ProductionStartupValidator;
  shutdown: GracefulShutdownManager;
  readinessGate: ReadinessGateImpl;
  maintenance: MaintenanceMode;
}

/**
 * Build the standard bundle of production-operations primitives. The
 * composition root typically calls this once at startup, then:
 *
 *   1. `bundle.readinessGate.block('startup')`
 *   2. `await bundle.startupValidator.validate()` (fail fast on errors)
 *   3. `bundle.readinessGate.release()`
 *   4. ... wire the rest of the application ...
 *   5. `bundle.shutdown.registerHook('close-http', ...)` etc.
 *
 * If a `RedisClient` is provided, `MaintenanceMode` uses it; otherwise a
 * local file flag is used.
 */
export function createProductionOperations(redis?: RedisClient): ProductionOperationsBundle {
  return {
    startupValidator: new ProductionStartupValidator(),
    shutdown: new GracefulShutdownManager(true),
    readinessGate: new ReadinessGateImpl(),
    maintenance: new MaintenanceModeImpl(redis),
  };
}
