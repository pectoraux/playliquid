/**
 * Prisma-backed RoleRepository — data-driven RBAC role CRUD.
 *
 * The `permissions` field is persisted as a JSON-encoded string[] (SQLite
 * doesn't have a native array type). Serialization/deserialization happens
 * here, so the domain layer only sees `string[]`.
 */

import type { RoleData, RoleRepository } from '@/domain/identity/repositories';
import { getClient } from '@/infrastructure/database/prisma';
import { logger } from '@/shared/logging';

interface RoleRecord {
  id: string;
  name: string;
  description: string;
  permissions: string;
  isSystem: boolean;
  createdAt: Date;
  updatedAt: Date;
}

function toData(r: RoleRecord): RoleData {
  let permissions: string[] = [];
  try {
    const parsed: unknown = JSON.parse(r.permissions);
    if (Array.isArray(parsed)) {
      permissions = parsed.filter((p): p is string => typeof p === 'string');
    }
  } catch {
    permissions = [];
  }
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    permissions,
    isSystem: r.isSystem,
    createdAt: r.createdAt.toISOString(),
  };
}

export class PrismaRoleRepository implements RoleRepository {
  async getById(id: string): Promise<RoleData | null> {
    const client = getClient();
    const record = await client.role.findUnique({ where: { id } });
    return record ? toData(record) : null;
  }

  async getByName(name: string): Promise<RoleData | null> {
    const client = getClient();
    const record = await client.role.findUnique({ where: { name } });
    return record ? toData(record) : null;
  }

  async list(): Promise<RoleData[]> {
    const client = getClient();
    const records = await client.role.findMany({ orderBy: { name: 'asc' } });
    return records.map(toData);
  }

  async save(role: RoleData): Promise<void> {
    const client = getClient();
    await client.role.upsert({
      where: { id: role.id },
      create: {
        id: role.id,
        name: role.name,
        description: role.description,
        permissions: JSON.stringify(role.permissions),
        isSystem: role.isSystem,
      },
      update: {
        name: role.name,
        description: role.description,
        permissions: JSON.stringify(role.permissions),
        isSystem: role.isSystem,
      },
    });
    logger.database().debug('Role saved', { roleId: role.id, name: role.name });
  }

  async delete(id: string): Promise<void> {
    const client = getClient();
    // System roles cannot be deleted — enforce at the data layer as a
    // second line of defense (the domain enforces this too).
    const existing = await client.role.findUnique({ where: { id } });
    if (!existing) return;
    if (existing.isSystem) {
      throw new Error(`Cannot delete system role: ${id}`);
    }
    await client.role.delete({ where: { id } });
    logger.database().debug('Role deleted', { roleId: id });
  }
}
