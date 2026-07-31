/**
 * Prisma-backed ValidationRunRepository — validation suite run history.
 *
 * Each validation run is started with a `running` status (the suite runner
 * records the suite name + trigger source immediately so the run shows up
 * in dashboards while still executing). On completion, the runner writes
 * the final status + check counts + durationMs + the full structured
 * report (JSON-encoded for SQLite).
 *
 * `getLatest(suite)` powers the "last run" widget on the launch dashboard.
 * `list(limit)` returns the most recent runs across all suites for the
 * history table.
 */

import type {
  ValidationRunRecord,
  ValidationRunRepository,
} from '@/domain/launch/repositories';
import { getClient } from '@/infrastructure/database/prisma';
import { logger } from '@/shared/logging';

type ValidationRunStatus = ValidationRunRecord['status'];

interface ValidationRunRow {
  id: string;
  suite: string;
  status: string;
  totalChecks: number;
  passedChecks: number;
  failedChecks: number;
  durationMs: number;
  triggeredBy: string;
  startedAt: string;
  completedAt: string | null;
  report: string;
}

const VALID_STATUSES = new Set<string>(['running', 'passed', 'failed', 'partial']);

function parseReport(raw: string): Record<string, unknown> {
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

function toRecord(r: ValidationRunRow): ValidationRunRecord {
  const status = VALID_STATUSES.has(r.status)
    ? (r.status as ValidationRunStatus)
    : 'running';
  return {
    id: r.id,
    suite: r.suite,
    status,
    totalChecks: r.totalChecks,
    passedChecks: r.passedChecks,
    failedChecks: r.failedChecks,
    durationMs: r.durationMs,
    triggeredBy: r.triggeredBy,
    startedAt: r.startedAt,
    completedAt: r.completedAt,
    report: parseReport(r.report),
  };
}

export class PrismaValidationRunRepository implements ValidationRunRepository {
  async start(
    record: Omit<
      ValidationRunRecord,
      | 'status'
      | 'totalChecks'
      | 'passedChecks'
      | 'failedChecks'
      | 'durationMs'
      | 'completedAt'
      | 'report'
    >,
  ): Promise<void> {
    const client = getClient();
    await client.validationRun.create({
      data: {
        id: record.id,
        suite: record.suite,
        status: 'running',
        totalChecks: 0,
        passedChecks: 0,
        failedChecks: 0,
        durationMs: 0,
        triggeredBy: record.triggeredBy,
        startedAt: record.startedAt,
        completedAt: null,
        report: '{}',
      },
    });
    logger.database().debug('Validation run started', {
      runId: record.id,
      suite: record.suite,
      triggeredBy: record.triggeredBy,
    });
  }

  async complete(
    id: string,
    result: {
      status: ValidationRunRecord['status'];
      totalChecks: number;
      passedChecks: number;
      failedChecks: number;
      durationMs: number;
      report: Record<string, unknown>;
    },
  ): Promise<void> {
    const client = getClient();
    const now = new Date().toISOString();
    await client.validationRun.update({
      where: { id },
      data: {
        status: result.status,
        totalChecks: result.totalChecks,
        passedChecks: result.passedChecks,
        failedChecks: result.failedChecks,
        durationMs: result.durationMs,
        completedAt: now,
        report: JSON.stringify(result.report),
      },
    });
    logger.database().debug('Validation run completed', {
      runId: id,
      status: result.status,
      passed: result.passedChecks,
      failed: result.failedChecks,
      durationMs: result.durationMs,
    });
  }

  async getById(id: string): Promise<ValidationRunRecord | null> {
    const client = getClient();
    const record = await client.validationRun.findUnique({ where: { id } });
    return record ? toRecord(record) : null;
  }

  async list(limit: number): Promise<ValidationRunRecord[]> {
    const client = getClient();
    const records = await client.validationRun.findMany({
      orderBy: { startedAt: 'desc' },
      take: limit,
    });
    return records.map((r: ValidationRunRow) => toRecord(r));
  }

  async getLatest(suite: string): Promise<ValidationRunRecord | null> {
    const client = getClient();
    const record = await client.validationRun.findFirst({
      where: { suite },
      orderBy: { startedAt: 'desc' },
    });
    return record ? toRecord(record) : null;
  }
}
