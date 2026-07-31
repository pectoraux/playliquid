/**
 * Application layer barrel export.
 *
 * The application layer orchestrates domain operations through commands and
 * queries. It defines the buses, handlers, pipelines, validation,
 * authorization, and transaction contracts. It depends on the domain layer
 * but NEVER on infrastructure.
 */

export * from '@/application/commands/command';
export * from '@/application/queries/query';
export * from '@/application/handlers/command-handler';
export * from '@/application/handlers/query-handler';
export * from '@/application/buses/command-bus';
export * from '@/application/buses/query-bus';
export * from '@/application/pipelines/pipeline';
export * from '@/application/pipelines/idempotency-store';
export * from '@/application/pipelines/correlation-pipeline';
export * from '@/application/pipelines/logging-pipeline';
export * from '@/application/pipelines/metrics-pipeline';
export * from '@/application/pipelines/idempotency-pipeline';
export * from '@/application/pipelines/validation-pipeline';
export * from '@/application/pipelines/authorization-pipeline';
export * from '@/application/pipelines/transaction-pipeline';
export * from '@/application/pipelines/query-pipelines';
export * from '@/application/validation/validator';
export * from '@/application/authorization/policy';
export * from '@/application/unit-of-work/unit-of-work';
export * from '@/application/context';
