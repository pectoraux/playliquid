/**
 * Metrics recorder — in-memory counters and histograms for command/query
 * dispatch timing and health reporting.
 *
 * In production this would export to Prometheus / OpenTelemetry. The
 * interface stays the same.
 */

import type { MetricsRecorder } from '@/application/ports';

interface Counter {
  count: number;
  successCount: number;
  failureCount: number;
  totalDurationMs: number;
}

export class InMemoryMetricsRecorder implements MetricsRecorder {
  private readonly commands = new Map<string, Counter>();
  private readonly queries = new Map<string, Counter>();

  recordCommand(commandType: string, durationMs: number, success: boolean): void {
    const counter = this.commands.get(commandType) ?? this.emptyCounter();
    counter.count++;
    if (success) counter.successCount++;
    else counter.failureCount++;
    counter.totalDurationMs += durationMs;
    this.commands.set(commandType, counter);
  }

  recordQuery(queryType: string, durationMs: number, success: boolean): void {
    const counter = this.queries.get(queryType) ?? this.emptyCounter();
    counter.count++;
    if (success) counter.successCount++;
    else counter.failureCount++;
    counter.totalDurationMs += durationMs;
    this.queries.set(queryType, counter);
  }

  getCommandMetrics(): CommandMetric[] {
    return Array.from(this.commands.entries()).map(([commandType, c]) => ({
      commandType,
      count: c.count,
      successCount: c.successCount,
      failureCount: c.failureCount,
      totalDurationMs: c.totalDurationMs,
      avgDurationMs: c.count > 0 ? Math.round(c.totalDurationMs / c.count) : 0,
    }));
  }

  getQueryMetrics(): QueryMetric[] {
    return Array.from(this.queries.entries()).map(([queryType, c]) => ({
      queryType,
      count: c.count,
      successCount: c.successCount,
      failureCount: c.failureCount,
      totalDurationMs: c.totalDurationMs,
      avgDurationMs: c.count > 0 ? Math.round(c.totalDurationMs / c.count) : 0,
    }));
  }

  reset(): void {
    this.commands.clear();
    this.queries.clear();
  }

  private emptyCounter(): Counter {
    return { count: 0, successCount: 0, failureCount: 0, totalDurationMs: 0 };
  }
}
