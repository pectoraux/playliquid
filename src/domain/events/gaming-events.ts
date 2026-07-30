/**
 * Gaming domain events.
 */

import { DomainEvent } from '@/domain/shared/event/domain-event';

export interface GameStartedPayload {
  readonly gameId: string;
  readonly playerId: string;
  readonly gameType: string;
  readonly startedAt: string;
}

export class GameStarted extends DomainEvent<GameStartedPayload> {}

export interface GameFinishedPayload {
  readonly gameId: string;
  readonly sessionId: string;
  readonly playerId: string;
  readonly finalScore: number;
  readonly durationMinutes: number;
  readonly finishedAt: string;
}

export class GameFinished extends DomainEvent<GameFinishedPayload> {}

export interface GamePublishedPayload {
  readonly gameId: string;
  readonly title: string;
  readonly creatorId: string;
  readonly publishedAt: string;
}

export class GamePublished extends DomainEvent<GamePublishedPayload> {}

export interface GameUnpublishedPayload {
  readonly gameId: string;
  readonly reason: string;
}

export class GameUnpublished extends DomainEvent<GameUnpublishedPayload> {}
