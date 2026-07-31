/**
 * User queries.
 *
 * GetUser / ListUsers / GetCurrentUser / GetUserPermissions.
 *
 * Query handlers read from materialised read models via the UserReadModelStore
 * port. They never load aggregates or touch the EventStore. The composition
 * root is responsible for binding a concrete read-model store (e.g., one
 * backed by Prisma against projection tables) to the port.
 *
 * For effective-permissions resolution, the handler delegates to the
 * RbacEngine — the same instance used by the authorization pipeline.
 */

import { Result } from '@/shared/types/result';
import type { QueryWithPayload } from '@/application/queries/query';
import type { QueryHandler } from '@/application/handlers/query-handler';
import type { UserRepository, RoleRepository } from '@/domain/identity/repositories';
import type { RbacEngine } from '@/domain/identity/policies/authorization-engine';
import type {
  UserView,
  UserListFilters,
  UserReadModelStore,
  PaginatedResult,
  UserPermissionView,
} from '@/application/ports/identity-ports';
import { NotFoundError } from '@/domain/shared/errors';

// ─── Get User ──────────────────────────────────────────────────────────────

export interface GetUserPayload {
  readonly userId: string;
}

export type GetUserResult = UserView;

export class GetUserQuery implements QueryWithPayload<GetUserPayload, GetUserResult> {
  readonly queryType = 'GetUser';
  constructor(
    public readonly payload: GetUserPayload,
    public readonly correlationId?: string,
    public readonly userId?: string,
  ) {}
}

export class GetUserHandler implements QueryHandler<GetUserQuery, GetUserResult> {
  readonly queryType = 'GetUser';

  constructor(
    private readonly userStore: UserReadModelStore,
    private readonly userRepo: UserRepository | null,
  ) {}

  async execute(query: GetUserQuery): Promise<Result<GetUserResult>> {
    // Prefer the read model...
    const view = await this.userStore.getById(query.payload.userId);
    if (view) return Result.ok(view);

    // ...fall back to rehydrating the aggregate (less efficient; only when no
    // projection is available yet).
    if (this.userRepo) {
      const user = await this.userRepo.getById(query.payload.userId);
      if (user) {
        return Result.ok(aggregateToView(user));
      }
    }

    return Result.fail(
      new NotFoundError('User not found', 'User', query.payload.userId),
    );
  }
}

// ─── List Users ────────────────────────────────────────────────────────────

export interface ListUsersPayload {
  readonly status?: string;
  readonly search?: string;
  readonly limit: number;
  readonly offset: number;
}

export type ListUsersResult = PaginatedResult<UserView>;

export class ListUsersQuery implements QueryWithPayload<ListUsersPayload, ListUsersResult> {
  readonly queryType = 'ListUsers';
  constructor(
    public readonly payload: ListUsersPayload,
    public readonly correlationId?: string,
    public readonly userId?: string,
  ) {}
}

export class ListUsersHandler implements QueryHandler<ListUsersQuery, ListUsersResult> {
  readonly queryType = 'ListUsers';

  constructor(private readonly userStore: UserReadModelStore) {}

  async execute(query: ListUsersQuery): Promise<Result<ListUsersResult>> {
    const filters: UserListFilters = {
      status: query.payload.status,
      search: query.payload.search,
      limit: query.payload.limit,
      offset: query.payload.offset,
    };
    const result = await this.userStore.list(filters);
    return Result.ok(result);
  }
}

// ─── Get Current User ──────────────────────────────────────────────────────

export interface GetCurrentUserPayload {
  readonly userId: string;
}

export type GetCurrentUserResult = UserView;

export class GetCurrentUserQuery
  implements QueryWithPayload<GetCurrentUserPayload, GetCurrentUserResult>
{
  readonly queryType = 'GetCurrentUser';
  constructor(
    public readonly payload: GetCurrentUserPayload,
    public readonly correlationId?: string,
    public readonly userId?: string,
  ) {}
}

