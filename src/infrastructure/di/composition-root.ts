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
import { registerIdentityEvents } from '@/domain/identity/events';

// M3: Identity infrastructure
import { Argon2PasswordHasher as ScryptPasswordHasher } from '@/infrastructure/identity/argon2-password-hasher';
import { UserRepositoryImpl } from '@/infrastructure/identity/user-repository-impl';
import { OrganizationRepositoryImpl } from '@/infrastructure/identity/organization-repository-impl';
import { PrismaRoleRepository } from '@/infrastructure/identity/prisma-role-repository';
import { PrismaPermissionRepository } from '@/infrastructure/identity/prisma-permission-repository';
import { PrismaApiKeyRepository } from '@/infrastructure/identity/prisma-api-key-repository';
import { PrismaAuditLogRepository } from '@/infrastructure/identity/prisma-audit-log-repository';
import { PrismaDeviceRepository } from '@/infrastructure/identity/prisma-device-repository';
import { PrismaWaitlistRepository } from '@/infrastructure/identity/prisma-waitlist-repository';
import { UserProfileProjector, OrganizationProjector, AuditLogProjector, ApiKeyProjector } from '@/infrastructure/identity/identity-projectors';
import { PrismaUserReadModelStore, PrismaOrganizationReadModelStore } from '@/infrastructure/identity/read-model-stores';
import { InMemoryTokenStore } from '@/infrastructure/identity/token-store';
import { ConsoleEmailService } from '@/infrastructure/identity/email-service';
import { generateApiKey } from '@/infrastructure/identity/api-key-generator';
import { RbacEngine, AbacEngine, PolicyEngine } from '@/domain/identity/policies/authorization-engine';
import { RiskEngine } from '@/domain/identity/services/risk-engine';

// M3: Identity commands and queries
import { IDENTITY_COMMAND_SCHEMAS, IDENTITY_QUERY_SCHEMAS } from '@/application/commands/identity/schemas';
import {
  RegisterUserHandler, VerifyEmailHandler, LoginHandler, LogoutHandler,
  RefreshSessionHandler, ChangePasswordHandler, RequestPasswordResetHandler, ResetPasswordHandler,
} from '@/application/commands/identity/auth-commands';
import {
  ApproveUserHandler, RejectUserHandler, SubmitForApprovalHandler,
} from '@/application/commands/identity/waitlist-commands';
import {
  SuspendUserHandler, ReactivateUserHandler, DeleteUserHandler,
  UpdateProfileHandler, ChangeEmailHandler, EnableMfaHandler, DisableMfaHandler,
  AssignRoleHandler, RemoveRoleHandler,
} from '@/application/commands/identity/user-management-commands';
import {
  CreateOrganizationHandler, AddMemberHandler, RemoveMemberHandler, JoinOrganizationHandler,
} from '@/application/commands/identity/organization-commands';
import {
  CreateApiKeyHandler, RotateApiKeyHandler, DisableApiKeyHandler,
} from '@/application/commands/identity/api-key-commands';
import {
  CreateRoleHandler, UpdateRoleHandler, DeleteRoleHandler,
  CreatePermissionHandler, DeletePermissionHandler,
} from '@/application/commands/identity/role-commands';
import {
  GetUserHandler, ListUsersHandler, GetCurrentUserHandler, GetUserPermissionsHandler,
} from '@/application/queries/identity/user-queries';
import {
  ListWaitlistHandler, GetWaitlistStatsHandler,
} from '@/application/queries/identity/waitlist-queries';
import {
  GetOrganizationHandler, ListOrganizationsHandler, GetOrganizationMembersHandler,
} from '@/application/queries/identity/organization-queries';
import {
  ListAuditLogHandler, GetAuditEntryHandler,
} from '@/application/queries/identity/audit-queries';
import {
  ListApiKeysHandler, GetApiKeyHandler,
} from '@/application/queries/identity/api-key-queries';
import {
  ListRolesHandler, ListPermissionsHandler,
} from '@/application/queries/identity/role-queries';

