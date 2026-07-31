/**
 * API key commands.
 *
 * CreateApiKey / RotateApiKey / DisableApiKey.
 *
 * API keys are not aggregates — they are immutable records keyed by an ID and
 * indexed by hash. The plaintext key is shown to the user ONCE at creation /
 * rotation time; only the hash is persisted.
 */

import { Result } from '@/shared/types/result';
import { createId } from '@/shared/ids';
import type { CommandWithPayload } from '@/application/commands/command';
import type { CommandHandler } from '@/application/handlers/command-handler';
import type { ApiKeyRepository, ApiKeyData, AuditLogRepository, AuditLogEntry } from '@/domain/identity/repositories';
import type { ApiKeyHasher } from '@/application/ports/identity-ports';
import {
  BusinessRuleError,
  NotFoundError,
  ValidationError,
} from '@/domain/shared/errors';

// ─── Create API Key ────────────────────────────────────────────────────────

export interface CreateApiKeyPayload {
  readonly userId: string;
  readonly name: string;
  readonly scopes: readonly string[];
  readonly expiresAt?: string;
}

export interface CreateApiKeyResult {
  readonly apiKeyId: string;
  readonly plaintextKey: string;
  readonly keyPrefix: string;
}

export class CreateApiKeyCommand implements CommandWithPayload<CreateApiKeyPayload> {
  readonly commandType = 'CreateApiKey';
  constructor(
    public readonly payload: CreateApiKeyPayload,
    public readonly correlationId?: string,
    public readonly causationId?: string,
    public readonly idempotencyKey?: string,
    public readonly userId?: string,
  ) {}
}

export class CreateApiKeyHandler
  implements CommandHandler<CreateApiKeyCommand, CreateApiKeyResult>
{
  readonly commandType = 'CreateApiKey';

  constructor(
    private readonly apiKeyRepo: ApiKeyRepository,
    private readonly hasher: ApiKeyHasher,
    private readonly auditRepo: AuditLogRepository | null,
  ) {}

  async execute(command: CreateApiKeyCommand): Promise<Result<CreateApiKeyResult>> {
    const { userId, name, scopes, expiresAt } = command.payload;

    if (scopes.length === 0) {
      return Result.fail(
        new ValidationError('At least one scope is required', 'scopes'),
      );
    }
    if (expiresAt) {
      const expiry = new Date(expiresAt).getTime();
      if (Number.isNaN(expiry) || expiry < Date.now()) {
        return Result.fail(
          new ValidationError('expiresAt must be a future ISO timestamp', 'expiresAt'),
        );
      }
    }

    const { plaintext, hash, prefix } = this.hasher.generate();
    const now = new Date().toISOString();
    const apiKeyId = createId('apikey');
    const record: ApiKeyData = {
      id: apiKeyId,
      userId,
      name,
      keyHash: hash,
      keyPrefix: prefix,
      scopes: [...scopes],
      expiresAt: expiresAt ?? null,
      lastUsedAt: null,
      lastUsedIp: null,
      createdAt: now,
      revokedAt: null,
      active: true,
    };

    try {
      await this.apiKeyRepo.save(record);
    } catch (e) {
      return Result.fail(e as Error);
    }

    if (this.auditRepo) {
      await this.auditRepo.append(buildAudit(userId, 'api_key.create', 'ApiKey', apiKeyId, { name, scopes }));
    }

    return Result.ok({
      apiKeyId,
      plaintextKey: plaintext,
      keyPrefix: prefix,
    });
  }
}

// ─── Rotate API Key ────────────────────────────────────────────────────────

export interface RotateApiKeyPayload {
  readonly apiKeyId: string;
  readonly userId: string;
}

export interface RotateApiKeyResult {
  readonly apiKeyId: string;
  readonly plaintextKey: string;
  readonly keyPrefix: string;
}

export class RotateApiKeyCommand implements CommandWithPayload<RotateApiKeyPayload> {
  readonly commandType = 'RotateApiKey';
  constructor(
    public readonly payload: RotateApiKeyPayload,
    public readonly correlationId?: string,
    public readonly causationId?: string,
    public readonly idempotencyKey?: string,
    public readonly userId?: string,
  ) {}
}

