/**
 * Beta cohort queries.
 *
 * GetCohort / ListCohorts / GetCohortParticipants.
 *
 * Query handlers read from materialised read models via the
 * BetaCohortReadModelStore port. They never mutate state. When no
 * projection is available, GetCohort falls back to rehydrating the
 * BetaCohortAggregate via the BetaCohortRepository.
 *
 * GetCohortParticipants always rehydrates the aggregate (participants are
 * in-memory children of the cohort). A future projection could replace this.
 */

import { Result } from '@/shared/types/result';
import type { QueryWithPayload } from '@/application/queries/query';
import type { QueryHandler } from '@/application/handlers/query-handler';
import type { BetaCohortRepository } from '@/domain/launch/repositories';
import type { BetaCohortAggregate } from '@/domain/launch/aggregates/beta-cohort-aggregate';
import type {
  BetaCohortView,
  BetaCohortListFilters,
  BetaCohortReadModelStore,
  PaginatedResult,
  ParticipantView,
} from '@/application/ports/launch-ports';
import { participantToView } from '@/application/ports/launch-ports';
import { NotFoundError } from '@/domain/shared/errors';

// ─── Get Cohort ───────────────────────────────────────────────────────────

export interface GetCohortPayload {
  readonly cohortId: string;
}

export type GetCohortResult = BetaCohortView;

export class GetCohortQuery
  implements QueryWithPayload<GetCohortPayload, GetCohortResult>
{
  readonly queryType = 'GetCohort';
  constructor(
    public readonly payload: GetCohortPayload,
    public readonly correlationId?: string,
    public readonly userId?: string,
  ) {}
}

export class GetCohortHandler
  implements QueryHandler<GetCohortQuery, GetCohortResult>
{
  readonly queryType = 'GetCohort';

  constructor(
    private readonly cohortStore: BetaCohortReadModelStore,
    private readonly cohortRepo: BetaCohortRepository | null,
  ) {}

  async execute(query: GetCohortQuery): Promise<Result<GetCohortResult>> {
    const view = await this.cohortStore.getById(query.payload.cohortId);
    if (view) return Result.ok(view);

    if (this.cohortRepo) {
      const cohort = await this.cohortRepo.getById(query.payload.cohortId);
      if (cohort) return Result.ok(aggregateToView(cohort));
    }

    return Result.fail(
      new NotFoundError('Cohort not found', 'BetaCohort', query.payload.cohortId),
    );
  }
}

// ─── List Cohorts ─────────────────────────────────────────────────────────

export interface ListCohortsPayload {
  readonly phase?: 'alpha' | 'closed_beta' | 'open_beta';
  readonly limit: number;
  readonly offset: number;
}

export type ListCohortsResult = PaginatedResult<BetaCohortView>;

export class ListCohortsQuery
  implements QueryWithPayload<ListCohortsPayload, ListCohortsResult>
{
  readonly queryType = 'ListCohorts';
  constructor(
    public readonly payload: ListCohortsPayload,
    public readonly correlationId?: string,
    public readonly userId?: string,
  ) {}
}

export class ListCohortsHandler
  implements QueryHandler<ListCohortsQuery, ListCohortsResult>
{
  readonly queryType = 'ListCohorts';

  constructor(private readonly cohortStore: BetaCohortReadModelStore) {}

  async execute(query: ListCohortsQuery): Promise<Result<ListCohortsResult>> {
    const filters: BetaCohortListFilters = {
      phase: query.payload.phase,
      limit: query.payload.limit,
      offset: query.payload.offset,
    };
    const result = await this.cohortStore.list(filters);
    return Result.ok(result);
  }
}

// ─── Get Cohort Participants ──────────────────────────────────────────────

export interface GetCohortParticipantsPayload {
  readonly cohortId: string;
  readonly status?: 'pending' | 'accepted' | 'revoked' | 'expired';
}

export interface GetCohortParticipantsResult {
  readonly cohortId: string;
  readonly participants: readonly ParticipantView[];
  readonly total: number;
}

export class GetCohortParticipantsQuery
  implements
    QueryWithPayload<GetCohortParticipantsPayload, GetCohortParticipantsResult>
{
  readonly queryType = 'GetCohortParticipants';
  constructor(
    public readonly payload: GetCohortParticipantsPayload,
    public readonly correlationId?: string,
    public readonly userId?: string,
  ) {}
}

export class GetCohortParticipantsHandler
  implements
    QueryHandler<GetCohortParticipantsQuery, GetCohortParticipantsResult>
{
  readonly queryType = 'GetCohortParticipants';

  constructor(private readonly cohortRepo: BetaCohortRepository) {}

  async execute(
    query: GetCohortParticipantsQuery,
  ): Promise<Result<GetCohortParticipantsResult>> {
    const cohort = await this.cohortRepo.getById(query.payload.cohortId);
    if (!cohort) {
      return Result.fail(
        new NotFoundError('Cohort not found', 'BetaCohort', query.payload.cohortId),
      );
    }

    const all = cohort.participants;
    const filtered = query.payload.status
      ? all.filter((p) => p.status === query.payload.status)
      : all;
    const participants = filtered.map(participantToView);

    return Result.ok({
      cohortId: query.payload.cohortId,
      participants,
      total: participants.length,
    });
  }
}

// ─── Helper ───────────────────────────────────────────────────────────────

function aggregateToView(cohort: BetaCohortAggregate): BetaCohortView {
  const revokedCount = cohort.participants.filter((p) => p.status === 'revoked').length;
  return {
    cohortId: String(cohort.id),
    name: cohort.name,
    phase: cohort.phase,
    maxParticipants: cohort.maxParticipants,
    acceptedCount: cohort.acceptedCount,
    pendingCount: cohort.pendingCount,
    revokedCount,
    createdById: cohort.createdById,
    active: cohort.active,
    createdAt: cohort.createdAt,
    updatedAt: cohort.updatedAt,
  };
}
