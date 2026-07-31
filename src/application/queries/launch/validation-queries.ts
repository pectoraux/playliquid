/**
 * Validation run queries.
 *
 * GetValidationRun / ListValidationRuns / GetLatestValidation.
 *
 * Reads from the ValidationRunRepository. Validation runs are domain records
 * stored in an append-only table — no projection needed.
 */

import { Result } from '@/shared/types/result';
import type { QueryWithPayload } from '@/application/queries/query';
import type { QueryHandler } from '@/application/handlers/query-handler';
import type {
  ValidationRunRepository,
  ValidationRunRecord,
} from '@/domain/launch/repositories';
import { NotFoundError } from '@/domain/shared/errors';

// ─── Get Validation Run ───────────────────────────────────────────────────

export interface GetValidationRunPayload {
  readonly runId: string;
}

export type GetValidationRunResult = ValidationRunRecord;

export class GetValidationRunQuery
  implements QueryWithPayload<GetValidationRunPayload, GetValidationRunResult>
{
  readonly queryType = 'GetValidationRun';
  constructor(
    public readonly payload: GetValidationRunPayload,
    public readonly correlationId?: string,
    public readonly userId?: string,
  ) {}
}

export class GetValidationRunHandler
  implements QueryHandler<GetValidationRunQuery, GetValidationRunResult>
{
  readonly queryType = 'GetValidationRun';

  constructor(private readonly runRepo: ValidationRunRepository) {}

  async execute(
    query: GetValidationRunQuery,
  ): Promise<Result<GetValidationRunResult>> {
    const run = await this.runRepo.getById(query.payload.runId);
    if (!run) {
      return Result.fail(
        new NotFoundError('Validation run not found', 'ValidationRun', query.payload.runId),
      );
    }
    return Result.ok(run);
  }
}

// ─── List Validation Runs ─────────────────────────────────────────────────

export interface ListValidationRunsPayload {
  readonly limit: number;
}

export interface ListValidationRunsResult {
  readonly items: readonly ValidationRunRecord[];
  readonly limit: number;
}

export class ListValidationRunsQuery
  implements QueryWithPayload<ListValidationRunsPayload, ListValidationRunsResult>
{
  readonly queryType = 'ListValidationRuns';
  constructor(
    public readonly payload: ListValidationRunsPayload,
    public readonly correlationId?: string,
    public readonly userId?: string,
  ) {}
}

export class ListValidationRunsHandler
  implements QueryHandler<ListValidationRunsQuery, ListValidationRunsResult>
{
  readonly queryType = 'ListValidationRuns';

  constructor(private readonly runRepo: ValidationRunRepository) {}

  async execute(
    query: ListValidationRunsQuery,
  ): Promise<Result<ListValidationRunsResult>> {
    const items = await this.runRepo.list(query.payload.limit);
    return Result.ok({
      items,
      limit: query.payload.limit,
    });
  }
}

// ─── Get Latest Validation ────────────────────────────────────────────────

export interface GetLatestValidationPayload {
  readonly suite: string;
}

export interface GetLatestValidationResult {
  readonly run: ValidationRunRecord | null;
}

export class GetLatestValidationQuery
  implements
    QueryWithPayload<GetLatestValidationPayload, GetLatestValidationResult>
{
  readonly queryType = 'GetLatestValidation';
  constructor(
    public readonly payload: GetLatestValidationPayload,
    public readonly correlationId?: string,
    public readonly userId?: string,
  ) {}
}

export class GetLatestValidationHandler
  implements QueryHandler<GetLatestValidationQuery, GetLatestValidationResult>
{
  readonly queryType = 'GetLatestValidation';

  constructor(private readonly runRepo: ValidationRunRepository) {}

  async execute(
    query: GetLatestValidationQuery,
  ): Promise<Result<GetLatestValidationResult>> {
    const run = await this.runRepo.getLatest(query.payload.suite);
    return Result.ok({ run });
  }
}
