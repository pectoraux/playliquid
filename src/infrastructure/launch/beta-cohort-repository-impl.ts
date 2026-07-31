/**
 * Event-sourced Beta Cohort repository.
 *
 * Extends `EventSourcedRepositoryBase` to wire the `BetaCohortAggregate`
 * to the EventStore + SnapshotStore + Outbox. The aggregate is rehydrated
 * purely from its event stream — the `BetaCohort` / `CohortParticipant`
 * Prisma models are maintained by a projector and used only for
 * cohortId-style lookups and admin-listing queries.
 *
 * Stream naming follows the platform convention:
 *   `${aggregateType.toLowerCase()}-${aggregateId}`
 * which the `streamId()` helper in `@/shared/ids` produces for the
 * configured `BetaCohortAggregate` aggregate type.
 *
 * Architecture rules:
 *   - All Prisma access goes through `getClient()` (transaction-context aware).
 *   - The aggregate is rehydrated ONLY from the event store — the read model
 *     is used solely for index-style lookups (cohortId → internal id).
 *   - The repository never directly mutates the read model; that is the
 *     projector's responsibility.
 */

import type { EventStore, OutboxRepository } from '@/application/ports';
import type { SnapshotStore } from '@/domain/shared/repository';
import type { BetaCohortRepository } from '@/domain/launch/repositories';
import { BetaCohortAggregate } from '@/domain/launch/aggregates/beta-cohort-aggregate';
import { EventSourcedRepositoryBase } from '@/infrastructure/repositories/event-sourced-repository-base';
import { getClient } from '@/infrastructure/database/prisma';
import { logger } from '@/shared/logging';

const AGGREGATE_TYPE = 'BetaCohortAggregate';

export class BetaCohortRepositoryImpl
  extends EventSourcedRepositoryBase<BetaCohortAggregate>
  implements BetaCohortRepository
{
  constructor(
    eventStore: EventStore,
    snapshotStore: SnapshotStore | null,
    outbox: OutboxRepository | null,
  ) {
    super(eventStore, snapshotStore, outbox, AGGREGATE_TYPE);
  }

  protected createAggregate(id: string): BetaCohortAggregate {
    return new BetaCohortAggregate(id);
  }

  // ─── Launch-specific lookups (via read-model index) ──────────────────────────

  /**
   * Look up a cohort by its public `cohortId` (distinct from the aggregate id
   * used as the event stream key). The `BetaCohort` read model maintained by
   * the cohort projector maps `cohortId → id` so we can rehydrate the full
   * aggregate from the event store.
   */
  async getByCohortId(cohortId: string): Promise<BetaCohortAggregate | null> {
    const normalized = cohortId.trim();
    if (!normalized) return null;
    const client = getClient();
    const record = await client.betaCohort.findUnique({
      where: { cohortId: normalized },
      select: { id: true },
    });
    if (!record) return null;
    return this.getById(record.id);
  }

  /**
   * List active cohorts in a given phase. Uses the read model directly (no
   * event rehydration) since this is a query-side operation that callers
   * use for admin dashboards. Returns the aggregate ids only — callers
   * that need the full aggregate rehydrate via `getById`.
   */
  async listActiveIdsByPhase(phase: 'alpha' | 'closed_beta' | 'open_beta'): Promise<string[]> {
    const client = getClient();
    const records = await client.betaCohort.findMany({
      where: { phase, active: true },
      select: { id: true },
      orderBy: { createdAt: 'desc' },
    });
    return records.map((r) => r.id);
  }

  // ─── Save (logging wrapper around the base implementation) ─────────────────

  async save(aggregate: BetaCohortAggregate, expectedVersion: number): Promise<void> {
    await super.save(aggregate, expectedVersion);
    logger.database().debug('Beta cohort aggregate saved', {
      cohortId: String(aggregate.id),
      name: aggregate.name,
      phase: aggregate.phase,
      version: aggregate.version,
      acceptedCount: aggregate.acceptedCount,
      pendingCount: aggregate.pendingCount,
    });
  }
}
