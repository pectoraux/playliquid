/**
 * Feedback queries.
 *
 * ListFeedback / GetFeedbackStats.
 *
 * Reads from the FeedbackRepository. Feedback records are domain records
 * stored in an append-only table — no projection needed.
 */

import { Result } from '@/shared/types/result';
import type { QueryWithPayload } from '@/application/queries/query';
import type { QueryHandler } from '@/application/handlers/query-handler';
import type { FeedbackRepository, FeedbackRecord } from '@/domain/launch/repositories';

// ─── List Feedback ────────────────────────────────────────────────────────

export interface ListFeedbackPayload {
  readonly cohortId?: string;
  readonly category?: 'bug' | 'feature_request' | 'experience' | 'performance' | 'other';
  readonly severity?: 'low' | 'medium' | 'high' | 'critical';
  readonly status?: 'new' | 'triaged' | 'in_progress' | 'resolved' | 'wont_fix';
  readonly limit: number;
  readonly offset: number;
}

export interface ListFeedbackResult {
  readonly items: readonly FeedbackRecord[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

export class ListFeedbackQuery
  implements QueryWithPayload<ListFeedbackPayload, ListFeedbackResult>
{
  readonly queryType = 'ListFeedback';
  constructor(
    public readonly payload: ListFeedbackPayload,
    public readonly correlationId?: string,
    public readonly userId?: string,
  ) {}
}

export class ListFeedbackHandler
  implements QueryHandler<ListFeedbackQuery, ListFeedbackResult>
{
  readonly queryType = 'ListFeedback';

  constructor(private readonly feedbackRepo: FeedbackRepository) {}

  async execute(query: ListFeedbackQuery): Promise<Result<ListFeedbackResult>> {
    const result = await this.feedbackRepo.list({
      cohortId: query.payload.cohortId,
      category: query.payload.category,
      severity: query.payload.severity,
      status: query.payload.status,
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

// ─── Get Feedback Stats ───────────────────────────────────────────────────

export interface GetFeedbackStatsPayload {
  readonly cohortId: string;
}

export interface GetFeedbackStatsResult {
  readonly cohortId: string;
  readonly total: number;
  readonly byStatus: Readonly<Record<string, number>>;
  readonly bySeverity: Readonly<Record<string, number>>;
}

export class GetFeedbackStatsQuery
  implements QueryWithPayload<GetFeedbackStatsPayload, GetFeedbackStatsResult>
{
  readonly queryType = 'GetFeedbackStats';
  constructor(
    public readonly payload: GetFeedbackStatsPayload,
    public readonly correlationId?: string,
    public readonly userId?: string,
  ) {}
}

export class GetFeedbackStatsHandler
  implements QueryHandler<GetFeedbackStatsQuery, GetFeedbackStatsResult>
{
  readonly queryType = 'GetFeedbackStats';

  constructor(private readonly feedbackRepo: FeedbackRepository) {}

  async execute(
    query: GetFeedbackStatsQuery,
  ): Promise<Result<GetFeedbackStatsResult>> {
    const [byStatus, bySeverity] = await Promise.all([
      this.feedbackRepo.countByStatus(query.payload.cohortId),
      this.feedbackRepo.countBySeverity(query.payload.cohortId),
    ]);
    const total = Object.values(byStatus).reduce((sum, n) => sum + n, 0);
    return Result.ok({
      cohortId: query.payload.cohortId,
      total,
      byStatus,
      bySeverity,
    });
  }
}