export class RotateApiKeyHandler
  implements CommandHandler<RotateApiKeyCommand, RotateApiKeyResult>
{
  readonly commandType = 'RotateApiKey';

  constructor(
    private readonly apiKeyRepo: ApiKeyRepository,
    private readonly hasher: ApiKeyHasher,
    private readonly auditRepo: AuditLogRepository | null,
  ) {}

  async execute(command: RotateApiKeyCommand): Promise<Result<RotateApiKeyResult>> {
    const { apiKeyId, userId } = command.payload;

    const existing = await this.apiKeyRepo.getById(apiKeyId);
    if (!existing) {
      return Result.fail(new NotFoundError('API key not found', 'ApiKey', apiKeyId));
    }
    if (existing.userId !== userId) {
      return Result.fail(
        new BusinessRuleError('API key does not belong to the specified user', 'OWNER_MISMATCH'),
      );
    }
    if (!existing.active) {
      return Result.fail(
        new BusinessRuleError('Cannot rotate a revoked API key', 'KEY_REVOKED'),
      );
    }

    const { plaintext, hash, prefix } = this.hasher.generate();
    try {
      await this.apiKeyRepo.update(apiKeyId, {
        keyHash: hash,
        keyPrefix: prefix,
        lastUsedAt: null,
        lastUsedIp: null,
      });
    } catch (e) {
      return Result.fail(e as Error);
    }

    if (this.auditRepo) {
      await this.auditRepo.append(buildAudit(userId, 'api_key.rotate', 'ApiKey', apiKeyId, {}));
    }

    return Result.ok({
      apiKeyId,
      plaintextKey: plaintext,
      keyPrefix: prefix,
    });
  }
}

// ─── Disable API Key ───────────────────────────────────────────────────────

export interface DisableApiKeyPayload {
  readonly apiKeyId: string;
  readonly reason: string;
}

export class DisableApiKeyCommand implements CommandWithPayload<DisableApiKeyPayload> {
  readonly commandType = 'DisableApiKey';
  constructor(
    public readonly payload: DisableApiKeyPayload,
    public readonly correlationId?: string,
    public readonly causationId?: string,
    public readonly idempotencyKey?: string,
    public readonly userId?: string,
  ) {}
}

export class DisableApiKeyHandler
  implements CommandHandler<DisableApiKeyCommand, { apiKeyId: string }>
{
  readonly commandType = 'DisableApiKey';

  constructor(
    private readonly apiKeyRepo: ApiKeyRepository,
    private readonly auditRepo: AuditLogRepository | null,
  ) {}

  async execute(command: DisableApiKeyCommand): Promise<Result<{ apiKeyId: string }>> {
    const { apiKeyId, reason } = command.payload;

    const existing = await this.apiKeyRepo.getById(apiKeyId);
    if (!existing) {
      return Result.fail(new NotFoundError('API key not found', 'ApiKey', apiKeyId));
    }
    if (!existing.active) {
      // Idempotent.
      return Result.ok({ apiKeyId });
    }

    try {
      await this.apiKeyRepo.update(apiKeyId, {
        active: false,
        revokedAt: new Date().toISOString(),
      });
    } catch (e) {
      return Result.fail(e as Error);
    }

    if (this.auditRepo) {
      await this.auditRepo.append(
        buildAudit(existing.userId, 'api_key.disable', 'ApiKey', apiKeyId, { reason }),
      );
    }

    return Result.ok({ apiKeyId });
  }
}

// ─── Helper ────────────────────────────────────────────────────────────────

function buildAudit(
  actorId: string,
  action: string,
  targetType: string,
  targetId: string,
  metadata: Record<string, unknown>,
): AuditLogEntry {
  return {
    id: createId('aud'),
    action,
    actorId,
    actorType: 'user',
    targetType,
    targetId,
    timestamp: new Date().toISOString(),
    ipAddress: null,
    userAgent: null,
    metadata,
    correlationId: null,
  };
}
