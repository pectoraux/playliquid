/**
 * Bug queries.
 *
 * ListBugs / GetBugStats.
 *
 * Reads from the BugRepository. Bug records are domain records stored in an
 * append-only table — no projection needed.
 */

import { Result } from '@/shared/types/result';
import type { QueryWithPayload } from '@/application/queries/query';
import type { QueryHandler } from '@/application/handlers/query-handler';
import type { BugRepository, BugRecord } from '@/domain/launch/repositories';

// ─── List Bugs ────────────────────────────────────────────────────────────

export interface ListBugsPayload {
  readonly severity?: 'low' | 'medium' | 'high' | 'critical';
  readonly status?: 'open' | 'in_progress' | 'fixed' | 'wont_fix' | 'duplicate' | 'invalid';
  readonly cohortId?: string;
  readonly limit: number;
  readonly offset: number;
}

export interface ListBugsResult {
  readonly items: readonly BugRecord[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

export class ListBugsQuery
  implements QueryWithPayload<ListBugsPayload, ListBugsResult>
{
  readonly queryType = 'ListBugs';
  constructor(
    public readonly payload: ListBugsPayload,
    public readonly correlationId?: string,
    public readonly userId?: string,
  ) {}
}

export class ListBugsHandler
  implements QueryHandler<ListBugsQuery, ListBugsResult>
{
  readonly queryType = 'ListBugs';

  constructor(private readonly bugRepo: BugRepository) {}

  async execute(query: ListBugsQuery): Promise<Result<ListBugsResult>> {
    const result = await this.bugRepo.list({
      severity: query.payload.severity,
      status: query.payload.status,
      cohortId: query.payload.cohortId,
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

// ─── Get Bug Stats ────────────────────────────────────────────────────────

export interface GetBugStatsPayload {
  readonly cohortId?: string;
}

export interface GetBugStatsResult {
  readonly cohortId: string | null;
  readonly total: number;
  readonly bySeverity: Readonly<Record<string, number>>;
  readonly byStatus: Readonly<Record<string, number>>;
}

export class GetBugStatsQuery
  implements QueryWithPayload<GetBugStatsPayload, GetBugStatsResult>
{
  readonly queryType = 'GetBugStats';
  constructor(
    public readonly payload: GetBugStatsPayload,
    public readonly correlationId?: string,
    public readonly userId?: string,
  ) {}
}

export class GetBugStatsHandler
  implements QueryHandler<GetBugStatsQuery, GetBugStatsResult>
{
  readonly queryType = 'GetBugStats';

  constructor(private readonly bugRepo: BugRepository) {}

  async execute(query: GetBugStatsQuery): Promise<Result<GetBugStatsResult>> {
    const [bySeverity, byStatus] = await Promise.all([
      this.bugRepo.countBySeverity(query.payload.cohortId),
      this.bugRepo.countByStatus(query.payload.cohortId),
    ]);
    const total = Object.values(byStatus).reduce((sum, n) => sum + n, 0);
    return Result.ok({
      cohortId: query.payload.cohortId ?? null,
      total,
      bySeverity,
      byStatus,
    });
  }
}
