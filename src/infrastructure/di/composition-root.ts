/**
 * Composition Root — wires all services into the DI container.
 *
 * This is the ONLY place where concrete implementations are selected and
 * connected. All other code depends on interfaces resolved through the
 * container. Changing an implementation (e.g., swapping InMemoryEventBus
 * for RedisEventBus, or LocalStorage for S3Storage) only requires editing
 * this file.
 */

import { DIContainer } from '@/infrastructure/di/container';
import { TOKENS } from '@/infrastructure/di/tokens';

// Re-export TOKENS so consumers can import both getContainer and TOKENS from one module.
export { TOKENS } from '@/infrastructure/di/tokens';

// Core infrastructure
import { prisma } from '@/infrastructure/database/prisma';
import { PrismaUnitOfWorkFactory } from '@/infrastructure/database/unit-of-work';
import { PrismaEventStore } from '@/infrastructure/event-store/event-store';
import { PrismaSnapshotStore } from '@/infrastructure/event-store/snapshot-store';
import { OutboxRepository, OutboxPublisher } from '@/infrastructure/outbox/outbox';
import { InMemoryEventBus } from '@/infrastructure/event-bus/event-bus';
import { InMemoryCache } from '@/infrastructure/cache/cache';
import { InMemoryMetricsRecorder } from '@/infrastructure/telemetry/metrics';
import { PrismaIdempotencyStore } from '@/infrastructure/repositories/idempotency-store-impl';
import { PrismaGameReadModelStore } from '@/infrastructure/repositories/game-read-model-store';
import { CheckpointStore, ProjectionEngine } from '@/infrastructure/projections/projection-engine';
import { WalletProjector, LeaderboardProjector, StatisticsProjector } from '@/infrastructure/projections/projectors';
import { GameProjector } from '@/infrastructure/projections/game-projector';
import { HealthCheckRegistry, registerDefaultHealthChecks } from '@/infrastructure/telemetry/health-checks';

// M2: Redis platform
import { getRedisClient } from '@/infrastructure/redis/redis-client';

// M2: Cache & Locking
import { MemoryCacheProvider, RedisCacheProvider } from '@/infrastructure/cache/cache-provider';
import { MemoryLockProvider, RedisLockProvider } from '@/infrastructure/locking/lock-provider';

// M2: Circuit breakers
import { CircuitBreakerRegistry } from '@/infrastructure/circuit-breaker/circuit-breaker';

// M2: Rate limiting
import { MemoryRateLimiter, RedisRateLimiter } from '@/infrastructure/rate-limiting/rate-limiter';

// M2: Queue
import { InMemoryQueue } from '@/infrastructure/queue/message-queue';
import { PrismaDeadLetterQueue } from '@/infrastructure/queue/dead-letter-queue';

// M2: Workers & Scheduler
import { WorkerRegistry } from '@/infrastructure/workers/worker-framework';
import { OutboxWorker, ProjectionWorker, CleanupWorker, AnalyticsWorker } from '@/infrastructure/workers/workers';
import { InMemoryScheduler } from '@/infrastructure/scheduler/scheduler';

// M2: Storage & CDN & Search
import { LocalStorageProvider } from '@/infrastructure/storage/storage-provider';
import { LocalCdnProvider } from '@/infrastructure/cdn/cdn-provider';
import { InMemorySearchProvider } from '@/infrastructure/search/search-provider';

// M2: Platform services
import { CachedFeatureFlagService } from '@/infrastructure/feature-flags/feature-flags';
import { EnvironmentSecretProvider } from '@/infrastructure/secrets/secret-provider';
import { DefaultConfigService } from '@/infrastructure/config/config-service';

// M2: Notifications
import { ConsoleEmailProvider } from '@/infrastructure/email/email-provider';
import { ConsoleSmsProvider } from '@/infrastructure/sms/sms-provider';
import { ConsolePushProvider } from '@/infrastructure/push/push-provider';
import { DefaultWebhookEngine } from '@/infrastructure/webhook/webhook-engine';
import { InMemorySessionStore, HmacJwtService } from '@/infrastructure/sessions/session-store';

// M2: Operations
import { InMemoryMetricsFramework } from '@/infrastructure/metrics/metrics-framework';
import { ExtendedHealthCheckRegistry, registerExtendedHealthChecks } from '@/infrastructure/telemetry/extended-health-checks';
import { LocalBackupProvider } from '@/infrastructure/backup/backup-framework';
import { DefaultDisasterRecoveryService } from '@/infrastructure/recovery/disaster-recovery';
import { DefaultPerformanceMiddleware } from '@/infrastructure/performance/performance';
import {
  ProductionStartupValidator,
  GracefulShutdownManager,
  ReadinessGateImpl,
  MaintenanceModeImpl,
} from '@/infrastructure/recovery/production-operations';

