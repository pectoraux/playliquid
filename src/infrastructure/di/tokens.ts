/**
 * DI tokens — string tokens for infrastructure and application services.
 *
 * Using string tokens keeps the composition root explicit and avoids coupling
 * to class references. Each token corresponds to an interface contract.
 */

export const TOKENS = {
  // Core infrastructure
  PrismaClient: 'PrismaClient',
  RedisClient: 'RedisClient',
  EventStore: 'EventStore',
  SnapshotStore: 'SnapshotStore',
  OutboxRepository: 'OutboxRepository',
  OutboxPublisher: 'OutboxPublisher',
  EventBus: 'EventBus',
  IdempotencyStore: 'IdempotencyStore',
  CheckpointStore: 'CheckpointStore',
  ProjectionEngine: 'ProjectionEngine',
  UnitOfWorkFactory: 'UnitOfWorkFactory',

  // M2: Cache & Locking
  CacheProvider: 'CacheProvider',
  LockProvider: 'LockProvider',

  // M2: Messaging
  MessageQueue: 'MessageQueue',
  DeadLetterQueue: 'DeadLetterQueue',

  // M2: Workers & Scheduler
  WorkerRegistry: 'WorkerRegistry',
  Scheduler: 'Scheduler',

  // M2: Storage & CDN
  StorageProvider: 'StorageProvider',
  CdnProvider: 'CdnProvider',

  // M2: Search
  SearchProvider: 'SearchProvider',

  // M2: Platform services
  FeatureFlagService: 'FeatureFlagService',
  SecretProvider: 'SecretProvider',
  ConfigService: 'ConfigService',
  RateLimiter: 'RateLimiter',
  CircuitBreakerRegistry: 'CircuitBreakerRegistry',

  // M2: Notifications
  EmailProvider: 'EmailProvider',
  SmsProvider: 'SmsProvider',
  PushProvider: 'PushProvider',
  WebhookEngine: 'WebhookEngine',
  SessionStore: 'SessionStore',
  JwtService: 'JwtService',

  // M2: Operations
  MetricsFramework: 'MetricsFramework',
  MetricsRecorder: 'MetricsRecorder',
  Cache: 'Cache',
  ExtendedHealthCheckRegistry: 'ExtendedHealthCheckRegistry',
  BackupProvider: 'BackupProvider',
  DisasterRecoveryService: 'DisasterRecoveryService',
  PerformanceMiddleware: 'PerformanceMiddleware',
  GracefulShutdownManager: 'GracefulShutdownManager',
  ReadinessGate: 'ReadinessGate',
  MaintenanceMode: 'MaintenanceMode',

  // Application
  CommandBus: 'CommandBus',
  QueryBus: 'QueryBus',

  // Health
  HealthCheckRegistry: 'HealthCheckRegistry',

  // Read model stores
  GameReadModelStore: 'GameReadModelStore',
} as const;

export type Token = (typeof TOKENS)[keyof typeof TOKENS];
