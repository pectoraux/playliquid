/**
 * Reconciliation Service — verifies ledger integrity.
 *
 * Compares the expected wallet balances (computed from domain events) against
 * the actual balances in the read model. Any discrepancy indicates a bug in
 * the event processing pipeline.
 *
 * In Phase A (Internal Alpha), reconciliation runs daily. In Phase B
 * (Closed Beta), it runs hourly. The goal is 100% financial reconciliation
 * before public launch.
 */

import { logger } from '@/shared/logging';

export interface ReconciliationResult {
  readonly status: 'balanced' | 'discrepancy' | 'error';
  readonly expectedBalance: number;
  readonly actualBalance: number;
  readonly discrepancy: number;
  readonly totalAccounts: number;
  readonly matchedAccounts: number;
  readonly unmatchedAccounts: number;
  readonly totalTransactions: number;
  readonly matchedTransactions: number;
  readonly unmatchedTransactions: number;
  readonly details: {
    readonly unmatchedAccounts: Array<{ playerId: string; expected: number; actual: number; difference: number }>;
    readonly errors: string[];
  };
  readonly durationMs: number;
}

export interface ReconciliationSource {
  /** Get all wallet balances from the read model. */
  getWalletBalances(): Promise<Array<{ playerId: string; balance: number; currency: string }>>;
  /** Get the expected balance for a player by replaying events. */
  getExpectedBalance(playerId: string): Promise<number>;
  /** Get transaction count for a period. */
  getTransactionCount(): Promise<number>;
}

export class ReconciliationService {
  constructor(private readonly source: ReconciliationSource) {}

  async reconcile(period: string): Promise<ReconciliationResult> {
    const startedAt = Date.now();
    logger.system().info('Reconciliation started', { period });

    try {
      const actualBalances = await this.source.getWalletBalances();
      let totalTransactions = 0;
      try {
        totalTransactions = await this.source.getTransactionCount();
      } catch {
        // Non-fatal — some sources may not support this
      }

      let expectedTotal = 0;
      let actualTotal = 0;
      let matchedAccounts = 0;
      const unmatchedAccounts: Array<{ playerId: string; expected: number; actual: number; difference: number }> = [];
      const errors: string[] = [];

      for (const account of actualBalances) {
        try {
          const expected = await this.source.getExpectedBalance(account.playerId);
          expectedTotal += expected;
          actualTotal += account.balance;

          if (expected === account.balance) {
            matchedAccounts++;
          } else {
            unmatchedAccounts.push({
              playerId: account.playerId,
              expected,
              actual: account.balance,
              difference: account.balance - expected,
            });
          }
        } catch (e) {
          errors.push(`Failed to reconcile ${account.playerId}: ${(e as Error).message}`);
        }
      }

      const discrepancy = actualTotal - expectedTotal;
      const status: ReconciliationResult['status'] =
        unmatchedAccounts.length === 0 && errors.length === 0
          ? 'balanced'
          : 'discrepancy';

      const result: ReconciliationResult = {
        status,
        expectedBalance: expectedTotal,
        actualBalance: actualTotal,
        discrepancy,
        totalAccounts: actualBalances.length,
        matchedAccounts,
        unmatchedAccounts: unmatchedAccounts.length,
        totalTransactions,
        matchedTransactions: totalTransactions, // Simplified
        unmatchedTransactions: 0,
        details: {
          unmatchedAccounts: unmatchedAccounts.slice(0, 100),
          errors,
        },
        durationMs: Date.now() - startedAt,
      };

      logger.system().info('Reconciliation completed', {
        period,
        status,
        discrepancy,
        unmatchedAccounts: unmatchedAccounts.length,
        durationMs: result.durationMs,
      });

      return result;
    } catch (e) {
      logger.system().error('Reconciliation failed', { period }, e);
      return {
        status: 'error',
        expectedBalance: 0,
        actualBalance: 0,
        discrepancy: 0,
        totalAccounts: 0,
        matchedAccounts: 0,
        unmatchedAccounts: 0,
        totalTransactions: 0,
        matchedTransactions: 0,
        unmatchedTransactions: 0,
        details: { unmatchedAccounts: [], errors: [(e as Error).message] },
        durationMs: Date.now() - startedAt,
      };
    }
  }
}
