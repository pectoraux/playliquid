/**
 * Domain shared layer barrel export.
 *
 * This module exposes the building blocks of DDD: aggregates, entities, value
 * objects, domain events, repository contracts, specifications, and the domain
 * error framework. None of these depend on infrastructure.
 */

export * from '@/domain/shared/aggregate/aggregate-root';
export * from '@/domain/shared/entity';
export * from '@/domain/shared/value-object';
export * from '@/domain/shared/event/domain-event';
export * from '@/domain/shared/event/event-registry';
export * from '@/domain/shared/repository';
export * from '@/domain/shared/specification';
export * from '@/domain/shared/errors';