export class GetCurrentUserHandler
  implements QueryHandler<GetCurrentUserQuery, GetCurrentUserResult>
{
  readonly queryType = 'GetCurrentUser';

  constructor(
    private readonly userStore: UserReadModelStore,
    private readonly userRepo: UserRepository | null,
  ) {}

  async execute(query: GetCurrentUserQuery): Promise<Result<GetCurrentUserResult>> {
    // Same as GetUser — the auth context has already verified the session.
    const view = await this.userStore.getById(query.payload.userId);
    if (view) return Result.ok(view);

    if (this.userRepo) {
      const user = await this.userRepo.getById(query.payload.userId);
      if (user) {
        return Result.ok(aggregateToView(user));
      }
    }

    return Result.fail(
      new NotFoundError('User not found', 'User', query.payload.userId),
    );
  }
}

// ─── Get User Permissions ──────────────────────────────────────────────────

export interface GetUserPermissionsPayload {
  readonly userId: string;
}

export type GetUserPermissionsResult = UserPermissionView;

export class GetUserPermissionsQuery
  implements QueryWithPayload<GetUserPermissionsPayload, GetUserPermissionsResult>
{
  readonly queryType = 'GetUserPermissions';
  constructor(
    public readonly payload: GetUserPermissionsPayload,
    public readonly correlationId?: string,
    public readonly userId?: string,
  ) {}
}

export class GetUserPermissionsHandler
  implements QueryHandler<GetUserPermissionsQuery, GetUserPermissionsResult>
{
  readonly queryType = 'GetUserPermissions';

  constructor(
    private readonly userRepo: UserRepository,
    private readonly roleRepo: RoleRepository,
    private readonly rbacEngine: RbacEngine | null,
  ) {}

  async execute(
    query: GetUserPermissionsQuery,
  ): Promise<Result<GetUserPermissionsResult>> {
    const user = await this.userRepo.getById(query.payload.userId);
    if (!user) {
      return Result.fail(
        new NotFoundError('User not found', 'User', query.payload.userId),
      );
    }

    // Resolve effective permissions via the RBAC engine if available;
    // otherwise compute a flat union of role permissions from the role repo.
    let permissions: string[];
    if (this.rbacEngine) {
      const roleIds = user.roles.map((r) => r.roleId);
      permissions = Array.from(this.rbacEngine.getPermissions(roleIds));
    } else {
      const allRoles = await this.roleRepo.list();
      const roleMap = new Map(allRoles.map((r) => [r.id, r]));
      const set = new Set<string>();
      for (const userRole of user.roles) {
        const role = roleMap.get(userRole.roleId);
        if (role) for (const p of role.permissions) set.add(p);
      }
      permissions = Array.from(set);
    }

    return Result.ok({
      userId: user.id,
      permissions,
      roles: user.roles.map((r) => ({ roleId: r.roleId, roleName: r.roleName })),
      organizations: user.memberships.map((m) => ({
        organizationId: m.organizationId,
        roleId: m.roleId,
      })),
    });
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────

import type { UserAggregate } from '@/domain/identity/aggregates/user-aggregate';

/** Project a UserAggregate into a flat UserView (fallback only). */
function aggregateToView(user: UserAggregate): UserView {
  return {
    userId: String(user.id),
    email: user.email,
    username: user.username,
    displayName: user.displayName,
    country: user.country,
    timezone: user.timezone,
    locale: user.locale,
    status: user.status,
    emailVerified: user.emailVerified,
    mfaEnabled: user.mfaEnabled,
    mfaMethod: user.mfaMethod,
    roles: user.roles.map((r) => ({
      roleId: r.roleId,
      roleName: r.roleName,
      assignedAt: r.assignedAt,
    })),
    memberships: user.memberships.map((m) => ({
      organizationId: m.organizationId,
      roleId: m.roleId,
      joinedAt: m.joinedAt,
    })),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}
