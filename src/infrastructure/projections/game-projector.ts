/**
 * GameProjector — projects GamePublished / GameUnpublished events into the
 * GameReadModel for the query side.
 */

import type { DomainEvent } from '@/domain/shared/event/domain-event';
import { Projector } from '@/infrastructure/projections/projection-engine';
import { getClient } from '@/infrastructure/database/prisma';
import { logger } from '@/shared/logging';

export class GameProjector extends Projector {
  readonly name = 'GameProjector';
  readonly handledEventTypes = ['GamePublished', 'GameUnpublished'] as const;

  async handle(event: DomainEvent): Promise<void> {
    const client = getClient();

    if (event.eventType === 'GamePublished') {
      const payload = event.payload as {
        gameId: string;
        title: string;
        creatorId: string;
        publishedAt: string;
      };
      await client.gameReadModel.upsert({
        where: { gameId: payload.gameId },
        create: {
          gameId: payload.gameId,
          title: payload.title,
          creatorId: payload.creatorId,
          status: 'published',
          publishedAt: payload.publishedAt,
          createdAt: payload.publishedAt,
        },
        update: {
          title: payload.title,
          creatorId: payload.creatorId,
          status: 'published',
          publishedAt: payload.publishedAt,
        },
      });
    } else if (event.eventType === 'GameUnpublished') {
      const payload = event.payload as { gameId: string };
      await client.gameReadModel.update({
        where: { gameId: payload.gameId },
        data: { status: 'unpublished' },
      }).catch(() => {});
    }
  }

  async reset(): Promise<void> {
    const client = getClient();
    await client.gameReadModel.deleteMany({});
    logger.projection().info('GameProjector read model cleared');
  }
}
