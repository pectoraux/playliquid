/**
 * Audit log queries.
 *
 * ListAuditLog / GetAuditEntry.
 *
 * Audit entries are append-only and live in the AuditLogRepository. These
 * queries simply forward filters to the repository and return the entries
 * as-is — no projection or aggregation needed.
 */

import { Result } from '@/shared/types/result';
import type { QueryWithPayload } from '@/application/queries/query';
import type { QueryHandler } from '@/application/handlers/query-handler';
import type {
  AuditLogRepository,
  AuditLogEntry,
  AuditLogFilters,
} from '@/domain/identity/repositories';
import { NotFoundError } from '@/domain/shared/errors';

// ─── List Audit Log ────────────────────────────────────────────────────────

export interface ListAuditLogPayload {
  readonly actorId?: string;
  readonly targetType?: string;
  readonly action?: string;
  readonly fromTimestamp?: string;
  readonly toTimestamp?: string;
  readonly limit: number;
  readonly offset: number;
}

export interface ListAuditLogResult {
  readonly items: readonly AuditLogEntry[];
  readonly limit: number;
  readonly offset: number;
}

export class ListAuditLogQuery
  implements QueryWithPayload<ListAuditLogPayload, ListAuditLogResult>
{
  readonly queryType = 'ListAuditLog';
  constructor(
    public readonly payload: ListAuditLogPayload,
    public readonly correlationId?: string,
    public readonly userId?: string,
  ) {}
}

export class ListAuditLogHandler
  implements QueryHandler<ListAuditLogQuery, ListAuditLogResult>
{
  readonly queryType = 'ListAuditLog';

  constructor(private readonly auditRepo: AuditLogRepository) {}

  async execute(query: ListAuditLogQuery): Promise<Result<ListAuditLogResult>> {
    const filters: AuditLogFilters = {
      actorId: query.payload.actorId,
      targetType: query.payload.targetType,
      action: query.payload.action,
      fromTimestamp: query.payload.fromTimestamp,
      toTimestamp: query.payload.toTimestamp,
      limit: query.payload.limit,
      offset: query.payload.offset,
    };
    const items = await this.auditRepo.list(filters);
    return Result.ok({
      items,
      limit: query.payload.limit,
      offset: query.payload.offset,
    });
  }
}

// ─── Get Audit Entry ───────────────────────────────────────────────────────

export interface GetAuditEntryPayload {
  readonly auditId: string;
}

export type GetAuditEntryResult = AuditLogEntry;

export class GetAuditEntryQuery
  implements QueryWithPayload<GetAuditEntryPayload, GetAuditEntryResult>
{
  readonly queryType = 'GetAuditEntry';
  constructor(
    public readonly payload: GetAuditEntryPayload,
    public readonly correlationId?: string,
    public readonly userId?: string,
  ) {}
}

export class GetAuditEntryHandler
  implements QueryHandler<GetAuditEntryQuery, GetAuditEntryResult>
{
  readonly queryType = 'GetAuditEntry';

  constructor(private readonly auditRepo: AuditLogRepository) {}

  async execute(query: GetAuditEntryQuery): Promise<Result<GetAuditEntryResult>> {
    const entry = await this.auditRepo.getById(query.payload.auditId);
    if (!entry) {
      return Result.fail(
        new NotFoundError('Audit entry not found', 'AuditLogEntry', query.payload.auditId),
      );
    }
    return Result.ok(entry);
  }
}
