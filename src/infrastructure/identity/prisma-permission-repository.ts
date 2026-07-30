/**
 * Prisma-backed PermissionRepository — data-driven RBAC permission CRUD.
 *
 * Permission IDs follow the `resource.action` format (e.g., `game.publish`).
 * The schema enforces uniqueness on `(resource, action)` so the same logical
 * permission can be looked up either by its composite ID or by parts.
 */

import type { PermissionData, PermissionRepository } from '@/domain/identity/repositories';
import { getClient } from '@/infrastructure/database/prisma';
import { logger } from '@/shared/logging';

interface PermissionRecord {
  id: string;
  resource: string;
  action: string;
  description: string;
  isSystem: boolean;
  createdAt: Date;
}

function toData(r: PermissionRecord): PermissionData {
  return {
    id: r.id,
    resource: r.resource,
    action: r.action,
    description: r.description,
    isSystem: r.isSystem,
    createdAt: r.createdAt.toISOString(),
  };
}

export class PrismaPermissionRepository implements PermissionRepository {
  async getById(id: string): Promise<PermissionData | null> {
    const client = getClient();
    const record = await client.permission.findUnique({ where: { id } });
    return record ? toData(record) : null;
  }

  async getByResource(resource: string): Promise<PermissionData[]> {
    const client = getClient();
    const records = await client.permission.findMany({
      where: { resource },
      orderBy: { action: 'asc' },
    });
    return records.map(toData);
  }

  async list(): Promise<PermissionData[]> {
    const client = getClient();
    const records = await client.permission.findMany({
      orderBy: [{ resource: 'asc' }, { action: 'asc' }],
    });
    return records.map(toData);
  }

  async save(permission: PermissionData): Promise<void> {
    const client = getClient();
    await client.permission.upsert({
      where: { id: permission.id },
      create: {
        id: permission.id,
        resource: permission.resource,
        action: permission.action,
        description: permission.description,
        isSystem: permission.isSystem,
      },
      update: {
        resource: permission.resource,
        action: permission.action,
        description: permission.description,
        isSystem: permission.isSystem,
      },
    });
    logger.database().debug('Permission saved', {
      permissionId: permission.id,
      resource: permission.resource,
      action: permission.action,
    });
  }

  async delete(id: string): Promise<void> {
    const client = getClient();
    const existing = await client.permission.findUnique({ where: { id } });
    if (!existing) return;
    if (existing.isSystem) {
      throw new Error(`Cannot delete system permission: ${id}`);
    }
    await client.permission.delete({ where: { id } });
    logger.database().debug('Permission deleted', { permissionId: id });
  }
}
