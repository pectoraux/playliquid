/**
 * Prisma GameReadModelStore — implements the GameReadModelStore port.
 *
 * This is the adapter that bridges the application port to Prisma. Query
 * handlers depend on the port interface, never on this class.
 */

import type { GameReadModelStore } from '@/application/ports';
import { getClient } from '@/infrastructure/database/prisma';

export class PrismaGameReadModelStore implements GameReadModelStore {
  async findById(gameId: string) {
    const client = getClient();
    const record = await client.gameReadModel.findUnique({
      where: { gameId },
    });
    if (!record) return null;
    return {
      gameId: record.gameId,
      title: record.title,
      creatorId: record.creatorId,
      status: record.status,
      publishedAt: record.publishedAt,
    };
  }
}
