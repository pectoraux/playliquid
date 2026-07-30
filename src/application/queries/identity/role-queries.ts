/**
 * Role & permission queries.
 *
 * ListRoles / ListPermissions.
 *
 * Roles and permissions live in their respective repositories as flat
 * records. These queries return them unchanged.
 */

import { Result } from '@/shared/types/result';
import type { Query, QueryWithPayload } from '@/application/queries/query';
import type { QueryHandler } from '@/application/handlers/query-handler';
import type {
  RoleRepository,
  RoleData,
  PermissionRepository,
  PermissionData,
} from '@/domain/identity/repositories';

// ─── List Roles ────────────────────────────────────────────────────────────

export type ListRolesResult = readonly RoleData[];

export class ListRolesQuery implements Query<ListRolesResult> {
  readonly queryType = 'ListRoles';
  constructor(
    public readonly correlationId?: string,
    public readonly userId?: string,
  ) {}
}

export class ListRolesHandler implements QueryHandler<ListRolesQuery, ListRolesResult> {
  readonly queryType = 'ListRoles';

  constructor(private readonly roleRepo: RoleRepository) {}

  async execute(_query: ListRolesQuery): Promise<Result<ListRolesResult>> {
    const roles = await this.roleRepo.list();
    return Result.ok(roles);
  }
}

// ─── List Permissions ─────────────────────────────────────────────────────

export type ListPermissionsResult = readonly PermissionData[];

export class ListPermissionsQuery implements Query<ListPermissionsResult> {
  readonly queryType = 'ListPermissions';
  constructor(
    public readonly correlationId?: string,
    public readonly userId?: string,
  ) {}
}

export class ListPermissionsHandler
  implements QueryHandler<ListPermissionsQuery, ListPermissionsResult>
{
  readonly queryType = 'ListPermissions';

  constructor(private readonly permissionRepo: PermissionRepository) {}

  async execute(_query: ListPermissionsQuery): Promise<Result<ListPermissionsResult>> {
    const permissions = await this.permissionRepo.list();
    return Result.ok(permissions);
  }
}

// ─── Optional Payload Variants ─────────────────────────────────────────────
//
// The Zod schema map in `schemas.ts` registers ListRoles / ListPermissions
// with an optional empty-object payload. Provide compatible QueryWithPayload
// aliases for callers that prefer a payload-bearing query (used by the
// schema validator).

export type ListRolesPayload = Record<string, never>;

export class ListRolesQueryWithPayload
  implements QueryWithPayload<ListRolesPayload, ListRolesResult>
{
  readonly queryType = 'ListRoles';
  constructor(
    public readonly payload: ListRolesPayload = {},
    public readonly correlationId?: string,
    public readonly userId?: string,
  ) {}
}

export type ListPermissionsPayload = Record<string, never>;

export class ListPermissionsQueryWithPayload
  implements QueryWithPayload<ListPermissionsPayload, ListPermissionsResult>
{
  readonly queryType = 'ListPermissions';
  constructor(
    public readonly payload: ListPermissionsPayload = {},
    public readonly correlationId?: string,
    public readonly userId?: string,
  ) {}
}
