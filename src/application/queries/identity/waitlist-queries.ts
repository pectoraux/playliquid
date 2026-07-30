/**
 * Waitlist queries.
 *
 * ListWaitlist / GetWaitlistStats.
 *
 * Reads from the WaitlistRepository — waitlist entries are a domain concept
 * but stored as flat records (not aggregates). The repository exposes the
 * `list` and `countByStatus` methods needed by these queries.
 */

import { Result } from '@/shared/types/result';
import type { QueryWithPayload } from '@/application/queries/query';
import type { QueryHandler } from '@/application/handlers/query-handler';
import type { WaitlistRepository, WaitlistEntry } from '@/domain/identity/repositories';

// ─── List Waitlist ─────────────────────────────────────────────────────────

export interface ListWaitlistPayload {
  readonly status?: string;
  readonly limit: number;
  readonly offset: number;
}

export interface ListWaitlistResult {
  readonly items: readonly WaitlistEntry[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

export class ListWaitlistQuery
  implements QueryWithPayload<ListWaitlistPayload, ListWaitlistResult>
{
  readonly queryType = 'ListWaitlist';
  constructor(
    public readonly payload: ListWaitlistPayload,
    public readonly correlationId?: string,
    public readonly userId?: string,
  ) {}
}

export class ListWaitlistHandler
  implements QueryHandler<ListWaitlistQuery, ListWaitlistResult>
{
  readonly queryType = 'ListWaitlist';

  constructor(private readonly waitlistRepo: WaitlistRepository) {}

  async execute(query: ListWaitlistQuery): Promise<Result<ListWaitlistResult>> {
    const items = await this.waitlistRepo.list({
      status: query.payload.status,
      limit: query.payload.limit,
      offset: query.payload.offset,
    });
    const total = await this.waitlistRepo.count();
    return Result.ok({
      items,
      total,
      limit: query.payload.limit,
      offset: query.payload.offset,
    });
  }
}

// ─── Get Waitlist Stats ────────────────────────────────────────────────────

export type GetWaitlistStatsPayload = Record<string, never>;

export interface GetWaitlistStatsResult {
  readonly total: number;
  readonly byStatus: Readonly<Record<string, number>>;
}

export class GetWaitlistStatsQuery
  implements QueryWithPayload<GetWaitlistStatsPayload, GetWaitlistStatsResult>
{
  readonly queryType = 'GetWaitlistStats';
  constructor(
    public readonly payload: GetWaitlistStatsPayload = {},
    public readonly correlationId?: string,
    public readonly userId?: string,
  ) {}
}

export class GetWaitlistStatsHandler
  implements QueryHandler<GetWaitlistStatsQuery, GetWaitlistStatsResult>
{
  readonly queryType = 'GetWaitlistStats';

  constructor(private readonly waitlistRepo: WaitlistRepository) {}

  async execute(query: GetWaitlistStatsQuery): Promise<Result<GetWaitlistStatsResult>> {
    const byStatus = await this.waitlistRepo.countByStatus();
    const total = Object.values(byStatus).reduce((sum, n) => sum + n, 0);
    return Result.ok({ total, byStatus });
  }
}
