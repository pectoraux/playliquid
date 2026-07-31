/**
 * Concrete projectors — framework-only, no business logic yet.
 *
 * These projectors demonstrate the projection infrastructure by maintaining
 * read models. Future milestones will add real business projections.
 */

import type { DomainEvent } from '@/domain/shared/event/domain-event';
import { Projector } from '@/infrastructure/projections/projection-engine';
import { getClient } from '@/infrastructure/database/prisma';
import { logger } from '@/shared/logging';

/** Maintains the wallet read model from WalletDeposited / WalletWithdrawn events. */
export class WalletProjector extends Projector {
  readonly name = 'WalletProjector';
  readonly handledEventTypes = ['WalletDeposited', 'WalletWithdrawn', 'WalletDebited'] as const;

  async handle(event: DomainEvent): Promise<void> {
    const payload = event.payload as { playerId: string; amount: number; currency: string };
    const client = getClient();

    if (event.eventType === 'WalletDeposited') {
      await client.walletReadModel.upsert({
        where: { playerId: payload.playerId },
        create: {
          playerId: payload.playerId,
          balance: payload.amount,
          currency: payload.currency,
        },
        update: {
          balance: { increment: payload.amount },
        },
      });
    } else if (event.eventType === 'WalletWithdrawn' || event.eventType === 'WalletDebited') {
      await client.walletReadModel.upsert({
        where: { playerId: payload.playerId },
        create: {
          playerId: payload.playerId,
          balance: -payload.amount,
          currency: payload.currency,
        },
        update: {
          balance: { decrement: payload.amount },
        },
      });
    }
  }

  async reset(): Promise<void> {
    const client = getClient();
    await client.walletReadModel.deleteMany({});
    logger.projection().info('WalletProjector read model cleared');
  }
}

/** Maintains the leaderboard read model from ScoreVerified events. */
export class LeaderboardProjector extends Projector {
  readonly name = 'LeaderboardProjector';
  readonly handledEventTypes = ['ScoreVerified', 'LeaderboardUpdated'] as const;

  async handle(event: DomainEvent): Promise<void> {
    const client = getClient();

    if (event.eventType === 'ScoreVerified') {
      const payload = event.payload as { gameId: string; playerId: string; score: number };
      await client.leaderboardEntry.upsert({
        where: {
          gameId_playerId: { gameId: payload.gameId, playerId: payload.playerId },
        },
        create: {
          gameId: payload.gameId,
          playerId: payload.playerId,
          score: payload.score,
        },
        update: {
          score: payload.score,
        },
      });
    }
  }

  async reset(): Promise<void> {
    const client = getClient();
    await client.leaderboardEntry.deleteMany({});
    logger.projection().info('LeaderboardProjector read model cleared');
  }
}

/** Maintains aggregate statistics from all events. */
export class StatisticsProjector extends Projector {
  readonly name = 'StatisticsProjector';
  readonly handledEventTypes = ['*'] as unknown as readonly string[];

  async handle(event: DomainEvent): Promise<void> {
    const client = getClient();
    const key = `event:${event.eventType}:count`;
    const existing = await client.statisticsReadModel.findUnique({ where: { key } });
    const count = existing ? parseInt(existing.value, 10) + 1 : 1;
    await client.statisticsReadModel.upsert({
      where: { key },
      create: { id: key, key, value: String(count) },
      update: { value: String(count) },
    });
  }

  async reset(): Promise<void> {
    const client = getClient();
    await client.statisticsReadModel.deleteMany({});
    logger.projection().info('StatisticsProjector read model cleared');
  }
}
