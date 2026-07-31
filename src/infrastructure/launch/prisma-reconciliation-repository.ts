/**
 * Prisma-backed ReconciliationRepository — ledger reconciliation reports.
 *
 * Each time the `ReconciliationService` runs, it persists a summary record
 * here: the period label, the expected vs actual totals, the discrepancy,
 * the matched/unmatched transaction counts, and the full details object
 * (which includes the per-account unmatched list). The `details` field is
 * JSON-encoded (SQLite has no native JSON column type).
 *
 * `getLatest()` powers the dashboard "last reconciliation" widget.
 * `list(limit)` returns the most recent reports for the history table.
 */

import type {
  ReconciliationRecord,
  ReconciliationRepository,
} from '@/domain/launch/repositories';
import { getClient } from '@/infrastructure/database/prisma';
import { logger } from '@/shared/logging';

type ReconciliationStatus = ReconciliationRecord['status'];

interface ReconciliationRow {
  id: string;
  period: string;
  status: string;
  expectedBalance: number;
  actualBalance: number;
  discrepancy: number;
  totalTransactions: number;
  matchedTransactions: number;
  unmatchedTransactions: number;
  completedAt: string;
  details: string;
}

const VALID_STATUSES = new Set<string>(['balanced', 'discrepancy', 'error']);

function parseDetails(raw: string): Record<string, unknown> {
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

function toRecord(r: ReconciliationRow): ReconciliationRecord {
  const status = VALID_STATUSES.has(r.status)
    ? (r.status as ReconciliationStatus)
    : 'error';
  return {
    id: r.id,
    period: r.period,
    status,
    expectedBalance: r.expectedBalance,
    actualBalance: r.actualBalance,
    discrepancy: r.discrepancy,
    totalTransactions: r.totalTransactions,
    matchedTransactions: r.matchedTransactions,
    unmatchedTransactions: r.unmatchedTransactions,
    completedAt: r.completedAt,
    details: parseDetails(r.details),
  };
}

export class PrismaReconciliationRepository implements ReconciliationRepository {
  async save(record: ReconciliationRecord): Promise<void> {
    const client = getClient();
    await client.reconciliationReport.upsert({
      where: { id: record.id },
      create: {
        id: record.id,
        period: record.period,
        status: record.status,
        expectedBalance: record.expectedBalance,
        actualBalance: record.actualBalance,
        discrepancy: record.discrepancy,
        totalTransactions: record.totalTransactions,
        matchedTransactions: record.matchedTransactions,
        unmatchedTransactions: record.unmatchedTransactions,
        completedAt: record.completedAt,
        details: JSON.stringify(record.details),
      },
      update: {
        period: record.period,
        status: record.status,
        expectedBalance: record.expectedBalance,
        actualBalance: record.actualBalance,
        discrepancy: record.discrepancy,
        totalTransactions: record.totalTransactions,
        matchedTransactions: record.matchedTransactions,
        unmatchedTransactions: record.unmatchedTransactions,
        completedAt: record.completedAt,
        details: JSON.stringify(record.details),
      },
    });
    logger.database().debug('Reconciliation report saved', {
      reconciliationId: record.id,
      period: record.period,
      status: record.status,
      discrepancy: record.discrepancy,
    });
  }

  async getById(id: string): Promise<ReconciliationRecord | null> {
    const client = getClient();
    const record = await client.reconciliationReport.findUnique({ where: { id } });
    return record ? toRecord(record) : null;
  }

  async list(limit: number): Promise<ReconciliationRecord[]> {
    const client = getClient();
    const records = await client.reconciliationReport.findMany({
      orderBy: { completedAt: 'desc' },
      take: limit,
    });
    return records.map((r: ReconciliationRow) => toRecord(r));
  }

  async getLatest(): Promise<ReconciliationRecord | null> {
    const client = getClient();
    const record = await client.reconciliationReport.findFirst({
      orderBy: { completedAt: 'desc' },
    });
    return record ? toRecord(record) : null;
  }
}
