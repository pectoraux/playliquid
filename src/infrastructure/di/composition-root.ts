/**
 * Composition Root — wires all services into the DI container.
 *
 * This is the ONLY place where concrete implementations are selected and
 * connected. All other code depends on interfaces resolved through the
 * container. Changing an implementation (e.g., swapping InMemoryEventBus
 * for RedisEventBus) only requires editing this file.
 */

import { DIContainer } from '@/infrastructure/di/container';
import { TOKENS } from '@/infrastructure/di/tokens';

// Re-export TOKENS so consumers can import both getContainer and TOKENS from one module.
export { TOKENS } from '@/infrastructure/di/tokens';

// Infrastructure
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
import { ZodValidator, registerCommandValidator, registerQueryValidator, NoOpValidator } from '@/application/validation/validator';
import { AllowAnyonePolicy, registerPolicy, RequireAuthenticatedPolicy } from '@/application/authorization/policy';

// Domain events
import { registerAllEvents } from '@/domain/events';

// Example command/query handlers
import { PublishGameCommand, PublishGameHandler, PublishGameSchema } from '@/application/commands/publish-game';
import { GetGameQuery, GetGameHandler } from '@/application/queries/get-game';

import { getConfig } from '@/shared/config';
import { logger } from '@/shared/logging';

let container: DIContainer | null = null;

/** Build and configure the DI container. */
export function buildContainer(): DIContainer {
  if (container) return container;

  // Register domain events first.
  registerAllEvents();

  const c = new DIContainer();

  // ─── Infrastructure singletons ──────────────────────────────────────────
  c.bind(TOKENS.PrismaClient, prisma);
  c.singleton(TOKENS.EventStore, () => new PrismaEventStore());
  c.singleton(TOKENS.SnapshotStore, () => new PrismaSnapshotStore());
  c.singleton(TOKENS.OutboxRepository, () => new OutboxRepository());
  c.singleton(TOKENS.EventBus, () => new InMemoryEventBus());
  c.singleton(TOKENS.Cache, () => new InMemoryCache(getConfig().cache.maxSize));
  c.singleton(TOKENS.MetricsRecorder, () => new InMemoryMetricsRecorder());
  c.singleton(TOKENS.IdempotencyStore, () => new PrismaIdempotencyStore());
  c.singleton('GameReadModelStore', () => new PrismaGameReadModelStore());
  c.singleton(TOKENS.CheckpointStore, () => new CheckpointStore());
  c.singleton(TOKENS.UnitOfWorkFactory, () => new PrismaUnitOfWorkFactory());

  // Outbox publisher (depends on outbox + event bus)
  c.singleton(TOKENS.OutboxPublisher, (c) => {
    const outbox = c.resolve(TOKENS.OutboxRepository);
    const eventBus = c.resolve(TOKENS.EventBus);
    return new OutboxPublisher(outbox, eventBus);
  });

  // Projection engine (depends on event store + checkpoint store)
  c.singleton(TOKENS.ProjectionEngine, (c) => {
    const eventStore = c.resolve(TOKENS.EventStore);
    const checkpointStore = c.resolve(TOKENS.CheckpointStore);
    const engine = new ProjectionEngine(eventStore, checkpointStore);

    // Register projectors
    engine.register(new GameProjector());
    engine.register(new WalletProjector());
    engine.register(new LeaderboardProjector());
    engine.register(new StatisticsProjector());

    return engine;
  });

  // ─── Health checks ──────────────────────────────────────────────────────
  c.singleton(TOKENS.HealthCheckRegistry, (c) => {
    const registry = new HealthCheckRegistry();
    const eventBus = c.resolve(TOKENS.EventBus);
    const outbox = c.resolve(TOKENS.OutboxRepository);
    registerDefaultHealthChecks(registry, eventBus, outbox);
    return registry;
  });

  // ─── Command Bus with middleware pipeline ───────────────────────────────
  c.singleton(TOKENS.CommandBus, (c) => {
    const bus = new CommandBus();

    const metrics = c.resolve(TOKENS.MetricsRecorder);
    const idempotencyStore = c.resolve(TOKENS.IdempotencyStore);
    const uowFactory = c.resolve(TOKENS.UnitOfWorkFactory);

    // Pipeline order (outer → inner):
    //   correlation → logging → metrics → idempotency → validation → authorization → transaction
    bus.use(new CorrelationMiddleware());
    bus.use(new LoggingMiddleware());
    bus.use(new MetricsMiddleware(metrics));
    bus.use(new IdempotencyMiddleware(idempotencyStore, getConfig().idempotency.ttlSeconds));
    bus.use(new ValidationMiddleware());
    bus.use(new AuthorizationMiddleware(() => null)); // No auth context yet; AllowAnyonePolicy by default
    bus.use(new TransactionMiddleware(uowFactory));

    // Register command handlers
    bus.register(new PublishGameHandler(
      c.resolve(TOKENS.EventStore),
      c.resolve(TOKENS.SnapshotStore),
      c.resolve(TOKENS.OutboxRepository),
    ));

    return bus;
  });

  // ─── Query Bus with middleware pipeline ─────────────────────────────────
  c.singleton(TOKENS.QueryBus, (c) => {
    const bus = new QueryBus();

    const metrics = c.resolve(TOKENS.MetricsRecorder);
    const cache = c.resolve(TOKENS.Cache);

    bus.use(new QueryLoggingMiddleware());
    bus.use(new QueryMetricsMiddleware(metrics));
    bus.use(new QueryCacheMiddleware(cache, getConfig().cache.ttlSeconds));

    // Register query handlers
    bus.register(new GetGameHandler(c.resolve('GameReadModelStore')));

    return bus;
  });

  // ─── Register validators ──────────────────────────────────────────────────
  registerCommandValidator('PublishGame', new ZodValidator(PublishGameSchema));

  // ─── Register authorization policies ───────────────────────────────────
  registerPolicy('PublishGame', new AllowAnyonePolicy());

  container = c;

  logger.system().info('Composition root initialized', {
    eventTypes: 'registered',
    commandTypes: c.resolve(TOKENS.CommandBus).getCommandTypes(),
    queryTypes: c.resolve(TOKENS.QueryBus).getQueryTypes(),
  });

  return c;
}

/** Get the singleton container (builds on first call). */
export function getContainer(): DIContainer {
  return container ?? buildContainer();
}

/** Start background workers (outbox publisher + projection engine). */
export function startWorkers(): void {
  const c = getContainer();
  const config = getConfig();

  if (config.featureFlags.outboxWorker) {
    c.resolve(TOKENS.OutboxPublisher).start();
  }

  if (config.featureFlags.projectionWorker) {
    c.resolve(TOKENS.ProjectionEngine).start();
  }
}
