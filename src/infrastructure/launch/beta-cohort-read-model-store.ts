/**
 * Prisma-backed read model store for beta cohorts.
 */

import type {
  BetaCohortReadModelStore, BetaCohortView, BetaCohortListFilters, PaginatedResult,
} from '@/application/ports/launch-ports';
import { getClient } from '@/infrastructure/database/prisma';

function toView(r: {
  cohortId: string;
  name: string;
  phase: string;
  maxParticipants: number;
  createdById: string;
  active: boolean | null;
  createdAt: string;
  updatedAt: Date;
}): BetaCohortView {
  return {
    cohortId: r.cohortId,
    name: r.name,
    phase: r.phase,
    maxParticipants: r.maxParticipants,
    createdById: r.createdById,
    active: r.active ?? true,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt.toISOString(),
  };
}

export class PrismaBetaCohortReadModelStore implements BetaCohortReadModelStore {
  async getById(cohortId: string): Promise<BetaCohortView | null> {
    const client = getClient();
    const record = await client.betaCohort.findUnique({ where: { cohortId } });
    return record ? toView(record) : null;
  }

  async list(filters: BetaCohortListFilters): Promise<PaginatedResult<BetaCohortView>> {
    const client = getClient();
    const where: Record<string, unknown> = {};
    if (filters.phase) where.phase = filters.phase;

    const [records, total] = await Promise.all([
      client.betaCohort.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: filters.limit,
        skip: filters.offset,
      }),
      client.betaCohort.count({ where }),
    ]);

    return {
      items: records.map(toView),
      total,
      limit: filters.limit,
      offset: filters.offset,
    };
  }

  async getCohortIdByInvitation(invitationId: string): Promise<string | null> {
    const client = getClient();
    const participant = await client.cohortParticipant.findUnique({
      where: { invitationId },
      select: { cohortId: true },
    });
    return participant?.cohortId ?? null;
  }
}
