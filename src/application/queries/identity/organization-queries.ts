/**
 * Organization queries.
 *
 * GetOrganization / ListOrganizations / GetOrganizationMembers.
 *
 * Reads from the OrganizationReadModelStore port. Falls back to rehydrating
 * the OrganizationAggregate via the OrganizationRepository when no
 * projection is available.
 */

import { Result } from '@/shared/types/result';
import type { QueryWithPayload } from '@/application/queries/query';
import type { QueryHandler } from '@/application/handlers/query-handler';
import type { OrganizationRepository } from '@/domain/identity/repositories';
import type {
  OrganizationView,
  OrganizationListFilters,
  OrganizationReadModelStore,
  OrganizationMemberView,
  PaginatedResult,
} from '@/application/ports/identity-ports';
import { NotFoundError } from '@/domain/shared/errors';

// ─── Get Organization ──────────────────────────────────────────────────────

export interface GetOrganizationPayload {
  readonly organizationId: string;
}

export type GetOrganizationResult = OrganizationView;

export class GetOrganizationQuery
  implements QueryWithPayload<GetOrganizationPayload, GetOrganizationResult>
{
  readonly queryType = 'GetOrganization';
  constructor(
    public readonly payload: GetOrganizationPayload,
    public readonly correlationId?: string,
    public readonly userId?: string,
  ) {}
}

export class GetOrganizationHandler
  implements QueryHandler<GetOrganizationQuery, GetOrganizationResult>
{
  readonly queryType = 'GetOrganization';

  constructor(
    private readonly orgStore: OrganizationReadModelStore,
    private readonly orgRepo: OrganizationRepository | null,
  ) {}

  async execute(query: GetOrganizationQuery): Promise<Result<GetOrganizationResult>> {
    const view = await this.orgStore.getById(query.payload.organizationId);
    if (view) return Result.ok(view);

    if (this.orgRepo) {
      const org = await this.orgRepo.getById(query.payload.organizationId);
      if (org) return Result.ok(aggregateToView(org));
    }

    return Result.fail(
      new NotFoundError('Organization not found', 'Organization', query.payload.organizationId),
    );
  }
}

// ─── List Organizations ───────────────────────────────────────────────────

export interface ListOrganizationsPayload {
  readonly type?: string;
  readonly search?: string;
  readonly limit: number;
  readonly offset: number;
}

export type ListOrganizationsResult = PaginatedResult<OrganizationView>;

export class ListOrganizationsQuery
  implements QueryWithPayload<ListOrganizationsPayload, ListOrganizationsResult>
{
  readonly queryType = 'ListOrganizations';
  constructor(
    public readonly payload: ListOrganizationsPayload,
    public readonly correlationId?: string,
    public readonly userId?: string,
  ) {}
}

export class ListOrganizationsHandler
  implements QueryHandler<ListOrganizationsQuery, ListOrganizationsResult>
{
  readonly queryType = 'ListOrganizations';

  constructor(private readonly orgStore: OrganizationReadModelStore) {}

  async execute(query: ListOrganizationsQuery): Promise<Result<ListOrganizationsResult>> {
    const filters: OrganizationListFilters = {
      type: query.payload.type,
      search: query.payload.search,
      limit: query.payload.limit,
      offset: query.payload.offset,
    };
    const result = await this.orgStore.list(filters);
    return Result.ok(result);
  }
}

// ─── Get Organization Members ─────────────────────────────────────────────

export interface GetOrganizationMembersPayload {
  readonly organizationId: string;
}

export type GetOrganizationMembersResult = readonly OrganizationMemberView[];

export class GetOrganizationMembersQuery
  implements
    QueryWithPayload<GetOrganizationMembersPayload, GetOrganizationMembersResult>
{
  readonly queryType = 'GetOrganizationMembers';
  constructor(
    public readonly payload: GetOrganizationMembersPayload,
    public readonly correlationId?: string,
    public readonly userId?: string,
  ) {}
}

export class GetOrganizationMembersHandler
  implements
    QueryHandler<GetOrganizationMembersQuery, GetOrganizationMembersResult>
{
  readonly queryType = 'GetOrganizationMembers';

  constructor(
    private readonly orgStore: OrganizationReadModelStore,
    private readonly orgRepo: OrganizationRepository | null,
  ) {}

  async execute(
    query: GetOrganizationMembersQuery,
  ): Promise<Result<GetOrganizationMembersResult>> {
    const members = await this.orgStore.listMembers(query.payload.organizationId);
    if (members.length > 0) return Result.ok(members);

    // Fallback: rehydrate the aggregate and project its members.
    if (this.orgRepo) {
      const org = await this.orgRepo.getById(query.payload.organizationId);
      if (org) {
        const projected: OrganizationMemberView[] = org.members.map((m) => ({
          userId: m.userId,
          roleId: m.roleId,
          joinedAt: m.joinedAt,
          status: m.status,
          email: null,
          displayName: null,
        }));
        return Result.ok(projected);
      }
    }

    return Result.fail(
      new NotFoundError('Organization not found', 'Organization', query.payload.organizationId),
    );
  }
}

// ─── Helper ────────────────────────────────────────────────────────────────

import type { OrganizationAggregate } from '@/domain/identity/aggregates/organization-aggregate';

function aggregateToView(org: OrganizationAggregate): OrganizationView {
  return {
    organizationId: String(org.id),
    name: org.name,
    slug: org.slug,
    type: org.type,
    createdById: org.createdById,
    memberCount: org.members.filter((m) => m.status === 'active').length,
    active: org.active,
    createdAt: org.createdAt,
    updatedAt: org.updatedAt,
  };
}
