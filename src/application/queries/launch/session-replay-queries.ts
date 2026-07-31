/**
 * Session replay queries.
 *
 * ListSessionReplays.
 *
 * Reads from the SessionReplayRepository. Replays are immutable records stored
 * in an append-only table — no projection needed.
 */

import { Result } from '@/shared/types/result';
import type { QueryWithPayload } from '@/application/queries/query';
import type { QueryHandler } from '@/application/handlers/query-handler';
import type {
  SessionReplayRepository,
  SessionReplayRecord,
} from '@/domain/launch/repositories';

// ─── List Session Replays ─────────────────────────────────────────────────

export interface ListSessionReplaysPayload {
  readonly cohortId?: string;
  readonly userId?: string;
  readonly limit: number;
  readonly offset: number;
}

export interface ListSessionReplaysResult {
  readonly items: readonly SessionReplayRecord[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

export class ListSessionReplaysQuery
  implements
    QueryWithPayload<ListSessionReplaysPayload, ListSessionReplaysResult>
{
  readonly queryType = 'ListSessionReplays';
  constructor(
    public readonly payload: ListSessionReplaysPayload,
    public readonly correlationId?: string,
    public readonly userId?: string,
  ) {}
}

export class ListSessionReplaysHandler
  implements QueryHandler<ListSessionReplaysQuery, ListSessionReplaysResult>
{
  readonly queryType = 'ListSessionReplays';

  constructor(private readonly replayRepo: SessionReplayRepository) {}

  async execute(
    query: ListSessionReplaysQuery,
  ): Promise<Result<ListSessionReplaysResult>> {
    const result = await this.replayRepo.list({
      cohortId: query.payload.cohortId,
      userId: query.payload.userId,
      limit: query.payload.limit,
      offset: query.payload.offset,
    });
    return Result.ok({
      items: result.items,
      total: result.total,
      limit: query.payload.limit,
      offset: query.payload.offset,
    });
  }
}
