/**
 * Prisma-backed ApiKeyRepository — CRUD for hashed API keys.
 *
 * API keys are stored ONLY as SHA-256 hashes (never the plaintext). The
 * `keyPrefix` (first 12 chars) is stored for display in admin UIs. The
 * plaintext is returned exactly once by `generateApiKey()` at creation time
 * and never persisted.
 *
 * The repository is also responsible for tracking last-used metadata so that
 * the API key audit dashboard can show "last used 3 minutes ago from IP X".
 */

import type { ApiKeyData, ApiKeyRepository } from '@/domain/identity/repositories';
import { getClient } from '@/infrastructure/database/prisma';
import { logger } from '@/shared/logging';

interface ApiKeyRecord {
  id: string;
  userId: string;
  name: string;
  keyHash: string;
  keyPrefix: string;
  scopes: string;
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  lastUsedIp: string | null;
  createdAt: Date;
  revokedAt: Date | null;
  active: boolean;
}

function parseScopes(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((s): s is string => typeof s === 'string');
    }
  } catch {
    // fall through
  }
  return [];
}

function toData(r: ApiKeyRecord): ApiKeyData {
  return {
    id: r.id,
    userId: r.userId,
    name: r.name,
    keyHash: r.keyHash,
    keyPrefix: r.keyPrefix,
    scopes: parseScopes(r.scopes),
    expiresAt: r.expiresAt ? r.expiresAt.toISOString() : null,
    lastUsedAt: r.lastUsedAt ? r.lastUsedAt.toISOString() : null,
    lastUsedIp: r.lastUsedIp,
    createdAt: r.createdAt.toISOString(),
    revokedAt: r.revokedAt ? r.revokedAt.toISOString() : null,
    active: r.active,
  };
}

export class PrismaApiKeyRepository implements ApiKeyRepository {
  async getById(id: string): Promise<ApiKeyData | null> {
    const client = getClient();
    const record = await client.apiKey.findUnique({ where: { id } });
    return record ? toData(record) : null;
  }

  async getByHash(hash: string): Promise<ApiKeyData | null> {
    const client = getClient();
    const record = await client.apiKey.findUnique({ where: { keyHash: hash } });
    return record ? toData(record) : null;
  }

  async getByUserId(userId: string): Promise<ApiKeyData[]> {
    const client = getClient();
    const records = await client.apiKey.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return records.map(toData);
  }

  async save(key: ApiKeyData): Promise<void> {
    const client = getClient();
    await client.apiKey.upsert({
      where: { id: key.id },
      create: {
        id: key.id,
        userId: key.userId,
        name: key.name,
        keyHash: key.keyHash,
        keyPrefix: key.keyPrefix,
        scopes: JSON.stringify(key.scopes),
        expiresAt: key.expiresAt ? new Date(key.expiresAt) : null,
        lastUsedAt: key.lastUsedAt ? new Date(key.lastUsedAt) : null,
        lastUsedIp: key.lastUsedIp,
        active: key.active,
        revokedAt: key.revokedAt ? new Date(key.revokedAt) : null,
      },
      update: {
        userId: key.userId,
        name: key.name,
        keyHash: key.keyHash,
        keyPrefix: key.keyPrefix,
        scopes: JSON.stringify(key.scopes),
        expiresAt: key.expiresAt ? new Date(key.expiresAt) : null,
        lastUsedAt: key.lastUsedAt ? new Date(key.lastUsedAt) : null,
        lastUsedIp: key.lastUsedIp,
        active: key.active,
        revokedAt: key.revokedAt ? new Date(key.revokedAt) : null,
      },
    });
    logger.database().debug('API key saved', {
      keyId: key.id,
      userId: key.userId,
      prefix: key.keyPrefix,
    });
  }

  async update(id: string, updates: Partial<ApiKeyData>): Promise<void> {
    const client = getClient();
    const data: Record<string, unknown> = {};
    if (updates.name !== undefined) data['name'] = updates.name;
    if (updates.scopes !== undefined) data['scopes'] = JSON.stringify(updates.scopes);
    if (updates.expiresAt !== undefined) {
      data['expiresAt'] = updates.expiresAt ? new Date(updates.expiresAt) : null;
    }
    if (updates.lastUsedAt !== undefined) {
      data['lastUsedAt'] = updates.lastUsedAt ? new Date(updates.lastUsedAt) : null;
    }
    if (updates.lastUsedIp !== undefined) data['lastUsedIp'] = updates.lastUsedIp;
    if (updates.active !== undefined) data['active'] = updates.active;
    if (updates.revokedAt !== undefined) {
      data['revokedAt'] = updates.revokedAt ? new Date(updates.revokedAt) : null;
    }
    if (updates.keyHash !== undefined) data['keyHash'] = updates.keyHash;
    if (updates.keyPrefix !== undefined) data['keyPrefix'] = updates.keyPrefix;

    await client.apiKey.update({ where: { id }, data });
    logger.database().debug('API key updated', { keyId: id, fields: Object.keys(data) });
  }

  async delete(id: string): Promise<void> {
    const client = getClient();
    await client.apiKey.delete({ where: { id } }).catch(() => {});
    logger.database().debug('API key deleted', { keyId: id });
  }
}
