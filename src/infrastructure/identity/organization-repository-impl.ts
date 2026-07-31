/**
 * Event-sourced Organization repository.
 *
 * Mirrors `UserRepositoryImpl` for the OrganizationAggregate. Adds a slug
 * lookup via the `OrganizationReadModel` projection maintained by
 * `OrganizationProjector`.
 */

import type { EventStore, OutboxRepository } from '@/application/ports';
import type { SnapshotStore } from '@/domain/shared/repository';
import type { OrganizationRepository } from '@/domain/identity/repositories';
import { OrganizationAggregate } from '@/domain/identity/aggregates/organization-aggregate';
import { EventSourcedRepositoryBase } from '@/infrastructure/repositories/event-sourced-repository-base';
import { getClient } from '@/infrastructure/database/prisma';
import { logger } from '@/shared/logging';

const AGGREGATE_TYPE = 'OrganizationAggregate';

export class OrganizationRepositoryImpl
  extends EventSourcedRepositoryBase<OrganizationAggregate>
  implements OrganizationRepository
{
  constructor(
    eventStore: EventStore,
    snapshotStore: SnapshotStore | null,
    outbox: OutboxRepository | null,
  ) {
    super(eventStore, snapshotStore, outbox, AGGREGATE_TYPE);
  }

  protected createAggregate(id: string): OrganizationAggregate {
    return new OrganizationAggregate(id);
  }

  // ─── Identity-specific lookups ─────────────────────────────────────────────

  async getBySlug(slug: string): Promise<OrganizationAggregate | null> {
    const normalized = slug.trim().toLowerCase();
    if (!normalized) return null;
    const client = getClient();
    const record = await client.organizationReadModel.findUnique({
      where: { slug: normalized },
      select: { orgId: true },
    });
    if (!record) return null;
    return this.getById(record.orgId);
  }

  // ─── Save (logging wrapper) ────────────────────────────────────────────────

  async save(aggregate: OrganizationAggregate, expectedVersion: number): Promise<void> {
    await super.save(aggregate, expectedVersion);
    logger.database().debug('Organization aggregate saved', {
      orgId: String(aggregate.id),
      name: aggregate.name,
      slug: aggregate.slug,
      version: aggregate.version,
      memberCount: aggregate.members.length,
    });
  }
}