// Launch & Scale: Infrastructure
import { registerLaunchEvents } from '@/domain/launch/events';
import { BetaCohortRepositoryImpl } from '@/infrastructure/launch/beta-cohort-repository-impl';
import { PrismaFeedbackRepository } from '@/infrastructure/launch/prisma-feedback-repository';
import { PrismaValidationRunRepository } from '@/infrastructure/launch/prisma-validation-run-repository';
import { PrismaReconciliationRepository } from '@/infrastructure/launch/prisma-reconciliation-repository';
import { PrismaSessionReplayRepository } from '@/infrastructure/launch/prisma-session-replay-repository';
import { PrismaBugRepository } from '@/infrastructure/launch/prisma-bug-repository';
import { PrismaPerformanceMetricRepository } from '@/infrastructure/launch/prisma-performance-metric-repository';
import { PrismaReconciliationSource } from '@/infrastructure/launch/reconciliation-source';
import { PrismaBetaCohortReadModelStore } from '@/infrastructure/launch/beta-cohort-read-model-store';
import { BetaCohortProjector } from '@/infrastructure/launch/beta-cohort-projector';
import { createPlatformValidationSuites } from '@/infrastructure/launch/validation-suites';
import { ReconciliationService } from '@/domain/launch/services/reconciliation-service';
import { ValidationSuiteRunner } from '@/domain/launch/services/validation-suite';