// Application
import { CommandBus } from '@/application/buses/command-bus';
import { QueryBus } from '@/application/buses/query-bus';
import { CorrelationMiddleware } from '@/application/pipelines/correlation-pipeline';
import { LoggingMiddleware } from '@/application/pipelines/logging-pipeline';
import { MetricsMiddleware } from '@/application/pipelines/metrics-pipeline';
import { IdempotencyMiddleware } from '@/application/pipelines/idempotency-pipeline';
import { ValidationMiddleware } from '@/application/pipelines/validation-pipeline';
import { AuthorizationMiddleware } from '@/application/pipelines/authorization-pipeline';
import { TransactionMiddleware } from '@/application/pipelines/transaction-pipeline';
import { QueryLoggingMiddleware, QueryMetricsMiddleware, QueryCacheMiddleware } from '@/application/pipelines/query-pipelines';
import { ZodValidator, registerCommandValidator } from '@/application/validation/validator';
import { AllowAnyonePolicy, registerPolicy } from '@/application/authorization/policy';

// Domain events
import { registerAllEvents } from '@/domain/events';

// Example command/query handlers
import { PublishGameHandler, PublishGameSchema } from '@/application/commands/publish-game';
import { GetGameHandler } from '@/application/queries/get-game';

import { getConfig } from '@/shared/config';
import { logger } from '@/shared/logging';

// Use global to persist across Next.js dev-mode module reloads.
const globalForContainer = globalThis as unknown as {
  __playliquidContainer?: DIContainer;
  __playliquidContainerBuilding?: Promise<DIContainer>;
};

let container: DIContainer | null = globalForContainer.__playliquidContainer ?? null;

