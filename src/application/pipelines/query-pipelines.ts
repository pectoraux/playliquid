/**
 * Query-side middlewares: logging, metrics, and caching.
 */

import type { QueryMiddleware } from './pipeline';
import type { Query } from '@/application/queries/query';
import { Result } from '@/shared/types/result';
import { logger } from '@/shared/logging';
import { getRequestContext } from '@/application/context';
import type { MetricsRecorder, Cache } from '@/application/ports';

/** Structured logging for queries. */
export class QueryLoggingMiddleware implements QueryMiddleware {
  readonly name = 'query-logging';

  async handle<T>(query: Query, next: (query: Query) => Promise<Result<T>>): Promise<Result<T>> {
    const ctx = getRequestContext();
    const log = logger.query();
    const startedAt = Date.now();

    log.info('Query executing', {
      queryType: query.queryType,
      correlationId: query.correlationId ?? ctx?.correlationId,
    });

    try {
      const result = await next(query);
      const durationMs = Date.now() - startedAt;
      log.info('Query completed', { queryType: query.queryType, durationMs });
      return result;
    } catch (e) {
      log.error('Query threw', { queryType: query.queryType }, e);
      throw e;
    }
  }
}

/** Metrics for queries. */
export class QueryMetricsMiddleware implements QueryMiddleware {
  readonly name = 'query-metrics';

  constructor(private readonly metrics: MetricsRecorder) {}

  async handle<T>(query: Query, next: (query: Query) => Promise<Result<T>>): Promise<Result<T>> {
    const startedAt = Date.now();
    try {
      const result = await next(query);
      this.metrics.recordQuery(query.queryType, Date.now() - startedAt, result.ok);
      return result;
    } catch (e) {
      this.metrics.recordQuery(query.queryType, Date.now() - startedAt, false);
      throw e;
    }
  }
}

/** Caching for query results. */
export class QueryCacheMiddleware implements QueryMiddleware {
  readonly name = 'query-cache';

  constructor(private readonly cache: Cache, private readonly ttlSeconds: number) {}

  async handle<T>(query: Query, next: (query: Query) => Promise<Result<T>>): Promise<Result<T>> {
    const cacheKey = `query:${query.queryType}:${JSON.stringify((query as { payload?: unknown }).payload ?? query)}`;
    const cached = this.cache.get<Result<T>>(cacheKey);
    if (cached) {
      return cached;
    }
    const result = await next(query);
    if (result.ok) {
      this.cache.set(cacheKey, result, this.ttlSeconds);
    }
    return result;
  }
}
