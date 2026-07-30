/**
 * Scoring domain events.
 */

import { DomainEvent } from '@/domain/shared/event/domain-event';

export interface ScoreVerifiedPayload {
  readonly sessionId: string;
  readonly gameId: string;
  readonly playerId: string;
  readonly score: number;
  readonly verifiedBy: string;
  readonly verifiedAt: string;
}

export class ScoreVerified extends DomainEvent<ScoreVerifiedPayload> {}

export interface LeaderboardUpdatedPayload {
  readonly gameId: string;
  readonly playerId: string;
  readonly rank: number;
  readonly score: number;
  readonly updatedAt: string;
}

export class LeaderboardUpdated extends DomainEvent<LeaderboardUpdatedPayload> {}

export interface ScoreRejectedPayload {
  readonly sessionId: string;
  readonly playerId: string;
  readonly reason: string;
}

export class ScoreRejected extends DomainEvent<ScoreRejectedPayload> {}
