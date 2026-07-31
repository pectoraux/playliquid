/**
 * PrismaReconciliationSource — the source-of-truth adapter the
 * `ReconciliationService` uses to verify ledger integrity.
 *
 * Two kinds of source data:
 *
 *   1. `getWalletBalances()` — the ACTUAL balances. These come from the
 *      `WalletReadModel` projection table, maintained by `WalletProjector`
 *      as it consumes `WalletDeposited` / `WalletWithdrawn` /
 *      `WalletDebited` events. This is what users see when they check
 *      their balance.
 *
 *   2. `getExpectedBalance(playerId)` — the EXPECTED balance, computed by
 *      replaying the wallet's event stream from the EventStore. This is
 *      the canonical truth — if it disagrees with the read model, the
 *      projection pipeline has a bug.
 *
 *   3. `getTransactionCount()` — the total count of wallet/minute-purchase
 *      transactions across the entire event store. Used by the
 *      reconciliation summary as a sanity check against the matched/
 *      unmatched counts.
 *
 * The stream ID convention is `WalletAggregate-<playerId>`, which matches
 * the `streamId('WalletAggregate', playerId)` helper used by the event
 * store's append path.
 */

import type { EventStore } from '@/application/ports';
import type { ReconciliationSource } from '@/domain/launch/services/reconciliation-service';
import type { SerializedEvent } from '@/domain/shared/event/domain-event';
import { getClient } from '@/infrastructure/database/prisma';
import { logger } from '@/shared/logging';

const WALLET_AGGREGATE_TYPE = 'WalletAggregate';
const COUNTED_EVENT_TYPES = new Set<string>([
  'WalletDeposited',
  'WalletWithdrawn',
  'MinutesPurchased',
]);

interface WalletReadRow {
  playerId: string;
  balance: number;
  currency: string;
}

export class PrismaReconciliationSource implements ReconciliationSource {
  constructor(private readonly eventStore: EventStore) {}

  /**
   * Read every wallet balance from the read model.
   *
   * Returns `{ playerId, balance, currency }` triples — the projection is
   * the source of truth for what users see, so this is the "actual" side
   * of the reconciliation.
   */
  async getWalletBalances(): Promise<
    Array<{ playerId: string; balance: number; currency: string }>
  > {
    const client = getClient();
    const rows = await client.walletReadModel.findMany({
      select: { playerId: true, balance: true, currency: true },
    });
    return (rows as WalletReadRow[]).map((r) => ({
      playerId: r.playerId,
      balance: r.balance,
      currency: r.currency,
    }));
  }

  /**
   * Replay the wallet's event stream to compute the expected balance.
   *
   * Stream ID convention: `WalletAggregate-<playerId>`. We sum every
   * `WalletDeposited` event and subtract every `WalletWithdrawn` /
   * `WalletDebited` event. If the stream is empty (no events yet), the
   * expected balance is 0.
   *
   * Errors during replay are logged and re-thrown so the reconciliation
   * service can mark the account as unmatched.
   */
  async getExpectedBalance(playerId: string): Promise<number> {
    const streamIdValue = `${WALLET_AGGREGATE_TYPE.toLowerCase()}-${playerId}`;
    let events: SerializedEvent[];
    try {
      events = await this.eventStore.load(streamIdValue);
    } catch (e) {
      logger.database().warn('Failed to load wallet event stream', {
        playerId,
        streamId: streamIdValue,
      });
      throw e;
    }

    let balance = 0;
    for (const event of events) {
      const payload = event.payload as { amount?: number };
      if (event.eventType === 'WalletDeposited') {
        balance += Number(payload.amount ?? 0);
      } else if (
        event.eventType === 'WalletWithdrawn' ||
        event.eventType === 'WalletDebited'
      ) {
        balance -= Number(payload.amount ?? 0);
      }
      // MinutesPurchased is a side-effect (debit happens via WalletDebited),
      // so we don't double-count it here.
    }
    return balance;
  }

  /**
   * Count total wallet + minutes-purchase transactions across the entire
   * event store. Used by the reconciliation summary as a sanity check.
   *
   * We use the EventStore's `replay()` cursor API to scan the full event
   * log in batches, counting only the event types we care about. This is
   * an O(N) scan of the event store — for production at scale we'd switch
   * to a projection that tracks the running count, but for the launch
   * cohorts (Phase A: ~100 testers, Phase B: ~1k testers) the linear scan
   * is well under a second.
   */
  async getTransactionCount(): Promise<number> {
    const BATCH_SIZE = 1000;
    let cursor = 0;
    let count = 0;

    while (true) {
      const { events, nextRowId } = await this.eventStore.replay(cursor, BATCH_SIZE);
      if (events.length === 0) break;
      for (const event of events) {
        if (COUNTED_EVENT_TYPES.has(event.eventType)) {
          count++;
        }
      }
      if (nextRowId === cursor) break;
      cursor = nextRowId;
    }

    return count;
  }
}