/** Build and configure the DI container. */
export async function buildContainer(): Promise<DIContainer> {
  if (container) return container;

  // Prevent concurrent builds (multiple requests arriving simultaneously)
  if (globalForContainer.__playliquidContainerBuilding) {
    return globalForContainer.__playliquidContainerBuilding;
  }

  const buildPromise = (async () => {

  // Register domain events first.
  registerAllEvents();

  const c = new DIContainer();

  // ─── Core infrastructure ───────────────────────────────────────────────────
  c.bind(TOKENS.PrismaClient, prisma);
  c.singleton(TOKENS.EventStore, () => new PrismaEventStore());
  c.singleton(TOKENS.SnapshotStore, () => new PrismaSnapshotStore());
  c.singleton(TOKENS.OutboxRepository, () => new OutboxRepository());
  c.singleton(TOKENS.EventBus, () => new InMemoryEventBus());
  c.singleton(TOKENS.Cache, () => new InMemoryCache(getConfig().cache.maxSize));
  c.singleton(TOKENS.MetricsRecorder, () => new InMemoryMetricsRecorder());
  c.singleton(TOKENS.IdempotencyStore, () => new PrismaIdempotencyStore());
  c.singleton(TOKENS.GameReadModelStore, () => new PrismaGameReadModelStore());
  c.singleton(TOKENS.CheckpointStore, () => new CheckpointStore());
  c.singleton(TOKENS.UnitOfWorkFactory, () => new PrismaUnitOfWorkFactory());

  // ─── Redis platform ────────────────────────────────────────────────────────
  const redisClient = await getRedisClient();
  c.bind(TOKENS.RedisClient, redisClient);

  // ─── Cache provider (Redis if available, else memory) ─────────────────────
  c.singleton(TOKENS.CacheProvider, (c) => {
    const redis = c.resolve(TOKENS.RedisClient);
    if (redis.backend === 'redis') {
      return new RedisCacheProvider(redis);
    }
    return new MemoryCacheProvider(getConfig().cache.maxSize);
  });

  // ─── Distributed lock provider ─────────────────────────────────────────────
  c.singleton(TOKENS.LockProvider, (c) => {
    const redis = c.resolve(TOKENS.RedisClient);
    if (redis.backend === 'redis') {
      return new RedisLockProvider(redis);
    }
    return new MemoryLockProvider();
  });

  // ─── Circuit breaker registry ─────────────────────────────────────────────
  c.singleton(TOKENS.CircuitBreakerRegistry, () => new CircuitBreakerRegistry());

  // ─── Rate limiter ──────────────────────────────────────────────────────────
  c.singleton(TOKENS.RateLimiter, (c) => {
    const redis = c.resolve(TOKENS.RedisClient);
    if (redis.backend === 'redis') {
      return new RedisRateLimiter(redis);
    }
    return new MemoryRateLimiter();
  });

  // ─── Message queue + DLQ ───────────────────────────────────────────────────
  c.singleton(TOKENS.MessageQueue, () => new InMemoryQueue());
  c.singleton(TOKENS.DeadLetterQueue, () => new PrismaDeadLetterQueue());

  // ─── Storage / CDN / Search ────────────────────────────────────────────────
  c.singleton(TOKENS.StorageProvider, () => new LocalStorageProvider(getEnvVar('STORAGE_ROOT') || './storage'));
  c.singleton(TOKENS.CdnProvider, () => new LocalCdnProvider(getEnvVar('CDN_BASE_URL') || ''));
  c.singleton(TOKENS.SearchProvider, () => new InMemorySearchProvider());

  // ─── Platform services ─────────────────────────────────────────────────────
  c.singleton(TOKENS.FeatureFlagService, () => new CachedFeatureFlagService());
  c.singleton(TOKENS.SecretProvider, () => new EnvironmentSecretProvider());
  c.singleton(TOKENS.ConfigService, () => new DefaultConfigService());

  // ─── Notifications ─────────────────────────────────────────────────────────
  c.singleton(TOKENS.EmailProvider, () => new ConsoleEmailProvider());
  c.singleton(TOKENS.SmsProvider, () => new ConsoleSmsProvider());
  c.singleton(TOKENS.PushProvider, () => new ConsolePushProvider());
  c.singleton(TOKENS.WebhookEngine, () => new DefaultWebhookEngine());
  c.singleton(TOKENS.SessionStore, () => new InMemorySessionStore());
  c.singleton(TOKENS.JwtService, () => new HmacJwtService(getConfig().auth.secret));

  // ─── Metrics framework ─────────────────────────────────────────────────────
  c.singleton(TOKENS.MetricsFramework, () => new InMemoryMetricsFramework());

  // ─── Outbox publisher ──────────────────────────────────────────────────────
  c.singleton(TOKENS.OutboxPublisher, (c) => {
    return new OutboxPublisher(
      c.resolve(TOKENS.OutboxRepository),
      c.resolve(TOKENS.EventBus),
    );
  });

  // ─── Projection engine ─────────────────────────────────────────────────────
  c.singleton(TOKENS.ProjectionEngine, (c) => {
    const engine = new ProjectionEngine(
      c.resolve(TOKENS.EventStore),
      c.resolve(TOKENS.CheckpointStore),
    );
    engine.register(new GameProjector());
    engine.register(new WalletProjector());
    engine.register(new LeaderboardProjector());
    engine.register(new StatisticsProjector());
    return engine;
  });

  // ─── Worker registry ───────────────────────────────────────────────────────
  c.singleton(TOKENS.WorkerRegistry, (c) => {
    const registry = new WorkerRegistry();
    const config = getConfig();

    if (config.featureFlags.outboxWorker) {
      registry.register(new OutboxWorker(
        c.resolve(TOKENS.OutboxPublisher),
        config.outbox.pollIntervalMs,
      ));
    }

    if (config.featureFlags.projectionWorker) {
      registry.register(new ProjectionWorker(
        c.resolve(TOKENS.ProjectionEngine),
        config.projections.pollIntervalMs,
      ));
    }

    registry.register(new CleanupWorker(60000)); // every 60s
    registry.register(new AnalyticsWorker(c.resolve(TOKENS.EventStore), 30000)); // every 30s

    return registry;
  });

  // ─── Scheduler ─────────────────────────────────────────────────────────────
  c.singleton(TOKENS.Scheduler, (c) => {
    return new InMemoryScheduler(c.resolve(TOKENS.LockProvider));
  });

  // ─── Backup ────────────────────────────────────────────────────────────────
  c.singleton(TOKENS.BackupProvider, () => new LocalBackupProvider());

  // ─── Disaster recovery ─────────────────────────────────────────────────────
  c.singleton(TOKENS.DisasterRecoveryService, (c) => {
    return new DefaultDisasterRecoveryService(
      c.resolve(TOKENS.ProjectionEngine),
      c.resolve(TOKENS.WorkerRegistry),
      c.resolve(TOKENS.RedisClient),
    );
  });

  // ─── Performance ───────────────────────────────────────────────────────────
  c.singleton(TOKENS.PerformanceMiddleware, () => new DefaultPerformanceMiddleware());

  // ─── Production operations ─────────────────────────────────────────────────
  c.singleton(TOKENS.GracefulShutdownManager, (c) => {
    const mgr = new GracefulShutdownManager();
    // Register default shutdown hooks
    const registry = c.resolve(TOKENS.WorkerRegistry);
    mgr.registerHook('workers', async () => { await registry.stopAll(); });
    mgr.registerHook('prisma', async () => { await prisma.$disconnect(); });
    return mgr;
  });
  c.singleton(TOKENS.ReadinessGate, () => new ReadinessGateImpl());
  c.singleton(TOKENS.MaintenanceMode, (c) => new MaintenanceModeImpl(c.resolve(TOKENS.RedisClient)));

  // ─── Health checks (basic) ─────────────────────────────────────────────────
  c.singleton(TOKENS.HealthCheckRegistry, (c) => {
    const registry = new HealthCheckRegistry();
    registerDefaultHealthChecks(registry, c.resolve(TOKENS.EventBus), c.resolve(TOKENS.OutboxRepository));
    return registry;
  });

  // ─── Extended health checks ────────────────────────────────────────────────
  c.singleton(TOKENS.ExtendedHealthCheckRegistry, (c) => {
    const registry = new ExtendedHealthCheckRegistry();
    registerExtendedHealthChecks(registry, {
      redis: c.resolve(TOKENS.RedisClient),
      eventStore: c.resolve(TOKENS.EventStore),
      eventBus: c.resolve(TOKENS.EventBus),
      outbox: c.resolve(TOKENS.OutboxRepository),
      projectionEngine: c.resolve(TOKENS.ProjectionEngine),
      cache: c.resolve(TOKENS.CacheProvider),
      rateLimiter: c.resolve(TOKENS.RateLimiter),
      circuitBreakerRegistry: c.resolve(TOKENS.CircuitBreakerRegistry),
      workerRegistry: c.resolve(TOKENS.WorkerRegistry),
      storageProvider: c.resolve(TOKENS.StorageProvider),
    });
    return registry;
  });

  // ─── Command Bus with middleware pipeline ──────────────────────────────────
  c.singleton(TOKENS.CommandBus, (c) => {
    const bus = new CommandBus();
    const metrics = c.resolve(TOKENS.MetricsRecorder);
    const idempotencyStore = c.resolve(TOKENS.IdempotencyStore);
    const uowFactory = c.resolve(TOKENS.UnitOfWorkFactory);

    bus.use(new CorrelationMiddleware());
    bus.use(new LoggingMiddleware());
    bus.use(new MetricsMiddleware(metrics));
    bus.use(new IdempotencyMiddleware(idempotencyStore, getConfig().idempotency.ttlSeconds));
    bus.use(new ValidationMiddleware());
    bus.use(new AuthorizationMiddleware(() => null));
    bus.use(new TransactionMiddleware(uowFactory));

    bus.register(new PublishGameHandler(
      c.resolve(TOKENS.EventStore),
      c.resolve(TOKENS.SnapshotStore),
      c.resolve(TOKENS.OutboxRepository),
    ));

    return bus;
  });

  // ─── Query Bus with middleware pipeline ────────────────────────────────────
  c.singleton(TOKENS.QueryBus, (c) => {
    const bus = new QueryBus();
    const metrics = c.resolve(TOKENS.MetricsRecorder);
    const cache = c.resolve(TOKENS.Cache);

    bus.use(new QueryLoggingMiddleware());
    bus.use(new QueryMetricsMiddleware(metrics));
    bus.use(new QueryCacheMiddleware(cache, getConfig().cache.ttlSeconds));

    bus.register(new GetGameHandler(c.resolve(TOKENS.GameReadModelStore)));

    return bus;
  });

  // ─── Register validators and policies ──────────────────────────────────────
  registerCommandValidator('PublishGame', new ZodValidator(PublishGameSchema));
  registerPolicy('PublishGame', new AllowAnyonePolicy());

  container = c;
  globalForContainer.__playliquidContainer = c;
  globalForContainer.__playliquidContainerBuilding = undefined;

  logger.system().info('Composition root initialized (M2)', {
    redisBackend: redisClient.backend,
    commandTypes: c.resolve(TOKENS.CommandBus).getCommandTypes(),
    queryTypes: c.resolve(TOKENS.QueryBus).getQueryTypes(),
    bindings: c.listBindings().length,
  });

  return c;
  })(); // end buildPromise

  globalForContainer.__playliquidContainerBuilding = buildPromise;
  return buildPromise;
}

/** Get the singleton container (builds on first call). */
export async function getContainer(): Promise<DIContainer> {
  return container ?? buildContainer();
}

/** Start background workers and scheduler. */
export async function startWorkers(): Promise<void> {
  const c = await getContainer();
  const config = getConfig();

  if (config.featureFlags.outboxWorker || config.featureFlags.projectionWorker) {
    c.resolve(TOKENS.WorkerRegistry).startAll();
  }

  c.resolve(TOKENS.Scheduler).start();

  logger.system().info('Background workers and scheduler started');
}

// Import getEnvVar for storage path
import { getEnvVar } from '@/shared/config';
