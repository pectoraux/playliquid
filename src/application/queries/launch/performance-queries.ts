/**
 * Performance metric queries.
 *
 * GetPerformanceSummary / ListMetrics.
 *
 * Reads from the PerformanceMetricRepository. Metrics are time-series points
 * stored in an append-only table — no projection needed. The summary returns
 * the latest value + status for each metric tracked by the system.
 */

import { Result } from '@/shared/types/result';
import type { QueryWithPayload } from '@/application/queries/query';
import type { QueryHandler } from '@/application/handlers/query-handler';
import type {
  PerformanceMetricRepository,
  PerformanceMetricRecord,
} from '@/domain/launch/repositories';

// ─── Get Performance Summary ──────────────────────────────────────────────

export type GetPerformanceSummaryPayload = Record<string, never>;

export interface MetricSummary {
  readonly value: number;
  readonly status: string;
  readonly threshold: number | null;
}

export interface GetPerformanceSummaryResult {
  readonly metrics: Readonly<Record<string, MetricSummary>>;
}

export class GetPerformanceSummaryQuery
  implements
    QueryWithPayload<GetPerformanceSummaryPayload, GetPerformanceSummaryResult>
{
  readonly queryType = 'GetPerformanceSummary';
  constructor(
    public readonly payload: GetPerformanceSummaryPayload = {},
    public readonly correlationId?: string,
    public readonly userId?: string,
  ) {}
}

export class GetPerformanceSummaryHandler
  implements
    QueryHandler<GetPerformanceSummaryQuery, GetPerformanceSummaryResult>
{
  readonly queryType = 'GetPerformanceSummary';

  constructor(private readonly metricRepo: PerformanceMetricRepository) {}

  async execute(
    _query: GetPerformanceSummaryQuery,
  ): Promise<Result<GetPerformanceSummaryResult>> {
    const summary = await this.metricRepo.getSummary();
    return Result.ok({ metrics: summary });
  }
}

// ─── List Metrics ─────────────────────────────────────────────────────────

export interface ListMetricsPayload {
  readonly metrics: readonly string[];
  readonly limit: number;
}

export interface ListMetricsResult {
  readonly items: readonly PerformanceMetricRecord[];
  readonly limit: number;
}

export class ListMetricsQuery
  implements QueryWithPayload<ListMetricsPayload, ListMetricsResult>
{
  readonly queryType = 'ListMetrics';
  constructor(
    public readonly payload: ListMetricsPayload,
    public readonly correlationId?: string,
    public readonly userId?: string,
  ) {}
}

export class ListMetricsHandler
  implements QueryHandler<ListMetricsQuery, ListMetricsResult>
{
  readonly queryType = 'ListMetrics';

  constructor(private readonly metricRepo: PerformanceMetricRepository) {}

  async execute(query: ListMetricsQuery): Promise<Result<ListMetricsResult>> {
    const items = await this.metricRepo.list(
      [...query.payload.metrics],
      query.payload.limit,
    );
    return Result.ok({
      items,
      limit: query.payload.limit,
    });
  }
}
