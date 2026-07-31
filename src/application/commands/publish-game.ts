/**
 * PublishGame command + handler — demonstrates the full CQRS + event sourcing
 * pipeline.
 *
 * Flow:
 *   1. CommandBus dispatches PublishGameCommand through middleware pipeline
 *   2. ValidationMiddleware validates the payload
 *   3. AuthorizationMiddleware checks the policy
 *   4. TransactionMiddleware wraps in a UoW
 *   5. Handler loads (or creates) the GameAggregate from the EventStore
 *   6. Handler calls aggregate.publish()
 *   7. Handler saves uncommitted events to EventStore + Outbox
 *   8. Transaction commits atomically
 *   9. OutboxPublisher eventually publishes to EventBus
 *   10. ProjectionEngine replays into GameReadModel
 */

import { z } from 'zod';
import { Result } from '@/shared/types/result';
import type { Command, CommandWithPayload } from '@/application/commands/command';
import type { CommandHandler } from '@/application/handlers/command-handler';
import type { EventStore, OutboxRepository } from '@/application/ports';
import type { SnapshotStore } from '@/domain/shared/repository';
import { GameAggregate } from '@/domain/gaming/game-aggregate';
import { rehydrateEvent } from '@/domain/shared/event/event-registry';
import { streamId as makeStreamId } from '@/shared/ids';
import { logger } from '@/shared/logging';

export interface PublishGamePayload {
  readonly gameId: string;
  readonly title: string;
  readonly creatorId: string;
}

export class PublishGameCommand implements CommandWithPayload<PublishGamePayload> {
  readonly commandType = 'PublishGame';
  constructor(
    public readonly payload: PublishGamePayload,
    public readonly correlationId?: string,
    public readonly causationId?: string,
    public readonly idempotencyKey?: string,
    public readonly userId?: string,
  ) {}
}

export const PublishGameSchema = z.object({
  gameId: z.string().min(1),
  title: z.string().min(1).max(200),
  creatorId: z.string().min(1),
});

export class PublishGameHandler implements CommandHandler<PublishGameCommand, { gameId: string }> {
  readonly commandType = 'PublishGame';

  constructor(
    private readonly eventStore: EventStore,
    private readonly snapshotStore: SnapshotStore | null,
    private readonly outbox: OutboxRepository,
  ) {}

  async execute(command: PublishGameCommand): Promise<Result<{ gameId: string }>> {
    const { gameId, title, creatorId } = command.payload;
    const streamIdValue = makeStreamId('GameAggregate', gameId);

    // Load existing aggregate (rehydrate from events + snapshot).
    let aggregate = new GameAggregate(gameId);
    const currentVersion = await this.eventStore.loadVersion(streamIdValue);

    if (currentVersion > 0) {
      // Restore from snapshot if available.
      if (this.snapshotStore) {
        const snapshot = await this.snapshotStore.load('GameAggregate', gameId);
        if (snapshot) {
          aggregate.restoreFromSnapshot(snapshot);
          const events = await this.eventStore.loadFromVersion(streamIdValue, snapshot.version);
          aggregate.rehydrate(events.map((e) => rehydrateEvent(e)));
        }
      }
    }

    // Execute domain logic.
    aggregate.publish(title, creatorId);

    // Persist events + outbox in the same transaction.
    const events = aggregate.pullEvents();
    await this.eventStore.append(events, currentVersion);
    await this.outbox.appendMany(events.map((e) => e.serialize()));
    aggregate.clearEvents();

    logger.command().info('Game published', { gameId, title, creatorId });

    return Result.ok({ gameId });
  }
}
