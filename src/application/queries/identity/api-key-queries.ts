/**
 * API key queries.
 *
 * ListApiKeys / GetApiKey.
 *
 * Returns API key records WITHOUT the hash field — handlers strip it before
 * returning. The hash is only used internally by the infrastructure to
 * verify presented keys; it must never leak to clients.
 */

import { Result } from '@/shared/types/result';
import type { QueryWithPayload } from '@/application/queries/query';
import type { QueryHandler } from '@/application/handlers/query-handler';
import type { ApiKeyRepository, ApiKeyData } from '@/domain/identity/repositories';
import { NotFoundError } from '@/domain/shared/errors';

// ─── Public view (hash stripped) ────────────────────────────────────────────

export interface ApiKeyView {
  readonly id: string;
  readonly userId: string;
  readonly name: string;
  readonly keyPrefix: string;
  readonly scopes: readonly string[];
  readonly expiresAt: string | null;
  readonly lastUsedAt: string | null;
  readonly lastUsedIp: string | null;
  readonly createdAt: string;
  readonly revokedAt: string | null;
  readonly active: boolean;
}

function toView(data: ApiKeyData): ApiKeyView {
  return {
    id: data.id,
    userId: data.userId,
    name: data.name,
    keyPrefix: data.keyPrefix,
    scopes: data.scopes,
    expiresAt: data.expiresAt,
    lastUsedAt: data.lastUsedAt,
    lastUsedIp: data.lastUsedIp,
    createdAt: data.createdAt,
    revokedAt: data.revokedAt,
    active: data.active,
  };
}

// ─── List API Keys ─────────────────────────────────────────────────────────

export interface ListApiKeysPayload {
  readonly userId: string;
}

export type ListApiKeysResult = readonly ApiKeyView[];

export class ListApiKeysQuery
  implements QueryWithPayload<ListApiKeysPayload, ListApiKeysResult>
{
  readonly queryType = 'ListApiKeys';
  constructor(
    public readonly payload: ListApiKeysPayload,
    public readonly correlationId?: string,
    public readonly userId?: string,
  ) {}
}

export class ListApiKeysHandler
  implements QueryHandler<ListApiKeysQuery, ListApiKeysResult>
{
  readonly queryType = 'ListApiKeys';

  constructor(private readonly apiKeyRepo: ApiKeyRepository) {}

  async execute(query: ListApiKeysQuery): Promise<Result<ListApiKeysResult>> {
    const keys = await this.apiKeyRepo.getByUserId(query.payload.userId);
    return Result.ok(keys.map(toView));
  }
}

// ─── Get API Key ───────────────────────────────────────────────────────────

export interface GetApiKeyPayload {
  readonly apiKeyId: string;
}

export type GetApiKeyResult = ApiKeyView;

export class GetApiKeyQuery
  implements QueryWithPayload<GetApiKeyPayload, GetApiKeyResult>
{
  readonly queryType = 'GetApiKey';
  constructor(
    public readonly payload: GetApiKeyPayload,
    public readonly correlationId?: string,
    public readonly userId?: string,
  ) {}
}

export class GetApiKeyHandler implements QueryHandler<GetApiKeyQuery, GetApiKeyResult> {
  readonly queryType = 'GetApiKey';

  constructor(private readonly apiKeyRepo: ApiKeyRepository) {}

  async execute(query: GetApiKeyQuery): Promise<Result<GetApiKeyResult>> {
    const key = await this.apiKeyRepo.getById(query.payload.apiKeyId);
    if (!key) {
      return Result.fail(
        new NotFoundError('API key not found', 'ApiKey', query.payload.apiKeyId),
      );
    }
    return Result.ok(toView(key));
  }
}
