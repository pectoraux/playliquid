/**
 * Role & permission commands.
 *
 * CreateRole / UpdateRole / DeleteRole — manage data-driven roles.
 * CreatePermission / DeletePermission — manage data-driven permissions.
 *
 * Roles and permissions are NOT aggregates — they are immutable records
 * managed via the RoleRepository / PermissionRepository ports. System roles
 * and permissions (`isSystem = true`) cannot be deleted.
 */

import { Result } from '@/shared/types/result';
import { createId } from '@/shared/ids';
import type { CommandWithPayload } from '@/application/commands/command';
import type { CommandHandler } from '@/application/handlers/command-handler';
import type {
  RoleRepository,
  RoleData,
  PermissionRepository,
  PermissionData,
} from '@/domain/identity/repositories';
import {
  BusinessRuleError,
  NotFoundError,
  ValidationError,
} from '@/domain/shared/errors';

// ─── Create Role ───────────────────────────────────────────────────────────

export interface CreateRolePayload {
  readonly name: string;
  readonly description: string;
  readonly permissions: readonly string[];
}

export class CreateRoleCommand implements CommandWithPayload<CreateRolePayload> {
  readonly commandType = 'CreateRole';
  constructor(
    public readonly payload: CreateRolePayload,
    public readonly correlationId?: string,
    public readonly causationId?: string,
    public readonly idempotencyKey?: string,
    public readonly userId?: string,
  ) {}
}

export class CreateRoleHandler
  implements CommandHandler<CreateRoleCommand, { roleId: string }>
{
  readonly commandType = 'CreateRole';

  constructor(private readonly roleRepo: RoleRepository) {}

  async execute(command: CreateRoleCommand): Promise<Result<{ roleId: string }>> {
    const { name, description, permissions } = command.payload;

    if (!name.trim()) {
      return Result.fail(new ValidationError('Role name is required', 'name'));
    }
    if (await this.roleRepo.getByName(name)) {
      return Result.fail(
        new BusinessRuleError(`Role '${name}' already exists`, 'ROLE_EXISTS'),
      );
    }

    const now = new Date().toISOString();
    const roleId = createId('role');
    const record: RoleData = {
      id: roleId,
      name,
      description,
      permissions: [...permissions],
      isSystem: false,
      createdAt: now,
    };

    try {
      await this.roleRepo.save(record);
    } catch (e) {
      return Result.fail(e as Error);
    }

    return Result.ok({ roleId });
  }
}

// ─── Update Role ───────────────────────────────────────────────────────────

export interface UpdateRolePayload {
  readonly roleId: string;
  readonly name?: string;
  readonly description?: string;
  readonly permissions?: readonly string[];
}

export class UpdateRoleCommand implements CommandWithPayload<UpdateRolePayload> {
  readonly commandType = 'UpdateRole';
  constructor(
    public readonly payload: UpdateRolePayload,
    public readonly correlationId?: string,
    public readonly causationId?: string,
    public readonly idempotencyKey?: string,
    public readonly userId?: string,
  ) {}
}

export class UpdateRoleHandler
  implements CommandHandler<UpdateRoleCommand, { roleId: string }>
{
  readonly commandType = 'UpdateRole';

  constructor(private readonly roleRepo: RoleRepository) {}

  async execute(command: UpdateRoleCommand): Promise<Result<{ roleId: string }>> {
    const { roleId, name, description, permissions } = command.payload;

    const existing = await this.roleRepo.getById(roleId);
    if (!existing) {
      return Result.fail(new NotFoundError('Role not found', 'Role', roleId));
    }
    if (existing.isSystem) {
      return Result.fail(
        new BusinessRuleError('System roles cannot be modified', 'ROLE_IS_SYSTEM'),
      );
    }

    if (name !== undefined && name !== existing.name) {
      if (!name.trim()) {
        return Result.fail(new ValidationError('Role name cannot be empty', 'name'));
      }
      const clash = await this.roleRepo.getByName(name);
      if (clash && clash.id !== roleId) {
        return Result.fail(
          new BusinessRuleError(`Role name '${name}' is already in use`, 'ROLE_NAME_TAKEN'),
        );
      }
    }

    const updated: RoleData = {
      id: roleId,
      name: name ?? existing.name,
      description: description ?? existing.description,
      permissions: permissions ? [...permissions] : existing.permissions,
      isSystem: existing.isSystem,
      createdAt: existing.createdAt,
    };

    try {
      await this.roleRepo.save(updated);
    } catch (e) {
      return Result.fail(e as Error);
    }

    return Result.ok({ roleId });
  }
}

