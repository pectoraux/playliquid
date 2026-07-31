// @ts-nocheck
/**
 * Query Bus.
 *
 * Routes queries to their registered handler through a middleware pipeline.
 * Queries NEVER mutate state and NEVER depend on the EventStore or write
 * models. They read from materialized projections / read models.
 *
 * Supports optional caching and metrics middlewares.
 */

import { Result } from '@/shared/types/result';
import type { DomainError } from '@/domain/shared/errors';
import type { Query } from '@/application/queries/query';
import type { QueryHandler } from '@/application/handlers/query-handler';
import type { QueryMiddleware } from '@/application/pipelines/pipeline';
import { ConfigurationError } from '@/domain/shared/errors';
import { logger } from '@/shared/logging';

export class QueryBus {
  private readonly handlers = new Map<string, QueryHandler>();
  private readonly middlewares: QueryMiddleware[] = [];

  register(handler: QueryHandler): void {
    if (this.handlers.has(handler.queryType)) {
      throw new ConfigurationError(
        `Duplicate query handler for type: ${handler.queryType}`,
      );
    }
    this.handlers.set(handler.queryType, handler);
    logger.query().info('Query handler registered', { queryType: handler.queryType });
  }

  use(middleware: QueryMiddleware): void {
    this.middlewares.push(middleware);
  }

  async execute<T = unknown>(query: Query): Promise<Result<T, DomainError>> {
    const handler = this.handlers.get(query.queryType);
    if (!handler) {
      return Result.fail(
        new ConfigurationError(`No handler registered for query: ${query.queryType}`),
      );
    }

    const run = this.middlewares.reduceRight(
      (next, middleware) => {
        return (q: Query) => middleware.handle<T>(q, next);
      },
      (q: Query) => handler.execute(q) as Promise<Result<T, DomainError>>,
    );

    return run(query);
  }

  hasHandler(queryType: string): boolean {
    return this.handlers.has(queryType);
  }

  getQueryTypes(): string[] {
    return Array.from(this.handlers.keys());
  }
}
