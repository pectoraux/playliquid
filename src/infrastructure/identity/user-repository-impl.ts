/**
 * Event-sourced User repository.
 *
 * Extends EventSourcedRepositoryBase to wire the UserAggregate to the event
 * store + snapshot store + outbox. Adds identity-specific lookup helpers
 * (getByEmail, getByUsername, emailExists, usernameExists) that query the
 * UserReadModel projection maintained by `UserProfileProjector`.
 *
 * Architecture rules:
 *   - All Prisma access goes through `getClient()` (transaction-context aware).
 *   - The aggregate is rehydrated ONLY from the event store — the read model
 *     is used solely for index-style lookups (email/username → userId).
 *   - The repository never directly mutates the read model; that is the
 *     projector's responsibility.
 */

import type { EventStore, OutboxRepository } from '@/application/ports';
import type { SnapshotStore } from '@/domain/shared/repository';
import type { UserRepository } from '@/domain/identity/repositories';
import { UserAggregate } from '@/domain/identity/aggregates/user-aggregate';
import { EventSourcedRepositoryBase } from '@/infrastructure/repositories/event-sourced-repository-base';
import { getClient } from '@/infrastructure/database/prisma';
import { logger } from '@/shared/logging';

const AGGREGATE_TYPE = 'UserAggregate';

export class UserRepositoryImpl
  extends EventSourcedRepositoryBase<UserAggregate>
  implements UserRepository
{
  constructor(
    eventStore: EventStore,
    snapshotStore: SnapshotStore | null,
    outbox: OutboxRepository | null,
  ) {
    super(eventStore, snapshotStore, outbox, AGGREGATE_TYPE);
  }

  protected createAggregate(id: string): UserAggregate {
    return new UserAggregate(id);
  }

  // ─── Identity-specific lookups (via read-model index) ──────────────────────

  async getByEmail(email: string): Promise<UserAggregate | null> {
    const normalized = email.trim().toLowerCase();
    if (!normalized) return null;
    const client = getClient();
    const record = await client.userReadModel.findFirst({
      where: { email: normalized },
      select: { userId: true },
    });
    if (!record) return null;
    return this.getById(record.userId);
  }

  async getByUsername(username: string): Promise<UserAggregate | null> {
    const normalized = username.trim().toLowerCase();
    if (!normalized) return null;
    const client = getClient();
    const record = await client.userReadModel.findFirst({
      where: { username: normalized },
      select: { userId: true },
    });
    if (!record) return null;
    return this.getById(record.userId);
  }

  async emailExists(email: string): Promise<boolean> {
    const normalized = email.trim().toLowerCase();
    if (!normalized) return false;
    const client = getClient();
    const count = await client.userReadModel.count({
      where: { email: normalized },
    });
    return count > 0;
  }

  async usernameExists(username: string): Promise<boolean> {
    const normalized = username.trim().toLowerCase();
    if (!normalized) return false;
    const client = getClient();
    const count = await client.userReadModel.count({
      where: { username: normalized },
    });
    return count > 0;
  }

  // ─── Save (logging wrapper around the base implementation) ─────────────────

  async save(aggregate: UserAggregate, expectedVersion: number): Promise<void> {
    await super.save(aggregate, expectedVersion);
    logger.database().debug('User aggregate saved', {
      userId: String(aggregate.id),
      version: aggregate.version,
      status: aggregate.status,
    });
  }
}