// ─── Delete Role ───────────────────────────────────────────────────────────

export interface DeleteRolePayload {
  readonly roleId: string;
}

export class DeleteRoleCommand implements CommandWithPayload<DeleteRolePayload> {
  readonly commandType = 'DeleteRole';
  constructor(
    public readonly payload: DeleteRolePayload,
    public readonly correlationId?: string,
    public readonly causationId?: string,
    public readonly idempotencyKey?: string,
    public readonly userId?: string,
  ) {}
}

export class DeleteRoleHandler
  implements CommandHandler<DeleteRoleCommand, { roleId: string }>
{
  readonly commandType = 'DeleteRole';

  constructor(private readonly roleRepo: RoleRepository) {}

  async execute(command: DeleteRoleCommand): Promise<Result<{ roleId: string }>> {
    const { roleId } = command.payload;

    const existing = await this.roleRepo.getById(roleId);
    if (!existing) {
      return Result.fail(new NotFoundError('Role not found', 'Role', roleId));
    }
    if (existing.isSystem) {
      return Result.fail(
        new BusinessRuleError('System roles cannot be deleted', 'ROLE_IS_SYSTEM'),
      );
    }

    try {
      await this.roleRepo.delete(roleId);
    } catch (e) {
      return Result.fail(e as Error);
    }

    return Result.ok({ roleId });
  }
}

// ─── Create Permission ─────────────────────────────────────────────────────

export interface CreatePermissionPayload {
  readonly resource: string;
  readonly action: string;
  readonly description: string;
}

export class CreatePermissionCommand implements CommandWithPayload<CreatePermissionPayload> {
  readonly commandType = 'CreatePermission';
  constructor(
    public readonly payload: CreatePermissionPayload,
    public readonly correlationId?: string,
    public readonly causationId?: string,
    public readonly idempotencyKey?: string,
    public readonly userId?: string,
  ) {}
}

export class CreatePermissionHandler
  implements CommandHandler<CreatePermissionCommand, { permissionId: string }>
{
  readonly commandType = 'CreatePermission';

  constructor(private readonly permissionRepo: PermissionRepository) {}

  async execute(command: CreatePermissionCommand): Promise<Result<{ permissionId: string }>> {
    const { resource, action, description } = command.payload;

    if (!resource.trim() || !action.trim()) {
      return Result.fail(
        new ValidationError('Resource and action are required', 'resource'),
      );
    }

    // Idempotency: if the (resource, action) pair already exists, return it.
    const existing = await this.permissionRepo.getByResource(resource);
    const clash = existing.find((p) => p.action === action);
    if (clash) {
      return Result.ok({ permissionId: clash.id });
    }

    const permissionId = `${resource}.${action}`;
    const now = new Date().toISOString();
    const record: PermissionData = {
      id: permissionId,
      resource,
      action,
      description,
      isSystem: false,
      createdAt: now,
    };

    try {
      await this.permissionRepo.save(record);
    } catch (e) {
      return Result.fail(e as Error);
    }

    return Result.ok({ permissionId });
  }
}

// ─── Delete Permission ─────────────────────────────────────────────────────

export interface DeletePermissionPayload {
  readonly permissionId: string;
}

export class DeletePermissionCommand implements CommandWithPayload<DeletePermissionPayload> {
  readonly commandType = 'DeletePermission';
  constructor(
    public readonly payload: DeletePermissionPayload,
    public readonly correlationId?: string,
    public readonly causationId?: string,
    public readonly idempotencyKey?: string,
    public readonly userId?: string,
  ) {}
}

export class DeletePermissionHandler
  implements CommandHandler<DeletePermissionCommand, { permissionId: string }>
{
  readonly commandType = 'DeletePermission';

  constructor(private readonly permissionRepo: PermissionRepository) {}

  async execute(command: DeletePermissionCommand): Promise<Result<{ permissionId: string }>> {
    const { permissionId } = command.payload;

    const existing = await this.permissionRepo.getById(permissionId);
    if (!existing) {
      return Result.fail(new NotFoundError('Permission not found', 'Permission', permissionId));
    }
    if (existing.isSystem) {
      return Result.fail(
        new BusinessRuleError('System permissions cannot be deleted', 'PERMISSION_IS_SYSTEM'),
      );
    }

    try {
      await this.permissionRepo.delete(permissionId);
    } catch (e) {
      return Result.fail(e as Error);
    }

    return Result.ok({ permissionId });
  }
}
