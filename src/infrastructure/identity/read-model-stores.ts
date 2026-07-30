/**
 * Prisma-backed read model stores for identity queries.
 *
 * These adapters bridge the application-layer port interfaces to Prisma.
 * Query handlers depend on the ports, never on Prisma directly.
 */

import type {
  UserReadModelStore, UserView, UserListFilters, PaginatedResult,
  OrganizationReadModelStore, OrganizationView, OrganizationListFilters,
} from '@/application/ports/identity-ports';
import { getClient } from '@/infrastructure/database/prisma';

function toUserView(r: {
  userId: string;
  email: string;
  username: string;
  displayName: string | null;
  country: string;
  timezone: string | null;
  locale: string | null;
  status: string;
  emailVerified: boolean | null;
  mfaEnabled: boolean | null;
  mfaMethod: string | null;
  createdAt: string;
  updatedAt: Date;
}): UserView {
  return {
    userId: r.userId,
    email: r.email,
    username: r.username,
    displayName: r.displayName ?? '',
    country: r.country,
    timezone: r.timezone ?? 'UTC',
    locale: r.locale ?? 'en',
    status: r.status,
    emailVerified: r.emailVerified ?? false,
    mfaEnabled: r.mfaEnabled ?? false,
    mfaMethod: r.mfaMethod,
    roles: [],
    memberships: [],
    createdAt: r.createdAt,
    updatedAt: r.updatedAt.toISOString(),
  };
}

export class PrismaUserReadModelStore implements UserReadModelStore {
  async getById(userId: string): Promise<UserView | null> {
    const client = getClient();
    const record = await client.userReadModel.findUnique({ where: { userId } });
    return record ? toUserView(record) : null;
  }

  async getByIds(userIds: readonly string[]): Promise<UserView[]> {
    if (userIds.length === 0) return [];
    const client = getClient();
    const records = await client.userReadModel.findMany({
      where: { userId: { in: [...userIds] } },
    });
    return records.map(toUserView);
  }

  async list(filters: UserListFilters): Promise<PaginatedResult<UserView>> {
    const client = getClient();
    const where: Record<string, unknown> = {};

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.search) {
      where.OR = [
        { email: { contains: filters.search } },
        { username: { contains: filters.search } },
        { displayName: { contains: filters.search } },
      ];
    }

    const [records, total] = await Promise.all([
      client.userReadModel.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: filters.limit,
        skip: filters.offset,
      }),
      client.userReadModel.count({ where }),
    ]);

    return {
      items: records.map(toUserView),
      total,
      limit: filters.limit,
      offset: filters.offset,
    };
  }
}

function toOrgView(r: {
  organizationId: string;
  name: string;
  slug: string;
  type: string;
  createdById: string;
  active: boolean | null;
  createdAt: string;
  updatedAt: Date;
}, memberCount: number): OrganizationView {
  return {
    organizationId: r.organizationId,
    name: r.name,
    slug: r.slug,
    type: r.type,
    createdById: r.createdById,
    memberCount,
    active: r.active ?? true,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt.toISOString(),
  };
}

export class PrismaOrganizationReadModelStore implements OrganizationReadModelStore {
  async getById(organizationId: string): Promise<OrganizationView | null> {
    const client = getClient();
    const record = await client.organizationReadModel.findUnique({
      where: { organizationId },
    });
    if (!record) return null;
    const memberCount = await client.organizationMemberReadModel.count({
      where: { organizationId, status: 'active' },
    });
    return toOrgView(record, memberCount);
  }

  async list(filters: OrganizationListFilters): Promise<PaginatedResult<OrganizationView>> {
    const client = getClient();
    const where: Record<string, unknown> = {};

    if (filters.type) {
      where.type = filters.type;
    }

    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search } },
        { slug: { contains: filters.search } },
      ];
    }

    const [records, total] = await Promise.all([
      client.organizationReadModel.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: filters.limit,
        skip: filters.offset,
      }),
      client.organizationReadModel.count({ where }),
    ]);

    const views = await Promise.all(
      records.map(async (r) => {
        const count = await client.organizationMemberReadModel.count({
          where: { organizationId: r.organizationId, status: 'active' },
        });
        return toOrgView(r, count);
      }),
    );

    return {
      items: views,
      total,
      limit: filters.limit,
      offset: filters.offset,
    };
  }

  async getMembers(organizationId: string): Promise<Array<{
    userId: string;
    roleId: string;
    joinedAt: string;
    status: string;
  }>> {
    const client = getClient();
    const members = await client.organizationMemberReadModel.findMany({
      where: { organizationId },
      orderBy: { joinedAt: 'desc' },
    });
    return members.map((m) => ({
      userId: m.userId,
      roleId: m.roleId,
      joinedAt: m.joinedAt,
      status: m.status,
    }));
  }
}
