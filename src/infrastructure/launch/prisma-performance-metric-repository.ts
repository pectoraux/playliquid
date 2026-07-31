/**
 * Prisma-backed PerformanceMetricRepository — time-series platform metrics.
 *
 * The performance middleware + extended health checks emit metrics
 * (p95 latency, error rate, queue depth, DB connection count, etc.) on a
 * fixed interval. Each emission calls `record()` which auto-classifies the
 * `status` field against the configured threshold:
 *
 *   - status === 'ok'        if value is within threshold
 *   - status === 'warning'   if value is between threshold and 2× threshold
 *   - status === 'critical'  if value exceeds 2× threshold (or there's no
 *                              threshold and the value is non-zero)
 *
 * `getLatest(metric)` powers the per-metric "current value" cards.
 * `list(metrics, limit)` returns the most recent N samples for the given
 * metric names (used by the dashboard charts).
 * `getSummary()` returns the latest value + status for every metric that
 * has reported in the last hour — used by the launch dashboard to show
 * the overall platform health at a glance.
 */

import type {
  PerformanceMetricRecord,
  PerformanceMetricRepository,
} from '@/domain/launch/repositories';
import { getClient } from '@/infrastructure/database/prisma';
import { logger } from '@/shared/logging';
import { createId } from '@/shared/ids';

type MetricStatus = PerformanceMetricRecord['status'];

interface PerformanceMetricRow {
  id: string;
  metric: string;
  value: number;
  unit: string;
  threshold: number | null;
  status: string;
  timestamp: string;
  metadata: string;
}

function parseMetadata(raw: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    /* fall through */
  }
  return {};
}

function toRecord(r: PerformanceMetricRow): PerformanceMetricRecord {
  const status: MetricStatus =
    r.status === 'ok' || r.status === 'warning' || r.status === 'critical'
      ? (r.status as MetricStatus)
      : 'ok';
  return {
    id: r.id,
    metric: r.metric,
    value: r.value,
    unit: r.unit,
    threshold: r.threshold,
    status,
    timestamp: r.timestamp,
    metadata: parseMetadata(r.metadata),
  };
}

/**
 * Classify a metric value against its threshold.
 *
 * If no threshold is configured, the metric is 'ok' at zero and 'warning'
 * at any non-zero value (e.g. error counts where any value is suspicious).
 * Otherwise: within threshold → 'ok', up to 2× threshold → 'warning',
 * beyond 2× threshold → 'critical'.
 */
function classifyStatus(value: number, threshold: number | null): MetricStatus {
  if (threshold === null) {
    if (value <= 0) return 'ok';
    return value > 10 ? 'critical' : 'warning';
  }
  if (value <= threshold) return 'ok';
  if (value <= threshold * 2) return 'warning';
  return 'critical';
}

export class PrismaPerformanceMetricRepository
  implements PerformanceMetricRepository
{
  async record(
    metric: Omit<PerformanceMetricRecord, 'id' | 'status'>,
  ): Promise<void> {
    const client = getClient();
    const status = classifyStatus(metric.value, metric.threshold);
    await client.performanceMetric.create({
      data: {
        id: createId('pm'),
        metric: metric.metric,
        value: metric.value,
        unit: metric.unit,
        threshold: metric.threshold,
        status,
        timestamp: metric.timestamp,
        metadata: JSON.stringify(metric.metadata),
      },
    });
    logger.database().debug('Performance metric recorded', {
      metric: metric.metric,
      value: metric.value,
      unit: metric.unit,
      status,
    });
  }

  async getLatest(metric: string): Promise<PerformanceMetricRecord | null> {
    const client = getClient();
    const record = await client.performanceMetric.findFirst({
      where: { metric },
      orderBy: { timestamp: 'desc' },
    });
    return record ? toRecord(record) : null;
  }

  async list(
    metrics: string[],
    limit: number,
  ): Promise<PerformanceMetricRecord[]> {
    const client = getClient();
    if (metrics.length === 0) {
      const records = await client.performanceMetric.findMany({
        orderBy: { timestamp: 'desc' },
        take: limit,
      });
      return records.map((r: PerformanceMetricRow) => toRecord(r));
    }
    const records = await client.performanceMetric.findMany({
      where: { metric: { in: metrics } },
      orderBy: { timestamp: 'desc' },
      take: limit,
    });
    return records.map((r: PerformanceMetricRow) => toRecord(r));
  }

  async getSummary(): Promise<
    Record<string, { value: number; status: string; threshold: number | null }>
  > {
    const client = getClient();
    // Pull the latest sample per metric. SQLite doesn't support DISTINCT ON,
    // so we fetch the most recent N rows and dedupe in JS — for a launch-size
    // dataset this is trivially cheap.
    const recent = await client.performanceMetric.findMany({
      orderBy: { timestamp: 'desc' },
      take: 500,
    });
    const summary: Record<
      string,
      { value: number; status: string; threshold: number | null }
    > = {};
    for (const row of recent) {
      if (summary[row.metric] !== undefined) continue;
      summary[row.metric] = {
        value: row.value,
        status: row.status,
        threshold: row.threshold,
      };
    }
    return summary;
  }
}
