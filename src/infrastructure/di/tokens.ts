/**
 * DI tokens — string tokens for infrastructure and application services.
 *
 * Using string tokens keeps the composition root explicit and avoids coupling
 * to class references. Each token corresponds to an interface contract.
 */

export const TOKENS = {
  // Infrastructure
  PrismaClient: 'PrismaClient',
  EventStore: 'EventStore',
  SnapshotStore: 'SnapshotStore',
  OutboxRepository: 'OutboxRepository',
  OutboxPublisher: 'OutboxPublisher',
  EventBus: 'EventBus',
  Cache: 'Cache',
  MetricsRecorder: 'MetricsRecorder',
  IdempotencyStore: 'IdempotencyStore',
  CheckpointStore: 'CheckpointStore',
  ProjectionEngine: 'ProjectionEngine',
  UnitOfWorkFactory: 'UnitOfWorkFactory',

  // Application
  CommandBus: 'CommandBus',
  QueryBus: 'QueryBus',

  // Health
  HealthCheckRegistry: 'HealthCheckRegistry',
} as const;

export type Token = (typeof TOKENS)[keyof typeof TOKENS];
