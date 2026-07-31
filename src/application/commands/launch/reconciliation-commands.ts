/**
 * Reconciliation command.
 *
 * RunReconciliation.
 *
 * Delegates to the ReconciliationService domain service which compares
 * expected wallet balances (computed from domain events) against the actual
 * balances in the read model. The resulting ReconciliationResult is persisted
 * via the ReconciliationRepository for historical lookup and dashboards.
 */

import { Result } from '@/shared/types/result';
import { createId } from '@/shared/ids';
import type { CommandWithPayload } from '@/application/commands/command';
import type { CommandHandler } from '@/application/handlers/command-handler';
import type { ReconciliationRepository } from '@/domain/launch/repositories';
import type { ReconciliationService } from '@/domain/launch/services/reconciliation-service';
import { ValidationError } from '@/domain/shared/errors';

// ─── Run Reconciliation ───────────────────────────────────────────────────

export interface RunReconciliationPayload {
  readonly period: string;
}

export interface RunReconciliationResult {
  readonly reconciliationId: string;
  readonly period: string;
  readonly status: 'balanced' | 'discrepancy' | 'error';
  readonly expectedBalance: number;
  readonly actualBalance: number;
  readonly discrepancy: number;
  readonly totalTransactions: number;
  readonly matchedTransactions: number;
  readonly unmatchedTransactions: number;
  readonly durationMs: number;
}

export class RunReconciliationCommand
  implements CommandWithPayload<RunReconciliationPayload>
{
  readonly commandType = 'RunReconciliation';
  constructor(
    public readonly payload: RunReconciliationPayload,
    public readonly correlationId?: string,
    public readonly causationId?: string,
    public readonly idempotencyKey?: string,
    public readonly userId?: string,
  ) {}
}

export class RunReconciliationHandler
  implements
    CommandHandler<RunReconciliationCommand, RunReconciliationResult>
{
  readonly commandType = 'RunReconciliation';

  constructor(
    private readonly reconciliationRepo: ReconciliationRepository,
    private readonly reconciliationService: ReconciliationService,
  ) {}

  async execute(
    command: RunReconciliationCommand,
  ): Promise<Result<RunReconciliationResult>> {
    const { period } = command.payload;

    if (!period || period.trim().length === 0) {
      return Result.fail(new ValidationError('period is required', 'period'));
    }

    let result;
    try {
      result = await this.reconciliationService.reconcile(period);
    } catch (e) {
      return Result.fail(e as Error);
    }

    const reconciliationId = createId('recon');
    try {
      await this.reconciliationRepo.save({
        id: reconciliationId,
        period,
        status: result.status,
        expectedBalance: result.expectedBalance,
        actualBalance: result.actualBalance,
        discrepancy: result.discrepancy,
        totalTransactions: result.totalTransactions,
        matchedTransactions: result.matchedTransactions,
        unmatchedTransactions: result.unmatchedTransactions,
        completedAt: new Date().toISOString(),
        details: {
          totalAccounts: result.totalAccounts,
          matchedAccounts: result.matchedAccounts,
          unmatchedAccounts: result.unmatchedAccounts,
          unmatchedAccountDetails: result.details.unmatchedAccounts,
          errors: result.details.errors,
          durationMs: result.durationMs,
        },
      });
    } catch (e) {
      return Result.fail(e as Error);
    }

    return Result.ok({
      reconciliationId,
      period,
      status: result.status,
      expectedBalance: result.expectedBalance,
      actualBalance: result.actualBalance,
      discrepancy: result.discrepancy,
      totalTransactions: result.totalTransactions,
      matchedTransactions: result.matchedTransactions,
      unmatchedTransactions: result.unmatchedTransactions,
      durationMs: result.durationMs,
    });
  }
}
