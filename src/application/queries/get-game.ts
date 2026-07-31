/**
 * GetGame query + handler — demonstrates the read side of CQRS.
 *
 * Reads from the materialized GameReadModel (maintained by the GameProjector)
 * via the GameReadModelStore port. Never touches the event store, aggregates,
 * or Prisma directly.
 */

import { Result } from '@/shared/types/result';
import type { Query, QueryWithPayload } from '@/application/queries/query';
import type { QueryHandler } from '@/application/handlers/query-handler';
import type { GameReadModelStore } from '@/application/ports';
import { NotFoundError } from '@/domain/shared/errors';

export interface GetGamePayload {
  readonly gameId: string;
}

export interface GameView {
  readonly gameId: string;
  readonly title: string;
  readonly creatorId: string;
  readonly status: string;
  readonly publishedAt: string | null;
}

export class GetGameQuery implements QueryWithPayload<GetGamePayload, GameView> {
  readonly queryType = 'GetGame';
  constructor(
    public readonly payload: GetGamePayload,
    public readonly correlationId?: string,
    public readonly userId?: string,
  ) {}
}

export class GetGameHandler implements QueryHandler<GetGameQuery, GameView> {
  readonly queryType = 'GetGame';

  constructor(private readonly gameStore: GameReadModelStore) {}

  async execute(query: GetGameQuery): Promise<Result<GameView>> {
    const record = await this.gameStore.findById(query.payload.gameId);

    if (!record) {
      return Result.fail(
        new NotFoundError('Game not found', 'Game', query.payload.gameId),
      );
    }

    return Result.ok({
      gameId: record.gameId,
      title: record.title,
      creatorId: record.creatorId,
      status: record.status,
      publishedAt: record.publishedAt,
    });
  }
}
