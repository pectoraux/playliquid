/**
 * Reconciliation queries.
 *
 * GetReconciliation / ListReconciliations / GetLatestReconciliation.
 *
 * Reads from the ReconciliationRepository. Reconciliation reports are domain
 * records stored in an append-only table — no projection needed.
 */

import { Result } from '@/shared/types/result';
import type { QueryWithPayload } from '@/application/queries/query';
import type { QueryHandler } from '@/application/handlers/query-handler';
import type {
  ReconciliationRepository,
  ReconciliationRecord,
} from '@/domain/launch/repositories';
import { NotFoundError } from '@/domain/shared/errors';

// ─── Get Reconciliation ───────────────────────────────────────────────────

export interface GetReconciliationPayload {
  readonly reconciliationId: string;
}

export type GetReconciliationResult = ReconciliationRecord;

export class GetReconciliationQuery
  implements QueryWithPayload<GetReconciliationPayload, GetReconciliationResult>
{
  readonly queryType = 'GetReconciliation';
  constructor(
    public readonly payload: GetReconciliationPayload,
    public readonly correlationId?: string,
    public readonly userId?: string,
  ) {}
}

export class GetReconciliationHandler
  implements QueryHandler<GetReconciliationQuery, GetReconciliationResult>
{
  readonly queryType = 'GetReconciliation';

  constructor(private readonly reconciliationRepo: ReconciliationRepository) {}

  async execute(
    query: GetReconciliationQuery,
  ): Promise<Result<GetReconciliationResult>> {
    const record = await this.reconciliationRepo.getById(
      query.payload.reconciliationId,
    );
    if (!record) {
      return Result.fail(
        new NotFoundError(
          'Reconciliation not found',
          'Reconciliation',
          query.payload.reconciliationId,
        ),
      );
    }
    return Result.ok(record);
  }
}

// ─── List Reconciliations ─────────────────────────────────────────────────

export interface ListReconciliationsPayload {
  readonly limit: number;
}

export interface ListReconciliationsResult {
  readonly items: readonly ReconciliationRecord[];
  readonly limit: number;
}

export class ListReconciliationsQuery
  implements
    QueryWithPayload<ListReconciliationsPayload, ListReconciliationsResult>
{
  readonly queryType = 'ListReconciliations';
  constructor(
    public readonly payload: ListReconciliationsPayload,
    public readonly correlationId?: string,
    public readonly userId?: string,
  ) {}
}

export class ListReconciliationsHandler
  implements QueryHandler<ListReconciliationsQuery, ListReconciliationsResult>
{
  readonly queryType = 'ListReconciliations';

  constructor(private readonly reconciliationRepo: ReconciliationRepository) {}

  async execute(
    query: ListReconciliationsQuery,
  ): Promise<Result<ListReconciliationsResult>> {
    const items = await this.reconciliationRepo.list(query.payload.limit);
    return Result.ok({
      items,
      limit: query.payload.limit,
    });
  }
}

// ─── Get Latest Reconciliation ────────────────────────────────────────────

export type GetLatestReconciliationPayload = Record<string, never>;

export interface GetLatestReconciliationResult {
  readonly record: ReconciliationRecord | null;
}

export class GetLatestReconciliationQuery
  implements
    QueryWithPayload<
      GetLatestReconciliationPayload,
      GetLatestReconciliationResult
    >
{
  readonly queryType = 'GetLatestReconciliation';
  constructor(
    public readonly payload: GetLatestReconciliationPayload = {},
    public readonly correlationId?: string,
    public readonly userId?: string,
  ) {}
}

export class GetLatestReconciliationHandler
  implements
    QueryHandler<GetLatestReconciliationQuery, GetLatestReconciliationResult>
{
  readonly queryType = 'GetLatestReconciliation';

  constructor(private readonly reconciliationRepo: ReconciliationRepository) {}

  async execute(
    _query: GetLatestReconciliationQuery,
  ): Promise<Result<GetLatestReconciliationResult>> {
    const record = await this.reconciliationRepo.getLatest();
    return Result.ok({ record });
  }
}
