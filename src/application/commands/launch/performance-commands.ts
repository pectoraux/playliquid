/**
 * Performance metric command.
 *
 * RecordMetric.
 *
 * Performance metrics are time-series points stored in the
 * PerformanceMetricRepository. The repository computes the status (ok |
 * warning | critical) by comparing the value against the optional threshold.
 */

import { Result } from '@/shared/types/result';
import type { CommandWithPayload } from '@/application/commands/command';
import type { CommandHandler } from '@/application/handlers/command-handler';
import type { PerformanceMetricRepository } from '@/domain/launch/repositories';
import { ValidationError } from '@/domain/shared/errors';

// ─── Record Metric ────────────────────────────────────────────────────────

export interface RecordMetricPayload {
  readonly metric: string;
  readonly value: number;
  readonly unit: string;
  readonly threshold: number | null;
  readonly metadata: Record<string, unknown>;
}

export interface RecordMetricResult {
  readonly metric: string;
  readonly value: number;
  readonly unit: string;
  readonly status: 'ok' | 'warning' | 'critical';
  readonly timestamp: string;
}

export class RecordMetricCommand implements CommandWithPayload<RecordMetricPayload> {
  readonly commandType = 'RecordMetric';
  constructor(
    public readonly payload: RecordMetricPayload,
    public readonly correlationId?: string,
    public readonly causationId?: string,
    public readonly idempotencyKey?: string,
    public readonly userId?: string,
  ) {}
}

export class RecordMetricHandler
  implements CommandHandler<RecordMetricCommand, RecordMetricResult>
{
  readonly commandType = 'RecordMetric';

  constructor(private readonly metricRepo: PerformanceMetricRepository) {}

  async execute(command: RecordMetricCommand): Promise<Result<RecordMetricResult>> {
    const { metric, value, unit, threshold, metadata } = command.payload;

    if (!metric || metric.trim().length === 0) {
      return Result.fail(new ValidationError('metric is required', 'metric'));
    }
    if (!unit || unit.trim().length === 0) {
      return Result.fail(new ValidationError('unit is required', 'unit'));
    }
    if (!Number.isFinite(value)) {
      return Result.fail(new ValidationError('value must be a finite number', 'value'));
    }

    const timestamp = new Date().toISOString();
    try {
      await this.metricRepo.record({
        metric,
        value,
        unit,
        threshold,
        timestamp,
        metadata,
      });
    } catch (e) {
      return Result.fail(e as Error);
    }

    // Compute the status the same way the read model would.
    const status = computeStatus(value, threshold);

    return Result.ok({
      metric,
      value,
      unit,
      status,
      timestamp,
    });
  }
}

/** Compute the metric status from the value and optional threshold. */
function computeStatus(
  value: number,
  threshold: number | null,
): 'ok' | 'warning' | 'critical' {
  if (threshold === null) return 'ok';
  if (value >= threshold) return 'critical';
  if (value >= threshold * 0.9) return 'warning';
  return 'ok';
}