// Launch & Scale: Commands and queries
import { LAUNCH_COMMAND_SCHEMAS, LAUNCH_QUERY_SCHEMAS } from '@/application/commands/launch/schemas';
import {
  CreateCohortHandler, InviteParticipantHandler, AcceptInvitationHandler, RevokeInvitationHandler,
} from '@/application/commands/launch/beta-commands';
import { SubmitFeedbackHandler, TriageFeedbackHandler } from '@/application/commands/launch/feedback-commands';
import { StartValidationRunHandler, CompleteValidationRunHandler } from '@/application/commands/launch/validation-commands';
import { RunReconciliationHandler } from '@/application/commands/launch/reconciliation-commands';
import { ReportBugHandler, ResolveBugHandler, AssignBugHandler } from '@/application/commands/launch/bug-commands';
import { RecordMetricHandler } from '@/application/commands/launch/performance-commands';
import { RecordSessionHandler } from '@/application/commands/launch/session-replay-commands';
import {
  GetCohortHandler, ListCohortsHandler, GetCohortParticipantsHandler,
} from '@/application/queries/launch/beta-queries';
import { ListFeedbackHandler, GetFeedbackStatsHandler } from '@/application/queries/launch/feedback-queries';
import { GetValidationRunHandler, ListValidationRunsHandler, GetLatestValidationHandler } from '@/application/queries/launch/validation-queries';
import { GetReconciliationHandler, ListReconciliationsHandler, GetLatestReconciliationHandler } from '@/application/queries/launch/reconciliation-queries';
import { ListBugsHandler, GetBugStatsHandler } from '@/application/queries/launch/bug-queries';
import { GetPerformanceSummaryHandler, ListMetricsHandler } from '@/application/queries/launch/performance-queries';
import { ListSessionReplaysHandler } from '@/application/queries/launch/session-replay-queries';

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
  registerIdentityEvents();
  registerLaunchEvents();

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

  // ─── M3: Identity Infrastructure ───────────────────────────────────────────
  c.singleton('PasswordHasher', () => new ScryptPasswordHasher());
  c.singleton('UserRepository', (c) => new UserRepositoryImpl(
    c.resolve(TOKENS.EventStore), c.resolve(TOKENS.SnapshotStore), c.resolve(TOKENS.OutboxRepository),
  ));
  c.singleton('OrganizationRepository', (c) => new OrganizationRepositoryImpl(
    c.resolve(TOKENS.EventStore), c.resolve(TOKENS.SnapshotStore), c.resolve(TOKENS.OutboxRepository),
  ));
  c.singleton('RoleRepository', () => new PrismaRoleRepository());
  c.singleton('PermissionRepository', () => new PrismaPermissionRepository());
  c.singleton('ApiKeyRepository', () => new PrismaApiKeyRepository());
  c.singleton('AuditLogRepository', () => new PrismaAuditLogRepository());
  c.singleton('DeviceRepository', () => new PrismaDeviceRepository());
  c.singleton('WaitlistRepository', () => new PrismaWaitlistRepository());

  // M3: Authorization engine
  c.singleton('RbacEngine', () => new RbacEngine());
  c.singleton('AbacEngine', () => new AbacEngine());
  c.singleton('PolicyEngine', (c) => new PolicyEngine(
    c.resolve('RbacEngine'), c.resolve('AbacEngine'),
  ));
  c.singleton('RiskEngine', () => new RiskEngine());
  c.singleton('TokenStore', () => new InMemoryTokenStore());
  c.singleton('EmailService', () => new ConsoleEmailService());
  c.singleton('UserReadModelStore', () => new PrismaUserReadModelStore());
  c.singleton('OrganizationReadModelStore', () => new PrismaOrganizationReadModelStore());

  // M3: Register identity projectors on the projection engine
  c.singleton(TOKENS.ProjectionEngine, (c) => {
    const engine = new ProjectionEngine(
      c.resolve(TOKENS.EventStore),
      c.resolve(TOKENS.CheckpointStore),
    );
    // M1 projectors
    engine.register(new GameProjector());
    engine.register(new WalletProjector());
    engine.register(new LeaderboardProjector());
    engine.register(new StatisticsProjector());
    // M3 identity projectors
    engine.register(new UserProfileProjector());
    engine.register(new OrganizationProjector());
    engine.register(new AuditLogProjector());
    engine.register(new ApiKeyProjector());
    // Launch projectors
    engine.register(new BetaCohortProjector());
    return engine;
  });

  // ─── Launch & Scale Infrastructure ─────────────────────────────────────────
  c.singleton('BetaCohortRepository', (c) => new BetaCohortRepositoryImpl(
    c.resolve(TOKENS.EventStore), c.resolve(TOKENS.SnapshotStore), c.resolve(TOKENS.OutboxRepository),
  ));
  c.singleton('FeedbackRepository', () => new PrismaFeedbackRepository());
  c.singleton('ValidationRunRepository', () => new PrismaValidationRunRepository());
  c.singleton('ReconciliationRepository', () => new PrismaReconciliationRepository());
  c.singleton('SessionReplayRepository', () => new PrismaSessionReplayRepository());
  c.singleton('BugRepository', () => new PrismaBugRepository());
  c.singleton('PerformanceMetricRepository', () => new PrismaPerformanceMetricRepository());
  c.singleton('ReconciliationSource', (c) => new PrismaReconciliationSource(c.resolve(TOKENS.EventStore)));
  c.singleton('BetaCohortReadModelStore', () => new PrismaBetaCohortReadModelStore());
  c.singleton('ReconciliationService', (c) => new ReconciliationService(c.resolve('ReconciliationSource')));
  c.singleton('ValidationSuiteRunner', (c) => {
    const runner = new ValidationSuiteRunner();
    const suites = createPlatformValidationSuites({
      eventStore: c.resolve(TOKENS.EventStore),
      reconciliationService: c.resolve('ReconciliationService'),
      rateLimiter: c.resolve(TOKENS.RateLimiter),
      storageProvider: c.resolve(TOKENS.StorageProvider),
      sessionReplayRepo: c.resolve('SessionReplayRepository'),
    });
    for (const suite of suites) runner.registerSuite(suite);
    return runner;
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

    // M1 handlers
    bus.register(new PublishGameHandler(
      c.resolve(TOKENS.EventStore),
      c.resolve(TOKENS.SnapshotStore),
      c.resolve(TOKENS.OutboxRepository),
    ));

    // M3: Identity command handlers
    const userRepo = c.resolve('UserRepository');
    const orgRepo = c.resolve('OrganizationRepository');
    const roleRepo = c.resolve('RoleRepository');
    const permRepo = c.resolve('PermissionRepository');
    const apiKeyRepo = c.resolve('ApiKeyRepository');
    const auditRepo = c.resolve('AuditLogRepository');
    const deviceRepo = c.resolve('DeviceRepository');
    const waitlistRepo = c.resolve('WaitlistRepository');
    const passwordHasher = c.resolve('PasswordHasher');
    const sessionStore = c.resolve(TOKENS.SessionStore);
    const jwtService = c.resolve(TOKENS.JwtService);
    const rbacEngine = c.resolve('RbacEngine');
    const riskEngine = c.resolve('RiskEngine');
    const tokenStore = c.resolve('TokenStore');
    const emailService = c.resolve('EmailService');
    const userReadModelStore = c.resolve('UserReadModelStore');
    const orgReadModelStore = c.resolve('OrganizationReadModelStore');

    // Auth commands
    bus.register(new RegisterUserHandler(userRepo, waitlistRepo, passwordHasher, null, emailService, tokenStore));
    bus.register(new VerifyEmailHandler(userRepo, waitlistRepo, tokenStore));
    bus.register(new LoginHandler(userRepo, passwordHasher, sessionStore, jwtService, deviceRepo, riskEngine, null, null, null));
    bus.register(new LogoutHandler(sessionStore, null));
    bus.register(new RefreshSessionHandler(sessionStore, jwtService, null));
    bus.register(new ChangePasswordHandler(userRepo, passwordHasher, null, null));
    bus.register(new RequestPasswordResetHandler(userRepo, tokenStore, emailService));
    bus.register(new ResetPasswordHandler(userRepo, waitlistRepo, passwordHasher, tokenStore));

    // Waitlist commands
    bus.register(new ApproveUserHandler(userRepo, null));
    bus.register(new RejectUserHandler(userRepo, null));
    bus.register(new SubmitForApprovalHandler(userRepo));

    // User management commands
    bus.register(new SuspendUserHandler(userRepo, null));
    bus.register(new ReactivateUserHandler(userRepo, null));
    bus.register(new DeleteUserHandler(userRepo, null));
    bus.register(new UpdateProfileHandler(userRepo));
    bus.register(new ChangeEmailHandler(userRepo, null));
    bus.register(new EnableMfaHandler(userRepo, null));
    bus.register(new DisableMfaHandler(userRepo, null));
    bus.register(new AssignRoleHandler(userRepo, null));
    bus.register(new RemoveRoleHandler(userRepo, null));

    // Organization commands
    bus.register(new CreateOrganizationHandler(orgRepo));
    bus.register(new AddMemberHandler(orgRepo, userRepo, null));
    bus.register(new RemoveMemberHandler(orgRepo, userRepo, null));
    bus.register(new JoinOrganizationHandler(userRepo));

    // API key commands
    bus.register(new CreateApiKeyHandler(apiKeyRepo, { generate: () => { const k = generateApiKey(); return { plaintext: k.plaintext, hash: k.hash, prefix: k.prefix }; } }));
    bus.register(new RotateApiKeyHandler(apiKeyRepo, { generate: () => { const k = generateApiKey(); return { plaintext: k.plaintext, hash: k.hash, prefix: k.prefix }; } }));
    bus.register(new DisableApiKeyHandler(apiKeyRepo));

    // Role and permission commands
    bus.register(new CreateRoleHandler(roleRepo));
    bus.register(new UpdateRoleHandler(roleRepo));
    bus.register(new DeleteRoleHandler(roleRepo));
    bus.register(new CreatePermissionHandler(permRepo));
    bus.register(new DeletePermissionHandler(permRepo));

    // Launch & Scale: Beta cohort commands
    const cohortRepo = c.resolve('BetaCohortRepository');
    const feedbackRepo = c.resolve('FeedbackRepository');
    const validationRunRepo = c.resolve('ValidationRunRepository');
    const reconciliationRepo = c.resolve('ReconciliationRepository');
    const bugRepo = c.resolve('BugRepository');
    const perfRepo = c.resolve('PerformanceMetricRepository');
    const replayRepo = c.resolve('SessionReplayRepository');
    const reconciliationService = c.resolve('ReconciliationService');
    const validationRunner = c.resolve('ValidationSuiteRunner');

    bus.register(new CreateCohortHandler(cohortRepo));
    bus.register(new InviteParticipantHandler(cohortRepo, null));
    bus.register(new AcceptInvitationHandler(cohortRepo, async (invId: string) => {
      return c.resolve('BetaCohortReadModelStore').getCohortIdByInvitation(invId);
    }));
    bus.register(new RevokeInvitationHandler(cohortRepo));

    bus.register(new SubmitFeedbackHandler(feedbackRepo));
    bus.register(new TriageFeedbackHandler(feedbackRepo));

    bus.register(new StartValidationRunHandler(validationRunRepo, validationRunner));
    bus.register(new CompleteValidationRunHandler(validationRunRepo));

    bus.register(new RunReconciliationHandler(reconciliationRepo, reconciliationService));

    bus.register(new ReportBugHandler(bugRepo));
    bus.register(new ResolveBugHandler(bugRepo));
    bus.register(new AssignBugHandler(bugRepo));

    bus.register(new RecordMetricHandler(perfRepo));
    bus.register(new RecordSessionHandler(replayRepo));

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

    // M1 handlers
    bus.register(new GetGameHandler(c.resolve(TOKENS.GameReadModelStore)));

    // M3: Identity query handlers
    bus.register(new GetUserHandler(c.resolve('UserReadModelStore')));
    bus.register(new ListUsersHandler(c.resolve('UserReadModelStore')));
    bus.register(new GetCurrentUserHandler(c.resolve('UserReadModelStore')));
    bus.register(new GetUserPermissionsHandler(c.resolve('UserRepository'), c.resolve('RbacEngine')));

    bus.register(new ListWaitlistHandler(c.resolve('WaitlistRepository')));
    bus.register(new GetWaitlistStatsHandler(c.resolve('WaitlistRepository')));

    bus.register(new GetOrganizationHandler(c.resolve('OrganizationReadModelStore')));
    bus.register(new ListOrganizationsHandler(c.resolve('OrganizationReadModelStore')));
    bus.register(new GetOrganizationMembersHandler(c.resolve('OrganizationReadModelStore')));

    bus.register(new ListAuditLogHandler(c.resolve('AuditLogRepository')));
    bus.register(new GetAuditEntryHandler(c.resolve('AuditLogRepository')));

    bus.register(new ListApiKeysHandler(c.resolve('ApiKeyRepository')));
    bus.register(new GetApiKeyHandler(c.resolve('ApiKeyRepository')));

    bus.register(new ListRolesHandler(c.resolve('RoleRepository')));
    bus.register(new ListPermissionsHandler(c.resolve('PermissionRepository')));

    // Launch & Scale: Query handlers
    const cohortReadModelStore = c.resolve('BetaCohortReadModelStore');
    bus.register(new GetCohortHandler(c.resolve('BetaCohortRepository'), cohortReadModelStore));
    bus.register(new ListCohortsHandler(cohortReadModelStore));
    bus.register(new GetCohortParticipantsHandler(c.resolve('BetaCohortRepository')));

    bus.register(new ListFeedbackHandler(c.resolve('FeedbackRepository')));
    bus.register(new GetFeedbackStatsHandler(c.resolve('FeedbackRepository')));

    bus.register(new GetValidationRunHandler(c.resolve('ValidationRunRepository')));
    bus.register(new ListValidationRunsHandler(c.resolve('ValidationRunRepository')));
    bus.register(new GetLatestValidationHandler(c.resolve('ValidationRunRepository')));

    bus.register(new GetReconciliationHandler(c.resolve('ReconciliationRepository')));
    bus.register(new ListReconciliationsHandler(c.resolve('ReconciliationRepository')));
    bus.register(new GetLatestReconciliationHandler(c.resolve('ReconciliationRepository')));

    bus.register(new ListBugsHandler(c.resolve('BugRepository')));
    bus.register(new GetBugStatsHandler(c.resolve('BugRepository')));

    bus.register(new GetPerformanceSummaryHandler(c.resolve('PerformanceMetricRepository')));
    bus.register(new ListMetricsHandler(c.resolve('PerformanceMetricRepository')));

    bus.register(new ListSessionReplaysHandler(c.resolve('SessionReplayRepository')));

    return bus;
  });

  // ─── Register validators and policies ──────────────────────────────────────
  registerCommandValidator('PublishGame', new ZodValidator(PublishGameSchema));
  registerPolicy('PublishGame', new AllowAnyonePolicy());

  // M3: Register identity validators
  for (const [commandType, schema] of IDENTITY_COMMAND_SCHEMAS) {
    registerCommandValidator(commandType, new ZodValidator(schema));
    registerPolicy(commandType, new AllowAnyonePolicy()); // Will tighten with real auth
  }
  for (const [queryType, schema] of IDENTITY_QUERY_SCHEMAS) {
    registerCommandValidator(queryType, new ZodValidator(schema));
  }

  // Launch & Scale: Register validators
  for (const [commandType, schema] of LAUNCH_COMMAND_SCHEMAS) {
    registerCommandValidator(commandType, new ZodValidator(schema));
    registerPolicy(commandType, new AllowAnyonePolicy());
  }
  for (const [queryType, schema] of LAUNCH_QUERY_SCHEMAS) {
    registerCommandValidator(queryType, new ZodValidator(schema));
  }

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
